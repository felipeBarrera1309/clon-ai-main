/**
 * Migration script to convert existing agent thread messages to the new conversationMessages table.
 *
 * This migration reads messages from the agent's thread system and creates corresponding
 * entries in the conversationMessages table for dashboard display.
 *
 * Run this migration once after deploying the new conversationMessages schema.
 *
 * Usage:
 * 1. First do a dry run: npx convex run migrations/migrateConversationMessages:runMigration '{"dryRun": true}'
 * 2. Then run the actual migration: npx convex run migrations/migrateConversationMessages:runMigration '{}'
 */

import { listMessages } from "@convex-dev/agent"
import { v } from "convex/values"
import { components, internal } from "../_generated/api"
import type { Doc } from "../_generated/dataModel"
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server"

// Get all conversations that need migration
export const getConversationsToMigrate = internalQuery({
  args: {
    limit: v.optional(v.number()),
    skip: v.optional(v.number()),
    latest: v.optional(v.boolean()),
  },
  // Note: returns validator removed to allow for schema evolution
  // The query only uses threadId and organizationId from conversations
  handler: async (ctx, args) => {
    const limit = args.limit ?? 1000
    const skip = args.skip ?? 0
    const query = ctx.db.query("conversations")
    // If latest=true, order by descending (newest first)
    const orderedQuery = args.latest ? query.order("desc") : query
    // Take skip + limit, then slice to skip the first ones
    const conversations = await orderedQuery.take(skip + limit)
    return conversations.slice(skip)
  },
})

// Check if a conversation has already been migrated (fully)
export const isConversationMigrated = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existingMessage = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .first()

    return existingMessage !== null
  },
})

// Get the oldest message timestamp in conversationMessages for a conversation
// This helps us know which messages from the thread still need to be migrated
export const getOldestMessageTimestamp = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    // Get all messages and find the one with the oldest messageTimestamp
    // We need to check messageTimestamp (the actual message time) not _creationTime (when inserted in DB)
    const messages = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect()

    if (messages.length === 0) return null

    // Find the minimum messageTimestamp (or _creationTime as fallback)
    const timestamps = messages.map(
      (m) => m.messageTimestamp ?? m._creationTime
    )
    return Math.min(...timestamps)
  },
})

// Type for message content from agent
interface AgentMessageContent {
  type?: string
  text?: string
  image?: string
}

// Type for metadata sources
interface MetadataSource {
  url?: string
  title?: string
  providerMetadata?: {
    attachment?: {
      mimeType?: string
      caption?: string
    }
  }
}

// Time window in milliseconds to consider messages as potential duplicates
const DUPLICATE_TIME_WINDOW_MS = 5000 // 5 seconds

// Migrate a single conversation's messages (ignoring cutoff, only checking duplicates)
// Use this for conversations where inbound messages were not saved due to Twilio bug
export const migrateConversationForceFull = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    messages: v.array(
      v.object({
        role: v.string(),
        content: v.any(),
        creationTime: v.number(),
        metadata: v.optional(v.any()),
      })
    ),
  },
  returns: v.object({
    migrated: v.number(),
    skipped: v.number(),
    duplicatesAvoided: v.number(),
  }),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      console.log(
        `⚠️ [MIGRATION] Conversation ${args.conversationId} not found, skipping`
      )
      return { migrated: 0, skipped: 0, duplicatesAvoided: 0 }
    }

    // Get existing messages for this conversation to check for duplicates
    const existingMessages = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect()

    // Build a map of existing messages for quick duplicate detection
    const existingMessageMap = new Map<string, number[]>()
    for (const msg of existingMessages) {
      const key = `${msg.direction}|${msg.content?.text ?? ""}`
      const timestamps = existingMessageMap.get(key) ?? []
      timestamps.push(msg.messageTimestamp ?? msg._creationTime)
      existingMessageMap.set(key, timestamps)
    }

    let migratedCount = 0
    const skippedCount = 0
    let duplicatesAvoided = 0

    for (const message of args.messages) {
      // Determine direction based on role
      const direction = message.role === "user" ? "inbound" : "outbound"

      // Skip tool messages
      if (message.role === "tool") {
        continue
      }

      // Parse content
      const messageType: "text" | "image" | "audio" | "document" | "location" =
        "text"
      let textContent: string | undefined

      if (typeof message.content === "string") {
        textContent = message.content
      } else if (Array.isArray(message.content)) {
        for (const part of message.content as AgentMessageContent[]) {
          if (part.type === "text" && part.text) {
            textContent = part.text
          }
        }
      }

      // Skip empty messages
      if (!textContent) {
        continue
      }

      // Build content object
      const content: { text?: string } = {}
      if (textContent) {
        content.text = textContent
      }

      // Check for duplicates
      const duplicateKey = `${direction}|${content.text ?? ""}`
      const existingTimestamps = existingMessageMap.get(duplicateKey) ?? []
      const isDuplicate = existingTimestamps.some(
        (existingTime) =>
          Math.abs(existingTime - message.creationTime) <=
          DUPLICATE_TIME_WINDOW_MS
      )

      if (isDuplicate) {
        duplicatesAvoided++
        continue
      }

      // Insert into conversationMessages
      await ctx.db.insert("conversationMessages", {
        conversationId: args.conversationId,
        organizationId: conversation.organizationId,
        direction,
        type: messageType,
        content,
        status: direction === "outbound" ? "sent" : undefined,
        messageTimestamp: message.creationTime,
      })

      // Update map
      const timestamps = existingMessageMap.get(duplicateKey) ?? []
      timestamps.push(message.creationTime)
      existingMessageMap.set(duplicateKey, timestamps)

      migratedCount++
    }

    return { migrated: migratedCount, skipped: skippedCount, duplicatesAvoided }
  },
})

// Query to get conversations by organization
export const getConversationsByOrganization = internalQuery({
  args: {
    organizationId: v.string(),
    limit: v.optional(v.number()),
    skip: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 500
    const skip = args.skip ?? 0
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(skip + limit)
    return conversations.slice(skip)
  },
})

// Action to force migrate all conversations for an organization (ignoring cutoff)
export const forceMigrateOrganization = action({
  args: {
    organizationId: v.string(),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    skip: v.optional(v.number()),
    showMessages: v.optional(v.boolean()), // Show actual messages in dry run
  },
  returns: v.object({
    totalConversations: v.number(),
    conversationsWithNewMessages: v.number(),
    totalMigrated: v.number(),
    totalDuplicatesAvoided: v.number(),
    dryRun: v.boolean(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    totalConversations: number
    conversationsWithNewMessages: number
    totalMigrated: number
    totalDuplicatesAvoided: number
    dryRun: boolean
  }> => {
    const dryRun = args.dryRun ?? false
    const limit = args.limit ?? 500
    const skip = args.skip ?? 0
    const showMessages = args.showMessages ?? false

    console.log(
      `🚀 [FORCE MIGRATION] Starting for organization ${args.organizationId} (dryRun: ${dryRun}, limit: ${limit}, skip: ${skip})`
    )

    // Get conversations for this organization
    const conversations = await ctx.runQuery(
      internal.migrations.migrateConversationMessages
        .getConversationsByOrganization,
      { organizationId: args.organizationId, limit, skip }
    )

    let totalMigrated = 0
    let totalDuplicatesAvoided = 0
    let conversationsWithNewMessages = 0

    for (const conversation of conversations) {
      // Get messages from agent thread
      const messages = await listMessages(ctx, components.agent, {
        threadId: conversation.threadId,
        paginationOpts: { numItems: 1000, cursor: null },
      })

      const messagesToMigrate = messages.page.map((m) => ({
        role: m.message?.role || "user",
        content: m.message?.content || "",
        creationTime: m._creationTime,
        metadata: "metadata" in m ? m.metadata : undefined,
      }))

      // Get existing messages for duplicate check
      const existingMessages = await ctx.runQuery(
        internal.migrations.migrateConversationMessages
          .getExistingMessagesForConversation,
        { conversationId: conversation._id }
      )

      const existingMessageMap = new Map<string, number[]>()
      for (const msg of existingMessages) {
        const key = `${msg.direction}|${msg.contentText ?? ""}`
        const timestamps = existingMessageMap.get(key) ?? []
        timestamps.push(msg.messageTimestamp ?? msg._creationTime)
        existingMessageMap.set(key, timestamps)
      }

      let wouldMigrate = 0
      let wouldAvoidDuplicates = 0
      const messagesToShow: Array<{
        direction: string
        content: string
        timestamp: string
      }> = []

      for (const message of messagesToMigrate) {
        if (message.role === "tool") continue

        let textContent: string | undefined
        if (typeof message.content === "string") {
          textContent = message.content
        } else if (Array.isArray(message.content)) {
          for (const part of message.content as AgentMessageContent[]) {
            if (part.type === "text" && part.text) {
              textContent = part.text
            }
          }
        }

        if (!textContent) continue

        const direction = message.role === "user" ? "inbound" : "outbound"
        const duplicateKey = `${direction}|${textContent}`
        const existingTimestamps = existingMessageMap.get(duplicateKey) ?? []
        const isDuplicate = existingTimestamps.some(
          (existingTime) =>
            Math.abs(existingTime - message.creationTime) <=
            DUPLICATE_TIME_WINDOW_MS
        )

        if (isDuplicate) {
          wouldAvoidDuplicates++
        } else {
          wouldMigrate++
          if (showMessages && dryRun) {
            messagesToShow.push({
              direction,
              content: textContent.substring(0, 100),
              timestamp: new Date(message.creationTime).toISOString(),
            })
          }
          existingMessageMap.set(duplicateKey, [
            ...existingTimestamps,
            message.creationTime,
          ])
        }
      }

      if (wouldMigrate > 0) {
        conversationsWithNewMessages++

        if (dryRun) {
          console.log(
            `🔍 [DRY RUN] Conversation ${conversation._id}: would migrate ${wouldMigrate}, duplicates avoided ${wouldAvoidDuplicates}`
          )
          if (showMessages && messagesToShow.length > 0) {
            for (const msg of messagesToShow) {
              console.log(
                `   📝 [${msg.direction}] ${msg.timestamp}: "${msg.content}${msg.content.length >= 100 ? "..." : ""}"`
              )
            }
          }
        } else {
          // Run actual migration
          const result: {
            migrated: number
            skipped: number
            duplicatesAvoided: number
          } = await ctx.runMutation(
            internal.migrations.migrateConversationMessages
              .migrateConversationForceFull,
            {
              conversationId: conversation._id,
              messages: messagesToMigrate,
            }
          )
          console.log(
            `✅ [MIGRATION] Conversation ${conversation._id}: migrated ${result.migrated}, duplicates avoided ${result.duplicatesAvoided}`
          )
          wouldMigrate = result.migrated
          wouldAvoidDuplicates = result.duplicatesAvoided
        }
      }

      totalMigrated += wouldMigrate
      totalDuplicatesAvoided += wouldAvoidDuplicates
    }

    console.log(
      `🏁 [FORCE MIGRATION] Complete! Conversations: ${conversations.length}, with new messages: ${conversationsWithNewMessages}, migrated: ${totalMigrated}, duplicates avoided: ${totalDuplicatesAvoided}`
    )

    return {
      totalConversations: conversations.length,
      conversationsWithNewMessages,
      totalMigrated,
      totalDuplicatesAvoided,
      dryRun,
    }
  },
})

// Action to force migrate a specific conversation (ignoring cutoff)
export const forceMigrateConversation = action({
  args: {
    conversationId: v.id("conversations"),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    migrated: v.number(),
    skipped: v.number(),
    duplicatesAvoided: v.number(),
    dryRun: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false

    // Get conversation
    const conversation = await ctx.runQuery(
      internal.migrations.migrateConversationMessages.getConversationById,
      { conversationId: args.conversationId }
    )

    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`)
    }

    // Get messages from agent thread
    const messages = await listMessages(ctx, components.agent, {
      threadId: conversation.threadId,
      paginationOpts: { numItems: 1000, cursor: null },
    })

    const messagesToMigrate = messages.page.map((m) => ({
      role: m.message?.role || "user",
      content: m.message?.content || "",
      creationTime: m._creationTime,
      metadata: "metadata" in m ? m.metadata : undefined,
    }))

    if (dryRun) {
      // Get existing messages for duplicate check
      const existingMessages = await ctx.runQuery(
        internal.migrations.migrateConversationMessages
          .getExistingMessagesForConversation,
        { conversationId: args.conversationId }
      )

      const existingMessageMap = new Map<string, number[]>()
      for (const msg of existingMessages) {
        const key = `${msg.direction}|${msg.contentText ?? ""}`
        const timestamps = existingMessageMap.get(key) ?? []
        timestamps.push(msg.messageTimestamp ?? msg._creationTime)
        existingMessageMap.set(key, timestamps)
      }

      let wouldMigrate = 0
      let wouldAvoidDuplicates = 0

      for (const message of messagesToMigrate) {
        if (message.role === "tool") continue

        let textContent: string | undefined
        if (typeof message.content === "string") {
          textContent = message.content
        } else if (Array.isArray(message.content)) {
          for (const part of message.content as AgentMessageContent[]) {
            if (part.type === "text" && part.text) {
              textContent = part.text
            }
          }
        }

        if (!textContent) continue

        const direction = message.role === "user" ? "inbound" : "outbound"
        const duplicateKey = `${direction}|${textContent}`
        const existingTimestamps = existingMessageMap.get(duplicateKey) ?? []
        const isDuplicate = existingTimestamps.some(
          (existingTime) =>
            Math.abs(existingTime - message.creationTime) <=
            DUPLICATE_TIME_WINDOW_MS
        )

        if (isDuplicate) {
          wouldAvoidDuplicates++
        } else {
          wouldMigrate++
          // Update map for batch duplicate detection
          existingMessageMap.set(duplicateKey, [
            ...existingTimestamps,
            message.creationTime,
          ])
        }
      }

      console.log(
        `🔍 [DRY RUN] Conversation ${args.conversationId}: would migrate ${wouldMigrate}, duplicates avoided ${wouldAvoidDuplicates}`
      )

      return {
        migrated: wouldMigrate,
        skipped: 0,
        duplicatesAvoided: wouldAvoidDuplicates,
        dryRun: true,
      }
    }

    // Run actual migration
    const result: {
      migrated: number
      skipped: number
      duplicatesAvoided: number
    } = await ctx.runMutation(
      internal.migrations.migrateConversationMessages
        .migrateConversationForceFull,
      {
        conversationId: args.conversationId,
        messages: messagesToMigrate,
      }
    )

    console.log(
      `✅ [MIGRATION] Conversation ${args.conversationId}: migrated ${result.migrated}, duplicates avoided ${result.duplicatesAvoided}`
    )

    return { ...result, dryRun: false }
  },
})

// Migrate a single conversation's messages
export const migrateConversation = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    messages: v.array(
      v.object({
        role: v.string(),
        content: v.any(),
        creationTime: v.number(),
        metadata: v.optional(v.any()),
      })
    ),
    cutoffTimestamp: v.optional(v.number()), // Only migrate messages BEFORE this timestamp
  },
  returns: v.object({
    migrated: v.number(),
    skipped: v.number(),
    duplicatesAvoided: v.number(),
  }),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      console.log(
        `⚠️ [MIGRATION] Conversation ${args.conversationId} not found, skipping`
      )
      return { migrated: 0, skipped: 0, duplicatesAvoided: 0 }
    }

    // Get existing messages for this conversation to check for duplicates
    const existingMessages = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect()

    // Build a map of existing messages for quick duplicate detection
    // Key: direction|contentText, Value: array of timestamps
    const existingMessageMap = new Map<string, number[]>()
    for (const msg of existingMessages) {
      const key = `${msg.direction}|${msg.content?.text ?? ""}`
      const timestamps = existingMessageMap.get(key) ?? []
      timestamps.push(msg.messageTimestamp ?? msg._creationTime)
      existingMessageMap.set(key, timestamps)
    }

    let migratedCount = 0
    let skippedCount = 0
    let duplicatesAvoided = 0

    for (const message of args.messages) {
      // If we have a cutoff timestamp, skip messages that are newer
      // (they were already saved by the new system)
      if (
        args.cutoffTimestamp &&
        message.creationTime >= args.cutoffTimestamp
      ) {
        skippedCount++
        continue
      }

      // Determine direction based on role
      const direction = message.role === "user" ? "inbound" : "outbound"

      // Skip tool messages - they're internal to the agent
      if (message.role === "tool") {
        continue
      }

      // Parse content to determine message type
      let messageType: "text" | "image" | "audio" | "document" | "location" =
        "text"
      let textContent: string | undefined
      let mediaUrl: string | undefined
      let mediaMimeType: string | undefined
      let mediaCaption: string | undefined
      let mediaFilename: string | undefined
      let locationLatitude: number | undefined
      let locationLongitude: number | undefined
      let locationName: string | undefined

      // Handle different content formats
      if (typeof message.content === "string") {
        textContent = message.content
      } else if (Array.isArray(message.content)) {
        // Multi-part content (text + image, etc.)
        for (const part of message.content as AgentMessageContent[]) {
          if (part.type === "text" && part.text) {
            textContent = part.text
          } else if (part.type === "image" && part.image) {
            messageType = "image"
            mediaUrl = part.image
            mediaMimeType = "image/jpeg"
          }
        }
      }

      // Check metadata for sources (images sent by tools)
      const metadata = message.metadata as
        | { sources?: MetadataSource[] }
        | undefined
      if (metadata?.sources && Array.isArray(metadata.sources)) {
        for (const source of metadata.sources) {
          const attachment = source.providerMetadata?.attachment
          if (attachment?.mimeType && source.url) {
            if (attachment.mimeType.startsWith("image/")) {
              messageType = "image"
              mediaUrl = source.url
              mediaMimeType = attachment.mimeType
              mediaCaption = attachment.caption || source.title
            } else if (attachment.mimeType.startsWith("audio/")) {
              messageType = "audio"
              mediaUrl = source.url
              mediaMimeType = attachment.mimeType
              mediaCaption = attachment.caption
            } else if (attachment.mimeType === "application/pdf") {
              messageType = "document"
              mediaUrl = source.url
              mediaMimeType = attachment.mimeType
              mediaCaption = attachment.caption
              mediaFilename = source.title || "document.pdf"
            }
          }
        }
      }

      // Check for location in text content
      if (textContent?.includes("📍") && textContent.includes("Coordenadas:")) {
        // Try to extract coordinates from location message
        const coordMatch = textContent.match(
          /Coordenadas:\s*([-\d.]+),\s*([-\d.]+)/
        )
        if (coordMatch?.[1] && coordMatch[2]) {
          messageType = "location"
          locationLatitude = parseFloat(coordMatch[1])
          locationLongitude = parseFloat(coordMatch[2])
          // Try to extract name
          const nameMatch = textContent.match(/ubicación:\s*([^(\n]+)/)
          if (nameMatch?.[1]) {
            locationName = nameMatch[1].trim()
          }
        }
      }

      // Build content object based on what we found
      const content: {
        text?: string
        media?: {
          url: string
          mimeType: string
          caption?: string
          filename?: string
        }
        location?: {
          latitude: number
          longitude: number
          name?: string
        }
      } = {}

      if (textContent) {
        content.text = textContent
      }

      if (mediaUrl && mediaMimeType) {
        content.media = {
          url: mediaUrl,
          mimeType: mediaMimeType,
          caption: mediaCaption,
          filename: mediaFilename,
        }
      }

      if (locationLatitude !== undefined && locationLongitude !== undefined) {
        content.location = {
          latitude: locationLatitude,
          longitude: locationLongitude,
          name: locationName,
        }
      }

      // Skip empty messages
      if (!content.text && !content.media && !content.location) {
        continue
      }

      // Check for duplicates before inserting
      const duplicateKey = `${direction}|${content.text ?? ""}`
      const existingTimestamps = existingMessageMap.get(duplicateKey) ?? []
      const isDuplicate = existingTimestamps.some(
        (existingTime) =>
          Math.abs(existingTime - message.creationTime) <=
          DUPLICATE_TIME_WINDOW_MS
      )

      if (isDuplicate) {
        duplicatesAvoided++
        console.log(
          `🔄 [MIGRATION] Skipping duplicate: "${(content.text ?? "").substring(0, 50)}..." at ${new Date(message.creationTime).toISOString()}`
        )
        continue
      }

      // Insert into conversationMessages with original timestamp for correct ordering
      await ctx.db.insert("conversationMessages", {
        conversationId: args.conversationId,
        organizationId: conversation.organizationId,
        direction,
        type: messageType,
        content,
        status: direction === "outbound" ? "sent" : undefined,
        messageTimestamp: message.creationTime,
      })

      // Add to our map to prevent duplicates within the same migration batch
      const timestamps = existingMessageMap.get(duplicateKey) ?? []
      timestamps.push(message.creationTime)
      existingMessageMap.set(duplicateKey, timestamps)

      migratedCount++
    }

    return { migrated: migratedCount, skipped: skippedCount, duplicatesAvoided }
  },
})

// Debug query to check messages in conversationMessages table
export const debugGetMessages = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .take(args.limit ?? 50)

    return messages.map((m) => ({
      id: m._id,
      direction: m.direction,
      type: m.type,
      content: m.content,
      status: m.status,
      messageTimestamp: m.messageTimestamp,
      creationTime: m._creationTime,
    }))
  },
})

// Main migration action that processes all conversations
export const runMigration = internalAction({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    skip: v.optional(v.number()),
    latest: v.optional(v.boolean()),
  },
  returns: v.object({
    totalConversations: v.number(),
    partiallyMigrated: v.number(),
    skippedNoMessages: v.number(),
    errors: v.number(),
    totalMigrated: v.number(),
    totalSkipped: v.number(),
    totalDuplicatesAvoided: v.number(),
    dryRun: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false
    const limit = args.limit ?? 1000
    const skip = args.skip ?? 0
    const latest = args.latest ?? false

    console.log(
      `🚀 [MIGRATION] Starting conversation messages migration (dryRun: ${dryRun}, limit: ${limit}, skip: ${skip}, latest: ${latest})`
    )

    let totalMigrated = 0
    let totalSkipped = 0
    let totalDuplicatesAvoided = 0
    let totalConversations = 0
    let skippedNoMessages = 0
    let partiallyMigrated = 0
    let errors = 0

    // Get all conversations
    const conversations = await ctx.runQuery(
      internal.migrations.migrateConversationMessages.getConversationsToMigrate,
      { limit, skip, latest }
    )

    console.log(
      `📊 [MIGRATION] Found ${conversations.length} conversations to process`
    )

    for (const conversation of conversations) {
      totalConversations++

      // Get the oldest message timestamp in conversationMessages
      // If there are already messages, we only migrate messages BEFORE that timestamp
      const oldestTimestamp = await ctx.runQuery(
        internal.migrations.migrateConversationMessages
          .getOldestMessageTimestamp,
        { conversationId: conversation._id }
      )

      // Get messages from agent thread
      try {
        const messages = await listMessages(ctx, components.agent, {
          threadId: conversation.threadId,
          paginationOpts: { numItems: 1000, cursor: null },
        })

        if (messages.page.length === 0) {
          skippedNoMessages++
          continue
        }

        // Transform messages for migration
        const messagesToMigrate = messages.page.map((msg) => ({
          role: msg.message?.role || "user",
          content: msg.message?.content || "",
          creationTime: msg._creationTime,
          metadata: "metadata" in msg ? msg.metadata : undefined,
        }))

        if (dryRun) {
          // Get existing messages for duplicate detection
          const existingMessages = await ctx.runQuery(
            internal.migrations.migrateConversationMessages
              .getExistingMessagesForConversation,
            { conversationId: conversation._id }
          )

          // Build duplicate detection map
          const existingMessageMap = new Map<string, number[]>()
          for (const msg of existingMessages) {
            const key = `${msg.direction}|${msg.contentText ?? ""}`
            const timestamps = existingMessageMap.get(key) ?? []
            timestamps.push(msg.messageTimestamp ?? msg._creationTime)
            existingMessageMap.set(key, timestamps)
          }

          let wouldMigrate = 0
          let wouldSkip = 0
          let wouldAvoidDuplicates = 0

          for (const msg of messagesToMigrate) {
            // Skip tool messages
            if (msg.role === "tool") continue

            const direction = msg.role === "user" ? "inbound" : "outbound"

            // Extract text content
            let textContent = ""
            if (typeof msg.content === "string") {
              textContent = msg.content
            } else if (Array.isArray(msg.content)) {
              for (const part of msg.content as {
                type?: string
                text?: string
              }[]) {
                if (part.type === "text" && part.text) {
                  textContent = part.text
                  break
                }
              }
            }

            // Check cutoff
            if (oldestTimestamp && msg.creationTime >= oldestTimestamp) {
              wouldSkip++
              continue
            }

            // Skip empty messages (same as actual migration)
            if (!textContent) {
              continue
            }

            // Check for duplicates
            const duplicateKey = `${direction}|${textContent}`
            const existingTimestamps =
              existingMessageMap.get(duplicateKey) ?? []
            const isDuplicate = existingTimestamps.some(
              (existingTime) =>
                Math.abs(existingTime - msg.creationTime) <=
                DUPLICATE_TIME_WINDOW_MS
            )

            if (isDuplicate) {
              wouldAvoidDuplicates++
            } else {
              wouldMigrate++
              // Add to map for within-batch duplicate detection
              const timestamps = existingMessageMap.get(duplicateKey) ?? []
              timestamps.push(msg.creationTime)
              existingMessageMap.set(duplicateKey, timestamps)
            }
          }

          console.log(
            `🔍 [DRY RUN] Conversation ${conversation._id}: would migrate ${wouldMigrate}, skip ${wouldSkip}, duplicates avoided ${wouldAvoidDuplicates}`
          )
          totalMigrated += wouldMigrate
          totalSkipped += wouldSkip
          totalDuplicatesAvoided += wouldAvoidDuplicates
          if (oldestTimestamp) partiallyMigrated++
        } else {
          // Run migration with cutoff timestamp
          const migrationResult = await ctx.runMutation(
            internal.migrations.migrateConversationMessages.migrateConversation,
            {
              conversationId: conversation._id,
              messages: messagesToMigrate,
              cutoffTimestamp: oldestTimestamp ?? undefined,
            }
          )

          totalMigrated += migrationResult.migrated
          totalSkipped += migrationResult.skipped
          totalDuplicatesAvoided += migrationResult.duplicatesAvoided
          if (oldestTimestamp) partiallyMigrated++

          console.log(
            `✅ [MIGRATION] Conversation ${conversation._id}: migrated ${migrationResult.migrated}, skipped ${migrationResult.skipped}, duplicates avoided ${migrationResult.duplicatesAvoided}`
          )
        }
      } catch (error) {
        errors++
        console.error(
          `❌ [MIGRATION] Error migrating conversation ${conversation._id}:`,
          error
        )
      }
    }

    const summary = `
🏁 [MIGRATION] Complete!
   Total conversations processed: ${totalConversations}
   Partially migrated (had new messages): ${partiallyMigrated}
   No messages (skipped): ${skippedNoMessages}
   Errors: ${errors}
   Messages migrated: ${totalMigrated}
   Messages skipped (already in new system): ${totalSkipped}
   Duplicates avoided: ${totalDuplicatesAvoided}
   Dry run: ${dryRun}
    `
    console.log(summary)

    return {
      totalConversations,
      partiallyMigrated,
      skippedNoMessages,
      errors,
      totalMigrated,
      totalSkipped,
      totalDuplicatesAvoided,
      dryRun,
    }
  },
})

// Get a single conversation by ID
export const getConversationById = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  // Note: returns validator removed to allow for schema evolution
  handler: async (ctx, args) => {
    return await ctx.db.get(args.conversationId)
  },
})

// Detailed message info for dry run preview
interface MessagePreview {
  role: string
  direction: string
  content: string
  timestamp: string
  wouldMigrate: boolean
  skipReason?: string
}

interface ConversationPreview {
  conversationId: string
  contactPhone?: string
  existingMessagesCount: number
  threadMessagesCount: number
  wouldMigrate: number
  wouldSkip: number
  duplicatesWouldAvoid: number
  messages: MessagePreview[]
}

// Detailed dry run that shows exactly what would be migrated
export const dryRunDetailed = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    limit: v.optional(v.number()),
    latest: v.optional(v.boolean()),
  },
  returns: v.object({
    totalConversations: v.number(),
    totalWouldMigrate: v.number(),
    totalWouldSkip: v.number(),
    totalDuplicatesWouldAvoid: v.number(),
    conversations: v.array(
      v.object({
        conversationId: v.string(),
        contactPhone: v.optional(v.string()),
        existingMessagesCount: v.number(),
        threadMessagesCount: v.number(),
        wouldMigrate: v.number(),
        wouldSkip: v.number(),
        duplicatesWouldAvoid: v.number(),
        messages: v.array(
          v.object({
            role: v.string(),
            direction: v.string(),
            content: v.string(),
            timestamp: v.string(),
            wouldMigrate: v.boolean(),
            skipReason: v.optional(v.string()),
          })
        ),
      })
    ),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    totalConversations: number
    totalWouldMigrate: number
    totalWouldSkip: number
    totalDuplicatesWouldAvoid: number
    conversations: ConversationPreview[]
  }> => {
    const limit = args.limit ?? 100
    const latest = args.latest ?? false

    let conversations: Doc<"conversations">[] = []
    if (args.conversationId) {
      const conv = await ctx.runQuery(
        internal.migrations.migrateConversationMessages.getConversationById,
        { conversationId: args.conversationId }
      )
      conversations = conv ? [conv] : []
    } else {
      conversations = await ctx.runQuery(
        internal.migrations.migrateConversationMessages
          .getConversationsToMigrate,
        { limit, latest }
      )
    }

    const results: ConversationPreview[] = []
    let totalWouldMigrate = 0
    let totalWouldSkip = 0
    let totalDuplicatesWouldAvoid = 0

    for (const conversation of conversations) {
      // Get existing messages for duplicate detection
      const existingMessages = await ctx.runQuery(
        internal.migrations.migrateConversationMessages
          .getExistingMessagesForConversation,
        { conversationId: conversation._id }
      )

      // Build duplicate detection map
      const existingMessageMap = new Map<string, number[]>()
      for (const msg of existingMessages) {
        const key = `${msg.direction}|${msg.contentText ?? ""}`
        const timestamps = existingMessageMap.get(key) ?? []
        timestamps.push(msg.messageTimestamp ?? msg._creationTime)
        existingMessageMap.set(key, timestamps)
      }

      // Get oldest timestamp for cutoff (use messageTimestamp, not _creationTime)
      const oldestTimestamp =
        existingMessages.length > 0
          ? Math.min(
              ...existingMessages.map(
                (m) => m.messageTimestamp ?? m._creationTime
              )
            )
          : null

      // Get messages from agent thread
      try {
        const messages = await listMessages(ctx, components.agent, {
          threadId: conversation.threadId,
          paginationOpts: { numItems: 1000, cursor: null },
        })

        const messagesPreviews: MessagePreview[] = []
        let wouldMigrate = 0
        let wouldSkip = 0
        let duplicatesWouldAvoid = 0

        for (const msg of messages.page) {
          const role = msg.message?.role || "user"
          const direction = role === "user" ? "inbound" : "outbound"
          const creationTime = msg._creationTime

          // Skip tool messages
          if (role === "tool") continue

          // Extract text content
          let textContent = ""
          const content = msg.message?.content
          if (typeof content === "string") {
            textContent = content
          } else if (Array.isArray(content)) {
            for (const part of content as { type?: string; text?: string }[]) {
              if (part.type === "text" && part.text) {
                textContent = part.text
                break
              }
            }
          }

          let wouldMigrateThis = true
          let skipReason: string | undefined

          // Check cutoff
          if (oldestTimestamp && creationTime >= oldestTimestamp) {
            wouldMigrateThis = false
            skipReason = "After cutoff (already in new system)"
            wouldSkip++
          } else {
            // Check for duplicates
            const duplicateKey = `${direction}|${textContent}`
            const existingTimestamps =
              existingMessageMap.get(duplicateKey) ?? []
            const isDuplicate = existingTimestamps.some(
              (existingTime) =>
                Math.abs(existingTime - creationTime) <=
                DUPLICATE_TIME_WINDOW_MS
            )

            if (isDuplicate) {
              wouldMigrateThis = false
              skipReason = "Duplicate (same content within 5s)"
              duplicatesWouldAvoid++
            } else {
              wouldMigrate++
              // Add to map for within-batch duplicate detection
              const timestamps = existingMessageMap.get(duplicateKey) ?? []
              timestamps.push(creationTime)
              existingMessageMap.set(duplicateKey, timestamps)
            }
          }

          messagesPreviews.push({
            role,
            direction,
            content:
              textContent.substring(0, 100) +
              (textContent.length > 100 ? "..." : ""),
            timestamp: new Date(creationTime).toISOString(),
            wouldMigrate: wouldMigrateThis,
            skipReason,
          })
        }

        results.push({
          conversationId: conversation._id,
          contactPhone: undefined, // Phone is on contact, not conversation
          existingMessagesCount: existingMessages.length,
          threadMessagesCount: messages.page.length,
          wouldMigrate,
          wouldSkip,
          duplicatesWouldAvoid,
          messages: messagesPreviews,
        })

        totalWouldMigrate += wouldMigrate
        totalWouldSkip += wouldSkip
        totalDuplicatesWouldAvoid += duplicatesWouldAvoid
      } catch (error) {
        console.error(
          `Error processing conversation ${conversation._id}:`,
          error
        )
      }
    }

    return {
      totalConversations: results.length,
      totalWouldMigrate,
      totalWouldSkip,
      totalDuplicatesWouldAvoid,
      conversations: results,
    }
  },
})

// Get existing messages for a conversation (for dry run duplicate detection)
export const getExistingMessagesForConversation = internalQuery({
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

    return messages.map((m) => ({
      _id: m._id,
      _creationTime: m._creationTime,
      direction: m.direction,
      contentText: m.content?.text ?? null,
      messageTimestamp: m.messageTimestamp ?? null,
    }))
  },
})

// Helper to migrate a single conversation by ID (useful for testing)
export const migrateSingleConversation = internalAction({
  args: {
    conversationId: v.id("conversations"),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    status: v.string(),
    migrated: v.number(),
  }),
  handler: async (ctx, args): Promise<{ status: string; migrated: number }> => {
    const dryRun = args.dryRun ?? false

    console.log(
      `🚀 [MIGRATION] Migrating single conversation ${args.conversationId} (dryRun: ${dryRun})`
    )

    // Check if already migrated
    const isMigrated = await ctx.runQuery(
      internal.migrations.migrateConversationMessages.isConversationMigrated,
      { conversationId: args.conversationId }
    )

    if (isMigrated) {
      console.log(
        `⚠️ [MIGRATION] Conversation ${args.conversationId} already migrated`
      )
      return { status: "already_migrated", migrated: 0 }
    }

    // Get conversation
    const conversation = await ctx.runQuery(
      internal.migrations.migrateConversationMessages.getConversationById,
      { conversationId: args.conversationId }
    )

    if (!conversation) {
      console.log(
        `❌ [MIGRATION] Conversation ${args.conversationId} not found`
      )
      return { status: "not_found", migrated: 0 }
    }

    // Get messages from agent thread
    const messages = await listMessages(ctx, components.agent, {
      threadId: conversation.threadId,
      paginationOpts: { numItems: 1000, cursor: null },
    })

    if (messages.page.length === 0) {
      console.log(
        `⚠️ [MIGRATION] Conversation ${args.conversationId} has no messages`
      )
      return { status: "no_messages", migrated: 0 }
    }

    // Transform messages for migration
    const messagesToMigrate = messages.page.map((msg) => ({
      role: msg.message?.role || "user",
      content: msg.message?.content || "",
      creationTime: msg._creationTime,
      metadata: "metadata" in msg ? msg.metadata : undefined,
    }))

    if (dryRun) {
      console.log(
        `🔍 [DRY RUN] Would migrate ${messagesToMigrate.length} messages`
      )
      return { status: "dry_run", migrated: messagesToMigrate.length }
    }

    // Run migration
    const migrationResult = await ctx.runMutation(
      internal.migrations.migrateConversationMessages.migrateConversation,
      {
        conversationId: args.conversationId,
        messages: messagesToMigrate,
      }
    )

    console.log(`✅ [MIGRATION] Migrated ${migrationResult.migrated} messages`)

    return { status: "success", migrated: migrationResult.migrated }
  },
})

// Delete all messages for a conversation (for re-migration)
export const deleteConversationMessages = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const messages = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect()

    for (const message of messages) {
      await ctx.db.delete(message._id)
    }

    return messages.length
  },
})

// Delete ALL conversation messages (for full re-migration)
export const deleteAllConversationMessages = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const limit = args.limit ?? 1000
    const messages = await ctx.db.query("conversationMessages").take(limit)

    for (const message of messages) {
      await ctx.db.delete(message._id)
    }

    console.log(`🗑️ [CLEANUP] Deleted ${messages.length} messages`)
    return messages.length
  },
})
