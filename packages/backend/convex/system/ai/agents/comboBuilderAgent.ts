import { Agent } from "@convex-dev/agent"
import { ConvexError, v } from "convex/values"
import { components, internal } from "../../../_generated/api"
import type { ActionCtx } from "../../../_generated/server"
import { internalMutation, internalQuery } from "../../../_generated/server"
import { createLanguageModel } from "../../../lib/aiModels"
import { authAction } from "../../../lib/helpers"
import { createComboBuilderTools } from "../tools/comboBuilderTools"

const COMBO_BUILDER_SYSTEM_PROMPT = `# Asistente de Creación de Combos

## Tu Rol
Eres un asistente experto en crear combos para restaurantes colombianos. Ayudas a los dueños de restaurante a diseñar combos atractivos y rentables durante el proceso de onboarding.

## Tus Capacidades
1. **listMenuProductsTool**: Ver todos los productos del menú con sus precios y categorías
2. **listCombosTool**: Ver los combos que ya existen
3. **createComboTool**: Crear un combo nuevo con slots y opciones
4. **updateComboTool**: Editar un combo existente (nombre, descripción, precio, slots)
5. **deleteComboTool**: Eliminar un combo existente

## Estructura de un Combo
Un combo tiene:
- **Nombre**: Ej. "Combo Familiar", "Combo Personal"
- **Descripción**: Breve explicación de qué incluye
- **Precio base**: Precio del combo en pesos colombianos
- **Slots**: Categorías de opciones que el cliente puede elegir

Cada slot tiene:
- **Nombre**: Ej. "Plato principal", "Bebida", "Postre"
- **Selecciones mínimas**: Cuántas opciones DEBE elegir el cliente (1 para obligatorio, 0 para opcional)
- **Selecciones máximas**: Cuántas opciones PUEDE elegir el cliente
- **Opciones**: Productos del menú disponibles en ese slot, cada uno con un recargo opcional (upcharge)

## Tu Proceso
1. Primero usa **listMenuProductsTool** para conocer los productos disponibles
2. Pregunta al usuario qué tipo de combo quiere crear
3. Sugiere combinaciones populares basadas en los productos disponibles
4. Pregunta sobre precio base, slots y opciones
5. Crea el combo cuando tengas toda la información

## Reglas Críticas
- NUNCA crees productos del menú — solo puedes referenciar los existentes con listMenuProductsTool
- NUNCA asumas IDs de productos — siempre usa listMenuProductsTool primero
- SIEMPRE confirma los detalles con el usuario antes de crear o modificar un combo
- SIEMPRE confirma antes de eliminar un combo
- Los precios son en pesos colombianos (COP)
- Sé conversacional y amigable
- Sugiere patrones populares: "Combo Personal" (plato + bebida), "Combo Familiar" (varios platos + bebidas), "Combo Infantil"
- Si el usuario no tiene productos en el menú, explícale que primero debe agregar productos

## Formato de Respuesta
- Usa español colombiano natural
- Sé conciso pero informativo
- Cuando muestres precios, usa formato colombiano: $15.000
- Cuando muestres combos creados, incluye un resumen claro
`

export async function createComboBuilderAgent(
  _ctx: ActionCtx,
  args: { organizationId: string }
) {
  const { organizationId } = args
  const languageModel = createLanguageModel("openai-o4-mini")
  const tools = createComboBuilderTools(organizationId)

  return new Agent(components.agent, {
    name: "comboBuilderAgent",
    languageModel,
    instructions: COMBO_BUILDER_SYSTEM_PROMPT,
    tools,
  })
}

export const getExistingThread = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("comboBuilderConversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()
  },
})

export const storeThread = internalMutation({
  args: {
    organizationId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("comboBuilderConversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (existing) {
      return existing.threadId
    }

    await ctx.db.insert("comboBuilderConversations", {
      organizationId: args.organizationId,
      threadId: args.threadId,
    })
    return args.threadId
  },
})

export const getOrCreateComboBuilderThread = authAction({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args): Promise<{ threadId: string; isNew: boolean }> => {
    const existing = await ctx.runQuery(
      internal.system.ai.agents.comboBuilderAgent.getExistingThread,
      { organizationId: args.organizationId }
    )

    if (existing) {
      return { threadId: existing.threadId, isNew: false }
    }

    const agent = await createComboBuilderAgent(ctx, {
      organizationId: args.organizationId,
    })

    const thread = await agent.createThread(ctx, {
      userId: args.organizationId,
    })

    const storedThreadId = await ctx.runMutation(
      internal.system.ai.agents.comboBuilderAgent.storeThread,
      {
        organizationId: args.organizationId,
        threadId: thread.threadId,
      }
    )

    await ctx.runMutation(
      internal.system.organizationAiThreads.registerStandaloneThread,
      {
        organizationId: args.organizationId,
        purpose: "combo-builder",
        threadId: storedThreadId,
      }
    )

    return {
      threadId: storedThreadId,
      isNew: storedThreadId === thread.threadId,
    }
  },
})

export const sendComboBuilderMessage = authAction({
  args: {
    organizationId: v.string(),
    threadId: v.string(),
    message: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; response: string }> => {
    if (!args.message.trim()) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "El mensaje no puede estar vacío",
      })
    }

    const agent = await createComboBuilderAgent(ctx, {
      organizationId: args.organizationId,
    })

    const { thread } = await agent.continueThread(ctx, {
      threadId: args.threadId,
    })

    const { messageId } = await agent.saveMessage(ctx, {
      threadId: args.threadId,
      prompt: args.message,
    })

    try {
      const response = await thread.generateText({
        promptMessageId: messageId,
      })

      await ctx.runMutation(
        internal.system.organizationAiThreads.refreshThreadCost,
        {
          organizationId: args.organizationId,
          threadId: args.threadId,
        }
      )

      return {
        success: true,
        response: response.text,
      }
    } catch (error) {
      await ctx.runMutation(
        internal.system.organizationAiThreads.refreshThreadCost,
        {
          organizationId: args.organizationId,
          threadId: args.threadId,
        }
      )

      console.error("[COMBO BUILDER AGENT] Error generating response:", error)
      throw new ConvexError({
        code: "AI_ERROR",
        message:
          "Error al generar respuesta del agente. Tu mensaje fue guardado, intenta de nuevo.",
      })
    }
  },
})
