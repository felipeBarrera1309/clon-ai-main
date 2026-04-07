import z from "zod"
import { internal } from "../../../_generated/api"
import { createTaggedTool } from "./toolWrapper"

export const cancelScheduledOrder = createTaggedTool({
  description:
    "Cancelar un pedido programado antes de que se active. Solo se puede cancelar pedidos en estado 'programado'.",
  args: z.object({
    orderId: z
      .string()
      .describe(
        "ID interno de Convex del pedido programado a cancelar (NO usar código visible tipo BRA-000109)."
      ),
    reason: z
      .string()
      .describe("Razón de la cancelación que se enviará al cliente"),
  }),
  handler: async (ctx, args): Promise<string> => {
    if (!ctx.threadId) {
      return "Falta el ID del hilo de la conversación"
    }

    try {
      const result = await ctx.runMutation(
        internal.system.orders.cancelScheduledOrder,
        {
          threadId: ctx.threadId,
          reason: args.reason,
        }
      )
      return result
    } catch (error) {
      return `Error al cancelar el pedido programado: ${error instanceof Error ? error.message : error}`
    }
  },
})
