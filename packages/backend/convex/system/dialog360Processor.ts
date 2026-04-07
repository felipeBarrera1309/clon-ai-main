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
  getDialog360MediaUrl,
  markDialog360MessageAsRead,
  validateDialog360FileSize,
} from "../model/whatsapp"
import { analyzeImageUrl, transcribeAudioFileUrl } from "../public/files"
import { saveUserMessage } from "./messages"

/**
 * Process 360dialog webhook message asynchronously
 * This function processes the complete webhook payload including media files and sends responses
 *
 * 360dialog uses the same payload format as Meta's Cloud API, so we can reuse
 * the same processing logic with different API endpoints for media handling.
 */
export const processDialog360WebhookMessage = internalAction({
  args: {
    payload: v.any(), // WhatsApp webhook payload (same format as Meta)
  },
  handler: async (ctx, args) => {
    console.log(
      "📱 [360DIALOG ASYNC] Starting async processing of 360dialog message"
    )

    const payload = args.payload as WhatsAppWebhookPayload

    // Extract relevant information from the webhook payload
    const entry = payload.entry[0]
    if (!entry || !entry.changes || !entry.changes[0]) {
      console.error("[360DIALOG ASYNC] No entry or changes")
      return
    }

    const changes = entry.changes
    if (!changes || changes.length === 0 || !changes[0]) {
      console.error("[360DIALOG ASYNC] No changes")
      return
    }

    const value = changes[0].value

    const statusValue = "statuses" in value ? value : null
    const messageValue = "messages" in value ? value : null

    if (statusValue) {
      const incomingStatusUpdate =
        await processIncomingStatusUpdate(statusValue)
      if (!incomingStatusUpdate) {
        console.error("[360DIALOG ASYNC] No incoming status update")
        return
      }

      // Process status update for bulk messaging campaigns
      const { statusUpdate } = incomingStatusUpdate
      console.log(
        `📊 [360DIALOG ASYNC] Processing status update: ${statusUpdate.status} for message ${statusUpdate.id}`
      )

      // Log error details if the message failed
      let errorMessage: string | undefined
      if (statusUpdate.status === "failed" && statusUpdate.errors?.length) {
        const error = statusUpdate.errors[0]
        errorMessage = `Error ${error?.code}: ${error?.title}${error?.message ? ` - ${error.message}` : ""}${error?.error_data?.details ? ` (${error.error_data.details})` : ""}`
        console.error(`❌ [360DIALOG ASYNC] Message failed: ${errorMessage}`)
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

      return
    } else if (messageValue) {
      const message = messageValue
      const incomingMessage = await processIncomingMessage(message)
      if (!incomingMessage) {
        console.error(
          "[360DIALOG ASYNC] No incoming message or unsupported message type"
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
        messageId,
        messageTimestamp,
        businessPhoneNumberId,
        businessDisplayPhoneNumber,
      } = incomingMessage

      // Process incoming message using 360dialog-specific handler
      const { conversation, contact, dialog360Configuration } =
        await ctx.runMutation(
          internal.system.dialog360.processDialog360IncomingMessage,
          {
            contactPhoneNumber,
            contactDisplayName,
            businessPhoneNumber: businessDisplayPhoneNumber,
            fromWhatsApp: true,
          }
        )

      // Validation guard for 360dialog provider fields
      if (!dialog360Configuration.dialog360ApiKey) {
        console.error("❌ [360DIALOG ASYNC] Missing 360dialog API key")
        throw new ConvexError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Configuración de WhatsApp incompleta para proveedor 360dialog",
        })
      }

      const apiKey = dialog360Configuration.dialog360ApiKey

      // Mark the message as read immediately (shows blue ticks)
      // Only show typing indicator if conversation is unresolved (not escalated)
      const showTyping = conversation.status === "unresolved"
      await markDialog360MessageAsRead(ctx, messageId, apiKey, showTyping)

      console.log("📋 [360DIALOG ASYNC] Extracted data:", {
        businessPhoneNumber: businessDisplayPhoneNumber,
        contactPhoneNumber,
        contactDisplayName,
        messageId,
        messageTimestamp,
      })
      let savedMessageId: string | null = null

      if (text) {
        console.log(`[360DIALOG ASYNC] Processing TEXT message: ${text}`)
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
          `🧹 [360DIALOG ASYNC] CANCELLING inactivity timers. Reason: Incoming TEXT message. MsgId: ${messageId}`
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
        const imageSizeValidation = await validateDialog360FileSize(
          ctx,
          image.id,
          apiKey,
          image.mime_type
        )

        if (!imageSizeValidation.isValid) {
          console.error(
            "🖼️ [360DIALOG ASYNC] Image size validation failed:",
            imageSizeValidation.errorMessage
          )
          try {
            await ctx.runAction(
              internal.system.whatsappDispatcher.sendMessage,
              {
                dialog360ConfigurationId: dialog360Configuration._id,
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
          `🖼️ [360DIALOG ASYNC] Processing image (${formatFileSize(imageSizeValidation.actualSize || 0)})`
        )

        // Get image download URL from 360dialog API
        const mediaInfo = await getDialog360MediaUrl(ctx, image.id, apiKey)
        console.log("🖼️ [360DIALOG ASYNC] Downloading image from 360dialog...")
        const { storageId, url: imageUrl } = await downloadAndStoreMediaR2(
          ctx,
          mediaInfo.url,
          apiKey, // 360dialog uses API key for auth
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
          console.log("🖼️ [360DIALOG ASYNC] Image analyzed successfully")
        } catch (error) {
          console.error("❌ [360DIALOG ASYNC] Image analysis failed:", error)
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
        const audioSizeValidation = await validateDialog360FileSize(
          ctx,
          audio.id,
          apiKey,
          audio.mime_type
        )

        if (!audioSizeValidation.isValid) {
          console.error(
            "🎵 [360DIALOG ASYNC] Audio size validation failed:",
            audioSizeValidation.errorMessage
          )
          try {
            await ctx.runAction(
              internal.system.whatsappDispatcher.sendMessage,
              {
                dialog360ConfigurationId: dialog360Configuration._id,
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
          `🎵 [360DIALOG ASYNC] Processing audio (${formatFileSize(audioSizeValidation.actualSize || 0)})`
        )

        // Get audio download URL from 360dialog API
        const mediaInfo = await getDialog360MediaUrl(ctx, audio.id, apiKey)
        // Download and store audio in storage
        const { storageId, url: audioUrl } = await downloadAndStoreMediaR2(
          ctx,
          mediaInfo.url,
          apiKey,
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
          console.log("🎵 [360DIALOG ASYNC] Audio transcribed successfully")
        } catch (error) {
          console.error(
            "❌ [360DIALOG ASYNC] Audio transcription failed:",
            error
          )
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
          `📍 [360DIALOG ASYNC] Processing location message: ${location.latitude}, ${location.longitude}`
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
          `🧹 [360DIALOG ASYNC] CANCELLING inactivity timers. Reason: Incoming LOCATION message. MsgId: ${messageId}`
        )

        await ctx.runMutation(
          internal.system.inactivityScheduler.cancelInactivityTimerInternal,
          {
            conversationId: conversation._id,
          }
        )
      }

      if (document) {
        // Validate file size and type before processing
        const fileSizeValidation = await validateDialog360FileSize(
          ctx,
          document.id,
          apiKey,
          document.mime_type
        )

        if (!fileSizeValidation.isValid) {
          console.error(
            "📄 [360DIALOG ASYNC] Validación de tamaño de documento falló:",
            fileSizeValidation.errorMessage
          )
          try {
            await ctx.runAction(
              internal.system.whatsappDispatcher.sendMessage,
              {
                dialog360ConfigurationId: dialog360Configuration._id,
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
            dialog360ConfigurationId: dialog360Configuration._id,
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
          `📄 [360DIALOG ASYNC] Processing document: ${document.filename || "unknown"} (${document.mime_type}, ${formatFileSize(fileSizeValidation.actualSize || 0)})`
        )

        // Get document download URL from 360dialog API
        const mediaInfo = await getDialog360MediaUrl(ctx, document.id, apiKey)

        // Download and store document in storage
        const { storageId, url: documentUrl } = await downloadAndStoreMediaR2(
          ctx,
          mediaInfo.url,
          apiKey,
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
            dialog360ConfigurationId: dialog360Configuration._id,
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
          "⏰ [360DIALOG ASYNC] Scheduling agent response with 3 second debounce"
        )
        await ctx.runMutation(
          internal.system.responseDebounceScheduler.scheduleAgentResponse,
          {
            dialog360Configuration: dialog360Configuration,
            conversation: conversation,
            contact: contact,
            messageId: savedMessageId,
            whatsappMessageId: messageId, // WhatsApp message ID for typing indicator
          }
        )
      } else if (conversation.status !== "unresolved") {
        console.log(
          `🚫 [360DIALOG ASYNC] Conversation is ${conversation.status} - skipping response scheduling`
        )
      }
    }

    console.log("📱 [360DIALOG ASYNC] 360dialog message processing completed")
  },
})
