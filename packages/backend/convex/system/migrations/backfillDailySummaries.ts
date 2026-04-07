import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import { internalAction, internalMutation } from "../../_generated/server"
import {
  getDailyDateForTimestamp,
  rebuildOrganizationDailySummary,
} from "../../lib/aiCostLedger"

const DEFAULT_PAGE_SIZE = 200
const MAX_PAGE_SIZE = 500
const MAX_ACTION_DURATION_MS = 8 * 60 * 1000

const rebuildDailySummariesPageRef = makeFunctionReference<"mutation">(
  "system/migrations/backfillDailySummaries:rebuildDailySummariesPage"
)

const runRef = makeFunctionReference<"action">(
  "system/migrations/backfillDailySummaries:run"
)

function normalizePageSize(pageSize?: number) {
  return Math.max(1, Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))
}

export const rebuildDailySummariesPage = internalMutation({
  args: {
    organizationId: v.string(),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  returns: v.object({
    continueCursor: v.optional(v.string()),
    isDone: v.boolean(),
    rebuiltPairs: v.number(),
  }),
  handler: async (ctx, args) => {
    const pageSize = normalizePageSize(args.pageSize)

    const result = await ctx.db
      .query("aiCostEvents")
      .withIndex("by_organization_and_event_at", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems: pageSize,
      })

    const dates = new Set<string>()

    for (const event of result.page) {
      dates.add(getDailyDateForTimestamp(event.eventAt))
    }

    let rebuiltPairs = 0
    for (const date of dates) {
      await rebuildOrganizationDailySummary(ctx, args.organizationId, date)
      rebuiltPairs++
    }

    return {
      continueCursor: result.isDone
        ? undefined
        : (result.continueCursor ?? undefined),
      isDone: result.isDone,
      rebuiltPairs,
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
    totalRebuiltPairs: v.number(),
    continued: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const startedAt = Date.now()
    let cursor: string | undefined = args.startCursor
    let pagesProcessed = 0
    let totalRebuiltPairs = 0

    console.log(
      `[BACKFILL DAILY SUMMARIES] Starting for org=${args.organizationId}`
    )

    while (true) {
      if (Date.now() - startedAt > MAX_ACTION_DURATION_MS) {
        console.log(
          `[BACKFILL DAILY SUMMARIES] Time limit approaching, scheduling continuation for org=${args.organizationId}`
        )
        await ctx.scheduler.runAfter(0, runRef, {
          organizationId: args.organizationId,
          pageSize: args.pageSize,
          startCursor: cursor,
        })
        return { organizationId: args.organizationId, pagesProcessed, totalRebuiltPairs, continued: true }
      }

      const result = await ctx.runMutation(rebuildDailySummariesPageRef, {
        organizationId: args.organizationId,
        cursor,
        pageSize: args.pageSize,
      })

      pagesProcessed++
      totalRebuiltPairs += result.rebuiltPairs

      console.log(
        `[BACKFILL DAILY SUMMARIES] org=${args.organizationId} Page ${pagesProcessed}: rebuilt ${result.rebuiltPairs} date pairs (total: ${totalRebuiltPairs})`
      )

      if (result.isDone) {
        break
      }

      cursor = result.continueCursor
    }

    console.log(
      `[BACKFILL DAILY SUMMARIES] Complete for org=${args.organizationId}: ${pagesProcessed} pages, ${totalRebuiltPairs} date pairs rebuilt`
    )

    return { organizationId: args.organizationId, pagesProcessed, totalRebuiltPairs, continued: false }
  },
})
