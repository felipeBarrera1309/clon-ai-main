import z from "zod"
import { internal } from "../../../_generated/api"
import { sendWhatsAppLocationMessage } from "../../../model/whatsapp"
import { createTaggedTool } from "./toolWrapper"

/**
 * Tool for sending restaurant location to customers via WhatsApp
 *
 * This tool is used when a customer asks for the restaurant's location,
 * especially useful for pickup orders or when customers want to visit.
 *
 * IMPORTANT: Only use this tool when the customer explicitly asks for location.
 * Examples: "¿dónde están?", "ubicación", "¿cómo llego?", "dirección"
 */
export const sendRestaurantLocationTool = createTaggedTool({
  description:
    "Envía la ubicación de una sucursal del restaurante, con coordenadas cuando existen o dirección en texto como respaldo. Retorna estado del envío y sucursal utilizada.",

  args: z.object({
    locationId: z
      .string()
      .optional()
      .describe(
        "ID de la sucursal específica. Si no se proporciona, se usa la sucursal principal."
      ),
  }),
  dispatches: true,

  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean
    message: string
    locationName?: string
    hasCoordinates?: boolean
  }> => {
    try {
      if (!ctx.threadId) {
        return {
          success: false,
          message: "No se encontró el ID del hilo de la conversación",
        }
      }

      // Get conversation from thread
      const conversation = await ctx.runQuery(
        internal.system.conversations.getByThreadId,
        {
          threadId: ctx.threadId,
        }
      )

      if (!conversation) {
        return {
          success: false,
          message: "No se encontró la conversación",
        }
      }

      // Get restaurant locations
      const locations = await ctx.runQuery(
        internal.system.restaurantLocations.getAllByOrganization,
        {
          organizationId: conversation.organizationId,
        }
      )

      if (!locations || locations.length === 0) {
        return {
          success: false,
          message:
            "No hay sucursales configuradas para este restaurante. Por favor contacta al administrador.",
        }
      }

      // Find the specific location or use the first one
      const location = args.locationId
        ? locations.find((l) => l._id === args.locationId)
        : locations[0]

      // If multiple locations and no specific one requested, list them
      if (locations.length > 1 && !args.locationId) {
        const locationList = locations
          .map((l) => `- ${l.name}${l.address ? `: ${l.address}` : ""}`)
          .join("\n")
        return {
          success: false,
          message: `Tenemos ${locations.length} sucursales. ¿De cuál te gustaría la ubicación?\n\n${locationList}`,
          hasCoordinates: false,
        }
      }

      if (!location) {
        return {
          success: false,
          message: "No se encontró la sucursal especificada.",
        }
      }

      // Check if location has coordinates
      if (
        !location.coordinates ||
        !location.coordinates.latitude ||
        !location.coordinates.longitude
      ) {
        // Send text address instead
        const addressText = location.address
          ? `📍 ${location.name}\n${location.address}`
          : `📍 ${location.name}\nNo tenemos la dirección exacta configurada. Por favor contacta al restaurante para más información.`

        return {
          success: true,
          message: addressText,
          locationName: location.name,
          hasCoordinates: false,
        }
      }

      // Get contact details
      const contact = await ctx.runQuery(internal.private.contacts.get, {
        contactId: conversation.contactId,
      })

      if (!contact) {
        return {
          success: false,
          message: "No se encontró el contacto",
        }
      }

      // Get WhatsApp configuration
      if (!conversation.whatsappConfigurationId) {
        return {
          success: false,
          message:
            "No se encontró configuración de WhatsApp para esta conversación",
        }
      }

      const whatsappConfig = await ctx.runQuery(
        internal.private.whatsappConfigurations.get,
        {
          configurationId: conversation.whatsappConfigurationId,
        }
      )

      if (!whatsappConfig) {
        return {
          success: false,
          message: "No se encontró configuración de WhatsApp",
        }
      }

      const { phoneNumberId, accessToken } = whatsappConfig

      if (!phoneNumberId || !accessToken) {
        return {
          success: false,
          message: "Configuración de WhatsApp incompleta",
        }
      }

      // Send the location via WhatsApp
      await sendWhatsAppLocationMessage(
        ctx,
        contact.phoneNumber,
        location.coordinates.latitude,
        location.coordinates.longitude,
        location.name,
        location.address || "",
        phoneNumberId,
        accessToken
      )

      // Save to conversationMessages for dashboard display
      await ctx.runMutation(
        internal.system.conversationMessages.saveOutboundMessage,
        {
          conversationId: conversation._id,
          organizationId: conversation.organizationId,
          type: "location",
          content: {
            text: `📍 ${location.name}${location.address ? `\n${location.address}` : ""}`,
            location: {
              latitude: location.coordinates.latitude,
              longitude: location.coordinates.longitude,
              name: location.name,
              address: location.address,
            },
          },
          status: "sent",
        }
      )

      return {
        success: true,
        message: `He enviado la ubicación de "${location.name}". ¿Hay algo más en lo que pueda ayudarte?`,
        locationName: location.name,
        hasCoordinates: true,
      }
    } catch (error) {
      console.error("[sendRestaurantLocationTool] Error:", error)
      return {
        success: false,
        message:
          "Ocurrió un error al enviar la ubicación. Por favor, intenta de nuevo.",
      }
    }
  },
})
