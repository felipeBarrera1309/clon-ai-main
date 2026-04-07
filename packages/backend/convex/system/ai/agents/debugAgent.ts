import { Agent, createTool } from "@convex-dev/agent"
import { stepCountIs } from "ai"
import { z } from "zod"
import { components, internal } from "../../../_generated/api"
import type { ActionCtx } from "../../../_generated/server"
import { createLanguageModel } from "../../../lib/aiModels"

function buildDebugAgentSystemPrompt(): string {
  return `# Agente de Analisis de Conversaciones Debug

## Rol
Eres un agente conversacional especializado en analizar conversaciones marcadas para debug y proponer mejoras concretas del prompt del agente de soporte.

## Objetivo
Entregar recomendaciones accionables y priorizadas para mejorar calidad de respuesta, uso de herramientas y flujo conversacional.

## Herramientas disponibles
1. **getDebugConversationsTool**: Lista de conversaciones marcadas para debug
2. **getSystemPromptConfigTool**: Configuración editable del agente (brandVoice, businessRules, etc.)
3. **getConversationMessagesTool**: Mensajes completos de una conversación específica
4. **getDebugMessagesBatchTool**: Lectura en lote de múltiples conversaciones
5. **getBuiltSystemPromptTool**: Prompt final construido actualmente

## Flujo de trabajo obligatorio
1. Obtener contexto inicial con getDebugConversationsTool.
2. Priorizar análisis en lote con getDebugMessagesBatchTool para detectar patrones.
3. Profundizar solo en casos relevantes con getConversationMessagesTool.
4. Contrastar hallazgos con configuración actual usando getSystemPromptConfigTool y/o getBuiltSystemPromptTool.
5. Entregar propuesta concreta en formato estructurado.

## Contrato de respuesta (OBLIGATORIO)
- SIEMPRE responde de forma conversacional al usuario.
- SI usas herramientas, DEBES cerrar con síntesis y recomendaciones; nunca termines solo con tool calls.
- No dejes respuestas vacías.
- Nunca digas únicamente "ejecuté X herramienta" sin interpretación útil.

## Formato de salida requerido
Usa este formato:

### Resumen ejecutivo
- 2-5 bullets con hallazgos principales.

### Hallazgos priorizados
- P0/P1/P2 con evidencia breve (threadId o patrón observado).

### Cambios sugeridos al prompt
Para cada cambio:
**Sección afectada:** [brandVoice | restaurantContext | customGreeting | businessRules | specialInstructions | coreIdentityOverride | coreToolsOverride | coreConversationOverride | coreOperationsOverride]
**Antes:** [texto actual o "No existe"]
**Después:** [texto propuesto]
**Justificación:** [impacto esperado]

### Plan de validación
- Checklist corto para probar si el cambio funciona.

## Reglas de calidad
- Sé específico; evita recomendaciones vagas.
- Separa hechos observados de inferencias.
- No inventes datos ni resultados de herramientas.
- Si falta evidencia, dilo explícitamente y pide la información necesaria.
- No modifiques datos ni configuraciones directamente: solo propone cambios.
- Considera contexto de restaurantes en Colombia y español natural para atención al cliente.
`
}

export async function createDebugAgent(
  _ctx: ActionCtx,
  args: { organizationId: string }
) {
  const { organizationId } = args
  const systemPrompt = buildDebugAgentSystemPrompt()
  const languageModel = createLanguageModel("gemini-3-flash-high")

  const getDebugConversationsTool = createTool({
    description:
      "Lista las conversaciones marcadas para debug de esta organizacion. Retorna threadId, razon, nombre del contacto y fecha de adicion.",
    args: z.object({}),
    handler: async (toolCtx) => {
      const actionCtx = toolCtx as unknown as ActionCtx
      const conversations = await actionCtx.runQuery(
        internal.system.ai.debugAgentQueries.getDebugConversationsForOrg,
        { organizationId }
      )

      if (conversations.length === 0) {
        return {
          success: true,
          message:
            "No hay conversaciones marcadas para debug en esta organizacion",
          conversations: [],
        }
      }

      return {
        success: true,
        conversations: conversations.map((conv) => ({
          ...conv,
          addedAt: new Date(conv.addedAt).toISOString(),
        })),
      }
    },
  })

  const getSystemPromptConfigTool = createTool({
    description:
      "Obtiene la configuracion completa de agentConfiguration de esta organizacion. Incluye brandVoice, businessRules, specialInstructions, etc.",
    args: z.object({}),
    handler: async (toolCtx) => {
      const actionCtx = toolCtx as unknown as ActionCtx
      const config = await actionCtx.runQuery(
        internal.system.ai.debugAgentQueries.getAgentConfigForOrg,
        { organizationId }
      )

      if (!config) {
        return {
          success: true,
          message:
            "No hay configuracion de agente para esta organizacion (usando valores por defecto)",
          config: null,
        }
      }

      return {
        success: true,
        config: {
          brandVoice: config.brandVoice || "(usando default)",
          restaurantContext: config.restaurantContext || "(usando default)",
          customGreeting: config.customGreeting || "(usando default)",
          businessRules: config.businessRules || "(usando default)",
          specialInstructions:
            config.specialInstructions || "(sin instrucciones especiales)",
          coreIdentityOverride: config.coreIdentityOverride || "(sin override)",
          coreToolsOverride: config.coreToolsOverride || "(sin override)",
          coreConversationOverride:
            config.coreConversationOverride || "(sin override)",
          coreOperationsOverride:
            config.coreOperationsOverride || "(sin override)",
          supportAgentModel: config.supportAgentModel || "(usando default)",
          validationMenuAgentModel:
            config.validationMenuAgentModel || "(usando default)",
          menuValidationAgentPrompt:
            config.menuValidationAgentPrompt || "(sin prompt custom)",
          ragConfiguration: config.ragConfiguration || null,
          requireInitialLocationValidation:
            config.requireInitialLocationValidation ?? false,
          followUpSequence:
            config.followUpSequence || "(usando secuencia default)",
          lastModified: config.lastModified
            ? new Date(config.lastModified).toISOString()
            : "nunca",
        },
      }
    },
  })

  const getConversationMessagesTool = createTool({
    description:
      "Obtiene los mensajes de una conversacion especifica usando su threadId. Incluye mensajes del usuario, del agente y llamadas a herramientas.",
    args: z.object({
      threadId: z
        .string()
        .describe("El threadId de la conversacion a consultar"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Numero maximo de mensajes a retornar (default 100)"),
    }),
    handler: async (toolCtx, toolArgs) => {
      const actionCtx = toolCtx as unknown as ActionCtx
      const messages = await actionCtx.runQuery(
        internal.system.ai.debugAgentQueries.getConversationMessagesForDebug,
        {
          organizationId,
          threadId: toolArgs.threadId,
          limit: toolArgs.limit,
        }
      )

      if (messages.length === 0) {
        return {
          success: true,
          message: "No se encontraron mensajes para este threadId",
          messages: [],
        }
      }

      return {
        success: true,
        messageCount: messages.length,
        messages: messages.map((msg) => ({
          ...msg,
          timestamp: new Date(msg.timestamp).toISOString(),
        })),
      }
    },
  })

  const getDebugMessagesBatchTool = createTool({
    description:
      "Obtiene mensajes de multiples conversaciones debug de esta organizacion en una sola llamada, con limites de seguridad para detectar patrones.",
    args: z.object({
      maxConversations: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe("Numero maximo de conversaciones debug a analizar"),
      messagesPerConversation: z
        .number()
        .int()
        .min(1)
        .max(120)
        .optional()
        .describe("Numero maximo de mensajes por conversacion"),
      threadIds: z
        .array(z.string())
        .optional()
        .describe(
          "Opcional: lista de threadIds concretos. Si no se envia, toma las conversaciones debug mas recientes."
        ),
    }),
    handler: async (toolCtx, toolArgs) => {
      const actionCtx = toolCtx as unknown as ActionCtx
      const maxConversations = Math.min(toolArgs.maxConversations ?? 12, 30)
      const messagesPerConversation = Math.min(
        toolArgs.messagesPerConversation ?? 60,
        120
      )

      const debugConversations = await actionCtx.runQuery(
        internal.system.ai.debugAgentQueries.getDebugConversationsForOrg,
        { organizationId }
      )

      const allowedThreadIds = new Set(
        debugConversations.map((conversation) => conversation.threadId)
      )

      const selectedThreadIds = (
        toolArgs.threadIds && toolArgs.threadIds.length > 0
          ? toolArgs.threadIds.filter((threadId) =>
              allowedThreadIds.has(threadId)
            )
          : debugConversations.map((conversation) => conversation.threadId)
      ).slice(0, maxConversations)

      const conversationsWithMessages: Array<{
        threadId: string
        reason: string
        contactDisplayName: string
        addedAt: string
        messageCount: number
        messages: Array<{ role: string; content: string; timestamp: string }>
      }> = []

      for (const threadId of selectedThreadIds) {
        const source = debugConversations.find(
          (conversation) => conversation.threadId === threadId
        )
        if (!source) continue

        const messages = await actionCtx.runQuery(
          internal.system.ai.debugAgentQueries.getConversationMessagesForDebug,
          {
            organizationId,
            threadId,
            limit: messagesPerConversation,
          }
        )

        conversationsWithMessages.push({
          threadId,
          reason: source.reason,
          contactDisplayName: source.contactDisplayName,
          addedAt: new Date(source.addedAt).toISOString(),
          messageCount: messages.length,
          messages: messages.map((message) => ({
            role: message.role,
            content: message.content,
            timestamp: new Date(message.timestamp).toISOString(),
          })),
        })
      }

      const totalMessages = conversationsWithMessages.reduce(
        (sum, conversation) => sum + conversation.messageCount,
        0
      )

      return {
        success: true,
        summary: {
          totalDebugConversations: debugConversations.length,
          analyzedConversations: conversationsWithMessages.length,
          totalMessages,
          limits: {
            maxConversations,
            messagesPerConversation,
          },
        },
        conversations: conversationsWithMessages,
      }
    },
  })

  const getBuiltSystemPromptTool = createTool({
    description:
      "Genera y muestra el system prompt completo construido para esta organizacion. Util para ver exactamente que instrucciones recibe el agente de soporte.",
    args: z.object({}),
    handler: async (toolCtx) => {
      const actionCtx = toolCtx as unknown as ActionCtx
      const result = await actionCtx.runQuery(
        internal.system.ai.debugAgentQueries.getBuiltSystemPromptForOrg,
        { organizationId }
      )

      return {
        success: true,
        promptLength: result.promptLength,
        promptPreview: `${result.fullPrompt.substring(0, 500)}...`,
        fullPrompt: result.fullPrompt,
        metadata: {
          hasAgentConfig: result.hasAgentConfig,
          hasRestaurantConfig: result.hasRestaurantConfig,
          locationCount: result.locationCount,
          automaticFirstReplyEnabled: result.automaticFirstReplyEnabled,
        },
      }
    },
  })

  return new Agent(components.agent, {
    name: "debugAgent",
    languageModel,
    instructions: systemPrompt,
    // Allow multi-step tool usage and a final assistant answer in the same run.
    stopWhen: stepCountIs(6),
    tools: {
      getDebugConversationsTool,
      getSystemPromptConfigTool,
      getConversationMessagesTool,
      getDebugMessagesBatchTool,
      getBuiltSystemPromptTool,
    },
  })
}
