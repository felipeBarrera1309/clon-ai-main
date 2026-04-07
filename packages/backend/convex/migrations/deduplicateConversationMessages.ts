/**
 * Script to find and remove duplicate messages in conversationMessages table.
 *
 * Duplicates can occur when:
 * 1. Migration was run multiple times
 * 2. Messages were saved both by the new system and then migrated from agent thread
 *
 * Strategy:
 * - Group messages by conversationId + direction + content.text
 * - For messages with same content within a small time window (5 seconds), keep only the oldest
 *
 * Usage:
 * 1. Dry run: npx convex run migrations/deduplicateConversationMessages:findDuplicates '{}'
 * 2. Delete: npx convex run migrations/deduplicateConversationMessages:removeDuplicates '{}'
 */

import { v } from "convex/values"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server"

// Time window in milliseconds to consider messages as potential duplicates
const DUPLICATE_TIME_WINDOW_MS = 5000 // 5 seconds

interface MessageForDedup {
  _id: Id<"conversationMessages">
  _creationTime: number
  conversationId: Id<"conversations">
  direction: "inbound" | "outbound"
  type: string
  contentText: string | null
  messageTimestamp: number | null
}

// Get all messages for deduplication analysis
export const getMessagesForDedup = internalQuery({
  args: {
    conversationId: v.optional(v.id("conversations")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MessageForDedup[]> => {
    const limit = args.limit ?? 10000

    let query = ctx.db.query("conversationMessages")

    if (args.conversationId) {
      query = query.withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId!)
      ) as typeof query
    }

    const messages = await query.take(limit)

    return messages.map((m) => ({
      _id: m._id,
      _creationTime: m._creationTime,
      conversationId: m.conversationId,
      direction: m.direction,
      type: m.type,
      contentText: m.content?.text ?? null,
      messageTimestamp: m.messageTimestamp ?? null,
    }))
  },
})

// Find duplicates without deleting (internal version)
export const findDuplicatesInternal = internalAction({
  args: {
    conversationId: v.optional(v.id("conversations")),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    totalMessages: v.number(),
    duplicateGroups: v.number(),
    messagesToRemove: v.number(),
    duplicateIds: v.array(v.string()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    totalMessages: number
    duplicateGroups: number
    messagesToRemove: number
    duplicateIds: string[]
  }> => {
    console.log("🔍 [DEDUP] Starting duplicate analysis...")

    const messages: MessageForDedup[] = await ctx.runQuery(
      internal.migrations.deduplicateConversationMessages.getMessagesForDedup,
      { conversationId: args.conversationId, limit: args.limit }
    )

    console.log(`📊 [DEDUP] Analyzing ${messages.length} messages`)

    // Group messages by conversationId + direction + content
    const groups = new Map<string, MessageForDedup[]>()

    for (const msg of messages) {
      // Create a key based on conversation, direction, and content
      const key = `${msg.conversationId}|${msg.direction}|${msg.contentText ?? ""}`
      const existing = groups.get(key) ?? []
      existing.push(msg)
      groups.set(key, existing)
    }

    // Find groups with potential duplicates (same content within time window)
    const duplicatesToRemove: Id<"conversationMessages">[] = []
    let totalDuplicateGroups = 0

    for (const [key, groupMessages] of groups) {
      if (groupMessages.length <= 1) continue

      // Sort by timestamp (prefer messageTimestamp, fallback to _creationTime)
      const sorted = groupMessages.sort((a, b) => {
        const timeA = a.messageTimestamp ?? a._creationTime
        const timeB = b.messageTimestamp ?? b._creationTime
        return timeA - timeB
      })

      // Find messages within the time window of each other
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!
        const curr = sorted[i]!
        const prevTime = prev.messageTimestamp ?? prev._creationTime
        const currTime = curr.messageTimestamp ?? curr._creationTime

        if (currTime - prevTime <= DUPLICATE_TIME_WINDOW_MS) {
          // This is a duplicate - mark the newer one for removal
          duplicatesToRemove.push(curr._id)
          totalDuplicateGroups++

          console.log(
            `🔄 [DEDUP] Found duplicate in conversation ${curr.conversationId}:`
          )
          console.log(
            `   Content: "${(curr.contentText ?? "").substring(0, 50)}..."`
          )
          console.log(`   Time diff: ${currTime - prevTime}ms`)
          console.log(
            `   Keeping: ${prev._id} (${new Date(prevTime).toISOString()})`
          )
          console.log(
            `   Removing: ${curr._id} (${new Date(currTime).toISOString()})`
          )
        }
      }
    }

    const summary = `
🏁 [DEDUP] Analysis Complete!
   Total messages analyzed: ${messages.length}
   Duplicate groups found: ${totalDuplicateGroups}
   Messages to remove: ${duplicatesToRemove.length}
    `
    console.log(summary)

    return {
      totalMessages: messages.length,
      duplicateGroups: totalDuplicateGroups,
      messagesToRemove: duplicatesToRemove.length,
      duplicateIds: duplicatesToRemove,
    }
  },
})

// Detailed duplicate info for verification
interface DuplicatePair {
  keepId: string
  keepTime: string
  removeId: string
  removeTime: string
  timeDiffMs: number
  content: string
  direction: string
  conversationId: string
}

// Find duplicates with detailed info for verification
export const findDuplicatesDetailed = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    totalMessages: v.number(),
    duplicateGroups: v.number(),
    messagesToRemove: v.number(),
    duplicates: v.array(
      v.object({
        keepId: v.string(),
        keepTime: v.string(),
        removeId: v.string(),
        removeTime: v.string(),
        timeDiffMs: v.number(),
        content: v.string(),
        direction: v.string(),
        conversationId: v.string(),
      })
    ),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    totalMessages: number
    duplicateGroups: number
    messagesToRemove: number
    duplicates: DuplicatePair[]
  }> => {
    const messages: MessageForDedup[] = await ctx.runQuery(
      internal.migrations.deduplicateConversationMessages.getMessagesForDedup,
      { conversationId: args.conversationId, limit: args.limit }
    )

    // Group messages by conversationId + direction + content
    const groups = new Map<string, MessageForDedup[]>()

    for (const msg of messages) {
      const key = `${msg.conversationId}|${msg.direction}|${msg.contentText ?? ""}`
      const existing = groups.get(key) ?? []
      existing.push(msg)
      groups.set(key, existing)
    }

    // Find groups with potential duplicates
    const duplicates: DuplicatePair[] = []

    for (const [, groupMessages] of groups) {
      if (groupMessages.length <= 1) continue

      const sorted = groupMessages.sort((a, b) => {
        const timeA = a.messageTimestamp ?? a._creationTime
        const timeB = b.messageTimestamp ?? b._creationTime
        return timeA - timeB
      })

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!
        const curr = sorted[i]!
        const prevTime = prev.messageTimestamp ?? prev._creationTime
        const currTime = curr.messageTimestamp ?? curr._creationTime

        if (currTime - prevTime <= DUPLICATE_TIME_WINDOW_MS) {
          duplicates.push({
            keepId: prev._id,
            keepTime: new Date(prevTime).toISOString(),
            removeId: curr._id,
            removeTime: new Date(currTime).toISOString(),
            timeDiffMs: currTime - prevTime,
            content: (curr.contentText ?? "").substring(0, 100),
            direction: curr.direction,
            conversationId: curr.conversationId,
          })
        }
      }
    }

    return {
      totalMessages: messages.length,
      duplicateGroups: duplicates.length,
      messagesToRemove: duplicates.length,
      duplicates,
    }
  },
})

// Find duplicates without deleting (public for CLI access)
export const findDuplicates = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    totalMessages: v.number(),
    duplicateGroups: v.number(),
    messagesToRemove: v.number(),
    duplicateIds: v.array(v.string()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    totalMessages: number
    duplicateGroups: number
    messagesToRemove: number
    duplicateIds: string[]
  }> => {
    return await ctx.runAction(
      internal.migrations.deduplicateConversationMessages
        .findDuplicatesInternal,
      { conversationId: args.conversationId, limit: args.limit }
    )
  },
})

// Delete duplicate messages
export const deleteDuplicates = internalMutation({
  args: {
    messageIds: v.array(v.id("conversationMessages")),
  },
  handler: async (ctx, args) => {
    let deleted = 0
    for (const id of args.messageIds) {
      try {
        await ctx.db.delete(id)
        deleted++
      } catch (error) {
        console.error(`❌ [DEDUP] Failed to delete ${id}:`, error)
      }
    }
    console.log(`🗑️ [DEDUP] Deleted ${deleted} duplicate messages`)
    return deleted
  },
})

// Main action to find and remove duplicates (public for CLI access)
export const removeDuplicates = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    deleted: v.number(),
    wouldDelete: v.optional(v.number()),
    dryRun: v.boolean(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    deleted: number
    wouldDelete?: number
    dryRun: boolean
  }> => {
    const dryRun = args.dryRun ?? false

    console.log(`🚀 [DEDUP] Starting deduplication (dryRun: ${dryRun})...`)

    // Find duplicates
    const result: {
      totalMessages: number
      duplicateGroups: number
      messagesToRemove: number
      duplicateIds: string[]
    } = await ctx.runAction(
      internal.migrations.deduplicateConversationMessages
        .findDuplicatesInternal,
      { conversationId: args.conversationId, limit: args.limit }
    )

    if (result.messagesToRemove === 0) {
      console.log("✅ [DEDUP] No duplicates found!")
      return { deleted: 0, dryRun }
    }

    if (dryRun) {
      console.log(
        `🔍 [DRY RUN] Would delete ${result.messagesToRemove} duplicate messages`
      )
      return { deleted: 0, wouldDelete: result.messagesToRemove, dryRun: true }
    }

    // Delete in batches of 100 to avoid timeout
    const batchSize = 100
    let totalDeleted = 0

    for (let i = 0; i < result.duplicateIds.length; i += batchSize) {
      const batch = result.duplicateIds.slice(i, i + batchSize)
      const deleted = await ctx.runMutation(
        internal.migrations.deduplicateConversationMessages.deleteDuplicates,
        { messageIds: batch as Id<"conversationMessages">[] }
      )
      totalDeleted += deleted
      console.log(
        `📦 [DEDUP] Batch ${Math.floor(i / batchSize) + 1}: deleted ${deleted} messages`
      )
    }

    console.log(
      `✅ [DEDUP] Complete! Deleted ${totalDeleted} duplicate messages`
    )
    return { deleted: totalDeleted, dryRun: false }
  },
})

// Get duplicate count for a specific conversation
export const getDuplicateCountForConversation = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect()

    // Group by content
    const groups = new Map<string, number>()
    for (const msg of messages) {
      const key = `${msg.direction}|${msg.content?.text ?? ""}`
      groups.set(key, (groups.get(key) ?? 0) + 1)
    }

    // Count duplicates
    let duplicates = 0
    for (const count of groups.values()) {
      if (count > 1) {
        duplicates += count - 1
      }
    }

    return {
      totalMessages: messages.length,
      uniqueMessages: groups.size,
      duplicates,
    }
  },
})
