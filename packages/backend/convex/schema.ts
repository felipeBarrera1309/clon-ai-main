import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import {
  aiCostAssignmentTypeValidator,
  aiCostCoverageValidator,
  aiCostPricingBreakdownValidator,
  aiCostPricingSourceValidator,
  aiCostSourceBreakdownValidator,
  aiCostSourceTypeValidator,
  organizationAiCostCalculationEntityTypeValidator,
  organizationAiCostCalculationOutcomeValidator,
  organizationAiCostCalculationPhaseValidator,
  organizationAiCostCoverageStatusValidator,
  organizationAiCostJobModeValidator,
  organizationAiCostJobPhaseValidator,
  organizationAiCostReasonCodeValidator,
  organizationAiCostResolutionStatusValidator,
  organizationAiCostResolutionTypeValidator,
  organizationAiCostSyncStatusValidator,
} from "./lib/aiCostDomain"
import { ALLOWED_AGENT_MODEL_TYPES } from "./lib/aiModels"
import {
  PROMPT_AUDIT_ACTIONS,
  PROMPT_AUDIT_SOURCES,
  PROMPT_TEXT_FIELDS,
} from "./lib/promptAuditConstants"

export const orderStatusValidator = v.union(
  v.literal("programado"),
  v.literal("pendiente"),
  v.literal("preparando"),
  v.literal("listo_para_recoger"), // Ready for pickup (works for both delivery and pickup)
  v.literal("en_camino"), // Delivery orders only
  v.literal("entregado"), // Final state for both delivery and pickup
  v.literal("cancelado")
)

export const orderTypeValidator = v.union(
  v.literal("delivery"),
  v.literal("pickup")
)

export const paymentMethodValidator = v.union(
  v.literal("cash"),
  v.literal("card"),
  v.literal("payment_link"),
  v.literal("bank_transfer"),
  v.literal("corporate_credit"),
  v.literal("gift_voucher"),
  v.literal("sodexo_voucher"),
  v.literal("dynamic_payment_link")
)

export const paymentMethodTypeValidator = v.union(
  v.literal("cash"),
  v.literal("card"),
  v.literal("payment_link"),
  v.literal("bank_transfer"),
  v.literal("corporate_credit"),
  v.literal("gift_voucher"),
  v.literal("sodexo_voucher"),
  v.literal("dynamic_payment_link")
)

export const conversationStatusValidator = v.union(
  v.literal("unresolved"),
  v.literal("escalated"),
  v.literal("resolved")
)

export const weekDayValidator = v.union(
  v.literal("monday"),
  v.literal("tuesday"),
  v.literal("wednesday"),
  v.literal("thursday"),
  v.literal("friday"),
  v.literal("saturday"),
  v.literal("sunday")
)

// Generar lista de modelos directamente desde AI_MODELS usando reflexión de tipos
type AIModelKeysType = keyof typeof import("./lib/aiModels").AI_MODELS

// Debe mantenerse sincronizada con AI_MODELS en aiModels.ts
const AI_MODEL_KEYS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-no-thinking",
  "gemini-3.0-flash",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-flash-lite-minimal",
  "gemini-3-flash-minimal",
  "gemini-3-flash-high",
  "grok-4-fast-no-reasoning",
  "grok-4.1-fast-non-reasoning",
  "grok-4.1-fast-reasoning",
  "openai-120b",
  "openai-20b",
  "openai-o4-mini",
  "llama-3.1-8b",
  "llama-3.1-70b",
  "llama-3.2-1b",
  "llama-3.2-3b",
  "llama-3.2-11b",
  "llama-3.2-90b",
  "llama-3.3-70b",
  "llama-4-scout",
  "llama-4-maverick",
  "claude-3-opus",
  "claude-3.5-sonnet",
  "claude-3.5-haiku",
  "claude-3-haiku",
  "claude-3.7-sonnet",
  "claude-opus-4",
  "claude-opus-4.1",
  "claude-sonnet-4",
  "claude-sonnet-4.5",
  "claude-haiku-4.5",
  "amazon-nova-pro",
  "amazon-nova-micro",
  "amazon-nova-lite",
  "amazon-titan-embed-text-v2",
  "qwen-3-32b",
  "qwen-3-coder-30b-a3b",
  "deepseek-r1",
  "mimo-v2-flash",
] as const satisfies readonly AIModelKeysType[]

// Validador generado dinámicamente desde la lista completa
export const aiModelValidator = v.union(
  ...AI_MODEL_KEYS.map((key) => v.literal(key))
)

export const allowedAgentModelValidator = v.union(
  ...ALLOWED_AGENT_MODEL_TYPES.map((key) => v.literal(key))
)

export const invoiceTypeValidator = v.union(
  v.literal("natural"),
  v.literal("juridica")
)

export const menuTypeValidator = v.union(
  v.literal("images"),
  v.literal("pdf"),
  v.literal("url")
)

export const whatsappProviderValidator = v.union(
  v.literal("meta"),
  v.literal("twilio"),
  v.literal("360dialog"),
  v.literal("gupshup")
)

// Message Template validators
export const messageTemplateStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected")
)

export const messageTemplateCategoryValidator = v.union(
  v.literal("MARKETING"),
  v.literal("UTILITY"),
  v.literal("AUTHENTICATION")
)

// Header type for message templates (none = no header, text, image, video, document)
export const messageTemplateHeaderTypeValidator = v.union(
  v.literal("none"),
  v.literal("text"),
  v.literal("image"),
  v.literal("video"),
  v.literal("document")
)

export const benchmarkSuiteScopeValidator = v.union(
  v.literal("global_base"),
  v.literal("org_overlay")
)

export const benchmarkSuiteStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived")
)

export const benchmarkCasePriorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high")
)

export const benchmarkCaseCategoryValidator = v.union(
  v.literal("flow"),
  v.literal("tools"),
  v.literal("security"),
  v.literal("tone"),
  v.literal("coverage"),
  v.literal("combinations"),
  v.literal("scheduling"),
  v.literal("payment"),
  v.literal("escalation")
)

export const benchmarkTriggerValidator = v.union(
  v.literal("onboarding"),
  v.literal("prompt_change"),
  v.literal("weekly"),
  v.literal("manual")
)

export const benchmarkRunStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed")
)

export const benchmarkModelProfileValidator = v.union(
  v.literal("configured"),
  v.literal("baseline")
)

export const benchmarkRecommendationStatusValidator = v.union(
  v.literal("proposed"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("applied")
)

export const promptAuditSourceValidator = v.union(
  ...PROMPT_AUDIT_SOURCES.map((source) => v.literal(source))
)

export const promptAuditActionValidator = v.union(
  ...PROMPT_AUDIT_ACTIONS.map((action) => v.literal(action))
)

export const promptTextFieldValidator = v.union(
  ...PROMPT_TEXT_FIELDS.map((field) => v.literal(field))
)

export const promptTextSnapshotValidator = v.object({
  ...Object.fromEntries(PROMPT_TEXT_FIELDS.map((field) => [field, v.string()])),
})

export const orderStatusMessageValidator = v.object({
  programado: v.optional(v.string()),
  pendiente: v.optional(v.string()),
  preparando: v.optional(v.string()),
  listo_para_recoger: v.optional(v.string()),
  en_camino: v.optional(v.string()),
  entregado: v.optional(v.string()),
  cancelado: v.optional(v.string()),
})

// Bulk Messaging validators
export const campaignStatusValidator = v.union(
  v.literal("draft"),
  v.literal("scheduled"),
  v.literal("sending"),
  v.literal("completed"),
  v.literal("cancelled")
)

export const campaignRecipientStatusValidator = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("read"),
  v.literal("failed")
)

export default defineSchema({
  agentConfiguration: defineTable({
    organizationId: v.string(),
    // Customer customizable sections
    brandVoice: v.optional(v.string()), // Tone and personality
    restaurantContext: v.optional(v.string()), // Business context
    customGreeting: v.optional(v.string()), // Welcome message
    businessRules: v.optional(v.string()), // Custom policies
    specialInstructions: v.optional(v.string()), // Additional custom instructions
    // Core prompt section overrides (for testing/advanced users)
    coreIdentityOverride: v.optional(v.string()), // Override for IDENTITY_AND_PURPOSE
    coreToolsOverride: v.optional(v.string()), // Override for TOOLS_AND_CAPABILITIES
    coreConversationOverride: v.optional(v.string()), // Override for CONVERSATION_PROTOCOL
    coreOperationsOverride: v.optional(v.string()), // Override for OPERATIONAL_RULES
    // AI Model Configuration
    supportAgentModel: v.optional(aiModelValidator), // Model for main support agent
    /** @deprecated Use searchMenuProductsTool instead. This model is legacy and no longer used since RAG implementation. */
    menuAgentModel: v.optional(aiModelValidator), // DEPRECATED: Model for menu agent (askAboutMenu tool) - replaced by searchMenuProductsTool RAG system
    validationMenuAgentModel: v.optional(aiModelValidator), // Model for validation menu agent (askCombinationValidation tool)
    menuValidationAgentPrompt: v.optional(v.string()), // Custom prompt for menu validation agent
    menuAgentPrompt: v.optional(v.string()), // Custom prompt for menu agent
    // RAG Configuration for intelligent menu search and response formatting
    ragConfiguration: v.optional(
      v.object({
        // Reglas de combinación
        combinationRules: v.optional(
          v.record(
            v.string(),
            v.object({
              prohibited: v.optional(v.boolean()),
              required: v.optional(v.boolean()),
              message: v.string(),
            })
          )
        ),
        // Comportamiento de búsqueda
        searchBehavior: v.optional(
          v.object({
            defaultResponseFormat: v.string(), // 'concise' | 'detailed' | 'contextual'
            maxResultsPerCategory: v.number(),
            enableSmartGrouping: v.boolean(),
            prioritizePopularProducts: v.boolean(),
          })
        ),
      })
    ),
    requireInitialLocationValidation: v.optional(v.boolean()),
    strictAddressValidation: v.optional(v.boolean()),
    // Follow-up Messages Configuration (for inactivity sequence)
    // When null/undefined, uses default sequence (3-5-10 minutes) for backward compatibility
    followUpSequence: v.optional(
      v.array(
        v.object({
          delayMinutes: v.number(), // Minutes to wait after last customer message
          messageTemplate: v.string(), // Message with placeholders: {customerName}, {restaurantName}
        })
      )
    ),
    // Metadata
    lastModified: v.optional(v.number()),
  }).index("by_organization_id", ["organizationId"]),
  agentPromptAuditLogs: defineTable({
    organizationId: v.string(),
    changedAt: v.number(),
    changedByUserId: v.string(),
    changedByEmail: v.optional(v.string()),
    source: promptAuditSourceValidator,
    action: promptAuditActionValidator,
    changedFields: v.array(promptTextFieldValidator),
    beforeSnapshot: promptTextSnapshotValidator,
    afterSnapshot: promptTextSnapshotValidator,
  })
    .index("by_organization_and_changed_at", ["organizationId", "changedAt"])
    .index("by_organization_and_source", ["organizationId", "source"]),
  restaurantLocations: defineTable({
    name: v.string(),
    code: v.string(),
    organizationId: v.string(),
    address: v.string(),
    coordinates: v.object({
      latitude: v.number(),
      longitude: v.number(),
    }),
    available: v.boolean(),
    color: v.string(), // Color for delivery areas associated with this location
    priority: v.number(), // Priority for delivery areas associated with this location (lower = higher priority)
    openingHours: v.optional(
      v.array(
        v.object({
          day: weekDayValidator,
          ranges: v.array(
            v.object({
              open: v.string(),
              close: v.string(),
            })
          ),
        })
      )
    ),
    specialSchedules: v.optional(
      v.array(
        v.object({
          date: v.string(), // ISO date string (YYYY-MM-DD)
          ranges: v.array(
            v.object({
              open: v.string(),
              close: v.string(),
            })
          ),
        })
      )
    ),
  }).index("by_organization_id", ["organizationId"]),
  conversations: defineTable({
    threadId: v.string(),
    organizationId: v.string(),
    contactId: v.id("contacts"),
    orderId: v.optional(v.id("orders")),
    status: conversationStatusValidator,
    orderCreatedBeforeEscalation: v.optional(v.boolean()),
    gupshupConfigurationId: v.optional(v.id("whatsappConfigurations")), // Legacy field kept for backward compatibility with existing documents
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")), // Used for Meta, 360dialog, and Gupshup configurations
    twilioConfigurationId: v.optional(v.id("whatsappConfigurations")), // Twilio configuration (now uses whatsappConfigurations)
    lastMessageAt: v.optional(v.number()), // Timestamp of last message in conversation
    stopSignal: v.optional(v.boolean()), // Signal to stop agent execution
    cost: v.optional(v.number()), // Total cost of the conversation based on message provider metadata
    costUpdatedAt: v.optional(v.number()), // Timestamp of the last AI cost refresh
    costCoverage: v.optional(aiCostCoverageValidator), // Whether cached cost includes full tracked threads or only a historical estimate
    aiCostLedgerSyncedAt: v.optional(v.number()), // Timestamp of the last ledger synchronization for this conversation
    aiCostLastSyncError: v.optional(v.string()), // Last error observed while refreshing AI cost data
    aiCostLastSyncFailedAt: v.optional(v.number()), // Timestamp of the last failed AI cost refresh
    resolutionReason: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()),
    // Agent concurrency lock — prevents duplicate agent runs for the same conversation
    agentLockActive: v.optional(v.boolean()), // True when an agent is actively processing
    processingUserMessageId: v.optional(v.string()), // ID of the message currently being processed
    queuedUserMessageId: v.optional(v.string()), // ID of a message that arrived while agent was locked
    queuedWhatsappMessageId: v.optional(v.string()), // WhatsApp message ID of the queued message (for typing indicator)
    agentSoftAbort: v.optional(v.boolean()), // True when a new message arrived mid-run; tools skip WA dispatch
    // Pending order confirmation data - used to validate makeOrderTool against confirmOrderTool
    // This prevents LLM caching/hallucination issues where wrong data is passed to makeOrderTool
    // NOTE: This field is NOT cleared after order creation - it's kept as an audit trail
    // In the future, this will be moved to a dedicated audit table
    pendingOrderConfirmation: v.optional(
      v.object({
        // Full order details for restoration
        items: v.array(
          v.object({
            menuProducts: v.array(v.string()),
            quantity: v.number(),
            notes: v.optional(v.string()),
            // Combo-related fields (only present for combo items)
            itemType: v.optional(
              v.union(v.literal("regular"), v.literal("combo"))
            ),
            comboId: v.optional(v.string()),
            comboName: v.optional(v.string()),
            comboBasePrice: v.optional(v.number()),
            comboSlotSelections: v.optional(
              v.array(
                v.object({
                  slotId: v.optional(v.string()),
                  slotName: v.string(),
                  menuProductId: v.string(),
                  productName: v.string(),
                  upcharge: v.number(),
                  quantity: v.optional(v.number()),
                })
              )
            ),
          })
        ),
        orderType: v.string(),
        deliveryAddress: v.optional(v.string()),
        coordinates: v.optional(
          v.object({
            lat: v.number(),
            lng: v.number(),
          })
        ),
        paymentMethods: v.array(
          v.object({
            method: paymentMethodTypeValidator,
            amount: v.number(),
            referenceCode: v.optional(v.string()),
            notes: v.optional(v.string()),
          })
        ),
        restaurantLocationId: v.string(),
        deliveryFee: v.optional(v.number()),
        recipientName: v.string(),
        recipientPhone: v.string(),
        invoiceData: v.object({
          requiresInvoice: v.boolean(),
          invoiceType: v.optional(invoiceTypeValidator),
          email: v.optional(v.string()),
          fullName: v.optional(v.string()),
          cedula: v.optional(v.string()),
          nit: v.optional(v.string()),
        }),
        // Validation fields
        subtotal: v.number(),
        total: v.number(),
        confirmedAt: v.number(),
      })
    ),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_contact_id", ["contactId"])
    .index("by_contact_id_and_status", ["contactId", "status"])
    .index("by_thread_id", ["threadId"])
    .index("by_status_and_organization_id", ["status", "organizationId"])
    .index("by_order_id", ["orderId"])
    .index("by_whatsapp_configuration_id", ["whatsappConfigurationId"])
    .index("by_twilio_configuration_id", ["twilioConfigurationId"])
    .index("by_contact_and_whatsapp_config", [
      "contactId",
      "whatsappConfigurationId",
    ])
    .index("by_contact_and_twilio_config", [
      "contactId",
      "twilioConfigurationId",
    ])
    .index("by_contact_whatsapp_status", [
      "contactId",
      "whatsappConfigurationId",
      "status",
    ])
    .index("by_contact_twilio_status", [
      "contactId",
      "twilioConfigurationId",
      "status",
    ])
    // ... rest of conversation indexes ...
    .index("by_whatsapp_config_and_status", [
      "whatsappConfigurationId",
      "status",
    ])
    // Optimized compound indexes for better query performance
    .index("by_organization_and_status", ["organizationId", "status"])
    .index("by_organization_and_last_message", [
      "organizationId",
      "lastMessageAt",
    ])
    .index("by_organization_and_cost", ["organizationId", "cost"])
    .index("by_organization_status_and_last_message", [
      "organizationId",
      "status",
      "lastMessageAt",
    ])
    // Order creation timing indexes
    .index("by_order_created_before_escalation", [
      "orderCreatedBeforeEscalation",
    ])
    .index("by_organization_and_order_timing", [
      "organizationId",
      "orderCreatedBeforeEscalation",
    ])
    .index("by_organization_order_timing_status", [
      "organizationId",
      "orderCreatedBeforeEscalation",
      "status",
    ])
    // Search index for admin debug conversations search
    .searchIndex("search_thread_id", {
      searchField: "threadId",
    }),
  conversationAiThreads: defineTable({
    conversationId: v.id("conversations"),
    organizationId: v.string(),
    threadId: v.string(),
    kind: v.union(v.literal("primary"), v.literal("auxiliary")),
    purpose: v.union(
      v.literal("support-agent"),
      v.literal("menu-context"),
      v.literal("combination-enrichment"),
      v.literal("combination-validation")
    ),
    createdAt: v.number(),
  })
    .index("by_conversation_id", ["conversationId"])
    .index("by_thread_id", ["threadId"])
    .index("by_organization_and_conversation", [
      "organizationId",
      "conversationId",
    ]),
  organizationAiThreads: defineTable({
    organizationId: v.string(),
    threadId: v.string(),
    assignmentType: aiCostAssignmentTypeValidator,
    conversationId: v.optional(v.id("conversations")),
    resolvedConversationId: v.optional(v.id("conversations")),
    kind: v.union(
      v.literal("primary"),
      v.literal("auxiliary"),
      v.literal("standalone")
    ),
    purpose: v.union(
      v.literal("support-agent"),
      v.literal("menu-context"),
      v.literal("combination-enrichment"),
      v.literal("combination-validation"),
      v.literal("debug-agent"),
      v.literal("combo-builder"),
      v.literal("unknown")
    ),
    discoveredAt: v.number(),
    lastSeenAt: v.number(),
    resolutionStatus: v.optional(organizationAiCostResolutionStatusValidator),
    resolutionType: v.optional(organizationAiCostResolutionTypeValidator),
    resolutionReasonCode: v.optional(organizationAiCostReasonCodeValidator),
    resolutionReason: v.optional(v.string()),
    resolutionUpdatedAt: v.optional(v.number()),
    costSyncStatus: v.optional(organizationAiCostSyncStatusValidator),
    lastCostSyncReasonCode: v.optional(organizationAiCostReasonCodeValidator),
    lastCostSyncReason: v.optional(v.string()),
    costSyncUpdatedAt: v.optional(v.number()),
    lastLedgerSyncError: v.optional(v.string()),
    lastLedgerSyncFailedAt: v.optional(v.number()),
    lastLedgerSyncedAt: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    messagesWithCost: v.optional(v.number()),
  })
    .index("by_thread_id", ["threadId"])
    .index("by_organization_id", ["organizationId"])
    .index("by_organization_and_assignment", [
      "organizationId",
      "assignmentType",
    ])
    .index("by_organization_and_conversation", [
      "organizationId",
      "conversationId",
    ])
    .index("by_organization_and_resolution_type", [
      "organizationId",
      "resolutionType",
    ])
    .index("by_organization_and_sync_status", [
      "organizationId",
      "costSyncStatus",
    ]),
  conversationCostBackfillJobs: defineTable({
    organizationId: v.string(),
    mode: v.optional(organizationAiCostJobModeValidator),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    phase: v.optional(organizationAiCostJobPhaseValidator),
    cursor: v.optional(v.string()),
    threadCursor: v.optional(v.string()),
    batchSize: v.number(),
    cutoffTimestamp: v.number(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    scheduledFunctionId: v.optional(
      v.union(v.string(), v.id("_scheduled_functions"))
    ),
    processed: v.number(),
    updated: v.number(),
    failed: v.number(),
    skipped: v.number(),
    lastError: v.optional(v.string()),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_status", ["status"]),
  organizationAiCostCoverage: defineTable({
    organizationId: v.string(),
    status: organizationAiCostCoverageStatusValidator,
    threadsDiscovered: v.number(),
    threadsRelevant: v.number(),
    threadsResolvedConversation: v.number(),
    threadsResolvedUnassigned: v.number(),
    threadsIgnored: v.number(),
    threadsPending: v.number(),
    threadsPendingResolution: v.number(),
    threadsFailed: v.number(),
    threadsFailedResolution: v.number(),
    threadsCostPending: v.number(),
    threadsCostFailed: v.number(),
    threadsCostSynced: v.number(),
    lastUpdatedAt: v.number(),
    lastStartedAt: v.optional(v.number()),
    lastFullScanAt: v.optional(v.number()),
    lastCompletedAt: v.optional(v.number()),
    activeJobId: v.optional(v.id("conversationCostBackfillJobs")),
    lastJobId: v.optional(v.id("conversationCostBackfillJobs")),
    lastJobMode: v.optional(organizationAiCostJobModeValidator),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_status", ["status"]),
  organizationAiCostCalculationEntries: defineTable({
    organizationId: v.string(),
    jobId: v.optional(v.id("conversationCostBackfillJobs")),
    entityType: organizationAiCostCalculationEntityTypeValidator,
    entityId: v.string(),
    phase: organizationAiCostCalculationPhaseValidator,
    outcome: organizationAiCostCalculationOutcomeValidator,
    reasonCode: organizationAiCostReasonCodeValidator,
    reason: v.optional(v.string()),
    threadId: v.optional(v.string()),
    relatedConversationId: v.optional(v.id("conversations")),
    createdAt: v.number(),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_job_id", ["jobId"])
    .index("by_organization_and_created_at", ["organizationId", "createdAt"]),
  aiCostEvents: defineTable({
    organizationId: v.string(),
    assignmentType: aiCostAssignmentTypeValidator,
    conversationId: v.optional(v.id("conversations")),
    threadId: v.optional(v.string()),
    messageId: v.optional(v.string()),
    sourceType: aiCostSourceTypeValidator,
    provider: v.string(),
    model: v.optional(v.string()),
    costUsd: v.number(),
    eventAt: v.number(),
    periodMonth: v.string(),
    coverage: aiCostCoverageValidator,
    pricingSource: aiCostPricingSourceValidator,
    usage: v.optional(
      v.object({
        cachedInputTokens: v.optional(v.number()),
        completionTokens: v.optional(v.number()),
        promptTokens: v.optional(v.number()),
        reasoningTokens: v.optional(v.number()),
        totalTokens: v.optional(v.number()),
      })
    ),
    metadata: v.optional(
      v.object({
        isCustomerVisible: v.boolean(),
        role: v.string(),
        textPreview: v.optional(v.string()),
        threadPurpose: v.string(),
      })
    ),
  })
    .index("by_organization_and_event_at", ["organizationId", "eventAt"])
    .index("by_organization_and_thread_id", ["organizationId", "threadId"])
    .index("by_organization_and_period_month", [
      "organizationId",
      "periodMonth",
    ])
    .index("by_conversation_id", ["conversationId"])
    .index("by_period_month", ["periodMonth"])
    .index("by_event_at", ["eventAt"])
    .index("by_message_id", ["messageId"]),
  organizationAiCostMonthly: defineTable({
    organizationId: v.string(),
    periodMonth: v.string(),
    totalCostUsd: v.number(),
    conversationCostUsd: v.number(),
    unassignedCostUsd: v.number(),
    eventsCount: v.number(),
    unassignedEventsCount: v.number(),
    unassignedThreadsCount: v.number(),
    conversationsCount: v.number(),
    estimatedCostUsd: v.number(),
    completeCostUsd: v.number(),
    pricingBreakdown: aiCostPricingBreakdownValidator,
    sourceBreakdown: aiCostSourceBreakdownValidator,
    lastRebuiltAt: v.number(),
  })
    .index("by_organization_and_period_month", [
      "organizationId",
      "periodMonth",
    ])
    .index("by_period_month", ["periodMonth"]),
  organizationAiCostDaily: defineTable({
    organizationId: v.string(),
    date: v.string(), // "YYYY-MM-DD" in America/Bogota (Colombian time, UTC-5, no DST)
    totalCostUsd: v.number(),
    conversationCostUsd: v.number(),
    unassignedCostUsd: v.number(),
    eventsCount: v.number(),
    sourceBreakdown: aiCostSourceBreakdownValidator,
  })
    .index("by_organization_and_date", ["organizationId", "date"])
    .index("by_date", ["date"]),
  aiBillingStatements: defineTable({
    periodMonth: v.string(),
    provider: v.string(),
    billedAmountUsd: v.number(),
    notes: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_period_month", ["periodMonth"])
    .index("by_period_month_and_provider", ["periodMonth", "provider"]),
  conversationScheduledFunctions: defineTable({
    name: v.union(
      v.literal("scheduleAgentResponse"),
      v.literal("sendInactivityWarning3Min"),
      v.literal("sendInactivityWarning5Min"),
      v.literal("sendInactivityWarning10Min"),
      v.literal("sendInactivityWarningFirst"),
      v.literal("closeConversationForInactivity"),
      v.literal("sendOrderConfirmationReminder2Min"),
      v.literal("sendOrderConfirmationReminder4Min"),
      v.literal("followUpStep_0"),
      v.literal("followUpStep_1"),
      v.literal("followUpStep_2"),
      v.literal("followUpStep_3"),
      v.literal("followUpStep_4"),
      v.literal("followUpStep_5"),
      v.literal("followUpStep_6"),
      v.literal("followUpStep_7"),
      v.literal("followUpStep_8"),
      v.literal("followUpStep_9")
    ),
    conversationId: v.id("conversations"),
    scheduledFunctionId: v.union(v.string(), v.id("_scheduled_functions")),
    scheduledAt: v.optional(v.number()),
  })
    .index("by_conversation_id", ["conversationId"])
    .index("by_conversation_id_and_name", ["conversationId", "name"]),

  // Scheduling intents — deferred scheduling for long-running actions.
  // ctx.scheduler.runAfter from within long-running actions silently fails in Convex.
  // Instead, actions create intents here, and webhooks/cron process them from
  // an independent context where scheduling works reliably.
  schedulingIntents: defineTable({
    conversationId: v.id("conversations"),
    type: v.union(
      v.literal("followUpStep"), // Inactivity follow-up timer
      v.literal("firstTurnSchedule"), // Closed restaurant schedule message
      v.literal("menuSend"), // Auto menu file send
      v.literal("agentResponse") // 2nd job for queued messages
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed")
    ),
    payload: v.any(), // Type-specific arguments
    createdAt: v.number(),
    processedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_conversation_and_type", ["conversationId", "type"])
    .index("by_conversation_type_and_status", [
      "conversationId",
      "type",
      "status",
    ]),

  conversationEscalations: defineTable({
    conversationId: v.id("conversations"),
    organizationId: v.string(),
    reason: v.string(),
    lastCustomerMessage: v.optional(v.string()),
    escalatedAt: v.number(),
  })
    .index("by_conversation_id", ["conversationId"])
    .index("by_organization_id", ["organizationId"])
    .index("by_escalated_at", ["escalatedAt"])
    .index("by_organization_and_escalated_at", [
      "organizationId",
      "escalatedAt",
    ]),

  // Tracking table for order scheduled functions (activateScheduledOrder)
  // This enables efficient cancellation without full table scans on _scheduled_functions
  // Fix for performance issue where cancelOrderScheduledJobs was scanning all scheduled functions
  orderScheduledFunctions: defineTable({
    name: v.literal("activateScheduledOrder"),
    orderId: v.id("orders"),
    scheduledFunctionId: v.id("_scheduled_functions"),
    scheduledAt: v.number(),
    organizationId: v.string(),
  })
    .index("by_order_id", ["orderId"])
    .index("by_organization_id", ["organizationId"]),

  contacts: defineTable({
    phoneNumber: v.string(),
    displayName: v.optional(v.string()),
    organizationId: v.string(),
    lastMessageAt: v.optional(v.number()),
    isBlocked: v.optional(v.boolean()),
    lastKnownAddress: v.optional(v.string()),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_phone_number", ["phoneNumber"])
    .index("by_organization_and_phone", ["organizationId", "phoneNumber"]),
  menuProductCategories: defineTable({
    name: v.string(),
    organizationId: v.string(),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_name", ["name"])
    .index("by_organization_and_name", ["organizationId", "name"]),
  menuProductSubcategories: defineTable({
    name: v.string(),
    organizationId: v.string(),
    menuProductCategoryId: v.id("menuProductCategories"),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_category", ["menuProductCategoryId"])
    .index("by_organization_and_category", [
      "organizationId",
      "menuProductCategoryId",
    ])
    .index("by_organization_and_name", ["organizationId", "name"]),
  sizes: defineTable({
    name: v.string(),
    organizationId: v.string(),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_name", ["name"])
    .index("by_organization_and_name", ["organizationId", "name"]),
  menuProducts: defineTable({
    name: v.string(),
    nameNormalized: v.string(),
    description: v.string(),
    price: v.number(),
    menuProductCategoryId: v.id("menuProductCategories"),
    menuProductSubcategoryId: v.optional(v.id("menuProductSubcategories")),
    standAlone: v.boolean(),
    combinableWith: v.optional(
      v.array(
        v.object({
          menuProductCategoryId: v.id("menuProductCategories"),
          sizeId: v.optional(v.id("sizes")),
          menuProductId: v.optional(v.id("menuProducts")),
        })
      )
    ),
    sizeId: v.optional(v.id("sizes")),
    combinableHalf: v.boolean(),
    minimumQuantity: v.optional(v.number()),
    maximumQuantity: v.optional(v.number()),
    imageUrl: v.optional(v.string()), // URL externa de la imagen del producto
    externalCode: v.optional(v.string()),
    instructions: v.optional(v.string()),
    componentsId: v.optional(v.array(v.id("menuProducts"))),
    organizationId: v.string(),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_category", ["menuProductCategoryId"])
    .index("by_stand_alone", ["standAlone"])
    .index("by_combinable_half", ["combinableHalf"])
    .index("by_organization_and_stand_alone", ["organizationId", "standAlone"])
    .index("by_organization_and_combinable_half", [
      "organizationId",
      "combinableHalf",
    ])
    .index("by_organization_and_category", [
      "organizationId",
      "menuProductCategoryId",
    ])
    .index("by_subcategory", ["menuProductSubcategoryId"])
    .index("by_organization_and_subcategory", [
      "organizationId",
      "menuProductSubcategoryId",
    ])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: [
        "organizationId",
        "menuProductCategoryId",
        "menuProductSubcategoryId",
      ],
    })
    .searchIndex("search_name_normalized", {
      searchField: "nameNormalized",
      filterFields: [
        "organizationId",
        "menuProductCategoryId",
        "menuProductSubcategoryId",
      ],
    }),
  menuProductAvailability: defineTable({
    menuProductId: v.id("menuProducts"),
    restaurantLocationId: v.id("restaurantLocations"),
    available: v.boolean(),
    organizationId: v.string(),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_menu_product", ["menuProductId"])
    .index("by_location", ["restaurantLocationId"])
    .index("by_organization_and_location", [
      "organizationId",
      "restaurantLocationId",
    ])
    .index("by_menu_and_location", ["menuProductId", "restaurantLocationId"]),
  menuProductOrderItems: defineTable({
    menuProductId: v.id("menuProducts"), // For current product linking (if still exists)
    orderItemId: v.id("orderItems"),
    quantity: v.number(),
    unitPrice: v.number(),
    totalPrice: v.number(),
    // Temporal snapshot fields - immutable product data at time of order
    productName: v.string(),
    productDescription: v.string(),
    productCategoryName: v.string(), // Store category name, not just ID
    productSizeName: v.optional(v.string()), // Store size name, not just ID
    // Combo-related snapshot fields
    comboSlotId: v.optional(v.string()), // Snapshot of combo slot ID (stable reference for edits)
    comboSlotName: v.optional(v.string()), // Snapshot of the combo slot name for display
    upcharge: v.optional(v.number()), // Snapshot of the upcharge for this option at order time
    organizationId: v.string(),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_menu_product", ["menuProductId"])
    .index("by_order_item_id", ["orderItemId"]),
  orderItems: defineTable({
    orderId: v.id("orders"),
    quantity: v.number(),
    unitPrice: v.number(), // Price per unit of this combination
    totalPrice: v.number(), // unitPrice * quantity
    notes: v.optional(v.string()),
    // Combo-related fields
    itemType: v.optional(v.union(v.literal("regular"), v.literal("combo"))), // Discriminator for pricing logic
    comboId: v.optional(v.id("combos")), // Reference to the combo template
    comboBasePrice: v.optional(v.number()), // Snapshot of the combo base price at order time
    comboName: v.optional(v.string()), // Snapshot of combo name at order time
    organizationId: v.string(),
  })
    .index("by_order_id", ["orderId"])
    .index("by_organization_id", ["organizationId"])
    .index("by_organization_and_order", ["organizationId", "orderId"]),
  orders: defineTable({
    orderNumber: v.string(),
    restaurantLocationId: v.id("restaurantLocations"),
    customerName: v.string(),
    customerPhone: v.string(),
    organizationId: v.string(),
    contactId: v.id("contacts"),
    conversationId: v.id("conversations"),
    subtotal: v.number(), // Sum of all orderItems totalPrice
    deliveryFee: v.optional(v.number()),
    total: v.number(), // subtotal + deliveryFee
    status: orderStatusValidator,
    orderType: orderTypeValidator, // delivery or pickup
    deliveryAddress: v.optional(v.string()), // Optional for pickup orders
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      })
    ),
    paymentMethod: paymentMethodValidator, // DEPRECATED - kept for backward compatibility with old orders
    paymentMethods: v.optional(
      v.array(
        v.object({
          method: paymentMethodTypeValidator,
          amount: v.optional(v.number()),
          referenceCode: v.optional(v.string()),
          notes: v.optional(v.string()),
        })
      )
    ), // New field - array of payment methods for split payments
    scheduledTime: v.optional(v.number()), // Timestamp for scheduled orders
    printedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()), // Timestamp when order was marked as paid
    cancelReason: v.optional(v.string()), // Reason for cancellation
    electronicInvoiceId: v.optional(v.id("electronicInvoices")), // Reference to electronic invoice if requested
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_status", ["status"])
    .index("by_order_number", ["orderNumber"])
    .index("by_conversation_id", ["conversationId"])
    .index("by_contact_id", ["contactId"])
    .index("by_scheduled_time", ["scheduledTime"])
    .index("by_organization_and_scheduled", ["organizationId", "scheduledTime"])
    .index("by_printed_status", ["printedAt"])
    .index("by_order_type", ["orderType"])
    // Optimized compound indexes for high-performance queries
    .index("by_organization_and_status", ["organizationId", "status"])
    .index("by_organization_and_restaurant_location", [
      "organizationId",
      "restaurantLocationId",
    ])
    .index("by_organization_and_type", ["organizationId", "orderType"]),
  deliveryAreas: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    organizationId: v.string(),
    restaurantLocationId: v.id("restaurantLocations"),
    coordinates: v.array(
      v.object({
        lat: v.number(),
        lng: v.number(),
      })
    ),
    isActive: v.boolean(),
    deliveryFee: v.optional(v.number()),
    minimumOrder: v.optional(v.number()),
    estimatedDeliveryTime: v.optional(v.string()),
    openingHours: v.optional(
      v.array(
        v.object({
          day: weekDayValidator,
          ranges: v.array(
            v.object({
              open: v.string(),
              close: v.string(),
            })
          ),
        })
      )
    ),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_active", ["isActive"])
    .index("by_organization_and_active", ["organizationId", "isActive"])
    .index("by_organization_and_restaurant_location", [
      "organizationId",
      "restaurantLocationId",
    ])
    .index("by_restaurant_location", ["restaurantLocationId"]),
  deliveryAreaTemplates: defineTable({
    cityKey: v.union(v.literal("bucaramanga"), v.literal("bogota")),
    cityName: v.string(),
    zoneKey: v.string(),
    zoneName: v.string(),
    polygon: v.array(
      v.object({
        lat: v.number(),
        lng: v.number(),
      })
    ),
    defaultDeliveryFee: v.number(),
    defaultEstimatedDeliveryTime: v.string(),
    defaultMinimumOrder: v.number(),
    isActive: v.boolean(),
    displayOrder: v.number(),
  })
    .index("by_city_key", ["cityKey"])
    .index("by_city_key_and_active", ["cityKey", "isActive"]),
  messageAttachments: defineTable({
    messageId: v.string(), // Thread message ID
    organizationId: v.string(),
    fileStorageId: v.string(),
    fileType: v.union(v.literal("audio"), v.literal("image")),
    fileName: v.string(),
    fileSize: v.number(),
    mimeType: v.string(),
    transcription: v.optional(v.string()), // For audio files
    description: v.optional(v.string()), // For image analysis
  })
    .index("by_message_id", ["messageId"])
    .index("by_organization_id", ["organizationId"]),

  // Conversation messages - Mirror of WhatsApp messages for dashboard display
  // This table represents the actual messages exchanged via WhatsApp
  conversationMessages: defineTable({
    conversationId: v.id("conversations"),
    organizationId: v.string(),

    // WhatsApp tracking
    messageId: v.optional(v.string()), // Internal Convex Agent message ID
    whatsappMessageId: v.optional(v.string()), // wamid para mensajes de WhatsApp

    // Dirección del mensaje
    direction: v.union(v.literal("inbound"), v.literal("outbound")),

    // Quién envió el mensaje (para distinguir AI vs operador en outbound)
    sender: v.optional(
      v.union(
        v.literal("user"), // Cliente/usuario
        v.literal("agent"), // Agente AI
        v.literal("operator"), // Operador humano del dashboard
        v.literal("system") // Mensajes automáticos del sistema (notificaciones, inactividad, etc.)
      )
    ),

    // Tipo de contenido (como WhatsApp)
    type: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("document"),
      v.literal("audio"),
      v.literal("video"),
      v.literal("location"),
      v.literal("contacts"),
      v.literal("sticker"),
      v.literal("interactive"), // Botones, listas
      v.literal("template"), // Mensajes de plantilla
      v.literal("reaction"), // Reacciones a mensajes
      v.literal("system") // Mensajes del sistema
    ),

    // Contenido según el tipo
    content: v.object({
      // Texto (para type: text, o caption de media)
      text: v.optional(v.string()),

      // Media (image, document, audio, video, sticker)
      media: v.optional(
        v.object({
          url: v.string(),
          mimeType: v.string(),
          filename: v.optional(v.string()),
          caption: v.optional(v.string()),
          storageId: v.optional(v.string()), // ID en Convex/R2 storage
        })
      ),

      // Location
      location: v.optional(
        v.object({
          latitude: v.number(),
          longitude: v.number(),
          name: v.optional(v.string()),
          address: v.optional(v.string()),
        })
      ),

      // Contacts (array de contactos compartidos)
      contacts: v.optional(
        v.array(
          v.object({
            name: v.string(),
            phones: v.array(v.string()),
          })
        )
      ),

      // Interactive (botones, listas)
      interactive: v.optional(
        v.object({
          type: v.string(), // "button", "list", etc.
          body: v.optional(v.string()),
          buttons: v.optional(
            v.array(
              v.object({
                id: v.string(),
                title: v.string(),
              })
            )
          ),
          buttonText: v.optional(v.string()), // For lists
          sections: v.optional(
            v.array(
              v.object({
                title: v.optional(v.string()),
                rows: v.array(
                  v.object({
                    id: v.string(),
                    title: v.string(),
                    description: v.optional(v.string()),
                  })
                ),
              })
            )
          ),
          header: v.optional(
            v.object({
              type: v.string(),
              text: v.optional(v.string()),
              imageUrl: v.optional(v.string()),
              videoUrl: v.optional(v.string()),
              documentUrl: v.optional(v.string()),
              documentFilename: v.optional(v.string()),
            })
          ),
          footer: v.optional(
            v.object({
              text: v.string(),
            })
          ),
          ctaUrl: v.optional(v.string()),
          ctaButtonText: v.optional(v.string()),
        })
      ),

      // Reaction
      reaction: v.optional(
        v.object({
          emoji: v.string(),
          messageId: v.string(), // ID del mensaje al que reacciona
        })
      ),
    }),

    // Estado del mensaje (para outbound)
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("sent"),
        v.literal("delivered"),
        v.literal("read"),
        v.literal("failed")
      )
    ),

    // Timestamp de WhatsApp (epoch seconds)
    whatsappTimestamp: v.optional(v.number()),

    // Timestamp real del mensaje (para ordenar correctamente)
    // Usa whatsappTimestamp si existe, sino el creationTime del thread del agente
    messageTimestamp: v.optional(v.number()),

    // Error info si falló
    errorMessage: v.optional(v.string()),
    isSilent: v.optional(v.boolean()), // If true, this message should not trigger notifications
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_timestamp", ["conversationId", "messageTimestamp"])
    .index("by_conversation_and_direction", ["conversationId", "direction"])
    .index("by_organization", ["organizationId"])
    .index("by_whatsapp_id", ["whatsappMessageId"])
    .index("by_message_id", ["messageId"]),

  restaurantConfiguration: defineTable({
    organizationId: v.string(),
    // Scheduling Configuration
    minAdvanceMinutes: v.number(), // Minimum advance time in minutes for scheduled orders
    maxAdvanceDays: v.number(), // Maximum advance time in days for scheduled orders

    // Order Management
    orderModificationBufferMinutes: v.number(), // Buffer time in minutes to modify orders after creation

    // Conversation Management
    conversationResolutionBufferMinutes: v.number(), // Buffer time in minutes before auto-resolving conversations after order delivery

    // Order Status Notification Messages
    orderStatusMessages: v.optional(
      v.object({
        delivery: v.optional(orderStatusMessageValidator),
        pickup: v.optional(orderStatusMessageValidator),
      })
    ),

    // Payment Configuration
    paymentLinkUrl: v.optional(v.string()), // URL for online payment links
    bankAccounts: v.optional(v.array(v.string())), // Bank account information for bank transfers
    acceptCash: v.optional(v.boolean()), // Accept cash payments (default: true)
    acceptCard: v.optional(v.boolean()), // Accept card payments (default: true)
    acceptTransfer: v.optional(v.boolean()), // DEPRECATED - Accept transfer payments (use acceptPaymentLink)
    acceptPaymentLink: v.optional(v.boolean()), // Accept payment link payments (default: true)
    acceptBankTransfer: v.optional(v.boolean()), // Accept bank transfer payments (default: false)
    acceptCorporateCredit: v.optional(v.boolean()), // Accept corporate credit/convenios empresariales (default: false)
    acceptGiftVoucher: v.optional(v.boolean()), // Accept gift vouchers/bonos de regalo (default: false)
    acceptSodexoVoucher: v.optional(v.boolean()), // Accept Sodexo vouchers - conversation will be escalated (default: false)

    acceptDynamicPaymentLink: v.optional(v.boolean()), // Accept dynamic payment link payments (default: false)

    // Order Type Configuration
    enableDelivery: v.optional(v.boolean()), // Enable delivery orders (default: true)
    enablePickup: v.optional(v.boolean()), // Enable pickup orders (default: true)

    // Invoice Configuration
    enableElectronicInvoice: v.optional(v.boolean()), // Enable/disable electronic invoice requests to customers

    // Custom Order Instructions
    deliveryInstructions: v.optional(v.string()), // Custom instructions for delivery orders
    pickupInstructions: v.optional(v.string()), // Custom instructions for pickup orders

    // Restaurant Information
    restaurantName: v.optional(v.string()), // Restaurant name
    restaurantPhone: v.optional(v.string()), // Restaurant phone number
    restaurantAddress: v.optional(v.string()), // Restaurant main address
    menuType: v.optional(menuTypeValidator), // Type of menu to send: 'images', 'pdf', or 'url'
    menuUrl: v.optional(v.string()), // URL to restaurant's menu
    menuImages: v.optional(v.array(v.string())), // Storage IDs for menu images
    menuPdf: v.optional(v.string()), // Storage ID for menu PDF document

    // Automatic First Reply Configuration
    // When enabled, sends a deterministic first message instead of invoking the AI agent
    // Uses the existing menu configuration (menuType, menuUrl, menuImages, menuPdf) for media
    automaticFirstReply: v.optional(
      v.object({
        enabled: v.boolean(), // Whether automatic first reply is enabled
        message: v.string(), // The text message to send
        sendMenu: v.optional(v.boolean()), // Whether to send the menu with the first reply
      })
    ),

    lastModified: v.optional(v.number()),
  }).index("by_organization_id", ["organizationId"]),
  whatsappConfigurations: defineTable({
    organizationId: v.string(),
    provider: v.optional(whatsappProviderValidator),
    accessToken: v.optional(v.string()), // Required for Meta
    phoneNumberId: v.optional(v.string()), // Required for Meta
    wabaId: v.optional(v.string()), // WhatsApp Business Account ID (required for template management)
    metaAppId: v.optional(v.string()), // Meta App ID (required for template media uploads)
    twilioAccountSid: v.optional(v.string()), // Required for Twilio
    twilioAuthToken: v.optional(v.string()), // Required for Twilio
    twilioPhoneNumber: v.optional(v.string()), // Required for Twilio
    dialog360ApiKey: v.optional(v.string()), // Required for 360dialog (D360-API-KEY)
    phoneNumber: v.string(), // Display phone number
    isActive: v.boolean(),
    displayName: v.optional(v.string()),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
    lastModified: v.optional(v.number()),
    gupshupApiKey: v.optional(v.string()),
    gupshupAppName: v.optional(v.string()), // Nombre de la app en Gupshup
    gupshupSourceNumber: v.optional(v.string()), // Número fuente registrado
    gupshupClientSecret: v.optional(v.string()), // Client Secret del Partner para onboarding/management
    gupshupAppId: v.optional(v.string()), // ID de la app de Gupshup (UUID) para Partner API v3
    gupshupAppToken: v.optional(v.string()), // Token de acceso de la app para Partner API v3
    gupshupMediaToken: v.optional(v.string()), // Token para descarga de media por cliente
  })
    .index("by_organization_provider_active", [
      "organizationId",
      "provider",
      "isActive",
    ])
    .index("by_provider_and_gupshup_app_name", [
      "provider",
      "gupshupAppName",
      "isActive",
    ])
    .index("by_provider_and_gupshup_app_id", [
      "provider",
      "gupshupAppId",
      "isActive",
    ])
    .index("by_phone_number_is_active_provider", [
      "phoneNumber",
      "isActive",
      "provider",
    ])
    .index("by_organization_id", ["organizationId"])
    .index("by_active", ["isActive"])
    .index("by_phone_number_id", ["phoneNumberId"])
    .index("by_phone_number", ["phoneNumber"])
    .index("by_twilio_account_sid", ["twilioAccountSid"]) // ✅ FIX: Index for Twilio webhook lookup
    .index("by_organization_and_active", ["organizationId", "isActive"])
    .index("by_organization_and_phone_number_id", [
      "organizationId",
      "phoneNumberId",
    ])
    .index("by_organization_and_phone_number", [
      "organizationId",
      "phoneNumber",
    ])
    .index("by_organization_and_restaurant_location", [
      "organizationId",
      "restaurantLocationId",
    ])
    .index("by_restaurant_location_id", ["restaurantLocationId"]),

  twilioConfigurations: defineTable({
    organizationId: v.string(),
    accountSid: v.string(),
    authToken: v.string(),
    phoneNumber: v.string(), // Twilio phone number
    isActive: v.boolean(),
    displayName: v.optional(v.string()),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
    lastModified: v.optional(v.number()),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_active", ["isActive"])
    .index("by_phone_number", ["phoneNumber"])
    .index("by_organization_and_active", ["organizationId", "isActive"])
    .index("by_organization_and_phone_number", [
      "organizationId",
      "phoneNumber",
    ])
    .index("by_organization_and_restaurant_location", [
      "organizationId",
      "restaurantLocationId",
    ])
    .index("by_restaurant_location_id", ["restaurantLocationId"]),

  electronicInvoices: defineTable({
    orderId: v.id("orders"),
    organizationId: v.string(),
    invoiceType: invoiceTypeValidator,
    // Common fields
    email: v.string(),
    fullName: v.string(),
    // Natural person fields
    cedula: v.optional(v.string()), // ID number for natural persons
    // Legal entity fields
    nit: v.optional(v.string()), // Tax ID for legal entities/companies
  })
    .index("by_order_id", ["orderId"])
    .index("by_organization_id", ["organizationId"])
    .index("by_organization_and_type", ["organizationId", "invoiceType"]),
  testEmails: defineTable({
    email: v.string(),
    expectation: v.union(
      v.literal("delivered"),
      v.literal("bounced"),
      v.literal("complained")
    ),
  }).index("by_email", ["email"]),
  r2Objects: defineTable({
    key: v.string(),
    type: v.string(),
    organizationId: v.string(),
  })
    .index("by_key", ["key"])
    .index("by_organization_id", ["organizationId"]),
  quickResponses: defineTable({
    organizationId: v.string(),
    title: v.string(),
    content: v.string(),
    category: v.optional(v.string()),
    isActive: v.boolean(),
    usageCount: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_organization_id", ["organizationId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["organizationId"],
    }),
  // Combo meals system tables
  combos: defineTable({
    name: v.string(),
    description: v.string(),
    basePrice: v.number(),
    imageUrl: v.optional(v.string()),
    isActive: v.boolean(),
    isDeleted: v.optional(v.boolean()),
    organizationId: v.string(),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_organization_id_and_is_active", ["organizationId", "isActive"]),
  comboSlots: defineTable({
    comboId: v.id("combos"),
    name: v.string(),
    minSelections: v.number(),
    maxSelections: v.number(),
    sortOrder: v.number(),
    organizationId: v.string(),
  })
    .index("by_combo_id", ["comboId"])
    .index("by_organization_id", ["organizationId"]),
  comboSlotOptions: defineTable({
    comboSlotId: v.id("comboSlots"),
    menuProductId: v.id("menuProducts"),
    upcharge: v.number(),
    isDefault: v.optional(v.boolean()),
    sortOrder: v.number(),
    organizationId: v.string(),
  })
    .index("by_combo_slot_id", ["comboSlotId"])
    .index("by_menu_product_id", ["menuProductId"])
    .index("by_organization_id", ["organizationId"]),
  comboAvailability: defineTable({
    comboId: v.id("combos"),
    restaurantLocationId: v.id("restaurantLocations"),
    available: v.boolean(),
    organizationId: v.string(),
  })
    .index("by_combo_id", ["comboId"])
    .index("by_restaurant_location_id", ["restaurantLocationId"])
    .index("by_organization_id", ["organizationId"]),
  // RAG (Retrieval-Augmented Generation) tables for AI-powered search
  rag: defineTable({
    namespace: v.string(),
    key: v.string(),
    text: v.string(),
    title: v.optional(v.string()),
    filterValues: v.array(
      v.object({
        name: v.string(),
        value: v.string(),
      })
    ),
    embeddingId: v.optional(v.string()),
  })
    .index("by_namespace", ["namespace"])
    .index("by_namespace_and_key", ["namespace", "key"])
    .index("by_embedding_id", ["embeddingId"]),

  // ============================================
  // BULK MESSAGING TABLES
  // ============================================

  // Message templates for reusable campaign content
  messageTemplates: defineTable({
    organizationId: v.string(),
    wabaId: v.string(), // WhatsApp Business Account ID (templates are per WABA)
    code: v.optional(v.string()), // Unique template code/identifier
    name: v.string(),
    description: v.optional(v.string()), // Description of what the template is for
    content: v.string(), // Message content with {{variable}} or {{1}} placeholders
    variables: v.array(v.string()), // List of variable names used in content
    // Meta WhatsApp API fields
    status: v.optional(messageTemplateStatusValidator), // WhatsApp approval status
    whatsappTemplateId: v.optional(v.string()), // WhatsApp template ID if approved
    category: v.optional(messageTemplateCategoryValidator), // MARKETING, UTILITY, AUTHENTICATION
    language: v.optional(v.string()), // Language code (e.g., "es", "en")
    // Header configuration
    headerType: v.optional(messageTemplateHeaderTypeValidator), // Type of header (none, text, image, video, document)
    headerText: v.optional(v.string()), // Header text content (if headerType is "text")
    headerImageUrl: v.optional(v.string()), // Example image URL for template creation/sending
    hasDynamicMedia: v.optional(v.boolean()), // Flag to indicate if the template supports dynamic (variable-based) media
    // Buttons configuration (legacy field name kept for backwards compatibility)
    links: v.optional(
      v.array(
        v.object({
          type: v.union(
            v.literal("url"),
            v.literal("phone"),
            v.literal("quick_reply"),
            v.literal("flow")
          ),
          nombre: v.string(), // Button name/text
          url: v.optional(v.string()), // Required if type is "url"
          phoneNumber: v.optional(v.string()), // Required if type is "phone"
          // Flow button fields
          flowId: v.optional(v.string()), // Required if type is "flow"
          flowAction: v.optional(v.string()), // "navigate" or "data_exchange"
          navigateScreen: v.optional(v.string()), // First screen ID for navigate action
        })
      )
    ),
    // Local fields
    isActive: v.boolean(),
    usageCount: v.number(), // How many times this template has been used
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_organization_and_active", ["organizationId", "isActive"])
    .index("by_organization_and_status", ["organizationId", "status"])
    .index("by_waba_id", ["wabaId"])
    .index("by_organization_and_waba", ["organizationId", "wabaId"])
    .index("by_code", ["organizationId", "code"]),

  // Messaging campaigns
  messageCampaigns: defineTable({
    organizationId: v.string(),
    name: v.string(),
    templateId: v.id("messageTemplates"),
    status: campaignStatusValidator,
    // Scheduling
    scheduledAt: v.optional(v.number()), // When to send (null = immediate)
    sentAt: v.optional(v.number()), // When sending started
    completedAt: v.optional(v.number()), // When sending completed
    // Recipient selection mode: "filters" (default) or "manual"
    recipientSelectionMode: v.optional(
      v.union(v.literal("filters"), v.literal("manual"))
    ),
    // Recipient filters (used when recipientSelectionMode is "filters" or undefined)
    recipientFilters: v.optional(
      v.object({
        allContacts: v.optional(v.boolean()),
        lastOrderAfter: v.optional(v.number()), // Timestamp
        lastOrderBefore: v.optional(v.number()), // Timestamp
        restaurantLocationIds: v.optional(v.array(v.id("restaurantLocations"))),
        minOrderCount: v.optional(v.number()),
        maxOrderCount: v.optional(v.number()),
        hasNoOrders: v.optional(v.boolean()),
        createdAfter: v.optional(v.number()), // Timestamp
        createdBefore: v.optional(v.number()), // Timestamp
      })
    ),
    // Manual contact selection (used when recipientSelectionMode is "manual")
    selectedContactIds: v.optional(v.array(v.id("contacts"))),
    // Statistics
    totalRecipients: v.number(),
    sentCount: v.number(),
    deliveredCount: v.number(),
    readCount: v.number(),
    failedCount: v.number(),
    // WhatsApp configuration to use
    whatsappConfigurationId: v.id("whatsappConfigurations"),
    // Header image URL for templates with image headers (overrides template default)
    headerImageUrl: v.optional(v.string()),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_organization_and_status", ["organizationId", "status"])
    .index("by_scheduled_at", ["scheduledAt"])
    .index("by_template_id", ["templateId"])
    .index("by_whatsapp_config", ["whatsappConfigurationId"]),

  // Individual campaign recipients with delivery status
  campaignRecipients: defineTable({
    campaignId: v.id("messageCampaigns"),
    contactId: v.id("contacts"),
    organizationId: v.string(),
    status: campaignRecipientStatusValidator,
    // Personalized message content (after variable substitution)
    personalizedContent: v.optional(v.string()),
    // Template parameters for Meta API (JSON stringified array)
    templateParams: v.optional(v.string()),
    // Timestamps
    sentAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    readAt: v.optional(v.number()),
    // Error tracking
    errorMessage: v.optional(v.string()),
    retryCount: v.number(),
    // WhatsApp message ID for status tracking
    whatsappMessageId: v.optional(v.string()),
  })
    .index("by_campaign_id", ["campaignId"])
    .index("by_campaign_and_status", ["campaignId", "status"])
    .index("by_contact_id", ["contactId"])
    .index("by_organization_id", ["organizationId"])
    .index("by_whatsapp_message_id", ["whatsappMessageId"]),

  // ============================================
  // ORGANIZATION PERMISSIONS
  // ============================================

  // Per-organization page access permissions
  // If null/undefined, falls back to global defaults in rbac.ts
  //
  // Roles hierarchy (highest to lowest):
  // - owner: Full access including AI config, WhatsApp setup
  // - admin: Full operational access, can manage staff and settings
  // - manager: Day-to-day operations, menu, orders, staff schedules
  // - cashier: Order management, conversations, contacts
  // - kitchen: View-only access to orders
  // - viewer: Read-only access to orders and basic stats
  organizationPermissions: defineTable({
    organizationId: v.string(),
    // Pages each role can access (overrides global defaults)
    // Array of page paths like ["/orders", "/conversations", "/menu"]
    ownerAllowedPages: v.optional(v.array(v.string())),
    adminAllowedPages: v.optional(v.array(v.string())),
    managerAllowedPages: v.optional(v.array(v.string())),
    cashierAllowedPages: v.optional(v.array(v.string())),
    kitchenAllowedPages: v.optional(v.array(v.string())),
    viewerAllowedPages: v.optional(v.array(v.string())),
    // Legacy fields (kept for backward compatibility, will be migrated)
    memberAllowedPages: v.optional(v.array(v.string())),
    // Metadata
    lastModifiedBy: v.optional(v.string()), // User ID who last modified
    lastModifiedAt: v.optional(v.number()),
  }).index("by_organization_id", ["organizationId"]),

  // ============================================
  // PLATFORM PERMISSIONS DEFAULTS
  // ============================================

  // Platform-wide default page access permissions.
  // These are used when an organization has no override configured in
  // `organizationPermissions`.
  //
  // This table is intended to have a single row (singleton).
  //
  // Roles: owner, admin, manager, cashier, kitchen, viewer
  platformPermissionsDefaults: defineTable({
    ownerAllowedPages: v.optional(v.array(v.string())),
    adminAllowedPages: v.optional(v.array(v.string())),
    managerAllowedPages: v.optional(v.array(v.string())),
    cashierAllowedPages: v.optional(v.array(v.string())),
    kitchenAllowedPages: v.optional(v.array(v.string())),
    viewerAllowedPages: v.optional(v.array(v.string())),
    // Legacy fields (kept for backward compatibility)
    memberAllowedPages: v.optional(v.array(v.string())),
    // Metadata
    lastModifiedBy: v.optional(v.string()),
    lastModifiedAt: v.optional(v.number()),
  }),

  // ============================================
  // ONBOARDING PROGRESS
  // ============================================

  // Tracks the 6-step guided onboarding progress for new organizations
  // Steps: 1. Menu Upload, 2. Combos, 3. Locations, 4. Delivery Zones, 5. Bot Calibration, 6. Business Rules
  onboardingProgress: defineTable({
    organizationId: v.string(),
    // Step completion tracking
    currentStep: v.number(), // 1-6, current step user is on
    completedSteps: v.array(v.number()), // Array of completed step numbers
    isCompleted: v.boolean(), // True when all steps done
    // Step 1: Menu data (stored separately in menuProducts, just track completion)
    menuUploadCompleted: v.boolean(),
    menuProductsCount: v.optional(v.number()),
    // Step 2: Combos
    combosCompleted: v.optional(v.boolean()),
    combosCount: v.optional(v.number()),
    // Step 3: Locations (stored in restaurantLocations)
    locationsCompleted: v.boolean(),
    locationsCount: v.optional(v.number()),
    // Step 4: Delivery zones (stored in deliveryAreas)
    deliveryZonesCompleted: v.boolean(),
    deliveryZonesCount: v.optional(v.number()),
    // Step 5: Bot calibration data
    botCalibrationCompleted: v.boolean(),
    botCalibrationData: v.optional(
      v.object({
        tone: v.string(), // formal, casual, friendly, professional
        greetingStyle: v.string(),
        responseLength: v.string(), // brief, detailed
        upselling: v.boolean(),
        promotionMentions: v.boolean(),
      })
    ),
    // Step 6: Business rules
    businessRulesCompleted: v.boolean(),
    businessRulesText: v.optional(v.string()),
    businessRulesAudioStorageId: v.optional(v.string()),
    businessRulesTranscription: v.optional(v.string()),
    // Timestamps
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    lastUpdatedAt: v.number(),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_is_completed", ["isCompleted"])
    .index("by_organization_and_completed", ["organizationId", "isCompleted"]),

  // ============================================
  // ADMIN DEBUG CONVERSATIONS
  // ============================================

  // Tracks conversations that superadmins are debugging
  // Allows cross-organization access to conversation threads for support purposes
  // organizationId is stored for display purposes but NOT used for filtering (superadmins see all orgs)
  adminDebugConversations: defineTable({
    threadId: v.string(),
    conversationId: v.id("conversations"),
    organizationId: v.string(), // Stored for display, not for filtering
    contactDisplayName: v.optional(v.string()),
    reason: v.string(),
    expectedResponse: v.optional(v.string()),
    addedBy: v.string(), // Better Auth userId (original reporter)
    addedAt: v.number(), // Timestamp
    lastUpdatedBy: v.optional(v.string()), // User who last appended to the report
    lastUpdatedAt: v.optional(v.number()), // Timestamp of last update
  })
    .index("by_added_by", ["addedBy"])
    .index("by_added_at", ["addedAt"])
    .index("by_thread_id", ["threadId"])
    .index("by_organization_id", ["organizationId"]),

  // ==== Debug Agent Conversations ====
  // Stores debug agent chat threads per organization (supports multiple threads)
  debugAgentConversations: defineTable({
    organizationId: v.string(),
    threadId: v.string(),
    lastMessageAt: v.number(),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_thread_id", ["threadId"]),

  // ============================================
  // AGENT BENCHMARK
  // ============================================

  agentBenchmarkSuites: defineTable({
    suiteKey: v.string(),
    version: v.number(),
    status: benchmarkSuiteStatusValidator,
    scope: benchmarkSuiteScopeValidator,
    organizationId: v.optional(v.string()),
    casesCount: v.number(),
    source: v.string(),
    createdAt: v.number(),
    createdBy: v.optional(v.string()),
  })
    .index("by_suite_key", ["suiteKey"])
    .index("by_scope_and_status", ["scope", "status"])
    .index("by_org_scope_status", ["organizationId", "scope", "status"]),

  agentBenchmarkCases: defineTable({
    suiteId: v.id("agentBenchmarkSuites"),
    caseKey: v.string(),
    name: v.string(),
    priority: benchmarkCasePriorityValidator,
    category: benchmarkCaseCategoryValidator,
    inputScript: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        text: v.string(),
      })
    ),
    mockContext: v.object({
      includeAddressValidation: v.optional(v.boolean()),
      includeMenuLookup: v.optional(v.boolean()),
      includeCombinationValidation: v.optional(v.boolean()),
      includeOrderCreation: v.optional(v.boolean()),
      includeEscalation: v.optional(v.boolean()),
      includeScheduling: v.optional(v.boolean()),
      includePayment: v.optional(v.boolean()),
      locationId: v.optional(v.string()),
      mockErrorScenario: v.optional(v.string()),
      customData: v.optional(v.any()),
    }),
    expectedDeterministic: v.object({
      requiredTools: v.optional(v.array(v.string())),
      prohibitedTools: v.optional(v.array(v.string())),
      requiredToolOrder: v.optional(v.array(v.string())),
      forbiddenPhrases: v.optional(v.array(v.string())),
      requiredPhrases: v.optional(v.array(v.string())),
      maxToolCalls: v.optional(v.number()),
      disallowInternalLeakage: v.optional(v.boolean()),
    }),
    judgeRubric: v.object({
      clarityWeight: v.number(),
      accuracyWeight: v.number(),
      contextWeight: v.number(),
      policyWeight: v.number(),
      toneWeight: v.number(),
      expectedTone: v.optional(v.string()),
      successDefinition: v.string(),
    }),
    critical: v.boolean(),
    enabled: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_suite_id", ["suiteId"])
    .index("by_suite_and_enabled", ["suiteId", "enabled"])
    .index("by_case_key", ["caseKey"]),

  agentBenchmarkRuns: defineTable({
    organizationId: v.string(),
    trigger: benchmarkTriggerValidator,
    suiteVersionGlobal: v.number(),
    suiteVersionOverlay: v.optional(v.number()),
    modelConfigured: aiModelValidator,
    modelBaseline: aiModelValidator,
    status: benchmarkRunStatusValidator,
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    totalCases: v.number(),
    passedCases: v.number(),
    criticalFailures: v.number(),
    scoreGlobal: v.number(),
    scoreByDimension: v.object({
      deterministic: v.number(),
      judge: v.number(),
      flow: v.number(),
      safety: v.number(),
      toolUsage: v.number(),
      conversational: v.number(),
    }),
    passDecision: v.boolean(),
    decisionReason: v.string(),
    error: v.optional(v.string()),
    totalDurationMs: v.optional(v.number()),
  })
    .index("by_organization_and_started_at", ["organizationId", "startedAt"])
    .index("by_status", ["status"]),

  agentBenchmarkCaseResults: defineTable({
    runId: v.id("agentBenchmarkRuns"),
    caseId: v.id("agentBenchmarkCases"),
    modelProfile: benchmarkModelProfileValidator,
    deterministicChecks: v.object({
      passed: v.boolean(),
      score: v.number(),
      checks: v.array(
        v.object({
          name: v.string(),
          passed: v.boolean(),
          critical: v.boolean(),
          details: v.optional(v.string()),
        })
      ),
    }),
    judgeScore: v.number(),
    judgeRationale: v.string(),
    judgeDimensions: v.optional(
      v.object({
        clarity: v.number(),
        accuracy: v.number(),
        context: v.number(),
        policy: v.number(),
        tone: v.number(),
      })
    ),
    finalScore: v.number(),
    pass: v.boolean(),
    criticalFailure: v.boolean(),
    failureType: v.optional(v.string()),
    traceRef: v.optional(v.string()),
    toolCalls: v.array(v.string()),
    assistantTranscript: v.array(v.string()),
    durationMs: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_run_id", ["runId"])
    .index("by_run_and_model", ["runId", "modelProfile"])
    .index("by_run_and_critical", ["runId", "criticalFailure"]),

  agentBenchmarkRecommendations: defineTable({
    runId: v.id("agentBenchmarkRuns"),
    organizationId: v.string(),
    section: v.union(
      v.literal("brandVoice"),
      v.literal("businessRules"),
      v.literal("specialInstructions"),
      v.literal("coreIdentityOverride"),
      v.literal("coreToolsOverride"),
      v.literal("coreConversationOverride"),
      v.literal("coreOperationsOverride")
    ),
    problemPattern: v.string(),
    beforeText: v.string(),
    afterText: v.string(),
    expectedImpact: v.string(),
    confidence: v.number(),
    affectedCases: v.optional(v.array(v.string())),
    status: benchmarkRecommendationStatusValidator,
    createdAt: v.number(),
  })
    .index("by_run_id", ["runId"])
    .index("by_org_and_created_at", ["organizationId", "createdAt"])
    .index("by_status", ["status"]),

  // ============================================
  // MENU EXTRACTION JOBS
  // ============================================

  // Tracks the 5-stage AI extraction pipeline for menu import during onboarding
  // Stages: cleaning → extracting_categories → extracting_subcategories → extracting_sizes → extracting_products → completed
  menuExtractionJobs: defineTable({
    organizationId: v.string(),
    status: v.union(
      v.literal("uploading"),
      v.literal("cleaning"),
      v.literal("extracting_categories"),
      v.literal("extracting_subcategories"),
      v.literal("extracting_sizes"),
      v.literal("extracting_products"),
      v.literal("completed"),
      v.literal("failed")
    ),
    fileStorageIds: v.array(v.id("_storage")),
    cleanedText: v.optional(v.string()),
    extractedCategories: v.optional(v.string()),
    extractedSubcategories: v.optional(v.string()),
    extractedSizes: v.optional(v.string()),
    extractedProducts: v.optional(v.string()),
    error: v.optional(v.string()),
    failedAtStage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    generation: v.number(),
  }).index("by_organization_id", ["organizationId"]),

  // Tracks the AI extraction pipeline for combo import during onboarding
  // Stages: processing → completed | failed
  comboExtractionJobs: defineTable({
    organizationId: v.string(),
    status: v.union(
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    fileStorageIds: v.array(v.id("_storage")),
    extractedCombos: v.optional(v.string()),
    error: v.optional(v.string()),
    failedAtStage: v.optional(v.string()),
  }).index("by_organization_id", ["organizationId"]),

  // Stores conversation threads for the combo builder AI assistant during onboarding
  comboBuilderConversations: defineTable({
    organizationId: v.string(),
    threadId: v.string(),
    onboardingSessionId: v.optional(v.string()),
  })
    .index("by_organization_id", ["organizationId"])
    .index("by_thread_id", ["threadId"]),
})
