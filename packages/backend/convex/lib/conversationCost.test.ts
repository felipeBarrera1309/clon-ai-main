import { describe, expect, it } from "vitest"
import {
  buildConversationCostBreakdown,
  type ConversationCostThreadRef,
  getConversationCostThreadsWithFallback,
  getHistoricalConversationCostCoverage,
  parseGatewayCost,
} from "./conversationCost"

describe("parseGatewayCost", () => {
  it("parses valid string and number costs", () => {
    expect(parseGatewayCost("0.0123")).toBe(0.0123)
    expect(parseGatewayCost(0.0456)).toBe(0.0456)
  })

  it("ignores invalid cost values", () => {
    expect(parseGatewayCost("")).toBeUndefined()
    expect(parseGatewayCost("abc")).toBeUndefined()
    expect(parseGatewayCost(null)).toBeUndefined()
  })
})

describe("buildConversationCostBreakdown", () => {
  const threads: ConversationCostThreadRef[] = [
    {
      kind: "primary",
      purpose: "support-agent",
      threadId: "thread-primary",
    },
    {
      kind: "auxiliary",
      purpose: "menu-context",
      threadId: "thread-menu",
    },
  ]

  it("sums valid costs across multiple threads and ignores missing values", () => {
    const breakdown = buildConversationCostBreakdown(
      threads,
      new Map([
        [
          "thread-primary",
          [
            {
              _creationTime: 100,
              _id: "msg-1",
              message: {
                content: "Hola",
                role: "assistant",
              },
              providerMetadata: {
                gateway: {
                  cost: "0.0100",
                },
              },
              threadId: "thread-primary",
            },
            {
              _creationTime: 101,
              _id: "msg-2",
              message: {
                content: "Sin costo",
                role: "assistant",
              },
              providerMetadata: {} as Record<string, Record<string, unknown>>,
              threadId: "thread-primary",
            },
          ],
        ],
        [
          "thread-menu",
          [
            {
              _creationTime: 102,
              _id: "msg-3",
              message: {
                content: "Internal",
                role: "assistant",
              },
              providerMetadata: {
                gateway: {
                  cost: "0.0025",
                },
              },
              threadId: "thread-menu",
            },
          ],
        ],
      ])
    )

    expect(breakdown.messagesWithCost).toBe(2)
    expect(breakdown.threadsCount).toBe(2)
    expect(breakdown.totalCost).toBe(0.0125)
    expect(breakdown.messages[0]?.messageId).toBe("msg-3")
  })
})

describe("getConversationCostThreadsWithFallback", () => {
  it("injects primary thread when there is no registered primary thread", () => {
    const threads = getConversationCostThreadsWithFallback(
      {
        _creationTime: 100,
        threadId: "thread-primary",
      },
      []
    )

    expect(threads).toHaveLength(1)
    expect(threads[0]?.threadId).toBe("thread-primary")
    expect(threads[0]?.purpose).toBe("support-agent")
  })

  it("skips synthetic manual order threads in fallback mode", () => {
    const threads = getConversationCostThreadsWithFallback(
      {
        _creationTime: 100,
        threadId: "manual-order-123",
      },
      []
    )

    expect(threads).toHaveLength(0)
  })
})

describe("getHistoricalConversationCostCoverage", () => {
  it("marks historical costs as estimated when only the primary thread exists", () => {
    expect(
      getHistoricalConversationCostCoverage([
        {
          kind: "primary",
          purpose: "support-agent",
          threadId: "thread-primary",
        },
      ])
    ).toBe("estimated")
  })

  it("marks historical costs as complete when auxiliary threads are registered", () => {
    expect(
      getHistoricalConversationCostCoverage([
        {
          kind: "primary",
          purpose: "support-agent",
          threadId: "thread-primary",
        },
        {
          kind: "auxiliary",
          purpose: "menu-context",
          threadId: "thread-menu",
        },
      ])
    ).toBe("complete")
  })
})
