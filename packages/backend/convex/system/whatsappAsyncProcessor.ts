import { saveMessage } from "@convex-dev/agent"
import { ConvexError, v } from "convex/values"
import { components, internal } from "../_generated/api"
import { internalAction } from "../_generated/server"
import { formatFileSize } from "../lib/constants"
import {
  processIncomingMessage,
  processIncomingStatusUpdate,
} from "../lib/whatsapp"
import type { WhatsAppWebhookPayload } from "../lib/whatsappTypes"
import {
  downloadAndStoreMediaR2,
  getMediaUrl,
  markMessageAsRead,
  validateFileSize,
} from "../model/whatsapp"
import { analyzeImageUrl, transcribeAudioFileUrl } from "../public/files"
import { saveUserMessage } from "./messages"

/**
 * Process WhatsApp webhook message asynchronously
 * This function processes the complete webhook payload including media files and sends responses
 */
export const processWhatsAppWebhookMessage = internalAction({
  args: {
    payload: v.any(), // WhatsApp webhook payload
  },
  handler: async (ctx, args) => {
    console.log(
      "📱 [ASYNC WEBHOOK] Starting async processing of WhatsApp message"
    )

    const payload = args.payload as WhatsAppWebhookPayload

    // Extract relevant information from the webhook payload
    const entry = payload.entry[0]
    if (!entry || !entry.changes || !entry.changes[0]) {
      console.error("[ASYNC WEBHOOK] No entry or changes")
      return
    }

    const changes = entry.changes
    if (!changes || changes.length === 0 || !changes[0]) {
      console.error("[ASYNC WEBHOOK] No changes")
      return
    }

    const value = changes[0].value

    const statusValue = "statuses" in value ? value : null
    const messageValue = "messages" in value ? value : null

    if (statusValue) {
      const incomingStatusUpdate =
        await processIncomingStatusUpdate(statusValue)
      if (!incomingStatusUpdate) {
        console.error("[ASYNC WEBHOOK] No incoming status update")
        return
      }

      // Process status update for bulk messaging campaigns
      const { statusUpdate } = incomingStatusUpdate
      console.log(
        `📊 [ASYNC WEBHOOK] Processing status update: ${statusUpdate.status} for message ${statusUpdate.id}`
      )

      // Log error details if the message failed
      let errorMessage: string | undefined
      if (statusUpdate.status === "failed" && statusUpdate.errors?.length) {
        const error = statusUpdate.errors[0]
        errorMessage = `Error ${error?.code}: ${error?.title}${error?.message ? ` - ${error.message}` : ""}${error?.error_data?.details ? ` (${error.error_data.details})` : ""}`
        console.error(`❌ [ASYNC WEBHOOK] Message failed: ${errorMessage}`)
      }

      // Update campaign recipient status if this message belongs to a campaign
      await ctx.runMutation(
        internal.system.bulkMessaging.updateRecipientStatusFromWebhook,
        {
          whatsappMessageId: statusUpdate.id,
          status: statusUpdate.status,
          timestamp: parseInt(statusUpdate.timestamp) * 1000, // Convert to milliseconds
          errorMessage,
        }
      )

      // Process any pending scheduling intents from long-running actions.
      // Status webhooks run from an independent context where
      // ctx.scheduler.runAfter works reliably.
      if (statusUpdate.status === "sent") {
        try {
          await ctx.runMutation(
            internal.system.schedulingIntents.processSchedulingIntents
          )
        } catch {
          // Non-critical — cron fallback will pick up any missed intents
        }
      }

      return
    } else if (messageValue) {
      const message = messageValue
      const incomingMessage = await processIncomingMessage(message)
      if (!incomingMessage) {
        console.error(
          "[ASYNC WEBHOOK] No incoming message or unsupported message type"
        )
        return
      }

      const {
        contactPhoneNumber,
        contactDisplayName,
        text,
        image,
        audio,
        document,
        location,
        interactive,
        messageId,
        messageTimestamp,
        businessPhoneNumberId,
        businessDisplayPhoneNumber,
      } = incomingMessage

      const { conversation, contact, whatsappConfiguration } =
        await ctx.runMutation(internal.system.whatsapp.processIncomingMessage, {
          contactPhoneNumber,
          contactDisplayName,
          businessPhoneNumberId,
          businessDisplayPhoneNumber,
          fromWhatsApp: true,
        })

      const provider = whatsappConfiguration.provider ?? "meta"
      // Validation guard for Meta provider fields
      if (
        provider === "meta" &&
        (!whatsappConfiguration.accessToken ||
          !whatsappConfiguration.phoneNumberId)
      ) {
        console.error("❌ [ASYNC WEBHOOK] Missing Meta configuration fields", {
          hasToken: !!whatsappConfiguration.accessToken,
          hasPhoneId: !!whatsappConfiguration.phoneNumberId,
        })
        throw new ConvexError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Configuración de WhatsApp incompleta para proveedor Meta",
        })
      }

      const accessToken = whatsappConfiguration.accessToken as string

      // Mark the message as read immediately (shows blue ticks)
      // Don't show typing indicator if conversation is escalated (human is handling it)
      if (provider === "meta") {
        const showTyping = conversation.status === "unresolved"
        await markMessageAsRead(
          ctx,
          messageId,
          businessPhoneNumberId,
          accessToken,
          showTyping
        )
      }

      console.log("📋 [ASYNC WEBHOOK] Extracted data:", {
        businessPhoneNumberId,
        businessDisplayPhoneNumber,
        contactPhoneNumber,
        contactDisplayName,
        messageId,
        messageTimestamp,
      })
      let savedMessageId: string | null = null

      if (text) {
        console.log(`[ASYNC WEBHOOK] Processing TEXT message: ${text}`)
        savedMessageId = await saveUserMessage(ctx, {
          type: "text",
          conversation: conversation,
          contact: contact,
          prompt: text,
        })

        // Save to conversationMessages for dashboard display
        await ctx.runMutation(
          internal.system.conversationMessages.saveInboundMessage,
          {
            conversationId: conversation._id,
            organizationId: conversation.organizationId,
            whatsappMessageId: messageId,
            type: "text",
            content: { text },
            whatsappTimestamp: messageTimestamp
              ? parseInt(messageTimestamp)
              : undefined,
          }
        )

        // Cancel any pending order confirmation reminder or inactivity timers when user responds
        await ctx.runMutation(
          internal.system.orderConfirmationScheduler
            .cancelOrderConfirmationTimers,
          {
            conversationId: conversation._id,
          }
        )

        console.log(
          `🧹 [ASYNC WEBHOOK] CANCELLING inactivity timers. Reason: Incoming TEXT message. MsgId: ${messageId}`
        )

        await ctx.runMutation(
          internal.system.inactivityScheduler.cancelInactivityTimerInternal,
          {
            conversationId: conversation._id,
          }
        )
      }

      if (image) {
        // Validate image file size before processing
        const imageSizeValidation = await validateFileSize(
          ctx,
          image.id,
          accessToken,
          image.mime_type
        )

        if (!imageSizeValidation.isValid) {
          console.error(
            "🖼️ [ASYNC WEBHOOK] Image size validation failed:",
            imageSizeValidation.errorMessage
          )
          try {
            await ctx.runAction(
              internal.system.whatsappDispatcher.sendMessage,
              {
                whatsappConfigurationId: whatsappConfiguration._id,
                to: contactPhoneNumber,
                message:
                  imageSizeValidation.errorMessage ||
                  "La imagen es demasiado grande para procesar.",
              }
            )
          } catch (error) {
            throw new ConvexError({
              code: "INTERNAL_SERVER_ERROR",
              message: `No se pudo enviar el mensaje de tamaño de imagen: ${error instanceof Error ? error.message : "Error desconocido"}`,
            })
          }
          return
        }

        console.log(
          `🖼️ [ASYNC WEBHOOK] Processing image (${formatFileSize(imageSizeValidation.actualSize || 0)})`
        )

        // Get image download URL from WhatsApp API
        const mediaInfo = await getMediaUrl(ctx, image.id, accessToken)
        console.log("🖼️ [ASYNC WEBHOOK] Downloading image from WhatsApp...")
        const { storageId, url: imageUrl } = await downloadAndStoreMediaR2(
          ctx,
          mediaInfo.url,
          accessToken,
          image.mime_type
        )

        if (!imageUrl) {
          throw new ConvexError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No se pudo obtener la URL de la imagen",
          })
        }

        // Analyze image content
        let imageAnalysis = ""
        try {
          imageAnalysis = await analyzeImageUrl(imageUrl)
          console.log("🖼️ [ASYNC WEBHOOK] Image analyzed successfully")
          console.log("🖼️ [ASYNC WEBHOOK] Image analysis:", imageAnalysis)
        } catch (error) {
          console.error("❌ [ASYNC WEBHOOK] Image analysis failed:", error)
          imageAnalysis =
            "[Error al analizar imagen, no se pudo analizar el contenido de la imagen]"
        }

        // Combine original caption with image analysis
        const finalCaption = image.caption
          ? `${image.caption}\n\nAnálisis de la imagen: ${imageAnalysis}`
          : imageAnalysis

        savedMessageId = await saveUserMessage(ctx, {
          type: "image",
          conversation: conversation,
          contact: contact,
          attachment: {
            imageUrl: imageUrl,
            mimeType: image.mime_type,
            caption: finalCaption,
            storageId: storageId,
          },
        })

        // Save to conversationMessages for dashboard display
        await ctx.runMutation(
          internal.system.conversationMessages.saveInboundMessage,
          {
            conversationId: conversation._id,
            organizationId: conversation.organizationId,
            whatsappMessageId: messageId,
            type: "image",
            content: {
              text: image.caption,
              media: {
                url: imageUrl,
                mimeType: image.mime_type,
                caption: image.caption,
                storageId: storageId,
              },
            },
            whatsappTimestamp: messageTimestamp
              ? parseInt(messageTimestamp)
              : undefined,
          }
        )

        // Cancel any pending order confirmation reminder or inactivity timers when user responds
        await ctx.runMutation(
          internal.system.orderConfirmationScheduler
            .cancelOrderConfirmationTimers,
          {
            conversationId: conversation._id,
          }
        )
        await ctx.runMutation(
          internal.system.inactivityScheduler.cancelInactivityTimerInternal,
          {
            conversationId: conversation._id,
          }
        )
      }

      if (audio) {
        // Validate audio file size before processing
        const audioSizeValidation = await validateFileSize(
          ctx,
          audio.id,
          accessToken,
          audio.mime_type
        )

        if (!audioSizeValidation.isValid) {
          console.error(
            "🎵 [ASYNC WEBHOOK] Audio size validation failed:",
            audioSizeValidation.errorMessage
          )
          try {
            await ctx.runAction(
              internal.system.whatsappDispatcher.sendMessage,
              {
                whatsappConfigurationId: whatsappConfiguration._id,
                to: contactPhoneNumber,
                message:
                  audioSizeValidation.errorMessage ||
                  "El audio es demasiado grande para procesar.",
              }
            )
          } catch (error) {
            if (error instanceof ConvexError) {
              throw error
            }
            throw new ConvexError({
              code: "INTERNAL_SERVER_ERROR",
              message: `No se pudo enviar el mensaje de tamaño de audio: ${error instanceof Error ? error.message : "Error desconocido"}`,
            })
          }
          return
        }

        console.log(
          `🎵 [ASYNC WEBHOOK] Processing audio (${formatFileSize(audioSizeValidation.actualSize || 0)})`
        )

        // Get audio download URL from WhatsApp API
        const mediaInfo = await getMediaUrl(ctx, audio.id, accessToken)
        // Download and store audio in Convex storage
        const { storageId, url: audioUrl } = await downloadAndStoreMediaR2(
          ctx,
          mediaInfo.url,
          accessToken,
          audio.mime_type
        )

        if (!audioUrl) {
          throw new ConvexError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No se pudieron obtener los datos del audio",
          })
        }

        // Transcribe audio content
        let transcription = ""
        try {
          transcription = await transcribeAudioFileUrl(audioUrl)
          console.log("🎵 [ASYNC WEBHOOK] Audio transcribed successfully")
        } catch (error) {
          console.error("❌ [ASYNC WEBHOOK] Audio transcription failed:", error)
          transcription =
            "[Error al transcribir audio, no se pudo transcribir el audio]"
        }

        savedMessageId = await saveUserMessage(ctx, {
          type: "file",
          conversation: conversation,
          contact: contact,
          attachment: {
            dataUrl: audioUrl,
            mimeType: audio.mime_type,
            caption: transcription,
            storageId: storageId,
          },
        })

        // Save to conversationMessages for dashboard display
        await ctx.runMutation(
          internal.system.conversationMessages.saveInboundMessage,
          {
            conversationId: conversation._id,
            organizationId: conversation.organizationId,
            whatsappMessageId: messageId,
            type: "audio",
            content: {
              text: transcription,
              media: {
                url: audioUrl,
                mimeType: audio.mime_type,
                caption: transcription,
                storageId: storageId,
              },
            },
            whatsappTimestamp: messageTimestamp
              ? parseInt(messageTimestamp)
              : undefined,
          }
        )

        // Cancel any pending order confirmation reminder or inactivity timers when user responds
        await ctx.runMutation(
          internal.system.orderConfirmationScheduler
            .cancelOrderConfirmationTimers,
          {
            conversationId: conversation._id,
          }
        )
        await ctx.runMutation(
          internal.system.inactivityScheduler.cancelInactivityTimerInternal,
          {
            conversationId: conversation._id,
          }
        )
      }

      if (location) {
        console.log(
          `📍 [ASYNC WEBHOOK] Processing location message: ${location.latitude}, ${location.longitude}`
        )

        // Create a text message with the location information for the AI to process
        const locationText = location.name
          ? `📍 El cliente ha compartido su ubicación: ${location.name}${location.address ? ` (${location.address})` : ""}\nCoordenadas: ${location.latitude}, ${location.longitude}`
          : `📍 El cliente ha compartido su ubicación.\nCoordenadas: ${location.latitude}, ${location.longitude}${location.address ? `\nDirección: ${location.address}` : ""}`

        savedMessageId = await saveUserMessage(ctx, {
          type: "text",
          conversation: conversation,
          contact: contact,
          prompt: locationText,
        })

        // Save to conversationMessages for dashboard display
        await ctx.runMutation(
          internal.system.conversationMessages.saveInboundMessage,
          {
            conversationId: conversation._id,
            organizationId: conversation.organizationId,
            whatsappMessageId: messageId,
            type: "location",
            content: {
              text: locationText,
              location: {
                latitude: location.latitude,
                longitude: location.longitude,
                name: location.name,
                address: location.address,
              },
            },
            whatsappTimestamp: messageTimestamp
              ? parseInt(messageTimestamp)
              : undefined,
          }
        )

        // Cancel any pending order confirmation reminder timers when user responds
        await ctx.runMutation(
          internal.system.orderConfirmationScheduler
            .cancelOrderConfirmationTimers,
          {
            conversationId: conversation._id,
          }
        )

        console.log(
          `🧹 [ASYNC WEBHOOK] CANCELLING inactivity timers. Reason: Incoming LOCATION message. MsgId: ${messageId}`
        )

        await ctx.runMutation(
          internal.system.inactivityScheduler.cancelInactivityTimerInternal,
          {
            conversationId: conversation._id,
          }
        )
      }

      if (interactive) {
        let interactiveText = ""
        let interactiveType = ""

        if (interactive.type === "button_reply" && interactive.button_reply) {
          interactiveText = interactive.button_reply.title
          interactiveType = "button_reply"
        } else if (
          interactive.type === "list_reply" &&
          interactive.list_reply
        ) {
          interactiveText = interactive.list_reply.title
          interactiveType = "list_reply"
        }

        if (interactiveText) {
          console.log(
            `🔘 [ASYNC WEBHOOK] Processing INTERACTIVE message (${interactiveType}): "${interactiveText}"`
          )

          savedMessageId = await saveUserMessage(ctx, {
            type: "text",
            conversation: conversation,
            contact: contact,
            prompt: interactiveText,
          })

          // Save to conversationMessages for dashboard display
          // We save it as text so operators see clearly what was selected
          await ctx.runMutation(
            internal.system.conversationMessages.saveInboundMessage,
            {
              conversationId: conversation._id,
              organizationId: conversation.organizationId,
              whatsappMessageId: messageId,
              type: "text",
              content: { text: interactiveText },
              whatsappTimestamp: messageTimestamp
                ? parseInt(messageTimestamp)
                : undefined,
            }
          )

          // Cancel any pending order confirmation reminder or inactivity timers
          await ctx.runMutation(
            internal.system.orderConfirmationScheduler
              .cancelOrderConfirmationTimers,
            {
              conversationId: conversation._id,
            }
          )

          console.log(
            `🧹 [ASYNC WEBHOOK] CANCELLING inactivity timers. Reason: Incoming INTERACTIVE message. MsgId: ${messageId}`
          )

          await ctx.runMutation(
            internal.system.inactivityScheduler.cancelInactivityTimerInternal,
            {
              conversationId: conversation._id,
            }
          )
        } else {
          console.warn(
            `⚠️ [ASYNC WEBHOOK] Received interactive message but could not extract text. Type: ${interactive.type}`
          )
          // Fallback: save as text to ensure the agent is triggered
          interactiveText = `[Respuesta interactiva: ${interactive.type}]`
          interactiveType = interactive.type

          // Re-use the save logic
          console.log(
            `🔘 [ASYNC WEBHOOK] Processing UNKNOWN INTERACTIVE message as fallback: "${interactiveText}"`
          )

          savedMessageId = await saveUserMessage(ctx, {
            type: "text",
            conversation: conversation,
            contact: contact,
            prompt: interactiveText,
          })

          await ctx.runMutation(
            internal.system.conversationMessages.saveInboundMessage,
            {
              conversationId: conversation._id,
              organizationId: conversation.organizationId,
              whatsappMessageId: messageId,
              type: "text",
              content: { text: interactiveText },
              whatsappTimestamp: messageTimestamp
                ? parseInt(messageTimestamp)
                : undefined,
            }
          )

          // Cancel timers (same as above)
          await ctx.runMutation(
            internal.system.orderConfirmationScheduler
              .cancelOrderConfirmationTimers,
            {
              conversationId: conversation._id,
            }
          )

          await ctx.runMutation(
            internal.system.inactivityScheduler.cancelInactivityTimerInternal,
            {
              conversationId: conversation._id,
            }
          )
        }
      }

      if (document) {
        // Validate file size and type before processing
        const fileSizeValidation = await validateFileSize(
          ctx,
          document.id,
          accessToken,
          document.mime_type
        )

        if (!fileSizeValidation.isValid) {
          console.error(
            "📄 [ASYNC WEBHOOK] Validación de tamaño de documento falló:",
            fileSizeValidation.errorMessage
          )
          try {
            await ctx.runAction(
              internal.system.whatsappDispatcher.sendMessage,
              {
                whatsappConfigurationId: whatsappConfiguration._id,
                to: contactPhoneNumber,
                message:
                  fileSizeValidation.errorMessage ||
                  "El archivo es demasiado grande para procesar.",
              }
            )
          } catch (error) {
            if (error instanceof ConvexError) {
              throw error
            }
            throw new ConvexError({
              code: "INTERNAL_SERVER_ERROR",
              message: `No se pudo enviar el mensaje de tamaño de archivo: ${error instanceof Error ? error.message : "Error desconocido"}`,
            })
          }
          return
        }

        try {
          await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
            whatsappConfigurationId: whatsappConfiguration._id,
            to: contactPhoneNumber,
            message: `El tipo de archivo ${document.mime_type} no es compatible. Los tipos soportados son: PDF, Word, y texto plano.`,
          })
        } catch (error) {
          if (error instanceof ConvexError) {
            throw error
          }
          throw new ConvexError({
            code: "INTERNAL_SERVER_ERROR",
            message: `No se pudo enviar el mensaje de tipo de archivo no compatible: ${error instanceof Error ? error.message : "Error desconocido"}`,
          })
        }

        console.log(
          `📄 [ASYNC WEBHOOK] Processing document: ${document.filename || "unknown"} (${document.mime_type}, ${formatFileSize(fileSizeValidation.actualSize || 0)})`
        )

        // Get document download URL from WhatsApp API
        const mediaInfo = await getMediaUrl(ctx, document.id, accessToken)

        // Download and store document in Convex storage
        const { storageId, url: documentUrl } = await downloadAndStoreMediaR2(
          ctx,
          mediaInfo.url,
          accessToken,
          document.mime_type
        )

        if (!storageId || !documentUrl) {
          throw new ConvexError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No se pudo obtener los datos del documento",
          })
        }

        // Create a text message indicating document was received but cannot be processed
        const documentDescription = `El cliente ha enviado un documento: ${document.filename || "archivo sin nombre"} (${document.mime_type}) - URL: ${documentUrl}${document.caption ? `\nMensaje del cliente: "${document.caption}"` : ""}. No podemos procesar este tipo de archivo.`

        await saveMessage(ctx, components.agent, {
          threadId: conversation.threadId,
          prompt: documentDescription,
        })

        // Save to conversationMessages for dashboard display
        await ctx.runMutation(
          internal.system.conversationMessages.saveInboundMessage,
          {
            conversationId: conversation._id,
            organizationId: conversation.organizationId,
            whatsappMessageId: messageId,
            type: "document",
            content: {
              text: document.caption,
              media: {
                url: documentUrl,
                mimeType: document.mime_type,
                caption: document.caption,
                filename: document.filename,
                storageId: storageId,
              },
            },
            whatsappTimestamp: messageTimestamp
              ? parseInt(messageTimestamp)
              : undefined,
          }
        )

        // Send WhatsApp message to user explaining supported formats
        try {
          await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
            whatsappConfigurationId: whatsappConfiguration._id,
            to: contactPhoneNumber,
            message:
              "Solo podemos procesar mensajes de texto, imágenes y audios. Los documentos no son compatibles en este momento.",
          })
        } catch (error) {
          if (error instanceof ConvexError) {
            throw error
          }
          throw new ConvexError({
            code: "INTERNAL_SERVER_ERROR",
            message: `No se pudo enviar el mensaje de tipo de archivo no compatible: ${error instanceof Error ? error.message : "Error desconocido"}`,
          })
        }
      }

      if (savedMessageId && conversation.status === "unresolved") {
        console.log(
          "⏰ [ASYNC WEBHOOK] Scheduling agent response with 3 second debounce"
        )
        await ctx.runMutation(
          internal.system.responseDebounceScheduler.scheduleAgentResponse,
          {
            whatsappConfiguration: whatsappConfiguration,
            conversation: conversation,
            contact: contact,
            messageId: savedMessageId,
            whatsappMessageId: messageId, // WhatsApp message ID for typing indicator
          }
        )
      } else if (conversation.status !== "unresolved") {
        console.log(
          `🚫 [ASYNC WEBHOOK] Conversation is ${conversation.status} - skipping response scheduling`
        )
      }
    }

    console.log("📱 [ASYNC WEBHOOK] WhatsApp message processing completed")
  },
})
