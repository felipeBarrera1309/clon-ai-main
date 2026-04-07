import { makeFunctionReference } from "convex/server"
import { ConvexError, v } from "convex/values"
import { components } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../../_generated/server"
import type {
  OrganizationAiCostJobMode,
  OrganizationAiCostJobPhase,
  OrganizationAiCostSyncStatus,
} from "../../lib/aiCostDomain"
import {
  organizationAiCostCalculationEntityTypeValidator,
  organizationAiCostCalculationOutcomeValidator,
  organizationAiCostCalculationPhaseValidator,
  organizationAiCostJobModeValidator,
  organizationAiCostJobPhaseValidator,
  organizationAiCostReasonCodeValidator,
} from "../../lib/aiCostDomain"
import type { ConversationCostThreadFailure } from "../../lib/conversationCost"
import { isSyntheticThreadId } from "../../lib/conversationCost"
import { getOrganizationAiCostJobMode } from "../../lib/organizationAiCostState"
import {
  clearOrganizationAiCostCoverageJob,
  getOrganizationAiCostCoverage,
  markOrganizationAiCostCoverageRunning,
  recordOrganizationAiCostCalculationEntry,
} from "../../model/organizationAiCostCoverage"

const DEFAULT_BATCH_SIZE = 25
const MAX_BATCH_SIZE = 50
const backfillHistoricalConversationCostRef = makeFunctionReference<"mutation">(
  "system/conversations:backfillHistoricalConversationCost"
)
const startOrResumeJobForOrganizationRef = makeFunctionReference<"mutation">(
  "system/migrations/backfillConversationCosts:startOrResumeJobForOrganization"
)
const getConversationBatchForOrganizationRef = makeFunctionReference<"query">(
  "system/migrations/backfillConversationCosts:getConversationBatchForOrganization"
)
const getOrganizationThreadBatchForSyncRef = makeFunctionReference<"query">(
  "system/migrations/backfillConversationCosts:getOrganizationThreadBatchForSync"
)
const recordBatchProgressRef = makeFunctionReference<"mutation">(
  "system/migrations/backfillConversationCosts:recordBatchProgress"
)
const recordCalculationEntriesRef = makeFunctionReference<"mutation">(
  "system/migrations/backfillConversationCosts:recordCalculationEntries"
)
const getJobByIdRef = makeFunctionReference<"query">(
  "system/migrations/backfillConversationCosts:getJobById"
)
const markJobScheduledRef = makeFunctionReference<"mutation">(
  "system/migrations/backfillConversationCosts:markJobScheduled"
)
const processOrganizationBatchRef = makeFunctionReference<"action">(
  "system/migrations/backfillConversationCosts:processOrganizationBatch"
)
const discoverOrganizationThreadRef = makeFunctionReference<"mutation">(
  "system/organizationAiThreads:discoverThread"
)
const refreshOrganizationThreadCostRef = makeFunctionReference<"mutation">(
  "system/organizationAiThreads:refreshThreadCost"
)
const registerIgnoredThreadRef = makeFunctionReference<"mutation">(
  "system/organizationAiThreads:registerIgnoredThread"
)
const markThreadResolutionFailureRef = makeFunctionReference<"mutation">(
  "system/organizationAiThreads:markThreadResolutionFailure"
)

function normalizeBatchSize(batchSize?: number) {
  return Math.max(1, Math.min(batchSize ?? DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE))
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function buildRestartedBackfillJobPatch(args: {
  batchSize: number
  hasReusableInventory: boolean
  mode: OrganizationAiCostJobMode
  startedAt: number
}) {
  const phase: OrganizationAiCostJobPhase =
    args.mode === "failed_only" && args.hasReusableInventory
      ? "conversation_backfill"
      : "thread_inventory"

  return {
    batchSize: args.batchSize,
    cursor: undefined,
    cutoffTimestamp: args.startedAt,
    failed: 0,
    finishedAt: undefined,
    lastError: undefined,
    mode: args.mode,
    phase,
    processed: 0,
    scheduledFunctionId: undefined,
    skipped: 0,
    startedAt: args.startedAt,
    status: "running" as const,
    threadCursor: undefined,
    updated: 0,
  }
}

export function getOrganizationThreadSyncStatusesForMode(
  mode: OrganizationAiCostJobMode
): readonly OrganizationAiCostSyncStatus[] {
  return mode === "failed_only"
    ? (["failed"] as const)
    : (["pending", "failed"] as const)
}

export function shouldSkipConversationBackfill(args: {
  aiCostLastSyncFailedAt?: number
  aiCostLedgerSyncedAt?: number
  mode: OrganizationAiCostJobMode
}) {
  if (args.mode === "failed_only") {
    return args.aiCostLastSyncFailedAt === undefined
  }

  return (
    args.aiCostLedgerSyncedAt !== undefined &&
    args.aiCostLastSyncFailedAt === undefined
  )
}

function getCanonicalJob(
  jobs: Doc<"conversationCostBackfillJobs">[]
): Doc<"conversationCostBackfillJobs"> | null {
  if (jobs.length === 0) {
    return null
  }

  return (
    [...jobs].sort((a, b) => {
      if (a.status === "running" && b.status !== "running") {
        return -1
      }
      if (a.status !== "running" && b.status === "running") {
        return 1
      }
      if (b.startedAt !== a.startedAt) {
        return b.startedAt - a.startedAt
      }
      return b._creationTime - a._creationTime
    })[0] ?? null
  )
}

type CalculationEntryInput = {
  entityId: string
  entityType: "conversation" | "thread"
  jobId?: Id<"conversationCostBackfillJobs">
  organizationId: string
  outcome: "failed" | "ignored" | "skipped" | "updated"
  phase: "conversation_refresh" | "cost_sync" | "inventory" | "resolution"
  reason?: string
  reasonCode:
    | "already_synced"
    | "ambiguous_mapping"
    | "mapped_to_conversation"
    | "message_fetch_incomplete"
    | "standalone_combo_builder"
    | "standalone_debug_agent"
    | "synthetic_thread"
    | "thread_not_found"
    | "unassigned_legacy_orphan"
    | "unexpected_error"
  relatedConversationId?: Id<"conversations">
  threadId?: string
}

function buildConversationAuditEntry(args: {
  conversationId: Id<"conversations">
  jobId: Id<"conversationCostBackfillJobs">
  organizationId: string
  outcome: CalculationEntryInput["outcome"]
  reason?: string
  reasonCode: CalculationEntryInput["reasonCode"]
}) {
  return {
    entityId: args.conversationId,
    entityType: "conversation" as const,
    jobId: args.jobId,
    organizationId: args.organizationId,
    outcome: args.outcome,
    phase: "conversation_refresh" as const,
    reason: args.reason,
    reasonCode: args.reasonCode,
    relatedConversationId: args.conversationId,
  }
}

function buildThreadAuditEntry(args: {
  jobId: Id<"conversationCostBackfillJobs">
  organizationId: string
  outcome: CalculationEntryInput["outcome"]
  phase: CalculationEntryInput["phase"]
  reason?: string
  reasonCode: CalculationEntryInput["reasonCode"]
  relatedConversationId?: Id<"conversations">
  threadId: string
}) {
  return {
    entityId: args.threadId,
    entityType: "thread" as const,
    jobId: args.jobId,
    organizationId: args.organizationId,
    outcome: args.outcome,
    phase: args.phase,
    reason: args.reason,
    reasonCode: args.reasonCode,
    relatedConversationId: args.relatedConversationId,
    threadId: args.threadId,
  }
}

export const getJobForOrganization = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("conversationCostBackfillJobs")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    return getCanonicalJob(jobs)
  },
})

export const getJobById = internalQuery({
  args: {
    jobId: v.id("conversationCostBackfillJobs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId)
  },
})

export const getConversationBatchForOrganization = internalQuery({
  args: {
    batchSize: v.number(),
    cutoffTimestamp: v.optional(v.number()),
    cursor: v.optional(v.string()),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("conversations")
      .withIndex("by_organization_id", (q) =>
        args.cutoffTimestamp === undefined
          ? q.eq("organizationId", args.organizationId)
          : q
              .eq("organizationId", args.organizationId)
              .lte("_creationTime", args.cutoffTimestamp)
      )

    return await query.paginate({
      cursor: args.cursor ?? null,
      numItems: normalizeBatchSize(args.batchSize),
    })
  },
})

export const getOrganizationThreadBatchForSync = internalQuery({
  args: {
    batchSize: v.number(),
    cursor: v.optional(v.string()),
    mode: organizationAiCostJobModeValidator,
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const statuses = getOrganizationThreadSyncStatusesForMode(args.mode)
    const baseQuery = ctx.db
      .query("organizationAiThreads")
      .withIndex("by_organization_and_resolution_type", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("resolutionType", "organization_unassigned")
      )
    const query =
      statuses.length === 1
        ? baseQuery.filter((q) =>
            q.eq(q.field("costSyncStatus"), statuses[0] ?? "failed")
          )
        : baseQuery.filter((q) =>
            q.or(
              q.eq(q.field("costSyncStatus"), statuses[0] ?? "pending"),
              q.eq(q.field("costSyncStatus"), statuses[1] ?? "failed")
            )
          )

    return await query.paginate({
      cursor: args.cursor ?? null,
      numItems: normalizeBatchSize(args.batchSize),
    })
  },
})

export const recordCalculationEntries = internalMutation({
  args: {
    entries: v.array(
      v.object({
        entityId: v.string(),
        entityType: organizationAiCostCalculationEntityTypeValidator,
        jobId: v.optional(v.id("conversationCostBackfillJobs")),
        organizationId: v.string(),
        outcome: organizationAiCostCalculationOutcomeValidator,
        phase: organizationAiCostCalculationPhaseValidator,
        reason: v.optional(v.string()),
        reasonCode: organizationAiCostReasonCodeValidator,
        relatedConversationId: v.optional(v.id("conversations")),
        threadId: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const entry of args.entries) {
      await recordOrganizationAiCostCalculationEntry(ctx, entry)
    }

    return args.entries.length
  },
})

export const startOrResumeJobForOrganization = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    mode: v.optional(organizationAiCostJobModeValidator),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const [jobs, coverage] = await Promise.all([
      ctx.db
        .query("conversationCostBackfillJobs")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
      getOrganizationAiCostCoverage(ctx, args.organizationId),
    ])
    const batchSize = normalizeBatchSize(args.batchSize)
    const mode = args.mode ?? "full"
    const existingJob = getCanonicalJob(jobs)
    const startedAt = Date.now()
    const hasReusableInventory = coverage?.lastFullScanAt !== undefined

    let job: Doc<"conversationCostBackfillJobs"> | null = null

    if (!existingJob) {
      const jobId = await ctx.db.insert("conversationCostBackfillJobs", {
        batchSize,
        cutoffTimestamp: startedAt,
        failed: 0,
        mode,
        organizationId: args.organizationId,
        phase: "thread_inventory",
        processed: 0,
        skipped: 0,
        startedAt,
        status: "running",
        updated: 0,
      })

      job = await ctx.db.get(jobId)
    } else if (existingJob.status === "running") {
      job = existingJob
    } else {
      await ctx.db.patch(
        existingJob._id,
        buildRestartedBackfillJobPatch({
          batchSize,
          hasReusableInventory,
          mode,
          startedAt,
        })
      )

      job = await ctx.db.get(existingJob._id)
    }

    if (job) {
      await markOrganizationAiCostCoverageRunning(ctx, {
        jobId: job._id,
        jobMode: getOrganizationAiCostJobMode(job.mode),
        organizationId: job.organizationId,
        startedAt: job.startedAt,
      })
    }

    return job
  },
})

export const markJobScheduled = internalMutation({
  args: {
    jobId: v.id("conversationCostBackfillJobs"),
    scheduledFunctionId: v.union(v.string(), v.id("_scheduled_functions")),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId)

    if (!job || job.status !== "running") {
      return null
    }

    await ctx.db.patch(job._id, {
      scheduledFunctionId: args.scheduledFunctionId,
    })

    return await ctx.db.get(job._id)
  },
})

export const recordBatchProgress = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    failedDelta: v.number(),
    jobId: v.id("conversationCostBackfillJobs"),
    phase: v.optional(organizationAiCostJobPhaseValidator),
    processedDelta: v.number(),
    scheduledFunctionId: v.optional(
      v.union(v.string(), v.id("_scheduled_functions"))
    ),
    skippedDelta: v.number(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    threadCursor: v.optional(v.string()),
    updatedDelta: v.number(),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId)

    if (!job) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Job de backfill no encontrado",
      })
    }

    const nextPhase = args.phase ?? job.phase
    const jobMode = getOrganizationAiCostJobMode(job.mode)

    await ctx.db.patch(job._id, {
      cursor: args.cursor,
      failed: job.failed + args.failedDelta,
      finishedAt:
        args.status === "completed" || args.status === "failed"
          ? Date.now()
          : undefined,
      lastError: args.lastError,
      phase: nextPhase,
      processed: job.processed + args.processedDelta,
      scheduledFunctionId:
        args.status === "running" ? args.scheduledFunctionId : undefined,
      skipped: job.skipped + args.skippedDelta,
      status: args.status,
      threadCursor: args.threadCursor,
      updated: job.updated + args.updatedDelta,
    })

    if (args.status === "running") {
      await markOrganizationAiCostCoverageRunning(ctx, {
        jobId: job._id,
        jobMode,
        organizationId: job.organizationId,
        startedAt: job.startedAt,
      })
    } else {
      await clearOrganizationAiCostCoverageJob(ctx, {
        hasFullScan:
          job.phase !== "thread_inventory" || nextPhase !== "thread_inventory",
        jobId: job._id,
        jobMode,
        organizationId: job.organizationId,
      })
    }

    return await ctx.db.get(job._id)
  },
})

export const launchOrganizationBackfill = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    mode: v.optional(organizationAiCostJobModeValidator),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.runMutation(startOrResumeJobForOrganizationRef, {
      batchSize: args.batchSize,
      mode: args.mode,
      organizationId: args.organizationId,
    })

    if (!job) {
      return null
    }

    if (job.status === "running" && job.scheduledFunctionId) {
      return job
    }

    const scheduledFunctionId = await ctx.scheduler.runAfter(
      0,
      processOrganizationBatchRef,
      {
        jobId: job._id,
      }
    )

    await ctx.runMutation(markJobScheduledRef, {
      jobId: job._id,
      scheduledFunctionId: scheduledFunctionId as Id<"_scheduled_functions">,
    })

    return await ctx.runQuery(getJobByIdRef, {
      jobId: job._id,
    })
  },
})

export const processOrganizationBatch = internalAction({
  args: {
    jobId: v.id("conversationCostBackfillJobs"),
  },
  handler: async (
    ctx,
    args
  ): Promise<
    | {
        completed: false
        error?: string
        job?: unknown
        reason?: string
      }
    | {
        completed: true
        job: unknown
      }
  > => {
    const job = await ctx.runQuery(getJobByIdRef, {
      jobId: args.jobId,
    })

    if (!job || job.status !== "running") {
      return { completed: false, reason: "No hay job activo" }
    }
    const jobMode = getOrganizationAiCostJobMode(job.mode)

    try {
      let failedDelta = 0
      let processedDelta = 0
      let skippedDelta = 0
      let updatedDelta = 0
      const auditEntries: CalculationEntryInput[] = []

      if ((job.phase ?? "thread_inventory") === "thread_inventory") {
        const threadsPage = await ctx.runQuery(
          components.agent.threads.listThreadsByUserId,
          {
            order: "desc",
            paginationOpts: {
              cursor: job.threadCursor ?? null,
              numItems: job.batchSize,
            },
            userId: job.organizationId,
          }
        )

        for (const thread of threadsPage.page) {
          processedDelta++

          if (isSyntheticThreadId(thread._id)) {
            skippedDelta++
            await ctx.runMutation(registerIgnoredThreadRef, {
              organizationId: job.organizationId,
              threadId: thread._id,
            })
            auditEntries.push(
              buildThreadAuditEntry({
                jobId: job._id,
                organizationId: job.organizationId,
                outcome: "ignored",
                phase: "inventory",
                reason: "Thread sintético ignorado durante el inventario",
                reasonCode: "synthetic_thread",
                threadId: thread._id,
              })
            )
            continue
          }

          try {
            const discovered = await ctx.runMutation(
              discoverOrganizationThreadRef,
              {
                organizationId: job.organizationId,
                threadId: thread._id,
              }
            )

            updatedDelta++
            auditEntries.push(
              buildThreadAuditEntry({
                jobId: job._id,
                organizationId: job.organizationId,
                outcome: "updated",
                phase: "inventory",
                reason: "Thread inventariado para la organización",
                reasonCode:
                  discovered?.resolutionReasonCode ??
                  "unassigned_legacy_orphan",
                threadId: thread._id,
              }),
              buildThreadAuditEntry({
                jobId: job._id,
                organizationId: job.organizationId,
                outcome:
                  discovered?.resolutionType === "ignored"
                    ? "ignored"
                    : "updated",
                phase: "resolution",
                reason: discovered?.resolutionReason,
                reasonCode:
                  discovered?.resolutionReasonCode ??
                  "unassigned_legacy_orphan",
                relatedConversationId: discovered?.resolvedConversationId,
                threadId: thread._id,
              })
            )
          } catch (error) {
            failedDelta++
            const reason = getErrorMessage(error)
            await ctx.runMutation(markThreadResolutionFailureRef, {
              organizationId: job.organizationId,
              reason,
              threadId: thread._id,
            })
            auditEntries.push(
              buildThreadAuditEntry({
                jobId: job._id,
                organizationId: job.organizationId,
                outcome: "failed",
                phase: "resolution",
                reason,
                reasonCode: "unexpected_error",
                threadId: thread._id,
              })
            )
          }
        }

        if (auditEntries.length > 0) {
          await ctx.runMutation(recordCalculationEntriesRef, {
            entries: auditEntries,
          })
        }

        if (threadsPage.isDone) {
          const scheduledFunctionId = await ctx.scheduler.runAfter(
            0,
            processOrganizationBatchRef,
            {
              jobId: job._id,
            }
          )

          const updatedJob = await ctx.runMutation(recordBatchProgressRef, {
            cursor: undefined,
            failedDelta,
            jobId: job._id,
            lastError: undefined,
            phase: "conversation_backfill",
            processedDelta,
            scheduledFunctionId:
              scheduledFunctionId as Id<"_scheduled_functions">,
            skippedDelta,
            status: "running",
            threadCursor: undefined,
            updatedDelta,
          })

          return {
            completed: false,
            job: updatedJob,
          }
        }

        const scheduledFunctionId = await ctx.scheduler.runAfter(
          0,
          processOrganizationBatchRef,
          {
            jobId: job._id,
          }
        )

        const updatedJob = await ctx.runMutation(recordBatchProgressRef, {
          cursor: undefined,
          failedDelta,
          jobId: job._id,
          lastError: undefined,
          phase: "thread_inventory",
          processedDelta,
          scheduledFunctionId:
            scheduledFunctionId as Id<"_scheduled_functions">,
          skippedDelta,
          status: "running",
          threadCursor: threadsPage.continueCursor ?? undefined,
          updatedDelta,
        })

        return {
          completed: false,
          job: updatedJob,
        }
      }

      if (job.phase === "conversation_backfill") {
        const batch = await ctx.runQuery(
          getConversationBatchForOrganizationRef,
          {
            batchSize: job.batchSize,
            cutoffTimestamp: job.cutoffTimestamp,
            cursor: job.cursor,
            organizationId: job.organizationId,
          }
        )

        for (const conversation of batch.page) {
          processedDelta++

          if (isSyntheticThreadId(conversation.threadId)) {
            skippedDelta++
            auditEntries.push(
              buildConversationAuditEntry({
                conversationId: conversation._id,
                jobId: job._id,
                organizationId: job.organizationId,
                outcome: "ignored",
                reason: "Conversación con thread sintético ignorada",
                reasonCode: "synthetic_thread",
              })
            )
            continue
          }

          if (
            shouldSkipConversationBackfill({
              aiCostLastSyncFailedAt: conversation.aiCostLastSyncFailedAt,
              aiCostLedgerSyncedAt: conversation.aiCostLedgerSyncedAt,
              mode: jobMode,
            })
          ) {
            skippedDelta++
            auditEntries.push(
              buildConversationAuditEntry({
                conversationId: conversation._id,
                jobId: job._id,
                organizationId: job.organizationId,
                outcome: "skipped",
                reason:
                  jobMode === "failed_only"
                    ? "La conversación no tiene fallos pendientes"
                    : "La conversación ya estaba sincronizada en ledger",
                reasonCode: "already_synced",
              })
            )
            continue
          }

          try {
            const result = await ctx.runMutation(
              backfillHistoricalConversationCostRef,
              {
                conversationId: conversation._id,
              }
            )

            if (result?.syncStatus === "skipped_due_to_fetch_failure") {
              failedDelta++
              auditEntries.push(
                buildConversationAuditEntry({
                  conversationId: conversation._id,
                  jobId: job._id,
                  organizationId: job.organizationId,
                  outcome: "failed",
                  reason: "Falló la lectura completa de uno o más threads",
                  reasonCode: "message_fetch_incomplete",
                }),
                ...result.failedThreads.map(
                  (failedThread: ConversationCostThreadFailure) =>
                    buildThreadAuditEntry({
                      jobId: job._id,
                      organizationId: job.organizationId,
                      outcome: "failed",
                      phase: "cost_sync",
                      reason: failedThread.reason,
                      reasonCode: "message_fetch_incomplete",
                      relatedConversationId: conversation._id,
                      threadId: failedThread.threadId,
                    })
                )
              )
              continue
            }

            updatedDelta++
            auditEntries.push(
              buildConversationAuditEntry({
                conversationId: conversation._id,
                jobId: job._id,
                organizationId: job.organizationId,
                outcome: "updated",
                reason: "Conversación sincronizada desde sus threads asignados",
                reasonCode: "mapped_to_conversation",
              })
            )
          } catch (error) {
            failedDelta++
            auditEntries.push(
              buildConversationAuditEntry({
                conversationId: conversation._id,
                jobId: job._id,
                organizationId: job.organizationId,
                outcome: "failed",
                reason: getErrorMessage(error),
                reasonCode: "unexpected_error",
              })
            )
          }
        }

        if (auditEntries.length > 0) {
          await ctx.runMutation(recordCalculationEntriesRef, {
            entries: auditEntries,
          })
        }

        if (batch.isDone) {
          const scheduledFunctionId = await ctx.scheduler.runAfter(
            0,
            processOrganizationBatchRef,
            {
              jobId: job._id,
            }
          )

          const updatedJob = await ctx.runMutation(recordBatchProgressRef, {
            cursor: undefined,
            failedDelta,
            jobId: job._id,
            lastError: undefined,
            phase: "organization_thread_backfill",
            processedDelta,
            scheduledFunctionId:
              scheduledFunctionId as Id<"_scheduled_functions">,
            skippedDelta,
            status: "running",
            threadCursor: undefined,
            updatedDelta,
          })

          return {
            completed: false,
            job: updatedJob,
          }
        }

        const scheduledFunctionId = await ctx.scheduler.runAfter(
          0,
          processOrganizationBatchRef,
          {
            jobId: job._id,
          }
        )

        const updatedJob = await ctx.runMutation(recordBatchProgressRef, {
          cursor: batch.continueCursor ?? undefined,
          failedDelta,
          jobId: job._id,
          lastError: undefined,
          phase: "conversation_backfill",
          processedDelta,
          scheduledFunctionId:
            scheduledFunctionId as Id<"_scheduled_functions">,
          skippedDelta,
          status: "running",
          threadCursor: job.threadCursor,
          updatedDelta,
        })

        return {
          completed: false,
          job: updatedJob,
        }
      }

      const threadsPage = await ctx.runQuery(
        getOrganizationThreadBatchForSyncRef,
        {
          batchSize: job.batchSize,
          cursor: job.threadCursor,
          mode: jobMode,
          organizationId: job.organizationId,
        }
      )

      for (const thread of threadsPage.page) {
        processedDelta++

        try {
          const result = await ctx.runMutation(
            refreshOrganizationThreadCostRef,
            {
              organizationId: job.organizationId,
              threadId: thread.threadId,
            }
          )

          if (result?.skipped) {
            skippedDelta++
            auditEntries.push(
              buildThreadAuditEntry({
                jobId: job._id,
                organizationId: job.organizationId,
                outcome: "skipped",
                phase: "cost_sync",
                reason:
                  "El thread quedó asignado a conversación y no se sincroniza como unassigned",
                reasonCode: "mapped_to_conversation",
                relatedConversationId: thread.resolvedConversationId,
                threadId: thread.threadId,
              })
            )
            continue
          }

          if (result?.syncStatus === "skipped_due_to_fetch_failure") {
            failedDelta++
            auditEntries.push(
              buildThreadAuditEntry({
                jobId: job._id,
                organizationId: job.organizationId,
                outcome: "failed",
                phase: "cost_sync",
                reason: "Falló la lectura completa del thread",
                reasonCode: "message_fetch_incomplete",
                threadId: thread.threadId,
              })
            )
            continue
          }

          updatedDelta++
          auditEntries.push(
            buildThreadAuditEntry({
              jobId: job._id,
              organizationId: job.organizationId,
              outcome: "updated",
              phase: "cost_sync",
              reason: "Thread no asignado sincronizado al ledger",
              reasonCode:
                thread.resolutionReasonCode ?? "unassigned_legacy_orphan",
              threadId: thread.threadId,
            })
          )
        } catch (error) {
          failedDelta++
          auditEntries.push(
            buildThreadAuditEntry({
              jobId: job._id,
              organizationId: job.organizationId,
              outcome: "failed",
              phase: "cost_sync",
              reason: getErrorMessage(error),
              reasonCode: "unexpected_error",
              threadId: thread.threadId,
            })
          )
        }
      }

      if (auditEntries.length > 0) {
        await ctx.runMutation(recordCalculationEntriesRef, {
          entries: auditEntries,
        })
      }

      if (threadsPage.isDone) {
        const updatedJob = await ctx.runMutation(recordBatchProgressRef, {
          cursor: undefined,
          failedDelta,
          jobId: job._id,
          lastError: undefined,
          phase: "organization_thread_backfill",
          processedDelta,
          skippedDelta,
          status: "completed",
          threadCursor: threadsPage.continueCursor ?? undefined,
          updatedDelta,
        })

        return {
          completed: true,
          job: updatedJob,
        }
      }

      const scheduledFunctionId = await ctx.scheduler.runAfter(
        0,
        processOrganizationBatchRef,
        {
          jobId: job._id,
        }
      )

      const updatedJob = await ctx.runMutation(recordBatchProgressRef, {
        cursor: undefined,
        failedDelta,
        jobId: job._id,
        lastError: undefined,
        phase: "organization_thread_backfill",
        processedDelta,
        scheduledFunctionId: scheduledFunctionId as Id<"_scheduled_functions">,
        skippedDelta,
        status: "running",
        threadCursor: threadsPage.continueCursor ?? undefined,
        updatedDelta,
      })

      return {
        completed: false,
        job: updatedJob,
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error)

      const failedJob = await ctx.runMutation(recordBatchProgressRef, {
        cursor: job.cursor,
        failedDelta: 0,
        jobId: job._id,
        lastError: errorMessage,
        phase: job.phase,
        processedDelta: 0,
        skippedDelta: 0,
        status: "failed",
        threadCursor: job.threadCursor,
        updatedDelta: 0,
      })

      return {
        completed: false,
        error: errorMessage,
        job: failedJob,
      }
    }
  },
})
