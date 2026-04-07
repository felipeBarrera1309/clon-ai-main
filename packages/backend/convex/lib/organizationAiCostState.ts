import type { Doc, Id } from "../_generated/dataModel"
import type {
  OrganizationAiCostJobMode,
  OrganizationAiCostResolutionStatus,
  OrganizationAiCostResolutionType,
  OrganizationAiCostSyncStatus,
} from "./aiCostDomain"

type OrganizationAiThreadStateInput = Pick<
  Doc<"organizationAiThreads">,
  | "assignmentType"
  | "conversationId"
  | "costSyncStatus"
  | "lastLedgerSyncFailedAt"
  | "lastLedgerSyncedAt"
  | "resolvedConversationId"
  | "resolutionStatus"
  | "resolutionType"
>

export function getOrganizationAiCostJobMode(
  mode?: OrganizationAiCostJobMode
): OrganizationAiCostJobMode {
  return mode ?? "full"
}

export function getOrganizationAiThreadResolutionType(
  thread: Pick<
    OrganizationAiThreadStateInput,
    "assignmentType" | "resolutionType"
  >
): OrganizationAiCostResolutionType {
  return thread.resolutionType ?? thread.assignmentType
}

export function getOrganizationAiThreadResolutionStatus(
  thread: Pick<OrganizationAiThreadStateInput, "resolutionStatus">
): OrganizationAiCostResolutionStatus {
  return thread.resolutionStatus ?? "resolved"
}

export function getOrganizationAiThreadResolvedConversationId(
  thread: Pick<
    OrganizationAiThreadStateInput,
    | "assignmentType"
    | "conversationId"
    | "resolvedConversationId"
    | "resolutionType"
  >
): Id<"conversations"> | undefined {
  return getOrganizationAiThreadResolutionType(thread) === "conversation"
    ? (thread.resolvedConversationId ?? thread.conversationId)
    : undefined
}

export function getOrganizationAiThreadCostSyncStatus(
  thread: Pick<
    OrganizationAiThreadStateInput,
    | "assignmentType"
    | "costSyncStatus"
    | "lastLedgerSyncFailedAt"
    | "lastLedgerSyncedAt"
    | "resolutionType"
  >
): OrganizationAiCostSyncStatus {
  if (thread.costSyncStatus !== undefined) {
    return thread.costSyncStatus
  }

  if (getOrganizationAiThreadResolutionType(thread) === "ignored") {
    return "ignored"
  }

  if (thread.lastLedgerSyncedAt !== undefined) {
    return "synced"
  }

  if (thread.lastLedgerSyncFailedAt !== undefined) {
    return "failed"
  }

  return "pending"
}
