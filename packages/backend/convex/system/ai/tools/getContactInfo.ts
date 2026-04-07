import z from "zod"
import { internal } from "../../../_generated/api"
import { createTaggedTool } from "./toolWrapper"

export const getContactInfo = createTaggedTool({
  description:
    "Obtiene la información del contacto asociado al hilo, incluyendo nombre, teléfono y última dirección conocida cuando exista. Retorna datos listos para reutilizar en el flujo de pedido.",
  args: z.object({}), // No arguments needed as we get info from thread context
  handler: async (ctx): Promise<string> => {
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

      // Get contact info
      const contact = await ctx.runQuery(internal.system.contacts.getOne, {
        contactId: conversation.contactId,
      })

      if (!contact) {
        return "Error: Contacto no encontrado"
      }

      let response = `Información del contacto:\n`
      response += `- Teléfono: ${contact.phoneNumber}\n`

      if (contact.displayName) {
        response += `- Nombre: ${contact.displayName}\n`
        response += `\nPuedes usar este nombre y teléfono para el pedido. NO necesitas pedirle al cliente que proporcione su nombre y teléfono otra vez.`
      } else {
        response += `- Nombre: No registrado\n`
        response += `\nDebes pedirle al cliente que proporcione su nombre para completar el pedido.`
      }

      if (contact.lastKnownAddress) {
        response += `\n- Última dirección conocida: ${contact.lastKnownAddress}\n`
        response += `\nPuedes preguntarle al cliente si quiere usar la misma dirección: "${contact.lastKnownAddress}" para su pedido.`
      } else {
        response += `\n- No hay dirección anterior registrada\n`
        response += `\nEste cliente no tiene una dirección anterior. Necesitarás pedirle que proporcione su dirección de entrega.`
      }

      return response
    } catch (error) {
      return `Error al obtener información del contacto: ${error instanceof Error ? error.message : "Error desconocido"}`
    }
  },
})
