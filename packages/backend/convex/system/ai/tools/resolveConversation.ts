import z from "zod"
import { internal } from "../../../_generated/api"
import { createTaggedTool } from "./toolWrapper"

export const resolveConversation = createTaggedTool({
  description:
    "Cierra una conversación cuando el caso está atendido y no existen bloqueos operativos para cierre. " +
    "No ejecutar si hay pedido activo (pendiente/preparando/en_camino/programado). " +
    "Requiere indicar el motivo de cierre. " +
    "Retorna estado de resolución y mensajes para usuario e información interna.",
  args: z.object({
    reason: z
      .string()
      .describe("Motivo claro y conciso de por qué se cierra la conversación"),
  }),
  handler: async (
    ctx: any,
    args: { reason: string }
  ): Promise<{
    success: boolean
    status: string
    userMessage: string
    internalInfo: string
  }> => {
    if (!ctx.threadId) {
      return {
        success: false,
        status: "error",
        userMessage:
          "Ha ocurrido un error interno. Por favor, intenta de nuevo.",
        internalInfo: "Falta el ID del hilo de la conversación",
      }
    }

    // Get the conversation by threadId first
    const conversation: any = await ctx.runQuery(
      internal.system.conversations.getByThreadId,
      {
        threadId: ctx.threadId,
      }
    )

    if (!conversation) {
      return {
        success: false,
        status: "error",
        userMessage: "Ha ocurrido un error interno.",
        internalInfo: "Conversación no encontrada",
      }
    }

    // Attempt to resolve safely (checks for active orders)
    // NOTE: Casting to any because api.d.ts might be stale and not include resolveConversationIfEligible yet
    const conversationsApi = internal.system.conversations as any
    const result: any = await ctx.runMutation(
      conversationsApi.resolveConversationIfEligible,
      {
        conversationId: conversation._id,
        resolutionReason: args.reason,
        resolvedBy: "agent",
      }
    )

    if (!result.resolved) {
      return {
        success: false,
        status: "active_orders", // Indicate reason for failure
        userMessage:
          "No puedo cerrar la conversación porque tienes una orden en curso. Te avisaré cuando cambie de estado.",
        internalInfo: `No se pudo resolver: ${result.reason}`,
      }
    }

    return {
      success: true,
      status: "resolved",
      userMessage:
        "¡Gracias por contactarnos! Tu consulta ha sido resuelta. Si necesitas algo más, no dudes en escribirnos nuevamente.",
      internalInfo: `Conversación resuelta exitosamente. Motivo: ${args.reason}`,
    }
  },
})
