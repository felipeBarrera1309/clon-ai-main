import { describe, expect, it } from "vitest"
import {
  buildRestartedBackfillJobPatch,
  getOrganizationThreadSyncStatusesForMode,
  shouldSkipConversationBackfill,
} from "./backfillConversationCosts"

describe("buildRestartedBackfillJobPatch", () => {
  it("resets counters, cursors and cutoff when restarting a failed job", () => {
    const patch = buildRestartedBackfillJobPatch({
      batchSize: 25,
      hasReusableInventory: false,
      mode: "full",
      startedAt: 1_741_859_200_000,
    })

    expect(patch).toEqual({
      batchSize: 25,
      cursor: undefined,
      cutoffTimestamp: 1_741_859_200_000,
      failed: 0,
      finishedAt: undefined,
      lastError: undefined,
      mode: "full",
      phase: "thread_inventory",
      processed: 0,
      scheduledFunctionId: undefined,
      skipped: 0,
      startedAt: 1_741_859_200_000,
      status: "running",
      threadCursor: undefined,
      updated: 0,
    })
  })

  it("reuses the existing inventory when retrying failures after a full scan", () => {
    const patch = buildRestartedBackfillJobPatch({
      batchSize: 25,
      hasReusableInventory: true,
      mode: "failed_only",
      startedAt: 1_741_859_200_000,
    })

    expect(patch.phase).toBe("conversation_backfill")
  })

  it("limits failed_only mode to failed thread sync states", () => {
    expect(getOrganizationThreadSyncStatusesForMode("failed_only")).toEqual([
      "failed",
    ])
    expect(getOrganizationThreadSyncStatusesForMode("full")).toEqual([
      "pending",
      "failed",
    ])
  })

  it("skips only failed conversations when retrying failures", () => {
    expect(
      shouldSkipConversationBackfill({
        aiCostLastSyncFailedAt: undefined,
        aiCostLedgerSyncedAt: undefined,
        mode: "failed_only",
      })
    ).toBe(true)

    expect(
      shouldSkipConversationBackfill({
        aiCostLastSyncFailedAt: 1_741_859_200_000,
        aiCostLedgerSyncedAt: undefined,
        mode: "failed_only",
      })
    ).toBe(false)

    expect(
      shouldSkipConversationBackfill({
        aiCostLastSyncFailedAt: undefined,
        aiCostLedgerSyncedAt: 1_741_859_200_000,
        mode: "full",
      })
    ).toBe(true)
  })
})
