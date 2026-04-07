import { v } from "convex/values"
import { internalMutation } from "../../_generated/server"
import { isSyntheticThreadId } from "../../lib/conversationCost"
import { registerConversationAiThread } from "../../model/conversationAiThreads"

const DEFAULT_PAGE_SIZE = 200
const MAX_PAGE_SIZE = 500

function normalizePageSize(pageSize?: number) {
  return Math.max(1, Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))
}

const paginatedArgs = {
  cursor: v.union(v.string(), v.null()),
  organizationId: v.string(),
  pageSize: v.optional(v.number()),
}

export const dryRun = internalMutation({
  args: paginatedArgs,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("conversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .paginate({
        cursor: args.cursor,
        numItems: normalizePageSize(args.pageSize),
      })

    let alreadyRegistered = 0
    let syntheticThreads = 0
    let wouldRegister = 0

    for (const conversation of page.page) {
      if (isSyntheticThreadId(conversation.threadId)) {
        syntheticThreads++
        continue
      }

      const existing = await ctx.db
        .query("conversationAiThreads")
        .withIndex("by_thread_id", (q) =>
          q.eq("threadId", conversation.threadId)
        )
        .unique()

      if (existing) {
        alreadyRegistered++
        continue
      }

      wouldRegister++
    }

    return {
      alreadyRegistered,
      isDone: page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
      syntheticThreads,
      totalConversations: page.page.length,
      wouldRegister,
    }
  },
})

export const backfillPrimaryThreads = internalMutation({
  args: paginatedArgs,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("conversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .paginate({
        cursor: args.cursor,
        numItems: normalizePageSize(args.pageSize),
      })

    let inserted = 0
    let skipped = 0

    for (const conversation of page.page) {
      if (isSyntheticThreadId(conversation.threadId)) {
        skipped++
        continue
      }

      const existing = await ctx.db
        .query("conversationAiThreads")
        .withIndex("by_thread_id", (q) =>
          q.eq("threadId", conversation.threadId)
        )
        .unique()

      if (existing) {
        skipped++
        continue
      }

      await registerConversationAiThread(ctx, {
        conversationId: conversation._id,
        kind: "primary",
        organizationId: conversation.organizationId,
        purpose: "support-agent",
        threadId: conversation.threadId,
      })
      inserted++
    }

    return {
      inserted,
      isDone: page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
      skipped,
      totalConversations: page.page.length,
    }
  },
})
