import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"
import { defaultSettingsMiddleware, gateway, wrapLanguageModel } from "ai"
import { env } from "./env"

// Definiciones compartidas de modelos de IA para toda la aplicación

export type AIModelType =
  // === Google ===
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-no-thinking"
  | "gemini-3.0-flash"
  | "gemini-3.1-flash-lite-preview"
  | "gemini-3.1-flash-lite-minimal"
  | "gemini-3-flash-minimal"
  | "gemini-3-flash-high"

  // === xAI ===
  | "grok-4-fast-no-reasoning"
  | "grok-4.1-fast-non-reasoning"
  | "grok-4.1-fast-reasoning"

  // === OpenAI ===
  | "openai-120b"
  | "openai-20b"
  | "openai-o4-mini"

  // === Meta (Llama) ===
  | "llama-3.1-8b"
  | "llama-3.1-70b"
  | "llama-3.2-1b"
  | "llama-3.2-3b"
  | "llama-3.2-11b"
  | "llama-3.2-90b"
  | "llama-3.3-70b"
  | "llama-4-scout"
  | "llama-4-maverick"

  // === Anthropic (Claude) ===
  | "claude-3-opus"
  | "claude-3.5-sonnet"
  | "claude-3.5-haiku"
  | "claude-3-haiku"
  | "claude-3.7-sonnet"
  | "claude-opus-4"
  | "claude-opus-4.1"
  | "claude-sonnet-4"
  | "claude-sonnet-4.5"
  | "claude-haiku-4.5"

  // === Amazon ===
  | "amazon-nova-pro"
  | "amazon-nova-micro"
  | "amazon-nova-lite"
  | "amazon-titan-embed-text-v2"

  // === Alibaba ===
  | "qwen-3-32b"
  | "qwen-3-coder-30b-a3b"

  // === DeepSeek ===
  | "deepseek-r1"

  // === Xiaomi ===
  | "mimo-v2-flash"

export type AIModelInfo = {
  label: string
  provider: string
  description: string
  // Gateway model mappings (via Vercel AI Gateway)
  gatewayModel: string
  // OpenAI fallback models (direct via OpenAI SDK)
  fallbackModel: string
}

export type AIModelOption = {
  value: AIModelType
  label: string
  provider: string
}

export const ALLOWED_AGENT_MODEL_TYPES = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-no-thinking",
  "gemini-3.0-flash",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-flash-lite-minimal",
  "gemini-3-flash-minimal",
  "grok-4-fast-no-reasoning",
  "grok-4.1-fast-non-reasoning",
  "openai-o4-mini",
] as const satisfies readonly AIModelType[]

export type AllowedAgentModelType = (typeof ALLOWED_AGENT_MODEL_TYPES)[number]

// Función utilitaria para generar lista de modelos (para sincronización con schema.ts)
export function generateModelKeys(): readonly string[] {
  return Object.keys(AI_MODELS) as readonly string[]
}

// Información detallada de cada modelo de IA
export const AI_MODELS: Record<AIModelType, AIModelInfo> = {
  // === Google ===
  "gemini-2.5-flash": {
    label: "Gemini 2.5 Flash",
    provider: "Google",
    description: "Modelo rápido y eficiente de Google",
    gatewayModel: "google/gemini-2.5-flash",
    fallbackModel: "gpt-4o-mini",
  },

  "gemini-3.0-flash": {
    label: "Gemini 3.0 Flash",
    provider: "Google",
    description: "Nueva generación del modelo rápido de Google",
    gatewayModel: "google/gemini-3-flash",
    fallbackModel: "gpt-4o-mini",
  },

  "gemini-3.1-flash-lite-preview": {
    label: "Gemini 3.1 Flash Lite (Preview)",
    provider: "Google",
    description:
      "Modelo económico y rápido de Gemini 3.1 vía AI Gateway con thinking por defecto del modelo",
    gatewayModel: "google/gemini-3.1-flash-lite-preview",
    fallbackModel: "gpt-4o-mini",
  },

  "gemini-3.1-flash-lite-minimal": {
    label: "Gemini 3.1 Flash Lite (Mínimo)",
    provider: "Google",
    description:
      "Gemini 3.1 Flash Lite con razonamiento mínimo para menor latencia",
    gatewayModel: "google/gemini-3.1-flash-lite-preview",
    fallbackModel: "gpt-4o-mini",
  },

  "gemini-2.5-flash-no-thinking": {
    label: "Gemini 2.5 Flash (Sin Pensamiento)",
    provider: "Google",
    description: "Modelo rápido sin razonamiento interno - máxima velocidad",
    gatewayModel: "google/gemini-2.5-flash",
    fallbackModel: "gpt-4o-mini",
  },

  "gemini-3-flash-minimal": {
    label: "Gemini 3 Flash (Mínimo)",
    provider: "Google",
    description:
      "Modelo rápido con razonamiento mínimo - ideal para tareas simples",
    gatewayModel: "google/gemini-3-flash",
    fallbackModel: "gpt-4o-mini",
  },

  "gemini-3-flash-high": {
    label: "Gemini 3 Flash (Alto)",
    provider: "Google",
    description:
      "Modelo con razonamiento profundo - ideal para tareas complejas",
    gatewayModel: "google/gemini-3-flash",
    fallbackModel: "gpt-4o-mini",
  },

  // === xAI ===
  "grok-4-fast-no-reasoning": {
    label: "Grok 4 Fast (Sin Razonamiento)",
    provider: "xAI",
    description: "Modelo rápido de xAI sin etapa de razonamiento",
    gatewayModel: "xai/grok-4-fast-non-reasoning",
    fallbackModel: "gpt-4o-mini",
  },
  "grok-4.1-fast-non-reasoning": {
    label: "Grok 4.1 Fast (Sin Razonamiento)",
    provider: "xAI",
    description:
      "Variante optimizada para velocidad de Grok 4.1 Fast con tool calling",
    gatewayModel: "xai/grok-4.1-fast-non-reasoning",
    fallbackModel: "gpt-4o-mini",
  },
  "grok-4.1-fast-reasoning": {
    label: "Grok 4.1 Fast (Razonamiento)",
    provider: "xAI",
    description:
      "Variante de razonamiento de Grok 4.1 Fast para tareas agentic más precisas",
    gatewayModel: "xai/grok-4.1-fast-reasoning",
    fallbackModel: "gpt-4o-mini",
  },

  // === OpenAI ===
  "openai-120b": {
    label: "OpenAI OSS 120B",
    provider: "OpenAI",
    description: "Modelo open source de 120B parámetros",
    gatewayModel: "openai/gpt-oss-120b",
    fallbackModel: "gpt-4o",
  },
  "openai-20b": {
    label: "OpenAI OSS 20B",
    provider: "OpenAI",
    description: "Modelo open source de 20B parámetros",
    gatewayModel: "openai/gpt-oss-20b",
    fallbackModel: "gpt-4o-mini",
  },
  "openai-o4-mini": {
    label: "OpenAI o4-mini",
    provider: "OpenAI",
    description: "Modelo compacto de OpenAI",
    gatewayModel: "openai/gpt-4o-mini",
    fallbackModel: "gpt-4o-mini",
  },

  // === Meta (Llama) ===
  "llama-3.1-8b": {
    label: "Meta Llama 3.1 8B",
    provider: "Meta",
    description: "Modelo de 8B parámetros, eficiente y potente",
    gatewayModel: "meta/llama-3.1-8b",
    fallbackModel: "gpt-4o-mini",
  },
  "llama-3.1-70b": {
    label: "Meta Llama 3.1 70B",
    provider: "Meta",
    description: "Modelo de gran tamaño para tareas complejas",
    gatewayModel: "meta/llama-3.1-70b",
    fallbackModel: "gpt-4o",
  },
  "llama-3.2-1b": {
    label: "Meta Llama 3.2 1B",
    provider: "Meta",
    description: "Modelo compacto de 1B parámetros",
    gatewayModel: "meta/llama-3.2-1b",
    fallbackModel: "gpt-4o-mini",
  },
  "llama-3.2-3b": {
    label: "Meta Llama 3.2 3B",
    provider: "Meta",
    description: "Versión intermedia de Llama 3.2",
    gatewayModel: "meta/llama-3.2-3b",
    fallbackModel: "gpt-4o-mini",
  },
  "llama-3.2-11b": {
    label: "Meta Llama 3.2 11B",
    provider: "Meta",
    description: "Modelo balanceado entre tamaño y rendimiento",
    gatewayModel: "meta/llama-3.2-11b",
    fallbackModel: "gpt-4o",
  },
  "llama-3.2-90b": {
    label: "Meta Llama 3.2 90B",
    provider: "Meta",
    description: "Modelo grande de alto rendimiento",
    gatewayModel: "meta/llama-3.2-90b",
    fallbackModel: "gpt-4o",
  },
  "llama-3.3-70b": {
    label: "Meta Llama 3.3 70B",
    provider: "Meta",
    description: "Versión optimizada del Llama 3.3 con 70B parámetros",
    gatewayModel: "meta/llama-3.3-70b",
    fallbackModel: "gpt-4o",
  },
  "llama-4-scout": {
    label: "Meta Llama 4 Scout",
    provider: "Meta",
    description: "Modelo exploratorio de la familia Llama 4",
    gatewayModel: "meta/llama-4-scout",
    fallbackModel: "gpt-4o-mini",
  },
  "llama-4-maverick": {
    label: "Meta Llama 4 Maverick",
    provider: "Meta",
    description: "Modelo experimental de alto rendimiento de Llama 4",
    gatewayModel: "meta/llama-4-maverick",
    fallbackModel: "gpt-4o",
  },

  // === Anthropic (Claude) ===
  "claude-3-opus": {
    label: "Claude 3 Opus",
    provider: "Anthropic",
    description: "Modelo de gama alta de la serie Claude 3",
    gatewayModel: "anthropic/claude-3-opus",
    fallbackModel: "gpt-4o",
  },
  "claude-3.5-sonnet": {
    label: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    description: "Modelo balanceado entre rendimiento y coste",
    gatewayModel: "anthropic/claude-3.5-sonnet-20240620",
    fallbackModel: "gpt-4o-mini",
  },
  "claude-3.5-haiku": {
    label: "Claude 3.5 Haiku",
    provider: "Anthropic",
    description: "Versión ligera y rápida del Claude 3.5",
    gatewayModel: "anthropic/claude-3.5-haiku",
    fallbackModel: "gpt-4o-mini",
  },
  "claude-3-haiku": {
    label: "Claude 3 Haiku",
    provider: "Anthropic",
    description: "Modelo rápido y económico de Claude 3",
    gatewayModel: "anthropic/claude-3-haiku",
    fallbackModel: "gpt-4o-mini",
  },
  "claude-3.7-sonnet": {
    label: "Claude 3.7 Sonnet",
    provider: "Anthropic",
    description: "Modelo intermedio avanzado de la serie Claude 3.7",
    gatewayModel: "anthropic/claude-3.7-sonnet",
    fallbackModel: "gpt-4o",
  },
  "claude-opus-4": {
    label: "Claude Opus 4",
    provider: "Anthropic",
    description: "Modelo de alto rendimiento de la serie Claude 4",
    gatewayModel: "anthropic/claude-opus-4",
    fallbackModel: "gpt-4o",
  },
  "claude-opus-4.1": {
    label: "Claude Opus 4.1",
    provider: "Anthropic",
    description:
      "Versión mejorada del Opus 4 con más capacidades de razonamiento",
    gatewayModel: "anthropic/claude-opus-4.1",
    fallbackModel: "gpt-4o",
  },
  "claude-sonnet-4": {
    label: "Claude Sonnet 4",
    provider: "Anthropic",
    description: "Versión balanceada de la familia Claude 4",
    gatewayModel: "anthropic/claude-sonnet-4",
    fallbackModel: "gpt-4o-mini",
  },
  "claude-sonnet-4.5": {
    label: "Claude Sonnet 4.5",
    provider: "Anthropic",
    description: "Versión mejorada del Sonnet 4 con capacidades extendidas",
    gatewayModel: "anthropic/claude-sonnet-4.5",
    fallbackModel: "gpt-4o",
  },
  "claude-haiku-4.5": {
    label: "Claude Haiku 4.5",
    provider: "Anthropic",
    description: "Modelo rápido de la generación Claude 4.5",
    gatewayModel: "anthropic/claude-haiku-4.5",
    fallbackModel: "gpt-4o-mini",
  },

  // === Amazon ===
  "amazon-nova-pro": {
    label: "Amazon Nova Pro",
    provider: "Amazon",
    description: "Modelo avanzado de Amazon para tareas complejas",
    gatewayModel: "amazon/nova-pro",
    fallbackModel: "gpt-4o",
  },
  "amazon-nova-micro": {
    label: "Amazon Nova Micro",
    provider: "Amazon",
    description: "Versión ligera de Nova para respuestas rápidas",
    gatewayModel: "amazon/nova-micro",
    fallbackModel: "gpt-4o-mini",
  },
  "amazon-nova-lite": {
    label: "Amazon Nova Lite",
    provider: "Amazon",
    description: "Modelo equilibrado de la familia Nova",
    gatewayModel: "amazon/nova-lite",
    fallbackModel: "gpt-4o-mini",
  },
  "amazon-titan-embed-text-v2": {
    label: "Amazon Titan Embed Text v2",
    provider: "Amazon",
    description: "Modelo de embeddings de texto de Amazon",
    gatewayModel: "amazon/titan-embed-text-v2",
    fallbackModel: "gpt-4o-mini",
  },

  // === Alibaba ===
  "qwen-3-32b": {
    label: "Alibaba Qwen 3 32B",
    provider: "Alibaba",
    description: "Modelo de gran tamaño para comprensión avanzada de lenguaje",
    gatewayModel: "alibaba/qwen-3-32b",
    fallbackModel: "gpt-4o",
  },
  "qwen-3-coder-30b-a3b": {
    label: "Alibaba Qwen 3 Coder 30B A3B",
    provider: "Alibaba",
    description: "Modelo de codificación avanzado de Alibaba",
    gatewayModel: "alibaba/qwen-3-coder-30b-a3b",
    fallbackModel: "gpt-4o",
  },

  // === DeepSeek ===
  "deepseek-r1": {
    label: "DeepSeek R1",
    provider: "DeepSeek",
    description: "Modelo de razonamiento especializado de DeepSeek",
    gatewayModel: "deepseek/deepseek-r1",
    fallbackModel: "gpt-4o-mini",
  },

  // === Xiaomi ===
  "mimo-v2-flash": {
    label: "MiMo V2 Flash",
    provider: "Xiaomi",
    description:
      "Modelo MoE de Xiaomi optimizado para alta velocidad y tareas agentic",
    gatewayModel: "xiaomi/mimo-v2-flash",
    fallbackModel: "gpt-4o-mini",
  },
} as const

// Opciones para selectores de UI (generadas automáticamente desde AI_MODELS)
export const AI_MODEL_OPTIONS: AIModelOption[] = Object.entries(AI_MODELS).map(
  ([key, model]) => ({
    value: key as AIModelType,
    label: model.label,
    provider: model.provider,
  })
)

export const ALLOWED_AGENT_MODEL_OPTIONS: AIModelOption[] =
  ALLOWED_AGENT_MODEL_TYPES.map((modelType) => ({
    value: modelType,
    label: AI_MODELS[modelType].label,
    provider: AI_MODELS[modelType].provider,
  }))

// Modelos por defecto
export const DEFAULT_SUPPORT_AGENT_MODEL: AIModelType =
  "grok-4-fast-no-reasoning"
export const DEFAULT_MENU_AGENT_MODEL: AIModelType = "grok-4-fast-no-reasoning"
export const DEFAULT_VALIDATION_MENU_AGENT_MODEL: AIModelType =
  "gemini-2.5-flash"

export function isAllowedAgentModel(
  modelType: AIModelType | undefined
): modelType is AllowedAgentModelType {
  return (
    modelType !== undefined &&
    ALLOWED_AGENT_MODEL_TYPES.includes(modelType as AllowedAgentModelType)
  )
}

export function sanitizeConfiguredAgentModel(
  modelType: AIModelType | undefined
) {
  return isAllowedAgentModel(modelType) ? modelType : undefined
}

export function createLanguageModel(modelType: AIModelType): LanguageModel {
  const modelInfo = AI_MODELS[modelType]

  // Handle Gemini 2.5 Flash no-thinking variant
  if (modelType === "gemini-2.5-flash-no-thinking") {
    try {
      return wrapLanguageModel({
        model: gateway(modelInfo.gatewayModel),
        middleware: defaultSettingsMiddleware({
          settings: {
            providerOptions: {
              google: {
                thinkingConfig: {
                  thinkingBudget: 0, // Completely disable thinking
                },
              },
            },
          },
        }),
      })
    } catch (error) {
      if (env.OPENAI_API_KEY) {
        console.error(
          "Gateway failed for Gemini no-thinking variant, falling back to OpenAI:",
          error
        )
        const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })
        return openai(modelInfo.fallbackModel)
      }
      throw error
    }
  }

  // Handle Gemini 3 Flash thinking variants
  if (
    modelType === "gemini-3.1-flash-lite-minimal" ||
    modelType === "gemini-3-flash-minimal" ||
    modelType === "gemini-3-flash-high"
  ) {
    const thinkingLevel =
      modelType === "gemini-3-flash-high" ? "high" : "minimal"

    try {
      return wrapLanguageModel({
        model: gateway(modelInfo.gatewayModel),
        middleware: defaultSettingsMiddleware({
          settings: {
            providerOptions: {
              google: {
                thinkingConfig: {
                  thinkingLevel,
                  includeThoughts: true,
                },
              },
            },
          },
        }),
      })
    } catch (error) {
      if (env.OPENAI_API_KEY) {
        console.error(
          "Gateway failed for Gemini thinking variant, falling back to OpenAI:",
          error
        )
        const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })
        return openai(modelInfo.fallbackModel)
      }
      throw error
    }
  }

  // Standard models - use gateway with fallback
  try {
    return gateway(modelInfo.gatewayModel)
  } catch (error) {
    // Fallback to direct OpenAI if gateway fails and API key is available
    if (env.OPENAI_API_KEY) {
      console.error("Gateway failed, falling back to OpenAI:", error)
      const openai = createOpenAI({
        apiKey: env.OPENAI_API_KEY,
      })
      return openai(modelInfo.fallbackModel)
    }
    // No fallback available, rethrow the error
    throw error
  }
}
