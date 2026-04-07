import { createThread } from "@convex-dev/agent"
import { makeFunctionReference } from "convex/server"
import { ConvexError, v } from "convex/values"
import { components } from "../_generated/api"
import type { Doc } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server"
import {
  buildConversationAiCostSummaryFromEvents,
  type ConversationAiCostLedgerSummary,
  syncConversationAiCostEvents,
} from "../lib/aiCostLedger"
import {
  type ConversationCostBreakdown,
  type ConversationCostCoverage,
  type ConversationCostThreadFailure,
  type ConversationCostThreadRef,
  fetchConversationCostBreakdown,
  getHistoricalConversationCostCoverage,
} from "../lib/conversationCost"
import { canSendWhatsAppMessage } from "../lib/whatsapp"
import {
  buildConversationChildThreadCreationArgs,
  listConversationAiThreads,
  registerConversationAiThread,
} from "../model/conversationAiThreads"
import {
  createConversation,
  escalateConversation,
  getConversationByThreadId,
  patchConversationAndSyncAggregate,
} from "../model/conversations"
import { markOrganizationAiThreadLedgerSyncFailed } from "../model/organizationAiThreads"

const resolveConversationIfEligibleRef = makeFunctionReference<"mutation">(
  "system/conversations:resolveConversationIfEligible"
)

type ConversationCostSyncStatus =
  | "failed_unexpected_error"
  | "skipped_due_to_fetch_failure"
  | "synced"
type ConversationCostUnexpectedPhase =
  | "ledger_projection_read_failed"
  | "ledger_sync_maybe_partial"
  | "snapshot_write_failed"
type ConversationCostMutationPatch = Partial<
  Omit<Doc<"conversations">, "_creationTime" | "_id">
>

type ConversationCostSyncResult = {
  breakdown: ConversationCostBreakdown
  costPatch: ConversationCostMutationPatch
  failedThreads: ConversationCostThreadFailure[]
  summary: ConversationAiCostLedgerSummary
  syncStatus: ConversationCostSyncStatus
}

class ConversationCostUnexpectedFailure extends Error {
  readonly phase: ConversationCostUnexpectedPhase

  constructor(phase: ConversationCostUnexpectedPhase, error: unknown) {
    super(
      error instanceof Error
        ? error.message
        : "Error desconocido al sincronizar"
    )
    this.name = "ConversationCostUnexpectedFailure"
    this.phase = phase
  }
}

const ledgerEventScopeValidator = v.union(
  v.object({
    conversationId: v.id("conversations"),
    type: v.literal("conversation"),
  }),
  v.object({
    organizationId: v.string(),
    threadId: v.string(),
    type: v.literal("thread"),
  })
)

function formatUnexpectedConversationCostError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Error desconocido al sincronizar"

  if (error instanceof ConversationCostUnexpectedFailure) {
    if (error.phase === "ledger_sync_maybe_partial") {
      return `La sincronizacion del ledger AI fallo de forma inesperada; puede haber escrituras parciales y podria requerirse reconciliacion: ${message.slice(0, 280)}`
    }

    if (error.phase === "ledger_projection_read_failed") {
      return `El ledger AI se sincronizo, pero fallo la lectura para recalcular el snapshot de costo: ${message.slice(0, 280)}`
    }

    if (error.phase === "snapshot_write_failed") {
      return `El ledger AI se sincronizo, pero fallo la escritura del snapshot de costo: ${message.slice(0, 280)}`
    }
  }

  return `No se sincronizo el costo AI por un error inesperado: ${message.slice(0, 280)}`
}

function buildUnexpectedConversationCostFailurePatch(
  error: unknown
): ConversationCostMutationPatch {
  return {
    aiCostLastSyncError: formatUnexpectedConversationCostError(error),
    aiCostLastSyncFailedAt: Date.now(),
  }
}

function toConversationCostUnexpectedFailure(
  error: unknown,
  fallbackPhase: ConversationCostUnexpectedPhase
) {
  return error instanceof ConversationCostUnexpectedFailure
    ? error
    : new ConversationCostUnexpectedFailure(fallbackPhase, error)
}

function summarizeBreakdownThreadsForLog(breakdown: ConversationCostBreakdown) {
  const threads = new Map<
    string,
    {
      messageCount: number
      messageIds: string[]
      totalCost: number
    }
  >()

  for (const message of breakdown.messages) {
    const current = threads.get(message.threadId) ?? {
      messageCount: 0,
      messageIds: [],
      totalCost: 0,
    }
    current.messageCount += 1
    current.totalCost += message.cost
    if (current.messageIds.length < 5) {
      current.messageIds.push(message.messageId)
    }
    threads.set(message.threadId, current)
  }

  return [...threads.entries()].map(([threadId, summary]) => ({
    messageCount: summary.messageCount,
    messageIds: summary.messageIds,
    threadId,
    totalCost: Number(summary.totalCost.toFixed(4)),
  }))
}

function buildBreakdownSummary(
  breakdown: ConversationCostBreakdown,
  costCoverage: ConversationCostCoverage
): ConversationAiCostLedgerSummary {
  return buildConversationAiCostSummaryFromEvents(
    breakdown.messages.map((message) => ({
      costUsd: message.cost,
      coverage: costCoverage,
      threadId: message.threadId,
    })),
    costCoverage
  )
}

async function listConversationAiCostEvents(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  conversationId: Doc<"conversations">["_id"]
) {
  const events = await ctx.db
    .query("aiCostEvents")
    .withIndex("by_conversation_id", (q) =>
      q.eq("conversationId", conversationId)
    )
    .collect()

  return [...events].sort((a, b) => {
    if (b.eventAt !== a.eventAt) {
      return b.eventAt - a.eventAt
    }

    return (a.messageId ?? a._id).localeCompare(b.messageId ?? b._id)
  })
}

async function getConversationLedgerSummary(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  args: {
    conversationId: Doc<"conversations">["_id"]
    fallbackCoverage: ConversationCostCoverage
  }
) {
  const events = await listConversationAiCostEvents(ctx, args.conversationId)

  return {
    events,
    summary: buildConversationAiCostSummaryFromEvents(
      events,
      args.fallbackCoverage
    ),
  }
}

async function getConversationLedgerSummarySafely(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  args: {
    conversationId: Doc<"conversations">["_id"]
    fallbackCoverage: ConversationCostCoverage
    operation: string
    organizationId: string
    threadId: string
  }
) {
  try {
    return await getConversationLedgerSummary(ctx, {
      conversationId: args.conversationId,
      fallbackCoverage: args.fallbackCoverage,
    })
  } catch (error) {
    console.error("[CONVERSATION COST] Failed to read ledger summary", {
      conversationId: args.conversationId,
      operation: args.operation,
      organizationId: args.organizationId,
      threadId: args.threadId,
    })
    console.error(error)
    return null
  }
}

async function getConversationCostDataForRecord(
  ctx: MutationCtx,
  conversation: Pick<Doc<"conversations">, "_creationTime" | "_id" | "threadId">
) {
  const registeredThreads = await listConversationAiThreads(ctx, {
    conversationId: conversation._id,
  })

  const normalizedThreads: ConversationCostThreadRef[] = registeredThreads.map(
    (thread) => ({
      createdAt: thread.createdAt,
      kind: thread.kind,
      purpose: thread.purpose,
      threadId: thread.threadId,
    })
  )

  const breakdown = await fetchConversationCostBreakdown(ctx, {
    conversation,
    registeredThreads: normalizedThreads,
  })

  return {
    breakdown: breakdown.breakdown,
    failedThreads: breakdown.failedThreads,
    registeredThreads: normalizedThreads,
  }
}

async function ensurePrimaryConversationAiThread(
  ctx: MutationCtx,
  conversation: Pick<
    Doc<"conversations">,
    "_id" | "organizationId" | "threadId"
  >
) {
  await registerConversationAiThread(ctx, {
    conversationId: conversation._id,
    kind: "primary",
    organizationId: conversation.organizationId,
    purpose: "support-agent",
    threadId: conversation.threadId,
  })
}

function buildConversationCostPatch(
  summary: ConversationAiCostLedgerSummary,
  aiCostLedgerSyncedAt: number = Date.now()
): ConversationCostMutationPatch {
  const costUpdatedAt = aiCostLedgerSyncedAt

  return {
    aiCostLastSyncError: undefined,
    aiCostLastSyncFailedAt: undefined,
    aiCostLedgerSyncedAt,
    cost: summary.cost,
    costCoverage: summary.costCoverage,
    costUpdatedAt,
  }
}

function formatConversationCostThreadFailure(
  failedThread: ConversationCostThreadFailure
) {
  return `${failedThread.threadId} (${failedThread.purpose}): ${failedThread.reason}`
}

function buildConversationCostFailurePatch(
  failedThreads: ConversationCostThreadFailure[]
): ConversationCostMutationPatch {
  const summarizedFailures = failedThreads
    .slice(0, 3)
    .map((failedThread) => formatConversationCostThreadFailure(failedThread))
    .join("; ")
  const remainingFailures =
    failedThreads.length > 3 ? `; +${failedThreads.length - 3} mas` : ""

  return {
    aiCostLastSyncError:
      failedThreads.length === 1
        ? `No se sincronizo el costo AI porque fallo la lectura de 1 thread: ${summarizedFailures}${remainingFailures}`
        : `No se sincronizo el costo AI porque fallaron ${failedThreads.length} threads: ${summarizedFailures}${remainingFailures}`,
    aiCostLastSyncFailedAt: Date.now(),
  }
}

async function markConversationThreadSyncFailures(
  ctx: MutationCtx,
  args: {
    failedThreads: ConversationCostThreadFailure[]
    organizationId: string
  }
) {
  await Promise.all(
    args.failedThreads.map((failedThread) =>
      markOrganizationAiThreadLedgerSyncFailed(ctx, {
        organizationId: args.organizationId,
        reason: formatConversationCostThreadFailure(failedThread),
        reasonCode: "message_fetch_incomplete",
        threadId: failedThread.threadId,
      })
    )
  )
}

async function persistConversationCostFailurePatchSafely(
  ctx: MutationCtx,
  args: {
    conversationId: Doc<"conversations">["_id"]
    organizationId: string
    patch: ConversationCostMutationPatch
    threadId: string
  }
) {
  try {
    await ctx.db.patch(args.conversationId, args.patch)
  } catch (error) {
    console.error(
      "[CONVERSATION COST] Failed to persist non-blocking failure patch",
      {
        conversationId: args.conversationId,
        organizationId: args.organizationId,
        threadId: args.threadId,
      }
    )
    console.error(error)
  }
}

async function syncConversationCostBreakdown(
  ctx: MutationCtx,
  args: {
    breakdown: ConversationCostBreakdown
    conversation: Pick<
      Doc<"conversations">,
      "_creationTime" | "_id" | "organizationId" | "threadId"
    >
    costCoverage: ConversationCostCoverage
    failedThreads: ConversationCostThreadFailure[]
  }
): Promise<ConversationCostSyncResult> {
  const partialSummary = buildBreakdownSummary(
    args.breakdown,
    args.costCoverage
  )

  if (args.failedThreads.length > 0) {
    console.warn(
      "[CONVERSATION COST] Skipping ledger sync due to incomplete thread fetch",
      {
        conversationId: args.conversation._id,
        failedThreads: args.failedThreads,
        organizationId: args.conversation.organizationId,
      }
    )

    await markConversationThreadSyncFailures(ctx, {
      failedThreads: args.failedThreads,
      organizationId: args.conversation.organizationId,
    })

    return {
      breakdown: args.breakdown,
      costPatch: buildConversationCostFailurePatch(args.failedThreads),
      failedThreads: args.failedThreads,
      summary: partialSummary,
      syncStatus: "skipped_due_to_fetch_failure",
    }
  }

  const ledgerSyncedAt = Date.now()

  try {
    await syncConversationAiCostEvents(ctx, {
      breakdown: args.breakdown,
      conversation: args.conversation,
      coverage: args.costCoverage,
      failedThreadIds: args.failedThreads.map((thread) => thread.threadId),
    })
  } catch (error) {
    console.error(
      "[CONVERSATION COST] Ledger sync failed unexpectedly; partial ledger writes may already be committed and reconciliation may be required",
      {
        breakdownThreads: summarizeBreakdownThreadsForLog(args.breakdown),
        conversationId: args.conversation._id,
        costCoverage: args.costCoverage,
        messagesWithCost: args.breakdown.messagesWithCost,
        organizationId: args.conversation.organizationId,
        primaryThreadId: args.conversation.threadId,
        reconciliationRecommended: true,
        threadsCount: args.breakdown.threadsCount,
        totalCost: args.breakdown.totalCost,
      }
    )
    console.error(error)
    throw toConversationCostUnexpectedFailure(
      error,
      "ledger_sync_maybe_partial"
    )
  }

  let summary: ConversationAiCostLedgerSummary

  try {
    const ledgerSummary = await getConversationLedgerSummary(ctx, {
      conversationId: args.conversation._id,
      fallbackCoverage: args.costCoverage,
    })
    summary = ledgerSummary.summary
  } catch (error) {
    console.error(
      "[CONVERSATION COST] Ledger synced but snapshot summary rebuild failed",
      {
        conversationId: args.conversation._id,
        costCoverage: args.costCoverage,
        organizationId: args.conversation.organizationId,
        primaryThreadId: args.conversation.threadId,
      }
    )
    console.error(error)
    throw toConversationCostUnexpectedFailure(
      error,
      "ledger_projection_read_failed"
    )
  }

  return {
    breakdown: args.breakdown,
    costPatch: buildConversationCostPatch(summary, ledgerSyncedAt),
    failedThreads: [],
    summary,
    syncStatus: "synced",
  }
}

async function getConversationCostPatch(
  ctx: MutationCtx,
  conversation: Pick<
    Doc<"conversations">,
    "_creationTime" | "_id" | "organizationId" | "threadId"
  >,
  costCoverage: ConversationCostCoverage = "complete"
) {
  await ensurePrimaryConversationAiThread(ctx, conversation)

  const { breakdown, failedThreads } = await getConversationCostDataForRecord(
    ctx,
    conversation
  )

  return await syncConversationCostBreakdown(ctx, {
    breakdown,
    conversation,
    costCoverage,
    failedThreads,
  })
}

async function getConversationCostPatchSafely(
  ctx: MutationCtx,
  conversation: Pick<
    Doc<"conversations">,
    | "_creationTime"
    | "_id"
    | "organizationId"
    | "threadId"
    | "cost"
    | "costUpdatedAt"
  >,
  costCoverage: ConversationCostCoverage = "complete"
) {
  try {
    return await getConversationCostPatch(ctx, conversation, costCoverage)
  } catch (error) {
    console.error(
      "[CONVERSATION COST] Non-blocking cost refresh fallback triggered",
      {
        conversationId: conversation._id,
        organizationId: conversation.organizationId,
        threadId: conversation.threadId,
      }
    )
    console.error(error)

    return {
      breakdown: {
        messages: [],
        messagesWithCost: 0,
        threadsCount: 0,
        totalCost: conversation.cost ?? 0,
      },
      costPatch: buildUnexpectedConversationCostFailurePatch(error),
      failedThreads: [],
      summary: {
        cost: conversation.cost,
        costCoverage,
        messagesWithCost: 0,
        threadsCount: 0,
        totalCost: conversation.cost ?? 0,
      },
      syncStatus: "failed_unexpected_error" as const,
    }
  }
}

export const escalate = internalMutation({
  args: {
    threadId: v.string(),
    reason: v.optional(v.string()),
    lastCustomerMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await getConversationByThreadId(ctx, {
      threadId: args.threadId,
    })
    await escalateConversation(ctx, conversation, {
      reason: args.reason,
      lastCustomerMessage: args.lastCustomerMessage,
    })
  },
})

export const resolve = internalMutation({
  args: {
    threadId: v.string(),
    resolutionReason: v.optional(v.string()),
    resolvedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique()

    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversación no encontrada",
      })
    }

    // Check if conversation has any active orders
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_conversation_id", (q) =>
        q.eq("conversationId", conversation._id)
      )
      .collect()

    const activeOrders = orders.filter(
      (order) => order.status !== "entregado" && order.status !== "cancelado"
    )

    if (activeOrders.length > 0) {
      const statusDescriptions: Record<string, string> = {
        programado: "programada",
        pendiente: "pendiente",
        preparando: "en preparación",
        listo_para_recoger: "lista para recoger",
        en_camino: "en camino",
      }

      const activeOrderStatuses = activeOrders
        .map((order) => statusDescriptions[order.status] || order.status)
        .join(", ")

      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `No puedo resolver esta conversación porque hay ${activeOrders.length === 1 ? "una orden activa" : `${activeOrders.length} órdenes activas`} (${activeOrderStatuses}). Las órdenes deben estar entregadas o canceladas antes de cerrar la conversación.`,
      })
    }

    const costRefresh = await getConversationCostPatchSafely(ctx, conversation)

    await patchConversationAndSyncAggregate(ctx, {
      conversationId: conversation._id,
      patch: {
        status: "resolved",
        ...costRefresh.costPatch,
        resolutionReason: args.resolutionReason ?? "Sin motivo especificado",
        resolvedAt: Date.now(),
        resolvedBy: args.resolvedBy ?? "system",
      },
    })
    return "Conversación cerrada"
  },
})

/**
 * Force resolve a conversation with cost calculation, skipping order validation.
 * Use this when creating orders, as the order will be active when resolving.
 */
export const forceResolveWithCost = internalMutation({
  args: {
    threadId: v.string(),
    resolutionReason: v.optional(v.string()),
    resolvedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique()

    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversación no encontrada",
      })
    }

    const costRefresh = await getConversationCostPatchSafely(ctx, conversation)

    await patchConversationAndSyncAggregate(ctx, {
      conversationId: conversation._id,
      patch: {
        status: "resolved",
        ...costRefresh.costPatch,
        resolutionReason: args.resolutionReason ?? "Sin motivo especificado",
        resolvedAt: Date.now(),
        resolvedBy: args.resolvedBy ?? "system",
      },
    })
    return "Conversación cerrada"
  },
})

export const getByThreadId = internalQuery({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique()
    return conversation
  },
})

export const getOne = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.conversationId)
  },
})

function serializeConversationCostSnapshot(
  conversation: Pick<
    Doc<"conversations">,
    | "_id"
    | "aiCostLastSyncError"
    | "aiCostLastSyncFailedAt"
    | "aiCostLedgerSyncedAt"
    | "cost"
    | "costCoverage"
    | "costUpdatedAt"
  >
) {
  return {
    aiCostLastSyncError: conversation.aiCostLastSyncError,
    aiCostLastSyncFailedAt: conversation.aiCostLastSyncFailedAt,
    aiCostLedgerSyncedAt: conversation.aiCostLedgerSyncedAt,
    conversationId: conversation._id,
    cost: conversation.cost,
    costCoverage: conversation.costCoverage,
    costUpdatedAt: conversation.costUpdatedAt,
  }
}

export const getCostSnapshot = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)

    if (!conversation) {
      return null
    }

    return serializeConversationCostSnapshot(conversation)
  },
})

export const listLedgerEvents = internalQuery({
  args: {
    scope: ledgerEventScopeValidator,
  },
  handler: async (ctx, args) => {
    if (args.scope.type === "conversation") {
      return await listConversationAiCostEvents(ctx, args.scope.conversationId)
    }

    const { organizationId, threadId } = args.scope
    const events = await ctx.db
      .query("aiCostEvents")
      .withIndex("by_organization_and_thread_id", (q) =>
        q.eq("organizationId", organizationId).eq("threadId", threadId)
      )
      .collect()

    return [...events].sort((a, b) => {
      if (b.eventAt !== a.eventAt) {
        return b.eventAt - a.eventAt
      }

      return (a.messageId ?? a._id).localeCompare(b.messageId ?? b._id)
    })
  },
})

export const createConversationChildThread = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    purpose: v.union(
      v.literal("menu-context"),
      v.literal("combination-enrichment"),
      v.literal("combination-validation")
    ),
    summary: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversación no encontrada",
      })
    }

    const thread = await ctx.runMutation(
      components.agent.threads.createThread,
      {
        ...buildConversationChildThreadCreationArgs(conversation, {
          summary: args.summary,
          title: args.title,
        }),
      }
    )

    await registerConversationAiThread(ctx, {
      conversationId: conversation._id,
      kind: "auxiliary",
      organizationId: conversation.organizationId,
      purpose: args.purpose,
      threadId: thread._id,
    })

    return {
      parentThreadId: conversation.threadId,
      threadId: thread._id,
    }
  },
})

export const refreshConversationCost = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversación no encontrada",
      })
    }

    try {
      const costRefresh = await getConversationCostPatchSafely(
        ctx,
        conversation
      )

      await patchConversationAndSyncAggregate(ctx, {
        conversationId: conversation._id,
        patch: costRefresh.costPatch,
      })

      return {
        ...costRefresh.breakdown,
        costUpdatedAt:
          costRefresh.syncStatus === "synced"
            ? costRefresh.costPatch.costUpdatedAt
            : conversation.costUpdatedAt,
        failedThreads: costRefresh.failedThreads,
        syncStatus: costRefresh.syncStatus,
      }
    } catch (error) {
      const failurePatch = buildUnexpectedConversationCostFailurePatch(
        toConversationCostUnexpectedFailure(error, "snapshot_write_failed")
      )

      console.error(
        "[CONVERSATION COST] refreshConversationCost failed unexpectedly",
        {
          conversationId: conversation._id,
          organizationId: conversation.organizationId,
          threadId: conversation.threadId,
        }
      )
      console.error(error)

      await persistConversationCostFailurePatchSafely(ctx, {
        conversationId: conversation._id,
        patch: failurePatch,
        organizationId: conversation.organizationId,
        threadId: conversation.threadId,
      })

      return {
        messages: [],
        messagesWithCost: 0,
        threadsCount: 0,
        totalCost: conversation.cost ?? 0,
        costUpdatedAt: conversation.costUpdatedAt,
        errorMessage: failurePatch.aiCostLastSyncError,
        failedThreads: [],
        syncStatus: "failed_unexpected_error" as const,
      }
    }
  },
})

export const backfillHistoricalConversationCost = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversación no encontrada",
      })
    }

    await ensurePrimaryConversationAiThread(ctx, conversation)

    const { breakdown, failedThreads, registeredThreads } =
      await getConversationCostDataForRecord(ctx, conversation)
    const costCoverage =
      getHistoricalConversationCostCoverage(registeredThreads)
    const costRefresh = await syncConversationCostBreakdown(ctx, {
      breakdown,
      conversation,
      costCoverage,
      failedThreads,
    })

    await patchConversationAndSyncAggregate(ctx, {
      conversationId: conversation._id,
      patch: costRefresh.costPatch,
    })

    return {
      ...breakdown,
      costCoverage,
      costUpdatedAt:
        costRefresh.syncStatus === "synced"
          ? costRefresh.costPatch.costUpdatedAt
          : conversation.costUpdatedAt,
      failedThreads: costRefresh.failedThreads,
      syncStatus: costRefresh.syncStatus,
    }
  },
})

export const reconcileCostLedger = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    repair: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversación no encontrada",
      })
    }

    await ensurePrimaryConversationAiThread(ctx, conversation)

    const { breakdown, failedThreads, registeredThreads } =
      await getConversationCostDataForRecord(ctx, conversation)
    const comparisonCoverage =
      conversation.costCoverage ??
      getHistoricalConversationCostCoverage(registeredThreads)
    const sourceSummary = buildBreakdownSummary(breakdown, comparisonCoverage)
    const before = await getConversationLedgerSummary(ctx, {
      conversationId: conversation._id,
      fallbackCoverage: comparisonCoverage,
    })

    const sourceMessageIds = new Set(
      breakdown.messages.map((message) => message.messageId)
    )
    const ledgerMessageIds = new Set(
      before.events
        .map((event) => event.messageId)
        .filter(
          (messageId): messageId is string => typeof messageId === "string"
        )
    )

    let repairSyncStatus: ConversationCostSyncStatus | undefined
    let repairErrorMessage: string | undefined
    let repaired = false
    let afterConversation = conversation
    let after = before

    if (args.repair) {
      try {
        const repairResult = await syncConversationCostBreakdown(ctx, {
          breakdown,
          conversation,
          costCoverage: comparisonCoverage,
          failedThreads,
        })

        repairSyncStatus = repairResult.syncStatus

        await patchConversationAndSyncAggregate(ctx, {
          conversationId: conversation._id,
          patch: repairResult.costPatch,
        })

        afterConversation =
          (await ctx.db.get(conversation._id)) ?? afterConversation
        const afterLedgerSummary = await getConversationLedgerSummarySafely(
          ctx,
          {
            conversationId: conversation._id,
            fallbackCoverage: comparisonCoverage,
            operation: "reconcile_after_successful_repair",
            organizationId: conversation.organizationId,
            threadId: conversation.threadId,
          }
        )
        if (afterLedgerSummary) {
          after = afterLedgerSummary
          repaired = repairResult.syncStatus === "synced"
        } else {
          repairErrorMessage =
            "La reparacion se ejecuto, pero no se pudo releer el ledger para verificar el resultado."
          repaired = false
        }
      } catch (error) {
        const failurePatch = buildUnexpectedConversationCostFailurePatch(
          toConversationCostUnexpectedFailure(error, "snapshot_write_failed")
        )

        await persistConversationCostFailurePatchSafely(ctx, {
          conversationId: conversation._id,
          organizationId: conversation.organizationId,
          patch: failurePatch,
          threadId: conversation.threadId,
        })

        afterConversation =
          (await ctx.db.get(conversation._id)) ?? afterConversation
        const afterLedgerSummary = await getConversationLedgerSummarySafely(
          ctx,
          {
            conversationId: conversation._id,
            fallbackCoverage: comparisonCoverage,
            operation: "reconcile_after_failed_repair",
            organizationId: conversation.organizationId,
            threadId: conversation.threadId,
          }
        )
        if (afterLedgerSummary) {
          after = afterLedgerSummary
          repairErrorMessage = failurePatch.aiCostLastSyncError
        } else {
          repairErrorMessage = `${failurePatch.aiCostLastSyncError} No se pudo releer el ledger despues del intento de reparacion.`
        }
        repairSyncStatus = "failed_unexpected_error"
      }
    }

    return {
      after: {
        ledgerSummary: after.summary,
        snapshot: serializeConversationCostSnapshot(afterConversation),
      },
      before: {
        ledgerSummary: before.summary,
        snapshot: serializeConversationCostSnapshot(conversation),
      },
      conversationId: conversation._id,
      drift: {
        coverageMismatch:
          sourceSummary.costCoverage !== before.summary.costCoverage,
        missingMessageIds: breakdown.messages
          .filter((message) => !ledgerMessageIds.has(message.messageId))
          .map((message) => message.messageId),
        snapshotMismatch:
          conversation.cost !== before.summary.cost ||
          conversation.costCoverage !== before.summary.costCoverage,
        totalCostMismatch: sourceSummary.totalCost !== before.summary.totalCost,
        unexpectedMessageIds: before.events
          .map((event) => event.messageId)
          .filter(
            (messageId): messageId is string =>
              typeof messageId === "string" && !sourceMessageIds.has(messageId)
          ),
      },
      failedThreads,
      repairErrorMessage,
      repairRequested: args.repair === true,
      repairSyncStatus,
      repaired,
      sourceSummary,
    }
  },
})

export const getOrCreateByContactId = internalMutation({
  args: {
    contactId: v.id("contacts"),
    whatsappConfigurationId: v.id("whatsappConfigurations"),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId)

    if (!contact) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Sesión inválida",
      })
    }

    // Check for existing unresolved conversation with this WhatsApp configuration
    const existingUnresolvedConversation = await ctx.db
      .query("conversations")
      .withIndex("by_contact_and_whatsapp_config", (q) =>
        q
          .eq("contactId", contact._id)
          .eq("whatsappConfigurationId", args.whatsappConfigurationId)
      )
      .filter((q) => q.eq(q.field("status"), "unresolved"))
      .first()
    if (existingUnresolvedConversation) {
      return existingUnresolvedConversation._id
    }

    // Check for existing escalated conversation with this WhatsApp configuration
    const existingEscalatedConversation = await ctx.db
      .query("conversations")
      .withIndex("by_contact_and_whatsapp_config", (q) =>
        q
          .eq("contactId", contact._id)
          .eq("whatsappConfigurationId", args.whatsappConfigurationId)
      )
      .filter((q) => q.eq(q.field("status"), "escalated"))
      .first()
    if (existingEscalatedConversation) {
      return existingEscalatedConversation._id
    }

    // Create new conversation with specific WhatsApp configuration
    const threadId = await createThread(ctx, components.agent, {
      userId: contact.organizationId,
    })

    const conversation = await createConversation(ctx, {
      contactId: contact._id,
      status: "unresolved",
      threadId: threadId,
      organizationId: contact.organizationId,
      whatsappConfigurationId: args.whatsappConfigurationId,
    })

    return conversation._id
  },
})

/**
 * Get all data needed for inactivity warnings in a single query
 * Returns conversation, contact, WhatsApp configuration, and 24-hour window validation
 */
export const getInactivityWarningData = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get conversation
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      return null
    }

    // Get contact
    const contact = await ctx.db.get(args.contactId)
    if (!contact) {
      return null
    }

    // Get WhatsApp configuration associated with this conversation
    const whatsappConfig = conversation.whatsappConfigurationId
      ? await ctx.db.get(conversation.whatsappConfigurationId)
      : null

    // Check if we can send WhatsApp messages (24-hour window)
    const whatsappMessageWindow = canSendWhatsAppMessage(contact)

    return {
      conversation,
      contact,
      whatsappConfig: whatsappConfig || null,
      canSendWhatsApp: whatsappMessageWindow.canSend,
      whatsappRestrictionReason: whatsappMessageWindow.reason,
    }
  },
})

/**
 * Resolve conversation automatically (scheduled function)
 * This function does everything in one place to avoid multiple internal calls
 */
export const resolveConversationDelayed = internalAction({
  args: {
    conversationId: v.id("conversations"),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(
      `⏰ Ejecutando resolución automática de conversación ${args.conversationId}`
    )

    // Run everything in a single mutation to be efficient
    const result = await ctx.runMutation(resolveConversationIfEligibleRef, {
      conversationId: args.conversationId,
      resolutionReason: "Resolución automática tras buffer post-entrega",
      resolvedBy: "system:post_delivery_buffer",
    })

    if (result.resolved) {
      console.log(
        `🔄 Conversación ${args.conversationId} resuelta automáticamente`
      )
    } else {
      console.log(
        `ℹ️ Conversación ${args.conversationId} no fue resuelta: ${result.reason}`
      )
    }
  },
})

/**
 * Resolve conversation if it's eligible (single mutation to check and resolve)
 */
export const resolveConversationIfEligible = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    resolutionReason: v.optional(v.string()),
    resolvedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)

    if (!conversation) {
      return { resolved: false, reason: "Conversación no encontrada" }
    }

    if (conversation.status === "resolved") {
      return { resolved: false, reason: "Conversación ya está resuelta" }
    }

    // Check if conversation has any active orders
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_conversation_id", (q) =>
        q.eq("conversationId", conversation._id)
      )
      .collect()

    const activeOrders = orders.filter(
      (order) => order.status !== "entregado" && order.status !== "cancelado"
    )

    if (activeOrders.length > 0) {
      return {
        resolved: false,
        reason: `Hay ${activeOrders.length === 1 ? "una orden activa" : `${activeOrders.length} órdenes activas`}`,
      }
    }

    const costRefresh = await getConversationCostPatchSafely(ctx, conversation)

    await patchConversationAndSyncAggregate(ctx, {
      conversationId: args.conversationId,
      patch: {
        status: "resolved" as const,
        ...costRefresh.costPatch,
        resolutionReason: args.resolutionReason ?? "Sin motivo especificado",
        resolvedAt: Date.now(),
        resolvedBy: args.resolvedBy ?? "system",
      },
    })

    return { resolved: true, reason: "Conversación resuelta exitosamente" }
  },
})

export const updateLastMessageAt = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: Date.now(),
    })
  },
})

/**
 * Set the stop signal for the agent in this conversation.
 * Used by silent tools to prevent the agent from "reacting" to the tool result.
 */
export const setStopSignal = internalMutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique()

    if (conversation) {
      await ctx.db.patch(conversation._id, { stopSignal: true })
      console.log(`🛑 [STOP SIGNAL] Set for thread: ${args.threadId}`)
    }
  },
})

/**
 * Clear the stop signal for the agent in this conversation.
 * Should be called at the beginning of an agent run.
 */
export const clearStopSignal = internalMutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique()

    if (conversation?.stopSignal) {
      await ctx.db.patch(conversation._id, { stopSignal: undefined })
      console.log(`✨ [STOP SIGNAL] Cleared for thread: ${args.threadId}`)
    }
  },
})
