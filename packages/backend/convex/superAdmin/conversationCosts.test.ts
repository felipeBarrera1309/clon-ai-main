import { describe, expect, it } from "vitest"
import {
  buildOverviewUniqueCounts,
  getOffsetPageHasMore,
  hasLedgerRowsForOrganizationRange,
  sortConversationCostRowsByRecent,
} from "./conversationCosts"

describe("getOffsetPageHasMore", () => {
  it("stops pagination on the last loaded page even when the source scan was truncated", () => {
    expect(getOffsetPageHasMore(25, 0, 25)).toBe(false)
    expect(getOffsetPageHasMore(50, 25, 25)).toBe(false)
  })

  it("returns true only when more rows remain after the current page", () => {
    expect(getOffsetPageHasMore(51, 0, 25)).toBe(true)
    expect(getOffsetPageHasMore(51, 25, 25)).toBe(true)
    expect(getOffsetPageHasMore(51, 50, 25)).toBe(false)
  })
})

describe("buildOverviewUniqueCounts", () => {
  it("returns exact scan counts when the count scan is complete", () => {
    expect(
      buildOverviewUniqueCounts({
        countEvents: [
          {
            assignmentType: "conversation",
            conversationId: "conversation-1" as never,
            threadId: undefined,
          },
          {
            assignmentType: "conversation",
            conversationId: "conversation-2" as never,
            threadId: undefined,
          },
          {
            assignmentType: "organization_unassigned",
            conversationId: undefined,
            threadId: "thread-1",
          },
        ],
        countScanTruncated: false,
        rangeCoversSingleFullMonth: false,
        summedMonthlyConversationsCount: 99,
        summedMonthlyUnassignedThreadsCount: 88,
      })
    ).toEqual({
      totalConversations: 2,
      totalUnassignedThreads: 1,
      uniqueCountsLowerBound: false,
    })
  })

  it("uses monthly summary unique counts for a single full month even if the scan truncates", () => {
    expect(
      buildOverviewUniqueCounts({
        countEvents: [
          {
            assignmentType: "conversation",
            conversationId: "conversation-1" as never,
            threadId: undefined,
          },
        ],
        countScanTruncated: true,
        rangeCoversSingleFullMonth: true,
        summedMonthlyConversationsCount: 12,
        summedMonthlyUnassignedThreadsCount: 5,
      })
    ).toEqual({
      totalConversations: 12,
      totalUnassignedThreads: 5,
      uniqueCountsLowerBound: false,
    })
  })

  it("marks truncated multi-month unique counts as lower bounds", () => {
    expect(
      buildOverviewUniqueCounts({
        countEvents: [
          {
            assignmentType: "conversation",
            conversationId: "conversation-1" as never,
            threadId: undefined,
          },
          {
            assignmentType: "organization_unassigned",
            conversationId: undefined,
            threadId: "thread-1",
          },
        ],
        countScanTruncated: true,
        rangeCoversSingleFullMonth: false,
        summedMonthlyConversationsCount: 20,
        summedMonthlyUnassignedThreadsCount: 9,
      })
    ).toEqual({
      totalConversations: 1,
      totalUnassignedThreads: 1,
      uniqueCountsLowerBound: true,
    })
  })
})

describe("hasLedgerRowsForOrganizationRange", () => {
  it("treats count-scan events as ledger presence for fallback decisions", () => {
    expect(
      hasLedgerRowsForOrganizationRange({
        boundaryEventCount: 0,
        countEventCount: 1,
        summaryRowCount: 0,
      })
    ).toBe(true)

    expect(
      hasLedgerRowsForOrganizationRange({
        boundaryEventCount: 0,
        countEventCount: 0,
        summaryRowCount: 0,
      })
    ).toBe(false)
  })
})

describe("sortConversationCostRowsByRecent", () => {
  it("orders rows by lastMessageAt when present and falls back to createdAt", () => {
    const sorted = sortConversationCostRowsByRecent([
      {
        contactDisplayName: undefined,
        contactPhone: undefined,
        contactId: "contact-1" as never,
        conversationId: "conversation-1" as never,
        costCoverage: "complete",
        costInRange: 4,
        costUpdatedAt: undefined,
        createdAt: 1_000,
        lastEventAt: 1_100,
        lastMessageAt: undefined,
        lifetimeCost: 4,
        status: "resolved",
        threadId: "thread-1",
      },
      {
        contactDisplayName: undefined,
        contactPhone: undefined,
        contactId: "contact-2" as never,
        conversationId: "conversation-2" as never,
        costCoverage: "complete",
        costInRange: 3,
        costUpdatedAt: undefined,
        createdAt: 900,
        lastEventAt: 1_200,
        lastMessageAt: 1_500,
        lifetimeCost: 3,
        status: "resolved",
        threadId: "thread-2",
      },
      {
        contactDisplayName: undefined,
        contactPhone: undefined,
        contactId: "contact-3" as never,
        conversationId: "conversation-3" as never,
        costCoverage: "estimated",
        costInRange: 5,
        costUpdatedAt: undefined,
        createdAt: 1_200,
        lastEventAt: 1_250,
        lastMessageAt: undefined,
        lifetimeCost: 5,
        status: "unresolved",
        threadId: "thread-3",
      },
    ])

    expect(sorted.map((row) => row.conversationId)).toEqual([
      "conversation-2",
      "conversation-3",
      "conversation-1",
    ])
  })

  it("keeps pagination counts aligned with the surviving rows after filtering", () => {
    const rows = sortConversationCostRowsByRecent([
      {
        contactDisplayName: undefined,
        contactPhone: undefined,
        contactId: "contact-1" as never,
        conversationId: "conversation-1" as never,
        costCoverage: "complete",
        costInRange: 4,
        costUpdatedAt: undefined,
        createdAt: 1_000,
        lastEventAt: 1_100,
        lastMessageAt: 1_300,
        lifetimeCost: 4,
        status: "resolved",
        threadId: "thread-1",
      },
      {
        contactDisplayName: undefined,
        contactPhone: undefined,
        contactId: "contact-2" as never,
        conversationId: "conversation-2" as never,
        costCoverage: "estimated",
        costInRange: 3,
        costUpdatedAt: undefined,
        createdAt: 900,
        lastEventAt: 950,
        lastMessageAt: undefined,
        lifetimeCost: 3,
        status: "resolved",
        threadId: "thread-2",
      },
    ])

    expect(rows).toHaveLength(2)
    expect(getOffsetPageHasMore(rows.length, 0, 25)).toBe(false)
  })
})
