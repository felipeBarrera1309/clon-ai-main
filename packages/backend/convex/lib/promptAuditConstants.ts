export const PROMPT_AUDIT_SOURCES = [
  "private_customization",
  "private_prompt_builder",
  "superadmin_customization",
  "superadmin_prompt_builder",
] as const

export const PROMPT_AUDIT_ACTIONS = [
  "upsert",
  "reset_all",
  "reset_customization_fields",
  "reset_field",
  "update_core_section",
  "reset_core_section",
] as const

export const PROMPT_TEXT_FIELDS = [
  "brandVoice",
  "restaurantContext",
  "customGreeting",
  "businessRules",
  "specialInstructions",
  "coreIdentityOverride",
  "coreToolsOverride",
  "coreConversationOverride",
  "coreOperationsOverride",
  "menuValidationAgentPrompt",
  "menuAgentPrompt",
] as const
