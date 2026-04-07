import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import { internalAction, internalMutation } from "../../_generated/server"
import { roundCost } from "../../lib/aiCostLedger"

const DEFAULT_PAGE_SIZE = 100
const MAX_ACTION_DURATION_MS = 8 * 60 * 1000

const updateConversationCostPageRef = makeFunctionReference<"mutation">(
  "system/migrations/backfillConversationCostTotals:updateConversationCostPage"
)

const runRef = makeFunctionReference<"action">(
  "system/migrations/backfillConversationCostTotals:run"
)

export const updateConversationCostPage = internalMutation({
  args: {
    organizationId: v.string(),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  returns: v.object({
    continueCursor: v.optional(v.string()),
    isDone: v.boolean(),
    updated: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const pageSize = Math.max(1, Math.min(args.pageSize ?? DEFAULT_PAGE_SIZE, 500))

    const result = await ctx.db
      .query("conversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems: pageSize,
      })

    let updated = 0
    let skipped = 0

    for (const conversation of result.page) {
      const events = await ctx.db
        .query("aiCostEvents")
        .withIndex("by_conversation_id", (q) =>
          q.eq("conversationId", conversation._id)
        )
        .collect()

      if (events.length === 0) {
        skipped++
        continue
      }

      const totalCost = roundCost(
        events.reduce((sum, event) => sum + event.costUsd, 0)
      )

      const hasAllThreads = !events.some(
        (e) => e.coverage === "estimated"
      )

      await ctx.db.patch(conversation._id, {
        cost: totalCost,
        costCoverage: hasAllThreads ? "complete" : "estimated",
        costUpdatedAt: Date.now(),
      })

      updated++
    }

    return {
      continueCursor: result.isDone
        ? undefined
        : (result.continueCursor ?? undefined),
      isDone: result.isDone,
      updated,
      skipped,
    }
  },
})

export const run = internalAction({
  args: {
    organizationId: v.string(),
    pageSize: v.optional(v.number()),
    startCursor: v.optional(v.string()),
  },
  returns: v.object({
    organizationId: v.string(),
    pagesProcessed: v.number(),
    totalUpdated: v.number(),
    totalSkipped: v.number(),
    continued: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const startedAt = Date.now()
    let cursor: string | undefined = args.startCursor
    let pagesProcessed = 0
    let totalUpdated = 0
    let totalSkipped = 0

    console.log(
      `[BACKFILL CONVERSATION COSTS] Starting for org=${args.organizationId}`
    )

    while (true) {
      if (Date.now() - startedAt > MAX_ACTION_DURATION_MS) {
        console.log(
          `[BACKFILL CONVERSATION COSTS] Time limit approaching, scheduling continuation for org=${args.organizationId}`
        )
        await ctx.scheduler.runAfter(0, runRef, {
          organizationId: args.organizationId,
          pageSize: args.pageSize,
          startCursor: cursor,
        })
        return { organizationId: args.organizationId, pagesProcessed, totalUpdated, totalSkipped, continued: true }
      }

      const result = await ctx.runMutation(updateConversationCostPageRef, {
        organizationId: args.organizationId,
        cursor,
        pageSize: args.pageSize,
      })

      pagesProcessed++
      totalUpdated += result.updated
      totalSkipped += result.skipped

      console.log(
        `[BACKFILL CONVERSATION COSTS] org=${args.organizationId} Page ${pagesProcessed}: updated=${result.updated}, skipped=${result.skipped} (total updated=${totalUpdated})`
      )

      if (result.isDone) {
        break
      }

      cursor = result.continueCursor
    }

    console.log(
      `[BACKFILL CONVERSATION COSTS] Complete for org=${args.organizationId}: ${pagesProcessed} pages, ${totalUpdated} conversations updated, ${totalSkipped} skipped`
    )

    return { organizationId: args.organizationId, pagesProcessed, totalUpdated, totalSkipped, continued: false }
  },
})
