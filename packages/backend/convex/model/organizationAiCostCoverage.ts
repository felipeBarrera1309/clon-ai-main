import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import type {
  OrganizationAiCostCalculationEntityType,
  OrganizationAiCostCalculationOutcome,
  OrganizationAiCostCalculationPhase,
  OrganizationAiCostCoverageStatus,
  OrganizationAiCostJobMode,
  OrganizationAiCostReasonCode,
} from "../lib/aiCostDomain"
import {
  getOrganizationAiThreadCostSyncStatus,
  getOrganizationAiThreadResolutionStatus,
  getOrganizationAiThreadResolutionType,
} from "../lib/organizationAiCostState"

type AnyCtx = MutationCtx | QueryCtx

export type OrganizationAiCostCoverageCounts = {
  threadsCostFailed: number
  threadsCostPending: number
  threadsCostSynced: number
  threadsDiscovered: number
  threadsFailed: number
  threadsFailedResolution: number
  threadsIgnored: number
  threadsPending: number
  threadsPendingResolution: number
  threadsRelevant: number
  threadsResolvedConversation: number
  threadsResolvedUnassigned: number
}

function createEmptyCoverageCounts(): OrganizationAiCostCoverageCounts {
  return {
    threadsCostFailed: 0,
    threadsCostPending: 0,
    threadsCostSynced: 0,
    threadsDiscovered: 0,
    threadsFailed: 0,
    threadsFailedResolution: 0,
    threadsIgnored: 0,
    threadsPending: 0,
    threadsPendingResolution: 0,
    threadsRelevant: 0,
    threadsResolvedConversation: 0,
    threadsResolvedUnassigned: 0,
  }
}

export function buildOrganizationAiCostCoverageCounts(
  threads: Array<
    Pick<
      Doc<"organizationAiThreads">,
      | "assignmentType"
      | "costSyncStatus"
      | "lastLedgerSyncFailedAt"
      | "lastLedgerSyncedAt"
      | "resolutionStatus"
      | "resolutionType"
    >
  >
): OrganizationAiCostCoverageCounts {
  const counts = createEmptyCoverageCounts()

  for (const thread of threads) {
    const resolutionType = getOrganizationAiThreadResolutionType(thread)
    const resolutionStatus = getOrganizationAiThreadResolutionStatus(thread)
    const costSyncStatus = getOrganizationAiThreadCostSyncStatus(thread)

    counts.threadsDiscovered += 1

    if (resolutionType === "ignored") {
      counts.threadsIgnored += 1
      continue
    }

    counts.threadsRelevant += 1

    if (resolutionStatus === "pending") {
      counts.threadsPendingResolution += 1
      counts.threadsPending += 1
      continue
    }

    if (resolutionStatus === "failed") {
      counts.threadsFailedResolution += 1
      counts.threadsFailed += 1
      continue
    }

    if (resolutionType === "conversation") {
      counts.threadsResolvedConversation += 1
    } else if (resolutionType === "organization_unassigned") {
      counts.threadsResolvedUnassigned += 1
    }

    if (costSyncStatus === "synced") {
      counts.threadsCostSynced += 1
      continue
    }

    if (costSyncStatus === "failed") {
      counts.threadsCostFailed += 1
      counts.threadsFailed += 1
      continue
    }

    if (costSyncStatus === "pending") {
      counts.threadsCostPending += 1
      counts.threadsPending += 1
    }
  }

  return counts
}

export function deriveOrganizationAiCostCoverageStatus(args: {
  counts: OrganizationAiCostCoverageCounts
  hasFullScan: boolean
  isRunning: boolean
}): OrganizationAiCostCoverageStatus {
  if (args.isRunning) {
    return "running"
  }

  if (!args.hasFullScan) {
    return args.counts.threadsDiscovered === 0 ? "not_started" : "partial"
  }

  if (args.counts.threadsPending > 0 || args.counts.threadsFailed > 0) {
    return "partial"
  }

  return "complete"
}

export async function getOrganizationAiCostCoverage(
  ctx: AnyCtx,
  organizationId: string
) {
  const rows = await ctx.db
    .query("organizationAiCostCoverage")
    .withIndex("by_organization_id", (q) =>
      q.eq("organizationId", organizationId)
    )
    .collect()

  return rows[0] ?? null
}

export async function rebuildOrganizationAiCostCoverage(
  ctx: MutationCtx,
  args: {
    activeJobId?: Id<"conversationCostBackfillJobs">
    clearActiveJob?: boolean
    hasFullScan?: boolean
    jobMode?: OrganizationAiCostJobMode
    jobStartedAt?: number
    organizationId: string
  }
) {
  const [existing, threads] = await Promise.all([
    getOrganizationAiCostCoverage(ctx, args.organizationId),
    ctx.db
      .query("organizationAiThreads")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect(),
  ])
  const counts = buildOrganizationAiCostCoverageCounts(threads)
  const hasFullScan = args.hasFullScan ?? existing?.lastFullScanAt !== undefined
  const activeJobId = args.clearActiveJob
    ? undefined
    : (args.activeJobId ?? existing?.activeJobId)
  const status = deriveOrganizationAiCostCoverageStatus({
    counts,
    hasFullScan,
    isRunning: activeJobId !== undefined,
  })
  const now = Date.now()

  const patch = {
    activeJobId,
    lastCompletedAt: status === "complete" ? now : existing?.lastCompletedAt,
    lastFullScanAt: args.hasFullScan === true ? now : existing?.lastFullScanAt,
    lastJobId: args.activeJobId ?? existing?.lastJobId,
    lastJobMode: args.jobMode ?? existing?.lastJobMode,
    lastStartedAt: args.jobStartedAt ?? existing?.lastStartedAt,
    lastUpdatedAt: now,
    organizationId: args.organizationId,
    status,
    threadsCostFailed: counts.threadsCostFailed,
    threadsCostPending: counts.threadsCostPending,
    threadsCostSynced: counts.threadsCostSynced,
    threadsDiscovered: counts.threadsDiscovered,
    threadsFailed: counts.threadsFailed,
    threadsFailedResolution: counts.threadsFailedResolution,
    threadsIgnored: counts.threadsIgnored,
    threadsPending: counts.threadsPending,
    threadsPendingResolution: counts.threadsPendingResolution,
    threadsRelevant: counts.threadsRelevant,
    threadsResolvedConversation: counts.threadsResolvedConversation,
    threadsResolvedUnassigned: counts.threadsResolvedUnassigned,
  } satisfies Omit<Doc<"organizationAiCostCoverage">, "_creationTime" | "_id">

  if (existing) {
    await ctx.db.patch(existing._id, patch)
    return await ctx.db.get(existing._id)
  }

  const coverageId = await ctx.db.insert("organizationAiCostCoverage", patch)
  return await ctx.db.get(coverageId)
}

export async function markOrganizationAiCostCoverageRunning(
  ctx: MutationCtx,
  args: {
    jobId: Id<"conversationCostBackfillJobs">
    jobMode: OrganizationAiCostJobMode
    organizationId: string
    startedAt: number
  }
) {
  return await rebuildOrganizationAiCostCoverage(ctx, {
    activeJobId: args.jobId,
    jobMode: args.jobMode,
    jobStartedAt: args.startedAt,
    organizationId: args.organizationId,
  })
}

export async function clearOrganizationAiCostCoverageJob(
  ctx: MutationCtx,
  args: {
    hasFullScan?: boolean
    jobId: Id<"conversationCostBackfillJobs">
    jobMode: OrganizationAiCostJobMode
    organizationId: string
  }
) {
  const existing = await getOrganizationAiCostCoverage(ctx, args.organizationId)

  if (!existing || existing.activeJobId !== args.jobId) {
    return await rebuildOrganizationAiCostCoverage(ctx, {
      hasFullScan: args.hasFullScan,
      jobMode: args.jobMode,
      organizationId: args.organizationId,
    })
  }

  return await rebuildOrganizationAiCostCoverage(ctx, {
    clearActiveJob: true,
    hasFullScan: args.hasFullScan,
    jobMode: args.jobMode,
    organizationId: args.organizationId,
  })
}

export async function recordOrganizationAiCostCalculationEntry(
  ctx: MutationCtx,
  args: {
    entityId: string
    entityType: OrganizationAiCostCalculationEntityType
    jobId?: Id<"conversationCostBackfillJobs">
    organizationId: string
    outcome: OrganizationAiCostCalculationOutcome
    phase: OrganizationAiCostCalculationPhase
    reason?: string
    reasonCode: OrganizationAiCostReasonCode
    relatedConversationId?: Id<"conversations">
    threadId?: string
  }
) {
  const entryId = await ctx.db.insert("organizationAiCostCalculationEntries", {
    createdAt: Date.now(),
    entityId: args.entityId,
    entityType: args.entityType,
    jobId: args.jobId,
    organizationId: args.organizationId,
    outcome: args.outcome,
    phase: args.phase,
    reason: args.reason,
    reasonCode: args.reasonCode,
    relatedConversationId: args.relatedConversationId,
    threadId: args.threadId,
  })

  return await ctx.db.get(entryId)
}
