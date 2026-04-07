import { ConvexError, v } from "convex/values"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { markOrganizationAiThreadLedgerSynced } from "../model/organizationAiThreads"
import type {
  AiCostAssignmentType,
  AiCostPricingBreakdown,
  AiCostPricingSource,
  AiCostSourceBreakdown,
  AiCostSourceType,
} from "./aiCostDomain"
import type {
  ConversationCostBreakdown,
  ConversationCostBreakdownMessage,
  ConversationCostCoverage,
} from "./conversationCost"

export const AI_COST_REPORTING_TIMEZONE = "America/Bogota"
export const AI_COST_DEFAULT_PROVIDER = "ai-gateway"
const BOGOTA_UTC_OFFSET_HOURS = 5

export const aiCostUsageValidator = v.object({
  cachedInputTokens: v.optional(v.number()),
  completionTokens: v.optional(v.number()),
  promptTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  totalTokens: v.optional(v.number()),
})

export const aiCostEventMetadataValidator = v.object({
  isCustomerVisible: v.boolean(),
  role: v.string(),
  threadPurpose: v.string(),
})

export type AiCostMonthlySeriesRow = {
  completeCostUsd: number
  estimatedCostUsd: number
  eventsCount: number
  periodMonth: string
  sourceBreakdown: AiCostSourceBreakdown
  totalCostUsd: number
}

export type ConversationAiCostLedgerSummary = {
  cost?: number
  costCoverage: ConversationCostCoverage
  messagesWithCost: number
  threadsCount: number
  totalCost: number
}

type AiCostMonthlySeriesInputRow = Pick<
  AiCostMonthlySeriesRow,
  | "completeCostUsd"
  | "estimatedCostUsd"
  | "eventsCount"
  | "periodMonth"
  | "sourceBreakdown"
  | "totalCostUsd"
>

export const roundCost = (value: number) => Number(value.toFixed(4))

const MONTH_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  month: "2-digit",
  timeZone: AI_COST_REPORTING_TIMEZONE,
  year: "numeric",
})

const DATE_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: AI_COST_REPORTING_TIMEZONE,
  year: "numeric",
})

const formatWithFormatter = (
  formatter: Intl.DateTimeFormat,
  date: Date
): Record<string, string> =>
  formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value
    }
    return acc
  }, {})

export const createEmptySourceBreakdown = (): AiCostSourceBreakdown => ({
  agentMessage: 0,
  audioTranscription: 0,
  embedding: 0,
  other: 0,
})

export const cloneSourceBreakdown = (
  value?: Partial<AiCostSourceBreakdown>
): AiCostSourceBreakdown => ({
  agentMessage: value?.agentMessage ?? 0,
  audioTranscription: value?.audioTranscription ?? 0,
  embedding: value?.embedding ?? 0,
  other: value?.other ?? 0,
})

export const createEmptyPricingBreakdown = (): AiCostPricingBreakdown => ({
  estimatedPricingCostUsd: 0,
  exactPricingCostUsd: 0,
})

export const clonePricingBreakdown = (
  value?: Partial<AiCostPricingBreakdown>
): AiCostPricingBreakdown => ({
  estimatedPricingCostUsd: value?.estimatedPricingCostUsd ?? 0,
  exactPricingCostUsd: value?.exactPricingCostUsd ?? 0,
})

export function addCostToPricingBreakdown(
  breakdown: AiCostPricingBreakdown,
  pricingSource: AiCostPricingSource,
  amount: number
) {
  const normalizedAmount = roundCost(amount)

  if (pricingSource === "catalog_estimated") {
    breakdown.estimatedPricingCostUsd = roundCost(
      breakdown.estimatedPricingCostUsd + normalizedAmount
    )
    return
  }

  breakdown.exactPricingCostUsd = roundCost(
    breakdown.exactPricingCostUsd + normalizedAmount
  )
}

export function addCostToSourceBreakdown(
  breakdown: AiCostSourceBreakdown,
  sourceType: AiCostSourceType,
  amount: number
) {
  const normalizedAmount = roundCost(amount)

  switch (sourceType) {
    case "agent_message":
      breakdown.agentMessage = roundCost(
        breakdown.agentMessage + normalizedAmount
      )
      return
    case "audio_transcription":
      breakdown.audioTranscription = roundCost(
        breakdown.audioTranscription + normalizedAmount
      )
      return
    case "embedding":
      breakdown.embedding = roundCost(breakdown.embedding + normalizedAmount)
      return
    case "other":
      breakdown.other = roundCost(breakdown.other + normalizedAmount)
      return
    default:
      return
  }
}

export function assertAiCostReportingTimezone(timezone?: string) {
  const normalizedTimezone = timezone ?? AI_COST_REPORTING_TIMEZONE

  if (normalizedTimezone !== AI_COST_REPORTING_TIMEZONE) {
    throw new ConvexError({
      code: "INVALID_TIMEZONE",
      message: `Solo se soporta la zona horaria ${AI_COST_REPORTING_TIMEZONE}`,
    })
  }

  return normalizedTimezone
}

export function getCurrentBogotaDateString(now: number = Date.now()) {
  const parts = formatWithFormatter(DATE_PARTS_FORMATTER, new Date(now))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function getPeriodMonthForTimestamp(
  timestamp: number,
  timezone: string = AI_COST_REPORTING_TIMEZONE
) {
  assertAiCostReportingTimezone(timezone)
  const parts = formatWithFormatter(MONTH_KEY_FORMATTER, new Date(timestamp))
  return `${parts.year}-${parts.month}`
}

export function getDailyDateForTimestamp(timestamp: number): string {
  const parts = formatWithFormatter(DATE_PARTS_FORMATTER, new Date(timestamp))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function parseDateString(date: string) {
  const [yearRaw, monthRaw, dayRaw] = date.split("-").map(Number)
  const year = yearRaw ?? 0
  const month = monthRaw ?? 0
  const day = dayRaw ?? 0

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new ConvexError({
      code: "INVALID_DATE_RANGE",
      message: `Fecha inválida: ${date}`,
    })
  }

  return { day, month, year }
}

function formatDateParts(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`
}

function addDaysToDateString(date: string, days: number) {
  const { day, month, year } = parseDateString(date)
  const utcDate = new Date(Date.UTC(year, month - 1, day))
  utcDate.setUTCDate(utcDate.getUTCDate() + days)

  return formatDateParts(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate()
  )
}

export function getUtcStartOfBogotaDate(
  date: string,
  timezone: string = AI_COST_REPORTING_TIMEZONE
) {
  assertAiCostReportingTimezone(timezone)
  const { day, month, year } = parseDateString(date)
  // `America/Bogota` is a fixed UTC-5 timezone with no DST.
  // The guard above intentionally keeps this helper locked to that assumption.
  return Date.UTC(year, month - 1, day, BOGOTA_UTC_OFFSET_HOURS, 0, 0, 0)
}

export function getUtcExclusiveEndOfBogotaDate(
  date: string,
  timezone: string = AI_COST_REPORTING_TIMEZONE
) {
  return getUtcStartOfBogotaDate(
    addDaysToDateString(date, 1),
    assertAiCostReportingTimezone(timezone)
  )
}

export function listPeriodMonthsBetween(from: string, to: string) {
  const { month: fromMonth, year: fromYear } = parseDateString(from)
  const { month: toMonth, year: toYear } = parseDateString(to)
  const months: string[] = []
  let currentYear = fromYear
  let currentMonth = fromMonth

  while (
    currentYear < toYear ||
    (currentYear === toYear && currentMonth <= toMonth)
  ) {
    months.push(
      `${currentYear.toString().padStart(4, "0")}-${currentMonth
        .toString()
        .padStart(2, "0")}`
    )

    currentMonth += 1
    if (currentMonth > 12) {
      currentMonth = 1
      currentYear += 1
    }
  }

  return months
}

export function resolveAiCostRange(args: {
  from?: string
  timezone?: string
  to?: string
}) {
  const timezone = assertAiCostReportingTimezone(args.timezone)
  const to = args.to ?? getCurrentBogotaDateString()
  const from = args.from ?? addDaysToDateString(to, -29)
  const startAt = getUtcStartOfBogotaDate(from, timezone)
  const endExclusive = getUtcExclusiveEndOfBogotaDate(to, timezone)

  if (startAt >= endExclusive) {
    throw new ConvexError({
      code: "INVALID_DATE_RANGE",
      message: "El rango de fechas es inválido",
    })
  }

  return {
    endExclusive,
    from,
    periodMonths: listPeriodMonthsBetween(from, to),
    startAt,
    timezone,
    to,
  }
}

function getSourceTypeForSummary(value?: string): AiCostSourceType {
  switch (value) {
    case "audio_transcription":
    case "embedding":
    case "other":
      return value
    default:
      return "agent_message"
  }
}

function buildEventPatch(args: {
  assignmentType: AiCostAssignmentType
  conversationId?: Id<"conversations">
  coverage: ConversationCostCoverage
  message: ConversationCostBreakdownMessage
  organizationId: string
}) {
  return {
    assignmentType: args.assignmentType,
    conversationId: args.conversationId,
    costUsd: args.message.cost,
    coverage: args.coverage,
    eventAt: args.message.timestamp,
    messageId: args.message.messageId,
    metadata: {
      isCustomerVisible: args.message.isCustomerVisible,
      role: args.message.role,
      threadPurpose: args.message.threadPurpose,
    },
    model: args.message.model,
    organizationId: args.organizationId,
    periodMonth: getPeriodMonthForTimestamp(args.message.timestamp),
    pricingSource: "gateway_metadata" as const,
    provider: args.message.provider ?? AI_COST_DEFAULT_PROVIDER,
    sourceType: "agent_message" as const,
    threadId: args.message.threadId,
    usage: args.message.usage,
  }
}

function summarizeMessageForLedgerLog(
  message: ConversationCostBreakdownMessage
) {
  return {
    cost: message.cost,
    messageId: message.messageId,
    model: message.model,
    provider: message.provider,
    role: message.role,
    threadId: message.threadId,
    threadPurpose: message.threadPurpose,
    usage: message.usage,
  }
}

export function buildConversationAiCostSummaryFromEvents(
  events: Array<Pick<Doc<"aiCostEvents">, "costUsd" | "coverage" | "threadId">>,
  fallbackCoverage: ConversationCostCoverage = "complete"
): ConversationAiCostLedgerSummary {
  const threadIds = new Set<string>()
  let totalCost = 0
  let costCoverage = fallbackCoverage

  for (const event of events) {
    totalCost += event.costUsd
    if (event.coverage === "estimated") {
      costCoverage = "estimated"
    }
    if (typeof event.threadId === "string") {
      threadIds.add(event.threadId)
    }
  }

  const normalizedTotalCost = roundCost(totalCost)
  const messagesWithCost = events.length

  return {
    cost: messagesWithCost > 0 ? normalizedTotalCost : undefined,
    costCoverage,
    messagesWithCost,
    threadsCount: threadIds.size,
    totalCost: normalizedTotalCost,
  }
}

function hasUsageChanged(
  current: Doc<"aiCostEvents">["usage"],
  next: ReturnType<typeof buildEventPatch>["usage"]
) {
  return JSON.stringify(current ?? null) !== JSON.stringify(next ?? null)
}

function hasMetadataChanged(
  current: Doc<"aiCostEvents">["metadata"],
  next: ReturnType<typeof buildEventPatch>["metadata"]
) {
  return JSON.stringify(current ?? null) !== JSON.stringify(next ?? null)
}

function hasEventChanged(
  current: Doc<"aiCostEvents">,
  next: ReturnType<typeof buildEventPatch>
) {
  return (
    current.assignmentType !== next.assignmentType ||
    current.conversationId !== next.conversationId ||
    current.costUsd !== next.costUsd ||
    current.coverage !== next.coverage ||
    current.eventAt !== next.eventAt ||
    current.messageId !== next.messageId ||
    current.model !== next.model ||
    current.organizationId !== next.organizationId ||
    current.periodMonth !== next.periodMonth ||
    current.pricingSource !== next.pricingSource ||
    current.provider !== next.provider ||
    current.sourceType !== next.sourceType ||
    current.threadId !== next.threadId ||
    hasUsageChanged(current.usage, next.usage) ||
    hasMetadataChanged(current.metadata, next.metadata)
  )
}

async function getMonthlySummaryDoc(
  ctx: MutationCtx,
  organizationId: string,
  periodMonth: string
) {
  const docs = await ctx.db
    .query("organizationAiCostMonthly")
    .withIndex("by_organization_and_period_month", (q) =>
      q.eq("organizationId", organizationId).eq("periodMonth", periodMonth)
    )
    .collect()

  return docs[0] ?? null
}

export async function rebuildOrganizationMonthlySummary(
  ctx: MutationCtx,
  organizationId: string,
  periodMonth: string
) {
  const events = await ctx.db
    .query("aiCostEvents")
    .withIndex("by_organization_and_period_month", (q) =>
      q.eq("organizationId", organizationId).eq("periodMonth", periodMonth)
    )
    .collect()

  const existingSummary = await getMonthlySummaryDoc(
    ctx,
    organizationId,
    periodMonth
  )

  if (events.length === 0) {
    if (existingSummary) {
      await ctx.db.delete(existingSummary._id)
    }
    return null
  }

  const sourceBreakdown = createEmptySourceBreakdown()
  const pricingBreakdown = createEmptyPricingBreakdown()
  const conversationIds = new Set<string>()
  const unassignedThreadIds = new Set<string>()
  let conversationCostUsd = 0
  let unassignedCostUsd = 0
  let completeCostUsd = 0
  let estimatedCostUsd = 0
  let totalCostUsd = 0

  for (const event of events) {
    totalCostUsd += event.costUsd
    if (event.assignmentType === "organization_unassigned") {
      unassignedCostUsd += event.costUsd
      if (event.threadId) {
        unassignedThreadIds.add(event.threadId)
      }
    } else {
      conversationCostUsd += event.costUsd
    }
    addCostToSourceBreakdown(
      sourceBreakdown,
      getSourceTypeForSummary(event.sourceType),
      event.costUsd
    )
    addCostToPricingBreakdown(
      pricingBreakdown,
      event.pricingSource,
      event.costUsd
    )

    if (event.conversationId) {
      conversationIds.add(event.conversationId)
    }

    if (event.coverage === "estimated") {
      estimatedCostUsd += event.costUsd
    } else {
      completeCostUsd += event.costUsd
    }
  }

  const patch = {
    completeCostUsd: roundCost(completeCostUsd),
    conversationCostUsd: roundCost(conversationCostUsd),
    conversationsCount: conversationIds.size,
    estimatedCostUsd: roundCost(estimatedCostUsd),
    eventsCount: events.length,
    lastRebuiltAt: Date.now(),
    organizationId,
    periodMonth,
    pricingBreakdown,
    sourceBreakdown,
    totalCostUsd: roundCost(totalCostUsd),
    unassignedCostUsd: roundCost(unassignedCostUsd),
    unassignedEventsCount: events.filter(
      (event) => event.assignmentType === "organization_unassigned"
    ).length,
    unassignedThreadsCount: unassignedThreadIds.size,
  }

  if (existingSummary) {
    await ctx.db.patch(existingSummary._id, patch)
    return await ctx.db.get(existingSummary._id)
  }

  const summaryId = await ctx.db.insert("organizationAiCostMonthly", patch)
  return await ctx.db.get(summaryId)
}

async function getDailySummaryDoc(
  ctx: MutationCtx,
  organizationId: string,
  date: string
) {
  const docs = await ctx.db
    .query("organizationAiCostDaily")
    .withIndex("by_organization_and_date", (q) =>
      q.eq("organizationId", organizationId).eq("date", date)
    )
    .collect()

  return docs[0] ?? null
}

export async function rebuildOrganizationDailySummary(
  ctx: MutationCtx,
  organizationId: string,
  date: string
) {
  const startAt = getUtcStartOfBogotaDate(date)
  const endExclusive = getUtcExclusiveEndOfBogotaDate(date)

  const events = await ctx.db
    .query("aiCostEvents")
    .withIndex("by_organization_and_event_at", (q) =>
      q
        .eq("organizationId", organizationId)
        .gte("eventAt", startAt)
        .lt("eventAt", endExclusive)
    )
    .collect()

  const existingSummary = await getDailySummaryDoc(ctx, organizationId, date)

  if (events.length === 0) {
    if (existingSummary) {
      await ctx.db.delete(existingSummary._id)
    }
    return null
  }

  const sourceBreakdown = createEmptySourceBreakdown()
  let conversationCostUsd = 0
  let unassignedCostUsd = 0
  let totalCostUsd = 0

  for (const event of events) {
    totalCostUsd += event.costUsd
    if (event.assignmentType === "organization_unassigned") {
      unassignedCostUsd += event.costUsd
    } else {
      conversationCostUsd += event.costUsd
    }
    addCostToSourceBreakdown(
      sourceBreakdown,
      getSourceTypeForSummary(event.sourceType),
      event.costUsd
    )
  }

  const dailyPatch = {
    conversationCostUsd: roundCost(conversationCostUsd),
    date,
    eventsCount: events.length,
    organizationId,
    sourceBreakdown,
    totalCostUsd: roundCost(totalCostUsd),
    unassignedCostUsd: roundCost(unassignedCostUsd),
  }

  if (existingSummary) {
    await ctx.db.patch(existingSummary._id, dailyPatch)
    return await ctx.db.get(existingSummary._id)
  }

  const summaryId = await ctx.db.insert("organizationAiCostDaily", dailyPatch)
  return await ctx.db.get(summaryId)
}

export async function syncAiCostEventsForThread(
  ctx: MutationCtx,
  args: {
    assignmentType: AiCostAssignmentType
    breakdown: ConversationCostBreakdown
    conversationId?: Id<"conversations">
    coverage: ConversationCostCoverage
    organizationId: string
    threadId: string
  }
) {
  const baseLogContext = {
    assignmentType: args.assignmentType,
    breakdownMessages: args.breakdown.messages.length,
    breakdownTotalCost: args.breakdown.totalCost,
    conversationId: args.conversationId,
    coverage: args.coverage,
    organizationId: args.organizationId,
    threadId: args.threadId,
  }

  let existingEvents: Doc<"aiCostEvents">[]
  try {
    existingEvents = await ctx.db
      .query("aiCostEvents")
      .withIndex("by_organization_and_thread_id", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("threadId", args.threadId)
      )
      .collect()
  } catch (error) {
    console.error(
      "[AI COST LEDGER] Failed to load existing events for thread",
      {
        ...baseLogContext,
        messageIds: args.breakdown.messages
          .slice(0, 10)
          .map((message) => message.messageId),
      }
    )
    console.error(error)
    throw error
  }

  const existingByMessageId = new Map(
    existingEvents
      .filter(
        (
          event
        ): event is Doc<"aiCostEvents"> & {
          messageId: string
        } => typeof event.messageId === "string"
      )
      .map((event) => [event.messageId, event])
  )
  const touchedPeriods = new Set<string>()
  const touchedDates = new Set<string>()
  const seenMessageIds = new Set<string>()

  for (const message of args.breakdown.messages) {
    const patch = buildEventPatch({
      assignmentType: args.assignmentType,
      conversationId: args.conversationId,
      coverage: args.coverage,
      message,
      organizationId: args.organizationId,
    })
    const existing = existingByMessageId.get(message.messageId)
    seenMessageIds.add(message.messageId)

    if (!existing) {
      try {
        await ctx.db.insert("aiCostEvents", patch)
      } catch (error) {
        console.error("[AI COST LEDGER] Failed to insert ai cost event", {
          ...baseLogContext,
          message: summarizeMessageForLedgerLog(message),
        })
        console.error(error)
        throw error
      }
      touchedPeriods.add(patch.periodMonth)
      touchedDates.add(getDailyDateForTimestamp(patch.eventAt))
      continue
    }

    if (hasEventChanged(existing, patch)) {
      touchedPeriods.add(existing.periodMonth)
      touchedPeriods.add(patch.periodMonth)
      touchedDates.add(getDailyDateForTimestamp(existing.eventAt))
      touchedDates.add(getDailyDateForTimestamp(patch.eventAt))
      try {
        await ctx.db.patch(existing._id, patch)
      } catch (error) {
        console.error("[AI COST LEDGER] Failed to patch ai cost event", {
          ...baseLogContext,
          existingEventId: existing._id,
          message: summarizeMessageForLedgerLog(message),
        })
        console.error(error)
        throw error
      }
    }
  }

  for (const existing of existingEvents) {
    if (
      existing.sourceType === "agent_message" &&
      existing.messageId &&
      !seenMessageIds.has(existing.messageId)
    ) {
      touchedPeriods.add(existing.periodMonth)
      touchedDates.add(getDailyDateForTimestamp(existing.eventAt))
      try {
        await ctx.db.delete(existing._id)
      } catch (error) {
        console.error("[AI COST LEDGER] Failed to delete stale ai cost event", {
          ...baseLogContext,
          existingEventId: existing._id,
          staleMessageId: existing.messageId,
        })
        console.error(error)
        throw error
      }
    }
  }

  try {
    await Promise.all([
      ...[...touchedPeriods].map((periodMonth) =>
        rebuildOrganizationMonthlySummary(ctx, args.organizationId, periodMonth)
      ),
      ...[...touchedDates].map((date) =>
        rebuildOrganizationDailySummary(ctx, args.organizationId, date)
      ),
    ])
  } catch (error) {
    console.error("[AI COST LEDGER] Failed to rebuild summaries", {
      ...baseLogContext,
      touchedPeriods: [...touchedPeriods],
      touchedDates: [...touchedDates],
    })
    console.error(error)
    throw error
  }

  await markOrganizationAiThreadLedgerSynced(ctx, {
    costUsd: roundCost(args.breakdown.totalCost),
    messagesWithCost: args.breakdown.messagesWithCost,
    organizationId: args.organizationId,
    threadId: args.threadId,
  })
}

export async function syncConversationAiCostEvents(
  ctx: MutationCtx,
  args: {
    breakdown: ConversationCostBreakdown
    conversation: Pick<Doc<"conversations">, "_id" | "organizationId">
    coverage: ConversationCostCoverage
    failedThreadIds?: string[]
  }
) {
  const messagesByThread = new Map<string, ConversationCostBreakdownMessage[]>()

  for (const message of args.breakdown.messages) {
    const current = messagesByThread.get(message.threadId) ?? []
    current.push(message)
    messagesByThread.set(message.threadId, current)
  }

  let existingThreadIds: Set<string>
  try {
    existingThreadIds = new Set(
      (
        await ctx.db
          .query("aiCostEvents")
          .withIndex("by_conversation_id", (q) =>
            q.eq("conversationId", args.conversation._id)
          )
          .collect()
      )
        .map((event) => event.threadId)
        .filter((threadId): threadId is string => typeof threadId === "string")
    )
  } catch (error) {
    console.error(
      "[AI COST LEDGER] Failed to load existing thread ids for conversation",
      {
        conversationId: args.conversation._id,
        coverage: args.coverage,
        organizationId: args.conversation.organizationId,
        threadIdsFromBreakdown: [...messagesByThread.keys()],
      }
    )
    console.error(error)
    throw error
  }

  for (const [threadId, messages] of messagesByThread) {
    await syncAiCostEventsForThread(ctx, {
      assignmentType: "conversation",
      breakdown: {
        messages,
        messagesWithCost: messages.length,
        threadsCount: 1,
        totalCost: roundCost(
          messages.reduce((sum, message) => sum + message.cost, 0)
        ),
      },
      conversationId: args.conversation._id,
      coverage: args.coverage,
      organizationId: args.conversation.organizationId,
      threadId,
    })
  }

  for (const threadId of getStaleConversationThreadIds({
    existingThreadIds,
    failedThreadIds: args.failedThreadIds,
    syncedThreadIds: messagesByThread.keys(),
  })) {
    await syncAiCostEventsForThread(ctx, {
      assignmentType: "conversation",
      breakdown: {
        messages: [],
        messagesWithCost: 0,
        threadsCount: 1,
        totalCost: 0,
      },
      conversationId: args.conversation._id,
      coverage: args.coverage,
      organizationId: args.conversation.organizationId,
      threadId,
    })
  }
}

export function getStaleConversationThreadIds(args: {
  existingThreadIds: Iterable<string>
  failedThreadIds?: Iterable<string>
  syncedThreadIds: Iterable<string>
}) {
  const failedThreadIds = new Set(args.failedThreadIds ?? [])
  const syncedThreadIds = new Set(args.syncedThreadIds)

  return [...new Set(args.existingThreadIds)].filter(
    (threadId) =>
      !syncedThreadIds.has(threadId) && !failedThreadIds.has(threadId)
  )
}

export function buildAiCostMonthlySeries(
  events: Array<
    Pick<
      Doc<"aiCostEvents">,
      "costUsd" | "coverage" | "periodMonth" | "sourceType"
    >
  >,
  periodMonths: string[]
): AiCostMonthlySeriesRow[] {
  const byPeriod = new Map<string, AiCostMonthlySeriesRow>()

  for (const event of events) {
    const current = byPeriod.get(event.periodMonth) ?? {
      completeCostUsd: 0,
      estimatedCostUsd: 0,
      eventsCount: 0,
      periodMonth: event.periodMonth,
      sourceBreakdown: createEmptySourceBreakdown(),
      totalCostUsd: 0,
    }

    current.totalCostUsd = roundCost(current.totalCostUsd + event.costUsd)
    current.eventsCount += 1

    if (event.coverage === "estimated") {
      current.estimatedCostUsd = roundCost(
        current.estimatedCostUsd + event.costUsd
      )
    } else {
      current.completeCostUsd = roundCost(
        current.completeCostUsd + event.costUsd
      )
    }

    addCostToSourceBreakdown(
      current.sourceBreakdown,
      event.sourceType,
      event.costUsd
    )

    byPeriod.set(event.periodMonth, current)
  }

  return periodMonths.map((periodMonth) => {
    const row = byPeriod.get(periodMonth)
    return {
      completeCostUsd: row?.completeCostUsd ?? 0,
      estimatedCostUsd: row?.estimatedCostUsd ?? 0,
      eventsCount: row?.eventsCount ?? 0,
      periodMonth,
      sourceBreakdown: cloneSourceBreakdown(row?.sourceBreakdown),
      totalCostUsd: row?.totalCostUsd ?? 0,
    }
  })
}

export function buildAiCostMonthlySeriesFromRows(
  rows: AiCostMonthlySeriesInputRow[],
  periodMonths: string[]
): AiCostMonthlySeriesRow[] {
  const byPeriod = new Map<string, AiCostMonthlySeriesRow>()

  for (const row of rows) {
    const current = byPeriod.get(row.periodMonth) ?? {
      completeCostUsd: 0,
      estimatedCostUsd: 0,
      eventsCount: 0,
      periodMonth: row.periodMonth,
      sourceBreakdown: createEmptySourceBreakdown(),
      totalCostUsd: 0,
    }

    current.completeCostUsd = roundCost(
      current.completeCostUsd + row.completeCostUsd
    )
    current.estimatedCostUsd = roundCost(
      current.estimatedCostUsd + row.estimatedCostUsd
    )
    current.eventsCount += row.eventsCount
    current.totalCostUsd = roundCost(current.totalCostUsd + row.totalCostUsd)
    current.sourceBreakdown.agentMessage = roundCost(
      current.sourceBreakdown.agentMessage +
        (row.sourceBreakdown.agentMessage ?? 0)
    )
    current.sourceBreakdown.audioTranscription = roundCost(
      current.sourceBreakdown.audioTranscription +
        (row.sourceBreakdown.audioTranscription ?? 0)
    )
    current.sourceBreakdown.embedding = roundCost(
      current.sourceBreakdown.embedding + (row.sourceBreakdown.embedding ?? 0)
    )
    current.sourceBreakdown.other = roundCost(
      current.sourceBreakdown.other + (row.sourceBreakdown.other ?? 0)
    )

    byPeriod.set(row.periodMonth, current)
  }

  return periodMonths.map((periodMonth) => {
    const row = byPeriod.get(periodMonth)
    return {
      completeCostUsd: row?.completeCostUsd ?? 0,
      estimatedCostUsd: row?.estimatedCostUsd ?? 0,
      eventsCount: row?.eventsCount ?? 0,
      periodMonth,
      sourceBreakdown: cloneSourceBreakdown(row?.sourceBreakdown),
      totalCostUsd: row?.totalCostUsd ?? 0,
    }
  })
}
