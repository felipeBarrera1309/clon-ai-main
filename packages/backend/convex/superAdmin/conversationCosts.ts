import { makeFunctionReference, paginationOptsValidator } from "convex/server"
import { ConvexError, v } from "convex/values"
import { components } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import { aggregateConversationsByOrganization } from "../conversationsAggregate"
import {
  organizationAiCostCalculationOutcomeValidator,
  organizationAiCostCalculationPhaseValidator,
  organizationAiCostCoverageStatusValidator,
  organizationAiCostReasonCodeValidator,
} from "../lib/aiCostDomain"
import {
  AI_COST_REPORTING_TIMEZONE,
  addCostToPricingBreakdown,
  addCostToSourceBreakdown,
  buildAiCostMonthlySeries,
  buildAiCostMonthlySeriesFromRows,
  buildConversationAiCostSummaryFromEvents,
  clonePricingBreakdown,
  cloneSourceBreakdown,
  createEmptyPricingBreakdown,
  createEmptySourceBreakdown,
  getCurrentBogotaDateString,
  getUtcStartOfBogotaDate,
  resolveAiCostRange,
} from "../lib/aiCostLedger"
import {
  getConversationCostMessagePreview,
  getConversationCostThreadsWithFallback,
  listAllThreadMessages,
} from "../lib/conversationCost"
import { ConversationNotFoundError, UnauthorizedError } from "../lib/errors"
import { getOrganizationAiCostJobMode } from "../lib/organizationAiCostState"
import {
  platformAdminAction,
  platformAdminMutation,
  platformAdminQuery,
} from "../lib/superAdmin"
import { listConversationAiThreads } from "../model/conversationAiThreads"

const roundCost = (value: number) => Number(value.toFixed(4))
const DEFAULT_REPORT_TIMEZONE = AI_COST_REPORTING_TIMEZONE
const AI_COST_EVENT_SCAN_LIMIT = 10_000
const AI_COST_AUDIT_SCAN_LIMIT = 5_000
const PERIOD_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

const getJobForOrganizationRef = makeFunctionReference<"query">(
  "system/migrations/backfillConversationCosts:getJobForOrganization"
)
const startOrResumeConversationCostBackfillRef =
  makeFunctionReference<"action">(
    "system/migrations/backfillConversationCosts:launchOrganizationBackfill"
  )
const getConversationCostSnapshotRef = makeFunctionReference<"query">(
  "system/conversations:getCostSnapshot"
)
const listConversationLedgerEventsRef = makeFunctionReference<"query">(
  "system/conversations:listLedgerEvents"
)
const reconcileConversationCostLedgerRef = makeFunctionReference<"mutation">(
  "system/conversations:reconcileCostLedger"
)

type ConversationCostListOrder = "cost_desc" | "recent_desc"
type PlatformOrganizationSort = "cost_desc" | "name_asc"
const coverageStatusSortOrder = {
  running: 0,
  partial: 1,
  not_started: 2,
  complete: 3,
} as const

const conversationCostListOrderValidator = v.union(
  v.literal("cost_desc"),
  v.literal("recent_desc")
)

const platformOrganizationSortValidator = v.union(
  v.literal("cost_desc"),
  v.literal("name_asc")
)

const rangeArgs = {
  from: v.optional(v.string()),
  timezone: v.optional(v.string()),
  to: v.optional(v.string()),
}

type ReportingQueryCtx = {
  db: QueryCtx["db"]
  runQuery: QueryCtx["runQuery"]
}

type ReportingRange = ReturnType<typeof resolveAiCostRange>
type CappedEventScanResult = {
  events: Doc<"aiCostEvents">[]
  truncated: boolean
}
type CountableAiCostEvent = Pick<
  Doc<"aiCostEvents">,
  "assignmentType" | "conversationId" | "threadId"
>
type MonthlySummaryRow = Pick<
  Doc<"organizationAiCostMonthly">,
  | "completeCostUsd"
  | "conversationCostUsd"
  | "conversationsCount"
  | "estimatedCostUsd"
  | "eventsCount"
  | "organizationId"
  | "periodMonth"
  | "pricingBreakdown"
  | "sourceBreakdown"
  | "totalCostUsd"
  | "unassignedCostUsd"
  | "unassignedEventsCount"
  | "unassignedThreadsCount"
>
type OrganizationCoverageRow = Doc<"organizationAiCostCoverage">
type OrganizationAuditEntryRow = Doc<"organizationAiCostCalculationEntries">

function serializeCoverageStatus(coverage: OrganizationCoverageRow | null) {
  if (!coverage) {
    return {
      activeJobId: undefined,
      hasFailures: false,
      isComplete: false,
      lastCompletedAt: undefined,
      lastFullScanAt: undefined,
      lastJobId: undefined,
      lastJobMode: undefined,
      lastStartedAt: undefined,
      lastUpdatedAt: undefined,
      status: "not_started" as const,
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

  return {
    activeJobId: coverage.activeJobId,
    hasFailures: coverage.threadsFailed > 0,
    isComplete: coverage.status === "complete",
    lastCompletedAt: coverage.lastCompletedAt,
    lastFullScanAt: coverage.lastFullScanAt,
    lastJobId: coverage.lastJobId,
    lastJobMode: coverage.lastJobMode,
    lastStartedAt: coverage.lastStartedAt,
    lastUpdatedAt: coverage.lastUpdatedAt,
    status: coverage.status,
    threadsCostFailed: coverage.threadsCostFailed,
    threadsCostPending: coverage.threadsCostPending,
    threadsCostSynced: coverage.threadsCostSynced,
    threadsDiscovered: coverage.threadsDiscovered,
    threadsFailed: coverage.threadsFailed,
    threadsFailedResolution: coverage.threadsFailedResolution,
    threadsIgnored: coverage.threadsIgnored,
    threadsPending: coverage.threadsPending,
    threadsPendingResolution: coverage.threadsPendingResolution,
    threadsRelevant: coverage.threadsRelevant,
    threadsResolvedConversation: coverage.threadsResolvedConversation,
    threadsResolvedUnassigned: coverage.threadsResolvedUnassigned,
  }
}

function serializeBackfillJob(
  backfillJob: Doc<"conversationCostBackfillJobs"> | null
) {
  return backfillJob
    ? {
        batchSize: backfillJob.batchSize,
        cutoffTimestamp: backfillJob.cutoffTimestamp,
        failed: backfillJob.failed,
        finishedAt: backfillJob.finishedAt,
        lastError: backfillJob.lastError,
        mode: getOrganizationAiCostJobMode(backfillJob.mode),
        phase: backfillJob.phase,
        processed: backfillJob.processed,
        skipped: backfillJob.skipped,
        startedAt: backfillJob.startedAt,
        status: backfillJob.status,
        updated: backfillJob.updated,
      }
    : null
}

function buildDefaultRange() {
  const to = getCurrentBogotaDateString()
  const range = resolveAiCostRange({ to })

  return {
    from: range.from,
    timezone: range.timezone,
    to: range.to,
  }
}

function parsePeriodMonth(periodMonth: string) {
  if (!PERIOD_MONTH_REGEX.test(periodMonth)) {
    throw new ConvexError({
      code: "INVALID_PERIOD_MONTH",
      message: "El mes debe tener formato YYYY-MM",
    })
  }

  const [yearRaw, monthRaw] = periodMonth.split("-").map(Number)
  return {
    month: monthRaw ?? 0,
    year: yearRaw ?? 0,
  }
}

function getPeriodMonthStartDate(periodMonth: string) {
  return `${periodMonth}-01`
}

function getPeriodMonthEndDate(periodMonth: string) {
  const { month, year } = parsePeriodMonth(periodMonth)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${periodMonth}-${lastDay.toString().padStart(2, "0")}`
}

function getNextPeriodMonth(periodMonth: string) {
  const { month, year } = parsePeriodMonth(periodMonth)
  if (month === 12) {
    return `${(year + 1).toString().padStart(4, "0")}-01`
  }

  return `${year.toString().padStart(4, "0")}-${(month + 1)
    .toString()
    .padStart(2, "0")}`
}

function getFullPeriodMonths(range: ReportingRange) {
  const startMonth = range.from.slice(0, 7)
  const endMonth = range.to.slice(0, 7)
  const fullMonths = new Set(range.periodMonths)

  if (range.from !== getPeriodMonthStartDate(startMonth)) {
    fullMonths.delete(startMonth)
  }

  if (range.to !== getPeriodMonthEndDate(endMonth)) {
    fullMonths.delete(endMonth)
  }

  return range.periodMonths.filter((periodMonth) => fullMonths.has(periodMonth))
}

function getPartialRangeWindows(range: ReportingRange) {
  const startMonth = range.from.slice(0, 7)
  const endMonth = range.to.slice(0, 7)
  const windows: Array<{
    endExclusive: number
    startAt: number
  }> = []

  if (startMonth === endMonth) {
    if (
      range.from === getPeriodMonthStartDate(startMonth) &&
      range.to === getPeriodMonthEndDate(endMonth)
    ) {
      return windows
    }

    windows.push({
      endExclusive: range.endExclusive,
      startAt: range.startAt,
    })
    return windows
  }

  if (range.from !== getPeriodMonthStartDate(startMonth)) {
    windows.push({
      endExclusive: getUtcStartOfBogotaDate(
        getPeriodMonthStartDate(getNextPeriodMonth(startMonth)),
        range.timezone
      ),
      startAt: range.startAt,
    })
  }

  if (range.to !== getPeriodMonthEndDate(endMonth)) {
    windows.push({
      endExclusive: range.endExclusive,
      startAt: getUtcStartOfBogotaDate(
        getPeriodMonthStartDate(endMonth),
        range.timezone
      ),
    })
  }

  return windows
}

function addSourceBreakdown(
  target: ReturnType<typeof createEmptySourceBreakdown>,
  incoming?: Partial<ReturnType<typeof createEmptySourceBreakdown>>
) {
  target.agentMessage = roundCost(
    target.agentMessage + (incoming?.agentMessage ?? 0)
  )
  target.audioTranscription = roundCost(
    target.audioTranscription + (incoming?.audioTranscription ?? 0)
  )
  target.embedding = roundCost(target.embedding + (incoming?.embedding ?? 0))
  target.other = roundCost(target.other + (incoming?.other ?? 0))
}

function aggregatePricingSourceTotals(
  events:
    | Doc<"aiCostEvents">[]
    | Array<Pick<Doc<"aiCostEvents">, "costUsd" | "pricingSource">>
) {
  const pricingBreakdown = createEmptyPricingBreakdown()

  for (const event of events) {
    addCostToPricingBreakdown(
      pricingBreakdown,
      event.pricingSource,
      event.costUsd
    )
  }

  return pricingBreakdown
}

async function listEventsForOrganizationInRange(
  ctx: ReportingQueryCtx,
  args: {
    from?: string
    organizationId: string
    timezone?: string
    to?: string
  }
) {
  const range = resolveAiCostRange(args)
  const events = await ctx.db
    .query("aiCostEvents")
    .withIndex("by_organization_and_event_at", (q) =>
      q
        .eq("organizationId", args.organizationId)
        .gte("eventAt", range.startAt)
        .lte("eventAt", range.endExclusive - 1)
    )
    .take(AI_COST_EVENT_SCAN_LIMIT + 1)

  return {
    events: events.slice(0, AI_COST_EVENT_SCAN_LIMIT),
    range,
    truncated: events.length > AI_COST_EVENT_SCAN_LIMIT,
  }
}

async function listGlobalEventsInRange(
  ctx: ReportingQueryCtx,
  args: {
    from?: string
    timezone?: string
    to?: string
  }
) {
  const range = resolveAiCostRange(args)
  const events = await ctx.db
    .query("aiCostEvents")
    .withIndex("by_event_at", (q) =>
      q.gte("eventAt", range.startAt).lte("eventAt", range.endExclusive - 1)
    )
    .take(AI_COST_EVENT_SCAN_LIMIT + 1)

  return {
    events: events.slice(0, AI_COST_EVENT_SCAN_LIMIT),
    range,
    truncated: events.length > AI_COST_EVENT_SCAN_LIMIT,
  }
}

async function listOrganizationSummaryRowsInRange(
  ctx: ReportingQueryCtx,
  organizationId: string,
  range: ReportingRange
) {
  const fullMonths = getFullPeriodMonths(range)

  if (fullMonths.length === 0) {
    return []
  }

  return await ctx.db
    .query("organizationAiCostMonthly")
    .withIndex("by_organization_and_period_month", (q) =>
      q
        .eq("organizationId", organizationId)
        .gte("periodMonth", fullMonths[0] ?? range.from.slice(0, 7))
        .lte(
          "periodMonth",
          fullMonths[fullMonths.length - 1] ?? range.to.slice(0, 7)
        )
    )
    .collect()
}

async function listGlobalSummaryRowsInRange(
  ctx: ReportingQueryCtx,
  range: ReportingRange
) {
  const fullMonths = getFullPeriodMonths(range)

  if (fullMonths.length === 0) {
    return []
  }

  return await ctx.db
    .query("organizationAiCostMonthly")
    .withIndex("by_period_month", (q) =>
      q
        .gte("periodMonth", fullMonths[0] ?? range.from.slice(0, 7))
        .lte(
          "periodMonth",
          fullMonths[fullMonths.length - 1] ?? range.to.slice(0, 7)
        )
    )
    .collect()
}

async function getOrganizationCoverageRow(
  ctx: ReportingQueryCtx,
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

async function listCappedOrganizationBoundaryEvents(
  ctx: ReportingQueryCtx,
  organizationId: string,
  range: ReportingRange
): Promise<CappedEventScanResult> {
  const windows = getPartialRangeWindows(range)
  const events: Doc<"aiCostEvents">[] = []

  for (const window of windows) {
    const remaining = AI_COST_EVENT_SCAN_LIMIT + 1 - events.length
    if (remaining <= 0) {
      break
    }

    const batch = await ctx.db
      .query("aiCostEvents")
      .withIndex("by_organization_and_event_at", (q) =>
        q
          .eq("organizationId", organizationId)
          .gte("eventAt", window.startAt)
          .lte("eventAt", window.endExclusive - 1)
      )
      .take(remaining)

    events.push(...batch)
  }

  return {
    events: events.slice(0, AI_COST_EVENT_SCAN_LIMIT),
    truncated: events.length > AI_COST_EVENT_SCAN_LIMIT,
  }
}

async function listCappedGlobalBoundaryEvents(
  ctx: ReportingQueryCtx,
  range: ReportingRange
): Promise<CappedEventScanResult> {
  const windows = getPartialRangeWindows(range)
  const events: Doc<"aiCostEvents">[] = []

  for (const window of windows) {
    const remaining = AI_COST_EVENT_SCAN_LIMIT + 1 - events.length
    if (remaining <= 0) {
      break
    }

    const batch = await ctx.db
      .query("aiCostEvents")
      .withIndex("by_event_at", (q) =>
        q.gte("eventAt", window.startAt).lte("eventAt", window.endExclusive - 1)
      )
      .take(remaining)

    events.push(...batch)
  }

  return {
    events: events.slice(0, AI_COST_EVENT_SCAN_LIMIT),
    truncated: events.length > AI_COST_EVENT_SCAN_LIMIT,
  }
}

function aggregateEventsSummary(events: Doc<"aiCostEvents">[]) {
  const sourceBreakdown = createEmptySourceBreakdown()
  const conversationIds = new Set<string>()
  const organizationIds = new Set<string>()
  const unassignedThreadIds = new Set<string>()
  let conversationCostUsd = 0
  let estimatedCoverageCostUsd = 0
  let totalCostUsd = 0
  let unassignedThreadCostUsd = 0

  for (const event of events) {
    totalCostUsd += event.costUsd
    if (event.assignmentType === "organization_unassigned") {
      unassignedThreadCostUsd += event.costUsd
      if (event.threadId) {
        unassignedThreadIds.add(event.threadId)
      }
    } else {
      conversationCostUsd += event.costUsd
    }
    if (event.coverage === "estimated") {
      estimatedCoverageCostUsd += event.costUsd
    }

    if (event.sourceType === "audio_transcription") {
      sourceBreakdown.audioTranscription = roundCost(
        sourceBreakdown.audioTranscription + event.costUsd
      )
    } else if (event.sourceType === "embedding") {
      sourceBreakdown.embedding = roundCost(
        sourceBreakdown.embedding + event.costUsd
      )
    } else if (event.sourceType === "other") {
      sourceBreakdown.other = roundCost(sourceBreakdown.other + event.costUsd)
    } else {
      sourceBreakdown.agentMessage = roundCost(
        sourceBreakdown.agentMessage + event.costUsd
      )
    }

    if (event.conversationId) {
      conversationIds.add(event.conversationId.toString())
    }
    organizationIds.add(event.organizationId)
  }

  return {
    conversationCostUsd: roundCost(conversationCostUsd),
    organizationCount: organizationIds.size,
    pricingBreakdown: aggregatePricingSourceTotals(events),
    sourceBreakdown,
    totalConversations: conversationIds.size,
    totalCostUsd: roundCost(totalCostUsd),
    totalEstimatedCoverageCostUsd: roundCost(estimatedCoverageCostUsd),
    totalEvents: events.length,
    totalUnassignedThreads: unassignedThreadIds.size,
    unassignedThreadCostUsd: roundCost(unassignedThreadCostUsd),
  }
}

function aggregateSummaryRows(rows: MonthlySummaryRow[]) {
  const organizationIds = new Set<string>()
  const pricingBreakdown = createEmptyPricingBreakdown()
  const sourceBreakdown = createEmptySourceBreakdown()
  let conversationCostUsd = 0
  let summedConversationsCount = 0
  let totalCostUsd = 0
  let totalEstimatedCoverageCostUsd = 0
  let totalEvents = 0
  let unassignedThreadCostUsd = 0
  let unassignedEventsCount = 0
  let summedUnassignedThreadsCount = 0

  for (const row of rows) {
    organizationIds.add(row.organizationId)
    conversationCostUsd += row.conversationCostUsd
    summedConversationsCount += row.conversationsCount
    totalCostUsd += row.totalCostUsd
    totalEstimatedCoverageCostUsd += row.estimatedCostUsd
    totalEvents += row.eventsCount
    unassignedThreadCostUsd += row.unassignedCostUsd
    unassignedEventsCount += row.unassignedEventsCount
    summedUnassignedThreadsCount += row.unassignedThreadsCount
    addSourceBreakdown(sourceBreakdown, row.sourceBreakdown)
    pricingBreakdown.estimatedPricingCostUsd = roundCost(
      pricingBreakdown.estimatedPricingCostUsd +
        (row.pricingBreakdown?.estimatedPricingCostUsd ?? 0)
    )
    pricingBreakdown.exactPricingCostUsd = roundCost(
      pricingBreakdown.exactPricingCostUsd +
        (row.pricingBreakdown?.exactPricingCostUsd ?? 0)
    )
  }

  return {
    conversationCostUsd: roundCost(conversationCostUsd),
    organizationCount: organizationIds.size,
    pricingBreakdown,
    sourceBreakdown,
    summedConversationsCount,
    summedUnassignedThreadsCount,
    totalCostUsd: roundCost(totalCostUsd),
    totalEstimatedCoverageCostUsd: roundCost(totalEstimatedCoverageCostUsd),
    totalEvents,
    unassignedEventsCount,
    unassignedThreadCostUsd: roundCost(unassignedThreadCostUsd),
  }
}

export function buildMonthlySeriesFromSummaries(
  rows: MonthlySummaryRow[],
  periodMonths: string[]
) {
  return buildAiCostMonthlySeriesFromRows(rows, periodMonths)
}

export function getOffsetPageHasMore(
  totalRows: number,
  offset: number,
  limit: number
) {
  return offset + limit < totalRows
}

function mergeMonthlySeries(
  baseSeries: ReturnType<typeof buildAiCostMonthlySeries>,
  incomingSeries: ReturnType<typeof buildAiCostMonthlySeries>
) {
  const byPeriod = new Map(
    baseSeries.map((row) => [row.periodMonth, { ...row }])
  )

  for (const row of incomingSeries) {
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
    addSourceBreakdown(current.sourceBreakdown, row.sourceBreakdown)
    byPeriod.set(row.periodMonth, current)
  }

  return baseSeries.map((row) => byPeriod.get(row.periodMonth) ?? row)
}

function buildConversationCostRow(args: {
  aggregate: {
    costCoverage: "complete" | "estimated"
    costInRange: number
    lastEventAt: number
  }
  conversation: Pick<
    Doc<"conversations">,
    | "_creationTime"
    | "_id"
    | "contactId"
    | "cost"
    | "costCoverage"
    | "costUpdatedAt"
    | "lastMessageAt"
    | "status"
    | "threadId"
  >
}) {
  return {
    contactId: args.conversation.contactId,
    conversationId: args.conversation._id,
    costCoverage:
      args.aggregate.costCoverage === "estimated"
        ? "estimated"
        : args.conversation.costCoverage,
    costInRange: roundCost(args.aggregate.costInRange),
    costUpdatedAt: args.conversation.costUpdatedAt,
    createdAt: args.conversation._creationTime,
    lastEventAt: args.aggregate.lastEventAt,
    lastMessageAt: args.conversation.lastMessageAt,
    lifetimeCost: args.conversation.cost ?? 0,
    status: args.conversation.status,
    threadId: args.conversation.threadId,
  }
}

function getConversationActivityTimestamp(value: {
  createdAt: number
  lastMessageAt?: number
}) {
  return value.lastMessageAt ?? value.createdAt
}

export function sortConversationCostRowsByRecent(
  rows: Array<
    ReturnType<typeof buildConversationCostRow> & {
      contactDisplayName?: string
      contactPhone?: string
    }
  >
) {
  return [...rows].sort((a, b) => {
    const activityDelta =
      getConversationActivityTimestamp(b) - getConversationActivityTimestamp(a)

    if (activityDelta !== 0) {
      return activityDelta
    }

    if (b.costInRange !== a.costInRange) {
      return b.costInRange - a.costInRange
    }

    return b.lastEventAt - a.lastEventAt
  })
}

async function hydrateConversationCostRows(
  ctx: ReportingQueryCtx,
  aggregates: Array<{
    conversationId: Id<"conversations">
    costCoverage: "complete" | "estimated"
    costInRange: number
    lastEventAt: number
  }>
) {
  if (aggregates.length === 0) {
    return []
  }

  const conversationDocs = await Promise.all(
    aggregates.map((aggregate) => ctx.db.get(aggregate.conversationId))
  )
  const conversations = conversationDocs.filter(
    (conversation): conversation is Doc<"conversations"> =>
      conversation !== null
  )
  const contacts = await Promise.all(
    [
      ...new Set(conversations.map((conversation) => conversation.contactId)),
    ].map((contactId) => ctx.db.get(contactId))
  )
  const contactsMap = new Map(
    contacts
      .filter((contact): contact is Doc<"contacts"> => contact !== null)
      .map((contact) => [contact._id, contact])
  )
  const aggregatesByConversationId = new Map(
    aggregates.map((aggregate) => [aggregate.conversationId, aggregate])
  )

  return conversations
    .map((conversation) => {
      const aggregate = aggregatesByConversationId.get(conversation._id)
      if (!aggregate) {
        return null
      }

      const contact = contactsMap.get(conversation.contactId)

      return {
        ...buildConversationCostRow({
          aggregate,
          conversation,
        }),
        contactDisplayName: contact?.displayName,
        contactPhone: contact?.phoneNumber,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
}

function countUniqueConversations(events: CountableAiCostEvent[]) {
  const conversationIds = new Set<string>()

  for (const event of events) {
    if (event.conversationId) {
      conversationIds.add(event.conversationId)
    }
  }

  return conversationIds.size
}

function countUniqueUnassignedThreads(events: CountableAiCostEvent[]) {
  const threadIds = new Set<string>()

  for (const event of events) {
    if (
      event.assignmentType === "organization_unassigned" &&
      typeof event.threadId === "string"
    ) {
      threadIds.add(event.threadId)
    }
  }

  return threadIds.size
}

function isSingleFullMonthRange(range: ReportingRange) {
  return (
    getPartialRangeWindows(range).length === 0 &&
    range.periodMonths.length === 1
  )
}

export function buildOverviewUniqueCounts(args: {
  countEvents: CountableAiCostEvent[]
  countScanTruncated: boolean
  rangeCoversSingleFullMonth: boolean
  summedMonthlyConversationsCount: number
  summedMonthlyUnassignedThreadsCount: number
}) {
  if (!args.countScanTruncated) {
    return {
      totalConversations: countUniqueConversations(args.countEvents),
      totalUnassignedThreads: countUniqueUnassignedThreads(args.countEvents),
      uniqueCountsLowerBound: false,
    }
  }

  if (args.rangeCoversSingleFullMonth) {
    return {
      totalConversations: args.summedMonthlyConversationsCount,
      totalUnassignedThreads: args.summedMonthlyUnassignedThreadsCount,
      uniqueCountsLowerBound: false,
    }
  }

  return {
    totalConversations: countUniqueConversations(args.countEvents),
    totalUnassignedThreads: countUniqueUnassignedThreads(args.countEvents),
    uniqueCountsLowerBound: true,
  }
}

export function hasLedgerRowsForOrganizationRange(args: {
  boundaryEventCount: number
  countEventCount?: number
  summaryRowCount: number
}) {
  return (
    args.summaryRowCount > 0 ||
    args.boundaryEventCount > 0 ||
    (args.countEventCount ?? 0) > 0
  )
}

async function getOrganizationsMetadata(
  ctx: ReportingQueryCtx,
  organizationIds: string[]
) {
  if (organizationIds.length === 0) {
    return new Map<
      string,
      { logo?: string | null; name?: string; slug?: string }
    >()
  }

  const organizations = await ctx.runQuery(
    components.betterAuth.organizations.getOrganizationsByIds,
    {
      organizationIds,
    }
  )

  return new Map(
    organizations.map((organization) => [
      organization._id,
      {
        logo: organization.logo,
        name: organization.name,
        slug: organization.slug,
      },
    ])
  )
}

function normalizeConversationRole(value?: string) {
  switch (value) {
    case "assistant":
    case "system":
    case "tool":
    case "unknown":
    case "user":
      return value
    default:
      return "unknown"
  }
}

function normalizeConversationThreadPurpose(
  value?: string
):
  | "support-agent"
  | "menu-context"
  | "combination-enrichment"
  | "combination-validation"
  | "debug-agent"
  | "combo-builder"
  | "unknown" {
  switch (value) {
    case "support-agent":
    case "menu-context":
    case "combination-enrichment":
    case "combination-validation":
    case "debug-agent":
    case "combo-builder":
      return value
    default:
      return "unknown"
  }
}

async function hydrateConversationCostMessagePreviews(
  ctx: ReportingQueryCtx,
  conversation: Pick<
    Doc<"conversations">,
    "_creationTime" | "_id" | "organizationId" | "threadId"
  >,
  messageIds: string[]
) {
  const pendingMessageIds = new Set(messageIds)
  if (pendingMessageIds.size === 0) {
    return new Map<string, string>()
  }

  const registeredThreads = await listConversationAiThreads(ctx as QueryCtx, {
    conversationId: conversation._id,
  })
  const threads = getConversationCostThreadsWithFallback(
    conversation,
    registeredThreads.map((thread) => ({
      createdAt: thread.createdAt,
      kind: thread.kind,
      purpose: thread.purpose,
      threadId: thread.threadId,
    }))
  )
  const previewByMessageId = new Map<string, string>()

  await Promise.all(
    threads.map(async (thread) => {
      try {
        const messages = await listAllThreadMessages(
          ctx as QueryCtx,
          thread.threadId
        )

        for (const message of messages) {
          if (!pendingMessageIds.has(message._id)) {
            continue
          }

          const preview = getConversationCostMessagePreview(
            message,
            thread.purpose
          )

          if (preview) {
            previewByMessageId.set(message._id, preview)
          }
        }
      } catch (error) {
        console.warn(
          "[AI COST DETAIL] Failed to hydrate message previews for thread",
          {
            conversationId: conversation._id,
            error: error instanceof Error ? error.message : String(error),
            organizationId: conversation.organizationId,
            threadId: thread.threadId,
          }
        )
      }
    })
  )

  return previewByMessageId
}

function buildConversationCostDetailMessages(
  events: Doc<"aiCostEvents">[],
  previewByMessageId: Map<string, string>
) {
  return events
    .map((event) => ({
      cost: event.costUsd,
      isCustomerVisible: event.metadata?.isCustomerVisible ?? false,
      messageId: event.messageId ?? event._id,
      model: event.model,
      provider: event.provider,
      role: normalizeConversationRole(event.metadata?.role),
      textPreview: event.messageId
        ? previewByMessageId.get(event.messageId)
        : undefined,
      threadId: event.threadId ?? "thread-no-disponible",
      threadPurpose: normalizeConversationThreadPurpose(
        event.metadata?.threadPurpose
      ),
      timestamp: event.eventAt,
      usage: event.usage,
    }))
    .sort((a, b) => {
      if (b.timestamp !== a.timestamp) {
        return b.timestamp - a.timestamp
      }

      return a.messageId.localeCompare(b.messageId)
    })
}

export const getOrganizationBackfillJob = platformAdminQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const backfillJob = await ctx.runQuery(getJobForOrganizationRef, {
      organizationId: args.organizationId,
    })

    return serializeBackfillJob(backfillJob)
  },
})

export const getOrganizationAiCostCoverageStatus = platformAdminQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const [coverage, backfillJob] = await Promise.all([
      getOrganizationCoverageRow(ctx, args.organizationId),
      ctx.runQuery(getJobForOrganizationRef, {
        organizationId: args.organizationId,
      }),
    ])

    return {
      backfillJob: serializeBackfillJob(backfillJob),
      coverage: serializeCoverageStatus(coverage),
    }
  },
})

export const listOrganizationAiCostCalculationEntries = platformAdminQuery({
  args: {
    organizationId: v.string(),
    jobId: v.optional(v.id("conversationCostBackfillJobs")),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    outcome: v.optional(organizationAiCostCalculationOutcomeValidator),
    phase: v.optional(organizationAiCostCalculationPhaseValidator),
    reasonCode: v.optional(organizationAiCostReasonCodeValidator),
  },
  handler: async (ctx, args) => {
    const offset = Math.max(0, args.offset ?? 0)
    const limit = Math.max(1, Math.min(args.limit ?? 25, 100))
    const rows = await ctx.db
      .query("organizationAiCostCalculationEntries")
      .withIndex("by_organization_and_created_at", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(AI_COST_AUDIT_SCAN_LIMIT + 1)
    const filtered = rows.filter((row) => {
      if (args.jobId && row.jobId !== args.jobId) {
        return false
      }
      if (args.phase && row.phase !== args.phase) {
        return false
      }
      if (args.outcome && row.outcome !== args.outcome) {
        return false
      }
      if (args.reasonCode && row.reasonCode !== args.reasonCode) {
        return false
      }
      return true
    })

    return {
      hasMore: getOffsetPageHasMore(filtered.length, offset, limit),
      limit,
      offset,
      rows: filtered.slice(offset, offset + limit),
      total: filtered.length,
      truncated: rows.length > AI_COST_AUDIT_SCAN_LIMIT,
    }
  },
})

export const listOrganizationsAiCostCoveragePage = platformAdminQuery({
  args: {
    hasFailures: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    status: v.optional(organizationAiCostCoverageStatusValidator),
  },
  handler: async (ctx, args) => {
    const offset = Math.max(0, args.offset ?? 0)
    const limit = Math.max(1, Math.min(args.limit ?? 25, 100))

    const [coverageRows, betterAuthOrganizations] = await Promise.all([
      ctx.db.query("organizationAiCostCoverage").collect(),
      ctx.runQuery(components.betterAuth.organizations.listAll, {}),
    ])
    const coverageByOrganizationId = new Map(
      coverageRows.map((row) => [row.organizationId, row])
    )
    const organizationsMetadata = new Map(
      betterAuthOrganizations.map((organization) => [
        organization._id,
        {
          logo: organization.logo,
          name: organization.name,
          slug: organization.slug,
        },
      ])
    )
    const organizationIds = Array.from(
      new Set([
        ...betterAuthOrganizations.map((organization) => organization._id),
        ...coverageRows.map((row) => row.organizationId),
      ])
    )
    const filtered = organizationIds.filter((organizationId) => {
      const coverage = coverageByOrganizationId.get(organizationId)
      const coverageStatus = coverage?.status ?? "not_started"
      const hasFailures = (coverage?.threadsFailed ?? 0) > 0

      if (args.status && coverageStatus !== args.status) {
        return false
      }
      if (args.hasFailures === true && !hasFailures) {
        return false
      }
      if (args.hasFailures === false && hasFailures) {
        return false
      }
      return true
    })
    const sorted = [...filtered].sort((a, b) => {
      const coverageA = coverageByOrganizationId.get(a)
      const coverageB = coverageByOrganizationId.get(b)
      const statusA = coverageA?.status ?? "not_started"
      const statusB = coverageB?.status ?? "not_started"

      if (statusA !== statusB) {
        return (
          coverageStatusSortOrder[statusA] - coverageStatusSortOrder[statusB]
        )
      }

      const failuresA = coverageA?.threadsFailed ?? 0
      const failuresB = coverageB?.threadsFailed ?? 0
      if (failuresB !== failuresA) {
        return failuresB - failuresA
      }

      return (coverageB?.lastUpdatedAt ?? 0) - (coverageA?.lastUpdatedAt ?? 0)
    })
    const pageRows = sorted.slice(offset, offset + limit)
    const pageBackfillJobs = await Promise.all(
      pageRows.map((organizationId) =>
        ctx.runQuery(getJobForOrganizationRef, { organizationId })
      )
    )

    return {
      hasMore: getOffsetPageHasMore(sorted.length, offset, limit),
      limit,
      offset,
      rows: pageRows.map((organizationId, index) => {
        const organization = organizationsMetadata.get(organizationId)
        const coverage = coverageByOrganizationId.get(organizationId) ?? null
        return {
          backfillJob: serializeBackfillJob(pageBackfillJobs[index] ?? null),
          coverage: serializeCoverageStatus(coverage),
          logo: organization?.logo,
          name: organization?.name,
          organizationId,
          slug: organization?.slug,
        }
      }),
      total: sorted.length,
    }
  },
})

export const getOrganizationCostOverview = platformAdminQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const monthlyRows = await ctx.db
      .query("organizationAiCostMonthly")
      .withIndex("by_organization_and_period_month", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    return {
      summary: {
        totalConversations: await aggregateConversationsByOrganization.count(
          ctx,
          {
            namespace: args.organizationId,
          }
        ),
        totalCost: aggregateSummaryRows(monthlyRows).totalCostUsd,
      },
    }
  },
})

export const getOrganizationCostRangeOverview = platformAdminQuery({
  args: {
    organizationId: v.string(),
    ...rangeArgs,
  },
  handler: async (ctx, args) => {
    const range = resolveAiCostRange(args)
    const [summaryRows, boundaryEvents, countScan, coverage] =
      await Promise.all([
        listOrganizationSummaryRowsInRange(ctx, args.organizationId, range),
        listCappedOrganizationBoundaryEvents(ctx, args.organizationId, range),
        listEventsForOrganizationInRange(ctx, args),
        getOrganizationCoverageRow(ctx, args.organizationId),
      ])

    const summaryFromMonths = aggregateSummaryRows(summaryRows)
    const summaryFromBoundary = aggregateEventsSummary(boundaryEvents.events)
    const uniqueCounts = buildOverviewUniqueCounts({
      countEvents: countScan.events,
      countScanTruncated: countScan.truncated,
      rangeCoversSingleFullMonth: isSingleFullMonthRange(range),
      summedMonthlyConversationsCount:
        summaryFromMonths.summedConversationsCount,
      summedMonthlyUnassignedThreadsCount:
        summaryFromMonths.summedUnassignedThreadsCount,
    })

    return {
      coverage: serializeCoverageStatus(coverage),
      range,
      summary: {
        conversationCostUsd: roundCost(
          summaryFromMonths.conversationCostUsd +
            summaryFromBoundary.conversationCostUsd
        ),
        pricingBreakdown: clonePricingBreakdown({
          estimatedPricingCostUsd: roundCost(
            summaryFromMonths.pricingBreakdown.estimatedPricingCostUsd +
              summaryFromBoundary.pricingBreakdown.estimatedPricingCostUsd
          ),
          exactPricingCostUsd: roundCost(
            summaryFromMonths.pricingBreakdown.exactPricingCostUsd +
              summaryFromBoundary.pricingBreakdown.exactPricingCostUsd
          ),
        }),
        sourceBreakdown: (() => {
          const sourceBreakdown = createEmptySourceBreakdown()
          addSourceBreakdown(sourceBreakdown, summaryFromMonths.sourceBreakdown)
          addSourceBreakdown(
            sourceBreakdown,
            summaryFromBoundary.sourceBreakdown
          )
          return sourceBreakdown
        })(),
        totalConversations: uniqueCounts.totalConversations,
        totalCostUsd: roundCost(
          summaryFromMonths.totalCostUsd + summaryFromBoundary.totalCostUsd
        ),
        totalEstimatedCoverageCostUsd: roundCost(
          summaryFromMonths.totalEstimatedCoverageCostUsd +
            summaryFromBoundary.totalEstimatedCoverageCostUsd
        ),
        totalEvents:
          summaryFromMonths.totalEvents + summaryFromBoundary.totalEvents,
        totalOrganizations: 1,
        totalUnassignedThreads: uniqueCounts.totalUnassignedThreads,
        truncated: boundaryEvents.truncated || countScan.truncated,
        unassignedThreadCostUsd: roundCost(
          summaryFromMonths.unassignedThreadCostUsd +
            summaryFromBoundary.unassignedThreadCostUsd
        ),
        uniqueCountsLowerBound: uniqueCounts.uniqueCountsLowerBound,
      },
    }
  },
})

export const listOrganizationMonthlyCostSeries = platformAdminQuery({
  args: {
    organizationId: v.string(),
    ...rangeArgs,
  },
  handler: async (ctx, args) => {
    const range = resolveAiCostRange(args)
    const [summaryRows, boundaryEvents, coverage] = await Promise.all([
      listOrganizationSummaryRowsInRange(ctx, args.organizationId, range),
      listCappedOrganizationBoundaryEvents(ctx, args.organizationId, range),
      getOrganizationCoverageRow(ctx, args.organizationId),
    ])

    const series = mergeMonthlySeries(
      buildMonthlySeriesFromSummaries(summaryRows, range.periodMonths),
      buildAiCostMonthlySeries(boundaryEvents.events, range.periodMonths)
    )

    return {
      coverage: serializeCoverageStatus(coverage),
      range,
      series,
      truncated: boundaryEvents.truncated,
    }
  },
})

export const listOrganizationConversationsByCostRange = platformAdminQuery({
  args: {
    organizationId: v.string(),
    ...rangeArgs,
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    orderBy: v.optional(conversationCostListOrderValidator),
  },
  handler: async (ctx, args) => {
    const [{ events, range, truncated }, coverage] = await Promise.all([
      listEventsForOrganizationInRange(ctx, args),
      getOrganizationCoverageRow(ctx, args.organizationId),
    ])

    const grouped = new Map<
      string,
      {
        conversationId: Id<"conversations">
        costCoverage: "complete" | "estimated"
        costInRange: number
        lastEventAt: number
      }
    >()

    for (const event of events) {
      if (!event.conversationId) {
        continue
      }

      const current = grouped.get(event.conversationId)
      if (!current) {
        grouped.set(event.conversationId, {
          conversationId: event.conversationId as Id<"conversations">,
          costCoverage: event.coverage,
          costInRange: event.costUsd,
          lastEventAt: event.eventAt,
        })
        continue
      }

      current.costInRange = roundCost(current.costInRange + event.costUsd)
      current.lastEventAt = Math.max(current.lastEventAt, event.eventAt)
      if (event.coverage === "estimated") {
        current.costCoverage = "estimated"
      }
    }

    const orderBy = args.orderBy ?? "cost_desc"
    const offset = Math.max(0, args.offset ?? 0)
    const limit = Math.max(1, Math.min(args.limit ?? 25, 100))

    if (orderBy === "recent_desc") {
      const rows = sortConversationCostRowsByRecent(
        await hydrateConversationCostRows(ctx, [...grouped.values()])
      )

      return {
        coverage: serializeCoverageStatus(coverage),
        hasMore: getOffsetPageHasMore(rows.length, offset, limit),
        limit,
        offset,
        range,
        rows: rows.slice(offset, offset + limit),
        total: rows.length,
        truncated,
      }
    }

    const aggregates = [...grouped.values()].sort((a, b) => {
      if (b.costInRange !== a.costInRange) {
        return b.costInRange - a.costInRange
      }

      return b.lastEventAt - a.lastEventAt
    })
    const rows = await hydrateConversationCostRows(ctx, aggregates)

    return {
      coverage: serializeCoverageStatus(coverage),
      hasMore: getOffsetPageHasMore(rows.length, offset, limit),
      limit,
      offset,
      range,
      rows: rows.slice(offset, offset + limit),
      total: rows.length,
      truncated,
    }
  },
})

export const listOrganizationUnassignedThreadsByCostRange = platformAdminQuery({
  args: {
    organizationId: v.string(),
    ...rangeArgs,
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { events, range, truncated } = await listEventsForOrganizationInRange(
      ctx,
      args
    )
    const grouped = new Map<
      string,
      {
        costCoverage: "complete" | "estimated"
        costInRange: number
        lastEventAt: number
        purpose: string
        threadId: string
      }
    >()

    for (const event of events) {
      if (
        event.assignmentType !== "organization_unassigned" ||
        typeof event.threadId !== "string"
      ) {
        continue
      }

      const current = grouped.get(event.threadId)
      if (!current) {
        grouped.set(event.threadId, {
          costCoverage: event.coverage,
          costInRange: event.costUsd,
          lastEventAt: event.eventAt,
          purpose: event.metadata?.threadPurpose ?? "unknown",
          threadId: event.threadId,
        })
        continue
      }

      current.costInRange = roundCost(current.costInRange + event.costUsd)
      current.lastEventAt = Math.max(current.lastEventAt, event.eventAt)
      if (event.coverage === "estimated") {
        current.costCoverage = "estimated"
      }
    }

    const aggregates = [...grouped.values()].sort((a, b) => {
      if (b.costInRange !== a.costInRange) {
        return b.costInRange - a.costInRange
      }

      return b.lastEventAt - a.lastEventAt
    })
    const offset = Math.max(0, args.offset ?? 0)
    const limit = Math.max(1, Math.min(args.limit ?? 25, 100))
    const pageAggregates = aggregates.slice(offset, offset + limit)
    const organizationThreads = await Promise.all(
      pageAggregates.map((aggregate) =>
        ctx.db
          .query("organizationAiThreads")
          .withIndex("by_thread_id", (q) =>
            q.eq("threadId", aggregate.threadId)
          )
          .unique()
      )
    )
    const organizationThreadsMap = new Map(
      organizationThreads
        .filter(
          (thread): thread is Doc<"organizationAiThreads"> => thread !== null
        )
        .map((thread) => [thread.threadId, thread])
    )

    const rows = pageAggregates.map((aggregate) => {
      const thread = organizationThreadsMap.get(aggregate.threadId)
      return {
        costCoverage: aggregate.costCoverage,
        costInRange: roundCost(aggregate.costInRange),
        discoveredAt: thread?.discoveredAt,
        lastEventAt: aggregate.lastEventAt,
        purpose: thread?.purpose ?? aggregate.purpose,
        threadId: aggregate.threadId,
      }
    })

    return {
      hasMore: getOffsetPageHasMore(aggregates.length, offset, limit),
      limit,
      offset,
      range,
      rows,
      total: aggregates.length,
      truncated,
    }
  },
})

export const listOrganizationConversationCostsPage = platformAdminQuery({
  args: {
    organizationId: v.string(),
    orderBy: v.optional(conversationCostListOrderValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const orderBy: ConversationCostListOrder = args.orderBy ?? "cost_desc"
    const page =
      orderBy === "recent_desc"
        ? await ctx.db
            .query("conversations")
            .withIndex("by_organization_and_last_message", (q) =>
              q.eq("organizationId", args.organizationId)
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("conversations")
            .withIndex("by_organization_and_cost", (q) =>
              q.eq("organizationId", args.organizationId)
            )
            .order("desc")
            .paginate(args.paginationOpts)

    const contacts = await Promise.all(
      [...new Set(page.page.map((conversation) => conversation.contactId))].map(
        (contactId) => ctx.db.get(contactId)
      )
    )
    const contactsMap = new Map(
      contacts
        .filter((contact): contact is Doc<"contacts"> => contact !== null)
        .map((contact) => [contact._id, contact])
    )

    return {
      ...page,
      page: page.page.map((conversation) => {
        const contact = contactsMap.get(conversation.contactId)

        return {
          contactDisplayName: contact?.displayName,
          contactPhone: contact?.phoneNumber,
          conversationId: conversation._id,
          cost: conversation.cost,
          costCoverage: conversation.costCoverage,
          costUpdatedAt: conversation.costUpdatedAt,
          createdAt: conversation._creationTime,
          lastMessageAt: conversation.lastMessageAt,
          status: conversation.status,
          threadId: conversation.threadId,
        }
      }),
    }
  },
})

export const getPlatformCostRangeOverview = platformAdminQuery({
  args: rangeArgs,
  handler: async (ctx, args) => {
    const range = resolveAiCostRange(args)
    const [summaryRows, boundaryEvents, countScan] = await Promise.all([
      listGlobalSummaryRowsInRange(ctx, range),
      listCappedGlobalBoundaryEvents(ctx, range),
      listGlobalEventsInRange(ctx, args),
    ])
    const summaryFromMonths = aggregateSummaryRows(summaryRows)
    const summaryFromBoundary = aggregateEventsSummary(boundaryEvents.events)
    const uniqueCounts = buildOverviewUniqueCounts({
      countEvents: countScan.events,
      countScanTruncated: countScan.truncated,
      rangeCoversSingleFullMonth: isSingleFullMonthRange(range),
      summedMonthlyConversationsCount:
        summaryFromMonths.summedConversationsCount,
      summedMonthlyUnassignedThreadsCount:
        summaryFromMonths.summedUnassignedThreadsCount,
    })
    const organizationIds = new Set(
      summaryRows.map((row) => row.organizationId)
    )
    for (const event of boundaryEvents.events) {
      organizationIds.add(event.organizationId)
    }

    return {
      range,
      summary: {
        conversationCostUsd: roundCost(
          summaryFromMonths.conversationCostUsd +
            summaryFromBoundary.conversationCostUsd
        ),
        organizationCount: organizationIds.size,
        pricingBreakdown: clonePricingBreakdown({
          estimatedPricingCostUsd: roundCost(
            summaryFromMonths.pricingBreakdown.estimatedPricingCostUsd +
              summaryFromBoundary.pricingBreakdown.estimatedPricingCostUsd
          ),
          exactPricingCostUsd: roundCost(
            summaryFromMonths.pricingBreakdown.exactPricingCostUsd +
              summaryFromBoundary.pricingBreakdown.exactPricingCostUsd
          ),
        }),
        sourceBreakdown: (() => {
          const sourceBreakdown = createEmptySourceBreakdown()
          addSourceBreakdown(sourceBreakdown, summaryFromMonths.sourceBreakdown)
          addSourceBreakdown(
            sourceBreakdown,
            summaryFromBoundary.sourceBreakdown
          )
          return sourceBreakdown
        })(),
        totalConversations: uniqueCounts.totalConversations,
        totalCostUsd: roundCost(
          summaryFromMonths.totalCostUsd + summaryFromBoundary.totalCostUsd
        ),
        totalEstimatedCoverageCostUsd: roundCost(
          summaryFromMonths.totalEstimatedCoverageCostUsd +
            summaryFromBoundary.totalEstimatedCoverageCostUsd
        ),
        totalEvents:
          summaryFromMonths.totalEvents + summaryFromBoundary.totalEvents,
        totalUnassignedThreads: uniqueCounts.totalUnassignedThreads,
        truncated: boundaryEvents.truncated || countScan.truncated,
        unassignedThreadCostUsd: roundCost(
          summaryFromMonths.unassignedThreadCostUsd +
            summaryFromBoundary.unassignedThreadCostUsd
        ),
        uniqueCountsLowerBound: uniqueCounts.uniqueCountsLowerBound,
      },
    }
  },
})

export const listPlatformOrganizationCostsPage = platformAdminQuery({
  args: {
    ...rangeArgs,
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    sortBy: v.optional(platformOrganizationSortValidator),
  },
  handler: async (ctx, args) => {
    const range = resolveAiCostRange(args)
    const [summaryRows, boundaryEvents] = await Promise.all([
      listGlobalSummaryRowsInRange(ctx, range),
      listCappedGlobalBoundaryEvents(ctx, range),
    ])
    const grouped = new Map<
      string,
      {
        costInRange: number
        costCoverage: "complete" | "estimated"
        sourceBreakdown: ReturnType<typeof createEmptySourceBreakdown>
      }
    >()

    for (const row of summaryRows) {
      const current = grouped.get(row.organizationId)
      const costCoverage = row.estimatedCostUsd > 0 ? "estimated" : "complete"

      if (!current) {
        grouped.set(row.organizationId, {
          costCoverage,
          costInRange: row.totalCostUsd,
          sourceBreakdown: cloneSourceBreakdown(row.sourceBreakdown),
        })
        continue
      }

      current.costInRange = roundCost(current.costInRange + row.totalCostUsd)
      if (costCoverage === "estimated") {
        current.costCoverage = "estimated"
      }
      addSourceBreakdown(current.sourceBreakdown, row.sourceBreakdown)
    }

    for (const event of boundaryEvents.events) {
      const current = grouped.get(event.organizationId)

      if (!current) {
        const sourceBreakdown = createEmptySourceBreakdown()
        addCostToSourceBreakdown(
          sourceBreakdown,
          event.sourceType,
          event.costUsd
        )
        grouped.set(event.organizationId, {
          costCoverage: event.coverage,
          costInRange: event.costUsd,
          sourceBreakdown,
        })
        continue
      }

      current.costInRange = roundCost(current.costInRange + event.costUsd)
      if (event.coverage === "estimated") {
        current.costCoverage = "estimated"
      }
      addCostToSourceBreakdown(
        current.sourceBreakdown,
        event.sourceType,
        event.costUsd
      )
    }

    const sortBy = args.sortBy ?? "cost_desc"
    const offset = Math.max(0, args.offset ?? 0)
    const limit = Math.max(1, Math.min(args.limit ?? 25, 100))

    if (sortBy === "name_asc") {
      const organizationIds = [...grouped.keys()]
      const organizationsMap = await getOrganizationsMetadata(
        ctx,
        organizationIds
      )
      const rows = organizationIds
        .map((organizationId) => {
          const aggregate = grouped.get(organizationId)
          if (!aggregate) {
            return null
          }

          const organization = organizationsMap.get(organizationId)
          return {
            costCoverage: aggregate.costCoverage,
            costInRange: roundCost(aggregate.costInRange),
            logo: organization?.logo,
            name: organization?.name,
            organizationId,
            slug: organization?.slug,
            sourceBreakdown: aggregate.sourceBreakdown,
          }
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((a, b) =>
          (a.name ?? a.organizationId).localeCompare(
            b.name ?? b.organizationId,
            "es"
          )
        )

      return {
        hasMore: getOffsetPageHasMore(rows.length, offset, limit),
        limit,
        offset,
        range,
        rows: rows.slice(offset, offset + limit),
        total: rows.length,
        truncated: boundaryEvents.truncated,
      }
    }

    const aggregates = [...grouped.entries()]
      .map(([organizationId, aggregate]) => ({
        costCoverage: aggregate.costCoverage,
        costInRange: roundCost(aggregate.costInRange),
        organizationId,
        sourceBreakdown: aggregate.sourceBreakdown,
      }))
      .sort((a, b) => {
        if (b.costInRange !== a.costInRange) {
          return b.costInRange - a.costInRange
        }

        return a.organizationId.localeCompare(b.organizationId, "es")
      })
    const pageAggregates = aggregates.slice(offset, offset + limit)
    const organizationsMap = await getOrganizationsMetadata(
      ctx,
      pageAggregates.map((aggregate) => aggregate.organizationId)
    )
    const rows = pageAggregates.map((aggregate) => {
      const organization = organizationsMap.get(aggregate.organizationId)

      return {
        costCoverage: aggregate.costCoverage,
        costInRange: aggregate.costInRange,
        logo: organization?.logo,
        name: organization?.name,
        organizationId: aggregate.organizationId,
        slug: organization?.slug,
        sourceBreakdown: aggregate.sourceBreakdown,
      }
    })

    return {
      hasMore: getOffsetPageHasMore(aggregates.length, offset, limit),
      limit,
      offset,
      range,
      rows,
      total: aggregates.length,
      truncated: boundaryEvents.truncated,
    }
  },
})

export const listPlatformMonthlyCostSeries = platformAdminQuery({
  args: rangeArgs,
  handler: async (ctx, args) => {
    const range = resolveAiCostRange(args)
    const [summaryRows, boundaryEvents] = await Promise.all([
      listGlobalSummaryRowsInRange(ctx, range),
      listCappedGlobalBoundaryEvents(ctx, range),
    ])
    const series = mergeMonthlySeries(
      buildMonthlySeriesFromSummaries(summaryRows, range.periodMonths),
      buildAiCostMonthlySeries(boundaryEvents.events, range.periodMonths)
    )

    return {
      range,
      series: series.map(({ eventsCount: _eventsCount, ...row }) => row),
      truncated: boundaryEvents.truncated,
    }
  },
})

export const getPlatformBillingReconciliation = platformAdminQuery({
  args: rangeArgs,
  handler: async (ctx, args) => {
    const range = resolveAiCostRange(args)
    const [summaryRows, boundaryEvents] = await Promise.all([
      listGlobalSummaryRowsInRange(ctx, range),
      listCappedGlobalBoundaryEvents(ctx, range),
    ])
    const periodMonths = range.periodMonths
    const billingRows =
      periodMonths.length === 0
        ? []
        : await ctx.db
            .query("aiBillingStatements")
            .withIndex("by_period_month", (q) =>
              q
                .gte("periodMonth", periodMonths[0] ?? range.from.slice(0, 7))
                .lte(
                  "periodMonth",
                  periodMonths[periodMonths.length - 1] ?? range.to.slice(0, 7)
                )
            )
            .collect()

    const modeledSeries = mergeMonthlySeries(
      buildMonthlySeriesFromSummaries(summaryRows, periodMonths),
      buildAiCostMonthlySeries(boundaryEvents.events, periodMonths)
    )
    const modeledByPeriod = new Map(
      modeledSeries.map((row) => [row.periodMonth, row])
    )

    const billingByPeriod = new Map<
      string,
      {
        billedAmountUsd: number
        providers: string[]
        statements: {
          billedAmountUsd: number
          createdAt: number
          notes?: string
          provider: string
          statementId: Id<"aiBillingStatements">
          updatedAt?: number
        }[]
      }
    >()
    for (const row of billingRows) {
      const current = billingByPeriod.get(row.periodMonth) ?? {
        billedAmountUsd: 0,
        providers: [],
        statements: [],
      }

      current.billedAmountUsd = roundCost(
        current.billedAmountUsd + row.billedAmountUsd
      )
      current.providers = [...new Set([...current.providers, row.provider])]
      current.statements.push({
        billedAmountUsd: row.billedAmountUsd,
        createdAt: row.createdAt,
        notes: row.notes,
        provider: row.provider,
        statementId: row._id,
        updatedAt: row.updatedAt,
      })
      billingByPeriod.set(row.periodMonth, current)
    }

    const months = periodMonths.map((periodMonth) => {
      const modeled = modeledByPeriod.get(periodMonth)
      const billed = billingByPeriod.get(periodMonth)
      const modeledAmount = modeled?.totalCostUsd ?? 0
      const billedAmount = billed?.billedAmountUsd
      const deltaUsd =
        billedAmount === undefined
          ? undefined
          : roundCost(billedAmount - modeledAmount)

      return {
        billedAmountUsd: billedAmount,
        completeCostUsd: modeled?.completeCostUsd ?? 0,
        deltaPercentage:
          billedAmount === undefined || modeledAmount === 0
            ? undefined
            : Number(
                (
                  ((billedAmount - modeledAmount) / modeledAmount) *
                  100
                ).toFixed(2)
              ),
        deltaUsd,
        estimatedCostUsd: modeled?.estimatedCostUsd ?? 0,
        periodMonth,
        providers: billed?.providers ?? [],
        sourceBreakdown: cloneSourceBreakdown(modeled?.sourceBreakdown),
        statements: billed?.statements ?? [],
        totalModeledCostUsd: modeledAmount,
      }
    })

    return {
      range,
      summary: {
        totalBilledAmountUsd: roundCost(
          months.reduce((sum, month) => sum + (month.billedAmountUsd ?? 0), 0)
        ),
        totalModeledCostUsd: roundCost(
          months.reduce((sum, month) => sum + month.totalModeledCostUsd, 0)
        ),
        totalTrackedMonths: months.length,
      },
      months,
      truncated: boundaryEvents.truncated,
    }
  },
})

export const upsertBillingStatement = platformAdminMutation({
  args: {
    billedAmountUsd: v.number(),
    notes: v.optional(v.string()),
    periodMonth: v.string(),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.billedAmountUsd < 0) {
      throw new ConvexError({
        code: "INVALID_AMOUNT",
        message: "El monto facturado no puede ser negativo",
      })
    }

    if (!PERIOD_MONTH_REGEX.test(args.periodMonth)) {
      throw new ConvexError({
        code: "INVALID_PERIOD_MONTH",
        message: "El mes debe tener formato YYYY-MM",
      })
    }

    const existing = await ctx.db
      .query("aiBillingStatements")
      .withIndex("by_period_month_and_provider", (q) =>
        q.eq("periodMonth", args.periodMonth).eq("provider", args.provider)
      )
      .collect()
    const current = existing[0]
    const patch = {
      billedAmountUsd: roundCost(args.billedAmountUsd),
      createdAt: current?.createdAt ?? Date.now(),
      createdBy: current?.createdBy ?? ctx.user._id.toString(),
      notes: args.notes,
      periodMonth: args.periodMonth,
      provider: args.provider,
      updatedAt: Date.now(),
    }

    if (current) {
      await ctx.db.patch(current._id, patch)
      return await ctx.db.get(current._id)
    }

    const statementId = await ctx.db.insert("aiBillingStatements", patch)
    return await ctx.db.get(statementId)
  },
})

export const getConversationCostDetail = platformAdminQuery({
  args: {
    conversationId: v.id("conversations"),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)

    if (!conversation) {
      throw new ConversationNotFoundError()
    }

    if (conversation.organizationId !== args.organizationId) {
      throw new UnauthorizedError("ID de organización inválido")
    }

    const [contact, order, snapshot, rawLedgerEvents] = await Promise.all([
      ctx.db.get(conversation.contactId),
      conversation.orderId
        ? ctx.db.get(conversation.orderId)
        : Promise.resolve(null),
      ctx.runQuery(getConversationCostSnapshotRef, {
        conversationId: conversation._id,
      }),
      ctx.runQuery(listConversationLedgerEventsRef, {
        scope: {
          conversationId: conversation._id,
          type: "conversation",
        },
      }),
    ])
    const ledgerEvents = rawLedgerEvents as Doc<"aiCostEvents">[]

    const previewByMessageId = await hydrateConversationCostMessagePreviews(
      ctx,
      conversation,
      ledgerEvents
        .map((event) => event.messageId)
        .filter(
          (messageId): messageId is string => typeof messageId === "string"
        )
    )
    const messages = buildConversationCostDetailMessages(
      ledgerEvents,
      previewByMessageId
    )
    const ledgerSummary = buildConversationAiCostSummaryFromEvents(
      ledgerEvents,
      snapshot?.costCoverage ?? conversation.costCoverage ?? "complete"
    )

    return {
      conversation: {
        _creationTime: conversation._creationTime,
        _id: conversation._id,
        aiCostLastSyncError: snapshot?.aiCostLastSyncError,
        aiCostLastSyncFailedAt: snapshot?.aiCostLastSyncFailedAt,
        aiCostLedgerSyncedAt: snapshot?.aiCostLedgerSyncedAt,
        contact: contact
          ? {
              _id: contact._id,
              displayName: contact.displayName,
              phoneNumber: contact.phoneNumber,
            }
          : null,
        cost: snapshot?.cost ?? conversation.cost,
        costCoverage: snapshot?.costCoverage ?? conversation.costCoverage,
        costUpdatedAt: snapshot?.costUpdatedAt ?? conversation.costUpdatedAt,
        lastMessageAt: conversation.lastMessageAt,
        order: order
          ? {
              _id: order._id,
              orderNumber: order.orderNumber,
              status: order.status,
              total: order.total,
            }
          : null,
        organizationId: conversation.organizationId,
        status: conversation.status,
        threadId: conversation.threadId,
      },
      messages,
      summary: {
        costUpdatedAt: snapshot?.costUpdatedAt ?? conversation.costUpdatedAt,
        messagesWithCost: ledgerSummary.messagesWithCost,
        threadsCount: ledgerSummary.threadsCount,
        totalCost: ledgerSummary.totalCost,
      },
    }
  },
})

export const reconcileConversationCostLedger = platformAdminMutation({
  args: {
    conversationId: v.id("conversations"),
    organizationId: v.string(),
    repair: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)

    if (!conversation) {
      throw new ConversationNotFoundError()
    }

    if (conversation.organizationId !== args.organizationId) {
      throw new UnauthorizedError("ID de organización inválido")
    }

    return await ctx.runMutation(reconcileConversationCostLedgerRef, {
      conversationId: args.conversationId,
      repair: args.repair,
    })
  },
})

export const startHistoricalBackfillForOrganization = platformAdminAction({
  args: {
    mode: v.optional(v.union(v.literal("full"), v.literal("failed_only"))),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(startOrResumeConversationCostBackfillRef, {
      mode: args.mode,
      organizationId: args.organizationId,
    })
  },
})

export const getAiCostReportingDefaults = platformAdminQuery({
  args: {},
  handler: async () => ({
    ...buildDefaultRange(),
    timezone: DEFAULT_REPORT_TIMEZONE,
  }),
})
