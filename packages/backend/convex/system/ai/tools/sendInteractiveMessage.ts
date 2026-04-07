import z from "zod"
import { internal } from "../../../_generated/api"
import type { OutgoingInteractiveMessage } from "../../../lib/whatsappTypes"
import { createTaggedTool } from "./toolWrapper"

// Zod schemas for interactive message components
const interactiveButtonSchema = z.object({
  id: z.string().max(256),
  title: z.string().max(30),
})

const interactiveListRowSchema = z.object({
  id: z.string().max(200),
  title: z.string().max(30),
  description: z.string().max(72).optional(),
})

const interactiveListSectionSchema = z.object({
  title: z.string().max(30).optional(),
  rows: z.array(interactiveListRowSchema),
})

const interactiveHeaderSchema = z.object({
  type: z.enum(["text", "image", "video", "document"]),
  text: z.string().max(60).optional(),
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  documentUrl: z.string().optional(),
  documentFilename: z.string().optional(),
})

type InteractiveContentForConversation =
  | {
      type: "button"
      body: string
      header?:
        | {
            type: "text" | "image" | "video" | "document"
            text?: string
            imageUrl?: string
            videoUrl?: string
            documentUrl?: string
            documentFilename?: string
          }
        | undefined
      footer?: { text: string } | undefined
      buttons: Array<{ id: string; title: string }>
    }
  | {
      type: "list"
      body: string
      header?:
        | {
            type: "text" | "image" | "video" | "document"
            text?: string
          }
        | undefined
      footer?: { text: string } | undefined
      buttonText: string
      sections: Array<{
        title?: string
        rows: Array<{ id: string; title: string; description?: string }>
      }>
    }
  | {
      type: "cta_url"
      body: string
      header?:
        | {
            type: "text" | "image" | "video" | "document"
            text?: string
          }
        | undefined
      footer?: { text: string } | undefined
      ctaButtonText: string
      ctaUrl: string
    }
  | {
      type: "location_request"
      body: string
    }

/**
 * Tool for sending interactive WhatsApp messages (buttons, lists, location requests).
 *
 * Uses the direct dispatch architecture via whatsappDispatcher.
 */
export const sendInteractiveMessageTool = createTaggedTool({
  description: `Send rich interactive WhatsApp content.
Use ONLY for:
- **interactive_buttons**: Quick replies (max 3).
- **interactive_list**: Menu/options list.
- **interactive_cta**: URL button.
- **interactive_location_request**: Ask for location.

Si necesitas mostrar más de 3 opciones, usa **interactive_list** en lugar de **interactive_buttons**.
Para categorías, productos, sucursales o métodos de pago con muchas alternativas, prefiere **interactive_list**.

IMPORTANTE: Si usas esta herramienta para interactuar (botones, listas, ubicación), DEBES incluir todo tu mensaje para el usuario en el parámetro 'body'. NO escribas texto fuera de la herramienta cuando la uses, ya que ese texto será un mensaje separado.`,
  args: z.object({
    type: z.enum([
      "interactive_buttons",
      "interactive_list",
      "interactive_cta",
      "interactive_location_request",
    ]),
    // Interactive messages - common
    header: interactiveHeaderSchema.optional(),
    body: z.string().max(1024),
    footer: z.string().max(60).optional(),
    // Interactive buttons (Meta supports 1 to 3 reply buttons)
    buttons: z.array(interactiveButtonSchema).min(1).max(3).optional(),
    // Interactive list
    buttonText: z.string().max(30).optional(),
    sections: z.array(interactiveListSectionSchema).optional(),
    // Interactive CTA URL
    ctaButtonText: z.string().max(30).optional(),
    ctaUrl: z.string().optional(),
  }),
  silent: (_args, result) =>
    typeof result === "string" && !result.startsWith("Error"),
  dispatches: true,
  handler: async (ctx, args): Promise<string> => {
    if (!ctx.threadId) {
      return "Error: No se pudo obtener el ID del hilo"
    }

    try {
      // 1. Get conversation to get contact info and config
      const conversation = await ctx.runQuery(
        internal.system.conversations.getByThreadId,
        { threadId: ctx.threadId }
      )

      if (!conversation) {
        return "Error: Conversación no encontrada"
      }

      // 2. Get contact to get phone number
      const contact = await ctx.runQuery(internal.system.contacts.getOne, {
        contactId: conversation.contactId,
      })

      if (!contact) {
        return "Error: Contacto no encontrado"
      }

      // 3. Validate configuration exists and is supported
      if (!conversation.whatsappConfigurationId) {
        // Check if other providers are configured to give a specific error
        if (conversation.twilioConfigurationId) {
          return "Error: Los mensajes interactivos (botones/listas) solo están soportados actualmente en WhatsApp Cloud API (Meta). Tu configuración actual usa otro proveedor."
        }
        return "Error: No se encontró una configuración de WhatsApp válida para esta conversación."
      }

      // 4. Construct message based on type
      let message: OutgoingInteractiveMessage
      let interactiveContent: InteractiveContentForConversation

      switch (args.type) {
        case "interactive_buttons":
          if (!args.body || !args.buttons)
            return "Error: 'body' and 'buttons' are required for button messages"
          message = {
            type: "interactive",
            interactiveType: "button",
            to: contact.phoneNumber,
            body: { text: args.body },
            header: args.header
              ? {
                  type: args.header.type,
                  text: args.header.text,
                  image: args.header.imageUrl
                    ? { link: args.header.imageUrl }
                    : undefined,
                  video: args.header.videoUrl
                    ? { link: args.header.videoUrl }
                    : undefined,
                  document: args.header.documentUrl
                    ? {
                        link: args.header.documentUrl,
                        filename: args.header.documentFilename,
                      }
                    : undefined,
                }
              : undefined,
            footer: args.footer ? { text: args.footer } : undefined,
            buttons: args.buttons.map((btn) => ({
              type: "reply" as const,
              reply: { id: btn.id, title: btn.title },
            })),
          }
          interactiveContent = {
            type: "button",
            body: args.body,
            header: args.header
              ? {
                  type: args.header.type,
                  text: args.header.text,
                  imageUrl: args.header.imageUrl,
                  videoUrl: args.header.videoUrl,
                  documentUrl: args.header.documentUrl,
                  documentFilename: args.header.documentFilename,
                }
              : undefined,
            footer: args.footer ? { text: args.footer } : undefined,
            buttons: args.buttons.map((b) => ({
              id: b.id,
              title: b.title,
            })),
          }
          break

        case "interactive_list":
          if (
            !args.body ||
            !args.buttonText ||
            !args.sections ||
            args.sections.length === 0
          )
            return "Error: 'body', 'buttonText', and 'sections' are required for list messages"
          message = {
            type: "interactive",
            interactiveType: "list",
            to: contact.phoneNumber,
            body: { text: args.body },
            header: args.header
              ? {
                  type: args.header.type,
                  text: args.header.text,
                }
              : undefined,
            footer: args.footer ? { text: args.footer } : undefined,
            buttonText: args.buttonText,
            sections: args.sections,
          }
          interactiveContent = {
            type: "list",
            body: args.body,
            header: args.header
              ? {
                  type: args.header.type,
                  text: args.header.text,
                }
              : undefined,
            footer: args.footer ? { text: args.footer } : undefined,
            buttonText: args.buttonText,
            sections: args.sections?.map((section) => ({
              title: section.title,
              rows: section.rows.map((row) => ({
                id: row.id,
                title: row.title,
                description: row.description,
              })),
            })),
          }
          break

        case "interactive_cta":
          if (!args.body || !args.ctaButtonText || !args.ctaUrl)
            return "Error: 'body', 'ctaButtonText', and 'ctaUrl' are required for CTA button messages"
          message = {
            type: "interactive",
            interactiveType: "cta_url",
            to: contact.phoneNumber,
            body: { text: args.body },
            header: args.header
              ? {
                  type: args.header.type,
                  text: args.header.text,
                }
              : undefined,
            footer: args.footer ? { text: args.footer } : undefined,
            ctaButtonText: args.ctaButtonText,
            ctaUrl: args.ctaUrl,
          }
          interactiveContent = {
            type: "cta_url",
            body: args.body,
            header: args.header
              ? {
                  type: args.header.type,
                  text: args.header.text,
                }
              : undefined,
            footer: args.footer ? { text: args.footer } : undefined,
            ctaButtonText: args.ctaButtonText,
            ctaUrl: args.ctaUrl,
          }
          break

        case "interactive_location_request":
          if (!args.body)
            return "Error: 'body' is required for location request messages"
          message = {
            type: "interactive",
            interactiveType: "location_request",
            to: contact.phoneNumber,
            body: { text: args.body },
          }
          interactiveContent = {
            type: "location_request",
            body: args.body,
          }
          break

        default:
          return "Error: Tipo de mensaje no soportado"
      }

      // 5. Send directly via dispatcher
      await ctx.runAction(
        internal.system.whatsappDispatcher.sendInteractiveMessage,
        {
          whatsappConfigurationId: conversation.whatsappConfigurationId,
          to: contact.phoneNumber,
          message: message,
        }
      )

      // 6. Save to conversationMessages for dashboard display
      await ctx.runMutation(
        internal.system.conversationMessages.saveOutboundMessage,
        {
          conversationId: conversation._id,
          organizationId: conversation.organizationId,
          type: "interactive",
          content: {
            text: args.body, // Fallback text
            interactive: interactiveContent,
          },
          status: "sent",
        }
      )

      return `Mensaje interactivo (${args.type}) enviado correctamente.`
    } catch (error) {
      console.error("Error sending interactive WhatsApp message:", error)
      return `Error al enviar mensaje interactivo: ${error instanceof Error ? error.message : "Error desconocido"}`
    }
  },
})
