import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import { isSyntheticThreadId } from "../lib/conversationCost"
import { platformAdminAction, platformAdminQuery } from "../lib/superAdmin"

const DEFAULT_DRY_RUN_PAGE_SIZE = 200
const MAX_DRY_RUN_PAGE_SIZE = 500
const getConversationBatchForOrganizationRef = makeFunctionReference<"query">(
  "system/migrations/backfillConversationCosts:getConversationBatchForOrganization"
)
const getJobForOrganizationRef = makeFunctionReference<"query">(
  "system/migrations/backfillConversationCosts:getJobForOrganization"
)
const launchOrganizationBackfillRef = makeFunctionReference<"action">(
  "system/migrations/backfillConversationCosts:launchOrganizationBackfill"
)

function normalizeDryRunPageSize(pageSize?: number) {
  return Math.max(
    1,
    Math.min(pageSize ?? DEFAULT_DRY_RUN_PAGE_SIZE, MAX_DRY_RUN_PAGE_SIZE)
  )
}

export const dryRunForOrganization = platformAdminAction({
  args: {
    organizationId: v.string(),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pageSize = normalizeDryRunPageSize(args.pageSize)

    let alreadyProcessed = 0
    let cursor: string | undefined
    let eligibleConversations = 0
    let syntheticThreads = 0
    let totalConversations = 0

    while (true) {
      const batch = await ctx.runQuery(getConversationBatchForOrganizationRef, {
        batchSize: pageSize,
        cutoffTimestamp: undefined,
        cursor,
        organizationId: args.organizationId,
      })

      totalConversations += batch.page.length

      for (const conversation of batch.page) {
        if (isSyntheticThreadId(conversation.threadId)) {
          syntheticThreads++
          continue
        }

        if (conversation.aiCostLedgerSyncedAt !== undefined) {
          alreadyProcessed++
          continue
        }

        eligibleConversations++
      }

      if (batch.isDone) {
        break
      }

      cursor = batch.continueCursor ?? undefined
    }

    return {
      alreadyProcessed,
      eligibleConversations,
      organizationId: args.organizationId,
      pageSize,
      syntheticThreads,
      totalConversations,
    }
  },
})

export const startOrResumeForOrganization = platformAdminAction({
  args: {
    batchSize: v.optional(v.number()),
    mode: v.optional(v.union(v.literal("full"), v.literal("failed_only"))),
    organizationId: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<Doc<"conversationCostBackfillJobs"> | null> => {
    return await ctx.runAction(launchOrganizationBackfillRef, args)
  },
})

export const getStatusForOrganization = platformAdminQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<Doc<"conversationCostBackfillJobs"> | null> => {
    return await ctx.runQuery(getJobForOrganizationRef, {
      organizationId: args.organizationId,
    })
  },
})
