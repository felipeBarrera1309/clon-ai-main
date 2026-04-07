import z from "zod"
import { internal } from "../../../_generated/api"
import { createTaggedTool } from "./toolWrapper"

export const saveCustomerName = createTaggedTool({
  description:
    "Guardar o actualizar el nombre del cliente en el contacto. Úsalo cuando el cliente proporcione su nombre y no esté registrado.",
  args: z.object({
    customerName: z.string().describe("Nombre completo del cliente"),
  }),
  handler: async (ctx, args): Promise<string> => {
    if (!ctx.threadId) {
      return "Error: No se pudo obtener el ID del hilo"
    }

    try {
      // Get conversation to get contact info
      const conversation = await ctx.runQuery(
        internal.system.conversations.getByThreadId,
        { threadId: ctx.threadId }
      )

      if (!conversation) {
        return "Error: Conversación no encontrada"
      }

      // Update contact's display name
      await ctx.runMutation(internal.system.contacts.updateDisplayName, {
        contactId: conversation.contactId,
        displayName: args.customerName,
      })

      return `Nombre guardado correctamente: ${args.customerName}. Ahora puedes continuar con el proceso de pedido.`
    } catch (error) {
      return `Error al guardar el nombre del cliente: ${error instanceof Error ? error.message : "Error desconocido"}`
    }
  },
})
