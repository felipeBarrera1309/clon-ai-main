export {
  DEFAULT_FOLLOW_UP_SEQUENCE,
  FOLLOW_UP_LIMITS,
  type FollowUpStep,
  isValidFollowUpSequence,
} from "@workspace/backend/lib/followUpConstants"

import { FOLLOW_UP_LIMITS as _LIMITS } from "@workspace/backend/lib/followUpConstants"

// Re-export individual constants for convenience (derived from single source of truth)
export const MAX_FOLLOW_UP_STEPS = _LIMITS.MAX_STEPS
export const MIN_FOLLOW_UP_STEPS = _LIMITS.MIN_STEPS
export const MIN_DELAY_MINUTES = _LIMITS.MIN_DELAY_MINUTES
export const MAX_DELAY_MINUTES = _LIMITS.MAX_DELAY_MINUTES
export const MAX_MESSAGE_LENGTH = _LIMITS.MAX_MESSAGE_LENGTH
