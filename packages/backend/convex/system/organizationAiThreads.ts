import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery } from "../_generated/server"
import { syncAiCostEventsForThread } from "../lib/aiCostLedger"
import {
  type ConversationCostThreadRef,
  fetchAiThreadCostBreakdown,
} from "../lib/conversationCost"
import {
  getOrganizationAiThreadByThreadId,
  listOrganizationAiThreads,
  markOrganizationAiThreadLedgerSyncFailed,
  markOrganizationAiThreadResolutionFailed,
  registerOrganizationAiThread,
  resolveConversationAssignmentForThread,
} from "../model/organizationAiThreads"

function formatFailedThreadSyncReason(
  failedThreads: Array<{
    purpose: string
    reason: string
    threadId: string
  }>
) {
  return failedThreads
    .map(
      (failedThread) =>
        `${failedThread.threadId} (${failedThread.purpose}): ${failedThread.reason}`
    )
    .join("; ")
}

export const getByThreadId = internalQuery({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    return await getOrganizationAiThreadByThreadId(ctx, args)
  },
})

export const listByOrganization = internalQuery({
  args: {
    assignmentType: v.optional(
      v.union(v.literal("conversation"), v.literal("organization_unassigned"))
    ),
    organizationId: v.string(),
    resolutionType: v.optional(
      v.union(
        v.literal("conversation"),
        v.literal("organization_unassigned"),
        v.literal("ignored")
      )
    ),
  },
  handler: async (ctx, args) => {
    return await listOrganizationAiThreads(ctx, args)
  },
})

export const registerStandaloneThread = internalMutation({
  args: {
    organizationId: v.string(),
    purpose: v.union(
      v.literal("debug-agent"),
      v.literal("combo-builder"),
      v.literal("unknown")
    ),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    return await registerOrganizationAiThread(ctx, {
      assignmentType: "organization_unassigned",
      kind: "standalone",
      organizationId: args.organizationId,
      purpose: args.purpose,
      resolutionReason:
        args.purpose === "debug-agent"
          ? "Thread standalone de debug agent"
          : args.purpose === "combo-builder"
            ? "Thread standalone de combo builder"
            : "Thread standalone sin conversación asociada",
      resolutionReasonCode:
        args.purpose === "debug-agent"
          ? "standalone_debug_agent"
          : args.purpose === "combo-builder"
            ? "standalone_combo_builder"
            : "unassigned_legacy_orphan",
      resolutionStatus: "resolved",
      resolutionType: "organization_unassigned",
      threadId: args.threadId,
    })
  },
})

export const registerIgnoredThread = internalMutation({
  args: {
    organizationId: v.string(),
    threadId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await registerOrganizationAiThread(ctx, {
      assignmentType: "organization_unassigned",
      costSyncStatus: "ignored",
      kind: "standalone",
      organizationId: args.organizationId,
      purpose: "unknown",
      resolutionReason:
        args.reason ?? "Thread ignorado explícitamente por regla de exclusión",
      resolutionReasonCode: "synthetic_thread",
      resolutionStatus: "resolved",
      resolutionType: "ignored",
      threadId: args.threadId,
    })
  },
})

export const markThreadResolutionFailure = internalMutation({
  args: {
    organizationId: v.string(),
    threadId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    return await markOrganizationAiThreadResolutionFailed(ctx, {
      organizationId: args.organizationId,
      reason: args.reason,
      reasonCode: "unexpected_error",
      threadId: args.threadId,
    })
  },
})

export const discoverThread = internalMutation({
  args: {
    organizationId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    // Callers persist resolution failures in a separate mutation so the write
    // survives if this mutation throws and Convex rolls back the transaction.
    const assignment = await resolveConversationAssignmentForThread(ctx, args)

    return await registerOrganizationAiThread(ctx, {
      assignmentType: assignment.assignmentType,
      conversationId: assignment.conversationId,
      kind: assignment.kind,
      organizationId: args.organizationId,
      purpose: assignment.purpose,
      resolutionReason: assignment.resolutionReason,
      resolutionReasonCode: assignment.resolutionReasonCode,
      resolutionStatus: "resolved",
      resolutionType: assignment.resolutionType,
      threadId: args.threadId,
    })
  },
})

export const refreshThreadCost = internalMutation({
  args: {
    organizationId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const assignment = await resolveConversationAssignmentForThread(ctx, args)
    const registryThread = await registerOrganizationAiThread(ctx, {
      assignmentType: assignment.assignmentType,
      conversationId: assignment.conversationId,
      kind: assignment.kind,
      organizationId: args.organizationId,
      purpose: assignment.purpose,
      resolutionReason: assignment.resolutionReason,
      resolutionReasonCode: assignment.resolutionReasonCode,
      resolutionStatus: "resolved",
      resolutionType: assignment.resolutionType,
      threadId: args.threadId,
    })

    if (!registryThread) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "No se pudo registrar el thread AI",
      })
    }

    if (assignment.assignmentType !== "organization_unassigned") {
      return {
        assignmentType: assignment.assignmentType,
        skipped: true,
        syncStatus: "skipped_assignment" as const,
        threadId: args.threadId,
      }
    }

    const threadCostResult = await fetchAiThreadCostBreakdown(ctx, {
      thread: {
        createdAt: registryThread.discoveredAt,
        kind: registryThread.kind,
        purpose: registryThread.purpose,
        threadId: registryThread.threadId,
      } satisfies ConversationCostThreadRef,
    })

    if (threadCostResult.failedThreads.length > 0) {
      const reason = formatFailedThreadSyncReason(
        threadCostResult.failedThreads
      )

      console.warn(
        "[ORGANIZATION AI THREAD COST] Skipping ledger sync due to failed thread fetch",
        {
          failedThreads: threadCostResult.failedThreads,
          organizationId: args.organizationId,
          threadId: args.threadId,
        }
      )

      await markOrganizationAiThreadLedgerSyncFailed(ctx, {
        organizationId: args.organizationId,
        reason,
        reasonCode: "message_fetch_incomplete",
        threadId: args.threadId,
      })

      return {
        assignmentType: assignment.assignmentType,
        failedThreads: threadCostResult.failedThreads,
        skipped: false,
        syncStatus: "skipped_due_to_fetch_failure" as const,
        threadId: args.threadId,
      }
    }

    await syncAiCostEventsForThread(ctx, {
      assignmentType: "organization_unassigned",
      breakdown: threadCostResult.breakdown,
      coverage: "complete",
      organizationId: args.organizationId,
      threadId: args.threadId,
    })

    return {
      assignmentType: assignment.assignmentType,
      messagesWithCost: threadCostResult.breakdown.messagesWithCost,
      skipped: false,
      syncStatus: "synced" as const,
      threadId: args.threadId,
      totalCost: threadCostResult.breakdown.totalCost,
    }
  },
})
