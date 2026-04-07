import z from "zod"
import { components, internal } from "../../../_generated/api"
import { createTaggedTool } from "./toolWrapper"

export const escalateConversation = createTaggedTool({
  description:
    "Escalar la conversación a un operador humano. " +
    "Requiere indicar el motivo de la escalación. " +
    "Devuelve confirmación de escalación.",
  args: z.object({
    reason: z
      .string()
      .describe("Motivo claro y conciso de por qué se escala la conversación"),
  }),
  handler: async (ctx, args) => {
    if (!ctx.threadId) {
      return {
        success: false,
        status: "error",
        userMessage:
          "Ha ocurrido un error interno. Por favor, intenta de nuevo.",
        internalInfo: "Falta el ID del hilo de la conversación",
      }
    }

    let lastCustomerMessage: string | undefined
    try {
      const messages = await ctx.runQuery(
        components.agent.messages.listMessagesByThreadId,
        {
          threadId: ctx.threadId,
          order: "desc",
          paginationOpts: { numItems: 20, cursor: null },
        }
      )
      const lastUserMsg = messages.page.find((m) => m.message?.role === "user")
      if (lastUserMsg?.text) {
        lastCustomerMessage = lastUserMsg.text
      }
    } catch (error) {
      console.warn(
        "⚠️ [ESCALATION TOOL] Could not retrieve last customer message:",
        error
      )
    }

    await ctx.runMutation(internal.system.conversations.escalate, {
      threadId: ctx.threadId,
      reason: args.reason,
      lastCustomerMessage,
    })

    return {
      success: true,
      status: "escalated",
      userMessage:
        "Tu conversación ha sido escalada. En un momento continuaremos.",
      internalInfo: `Conversación escalada exitosamente. Motivo: ${args.reason}`,
    }
  },
})
