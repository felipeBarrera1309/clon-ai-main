import type { Doc } from "../_generated/dataModel"
import type { AIModelType } from "../lib/aiModels"

export type BenchmarkCasePriority = "low" | "medium" | "high"

export type BenchmarkCaseCategory =
  | "flow"
  | "tools"
  | "security"
  | "tone"
  | "coverage"
  | "combinations"
  | "scheduling"
  | "payment"
  | "escalation"

export type BenchmarkTrigger =
  | "onboarding"
  | "prompt_change"
  | "weekly"
  | "manual"

export type BenchmarkModelProfile = "configured" | "baseline"

export type BenchmarkSection =
  | "brandVoice"
  | "businessRules"
  | "specialInstructions"
  | "coreIdentityOverride"
  | "coreToolsOverride"
  | "coreConversationOverride"
  | "coreOperationsOverride"

export type DeterministicAssertion = {
  requiredTools?: string[]
  prohibitedTools?: string[]
  requiredToolOrder?: string[]
  forbiddenPhrases?: string[]
  requiredPhrases?: string[]
  maxToolCalls?: number
  disallowInternalLeakage?: boolean
}

export type JudgeRubric = {
  clarityWeight: number
  accuracyWeight: number
  contextWeight: number
  policyWeight: number
  toneWeight: number
  expectedTone?: string
  successDefinition: string
}

export type BenchmarkCase = {
  caseKey: string
  name: string
  priority: BenchmarkCasePriority
  category: BenchmarkCaseCategory
  inputScript: Array<{
    role: "user" | "assistant"
    text: string
  }>
  mockContext: {
    includeAddressValidation?: boolean
    includeMenuLookup?: boolean
    includeCombinationValidation?: boolean
    includeOrderCreation?: boolean
    includeEscalation?: boolean
    includeScheduling?: boolean
    includePayment?: boolean
    locationId?: string
    mockErrorScenario?: string
    customData?: string | number | boolean | null
  }
  expectedDeterministic: DeterministicAssertion
  judgeRubric: JudgeRubric
  critical: boolean
}

export type BenchmarkRunSummary = {
  organizationId: string
  trigger: BenchmarkTrigger
  modelConfigured: AIModelType
  modelBaseline: AIModelType
  totalCases: number
  passedCases: number
  criticalFailures: number
  scoreGlobal: number
  passDecision: boolean
  decisionReason: string
}

export type BenchmarkScoreBreakdown = {
  deterministic: number
  judge: number
  flow: number
  safety: number
  toolUsage: number
  conversational: number
}

export type DeterministicCheckResult = {
  name: string
  passed: boolean
  critical: boolean
  details?: string
}

export type PromptRecommendation = {
  section: BenchmarkSection
  problemPattern: string
  beforeText: string
  afterText: string
  expectedImpact: string
  confidence: number
  affectedCases: string[]
}

export type OrgBenchmarkContext = {
  menuProducts: Doc<"menuProducts">[]
  menuCategories: Doc<"menuProductCategories">[]
  sizes: Doc<"sizes">[]
  restaurantLocations: Doc<"restaurantLocations">[]
  restaurantConfig: Doc<"restaurantConfiguration"> | null
  deliveryAreas: Doc<"deliveryAreas">[]
  menuProductAvailability: Doc<"menuProductAvailability">[]
}

const SECTION_FIELDS: Record<
  BenchmarkSection,
  keyof Doc<"agentConfiguration">
> = {
  brandVoice: "brandVoice",
  businessRules: "businessRules",
  specialInstructions: "specialInstructions",
  coreIdentityOverride: "coreIdentityOverride",
  coreToolsOverride: "coreToolsOverride",
  coreConversationOverride: "coreConversationOverride",
  coreOperationsOverride: "coreOperationsOverride",
}

export function getConfigSectionText(
  config: Doc<"agentConfiguration"> | null,
  section: BenchmarkSection
): string {
  if (!config) return ""
  const field = SECTION_FIELDS[section]
  const value = config[field]
  return typeof value === "string" ? value : ""
}

export type OrgOverlayRestaurantConfig = Pick<
  Doc<"restaurantConfiguration">,
  | "enableDelivery"
  | "enablePickup"
  | "enableElectronicInvoice"
  | "acceptSodexoVoucher"
>
