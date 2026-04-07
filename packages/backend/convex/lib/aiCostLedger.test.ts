import { describe, expect, it } from "vitest"
import {
  AI_COST_REPORTING_TIMEZONE,
  buildAiCostMonthlySeries,
  buildAiCostMonthlySeriesFromRows,
  buildConversationAiCostSummaryFromEvents,
  getPeriodMonthForTimestamp,
  getStaleConversationThreadIds,
  resolveAiCostRange,
} from "./aiCostLedger"

describe("resolveAiCostRange", () => {
  it("resolves inclusive local date ranges to UTC boundaries", () => {
    const range = resolveAiCostRange({
      from: "2026-03-10",
      timezone: AI_COST_REPORTING_TIMEZONE,
      to: "2026-03-20",
    })

    expect(range.from).toBe("2026-03-10")
    expect(range.to).toBe("2026-03-20")
    expect(range.startAt).toBe(Date.UTC(2026, 2, 10, 5, 0, 0, 0))
    expect(range.endExclusive).toBe(Date.UTC(2026, 2, 21, 5, 0, 0, 0))
    expect(range.periodMonths).toEqual(["2026-03"])
  })

  it("returns every month between two dates", () => {
    const range = resolveAiCostRange({
      from: "2026-01-15",
      timezone: AI_COST_REPORTING_TIMEZONE,
      to: "2026-03-02",
    })

    expect(range.periodMonths).toEqual(["2026-01", "2026-02", "2026-03"])
  })
})

describe("getPeriodMonthForTimestamp", () => {
  it("assigns months using Colombia timezone", () => {
    const marchBogotaMidnightUtc = Date.UTC(2026, 2, 1, 5, 0, 0, 0)
    const februaryBogotaLateNightUtc = Date.UTC(2026, 2, 1, 4, 59, 59, 999)

    expect(getPeriodMonthForTimestamp(marchBogotaMidnightUtc)).toBe("2026-03")
    expect(getPeriodMonthForTimestamp(februaryBogotaLateNightUtc)).toBe(
      "2026-02"
    )
  })
})

describe("buildAiCostMonthlySeries", () => {
  it("groups only the provided events into their respective months", () => {
    const series = buildAiCostMonthlySeries(
      [
        {
          costUsd: 1.25,
          coverage: "complete",
          periodMonth: "2026-02",
          sourceType: "agent_message",
        },
        {
          costUsd: 0.75,
          coverage: "estimated",
          periodMonth: "2026-02",
          sourceType: "audio_transcription",
        },
        {
          costUsd: 2,
          coverage: "complete",
          periodMonth: "2026-03",
          sourceType: "embedding",
        },
      ],
      ["2026-02", "2026-03", "2026-04"]
    )

    expect(series).toEqual([
      {
        completeCostUsd: 1.25,
        estimatedCostUsd: 0.75,
        eventsCount: 2,
        periodMonth: "2026-02",
        sourceBreakdown: {
          agentMessage: 1.25,
          audioTranscription: 0.75,
          embedding: 0,
          other: 0,
        },
        totalCostUsd: 2,
      },
      {
        completeCostUsd: 2,
        estimatedCostUsd: 0,
        eventsCount: 1,
        periodMonth: "2026-03",
        sourceBreakdown: {
          agentMessage: 0,
          audioTranscription: 0,
          embedding: 2,
          other: 0,
        },
        totalCostUsd: 2,
      },
      {
        completeCostUsd: 0,
        estimatedCostUsd: 0,
        eventsCount: 0,
        periodMonth: "2026-04",
        sourceBreakdown: {
          agentMessage: 0,
          audioTranscription: 0,
          embedding: 0,
          other: 0,
        },
        totalCostUsd: 0,
      },
    ])
  })
})

describe("buildAiCostMonthlySeriesFromRows", () => {
  it("aggregates multiple organization summaries that share the same month", () => {
    const series = buildAiCostMonthlySeriesFromRows(
      [
        {
          completeCostUsd: 1.25,
          estimatedCostUsd: 0.75,
          eventsCount: 2,
          periodMonth: "2026-02",
          sourceBreakdown: {
            agentMessage: 1,
            audioTranscription: 0.75,
            embedding: 0,
            other: 0.25,
          },
          totalCostUsd: 2,
        },
        {
          completeCostUsd: 3.5,
          estimatedCostUsd: 0,
          eventsCount: 4,
          periodMonth: "2026-02",
          sourceBreakdown: {
            agentMessage: 2.5,
            audioTranscription: 0,
            embedding: 1,
            other: 0,
          },
          totalCostUsd: 3.5,
        },
        {
          completeCostUsd: 0.5,
          estimatedCostUsd: 0,
          eventsCount: 1,
          periodMonth: "2026-03",
          sourceBreakdown: {
            agentMessage: 0.5,
            audioTranscription: 0,
            embedding: 0,
            other: 0,
          },
          totalCostUsd: 0.5,
        },
      ],
      ["2026-02", "2026-03"]
    )

    expect(series).toEqual([
      {
        completeCostUsd: 4.75,
        estimatedCostUsd: 0.75,
        eventsCount: 6,
        periodMonth: "2026-02",
        sourceBreakdown: {
          agentMessage: 3.5,
          audioTranscription: 0.75,
          embedding: 1,
          other: 0.25,
        },
        totalCostUsd: 5.5,
      },
      {
        completeCostUsd: 0.5,
        estimatedCostUsd: 0,
        eventsCount: 1,
        periodMonth: "2026-03",
        sourceBreakdown: {
          agentMessage: 0.5,
          audioTranscription: 0,
          embedding: 0,
          other: 0,
        },
        totalCostUsd: 0.5,
      },
    ])
  })
})

describe("getStaleConversationThreadIds", () => {
  it("excludes failed thread fetches from stale deletion candidates", () => {
    expect(
      getStaleConversationThreadIds({
        existingThreadIds: ["thread-primary", "thread-aux-1", "thread-aux-2"],
        failedThreadIds: ["thread-aux-2"],
        syncedThreadIds: ["thread-primary"],
      })
    ).toEqual(["thread-aux-1"])
  })
})

describe("buildConversationAiCostSummaryFromEvents", () => {
  it("sums total cost and unique threads from ledger rows", () => {
    expect(
      buildConversationAiCostSummaryFromEvents([
        {
          costUsd: 0.125,
          coverage: "complete",
          threadId: "thread-primary",
        },
        {
          costUsd: 0.25,
          coverage: "estimated",
          threadId: "thread-primary",
        },
        {
          costUsd: 0.5,
          coverage: "complete",
          threadId: "thread-aux",
        },
      ])
    ).toEqual({
      cost: 0.875,
      costCoverage: "estimated",
      messagesWithCost: 3,
      threadsCount: 2,
      totalCost: 0.875,
    })
  })

  it("keeps zero totals empty while honoring fallback coverage", () => {
    expect(buildConversationAiCostSummaryFromEvents([], "estimated")).toEqual({
      cost: undefined,
      costCoverage: "estimated",
      messagesWithCost: 0,
      threadsCount: 0,
      totalCost: 0,
    })
  })
})
