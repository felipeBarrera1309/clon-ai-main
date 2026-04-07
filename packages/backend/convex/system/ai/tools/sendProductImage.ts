import z from "zod"
import { internal } from "../../../_generated/api"
import { createTaggedTool } from "./toolWrapper"

/**
 * Tool for sending product images to customers via WhatsApp
 *
 * This tool is used when a customer explicitly requests to see an image of a product.
 * It searches for the product by name, retrieves its image URL, and sends it via WhatsApp.
 *
 * IMPORTANT: Only use this tool when the customer explicitly asks to see an image.
 * Examples: "mándame foto", "cómo se ve", "muéstrame", "quiero ver la imagen"
 */
export const sendProductImageTool = createTaggedTool({
  description:
    "Envía por WhatsApp la imagen de un producto encontrado por nombre dentro del catálogo del restaurante. Retorna estado de envío y si el producto tenía imagen disponible.",

  args: z.object({
    productName: z
      .string()
      .describe(
        "Nombre del producto del cual enviar la imagen. Puede ser parcial."
      ),
  }),
  dispatches: true,

  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean
    message: string
    productName?: string
    hasImage?: boolean
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

      // Search for the product by name
      const searchResult = await ctx.runQuery(
        internal.system.menuProducts.searchByName,
        {
          organizationId: conversation.organizationId,
          searchQuery: args.productName,
          limit: 1,
        }
      )

      if (!searchResult || searchResult.length === 0) {
        return {
          success: false,
          message: `No encontré ningún producto que coincida con "${args.productName}". ¿Podrías ser más específico con el nombre del producto?`,
          productName: args.productName,
          hasImage: false,
        }
      }

      const product = searchResult[0]

      // Additional check for TypeScript strict mode
      if (!product) {
        return {
          success: false,
          message: `No encontré ningún producto que coincida con "${args.productName}". ¿Podrías ser más específico con el nombre del producto?`,
          productName: args.productName,
          hasImage: false,
        }
      }

      // Check if product has an image
      if (!product.imageUrl) {
        return {
          success: false,
          message: `El producto "${product.name}" no tiene imagen disponible. ¿Te gustaría que te describa el producto en su lugar? ${product.description}`,
          productName: product.name,
          hasImage: false,
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

      // Get provider configuration id from conversation
      const configId =
        conversation.whatsappConfigurationId ||
        conversation.twilioConfigurationId

      if (!configId) {
        return {
          success: false,
          message:
            "No se encontró configuración del proveedor de mensajería para esta conversación",
        }
      }

      const whatsappConfig = await ctx.runQuery(
        internal.private.whatsappConfigurations.get,
        {
          configurationId: configId,
        }
      )

      if (!whatsappConfig) {
        return {
          success: false,
          message: "No se encontró configuración del proveedor de mensajería",
        }
      }

      // Determine provider configuration for dispatcher
      const isTwilioConfig =
        whatsappConfig.provider === "twilio" ||
        !!whatsappConfig.twilioAccountSid
      const isDialog360Config =
        whatsappConfig.provider === "360dialog" ||
        !!whatsappConfig.dialog360ApiKey
      const isGupshupConfig =
        whatsappConfig.provider === "gupshup" || !!whatsappConfig.gupshupApiKey
      const configIdForDispatcher = isTwilioConfig
        ? { twilioConfigurationId: whatsappConfig._id }
        : isDialog360Config
          ? { dialog360ConfigurationId: whatsappConfig._id }
          : isGupshupConfig
            ? { gupshupConfigurationId: whatsappConfig._id }
            : { whatsappConfigurationId: whatsappConfig._id }

      // Send the product image via WhatsApp/Twilio using the dispatcher
      await ctx.runAction(internal.system.whatsappDispatcher.sendImageMessage, {
        ...configIdForDispatcher,
        to: contact.phoneNumber,
        imageUrl: product.imageUrl,
        caption: product.name,
      })

      // Save to conversationMessages for dashboard display
      await ctx.runMutation(
        internal.system.conversationMessages.saveOutboundMessage,
        {
          conversationId: conversation._id,
          organizationId: conversation.organizationId,
          type: "image",
          content: {
            text: product.name,
            media: {
              url: product.imageUrl,
              mimeType: "image/jpeg",
              caption: product.name,
            },
          },
          status: "sent",
        }
      )

      return {
        success: true,
        message: `He enviado la imagen de "${product.name}". ¿Te gustaría ordenarlo o ver algo más?`,
        productName: product.name,
        hasImage: true,
      }
    } catch (error) {
      console.error("[sendProductImageTool] Error:", error)
      return {
        success: false,
        message:
          "Ocurrió un error al enviar la imagen. Por favor, intenta de nuevo.",
      }
    }
  },
})
