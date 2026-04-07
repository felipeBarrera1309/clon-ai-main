import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import type {
  OrganizationAiCostReasonCode,
  OrganizationAiCostResolutionStatus,
  OrganizationAiCostResolutionType,
  OrganizationAiCostSyncStatus,
} from "../lib/aiCostDomain"
import {
  getOrganizationAiThreadCostSyncStatus,
  getOrganizationAiThreadResolutionStatus,
  getOrganizationAiThreadResolutionType,
  getOrganizationAiThreadResolvedConversationId,
} from "../lib/organizationAiCostState"
import {
  getOrganizationAiCostCoverage,
  rebuildOrganizationAiCostCoverage,
} from "./organizationAiCostCoverage"

export type OrganizationAiThreadAssignmentType =
  | "conversation"
  | "organization_unassigned"

export type OrganizationAiThreadKind = "primary" | "auxiliary" | "standalone"

export type OrganizationAiThreadPurpose =
  | "support-agent"
  | "menu-context"
  | "combination-enrichment"
  | "combination-validation"
  | "debug-agent"
  | "combo-builder"
  | "unknown"

type OrganizationAiThreadPatch = {
  assignmentType: OrganizationAiThreadAssignmentType
  conversationId?: Id<"conversations">
  costSyncStatus?: OrganizationAiCostSyncStatus
  kind: OrganizationAiThreadKind
  lastCostSyncReason?: string
  lastCostSyncReasonCode?: OrganizationAiCostReasonCode
  lastLedgerSyncedAt?: number
  organizationId: string
  purpose: OrganizationAiThreadPurpose
  resolutionReason?: string
  resolutionReasonCode?: OrganizationAiCostReasonCode
  resolutionStatus?: OrganizationAiCostResolutionStatus
  resolutionType?: OrganizationAiCostResolutionType
  threadId: string
}

function shouldReplacePurpose(
  current: OrganizationAiThreadPurpose,
  next: OrganizationAiThreadPurpose
) {
  if (current === "unknown" && next !== "unknown") {
    return true
  }

  return current !== next && next === "support-agent"
}

function getDefaultResolutionType(
  args: Pick<OrganizationAiThreadPatch, "assignmentType" | "resolutionType">
): OrganizationAiCostResolutionType {
  return args.resolutionType ?? args.assignmentType
}

function getDefaultResolutionStatus(
  args: Pick<OrganizationAiThreadPatch, "resolutionStatus">
): OrganizationAiCostResolutionStatus {
  return args.resolutionStatus ?? "resolved"
}

async function rebuildOrganizationAiCostCoverageWhenIdle(
  ctx: MutationCtx,
  organizationId: string
) {
  const coverage = await getOrganizationAiCostCoverage(ctx, organizationId)

  if (coverage?.activeJobId) {
    return coverage
  }

  return await rebuildOrganizationAiCostCoverage(ctx, {
    organizationId,
  })
}

async function markConversationAiCostStale(
  ctx: MutationCtx,
  conversationId: Id<"conversations"> | undefined
) {
  if (!conversationId) {
    return
  }

  const conversation = await ctx.db.get(conversationId)

  if (!conversation || conversation.aiCostLedgerSyncedAt === undefined) {
    return
  }

  await ctx.db.patch(conversationId, {
    aiCostLedgerSyncedAt: undefined,
  })
}

export async function getOrganizationAiThreadByThreadId(
  ctx: QueryCtx | MutationCtx,
  args: {
    threadId: string
  }
): Promise<Doc<"organizationAiThreads"> | null> {
  return await ctx.db
    .query("organizationAiThreads")
    .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
    .unique()
}

export async function registerOrganizationAiThread(
  ctx: MutationCtx,
  args: OrganizationAiThreadPatch
) {
  const now = Date.now()
  const existing = await getOrganizationAiThreadByThreadId(ctx, {
    threadId: args.threadId,
  })
  const nextResolutionType = getDefaultResolutionType(args)
  const nextResolutionStatus = getDefaultResolutionStatus(args)
  const nextResolvedConversationId =
    nextResolutionType === "conversation" ? args.conversationId : undefined
  const shouldMarkNextConversationStale =
    nextResolutionType === "conversation" &&
    nextResolvedConversationId !== undefined &&
    args.lastLedgerSyncedAt === undefined &&
    args.costSyncStatus !== "synced"

  if (!existing) {
    const costSyncStatus =
      args.costSyncStatus ??
      (nextResolutionType === "ignored"
        ? "ignored"
        : args.lastLedgerSyncedAt !== undefined
          ? "synced"
          : "pending")

    const threadId = await ctx.db.insert("organizationAiThreads", {
      assignmentType:
        nextResolutionType === "conversation"
          ? "conversation"
          : "organization_unassigned",
      conversationId: args.conversationId,
      costSyncStatus,
      costSyncUpdatedAt: now,
      discoveredAt: now,
      kind: args.kind,
      lastCostSyncReason: args.lastCostSyncReason,
      lastCostSyncReasonCode: args.lastCostSyncReasonCode,
      lastLedgerSyncError: args.lastCostSyncReason,
      lastLedgerSyncFailedAt: costSyncStatus === "failed" ? now : undefined,
      lastLedgerSyncedAt: args.lastLedgerSyncedAt,
      lastSeenAt: now,
      organizationId: args.organizationId,
      purpose: args.purpose,
      resolutionReason: args.resolutionReason,
      resolutionReasonCode: args.resolutionReasonCode,
      resolutionStatus: nextResolutionStatus,
      resolutionType: nextResolutionType,
      resolutionUpdatedAt: now,
      resolvedConversationId: nextResolvedConversationId,
      threadId: args.threadId,
    })

    const thread = await ctx.db.get(threadId)

    if (shouldMarkNextConversationStale) {
      await markConversationAiCostStale(ctx, nextResolvedConversationId)
    }

    await rebuildOrganizationAiCostCoverageWhenIdle(ctx, args.organizationId)
    return thread
  }

  const existingResolutionType = getOrganizationAiThreadResolutionType(existing)
  const existingResolutionStatus =
    getOrganizationAiThreadResolutionStatus(existing)
  const existingResolvedConversationId =
    getOrganizationAiThreadResolvedConversationId(existing)
  const existingCostSyncStatus = getOrganizationAiThreadCostSyncStatus(existing)
  const resolutionChanged =
    existingResolutionType !== nextResolutionType ||
    existingResolvedConversationId !== nextResolvedConversationId ||
    existingResolutionStatus !== nextResolutionStatus

  let nextCostSyncStatus =
    args.costSyncStatus ??
    (nextResolutionType === "ignored"
      ? "ignored"
      : resolutionChanged
        ? "pending"
        : existingCostSyncStatus)

  if (
    existingCostSyncStatus === "ignored" &&
    nextResolutionType !== "ignored" &&
    args.costSyncStatus === undefined
  ) {
    nextCostSyncStatus = "pending"
  }

  const previousConversationId =
    existingResolutionType === "conversation"
      ? existingResolvedConversationId
      : undefined
  const shouldMarkPreviousConversationStale =
    previousConversationId !== undefined &&
    previousConversationId !== nextResolvedConversationId
  const shouldMarkCurrentConversationStale =
    nextResolutionType === "conversation" &&
    nextResolvedConversationId !== undefined &&
    nextCostSyncStatus !== "synced"

  const patch: Partial<Doc<"organizationAiThreads">> = {
    assignmentType:
      nextResolutionType === "conversation" ||
      existing.assignmentType === "conversation"
        ? "conversation"
        : "organization_unassigned",
    conversationId:
      nextResolutionType === "conversation"
        ? (args.conversationId ?? existing.conversationId)
        : existing.conversationId,
    costSyncStatus: nextCostSyncStatus,
    costSyncUpdatedAt: now,
    kind:
      existing.kind === "standalone" && args.kind !== "standalone"
        ? args.kind
        : existing.kind,
    lastSeenAt: now,
    organizationId: args.organizationId,
    resolutionStatus: nextResolutionStatus,
    resolutionType: nextResolutionType,
    resolutionUpdatedAt: now,
    resolvedConversationId:
      nextResolutionType === "conversation"
        ? (nextResolvedConversationId ?? existing.resolvedConversationId)
        : undefined,
  }

  if (shouldReplacePurpose(existing.purpose, args.purpose)) {
    patch.purpose = args.purpose
  } else if (existing.purpose === args.purpose) {
    patch.purpose = existing.purpose
  }

  if (args.resolutionReasonCode !== undefined || resolutionChanged) {
    patch.resolutionReasonCode = args.resolutionReasonCode
  }

  if (args.resolutionReason !== undefined || resolutionChanged) {
    patch.resolutionReason = args.resolutionReason
  }

  if (args.lastLedgerSyncedAt !== undefined) {
    patch.lastLedgerSyncedAt = args.lastLedgerSyncedAt
    patch.lastCostSyncReason = undefined
    patch.lastCostSyncReasonCode = undefined
    patch.lastLedgerSyncError = undefined
    patch.lastLedgerSyncFailedAt = undefined
  } else if (nextCostSyncStatus === "ignored") {
    patch.lastCostSyncReason = undefined
    patch.lastCostSyncReasonCode = undefined
    patch.lastLedgerSyncError = undefined
    patch.lastLedgerSyncFailedAt = undefined
    patch.lastLedgerSyncedAt = undefined
  } else if (resolutionChanged) {
    patch.lastCostSyncReason = undefined
    patch.lastCostSyncReasonCode = undefined
    patch.lastLedgerSyncError = undefined
    patch.lastLedgerSyncFailedAt = undefined
    patch.lastLedgerSyncedAt = undefined
  }

  if (args.lastCostSyncReasonCode !== undefined) {
    patch.lastCostSyncReasonCode = args.lastCostSyncReasonCode
  }

  if (args.lastCostSyncReason !== undefined) {
    patch.lastCostSyncReason = args.lastCostSyncReason
    patch.lastLedgerSyncError = args.lastCostSyncReason
    patch.lastLedgerSyncFailedAt =
      nextCostSyncStatus === "failed" ? now : undefined
  }

  await ctx.db.patch(existing._id, patch)
  const thread = await ctx.db.get(existing._id)

  if (shouldMarkPreviousConversationStale) {
    await markConversationAiCostStale(ctx, previousConversationId)
  }

  if (shouldMarkCurrentConversationStale) {
    await markConversationAiCostStale(ctx, nextResolvedConversationId)
  }

  await rebuildOrganizationAiCostCoverageWhenIdle(ctx, args.organizationId)
  return thread
}

export async function markOrganizationAiThreadResolutionFailed(
  ctx: MutationCtx,
  args: {
    failedAt?: number
    kind?: OrganizationAiThreadKind
    organizationId: string
    purpose?: OrganizationAiThreadPurpose
    reason: string
    reasonCode: OrganizationAiCostReasonCode
    threadId: string
  }
) {
  return await registerOrganizationAiThread(ctx, {
    assignmentType: "organization_unassigned",
    costSyncStatus: "pending",
    kind: args.kind ?? "standalone",
    organizationId: args.organizationId,
    purpose: args.purpose ?? "unknown",
    resolutionReason: args.reason,
    resolutionReasonCode: args.reasonCode,
    resolutionStatus: "failed",
    resolutionType: "organization_unassigned",
    threadId: args.threadId,
  })
}

export async function markOrganizationAiThreadLedgerSynced(
  ctx: MutationCtx,
  args: {
    costUsd?: number
    messagesWithCost?: number
    organizationId: string
    syncedAt?: number
    threadId: string
  }
) {
  const existing = await getOrganizationAiThreadByThreadId(ctx, {
    threadId: args.threadId,
  })

  if (!existing || existing.organizationId !== args.organizationId) {
    return null
  }

  await ctx.db.patch(existing._id, {
    costSyncStatus:
      getOrganizationAiThreadResolutionType(existing) === "ignored"
        ? "ignored"
        : "synced",
    costSyncUpdatedAt: Date.now(),
    costUsd: args.costUsd,
    lastCostSyncReason: undefined,
    lastCostSyncReasonCode: undefined,
    lastLedgerSyncError: undefined,
    lastLedgerSyncFailedAt: undefined,
    lastLedgerSyncedAt: args.syncedAt ?? Date.now(),
    lastSeenAt: Date.now(),
    messagesWithCost: args.messagesWithCost,
  })

  const thread = await ctx.db.get(existing._id)
  await rebuildOrganizationAiCostCoverageWhenIdle(ctx, args.organizationId)
  return thread
}

export async function markOrganizationAiThreadLedgerSyncFailed(
  ctx: MutationCtx,
  args: {
    failedAt?: number
    organizationId: string
    reason: string
    reasonCode: OrganizationAiCostReasonCode
    threadId: string
  }
) {
  const existing = await getOrganizationAiThreadByThreadId(ctx, {
    threadId: args.threadId,
  })

  if (!existing || existing.organizationId !== args.organizationId) {
    return null
  }

  const failedAt = args.failedAt ?? Date.now()

  await ctx.db.patch(existing._id, {
    costSyncStatus:
      getOrganizationAiThreadResolutionType(existing) === "ignored"
        ? "ignored"
        : "failed",
    costSyncUpdatedAt: failedAt,
    lastCostSyncReason: args.reason,
    lastCostSyncReasonCode: args.reasonCode,
    lastLedgerSyncError: args.reason,
    lastLedgerSyncFailedAt: failedAt,
    lastSeenAt: failedAt,
  })

  const thread = await ctx.db.get(existing._id)
  await rebuildOrganizationAiCostCoverageWhenIdle(ctx, args.organizationId)
  return thread
}

export async function listOrganizationAiThreads(
  ctx: QueryCtx | MutationCtx,
  args: {
    assignmentType?: OrganizationAiThreadAssignmentType
    organizationId: string
    resolutionType?: OrganizationAiCostResolutionType
  }
) {
  let rows: Doc<"organizationAiThreads">[]
  const assignmentType = args.assignmentType

  if (assignmentType) {
    rows = await ctx.db
      .query("organizationAiThreads")
      .withIndex("by_organization_and_assignment", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("assignmentType", assignmentType)
      )
      .collect()
  } else {
    rows = await ctx.db
      .query("organizationAiThreads")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
  }

  if (args.resolutionType) {
    rows = rows.filter(
      (thread) =>
        getOrganizationAiThreadResolutionType(thread) === args.resolutionType
    )
  }

  return assignmentType
    ? rows.filter(
        (thread) => getOrganizationAiThreadResolutionType(thread) !== "ignored"
      )
    : rows
}

export async function resolveConversationAssignmentForThread(
  ctx: QueryCtx | MutationCtx,
  args: {
    organizationId: string
    threadId: string
  }
): Promise<{
  assignmentType: OrganizationAiThreadAssignmentType
  conversationId?: Id<"conversations">
  kind: OrganizationAiThreadKind
  purpose: OrganizationAiThreadPurpose
  resolutionReason: string
  resolutionReasonCode: OrganizationAiCostReasonCode
  resolutionType: OrganizationAiCostResolutionType
}> {
  const primaryConversation = await ctx.db
    .query("conversations")
    .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
    .unique()

  if (
    primaryConversation &&
    primaryConversation.organizationId === args.organizationId
  ) {
    return {
      assignmentType: "conversation",
      conversationId: primaryConversation._id,
      kind: "primary",
      purpose: "support-agent",
      resolutionReason: "Thread principal mapeado a la conversación",
      resolutionReasonCode: "mapped_to_conversation",
      resolutionType: "conversation",
    }
  }

  const conversationThread = await ctx.db
    .query("conversationAiThreads")
    .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
    .unique()

  if (
    conversationThread &&
    conversationThread.organizationId === args.organizationId
  ) {
    return {
      assignmentType: "conversation",
      conversationId: conversationThread.conversationId,
      kind: conversationThread.kind,
      purpose: conversationThread.purpose,
      resolutionReason: "Thread auxiliar mapeado a la conversación",
      resolutionReasonCode: "mapped_to_conversation",
      resolutionType: "conversation",
    }
  }

  const debugThread = await ctx.db
    .query("debugAgentConversations")
    .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
    .unique()

  if (debugThread && debugThread.organizationId === args.organizationId) {
    return {
      assignmentType: "organization_unassigned",
      kind: "standalone",
      purpose: "debug-agent",
      resolutionReason:
        "Thread de debug agent perteneciente a la organización sin conversación asociada",
      resolutionReasonCode: "standalone_debug_agent",
      resolutionType: "organization_unassigned",
    }
  }

  const comboThread = await ctx.db
    .query("comboBuilderConversations")
    .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
    .unique()

  if (comboThread && comboThread.organizationId === args.organizationId) {
    return {
      assignmentType: "organization_unassigned",
      kind: "standalone",
      purpose: "combo-builder",
      resolutionReason:
        "Thread de combo builder perteneciente a la organización sin conversación asociada",
      resolutionReasonCode: "standalone_combo_builder",
      resolutionType: "organization_unassigned",
    }
  }

  return {
    assignmentType: "organization_unassigned",
    kind: "standalone",
    purpose: "unknown",
    resolutionReason:
      "Thread histórico de la organización sin mapeo fiable a una conversación",
    resolutionReasonCode: "unassigned_legacy_orphan",
    resolutionType: "organization_unassigned",
  }
}
