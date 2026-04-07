import { v } from "convex/values"

export const aiCostSourceTypeValidator = v.union(
  v.literal("agent_message"),
  v.literal("audio_transcription"),
  v.literal("embedding"),
  v.literal("other")
)

export const aiCostPricingSourceValidator = v.union(
  v.literal("gateway_metadata"),
  v.literal("catalog_estimated"),
  v.literal("manual")
)

export const aiCostCoverageValidator = v.union(
  v.literal("complete"),
  v.literal("estimated")
)

export const aiCostAssignmentTypeValidator = v.union(
  v.literal("conversation"),
  v.literal("organization_unassigned")
)

export const organizationAiCostResolutionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("resolved"),
  v.literal("failed")
)

export const organizationAiCostResolutionTypeValidator = v.union(
  v.literal("conversation"),
  v.literal("organization_unassigned"),
  v.literal("ignored")
)

export const organizationAiCostSyncStatusValidator = v.union(
  v.literal("pending"),
  v.literal("synced"),
  v.literal("failed"),
  v.literal("ignored")
)

export const organizationAiCostCoverageStatusValidator = v.union(
  v.literal("not_started"),
  v.literal("running"),
  v.literal("partial"),
  v.literal("complete")
)

export const organizationAiCostJobModeValidator = v.union(
  v.literal("full"),
  v.literal("failed_only")
)

export const organizationAiCostJobPhaseValidator = v.union(
  v.literal("thread_inventory"),
  v.literal("conversation_backfill"),
  v.literal("organization_thread_backfill")
)

export const organizationAiCostCalculationPhaseValidator = v.union(
  v.literal("inventory"),
  v.literal("resolution"),
  v.literal("cost_sync"),
  v.literal("conversation_refresh")
)

export const organizationAiCostCalculationOutcomeValidator = v.union(
  v.literal("updated"),
  v.literal("skipped"),
  v.literal("failed"),
  v.literal("ignored")
)

export const organizationAiCostReasonCodeValidator = v.union(
  v.literal("already_synced"),
  v.literal("synthetic_thread"),
  v.literal("mapped_to_conversation"),
  v.literal("unassigned_legacy_orphan"),
  v.literal("standalone_debug_agent"),
  v.literal("standalone_combo_builder"),
  v.literal("message_fetch_incomplete"),
  v.literal("thread_not_found"),
  v.literal("ambiguous_mapping"),
  v.literal("unexpected_error")
)

export const organizationAiCostCalculationEntityTypeValidator = v.union(
  v.literal("thread"),
  v.literal("conversation")
)

export const aiCostSourceBreakdownValidator = v.object({
  agentMessage: v.number(),
  audioTranscription: v.number(),
  embedding: v.number(),
  other: v.number(),
})

export const aiCostPricingBreakdownValidator = v.object({
  estimatedPricingCostUsd: v.number(),
  exactPricingCostUsd: v.number(),
})

export type AiCostSourceType =
  | "agent_message"
  | "audio_transcription"
  | "embedding"
  | "other"

export type AiCostPricingSource =
  | "gateway_metadata"
  | "catalog_estimated"
  | "manual"

export type AiCostCoverage = "complete" | "estimated"
export type AiCostAssignmentType = "conversation" | "organization_unassigned"
export type OrganizationAiCostResolutionStatus =
  | "pending"
  | "resolved"
  | "failed"
export type OrganizationAiCostResolutionType =
  | "conversation"
  | "organization_unassigned"
  | "ignored"
export type OrganizationAiCostSyncStatus =
  | "pending"
  | "synced"
  | "failed"
  | "ignored"
export type OrganizationAiCostCoverageStatus =
  | "not_started"
  | "running"
  | "partial"
  | "complete"
export type OrganizationAiCostJobMode = "full" | "failed_only"
export type OrganizationAiCostJobPhase =
  | "thread_inventory"
  | "conversation_backfill"
  | "organization_thread_backfill"
export type OrganizationAiCostCalculationPhase =
  | "inventory"
  | "resolution"
  | "cost_sync"
  | "conversation_refresh"
export type OrganizationAiCostCalculationOutcome =
  | "updated"
  | "skipped"
  | "failed"
  | "ignored"
export type OrganizationAiCostReasonCode =
  | "already_synced"
  | "synthetic_thread"
  | "mapped_to_conversation"
  | "unassigned_legacy_orphan"
  | "standalone_debug_agent"
  | "standalone_combo_builder"
  | "message_fetch_incomplete"
  | "thread_not_found"
  | "ambiguous_mapping"
  | "unexpected_error"
export type OrganizationAiCostCalculationEntityType = "thread" | "conversation"

export type AiCostSourceBreakdown = {
  agentMessage: number
  audioTranscription: number
  embedding: number
  other: number
}

export type AiCostPricingBreakdown = {
  estimatedPricingCostUsd: number
  exactPricingCostUsd: number
}
