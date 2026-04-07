import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import { components } from "../../_generated/api"
import { internalAction, internalMutation } from "../../_generated/server"
import { syncAiCostEventsForThread } from "../../lib/aiCostLedger"
import {
  type ConversationCostThreadRef,
  fetchAiThreadCostBreakdown,
  isSyntheticThreadId,
} from "../../lib/conversationCost"
import {
  getOrganizationAiThreadByThreadId,
  resolveConversationAssignmentForThread,
} from "../../model/organizationAiThreads"

const DEFAULT_PAGE_SIZE = 50
const MAX_ACTION_DURATION_MS = 8 * 60 * 1000 // 8 minutes (buffer before 10-min limit)

const syncSingleThreadRef = makeFunctionReference<"mutation">(
  "system/migrations/backfillAllThreadCosts:syncSingleThread"
)

const runRef = makeFunctionReference<"action">(
  "system/migrations/backfillAllThreadCosts:run"
)

export const syncSingleThread = internalMutation({
  args: {
    threadId: v.string(),
    threadCreationTime: v.number(),
    organizationId: v.string(),
  },
  returns: v.object({
    status: v.union(
      v.literal("synced"),
      v.literal("skipped"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    messagesWithCost: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    try {
      const assignment = await resolveConversationAssignmentForThread(ctx, {
        organizationId: args.organizationId,
        threadId: args.threadId,
      })

      const existing = await getOrganizationAiThreadByThreadId(ctx, {
        threadId: args.threadId,
      })
      if (!existing) {
        const now = Date.now()
        await ctx.db.insert("organizationAiThreads", {
          assignmentType: assignment.assignmentType,
          conversationId: assignment.conversationId,
          costSyncStatus: "pending",
          costSyncUpdatedAt: now,
          discoveredAt: args.threadCreationTime,
          kind: assignment.kind,
          lastSeenAt: now,
          organizationId: args.organizationId,
          purpose: assignment.purpose,
          resolutionReason: assignment.resolutionReason,
          resolutionReasonCode: assignment.resolutionReasonCode,
          resolutionStatus: "resolved",
          resolutionType: assignment.resolutionType,
          resolutionUpdatedAt: now,
          resolvedConversationId:
            assignment.resolutionType === "conversation"
              ? assignment.conversationId
              : undefined,
          threadId: args.threadId,
        })
      }

      const costResult = await fetchAiThreadCostBreakdown(ctx, {
        thread: {
          createdAt: args.threadCreationTime,
          kind: assignment.kind,
          purpose: assignment.purpose,
          threadId: args.threadId,
        } satisfies ConversationCostThreadRef,
      })

      if (costResult.failedThreads.length > 0) {
        const reasons = costResult.failedThreads
          .map((f) => f.reason)
          .join("; ")
        return {
          status: "failed" as const,
          error: `Fetch failed: ${reasons}`,
        }
      }

      if (costResult.breakdown.messages.length === 0) {
        return { status: "skipped" as const }
      }

      await syncAiCostEventsForThread(ctx, {
        assignmentType: assignment.assignmentType,
        breakdown: costResult.breakdown,
        conversationId: assignment.conversationId,
        coverage: "complete",
        organizationId: args.organizationId,
        threadId: args.threadId,
      })

      return {
        status: "synced" as const,
        messagesWithCost: costResult.breakdown.messagesWithCost,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      return { status: "failed" as const, error: msg }
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
    totalSynced: v.number(),
    totalSkipped: v.number(),
    totalFailed: v.number(),
    sampleErrors: v.array(v.string()),
    continued: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const startedAt = Date.now()
    const pageSize = Math.max(1, Math.min(args.pageSize ?? DEFAULT_PAGE_SIZE, 200))
    let cursor: string | null = args.startCursor ?? null
    let pagesProcessed = 0
    let totalSynced = 0
    let totalSkipped = 0
    let totalFailed = 0
    const sampleErrors: string[] = []

    console.log(
      `[BACKFILL THREAD COSTS] Starting for org=${args.organizationId}, pageSize=${pageSize}`
    )

    while (true) {
      if (Date.now() - startedAt > MAX_ACTION_DURATION_MS) {
        console.log(
          `[BACKFILL THREAD COSTS] Time limit approaching, scheduling continuation for org=${args.organizationId} from cursor=${cursor}`
        )
        await ctx.scheduler.runAfter(0, runRef, {
          organizationId: args.organizationId,
          pageSize: args.pageSize,
          startCursor: cursor ?? undefined,
        })
        return {
          organizationId: args.organizationId,
          pagesProcessed,
          totalSynced,
          totalSkipped,
          totalFailed,
          sampleErrors,
          continued: true,
        }
      }

      const result = await ctx.runQuery(
        components.agent.threads.listThreadsByUserId,
        {
          order: "asc",
          paginationOpts: {
            cursor,
            numItems: pageSize,
          },
          userId: args.organizationId,
        }
      )

      for (const thread of result.page) {
        if (isSyntheticThreadId(thread._id)) {
          totalSkipped++
          continue
        }

        const threadResult = await ctx.runMutation(syncSingleThreadRef, {
          threadId: thread._id,
          threadCreationTime: thread._creationTime,
          organizationId: args.organizationId,
        })

        switch (threadResult.status) {
          case "synced":
            totalSynced++
            break
          case "skipped":
            totalSkipped++
            break
          case "failed":
            totalFailed++
            if (threadResult.error && sampleErrors.length < 50) {
              sampleErrors.push(`${thread._id}: ${threadResult.error}`)
            }
            break
        }
      }

      pagesProcessed++
      console.log(
        `[BACKFILL THREAD COSTS] org=${args.organizationId} Page ${pagesProcessed}: ${result.page.length} threads (synced=${totalSynced}, skipped=${totalSkipped}, failed=${totalFailed})`
      )

      if (result.isDone) {
        break
      }

      cursor = result.continueCursor
    }

    console.log(
      `[BACKFILL THREAD COSTS] Complete for org=${args.organizationId}: ${pagesProcessed} pages, synced=${totalSynced}, skipped=${totalSkipped}, failed=${totalFailed}`
    )

    if (sampleErrors.length > 0) {
      console.warn(
        `[BACKFILL THREAD COSTS] org=${args.organizationId} Sample errors:\n${sampleErrors.join("\n")}`
      )
    }

    return {
      organizationId: args.organizationId,
      pagesProcessed,
      totalSynced,
      totalSkipped,
      totalFailed,
      sampleErrors,
      continued: false,
    }
  },
})
