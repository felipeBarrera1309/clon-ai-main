import { describe, expect, it } from "vitest"
import {
  buildOrganizationAiCostCoverageCounts,
  deriveOrganizationAiCostCoverageStatus,
} from "./organizationAiCostCoverage"

describe("buildOrganizationAiCostCoverageCounts", () => {
  it("tracks only resolved thread targets in the mapped counters", () => {
    const counts = buildOrganizationAiCostCoverageCounts([
      {
        assignmentType: "conversation",
        costSyncStatus: "synced",
        lastLedgerSyncFailedAt: undefined,
        lastLedgerSyncedAt: undefined,
        resolutionStatus: "resolved",
        resolutionType: "conversation",
      },
      {
        assignmentType: "organization_unassigned",
        costSyncStatus: "pending",
        lastLedgerSyncFailedAt: undefined,
        lastLedgerSyncedAt: undefined,
        resolutionStatus: "resolved",
        resolutionType: "organization_unassigned",
      },
      {
        assignmentType: "organization_unassigned",
        costSyncStatus: "pending",
        lastLedgerSyncFailedAt: undefined,
        lastLedgerSyncedAt: undefined,
        resolutionStatus: "pending",
        resolutionType: "organization_unassigned",
      },
      {
        assignmentType: "conversation",
        costSyncStatus: "failed",
        lastLedgerSyncFailedAt: undefined,
        lastLedgerSyncedAt: undefined,
        resolutionStatus: "resolved",
        resolutionType: "conversation",
      },
      {
        assignmentType: "organization_unassigned",
        costSyncStatus: "ignored",
        lastLedgerSyncFailedAt: undefined,
        lastLedgerSyncedAt: undefined,
        resolutionStatus: "resolved",
        resolutionType: "ignored",
      },
      {
        assignmentType: "organization_unassigned",
        costSyncStatus: "pending",
        lastLedgerSyncFailedAt: undefined,
        lastLedgerSyncedAt: undefined,
        resolutionStatus: "failed",
        resolutionType: "organization_unassigned",
      },
    ])

    expect(counts).toEqual({
      threadsCostFailed: 1,
      threadsCostPending: 1,
      threadsCostSynced: 1,
      threadsDiscovered: 6,
      threadsFailed: 2,
      threadsFailedResolution: 1,
      threadsIgnored: 1,
      threadsPending: 2,
      threadsPendingResolution: 1,
      threadsRelevant: 5,
      threadsResolvedConversation: 2,
      threadsResolvedUnassigned: 1,
    })
  })

  it("derives legacy thread state when the new schema fields are missing", () => {
    const counts = buildOrganizationAiCostCoverageCounts([
      {
        assignmentType: "conversation",
        costSyncStatus: undefined,
        lastLedgerSyncFailedAt: undefined,
        lastLedgerSyncedAt: 1_741_859_200_000,
        resolutionStatus: undefined,
        resolutionType: undefined,
      },
      {
        assignmentType: "organization_unassigned",
        costSyncStatus: undefined,
        lastLedgerSyncFailedAt: 1_741_859_200_000,
        lastLedgerSyncedAt: undefined,
        resolutionStatus: undefined,
        resolutionType: undefined,
      },
    ])

    expect(counts).toEqual({
      threadsCostFailed: 1,
      threadsCostPending: 0,
      threadsCostSynced: 1,
      threadsDiscovered: 2,
      threadsFailed: 1,
      threadsFailedResolution: 0,
      threadsIgnored: 0,
      threadsPending: 0,
      threadsPendingResolution: 0,
      threadsRelevant: 2,
      threadsResolvedConversation: 1,
      threadsResolvedUnassigned: 1,
    })
  })
})

describe("deriveOrganizationAiCostCoverageStatus", () => {
  it("marks organizations without a full scan as not started when nothing was discovered", () => {
    expect(
      deriveOrganizationAiCostCoverageStatus({
        counts: buildOrganizationAiCostCoverageCounts([]),
        hasFullScan: false,
        isRunning: false,
      })
    ).toBe("not_started")
  })

  it("marks organizations as partial when a full scan exists but there are pending or failed threads", () => {
    expect(
      deriveOrganizationAiCostCoverageStatus({
        counts: buildOrganizationAiCostCoverageCounts([
          {
            assignmentType: "organization_unassigned",
            costSyncStatus: "pending",
            lastLedgerSyncFailedAt: undefined,
            lastLedgerSyncedAt: undefined,
            resolutionStatus: "resolved",
            resolutionType: "organization_unassigned",
          },
        ]),
        hasFullScan: true,
        isRunning: false,
      })
    ).toBe("partial")
  })

  it("marks organizations as complete only when every relevant thread is resolved and synced", () => {
    expect(
      deriveOrganizationAiCostCoverageStatus({
        counts: buildOrganizationAiCostCoverageCounts([
          {
            assignmentType: "conversation",
            costSyncStatus: "synced",
            lastLedgerSyncFailedAt: undefined,
            lastLedgerSyncedAt: undefined,
            resolutionStatus: "resolved",
            resolutionType: "conversation",
          },
          {
            assignmentType: "organization_unassigned",
            costSyncStatus: "synced",
            lastLedgerSyncFailedAt: undefined,
            lastLedgerSyncedAt: undefined,
            resolutionStatus: "resolved",
            resolutionType: "organization_unassigned",
          },
          {
            assignmentType: "organization_unassigned",
            costSyncStatus: "ignored",
            lastLedgerSyncFailedAt: undefined,
            lastLedgerSyncedAt: undefined,
            resolutionStatus: "resolved",
            resolutionType: "ignored",
          },
        ]),
        hasFullScan: true,
        isRunning: false,
      })
    ).toBe("complete")
  })

  it("prioritizes the running status while a job is active", () => {
    expect(
      deriveOrganizationAiCostCoverageStatus({
        counts: buildOrganizationAiCostCoverageCounts([
          {
            assignmentType: "conversation",
            costSyncStatus: "synced",
            lastLedgerSyncFailedAt: undefined,
            lastLedgerSyncedAt: undefined,
            resolutionStatus: "resolved",
            resolutionType: "conversation",
          },
        ]),
        hasFullScan: true,
        isRunning: true,
      })
    ).toBe("running")
  })
})
