import { v } from "convex/values"
import z from "zod"
import { internal } from "../../../_generated/api"
import type { Doc, Id } from "../../../_generated/dataModel"
import {
  type ActionCtx,
  internalAction,
  internalQuery,
} from "../../../_generated/server"
import { env } from "../../../lib/env"
import { createTaggedTool } from "./toolWrapper"

// Helper to extract filename from storage ID
function extractFilenameFromStorageId(storageId: string): string {
  if (storageId.includes("/")) {
    const parts = storageId.split("/")
    const filename = parts[parts.length - 1] ?? "menu.pdf"
    // Remove timestamp suffix if present (format: name_timestamp.ext)
    const match = filename.match(/^(.+?)_\d+(\.[^.]+)$/)
    if (match?.[1]) {
      return match[1].replace(/_/g, " ") + (match[2] ?? "")
    }
    return filename.replace(/_/g, " ")
  }
  return "menu.pdf"
}

// Helper to save outbound message to conversationMessages
async function saveOutboundMediaMessage(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  organizationId: string,
  type: "image" | "document",
  url: string,
  mimeType: string,
  caption?: string,
  filename?: string
) {
  await ctx.runMutation(
    internal.system.conversationMessages.saveOutboundMessage,
    {
      conversationId,
      organizationId,
      type,
      content: {
        text: caption,
        media: {
          url,
          mimeType,
          caption,
          filename,
        },
      },
      status: "sent",
    }
  )
}

// Helper function containing the core logic
async function executeSendMenuLogic(
  ctx: ActionCtx,
  conversation: Doc<"conversations">,
  _threadId: string
): Promise<{
  success: boolean
  status?: string
  userMessage?: string
  internalInfo?: string
  message?: string
}> {
  // Check if menu was already sent recently (within last 60 seconds) to avoid duplicates
  // This prevents duplicate sends when automatic first reply sends menu and agent also tries to send it
  const recentMessages = await ctx.runQuery(
    internal.system.conversationMessages.getByConversationInternal,
    { conversationId: conversation._id }
  )

  const now = Date.now()
  const DUPLICATE_PREVENTION_WINDOW_MS = 30000 // 30 seconds - more conservative window

  // Check if menu was sent in the last 30 seconds
  const recentMenuSent = recentMessages.some(
    (msg: { direction: string; type: string; _creationTime: number }) => {
      if (msg.direction !== "outbound") return false

      // Check if it's a menu message (document or image sent recently)
      const isMenuMessage = msg.type === "document" || msg.type === "image"
      const isSentRecently =
        now - msg._creationTime < DUPLICATE_PREVENTION_WINDOW_MS

      return isMenuMessage && isSentRecently
    }
  )

  if (recentMenuSent) {
    console.log(
      "[SEND_MENU_FILES] Menu was already sent in the last 60 seconds, skipping duplicate send"
    )
    return {
      success: true,
      status: "already_sent",
      userMessage: "Estoy listo para ayudarte 😊 ¿qué te gustaría pedir?",
      internalInfo: "Menú ya fue enviado recientemente, evitando duplicado",
    }
  }

  // Get restaurant configuration
  const restaurantConfig = await ctx.runQuery(
    internal.private.config.getRestaurantConfigForAgent,
    {
      organizationId: conversation.organizationId,
    }
  )

  const configInfo = {
    menuType: restaurantConfig?.menuType,
    hasMenuImages: (restaurantConfig?.menuImages?.length || 0) > 0,
    hasMenuPdf: !!restaurantConfig?.menuPdf,
    hasMenuUrl: !!(
      restaurantConfig?.menuUrl && restaurantConfig?.menuUrl !== ""
    ),
    menuImagesCount: restaurantConfig?.menuImages?.length || 0,
    menuUrl: restaurantConfig?.menuUrl,
  }

  console.log("[SEND_MENU_FILES] Restaurant config:", configInfo)

  // Build menu caption dynamically based on restaurant name
  const menuCaption = restaurantConfig?.restaurantName
    ? `Menú de ${restaurantConfig.restaurantName}`
    : "Menú del restaurante"

  if (!restaurantConfig) {
    return {
      success: false,
      message: "No se encontró configuración del restaurante",
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

  // Get WhatsApp/Twilio configuration
  // Conversations can have either whatsappConfigurationId (Meta) or twilioConfigurationId (Twilio)
  const configId =
    conversation.whatsappConfigurationId || conversation.twilioConfigurationId

  if (!configId) {
    console.error("[SEND_MENU_FILES] No configuration ID found in conversation")
    return {
      success: false,
      message:
        "No se encontró configuración de WhatsApp/Twilio para esta conversación",
    }
  }

  console.log("[SEND_MENU_FILES] Using config ID:", configId)

  const whatsappConfig = await ctx.runQuery(
    internal.private.whatsappConfigurations.get,
    {
      configurationId: configId,
    }
  )

  if (!whatsappConfig) {
    console.error("[SEND_MENU_FILES] Configuration not found for ID:", configId)
    return {
      success: false,
      message: "No se encontró configuración de WhatsApp/Twilio",
    }
  }

  // Determine provider configuration
  const isTwilioConfig =
    whatsappConfig.provider === "twilio" || !!whatsappConfig.twilioAccountSid
  const isDialog360Config =
    whatsappConfig.provider === "360dialog" || !!whatsappConfig.dialog360ApiKey
  const isGupshupConfig =
    whatsappConfig.provider === "gupshup" || !!whatsappConfig.gupshupApiKey
  const configIdForDispatcher = isTwilioConfig
    ? { twilioConfigurationId: whatsappConfig._id }
    : isDialog360Config
      ? { dialog360ConfigurationId: whatsappConfig._id }
      : isGupshupConfig
        ? { gupshupConfigurationId: whatsappConfig._id }
        : { whatsappConfigurationId: whatsappConfig._id }

  // Respect menuType setting, with fallback to available content
  let menuType: "images" | "pdf" | "url" | undefined = restaurantConfig.menuType

  // If menuType is not set, auto-detect based on available content
  if (!menuType) {
    if (restaurantConfig.menuImages && restaurantConfig.menuImages.length > 0) {
      menuType = "images"
    } else if (restaurantConfig.menuPdf) {
      menuType = "pdf"
    } else if (restaurantConfig.menuUrl && restaurantConfig.menuUrl !== "") {
      menuType = "url"
    }
  }

  // Fallback logic for content availability
  if (
    menuType === "images" &&
    (!restaurantConfig.menuImages || restaurantConfig.menuImages.length === 0)
  ) {
    if (restaurantConfig.menuPdf) {
      menuType = "pdf"
    } else if (restaurantConfig.menuUrl && restaurantConfig.menuUrl !== "") {
      menuType = "url"
    } else {
      menuType = undefined
    }
  } else if (menuType === "pdf" && !restaurantConfig.menuPdf) {
    if (restaurantConfig.menuImages && restaurantConfig.menuImages.length > 0) {
      menuType = "images"
    } else if (restaurantConfig.menuUrl && restaurantConfig.menuUrl !== "") {
      menuType = "url"
    } else {
      menuType = undefined
    }
  } else if (
    menuType === "url" &&
    (!restaurantConfig.menuUrl || restaurantConfig.menuUrl === "")
  ) {
    if (restaurantConfig.menuImages && restaurantConfig.menuImages.length > 0) {
      menuType = "images"
    } else if (restaurantConfig.menuPdf) {
      menuType = "pdf"
    } else {
      menuType = undefined
    }
  }

  if (menuType === "images") {
    // Send menu images
    if (
      !restaurantConfig.menuImages ||
      restaurantConfig.menuImages.length === 0
    ) {
      return {
        success: false,
        status: "no_menu_images",
        userMessage:
          "El menú está configurado para imágenes pero no hay imágenes disponibles",
        internalInfo: "Menú configurado como imágenes pero no hay imágenes",
      }
    }

    // Send all menu images
    for (const imageStorageId of restaurantConfig.menuImages) {
      // Get image URL (check if it's R2 or Convex)
      const imageUrl = imageStorageId.includes("/")
        ? `${env.R2_PUBLIC_URL}/${imageStorageId}`
        : await ctx.storage.getUrl(imageStorageId as any)

      if (!imageUrl) {
        console.error(`No se pudo obtener URL para imagen: ${imageStorageId}`)
        continue
      }

      // Send image using dispatcher
      await ctx.runAction(internal.system.whatsappDispatcher.sendImageMessage, {
        ...configIdForDispatcher,
        to: contact.phoneNumber,
        imageUrl: imageUrl,
      })

      // Save to conversationMessages for dashboard display
      await saveOutboundMediaMessage(
        ctx,
        conversation._id,
        conversation.organizationId,
        "image",
        imageUrl,
        "image/jpeg"
      )
    }

    return {
      success: true,
      status: "sent",
      userMessage: "He compartido nuestro menú. ¿Qué te gustaría ordenar?",
      internalInfo: `Se enviaron ${restaurantConfig.menuImages.length} imágenes del menú`,
    }
  } else if (menuType === "pdf") {
    // Send PDF document
    if (!restaurantConfig.menuPdf) {
      return {
        success: false,
        status: "no_menu_pdf",
        userMessage:
          "El menú está configurado para PDF pero no hay PDF disponible",
        internalInfo: "Menú configurado como PDF pero no hay PDF",
      }
    }

    const pdfUrl = restaurantConfig.menuPdf.includes("/")
      ? `${env.R2_PUBLIC_URL}/${restaurantConfig.menuPdf}`
      : await ctx.storage.getUrl(restaurantConfig.menuPdf as any)

    if (!pdfUrl) {
      return {
        success: false,
        message: "No se pudo obtener URL del PDF del menú",
      }
    }

    // Extract filename from storage ID for display
    const pdfFilename = extractFilenameFromStorageId(restaurantConfig.menuPdf)

    // Send PDF using dispatcher
    await ctx.runAction(
      internal.system.whatsappDispatcher.sendDocumentMessage,
      {
        ...configIdForDispatcher,
        to: contact.phoneNumber,
        documentUrl: pdfUrl,
        filename: pdfFilename,
        caption: menuCaption,
      }
    )

    // Save to conversationMessages for dashboard display
    await saveOutboundMediaMessage(
      ctx,
      conversation._id,
      conversation.organizationId,
      "document",
      pdfUrl,
      "application/pdf",
      menuCaption,
      pdfFilename
    )

    return {
      success: true,
      status: "sent",
      userMessage: "He compartido nuestro menú. ¿Qué te gustaría ordenar?",
      internalInfo: "Se envió el PDF del menú al cliente",
    }
  } else if (menuType === "url") {
    // Return URL for agent to include in message
    if (!restaurantConfig.menuUrl) {
      return {
        success: false,
        status: "no_menu_url",
        userMessage:
          "El menú está configurado para enlace pero no hay enlace disponible",
        internalInfo: "Menú configurado como enlace pero no hay URL",
      }
    }

    // If invoked via Action, we should send the message manually
    // We can detect context? Or simply always send if it's the Action calling?
    // The previous logic for duplicate code had this:
    if (ctx.runMutation === undefined) {
      // Rough heuristic: Agents context vs Action context?
      // Actually, we can just return the info and let the caller handle it?
      // But the previous Action logic SENT it.
      // Let's ALWAYS send it via dispatcher if it's "url".
      // The original tool logic returned it for the agent to say.
      // If we send it via dispatcher, the agent might ALSO say it?
      // Wait, if Tool returns userMessage, the Agent speaks it.
      // If Action calls this, it ignores userMessage.
      // So we should send it via Dispatcher too?
      // But if Agent calls this, it will be sent TWICE (Agent speaks + Dispatcher sends)?
      // The original Tool logic for URL did NOT use dispatcher.
      // Let's modify logic:
      // Always return the userMessage.
      // If called by Action (which ignores return), we must send it via dispatcher.
      // How to know?
      // We can pass a flag `isAction`.
    }

    // For now, let's just return the info. The Action wrapper will handle sending if needed,
    // OR we can make executeSendMenuLogic smart.
    // Let's add 'sendViaDispatcher' flag to arguments.

    return {
      success: true,
      status: "sent",
      userMessage: `Aquí puedes ver nuestra carta 👇👇\n${restaurantConfig.menuUrl}`,
      internalInfo: `Se proporcionó el enlace del menú: ${restaurantConfig.menuUrl}`,
    }
  } else {
    // Fallback logic for no specific configuration
    const hasMenuImages =
      restaurantConfig.menuImages && restaurantConfig.menuImages.length > 0
    const hasMenuPdf = !!restaurantConfig.menuPdf
    const hasMenuUrl = !!restaurantConfig.menuUrl

    if (hasMenuImages && restaurantConfig.menuImages) {
      // Send all menu images (Fallback)
      for (const imageStorageId of restaurantConfig.menuImages) {
        const imageUrl = imageStorageId.includes("/")
          ? `${env.R2_PUBLIC_URL}/${imageStorageId}`
          : await ctx.storage.getUrl(imageStorageId as any)

        if (!imageUrl) {
          console.error(`No se pudo obtener URL para imagen: ${imageStorageId}`)
          continue
        }

        await ctx.runAction(
          internal.system.whatsappDispatcher.sendImageMessage,
          {
            ...configIdForDispatcher,
            to: contact.phoneNumber,
            imageUrl: imageUrl,
          }
        )

        // Save to conversationMessages for dashboard display
        await saveOutboundMediaMessage(
          ctx,
          conversation._id,
          conversation.organizationId,
          "image",
          imageUrl,
          "image/jpeg"
        )
      }

      return {
        success: true,
        status: "sent",
        userMessage: "He compartido nuestro menú. ¿Qué te gustaría ordenar?",
        internalInfo: `Se enviaron ${restaurantConfig.menuImages.length} imágenes del menú (fallback)`,
      }
    } else if (hasMenuPdf && restaurantConfig.menuPdf) {
      const pdfUrl = restaurantConfig.menuPdf.includes("/")
        ? `${env.R2_PUBLIC_URL}/${restaurantConfig.menuPdf}`
        : await ctx.storage.getUrl(restaurantConfig.menuPdf as any)

      if (pdfUrl) {
        // Extract filename from storage ID for display
        const pdfFilename = extractFilenameFromStorageId(
          restaurantConfig.menuPdf
        )

        await ctx.runAction(
          internal.system.whatsappDispatcher.sendDocumentMessage,
          {
            ...configIdForDispatcher,
            to: contact.phoneNumber,
            documentUrl: pdfUrl,
            filename: pdfFilename,
            caption: menuCaption,
          }
        )

        // Save to conversationMessages for dashboard display
        await saveOutboundMediaMessage(
          ctx,
          conversation._id,
          conversation.organizationId,
          "document",
          pdfUrl,
          "application/pdf",
          menuCaption,
          pdfFilename
        )

        return {
          success: true,
          status: "sent",
          userMessage: "He compartido nuestro menú. ¿Qué te gustaría ordenar?",
          internalInfo: "Se envió el PDF del menú al cliente (fallback)",
        }
      }

      return {
        success: true,
        status: "sent",
        userMessage: "He compartido nuestro menú. ¿Qué te gustaría ordenar?",
        internalInfo: "Se envió el PDF del menú al cliente (fallback)",
      }
    } else if (hasMenuUrl) {
      return {
        success: true,
        status: "sent",
        userMessage: `Aquí puedes ver nuestra carta 👇👇\n${restaurantConfig.menuUrl}`,
        internalInfo: `Se proporcionó el enlace del menú: ${restaurantConfig.menuUrl} (fallback)`,
      }
    }
    return {
      success: false,
      status: "no_menu_configured",
      userMessage:
        "No hay menú configurado. Por favor configura el tipo de menú (imágenes, PDF o enlace) en la configuración del restaurante.",
      internalInfo: "No hay tipo de menú configurado ni archivos disponibles",
    }
  }
}

export const sendMenuFiles = createTaggedTool({
  description:
    "Envía al cliente el menú configurado para el restaurante (imágenes, PDF o enlace) según disponibilidad. Usa solo cuando el cliente pida ver el menú completo; para consultas específicas de productos usa searchMenuProductsTool. Retorna estado de envío y mensaje final para el cliente.",
  args: z.object({}),
  dispatches: true,
  handler: async (
    ctx
  ): Promise<{
    success: boolean
    status?: string
    userMessage?: string
    internalInfo?: string
    message?: string
  }> => {
    try {
      if (!ctx.threadId) {
        return {
          success: false,
          message: "No se encontró el ID del hilo de la conversación",
        }
      }

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

      return await executeSendMenuLogic(ctx, conversation, ctx.threadId)
    } catch (error) {
      console.error("Error al enviar menú:", error)
      return {
        success: false,
        status: "error",
        userMessage:
          "Ocurrió un error al enviar el menú. Por favor, intenta de nuevo.",
        internalInfo: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
})

export const getConversationById = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.conversationId)
  },
})

export const sendMenuFilesAction = internalAction({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    try {
      const conversation = await ctx.runQuery(
        internal.system.ai.tools.sendMenuFiles.getConversationById,
        {
          conversationId: args.conversationId,
        }
      )

      if (!conversation) {
        console.error("No se encontró la conversación")
        return
      }

      const result = await executeSendMenuLogic(
        ctx,
        conversation,
        conversation.threadId
      )

      // Special handling for URL type menu - send the text message via dispatcher
      if (
        result.success &&
        result.userMessage &&
        result.userMessage.includes("Aquí puedes ver nuestra carta") &&
        result.status === "sent"
      ) {
        // Get contact to send the message
        const contact = await ctx.runQuery(internal.private.contacts.get, {
          contactId: conversation.contactId,
        })

        if (contact) {
          // Determine which configuration to use
          const cfgId =
            conversation.twilioConfigurationId ||
            conversation.whatsappConfigurationId
          let configIdForDispatcher: Record<string, unknown> = {
            whatsappConfigurationId: conversation.whatsappConfigurationId,
          }
          if (conversation.twilioConfigurationId) {
            configIdForDispatcher = {
              twilioConfigurationId: conversation.twilioConfigurationId,
            }
          } else if (cfgId) {
            const cfg = await ctx.runQuery(
              internal.private.whatsappConfigurations.get,
              { configurationId: cfgId }
            )
            if (cfg) {
              const is360 =
                cfg.provider === "360dialog" || !!cfg.dialog360ApiKey
              const isGup = cfg.provider === "gupshup" || !!cfg.gupshupApiKey
              if (is360) {
                configIdForDispatcher = {
                  dialog360ConfigurationId: cfg._id,
                }
              } else if (isGup) {
                configIdForDispatcher = {
                  gupshupConfigurationId: cfg._id,
                }
              }
            }
          }

          // Send the URL message via dispatcher
          await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
            ...configIdForDispatcher,
            to: contact.phoneNumber,
            message: result.userMessage,
          })

          // Save to conversationMessages for dashboard display
          await ctx.runMutation(
            internal.system.conversationMessages.saveOutboundMessage,
            {
              conversationId: conversation._id,
              organizationId: conversation.organizationId,
              type: "text",
              content: { text: result.userMessage },
              status: "sent",
            }
          )

          console.log(
            `📋 [SEND_MENU_FILES_ACTION] URL message sent to ${contact.phoneNumber}`
          )
        }
      }

      // CRITICAL: Reschedule inactivity timers after sending menu
      if (result.success) {
        await ctx.runMutation(
          internal.system.inactivityScheduler.scheduleInitialInactivityWarning,
          {
            conversationId: conversation._id,
            contactId: conversation.contactId,
            organizationId: conversation.organizationId,
          }
        )
        console.log(
          "⏰ [SEND_MENU_FILES_ACTION] Inactivity timer rescheduled after sending menu"
        )
      }
    } catch (error) {
      console.error("[SEND_MENU_FILES_ACTION] Error:", error)
    }
  },
})
