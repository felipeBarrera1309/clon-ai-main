"use node"

import { ConvexError, v } from "convex/values"
import { internal } from "../_generated/api"
import { internalAction } from "../_generated/server"
import { formatFileSize } from "../lib/constants"
import {
  downloadAndStoreMediaR2,
  markGupshupMessageAsRead,
  validateGupshupFileSize,
} from "../model/whatsapp"
import { analyzeImageUrl, transcribeAudioFileUrl } from "../public/files"
import { saveUserMessage } from "./messages"

/**
 * Get media URL from Gupshup using media ID
 */
async function getGupshupMediaUrl(
  mediaId: string,
  apiKey: string,
  mediaToken?: string
): Promise<string | null> {
  try {
    const axios = (await import("axios")).default
    let response
    // Primer intento: API key
    try {
      console.log(
        `[GUPSHUP][DEBUG] Intentando obtener media URL con API key para mediaId: ${mediaId}`
      )
      response = await axios.get(`https://api.gupshup.io/wa/media/${mediaId}`, {
        headers: {
          apikey: apiKey,
        },
        responseType: "json",
        timeout: 10000,
      })
      console.log(`[GUPSHUP][DEBUG] Respuesta completa (API key):`, {
        status: response.status,
        headers: response.headers,
        data: response.data,
      })
      if (response.data && response.data.url) {
        return response.data.url
      }
    } catch (err) {
      const error: any = err
      if (error?.response) {
        console.error("[GUPSHUP][DEBUG] Error response (API key):", {
          status: error.response.status,
          headers: error.response.headers,
          data: error.response.data,
        })
      } else {
        console.error("[GUPSHUP][DEBUG] Error (API key):", error)
      }
    }

    const token = mediaToken || null
    if (token) {
      try {
        console.log(
          `[GUPSHUP][DEBUG] Intentando obtener media URL con Bearer token para mediaId: ${mediaId}`
        )
        response = await axios.get(
          `https://api.gupshup.io/wa/media/${mediaId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            responseType: "json",
            timeout: 10000,
          }
        )
        console.log(`[GUPSHUP][DEBUG] Respuesta completa (Bearer token):`, {
          status: response.status,
          headers: response.headers,
          data: response.data,
        })
        if (response.data && response.data.url) {
          return response.data.url
        }
      } catch (err) {
        const error: any = err
        if (error?.response) {
          console.error("[GUPSHUP][DEBUG] Error response (Bearer token):", {
            status: error.response.status,
            headers: error.response.headers,
            data: error.response.data,
          })
        } else {
          console.error("[GUPSHUP][DEBUG] Error (Bearer token):", error)
        }
      }
    }
    // Log final error
    console.error(
      `[GUPSHUP][DEBUG] No media URL found para mediaId: ${mediaId}`
    )
    return null
  } catch (error) {
    console.error(
      "[GUPSHUP][DEBUG] Unexpected error fetching media URL:",
      error
    )
    return null
  }
}

/**
 * Gupshup webhook payload types
 */
interface GupshupMessagePayload {
  text?: string
  caption?: string
  url?: string
  filename?: string
  contentType?: string
  urlExpiry?: number
  latitude?: number
  longitude?: number
  name?: string
  address?: string
}

interface GupshupSender {
  phone: string
  name: string
  country_code?: string
  dial_code?: string
}

interface GupshupMessageContext {
  gsId?: string
  id?: string
}

interface GupshupPayload {
  id: string
  source: string
  destination: string
  type: string
  payload: GupshupMessagePayload
  sender: GupshupSender
  context?: GupshupMessageContext
}

interface GupshupWebhookPayload {
  app: string
  timestamp: number
  version: number
  type: string // "message", "message-event", "user-event", etc.
  payload: GupshupPayload
}

interface GupshupStatusPayload {
  id: string
  gsId?: string
  type: string // "sent", "delivered", "read", "failed"
  destination: string
  payload?: {
    code?: number
    reason?: string
  }
}

interface GupshupStatusWebhookPayload {
  app: string
  timestamp: number
  version: number
  type: "message-event"
  payload: GupshupStatusPayload
}

/**
 * Gupshup V3 Partner API payload types (Meta Cloud API format)
 */
interface GupshupV3Message {
  from: string
  id: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: {
    id: string
    mime_type: string
    sha256: string
    caption?: string
    url?: string
  }
  audio?: { id: string; mime_type: string; url?: string }
  video?: { id: string; mime_type: string; caption?: string; url?: string }
  document?: {
    id: string
    filename: string
    mime_type: string
    caption?: string
    url?: string
  }
  sticker?: { id: string; mime_type: string; url?: string }
  location?: {
    latitude: number
    longitude: number
    name?: string
    address?: string
  }
  contacts?: Array<{
    name: { formatted_name: string }
    phones?: Array<{ phone: string }>
  }>
  context?: { from: string; id: string }
}

interface GupshupV3Status {
  id: string
  status: string // "sent" | "delivered" | "read" | "failed"
  timestamp: string
  recipient_id: string
  errors?: Array<{ code: number; title: string }>
}

interface GupshupV3Value {
  messaging_product: string
  metadata: {
    display_phone_number: string
    phone_number_id: string
  }
  contacts?: Array<{ profile: { name: string }; wa_id: string }>
  messages?: GupshupV3Message[]
  statuses?: GupshupV3Status[]
}

interface GupshupV3WebhookPayload {
  gs_app_id: string
  object: string // "whatsapp_business_account"
  entry: Array<{
    id: string
    changes: Array<{
      value: GupshupV3Value
      field: string
    }>
  }>
}

/**
 * Check if payload is V3 format (Meta Cloud API style)
 */
function isV3Payload(payload: unknown): payload is GupshupV3WebhookPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "gs_app_id" in payload &&
    "entry" in payload &&
    Array.isArray((payload as GupshupV3WebhookPayload).entry)
  )
}

/**
 * Normalize V3 payload to V2 format for consistent processing
 */
function normalizeV3ToV2Payload(
  v3: GupshupV3WebhookPayload
): GupshupWebhookPayload | GupshupStatusWebhookPayload | null {
  const entry = v3.entry?.[0]
  const change = entry?.changes?.[0]
  const value = change?.value

  console.log(`🔍 [GUPSHUP V3] Entry ID: ${entry?.id}`)
  console.log(`🔍 [GUPSHUP V3] Change field: ${change?.field}`)
  console.log(
    `🔍 [GUPSHUP V3] Value keys: ${value ? Object.keys(value).join(", ") : "null"}`
  )
  console.log(
    `🔍 [GUPSHUP V3] Has messages: ${!!(value as any)?.messages}, length: ${(value as any)?.messages?.length}`
  )
  console.log(
    `🔍 [GUPSHUP V3] Has statuses: ${!!(value as any)?.statuses}, length: ${(value as any)?.statuses?.length}`
  )

  if (!value) {
    console.log("⚠️ [GUPSHUP V3] No value in payload")
    return null
  }

  // Handle incoming message
  if (value.messages && value.messages.length > 0) {
    const msg = value.messages[0]
    if (!msg) return null
    const contact = value.contacts?.[0]

    // Helper to ensure we always get a valid HTTP URL, as the webhook might put the ID in the URL field.
    // The File Manager URL is the official Gupshup CDN endpoint for V3 media retrieval.
    // Docs: https://docs.gupshup.io/docs/media-handling
    const GUPSHUP_FILE_MANAGER_BASE_URL = "https://filemanager.gupshup.io/wa"
    const getValidMediaUrl = (
      url?: string,
      appId?: string,
      mediaId?: string
    ): string | undefined => {
      if (url && url.startsWith("http")) return url
      if (!appId || !mediaId) return undefined
      const encodedAppId = encodeURIComponent(appId)
      const encodedMediaId = encodeURIComponent(mediaId)
      return `${GUPSHUP_FILE_MANAGER_BASE_URL}/${encodedAppId}/wa/media/${encodedMediaId}?download=false`
    }

    // Determine message type and payload content
    let messagePayload: GupshupMessagePayload = {}
    let messageType = msg.type

    if (msg.type === "text" && msg.text) {
      messagePayload = { text: msg.text.body }
    } else if (msg.type === "image" && msg.image) {
      messagePayload = {
        url: getValidMediaUrl(msg.image?.url, v3.gs_app_id, msg.image?.id),
        caption: msg.image?.caption,
        contentType: msg.image?.mime_type,
      }
      messageType = "image"
    } else if (msg.type === "audio" && msg.audio) {
      messagePayload = {
        url: getValidMediaUrl(msg.audio?.url, v3.gs_app_id, msg.audio?.id),
        contentType: msg.audio?.mime_type,
      }
      messageType = "audio"
    } else if (msg.type === "video" && msg.video) {
      messagePayload = {
        url: getValidMediaUrl(msg.video?.url, v3.gs_app_id, msg.video?.id),
        caption: msg.video?.caption,
        contentType: msg.video?.mime_type,
      }
      messageType = "video"
    } else if (msg.type === "document" && msg.document) {
      messagePayload = {
        url: getValidMediaUrl(
          msg.document?.url,
          v3.gs_app_id,
          msg.document?.id
        ),
        filename: msg.document?.filename,
        caption: msg.document?.caption,
        contentType: msg.document?.mime_type,
      }
      messageType = "file"
    } else if (msg.type === "sticker" && msg.sticker) {
      messagePayload = {
        url: getValidMediaUrl(msg.sticker?.url, v3.gs_app_id, msg.sticker?.id),
        contentType: msg.sticker?.mime_type,
      }
      messageType = "sticker"
    } else if (msg.type === "location" && msg.location) {
      messagePayload = {
        latitude:
          msg.location?.latitude !== undefined
            ? Number(msg.location.latitude)
            : undefined,
        longitude:
          msg.location?.longitude !== undefined
            ? Number(msg.location.longitude)
            : undefined,
        name: msg.location?.name,
        address: msg.location?.address,
      }
      messageType = "location"
    }

    const normalized: GupshupWebhookPayload = {
      app: v3.gs_app_id,
      timestamp: parseInt(msg.timestamp) * 1000, // V3 uses seconds, V2 uses ms
      version: 3,
      type: "message",
      payload: {
        id: msg.id,
        source: msg.from,
        destination: value.metadata.display_phone_number,
        type: messageType,
        payload: messagePayload,
        sender: {
          phone: msg.from,
          name: contact?.profile?.name || msg.from,
        },
        context: msg.context
          ? {
            id: msg.context.id,
          }
          : undefined,
      },
    }

    console.log(
      `✅ [GUPSHUP V3] Normalized message from ${msg.from}: ${messageType}`
    )
    return normalized
  }

  // Handle status update
  if (value.statuses && value.statuses.length > 0) {
    const status = value.statuses[0]

    if (!status) return null

    console.log(
      `🔍 [GUPSHUP V3] Status object keys: ${Object.keys(status).join(", ")}`
    )
    console.log(
      `🔍 [GUPSHUP V3] Status: id=${status?.id}, status=${status?.status}, recipient=${status?.recipient_id}`
    )

    // Skip system events like "set-callback" that don't have real status data
    // V3 statuses should have: id, status, timestamp, recipient_id
    if (!status?.status || !status?.id) {
      console.log(
        `ℹ️ [GUPSHUP V3] Skipping incomplete status event: ${JSON.stringify(status)}`
      )
      return null
    }

    const normalized: GupshupStatusWebhookPayload = {
      app: v3.gs_app_id,
      timestamp: status?.timestamp
        ? parseInt(status.timestamp) * 1000
        : Date.now(),
      version: 3,
      type: "message-event",
      payload: {
        id: status?.id,
        type: status?.status, // "sent", "delivered", "read", "failed"
        destination: status?.recipient_id || "",
        payload: status?.errors?.[0]
          ? {
            code: status.errors[0].code,
            reason: status.errors[0].title,
          }
          : undefined,
      },
    }

    console.log(
      `✅ [GUPSHUP V3] Normalized status: ${status?.status} for ${status?.id}`
    )
    return normalized
  }

  // Log summary value for debugging when neither messages nor statuses exist (avoiding PII exposure)
  console.log(
    "⚠️ [GUPSHUP V3] Payload has no messages or statuses. Target info:",
    JSON.stringify({ gs_app_id: v3.gs_app_id, object: v3.object })
  )
  return null
}

/**
 * Process Gupshup webhook message asynchronously
 * This function processes the complete webhook payload including media files and sends responses
 */
export const processGupshupWebhookMessage = internalAction({
  args: {
    payload: v.string(), // Gupshup webhook payload as raw string to avoid v.any()
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log(
      "📱 [GUPSHUP ASYNC] Starting async processing of Gupshup message"
    )

    let rawPayload
    try {
      rawPayload = JSON.parse(args.payload)
    } catch (e) {
      console.error("❌ [GUPSHUP ASYNC] Failed to parse payload string")
      return null
    }

    console.log(
      "📦 [GUPSHUP ASYNC] Raw payload metadata:",
      JSON.stringify({ app: rawPayload?.app, type: rawPayload?.type })
    )

    let payload = rawPayload as
      | GupshupWebhookPayload
      | GupshupStatusWebhookPayload

    // Check if this is V3 format and normalize it to V2
    if (isV3Payload(rawPayload)) {
      console.log(
        "📦 [GUPSHUP ASYNC] Detected V3 (Meta Cloud API) format, normalizing..."
      )
      const normalizedPayload = normalizeV3ToV2Payload(rawPayload)
      if (!normalizedPayload) {
        console.log(
          "⚠️ [GUPSHUP ASYNC] Could not normalize V3 payload, skipping"
        )
        return null
      }
      payload = normalizedPayload
      console.log(
        `✅ [GUPSHUP ASYNC] Normalized to V2 format: type=${payload.type}`
      )
    } else {
      console.log(
        "📦 [GUPSHUP ASYNC] Treating as V2 format, keys:",
        Object.keys(rawPayload || {})
      )
    }

    // Handle status updates (message-event)
    if (payload.type === "message-event") {
      const statusPayload = payload as GupshupStatusWebhookPayload
      const { type: status, id: messageId, destination } = statusPayload.payload

      console.log(
        `📊 [GUPSHUP ASYNC] Processing status update: ${status} for message ${messageId}`
      )

      // Log error details if the message failed
      let errorMessage: string | undefined
      if (status === "failed" && statusPayload.payload.payload) {
        const error = statusPayload.payload.payload
        errorMessage = `Error ${error.code}: ${error.reason}`
        console.error(`❌ [GUPSHUP ASYNC] Message failed: ${errorMessage}`)
      }

      // Update campaign recipient status if this message belongs to a campaign
      // Map Gupshup status to standard status
      const standardStatus =
        status === "sent"
          ? "sent"
          : status === "delivered"
            ? "delivered"
            : status === "read"
              ? "read"
              : status === "failed"
                ? "failed"
                : "sent"

      await ctx.runMutation(
        internal.system.bulkMessaging.updateRecipientStatusFromWebhook,
        {
          whatsappMessageId: messageId,
          status: standardStatus,
          timestamp: statusPayload.timestamp,
          errorMessage,
        }
      )

      return
    }

    // Handle user events (like opt-in, opt-out)
    if (payload.type === "user-event") {
      console.log(`ℹ️ [GUPSHUP ASYNC] User event received, skipping`)
      return
    }

    // Handle incoming messages
    if (payload.type !== "message") {
      console.log(`ℹ️ [GUPSHUP ASYNC] Skipping event type: ${payload.type}`)
      return
    }

    const messagePayload = payload as GupshupWebhookPayload

    // Guard against malformed payloads — validate required fields before destructuring
    const innerPayload = messagePayload?.payload
    if (
      !innerPayload ||
      !innerPayload.id ||
      !innerPayload.source ||
      !innerPayload.type
    ) {
      console.error(
        "❌ [GUPSHUP ASYNC] Malformed message payload — missing required fields (id, source, type)"
      )
      return
    }

    const appName = messagePayload.app
    const rawTimestamp = messagePayload.timestamp
    // Gupshup V2 sends timestamps in ms, V3 normalization also converts to ms.
    // whatsappTimestamp expects Unix seconds. Defensively handle both formats:
    // if the value looks like seconds (< 10 billion), keep it; otherwise convert ms → s.
    const timestampInSeconds =
      rawTimestamp > 9_999_999_999
        ? Math.floor(rawTimestamp / 1000)
        : Math.floor(rawTimestamp)
    const messageId = innerPayload.id
    const contactPhoneNumber = innerPayload.source
    const businessPhoneNumber = innerPayload.destination
    const messageType = innerPayload.type
    const messageContent = innerPayload.payload
    const sender = innerPayload.sender || { name: contactPhoneNumber }

    const contactDisplayName = sender.name || contactPhoneNumber

    console.log(
      `📱 [GUPSHUP ASYNC] Processing message from ${contactPhoneNumber} via app ${appName}`
    )

    // Process incoming message using Gupshup-specific handler
    const { conversation, contact, gupshupConfiguration } =
      await ctx.runMutation(
        internal.system.gupshup.processGupshupIncomingMessage,
        {
          contactPhoneNumber,
          contactDisplayName,
          gupshupAppId: appName,
          fromWhatsApp: true,
        }
      )

    // Validation guard for Gupshup provider fields
    if (!gupshupConfiguration.gupshupApiKey) {
      console.error("❌ [GUPSHUP ASYNC] Missing Gupshup API key")
      throw new ConvexError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Configuración de WhatsApp incompleta para proveedor Gupshup",
      })
    }

    const apiKey = gupshupConfiguration.gupshupApiKey

    // Mark the message as read and optionally show typing indicator
    // Uses Gupshup Partner API /v1/event — requires appId + appToken (not just apiKey)
    // We set showTyping to false here to avoid duplicate typing indicators.
    // The typing indicator will be explicitly fired by the responseDebounceScheduler later.
    const showTyping = false
    if (gupshupConfiguration.gupshupAppId && gupshupConfiguration.gupshupAppToken) {
      await markGupshupMessageAsRead(
        ctx,
        messageId,
        gupshupConfiguration.gupshupAppId,
        gupshupConfiguration.gupshupAppToken,
        showTyping
      )
    } else {
      console.warn(
        `⚠️ [GUPSHUP ASYNC] Cannot mark message as read: gupshupAppId or gupshupAppToken not configured for app ${appName}. ` +
        `Set these fields in the WhatsApp configuration to enable read receipts and typing indicators.`
      )
    }

    console.log("📋 [GUPSHUP ASYNC] Extracted data:", {
      appName,
      contactPhoneNumber,
      contactDisplayName,
      messageId,
      timestamp: rawTimestamp,
      messageType,
    })

    let savedMessageId: string | null = null

    // Handle text messages
    if (messageType === "text" && messageContent.text) {
      console.log(
        `[GUPSHUP ASYNC] Processing TEXT message: ${messageContent.text}`
      )
      savedMessageId = await saveUserMessage(ctx, {
        type: "text",
        conversation: conversation,
        contact: contact,
        prompt: messageContent.text,
      })

      // Save to conversationMessages for dashboard display
      await ctx.runMutation(
        internal.system.conversationMessages.saveInboundMessage,
        {
          conversationId: conversation._id,
          organizationId: conversation.organizationId,
          whatsappMessageId: messageId,
          type: "text",
          content: { text: messageContent.text },
          whatsappTimestamp: timestampInSeconds,
        }
      )

      // Cancel any pending order confirmation reminder or inactivity timers when user responds
      await ctx.runMutation(
        internal.system.orderConfirmationScheduler
          .cancelOrderConfirmationTimers,
        { conversationId: conversation._id }
      )

      console.log(
        `🧹 [GUPSHUP ASYNC] CANCELLING inactivity timers. Reason: Incoming TEXT message. MsgId: ${messageId}`
      )

      await ctx.runMutation(
        internal.system.inactivityScheduler.cancelInactivityTimerInternal,
        { conversationId: conversation._id }
      )

      // Respuesta automática del agente
      // Elimina el mensaje automático. Aquí puedes agregar lógica personalizada si lo necesitas.
    }

    // Handle image messages
    if (messageType === "image" && messageContent.url) {
      const mimeType = messageContent.contentType || "image/jpeg"
      let mediaUrl: string | null = null
      if (
        typeof messageContent.url === "string" &&
        messageContent.url.startsWith("http")
      ) {
        mediaUrl = messageContent.url
        console.log(
          "🖼️ [GUPSHUP ASYNC] Usando URL directa de imagen del webhook:",
          mediaUrl
        )
        // Validar tamaño solo si es URL directa
        const imageSizeValidation = await validateGupshupFileSize(
          ctx,
          mediaUrl,
          mimeType,
          apiKey
        )
        if (!imageSizeValidation.isValid) {
          console.error(
            "🖼️ [GUPSHUP ASYNC] Image size validation failed:",
            imageSizeValidation.errorMessage
          )
          try {
            await ctx.runAction(
              internal.system.whatsappDispatcher.sendMessage,
              {
                gupshupConfigurationId: gupshupConfiguration._id,
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
          `🖼️ [GUPSHUP ASYNC] Processing image (${formatFileSize(imageSizeValidation.actualSize || 0)})`
        )
      } else {
        // Si no es URL directa, solo intenta obtener la media URL por mediaId (sin validar tamaño)
        let retryCount = 0
        while (retryCount < 3 && !mediaUrl) {
          mediaUrl = await getGupshupMediaUrl(
            messageContent.url,
            apiKey,
            gupshupConfiguration.gupshupMediaToken
          )
          if (!mediaUrl) {
            retryCount++
            console.warn(
              `🖼️ [GUPSHUP ASYNC] Retry ${retryCount} for image media URL`
            )
            await new Promise((res) => setTimeout(res, 1000 * retryCount))
          }
        }
        if (!mediaUrl) {
          console.error(
            "❌ [GUPSHUP ASYNC] No se pudo obtener la URL de la imagen desde Gupshup tras 3 intentos"
          )
          await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
            gupshupConfigurationId: gupshupConfiguration._id,
            to: contactPhoneNumber,
            message:
              "No se pudo obtener la URL de la imagen para procesar. Intenta reenviar la imagen.",
          })
          return
        }
        console.log(
          `🖼️ [GUPSHUP ASYNC] Processing image (mediaId, tamaño no validado)`
        )
      }
      // Download and store image
      const { storageId, url: imageUrl } = await downloadAndStoreMediaR2(
        ctx,
        mediaUrl,
        apiKey,
        mimeType,
        "gupshup"
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
        console.log("🖼️ [GUPSHUP ASYNC] Image analyzed successfully")
      } catch (error) {
        console.error("❌ [GUPSHUP ASYNC] Image analysis failed:", error)
        imageAnalysis =
          "[Error al analizar imagen, no se pudo analizar el contenido de la imagen]"
      }
      // Combine original caption with image analysis
      const finalCaption = messageContent.caption
        ? `${messageContent.caption}\n\nAnálisis de la imagen: ${imageAnalysis}`
        : imageAnalysis
      savedMessageId = await saveUserMessage(ctx, {
        type: "image",
        conversation: conversation,
        contact: contact,
        attachment: {
          imageUrl: imageUrl,
          mimeType: mimeType,
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
            text: messageContent.caption,
            media: {
              url: imageUrl,
              mimeType: mimeType,
              caption: messageContent.caption,
              storageId: storageId,
            },
          },
          whatsappTimestamp: timestampInSeconds,
        }
      )
      // Cancel timers
      await ctx.runMutation(
        internal.system.orderConfirmationScheduler
          .cancelOrderConfirmationTimers,
        { conversationId: conversation._id }
      )
      await ctx.runMutation(
        internal.system.inactivityScheduler.cancelInactivityTimerInternal,
        { conversationId: conversation._id }
      )
    }

    // Handle audio/voice messages
    if (
      (messageType === "audio" || messageType === "voice") &&
      messageContent.url
    ) {
      const mimeType = messageContent.contentType || "audio/ogg"
      let mediaUrl: string | null = null
      if (
        typeof messageContent.url === "string" &&
        messageContent.url.startsWith("http")
      ) {
        mediaUrl = messageContent.url
        console.log(
          "🎵 [GUPSHUP ASYNC] Usando URL directa de audio del webhook:",
          mediaUrl
        )
        // Validar tamaño solo si es URL directa
        const audioSizeValidation = await validateGupshupFileSize(
          ctx,
          mediaUrl,
          mimeType,
          apiKey
        )
        if (!audioSizeValidation.isValid) {
          console.error(
            "🎵 [GUPSHUP ASYNC] Audio size validation failed:",
            audioSizeValidation.errorMessage
          )
          try {
            await ctx.runAction(
              internal.system.whatsappDispatcher.sendMessage,
              {
                gupshupConfigurationId: gupshupConfiguration._id,
                to: contactPhoneNumber,
                message:
                  audioSizeValidation.errorMessage ||
                  "El audio es demasiado grande para procesar.",
              }
            )
          } catch (error) {
            throw new ConvexError({
              code: "INTERNAL_SERVER_ERROR",
              message: `No se pudo enviar el mensaje de tamaño de audio: ${error instanceof Error ? error.message : "Error desconocido"}`,
            })
          }
          return
        }
        console.log(
          `🎵 [GUPSHUP ASYNC] Processing audio (${formatFileSize(audioSizeValidation.actualSize || 0)})`
        )
      } else {
        // Si no es URL directa, solo intenta obtener la media URL por mediaId (sin validar tamaño)
        let retryCount = 0
        while (retryCount < 3 && !mediaUrl) {
          mediaUrl = await getGupshupMediaUrl(
            messageContent.url,
            apiKey,
            gupshupConfiguration.gupshupMediaToken
          )
          if (!mediaUrl) {
            retryCount++
            console.warn(
              `🎵 [GUPSHUP ASYNC] Retry ${retryCount} for audio media URL`
            )
            await new Promise((res) => setTimeout(res, 1000 * retryCount))
          }
        }
        if (!mediaUrl) {
          console.error(
            "❌ [GUPSHUP ASYNC] No se pudo obtener la URL del audio desde Gupshup tras 3 intentos"
          )
          await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
            gupshupConfigurationId: gupshupConfiguration._id,
            to: contactPhoneNumber,
            message:
              "No se pudo obtener la URL del audio para procesar. Intenta reenviar el audio.",
          })
          return
        }
        console.log(
          `🎵 [GUPSHUP ASYNC] Processing audio (mediaId, tamaño no validado)`
        )
      }
      // Download and store audio
      const { storageId, url: audioUrl } = await downloadAndStoreMediaR2(
        ctx,
        mediaUrl,
        apiKey,
        mimeType,
        "gupshup"
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
        console.log("🎵 [GUPSHUP ASYNC] Audio transcribed successfully")
      } catch (error) {
        console.error("❌ [GUPSHUP ASYNC] Audio transcription failed:", error)
        transcription =
          "[Error al transcribir audio, no se pudo transcribir el audio]"
      }
      savedMessageId = await saveUserMessage(ctx, {
        type: "file",
        conversation: conversation,
        contact: contact,
        attachment: {
          dataUrl: audioUrl,
          mimeType: mimeType,
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
              mimeType: mimeType,
              storageId: storageId,
            },
          },
          whatsappTimestamp: timestampInSeconds,
        }
      )
      // Cancel timers
      await ctx.runMutation(
        internal.system.orderConfirmationScheduler
          .cancelOrderConfirmationTimers,
        { conversationId: conversation._id }
      )
      await ctx.runMutation(
        internal.system.inactivityScheduler.cancelInactivityTimerInternal,
        { conversationId: conversation._id }
      )
    }

    // Handle video messages
    if (messageType === "video" && messageContent.url) {
      const mimeType = messageContent.contentType || "video/mp4"
      let mediaUrl: string | null = null
      if (
        typeof messageContent.url === "string" &&
        messageContent.url.startsWith("http")
      ) {
        mediaUrl = messageContent.url
        console.log(
          "🎬 [GUPSHUP ASYNC] Usando URL directa de video del webhook:",
          mediaUrl
        )
        // Validar tamaño solo si es URL directa
        const videoSizeValidation = await validateGupshupFileSize(
          ctx,
          mediaUrl,
          mimeType,
          apiKey
        )
        if (!videoSizeValidation.isValid) {
          console.error(
            "🎬 [GUPSHUP ASYNC] Video size validation failed:",
            videoSizeValidation.errorMessage
          )
          try {
            await ctx.runAction(
              internal.system.whatsappDispatcher.sendMessage,
              {
                gupshupConfigurationId: gupshupConfiguration._id,
                to: contactPhoneNumber,
                message:
                  videoSizeValidation.errorMessage ||
                  "El video es demasiado grande para procesar.",
              }
            )
          } catch (error) {
            throw new ConvexError({
              code: "INTERNAL_SERVER_ERROR",
              message: `No se pudo enviar el mensaje de tamaño de video: ${error instanceof Error ? error.message : "Error desconocido"}`,
            })
          }
          return
        }
        console.log(
          `🎬 [GUPSHUP ASYNC] Processing video (${formatFileSize(videoSizeValidation.actualSize || 0)})`
        )
      } else {
        // Si no es URL directa, solo intenta obtener la media URL por mediaId (sin validar tamaño)
        let retryCount = 0
        while (retryCount < 3 && !mediaUrl) {
          mediaUrl = await getGupshupMediaUrl(
            messageContent.url,
            apiKey,
            gupshupConfiguration.gupshupMediaToken
          )
          if (!mediaUrl) {
            retryCount++
            console.warn(
              `🎬 [GUPSHUP ASYNC] Retry ${retryCount} for video media URL`
            )
            await new Promise((res) => setTimeout(res, 1000 * retryCount))
          }
        }
        if (!mediaUrl) {
          console.error(
            "❌ [GUPSHUP ASYNC] No se pudo obtener la URL del video desde Gupshup tras 3 intentos"
          )
          await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
            gupshupConfigurationId: gupshupConfiguration._id,
            to: contactPhoneNumber,
            message:
              "No se pudo obtener la URL del video para procesar. Intenta reenviar el video.",
          })
          return
        }
        console.log(
          `🎬 [GUPSHUP ASYNC] Processing video (mediaId, tamaño no validado)`
        )
      }
      // Download and store video
      const { storageId, url: videoUrl } = await downloadAndStoreMediaR2(
        ctx,
        mediaUrl,
        apiKey,
        mimeType,
        "gupshup"
      )
      if (!videoUrl) {
        throw new ConvexError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudieron obtener los datos del video",
        })
      }
      const videoCaption = messageContent.caption
        ? `${messageContent.caption}\n\n[Video recibido]`
        : `[Video recibido]`
      savedMessageId = await saveUserMessage(ctx, {
        type: "file",
        conversation: conversation,
        contact: contact,
        attachment: {
          dataUrl: videoUrl,
          mimeType: mimeType,
          caption: videoCaption,
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
          type: "video",
          content: {
            text: messageContent.caption,
            media: {
              url: videoUrl,
              mimeType: mimeType,
              caption: messageContent.caption,
              storageId: storageId,
            },
          },
          whatsappTimestamp: timestampInSeconds,
        }
      )
      // Cancel timers
      await ctx.runMutation(
        internal.system.orderConfirmationScheduler
          .cancelOrderConfirmationTimers,
        { conversationId: conversation._id }
      )
      await ctx.runMutation(
        internal.system.inactivityScheduler.cancelInactivityTimerInternal,
        { conversationId: conversation._id }
      )
    }

    // Handle document messages
    if (messageType === "file" && messageContent.url) {
      const mimeType = messageContent.contentType || "application/pdf"
      const filename = messageContent.filename || "documento"
      let mediaUrl: string | null = null
      if (
        typeof messageContent.url === "string" &&
        messageContent.url.startsWith("http")
      ) {
        mediaUrl = messageContent.url
        console.log(
          "📄 [GUPSHUP ASYNC] Usando URL directa de documento del webhook:",
          mediaUrl
        )
        // Validar tamaño solo si es URL directa
        const fileSizeValidation = await validateGupshupFileSize(
          ctx,
          mediaUrl,
          mimeType,
          apiKey
        )
        if (!fileSizeValidation.isValid) {
          console.error(
            "📄 [GUPSHUP ASYNC] File size validation failed:",
            fileSizeValidation.errorMessage
          )
          try {
            await ctx.runAction(
              internal.system.whatsappDispatcher.sendMessage,
              {
                gupshupConfigurationId: gupshupConfiguration._id,
                to: contactPhoneNumber,
                message:
                  fileSizeValidation.errorMessage ||
                  "El archivo es demasiado grande para procesar.",
              }
            )
          } catch (error) {
            throw new ConvexError({
              code: "INTERNAL_SERVER_ERROR",
              message: `No se pudo enviar el mensaje de tamaño de archivo: ${error instanceof Error ? error.message : "Error desconocido"}`,
            })
          }
          return
        }
        console.log(
          `📄 [GUPSHUP ASYNC] Processing document (${formatFileSize(fileSizeValidation.actualSize || 0)})`
        )
      } else {
        // Si no es URL directa, solo intenta obtener la media URL por mediaId (sin validar tamaño)
        let retryCount = 0
        while (retryCount < 3 && !mediaUrl) {
          mediaUrl = await getGupshupMediaUrl(
            messageContent.url,
            apiKey,
            gupshupConfiguration.gupshupMediaToken
          )
          if (!mediaUrl) {
            retryCount++
            console.warn(
              `📄 [GUPSHUP ASYNC] Retry ${retryCount} for document media URL`
            )
            await new Promise((res) => setTimeout(res, 1000 * retryCount))
          }
        }
        if (!mediaUrl) {
          console.error(
            "❌ [GUPSHUP ASYNC] No se pudo obtener la URL del documento desde Gupshup tras 3 intentos"
          )
          await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
            gupshupConfigurationId: gupshupConfiguration._id,
            to: contactPhoneNumber,
            message:
              "No se pudo obtener la URL del documento para procesar. Intenta reenviar el documento.",
          })
          return
        }
        console.log(
          `📄 [GUPSHUP ASYNC] Processing document (mediaId, tamaño no validado)`
        )
      }
      // Download and store document
      const { storageId, url: documentUrl } = await downloadAndStoreMediaR2(
        ctx,
        mediaUrl,
        apiKey,
        mimeType,
        "gupshup"
      )
      if (!documentUrl) {
        throw new ConvexError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudieron obtener los datos del documento",
        })
      }
      const documentCaption = messageContent.caption
        ? `${messageContent.caption}\n\n[Documento: ${filename}]`
        : `[Documento recibido: ${filename}]`
      savedMessageId = await saveUserMessage(ctx, {
        type: "file",
        conversation: conversation,
        contact: contact,
        attachment: {
          dataUrl: documentUrl,
          mimeType: mimeType,
          caption: documentCaption,
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
          type: "document",
          content: {
            text: messageContent.caption,
            media: {
              url: documentUrl,
              mimeType: mimeType,
              caption: messageContent.caption,
              filename: filename,
              storageId: storageId,
            },
          },
          whatsappTimestamp: timestampInSeconds,
        }
      )
      // Cancel timers
      await ctx.runMutation(
        internal.system.orderConfirmationScheduler
          .cancelOrderConfirmationTimers,
        { conversationId: conversation._id }
      )
      await ctx.runMutation(
        internal.system.inactivityScheduler.cancelInactivityTimerInternal,
        { conversationId: conversation._id }
      )
    }

    // Handle location messages
    if (messageType === "location" && messageContent) {
      const locationPayload = messageContent as unknown as {
        latitude: number
        longitude: number
        name?: string
        address?: string
      }
      const locationText = locationPayload.name
        ? `📍 Ubicación: ${locationPayload.name}${locationPayload.address ? ` - ${locationPayload.address}` : ""}\nCoordenadas: ${locationPayload.latitude}, ${locationPayload.longitude}`
        : `📍 Ubicación compartida\nCoordenadas: ${locationPayload.latitude}, ${locationPayload.longitude}`
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
              latitude: locationPayload.latitude,
              longitude: locationPayload.longitude,
              name: locationPayload.name,
              address: locationPayload.address,
            },
          },
          whatsappTimestamp: timestampInSeconds,
        }
      )
      // Cancel timers
      await ctx.runMutation(
        internal.system.orderConfirmationScheduler
          .cancelOrderConfirmationTimers,
        { conversationId: conversation._id }
      )
      await ctx.runMutation(
        internal.system.inactivityScheduler.cancelInactivityTimerInternal,
        { conversationId: conversation._id }
      )
    }

    // Trigger agent response if message was saved and conversation is unresolved
    if (savedMessageId && conversation.status === "unresolved") {
      console.log(
        "⏰ [GUPSHUP ASYNC] Scheduling agent response with 3 second debounce"
      )
      await ctx.runMutation(
        internal.system.responseDebounceScheduler.scheduleAgentResponse,
        {
          gupshupConfiguration: gupshupConfiguration,
          conversation: conversation,
          contact: contact,
          messageId: savedMessageId,
          whatsappMessageId: messageId, // Gupshup message ID for tracking
        }
      )
    } else if (conversation.status !== "unresolved") {
      console.log(
        `🚫 [GUPSHUP ASYNC] Conversation is ${conversation.status} - skipping response scheduling`
      )
    }

    console.log(`✅ [GUPSHUP ASYNC] Message processed: ${savedMessageId}`)
  },
})
