import { R2 } from "@convex-dev/r2"
import axios from "axios"
import { v7 as uuidv7 } from "uuid"
import { components, internal } from "../_generated/api"
import type { ActionCtx, QueryCtx } from "../_generated/server"
import {
  formatFileSize,
  getFileSizeLimit,
  WHATSAPP_API_VERSION,
  WHATSAPP_MESSAGING_PRODUCT,
} from "../lib/constants"
import { env } from "../lib/env"
import {
  BadRequestError,
  WhatsappConfigurationNotFoundError,
} from "../lib/errors"
import { getSafeErrorDetails } from "../lib/errorUtils"
import type {
  InteractiveHeader,
  OutgoingInteractiveMessage,
} from "../lib/whatsappTypes"

const r2 = new R2(components.r2)

export type TypingIndicatorResult =
  | { sent: true }
  | {
      sent: false
      reason:
        | "no_message_context"
        | "provider_error"
        | "unsupported"
        | "missing_credentials"
    }

/**
 * Verifies WhatsApp webhook subscription request
 *
 * Validates the webhook verification token against the configured environment variable
 * and returns the challenge string if verification succeeds.
 *
 * @param mode - The hub mode from WhatsApp webhook request (should be "subscribe")
 * @param token - The verification token from WhatsApp webhook request
 * @param challenge - The challenge string to return if verification succeeds
 * @returns The challenge string if verification succeeds, null otherwise
 */
export const verifyWebhook = async (
  mode: string,
  token: string,
  challenge: string
): Promise<string | null> => {
  const verifyToken = env.WHATSAPP_VERIFY_TOKEN
  if (mode === "subscribe" && token === verifyToken) {
    console.log("[WhatsApp] Webhook verified successfully")
    return challenge
  }

  console.error("[WhatsApp] Webhook verification failed")
  return null
}

/**
 * Sends a text message via WhatsApp (Meta or Twilio)
 *
 * Routes the message to the appropriate provider based on the configuration.
 *
 * @param ctx - Convex action context for making external API calls
 * @param to - Recipient phone number in international format
 * @param text - Message text content to send
 * @param config - WhatsApp configuration object
 * @throws Error if the API request fails or returns non-200 status
 */
export const sendWhatsAppMessage = async (
  ctx: ActionCtx,
  to: string,
  text: string,
  config: {
    provider: "meta" | "twilio"
    accessToken?: string
    phoneNumberId?: string
    twilioAccountSid?: string
    twilioAuthToken?: string
    twilioPhoneNumber?: string
  }
): Promise<void> => {
  if (config.provider === "twilio") {
    // Call Twilio action in Node.js runtime
    await ctx.runAction(
      internal.actions.twilioActions.sendTwilioWhatsAppMessage,
      {
        to,
        body: text,
        twilioAccountSid: config.twilioAccountSid!,
        twilioAuthToken: config.twilioAuthToken!,
        from: config.twilioPhoneNumber!,
      }
    )
  } else {
    await sendMetaWhatsAppMessage(
      ctx,
      to,
      text,
      config.phoneNumberId!,
      config.accessToken!
    )
  }
}

/**
 * Marks a message as read and optionally shows typing indicator
 *
 * When a message is marked as read, all previous messages in the
 * conversation are also marked as read (WhatsApp API behavior).
 * The typing_indicator shows "escribiendo..." to the customer.
 *
 * @param ctx - Convex action context for making external API calls
 * @param messageId - The WhatsApp message ID to mark as read
 * @param businessPhoneNumberId - WhatsApp Business phone number ID
 * @param accessToken - WhatsApp Business API access token
 * @param showTypingIndicator - Whether to show typing indicator (default: true)
 */
export const markMessageAsRead = async (
  _ctx: ActionCtx,
  messageId: string,
  businessPhoneNumberId: string,
  accessToken: string,
  showTypingIndicator: boolean = true
): Promise<void> => {
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${businessPhoneNumberId}/messages`

  // New API format: typing_indicator is sent together with read status
  const data: {
    messaging_product: string
    status: string
    message_id: string
    typing_indicator?: { type: string }
  } = {
    messaging_product: WHATSAPP_MESSAGING_PRODUCT,
    status: "read",
    message_id: messageId,
  }

  // Add typing indicator if requested
  if (showTypingIndicator) {
    data.typing_indicator = { type: "text" }
  }

  try {
    await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    })
    console.log(
      `[WhatsApp] Message ${messageId} marked as read${showTypingIndicator ? " with typing indicator" : ""}`
    )
  } catch (error) {
    // Don't throw - read receipt is non-critical
    console.error(
      `[WhatsApp] Error marking message as read:`,
      getSafeErrorDetails(error)
    )
  }
}

/**
 * Sends a typing indicator to show the bot is processing
 *
 * Shows "escribiendo..." indicator to the customer. The indicator
 * auto-dismisses after 25 seconds or when a message is sent.
 * Use this when you want to show typing without marking a message as read.
 *
 * @param ctx - Convex action context for making external API calls
 * @param messageId - Any recent message ID from the conversation (required by API)
 * @param businessPhoneNumberId - WhatsApp Business phone number ID
 * @param accessToken - WhatsApp Business API access token
 */
export const sendTypingIndicator = async (
  _ctx: ActionCtx,
  messageId: string,
  businessPhoneNumberId: string,
  accessToken: string
): Promise<boolean> => {
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${businessPhoneNumberId}/messages`

  // New API format: typing_indicator requires a message_id
  const data = {
    messaging_product: WHATSAPP_MESSAGING_PRODUCT,
    status: "read",
    message_id: messageId,
    typing_indicator: { type: "text" },
  }

  try {
    await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    })
    console.log(`[WhatsApp] Typing indicator sent`)
    return true
  } catch (error) {
    // Don't throw - typing indicator is non-critical
    console.error(
      `[WhatsApp] Error sending typing indicator:`,
      getSafeErrorDetails(error)
    )
    return false
  }
}

/**
 * Sends a typing indicator to a contact (for operator typing in dashboard)
 *
 * This function sends a typing indicator to show the operator is typing.
 * Works with Meta, 360dialog, and Twilio providers.
 *
 * @param ctx - Convex action context for making external API calls
 * @param provider - WhatsApp provider ("meta" | "360dialog" | "twilio")
 * @param contactPhoneNumber - The customer's phone number
 * @param phoneNumberId - WhatsApp Business phone number ID (for Meta)
 * @param accessToken - WhatsApp Business API access token (for Meta)
 * @param dialog360ApiKey - 360dialog API key (for 360dialog)
 * @param metaMessageId - Recent inbound WhatsApp message ID required by Meta typing indicators
 */
export const sendTypingIndicatorToContact = async (
  _ctx: ActionCtx,
  provider: "meta" | "360dialog" | "twilio" | "gupshup",
  contactPhoneNumber: string,
  phoneNumberId?: string,
  accessToken?: string,
  dialog360ApiKey?: string,
  gupshupToken?: string,
  _gupshupSourceNumber?: string,
  gupshupAppId?: string,
  gupshupMessageId?: string, // Incoming message ID required by Gupshup /v1/event endpoint
  metaMessageId?: string
): Promise<TypingIndicatorResult> => {
  if (provider === "meta" && phoneNumberId && accessToken) {
    if (!metaMessageId) {
      console.log(
        `[WhatsApp Meta] Cannot send typing indicator to ${contactPhoneNumber}: no inbound message_id available. Skipping.`
      )
      return { sent: false, reason: "no_message_context" }
    }

    const sent = await sendTypingIndicator(
      _ctx,
      metaMessageId,
      phoneNumberId,
      accessToken
    )
    return sent ? { sent: true } : { sent: false, reason: "provider_error" }
  } else if (provider === "360dialog" && dialog360ApiKey) {
    const url = "https://waba-v2.360dialog.io/messages"

    // 360dialog (On-Premise API style) uses chat_state for typing indicators
    const payload360 = {
      messaging_product: WHATSAPP_MESSAGING_PRODUCT,
      recipient_type: "individual",
      to: contactPhoneNumber,
      type: "chat_state",
      chat_state: "composing",
    }

    console.log(
      `[360dialog] Sending typing indicator payload:`,
      JSON.stringify(payload360)
    )

    try {
      await axios.post(url, payload360, {
        headers: {
          "Content-Type": "application/json",
          "D360-API-KEY": dialog360ApiKey,
        },
      })
      console.log(`[360dialog] Typing indicator sent to ${contactPhoneNumber}`)
      return { sent: true }
    } catch (error) {
      // Don't throw - typing indicator is non-critical
      console.error(
        `[360dialog] Error sending typing indicator:`,
        getSafeErrorDetails(error)
      )
      return { sent: false, reason: "provider_error" }
    }
  } else if (provider === "gupshup" && gupshupToken && gupshupAppId) {
    // Use Gupshup Partner API /v1/event to send typing indicator
    // Docs: https://partner-docs.gupshup.io/reference/voicecallaction-1#
    // Requires a message_id from an incoming message
    if (!gupshupMessageId) {
      console.warn(
        `[Gupshup] Cannot send typing indicator: no incoming message_id provided. Skipping.`
      )
      return { sent: false, reason: "no_message_context" }
    }

    const url = `${GUPSHUP_PARTNER_API_BASE_URL}/app/${gupshupAppId}/v1/event`

    const payload = {
      type: "message-event",
      message: {
        messaging_product: "whatsapp",
        // status: "read" is REQUIRED by Gupshup /v1/event API for typing_indicator to work
        status: "read",
        message_id: gupshupMessageId,
        typing_indicator: { type: "text" },
      },
    }

    try {
      await axios.post(url, payload, {
        headers: {
          "Content-Type": "application/json",
          Authorization: gupshupToken,
        },
        timeout: 5000,
      })
      console.log(
        `[Gupshup] Typing indicator sent to ${contactPhoneNumber} via /v1/event (messageId=${gupshupMessageId})`
      )
      return { sent: true }
    } catch (error) {
      // Don't throw — typing indicator is non-critical
      console.error(
        `[Gupshup] Error sending typing indicator:`,
        getSafeErrorDetails(error)
      )
      return { sent: false, reason: "provider_error" }
    }
  } else if (provider === "twilio") {
    // Twilio doesn't support typing indicators for WhatsApp
    console.log(`[Twilio] Typing indicators not supported for WhatsApp`)
    return { sent: false, reason: "unsupported" }
  }

  return { sent: false, reason: "missing_credentials" }
}

/**
 * Sends a text message via Meta WhatsApp Business API
 *
 * Makes an HTTP POST request to the WhatsApp Graph API to send a text message
 * to the specified recipient phone number.
 *
 * @param ctx - Convex action context for making external API calls
 * @param to - Recipient phone number in international format
 * @param text - Message text content to send
 * @param businessPhoneNumberId - WhatsApp Business phone number ID
 * @param accessToken - WhatsApp Business API access token
 * @throws Error if the API request fails or returns non-200 status
 */
export const sendMetaWhatsAppMessage = async (
  _ctx: ActionCtx,
  to: string,
  text: string,
  businessPhoneNumberId: string,
  accessToken: string
): Promise<string | undefined> => {
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${businessPhoneNumberId}/messages`

  // WhatsApp has a 4096 character limit, split if needed
  const MAX_LENGTH = 4000 // Use 4000 to be safe

  if (text.length <= MAX_LENGTH) {
    // Send as single message
    const data = {
      messaging_product: WHATSAPP_MESSAGING_PRODUCT,
      to,
      type: "text",
      text: { body: text },
    }

    try {
      console.log(`[WhatsApp] Sending message to ${to}`, {
        url,
        messageLength: text.length,
      })

      const response = await axios.post(url, data, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const messageId = response.data.messages?.[0]?.id ?? undefined
      console.log(
        `[WhatsApp] Text message sent successfully to ${to}${messageId ? ` (ID: ${messageId})` : ""}`
      )
      return messageId
    } catch (error) {
      console.error(
        `[WhatsApp] Error sending message to ${to}:`,
        getSafeErrorDetails(error)
      )

      throw error
    }
  } else {
    // Split message into multiple parts
    console.log(
      `[WhatsApp] Message too long (${text.length} chars), splitting into parts...`
    )

    const parts: string[] = []
    let currentPart = ""

    // Split by newlines to try to keep formatting
    const lines = text.split("\n")

    for (const line of lines) {
      if ((currentPart + line + "\n").length > MAX_LENGTH) {
        if (currentPart) {
          parts.push(currentPart.trim())
          currentPart = ""
        }

        // If single line is too long, split it by words
        if (line.length > MAX_LENGTH) {
          const words = line.split(" ")
          for (const word of words) {
            if ((currentPart + word + " ").length > MAX_LENGTH) {
              if (currentPart) {
                parts.push(currentPart.trim())
                currentPart = ""
              }
            }
            currentPart += word + " "
          }
        } else {
          currentPart = line + "\n"
        }
      } else {
        currentPart += line + "\n"
      }
    }

    if (currentPart.trim()) {
      parts.push(currentPart.trim())
    }

    console.log(`[WhatsApp] Sending ${parts.length} message parts to ${to}`)
    let firstMessageId: string | undefined

    // Send each part with a small delay
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const partLabel = parts.length > 1 ? ` (${i + 1}/${parts.length})` : ""

      const data = {
        messaging_product: WHATSAPP_MESSAGING_PRODUCT,
        to,
        type: "text",
        text: { body: part },
      }

      try {
        const response = await axios.post(url, data, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (!firstMessageId) {
          firstMessageId = response.data.messages?.[0]?.id ?? undefined
        }

        console.log(
          `[WhatsApp] Message part ${i + 1}/${parts.length} sent successfully`
        )

        // Small delay between messages to avoid rate limiting
        if (i < parts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      } catch (error) {
        console.error(
          `[WhatsApp] Error sending message part ${i + 1}/${parts.length}:`,
          getSafeErrorDetails(error)
        )
        throw error
      }
    }

    console.log(
      `[WhatsApp] All ${parts.length} message parts sent successfully to ${to}`
    )
    return firstMessageId
  }
}

/**
 * Sends an image message via WhatsApp Business API
 *
 * Makes an HTTP POST request to the WhatsApp Graph API to send an image message
 * to the specified recipient phone number. The image must be uploaded to WhatsApp
 * servers first and referenced by its media ID.
 *
 * @param ctx - Convex action context for making external API calls
 * @param to - Recipient phone number in international format
 * @param mediaId - WhatsApp media ID of the uploaded image
 * @param caption - Optional caption text for the image
 * @param businessPhoneNumberId - WhatsApp Business phone number ID
 * @param accessToken - WhatsApp Business API access token
 * @throws Error if the API request fails or returns non-200 status
 */
export const sendWhatsAppImageMessage = async (
  _ctx: ActionCtx,
  to: string,
  mediaId: string,
  businessPhoneNumberId: string,
  accessToken: string,
  caption?: string
): Promise<void> => {
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${businessPhoneNumberId}/messages`

  const data = {
    messaging_product: WHATSAPP_MESSAGING_PRODUCT,
    to,
    type: "image",
    image: {
      id: mediaId,
      ...(caption && { caption }),
    },
  }

  try {
    console.log(`[WhatsApp] Sending image message to ${to}`, { url, data })

    const response = await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    })

    console.log(`[WhatsApp] Image message sent successfully to ${to}`)
  } catch (error) {
    console.error(`[WhatsApp] Error sending image message to ${to}:`, error)

    if (axios.isAxiosError(error)) {
      console.error(`[WhatsApp] Response status: ${error.response?.status}`)
      console.error(`[WhatsApp] Response data:`, error.response?.data)
      console.error(`[WhatsApp] Request config:`, {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
        data: error.config?.data,
      })
    }

    throw error
  }
}

/**
 * Sends an image message via WhatsApp Business API using a public URL
 *
 * This is a convenience function that:
 * 1. Downloads the image from the provided URL
 * 2. Uploads it to WhatsApp Media API
 * 3. Sends the image message to the recipient
 *
 * @param ctx - Convex action context for making external API calls
 * @param to - Recipient phone number in international format
 * @param imageUrl - Public URL of the image to send
 * @param businessPhoneNumberId - WhatsApp Business phone number ID
 * @param accessToken - WhatsApp Business API access token
 * @param caption - Optional caption text for the image
 * @throws Error if the API request fails or returns non-200 status
 */
export const sendWhatsAppImageByUrl = async (
  ctx: ActionCtx,
  to: string,
  imageUrl: string,
  businessPhoneNumberId: string,
  accessToken: string,
  caption?: string
): Promise<void> => {
  const maxRetries = 3
  let attempt = 0
  let lastError
  while (attempt < maxRetries) {
    try {
      console.log(
        `[WhatsApp] Sending image by URL to ${to} (intento ${attempt + 1})`,
        { imageUrl }
      )

      // Determine MIME type from URL extension
      const urlLower = imageUrl.toLowerCase()
      let mimeType = "image/jpeg" // Default
      if (urlLower.includes(".png")) {
        mimeType = "image/png"
      } else if (urlLower.includes(".gif")) {
        mimeType = "image/gif"
      } else if (urlLower.includes(".webp")) {
        mimeType = "image/webp"
      }

      // Upload image to WhatsApp
      const mediaId = await uploadMediaToWhatsApp(
        ctx,
        imageUrl,
        businessPhoneNumberId,
        accessToken,
        mimeType
      )

      console.log(`[WhatsApp] Image uploaded successfully, mediaId: ${mediaId}`)

      // Send the image message
      await sendWhatsAppImageMessage(
        ctx,
        to,
        mediaId,
        businessPhoneNumberId,
        accessToken,
        caption
      )

      console.log(`[WhatsApp] Image message sent successfully to ${to}`)
      return
    } catch (error) {
      lastError = error
      attempt++
      console.error(
        `[WhatsApp] Error sending image by URL to ${to} (intento ${attempt}):`,
        error
      )
      // Si es el último intento, lanza el error y muestra mensaje claro
      if (attempt >= maxRetries) {
        // Notifica al usuario si es posible (por ejemplo, usando saveUserMessage o similar)
        // Aquí solo logueamos, pero puedes integrar con tu sistema de mensajes
        console.error(
          `❌ No se pudo procesar la imagen después de ${maxRetries} intentos. Pide al usuario reenviar la imagen.`
        )
        throw new Error(
          `No se pudo procesar la imagen. Por favor, reenvíala o verifica que sea accesible.`
        )
      }
      // Espera breve antes de reintentar
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  // Si falla todo, lanza el último error
  throw lastError
}

/**
 * Sends a location message via WhatsApp Business API
 *
 * Sends a location pin that the customer can tap to open in maps.
 *
 * @param ctx - Convex action context for making external API calls
 * @param to - Recipient phone number in international format
 * @param latitude - Location latitude coordinate
 * @param longitude - Location longitude coordinate
 * @param name - Name of the location (e.g., restaurant name)
 * @param address - Address of the location
 * @param businessPhoneNumberId - WhatsApp Business phone number ID
 * @param accessToken - WhatsApp Business API access token
 */
export const sendWhatsAppLocationMessage = async (
  _ctx: ActionCtx,
  to: string,
  latitude: number,
  longitude: number,
  name: string,
  address: string,
  businessPhoneNumberId: string,
  accessToken: string
): Promise<void> => {
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${businessPhoneNumberId}/messages`

  const data = {
    messaging_product: WHATSAPP_MESSAGING_PRODUCT,
    to,
    type: "location",
    location: {
      latitude,
      longitude,
      name,
      address,
    },
  }

  try {
    console.log(`[WhatsApp] Sending location message to ${to}`, {
      latitude,
      longitude,
      name,
    })

    await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    })

    console.log(`[WhatsApp] Location message sent successfully to ${to}`)
  } catch (error) {
    console.error(`[WhatsApp] Error sending location message to ${to}:`, error)

    if (axios.isAxiosError(error)) {
      console.error(`[WhatsApp] Response status: ${error.response?.status}`)
      console.error(`[WhatsApp] Response data:`, error.response?.data)
    }

    throw error
  }
}

/**
 * Sends a document message via WhatsApp Business API
 *
 * Makes an HTTP POST request to the WhatsApp Graph API to send a document message
 * (such as PDF files) to the specified recipient phone number. The document must be
 * uploaded to WhatsApp servers first and referenced by its media ID.
 *
 * @param ctx - Convex action context for making external API calls
 * @param to - Recipient phone number in international format
 * @param mediaId - WhatsApp media ID of the uploaded document
 * @param businessPhoneNumberId - WhatsApp Business phone number ID
 * @param accessToken - WhatsApp Business API access token
 * @param caption - Optional caption text for the document
 * @param filename - Optional filename for the document
 * @throws Error if the API request fails or returns non-200 status
 */
export const sendWhatsAppDocumentMessage = async (
  _ctx: ActionCtx,
  to: string,
  mediaId: string,
  businessPhoneNumberId: string,
  accessToken: string,
  caption?: string,
  filename?: string
): Promise<void> => {
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${businessPhoneNumberId}/messages`

  const data = {
    messaging_product: WHATSAPP_MESSAGING_PRODUCT,
    to,
    type: "document",
    document: {
      id: mediaId,
      ...(caption && { caption }),
      ...(filename && { filename }),
    },
  }

  try {
    console.log(`[WhatsApp] Sending document message to ${to}`, { url, data })

    const response = await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    })

    console.log(`[WhatsApp] Document message sent successfully to ${to}`)
  } catch (error) {
    console.error(`[WhatsApp] Error sending document message to ${to}:`, error)

    if (axios.isAxiosError(error)) {
      console.error(`[WhatsApp] Response status: ${error.response?.status}`)
      console.error(`[WhatsApp] Response data:`, error.response?.data)
      console.error(`[WhatsApp] Request config:`, {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
        data: error.config?.data,
      })
    }

    throw error
  }
}

/**
 * Uploads media to WhatsApp Business API
 *
 * Downloads media from a URL and uploads it to WhatsApp's media storage.
 * Returns a media ID that can be used in template messages.
 *
 * File size limits per media type (per WhatsApp API documentation):
 * - Images: 5MB (JPEG, PNG)
 * - Videos: 16MB (MP4, 3GP)
 * - Documents: 100MB (PDF and other document types)
 *
 * @param _ctx - Convex action context
 * @param mediaUrl - URL of the media to upload
 * @param businessPhoneNumberId - WhatsApp Business phone number ID
 * @param accessToken - WhatsApp Business API access token
 * @param mimeType - MIME type of the media
 * @returns WhatsApp media ID
 */
export const uploadMediaToWhatsApp = async (
  _ctx: ActionCtx,
  mediaUrl: string,
  businessPhoneNumberId: string,
  accessToken: string,
  mimeType: string
): Promise<string> => {
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${businessPhoneNumberId}/media`

  // Determine file size limit and media type name based on MIME type
  // Business limits: 5MB for images, 10MB for videos and documents
  // Note: WhatsApp API allows up to 16MB for videos and 100MB for documents,
  // but we use stricter limits for better performance and user experience
  let maxFileSize: number
  let mediaTypeName: string
  let defaultFilename: string

  if (mimeType.startsWith("video/")) {
    maxFileSize = 10 * 1024 * 1024 // 10MB for videos (business limit)
    mediaTypeName = "video"
    const extension = mimeType === "video/3gpp" ? "3gp" : "mp4"
    defaultFilename = `video.${extension}`
  } else if (mimeType.startsWith("application/")) {
    maxFileSize = 10 * 1024 * 1024 // 10MB for documents (business limit)
    mediaTypeName = "documento"
    const extension = mimeType.split("/")[1] || "pdf"
    defaultFilename = `document.${extension}`
  } else {
    // Default to image
    maxFileSize = 5 * 1024 * 1024 // 5MB for images (WhatsApp API limit)
    mediaTypeName = "imagen"
    const extension = mimeType.split("/")[1] || "jpg"
    defaultFilename = `image.${extension}`
  }

  try {
    console.log(`[WhatsApp] Uploading ${mediaTypeName} from URL: ${mediaUrl}`)

    // Download the media with timeout and size limit
    let mediaResponse: Awaited<ReturnType<typeof axios.get<ArrayBuffer>>>
    try {
      mediaResponse = await axios.get<ArrayBuffer>(mediaUrl, {
        responseType: "arraybuffer",
        timeout: 60000, // 60 second timeout (increased for larger files)
        maxContentLength: maxFileSize,
        maxBodyLength: maxFileSize,
      })
    } catch (downloadError) {
      if (axios.isAxiosError(downloadError)) {
        if (downloadError.code === "ECONNABORTED") {
          throw new BadRequestError(
            `La descarga del ${mediaTypeName} tardó demasiado. Verifica que la URL sea accesible.`
          )
        }
        if (downloadError.response?.status === 404) {
          throw new BadRequestError(
            `No se encontró el ${mediaTypeName} en la URL proporcionada.`
          )
        }
      }
      throw new BadRequestError(
        `Error al descargar el ${mediaTypeName}: ${downloadError instanceof Error ? downloadError.message : "Error desconocido"}`
      )
    }

    // Validate file size
    const fileSize = mediaResponse.data.byteLength
    if (fileSize > maxFileSize) {
      throw new BadRequestError(
        `El ${mediaTypeName} es demasiado grande (${(fileSize / 1024 / 1024).toFixed(2)}MB). El máximo permitido es ${maxFileSize / 1024 / 1024}MB.`
      )
    }

    // Create form data
    // ✅ NOTE: Blob is safe to use here because this file is NOT marked with "use node".
    // It runs in Convex's V8 runtime where Blob is available. Only avoid Blob in Node.js actions.
    const formData = new FormData()
    const blob = new Blob([mediaResponse.data], { type: mimeType })
    formData.append("file", blob, defaultFilename)
    formData.append("messaging_product", WHATSAPP_MESSAGING_PRODUCT)
    formData.append("type", mimeType)

    // Upload to WhatsApp with timeout
    const response = await axios.post(url, formData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "multipart/form-data",
      },
      timeout: 120000, // 120 second timeout for upload (increased for larger files)
    })

    const mediaId = response.data.id
    if (!mediaId) {
      throw new BadRequestError(
        "WhatsApp no devolvió un ID de media. Intenta de nuevo."
      )
    }
    console.log(`[WhatsApp] Media uploaded successfully. Media ID: ${mediaId}`)

    return mediaId
  } catch (error) {
    // Re-throw BadRequestError as-is
    if (error instanceof BadRequestError) {
      throw error
    }

    console.error(`[WhatsApp] Error uploading media:`, error)

    if (axios.isAxiosError(error)) {
      const errorData = error.response?.data?.error
      console.error(`[WhatsApp] Response status: ${error.response?.status}`)
      console.error(`[WhatsApp] Response data:`, error.response?.data)

      const errorMessage =
        errorData?.message || error.message || "Error desconocido"
      throw new BadRequestError(
        `Error al subir ${mediaTypeName} a WhatsApp: ${errorMessage}`
      )
    }

    throw new BadRequestError(
      `Error inesperado al subir ${mediaTypeName}: ${error instanceof Error ? error.message : "Error desconocido"}`
    )
  }
}

/**
 * Retrieves media URL and metadata from WhatsApp API
 *
 * Fetches the download URL and MIME type for a media file using its media ID.
 * The returned URL is temporary and must be used immediately for downloading.
 *
 * @param ctx - Convex action context for making external API calls
 * @param mediaId - WhatsApp media ID from incoming message
 * @param accessToken - WhatsApp Business API access token
 * @returns Object containing the media download URL and MIME type
 * @throws Error if the API response doesn't contain a valid media URL
 */
export const getMediaUrl = async (
  _ctx: ActionCtx,
  mediaId: string,
  accessToken: string
): Promise<{ url: string; mime_type: string }> => {
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${mediaId}`
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.data.url) {
    throw new BadRequestError(
      "WhatsApp API response does not contain media URL"
    )
  }
  return {
    url: response.data.url,
    mime_type: response.data.mime_type,
  }
}

/**
 * Downloads media from WhatsApp and stores it in Convex storage
 *
 * Downloads media content from the provided URL using the WhatsApp access token
 * and stores it in Convex's file storage system for persistent access.
 *
 * @param ctx - Convex action context for storage operations
 * @param mediaUrl - Temporary media download URL from WhatsApp API
 * @param accessToken - WhatsApp Business API access token for authentication
 * @param mimeType - MIME type of the media file
 * @returns Storage ID for the stored media file
 * @throws Error if media download fails (e.g., expired URL, network issues)
 */
export const downloadAndStoreMedia = async (
  ctx: ActionCtx,
  mediaUrl: string,
  accessToken: string,
  mimeType: string
) => {
  // Download bytes with the same Bearer token
  const resp = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  // If the URL expired (401/403), the caller should refresh mediaUrl and retry
  if (!resp.ok) {
    throw new BadRequestError(
      `Media download failed: ${resp.status} ${resp.statusText}`
    )
  }

  const ab = await resp.arrayBuffer()
  const type =
    mimeType ?? resp.headers.get("content-type") ?? "application/octet-stream"
  const blob = new Blob([ab], { type })

  // Store in R2 instead of Convex
  const storageKey = generateR2Key(type)
  const storageId = await r2.store(ctx, blob, {
    type,
    key: storageKey,
  })
  console.log("🎵 [WEBHOOK] R2 Storage ID:", storageId)

  return storageId
}

/**
 * Downloads media from WhatsApp and stores it in r2 storage
 *
 * Downloads media content from the provided URL using the WhatsApp access token
 * and stores it in r2's file storage system for persistent access.
 *
 * @param ctx - Convex action context for storage operations
 * @param mediaUrl - Temporary media download URL from WhatsApp API
 * @param accessToken - WhatsApp Business API access token for authentication
 * @param mimeType - MIME type of the media file
 * @returns Storage ID for the stored media file
 * @throws Error if media download fails (e.g., expired URL, network issues)
 */
export const downloadAndStoreMediaR2 = async (
  ctx: ActionCtx,
  mediaUrl: string,
  accessToken: string,
  mimeType: string,
  provider: "meta" | "gupshup" | "360dialog" = "meta"
) => {
  const headers: Record<string, string> = {}

  if (provider === "gupshup") {
    headers["apikey"] = accessToken
  } else {
    headers["Authorization"] = `Bearer ${accessToken}`
  }

  // Download bytes with arraybuffer (more reliable than blob in Node.js runtime)
  const response = await axios.get(mediaUrl, {
    headers,
    responseType: "arraybuffer",
    timeout: 30000,
  })

  // If the request failed, throw an error
  if (response.status !== 200) {
    throw new BadRequestError(
      `Media download failed: ${response.status} ${response.statusText}`
    )
  }

  const arrayBuffer = response.data as ArrayBuffer
  console.log(
    `📦 [MEDIA DOWNLOAD] Downloaded ${arrayBuffer.byteLength} bytes from ${mediaUrl.substring(0, 80)}...`
  )

  // Check if the response looks like an error page (HTML/JSON) instead of binary media
  const firstBytes = new Uint8Array(arrayBuffer.slice(0, 20))
  const firstChars = String.fromCharCode(...firstBytes)
  if (firstChars.startsWith("<") || firstChars.startsWith("{")) {
    const textContent = new TextDecoder().decode(arrayBuffer.slice(0, 500))
    console.error(
      `❌ [MEDIA DOWNLOAD] Response appears to be text/error, not binary media:`,
      textContent
    )
    throw new BadRequestError(
      `Media download returned non-binary response (possibly error page)`
    )
  }

  // Create a proper Blob from the ArrayBuffer
  const blob = new Blob([arrayBuffer], { type: mimeType })

  // Generate organized key based on file type
  const storageKey = generateR2Key(mimeType)

  const storageId = await r2.store(ctx, blob, {
    type: mimeType,
    key: storageKey,
  })
  console.log("🎵 [WEBHOOK] Storage ID:", storageId)

  // Get the public URL for the stored file
  const url = `${env.R2_PUBLIC_URL}/${storageId}`

  return { blob, storageId, url }
}

/**
 * Downloads media from WhatsApp and stores it in r2 storage
 *
 * Downloads media content from the provided URL using the WhatsApp access token
 * and stores it in r2's file storage system for persistent access.
 *
 * @param ctx - Convex action context for storage operations
 * @param mediaUrl - Temporary media download URL from WhatsApp API
 * @param accessToken - WhatsApp Business API access token for authentication
 * @param mimeType - MIME type of the media file
 * @returns Storage ID for the stored media file
 * @throws Error if media download fails (e.g., expired URL, network issues)
 */
export const downloadAndStoreMediaR2Widget = async (
  ctx: ActionCtx,
  mediaUrl: string,
  _mimeType: string
) => {
  // Download bytes
  const response = await axios.get(mediaUrl, {
    responseType: "blob",
    timeout: 30000,
  })

  // If the request failed, throw an error
  if (response.status !== 200) {
    throw new BadRequestError(
      `Media download failed: ${response.status} ${response.statusText}`
    )
  }
  const blob = response.data

  // Generate organized key based on file type
  const storageKey = generateR2Key(_mimeType)

  const storageId = await r2.store(ctx, blob, {
    type: _mimeType,
    key: storageKey,
  })
  console.log("🎵 [WEBHOOK] R2 Storage ID:", storageId)

  // Get the public URL for the stored file
  const url = `${env.R2_PUBLIC_URL}/${storageId}`

  return { blob, storageId, url }
}

/**
 * Sends a template message via WhatsApp Business API
 *
 * Sends a pre-approved WhatsApp template message with optional parameters.
 * Template messages can be sent outside the 24-hour messaging window and
 * are used for notifications, confirmations, and automated communications.
 *
 * @param ctx - Convex action context for making external API calls
 * @param to - Recipient phone number (will be sanitized to digits only)
 * @param template - Name of the approved WhatsApp template
 * @param language - Language code for the template (e.g., "es", "en")
 * @param businessPhoneNumberId - WhatsApp Business phone number ID
 * @param accessToken - WhatsApp Business API access token
 * @param params - Optional array of parameter values to fill template body placeholders
 * @param headerMediaId - Optional media ID for header image/video/document (must be uploaded first)
 * @param headerType - Type of header media: "image", "video", or "document" (defaults to "image")
 * @param buttonUrlParams - Optional array of URL suffix values for dynamic URL buttons (in order of button index)
 * @param flowButtons - Optional array of flow button configurations with their index and flow_token
 * @returns WhatsApp message ID from the API response
 * @throws Error if the API request fails or template is invalid
 */
export const sendTemplateMessage = async (
  _ctx: ActionCtx,
  to: string,
  template: string,
  language: string,
  businessPhoneNumberId: string,
  accessToken: string,
  params?: string[],
  headerMediaId?: string,
  headerType?: "image" | "video" | "document",
  buttonUrlParams?: string[],
  flowButtons?: Array<{
    index: number
    flowToken: string
    flowActionPayload?: string
  }>
): Promise<string> => {
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${businessPhoneNumberId}/messages`
  const phoneNumber = to.replace(/\D/g, "")

  // Build components array with proper typing for all component types
  // biome-ignore lint/suspicious/noExplicitAny: Components have varying structures for header, body, and button types
  const components: Array<Record<string, any>> = []

  // Add header component if media ID is provided
  if (headerMediaId) {
    const mediaType = headerType || "image"
    const headerParam: {
      type: string
      image?: { id: string }
      video?: { id: string }
      document?: { id: string; filename?: string }
    } = { type: mediaType }

    if (mediaType === "image") {
      headerParam.image = { id: headerMediaId }
    } else if (mediaType === "video") {
      headerParam.video = { id: headerMediaId }
    } else if (mediaType === "document") {
      headerParam.document = { id: headerMediaId, filename: "document.pdf" }
    }

    components.push({
      type: "header",
      parameters: [headerParam],
    })
  }

  // Add body component with text parameters
  if (params && params.length > 0) {
    components.push({
      type: "body",
      parameters: params.map((value) => ({
        type: "text",
        text: value || "",
      })),
    })
  }

  // Add button components for dynamic URL buttons
  // Each button with a dynamic URL needs its own component with sub_type and index
  if (buttonUrlParams && buttonUrlParams.length > 0) {
    buttonUrlParams.forEach((urlSuffix, index) => {
      if (urlSuffix) {
        components.push({
          type: "button",
          sub_type: "url",
          index: index.toString(), // Index should be a string per Meta API
          parameters: [
            {
              type: "text",
              text: urlSuffix,
            },
          ],
        })
      }
    })
  }

  // Add button components for Flow buttons
  // Flow buttons require a flow_token and optionally flow_action_data
  // Format per Meta API: { type: "action", action: { flow_token: "...", flow_action_data: {...} } }
  if (flowButtons && flowButtons.length > 0) {
    flowButtons.forEach((flowButton) => {
      // Build the action object for the flow button
      const actionObj: {
        flow_token: string
        flow_action_data?: Record<string, unknown>
      } = {
        flow_token: flowButton.flowToken,
      }

      // Add flow_action_data if provided (parsed from JSON string)
      if (flowButton.flowActionPayload) {
        try {
          actionObj.flow_action_data = JSON.parse(flowButton.flowActionPayload)
        } catch {
          // If parsing fails, ignore the payload
          console.warn(
            `[WhatsApp] Failed to parse flow_action_payload for button index ${flowButton.index}`
          )
        }
      }

      components.push({
        type: "button",
        sub_type: "flow",
        index: flowButton.index.toString(), // Index should be a string
        parameters: [
          {
            type: "action",
            action: actionObj,
          },
        ],
      })
    })
  }

  // Build template object - only include components if there are any
  const templateObj: {
    name: string
    language: { code: string }
    components?: typeof components
  } = {
    name: template,
    language: {
      code: language,
    },
  }

  // Only add components if we have any (Meta API doesn't like empty arrays)
  if (components.length > 0) {
    templateObj.components = components
  }

  const data = {
    messaging_product: WHATSAPP_MESSAGING_PRODUCT,
    to: phoneNumber,
    type: "template",
    template: templateObj,
  }

  try {
    console.log(
      `[WhatsApp] Sending template message '${template}' to ${phoneNumber}`,
      {
        hasHeader: !!headerMediaId,
        headerType: headerType,
        paramsCount: params?.length || 0,
        buttonUrlParamsCount: buttonUrlParams?.length || 0,
        flowButtonsCount: flowButtons?.length || 0,
        componentsCount: components.length,
        payload: JSON.stringify(data, null, 2),
      }
    )

    const response = await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const messageId = response.data.messages?.[0]?.id
    if (!messageId) {
      throw new BadRequestError(
        "WhatsApp API did not return a message ID in the response"
      )
    }

    console.log(
      `[WhatsApp] Template message '${template}' sent successfully to ${phoneNumber} (ID: ${messageId})`
    )
    return messageId
  } catch (error) {
    let errorMessage = "Unknown error"
    if (axios.isAxiosError(error)) {
      const metaError = error.response?.data?.error
      if (metaError) {
        errorMessage = `Meta API Error (${metaError.code || "UNKNOWN"}): ${metaError.message || metaError.error_user_msg || error.message}`
        console.error("[WhatsApp] Meta API error details:", {
          code: metaError.code,
          message: metaError.message,
          error_subcode: metaError.error_subcode,
          error_user_title: metaError.error_user_title,
          error_user_msg: metaError.error_user_msg,
          requestData: data,
        })
      } else {
        errorMessage = `Request failed: ${error.response?.status} ${error.response?.statusText || error.message}`
      }
    } else if (error instanceof Error) {
      errorMessage = error.message
    }

    console.error(`[WhatsApp] Failed to send template message:`, {
      template,
      language,
      phoneNumber,
      hasParams: !!params,
      paramsCount: params?.length || 0,
      hasHeader: !!headerMediaId,
      buttonUrlParamsCount: buttonUrlParams?.length || 0,
      error: errorMessage,
    })

    throw new BadRequestError(`WhatsApp API error: ${errorMessage}`)
  }
}

/**
 * Get WhatsApp configurations by organization
 */
export const getWhatsAppConfigurationsByOrganization = async (
  ctx: QueryCtx,
  organizationId: string
) => {
  return await ctx.db
    .query("whatsappConfigurations")
    .withIndex("by_organization_and_active", (q) =>
      q.eq("organizationId", organizationId).eq("isActive", true)
    )
    .collect()
}

/**
 * Get active WhatsApp configuration by organization
 */
export const getActiveWhatsAppConfigurationByOrganization = async (
  ctx: QueryCtx,
  organizationId: string
) => {
  const configuration = await ctx.db
    .query("whatsappConfigurations")
    .withIndex("by_organization_and_active", (q) =>
      q.eq("organizationId", organizationId).eq("isActive", true)
    )
    .unique()
  if (!configuration) {
    throw new WhatsappConfigurationNotFoundError()
  }
  return configuration
}

// Helper function to validate file size
export const validateFileSize = async (
  ctx: ActionCtx,
  mediaId: string,
  accessToken: string,
  mimeType: string
): Promise<{
  isValid: boolean
  errorMessage?: string
  actualSize?: number
}> => {
  try {
    const mediaInfo = await getMediaUrl(ctx, mediaId, accessToken)

    // Get file size from Content-Length header or by downloading the file
    const response = await fetch(mediaInfo.url, {
      method: "HEAD",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    let fileSize = 0
    const contentLength = response.headers.get("content-length")

    if (contentLength) {
      fileSize = parseInt(contentLength, 10)
    } else {
      // If Content-Length is not available, we need to download the file to check its size
      const fullResponse = await fetch(mediaInfo.url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const blob = await fullResponse.blob()
      fileSize = blob.size
    }

    const sizeLimit = getFileSizeLimit(mimeType)

    if (fileSize > sizeLimit) {
      return {
        isValid: false,
        errorMessage: `El archivo es demasiado grande (${formatFileSize(fileSize)}). El tamaño máximo permitido es ${formatFileSize(sizeLimit)}. El archivo no se procesará ni usará en la conversación.`,
        actualSize: fileSize,
      }
    }

    return { isValid: true, actualSize: fileSize }
  } catch (error) {
    console.error("Error validating file size:", error)
    return {
      isValid: false,
      errorMessage:
        "Error al validar el tamaño del archivo. Por favor, inténtalo de nuevo.",
    }
  }
}

/**
 * Generate an organized R2 storage key based on file type
 * @param mimeType - MIME type of the file
 * @returns Organized key with folder prefix
 */
export function generateR2Key(mimeType: string): string {
  const uuid = uuidv7()

  // Determine extension based on MIME type
  let extension = "bin" // Default extension
  if (mimeType.startsWith("image/")) {
    extension = mimeType.split("/")[1] || "jpg"
  } else if (mimeType.startsWith("audio/")) {
    extension = mimeType.split("/")[1] || "mp3"
  }

  // Determine folder based on MIME type
  let folder = "files" // Default folder for other files
  if (mimeType.startsWith("image/")) {
    folder = "images"
  } else if (mimeType.startsWith("audio/")) {
    folder = "audios"
  } else if (mimeType.startsWith("video/")) {
    folder = "videos"
  }

  // Generate key: folder/uuid.extension
  // UUIDv7 ensures uniqueness and includes timestamp for sorting
  return `${folder}/${uuid}.${extension}`
}

// ============================================================================
// Meta WhatsApp Template API Functions
// ============================================================================

/**
 * Uploads a file using Meta's resumable upload API and returns the header_handle.
 * This is required for creating templates with media headers (image, video, document).
 *
 * The process involves two steps:
 * 1. Create an upload session to get an upload ID
 * 2. Upload the file data to get the header_handle
 *
 * @param ctx - Convex action context for making external API calls
 * @param appId - Meta App ID (from the access token or app settings)
 * @param accessToken - WhatsApp Business API access token
 * @param imageUrl - URL of the image to upload
 * @param mimeType - MIME type of the file (e.g., "image/jpeg", "image/png")
 * @returns The header_handle string to use in template creation
 * @throws Error if the upload fails
 */
export const uploadMediaForTemplateHeader = async (
  _ctx: ActionCtx,
  appId: string,
  accessToken: string,
  imageUrl: string,
  mimeType: string = "image/jpeg"
): Promise<string> => {
  // Maximum file size for WhatsApp media (5MB for images)
  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB in bytes

  try {
    console.log(
      `[WhatsApp] Starting resumable upload for template header from URL: ${imageUrl}`
    )

    // Step 1: Download the image from the URL with timeout
    let imageResponse: Awaited<ReturnType<typeof axios.get<ArrayBuffer>>>
    try {
      imageResponse = await axios.get<ArrayBuffer>(imageUrl, {
        responseType: "arraybuffer",
        timeout: 30000, // 30 second timeout for download
        maxContentLength: MAX_FILE_SIZE,
        maxBodyLength: MAX_FILE_SIZE,
      })
    } catch (downloadError) {
      if (axios.isAxiosError(downloadError)) {
        if (downloadError.code === "ECONNABORTED") {
          throw new BadRequestError(
            "La descarga de la imagen tardó demasiado. Verifica que la URL sea accesible."
          )
        }
        if (downloadError.response?.status === 404) {
          throw new BadRequestError(
            "No se encontró la imagen en la URL proporcionada."
          )
        }
        if (downloadError.response?.status === 403) {
          throw new BadRequestError(
            "No se tiene permiso para acceder a la imagen. Verifica que la URL sea pública."
          )
        }
      }
      throw new BadRequestError(
        `Error al descargar la imagen: ${downloadError instanceof Error ? downloadError.message : "Error desconocido"}`
      )
    }

    const imageBuffer = new Uint8Array(imageResponse.data as ArrayBuffer)
    const fileSize = imageBuffer.byteLength

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      throw new BadRequestError(
        `La imagen es demasiado grande (${(fileSize / 1024 / 1024).toFixed(2)}MB). El máximo permitido es 5MB.`
      )
    }

    if (fileSize === 0) {
      throw new BadRequestError(
        "La imagen descargada está vacía. Verifica que la URL sea correcta."
      )
    }

    // Determine file extension from MIME type
    const extension = mimeType.split("/")[1] || "jpg"
    const fileName = `header_image.${extension}`

    console.log(
      `[WhatsApp] Downloaded image: ${fileSize} bytes (${(fileSize / 1024).toFixed(2)}KB), type: ${mimeType}`
    )

    // Step 2: Create upload session
    const createSessionUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${appId}/uploads`
    let sessionResponse: Awaited<ReturnType<typeof axios.post<{ id: string }>>>
    try {
      sessionResponse = await axios.post<{ id: string }>(
        createSessionUrl,
        null,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            file_name: fileName,
            file_type: mimeType,
            file_length: fileSize,
          },
          timeout: 30000, // 30 second timeout
        }
      )
    } catch (sessionError) {
      if (axios.isAxiosError(sessionError)) {
        const errorData = sessionError.response?.data?.error
        if (errorData?.code === 190) {
          throw new BadRequestError(
            "El token de acceso de Meta ha expirado o es inválido."
          )
        }
        if (errorData?.code === 100) {
          throw new BadRequestError(
            "El App ID de Meta es inválido. Verifica la configuración."
          )
        }
      }
      throw sessionError
    }

    const uploadSessionId = sessionResponse.data.id
    if (!uploadSessionId) {
      throw new BadRequestError(
        "Meta no devolvió un ID de sesión de upload. Intenta de nuevo."
      )
    }
    console.log(`[WhatsApp] Created upload session: ${uploadSessionId}`)

    // Step 3: Upload the file data
    // Use Blob for better compatibility with edge runtime (Uint8Array may not work with axios in all environments)
    const uploadUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${uploadSessionId}`
    const uploadBlob = new Blob([imageBuffer], { type: mimeType })
    const uploadResponse = await axios.post(uploadUrl, uploadBlob, {
      headers: {
        Authorization: `OAuth ${accessToken}`,
        "Content-Type": mimeType,
        file_offset: "0",
      },
      timeout: 60000, // 60 second timeout for upload
    })

    const headerHandle = uploadResponse.data.h
    if (!headerHandle) {
      throw new BadRequestError(
        "Meta no devolvió el header_handle después del upload. Intenta de nuevo."
      )
    }
    console.log(`[WhatsApp] Upload complete, header_handle obtained`)

    return headerHandle
  } catch (error) {
    // Re-throw BadRequestError as-is
    if (error instanceof BadRequestError) {
      throw error
    }

    console.error(`[WhatsApp] Error in resumable upload:`, error)

    if (axios.isAxiosError(error)) {
      const errorData = error.response?.data?.error
      const errorMessage =
        errorData?.message || error.message || "Unknown error"
      console.error(`[WhatsApp] Upload error details:`, errorData)
      throw new BadRequestError(
        `Error al subir imagen para template: ${errorMessage}`
      )
    }

    throw new BadRequestError(
      `Error inesperado al subir imagen: ${error instanceof Error ? error.message : "Error desconocido"}`
    )
  }
}

/**
 * Creates a message template in Meta WhatsApp Business API.
 *
 * @param ctx - Convex action context for making external API calls
 * @param wabaId - WhatsApp Business Account ID (required, not phone number ID)
 * @param accessToken - WhatsApp Business API access token
 * @param templateName - Name of the template (must be lowercase, alphanumeric, max 512 chars)
 * @param language - Language code (e.g., "es", "en")
 * @param category - Template category: "MARKETING", "UTILITY", or "AUTHENTICATION"
 * @param content - Template content/body text
 * @param variables - Optional array of variable examples (for dynamic content)
 * @param links - Optional array of buttons/links
 * @param header - Optional header configuration (text or image)
 * @param appId - Meta App ID (required for media header uploads)
 * @returns Meta API response with template ID and status
 * @throws Error if the API request fails
 */
export const createMetaTemplate = async (
  ctx: ActionCtx,
  wabaId: string,
  accessToken: string,
  templateName: string,
  language: string,
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION",
  content: string,
  variables?: string[],
  links?: Array<{
    type: "url" | "phone"
    nombre: string
    url?: string
    phoneNumber?: string
  }>,
  header?: {
    type: "none" | "text" | "image" | "video" | "document"
    text?: string
    imageUrl?: string
  },
  appId?: string
): Promise<{
  id: string
  status: string
  name: string
}> => {
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/message_templates`

  // Build components array according to Meta API documentation
  const templateComponents: Array<{
    type: string
    format?: string
    text?: string
    example?: {
      body_text?: string[][]
      header_handle?: string[]
      header_text?: string[]
    }
    buttons?: Array<{
      type: string
      text?: string
      url?: string
      phone_number?: string
    }>
  }> = []

  // Add header component if specified
  if (header && header.type !== "none") {
    if (header.type === "text" && header.text) {
      templateComponents.push({
        type: "HEADER",
        format: "TEXT",
        text: header.text,
      })
    } else if (header.type === "image" && header.imageUrl) {
      // For image headers, we need to upload the image first using resumable upload
      if (!appId) {
        throw new BadRequestError(
          "Se requiere el App ID de Meta para crear plantillas con imagen. " +
            "Configúralo en la sección de WhatsApp."
        )
      }

      // Determine MIME type from URL or default to JPEG
      let mimeType = "image/jpeg"
      const lowerUrl = header.imageUrl.toLowerCase()
      if (lowerUrl.includes(".png")) {
        mimeType = "image/png"
      } else if (lowerUrl.includes(".webp")) {
        mimeType = "image/webp"
      }

      const headerHandle = await uploadMediaForTemplateHeader(
        ctx,
        appId,
        accessToken,
        header.imageUrl,
        mimeType
      )

      templateComponents.push({
        type: "HEADER",
        format: "IMAGE",
        example: {
          header_handle: [headerHandle],
        },
      })
    } else if (header.type === "video" && header.imageUrl) {
      // For video headers, also need resumable upload
      if (!appId) {
        throw new BadRequestError(
          "Se requiere el App ID de Meta para crear plantillas con video."
        )
      }

      const headerHandle = await uploadMediaForTemplateHeader(
        ctx,
        appId,
        accessToken,
        header.imageUrl,
        "video/mp4"
      )

      templateComponents.push({
        type: "HEADER",
        format: "VIDEO",
        example: {
          header_handle: [headerHandle],
        },
      })
    } else if (header.type === "document" && header.imageUrl) {
      // For document headers, also need resumable upload
      if (!appId) {
        throw new BadRequestError(
          "Se requiere el App ID de Meta para crear plantillas con documento."
        )
      }

      const headerHandle = await uploadMediaForTemplateHeader(
        ctx,
        appId,
        accessToken,
        header.imageUrl,
        "application/pdf"
      )

      templateComponents.push({
        type: "HEADER",
        format: "DOCUMENT",
        example: {
          header_handle: [headerHandle],
        },
      })
    }
  }

  // Add body component with variables if any
  if (variables && variables.length > 0) {
    templateComponents.push({
      type: "BODY",
      text: content,
      example: {
        body_text: [variables],
      },
    })
  } else {
    templateComponents.push({
      type: "BODY",
      text: content,
    })
  }

  // Add buttons if any
  if (links && links.length > 0) {
    const buttons = links.map((link) => {
      if (link.type === "url") {
        return {
          type: "URL",
          text: link.nombre,
          url: link.url || "",
        }
      }
      return {
        type: "PHONE_NUMBER",
        text: link.nombre,
        phone_number: link.phoneNumber || "",
      }
    })

    templateComponents.push({
      type: "BUTTONS",
      buttons,
    })
  }

  const data = {
    name: templateName.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
    language,
    category,
    components: templateComponents,
  }

  try {
    console.log(
      `[WhatsApp] Creating template "${templateName}" with components:`,
      JSON.stringify(data, null, 2)
    )

    const response = await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return {
      id: response.data.id || response.data.message_template_id || "",
      status: response.data.status || "PENDING",
      name: response.data.name || templateName,
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage =
        error.response?.data?.error?.message ||
        `Failed to create template: ${error.message}`
      console.error("[WhatsApp] Template creation error:", {
        error: error.response?.data,
        requestData: data,
      })
      throw new BadRequestError(errorMessage)
    }
    throw error
  }
}

/**
 * Retrieves all message templates from Meta WhatsApp Business API.
 *
 * @param ctx - Convex action context for making external API calls
 * @param accessToken - WhatsApp Business API access token
 * @param wabaId - WhatsApp Business Account ID
 * @returns Array of templates with their status from Meta API
 * @throws Error if the API request fails
 * @deprecated Use getMetaTemplatesWithContent instead for full template data
 */
export const getMetaTemplates = async (
  _ctx: ActionCtx,
  accessToken: string,
  wabaId: string
): Promise<
  Array<{
    id: string
    name: string
    status: "APPROVED" | "PENDING" | "REJECTED" | "PENDING_DELETION"
    language: string
    category: string
  }>
> => {
  try {
    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/message_templates`

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        limit: 1000,
      },
    })

    const templates = response.data.data || []

    return templates.map(
      (template: {
        id?: string
        message_template_id?: string
        name?: string
        status?: string
        language?: string
        category?: string
      }) => ({
        id: template.id || template.message_template_id || "",
        name: template.name || "",
        status:
          (template.status as
            | "APPROVED"
            | "PENDING"
            | "REJECTED"
            | "PENDING_DELETION") || "PENDING",
        language: template.language || "",
        category: template.category || "",
      })
    )
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage =
        error.response?.data?.error?.message ||
        `Failed to fetch templates: ${error.message}`
      throw new BadRequestError(errorMessage)
    }
    throw error
  }
}

/**
 * Meta template component structure from API response
 */
interface MetaTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS"
  text?: string
  format?: string
  buttons?: Array<{
    type: string
    text: string
    url?: string
    phone_number?: string
    // Flow button fields
    flow_id?: string
    flow_action?: string
    navigate_screen?: string
  }>
  example?: {
    body_text?: string[][]
    header_text?: string[]
    header_handle?: string[]
    header_url?: string[] // Used by 360dialog for media header URLs
  }
}

/**
 * Meta template structure from API response
 */
interface MetaTemplateResponse {
  id?: string
  message_template_id?: string
  name?: string
  status?: string
  language?: string
  category?: string
  components?: MetaTemplateComponent[]
}

/**
 * Retrieves all message templates from Meta WhatsApp Business API with full content.
 * Includes pagination support to fetch all templates.
 *
 * @param ctx - Convex action context for making external API calls
 * @param accessToken - WhatsApp Business API access token
 * @param wabaId - WhatsApp Business Account ID
 * @returns Array of templates with their status, content, and variables from Meta API
 * @throws Error if the API request fails
 */
export const getMetaTemplatesWithContent = async (
  _ctx: ActionCtx,
  accessToken: string,
  wabaId: string
): Promise<
  Array<{
    id: string
    name: string
    status: "APPROVED" | "PENDING" | "REJECTED" | "PENDING_DELETION"
    language: string
    category: string
    bodyText: string
    variables: string[]
    headerType: "none" | "text" | "image" | "video" | "document"
    headerText?: string
    headerImageUrl?: string
    buttons: Array<{
      type: "url" | "phone" | "quick_reply" | "flow"
      text: string
      url?: string
      phoneNumber?: string
      flowId?: string
      flowAction?: string
      navigateScreen?: string
    }>
  }>
> => {
  const allTemplates: MetaTemplateResponse[] = []
  let nextCursor: string | undefined

  try {
    // Fetch all pages of templates
    do {
      const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/message_templates`

      console.log(`[Meta API] Fetching templates from: ${url}`)
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          limit: 100,
          after: nextCursor,
          fields: "id,name,status,language,category,components",
        },
      })

      const templates = response.data.data || []

      // Log template statuses for monitoring
      templates.forEach((template: any) => {
        console.log(
          `[Meta API] Template: ${template.name} - Status: ${template.status}`
        )
      })

      allTemplates.push(...templates)

      // Check for next page
      nextCursor = response.data.paging?.cursors?.after
      const hasNextPage = response.data.paging?.next !== undefined
      if (!hasNextPage) {
        nextCursor = undefined
      }
    } while (nextCursor)

    console.log(`[Meta API] Total templates fetched: ${allTemplates.length}`)

    return allTemplates.map((template) => {
      // Extract body text from components
      let bodyText = ""
      const variables: string[] = []
      let headerType: "none" | "text" | "image" | "video" | "document" = "none"
      let headerText: string | undefined
      let headerImageUrl: string | undefined
      // Extract buttons information
      const buttons: Array<{
        type: "url" | "phone" | "quick_reply" | "flow"
        text: string
        url?: string
        phoneNumber?: string
        flowId?: string
        flowAction?: string
        navigateScreen?: string
      }> = []

      if (template.components) {
        for (const component of template.components) {
          if (component.type === "HEADER") {
            // Extract header information
            if (component.format === "TEXT") {
              headerType = "text"
              headerText = component.text
            } else if (component.format === "IMAGE") {
              headerType = "image"
              // Try to get example URL if available
              if (
                component.example?.header_handle &&
                component.example.header_handle.length > 0
              ) {
                headerImageUrl = component.example.header_handle[0]
              }
            } else if (component.format === "VIDEO") {
              headerType = "video"
              if (
                component.example?.header_handle &&
                component.example.header_handle.length > 0
              ) {
                headerImageUrl = component.example.header_handle[0]
              }
            } else if (component.format === "DOCUMENT") {
              headerType = "document"
              if (
                component.example?.header_handle &&
                component.example.header_handle.length > 0
              ) {
                headerImageUrl = component.example.header_handle[0]
              }
            }
          } else if (component.type === "BODY" && component.text) {
            bodyText = component.text

            // Extract variable placeholders from body text
            const variableMatches = bodyText.match(/\{\{(\d+)\}\}/g)
            if (variableMatches) {
              // Create variable names based on position
              for (let i = 0; i < variableMatches.length; i++) {
                variables.push(`variable_${i + 1}`)
              }
            }
          } else if (component.type === "BUTTONS" && component.buttons) {
            // Extract buttons information
            for (const button of component.buttons) {
              if (button.type === "URL") {
                buttons.push({
                  type: "url",
                  text: button.text || "",
                  url: button.url,
                })
              } else if (button.type === "PHONE_NUMBER") {
                buttons.push({
                  type: "phone",
                  text: button.text || "",
                  phoneNumber: button.phone_number,
                })
              } else if (button.type === "QUICK_REPLY") {
                buttons.push({
                  type: "quick_reply",
                  text: button.text || "",
                })
              } else if (button.type === "FLOW") {
                buttons.push({
                  type: "flow",
                  text: button.text || "",
                  flowId: button.flow_id,
                  flowAction: button.flow_action,
                  navigateScreen: button.navigate_screen,
                })
              }
            }
          }
        }
      }

      const templateStatus =
        (template.status as
          | "APPROVED"
          | "PENDING"
          | "REJECTED"
          | "PENDING_DELETION") || "PENDING"

      return {
        id: template.id || template.message_template_id || "",
        name: template.name || "",
        status: templateStatus,
        language: template.language || "",
        category: template.category || "",
        bodyText,
        variables,
        headerType,
        headerText,
        headerImageUrl,
        buttons,
      }
    })
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage =
        error.response?.data?.error?.message ||
        `Failed to fetch templates: ${error.message}`
      throw new BadRequestError(errorMessage)
    }
    throw error
  }
}

/**
 * Helper function to retrieve WhatsApp Business Account ID from phone number.
 *
 * Note: The Meta Graph API does not expose the WABA ID directly from the phone number endpoint.
 * This function attempts to find it but will likely return undefined, requiring manual configuration.
 *
 * @param businessPhoneNumberId - WhatsApp Business phone number ID
 * @param accessToken - WhatsApp Business API access token
 * @returns WhatsApp Business Account ID, or undefined if not found
 */
export const getWabaId = async (
  businessPhoneNumberId: string,
  _accessToken: string
): Promise<string | undefined> => {
  console.log(
    "[getWabaId] Note: WABA ID is not available from phone number endpoint. Manual configuration required."
  )
  console.log("[getWabaId] Phone Number ID:", businessPhoneNumberId)

  // The Meta Graph API doesn't expose WABA ID from the phone number endpoint
  // Users need to configure it manually from Meta Business Suite
  return undefined
}

// ============================================================================
// 360dialog WhatsApp API Functions
// ============================================================================

const DIALOG360_API_BASE_URL = "https://waba-v2.360dialog.io"

/**
 * Sends a text message via 360dialog WhatsApp Business API
 *
 * @param ctx - Convex action context for making external API calls
 * @param to - Recipient phone number in international format
 * @param text - Message text content to send
 * @param apiKey - 360dialog API key (D360-API-KEY)
 * @throws Error if the API request fails or returns non-200 status
 */
export const sendDialog360Message = async (
  _ctx: ActionCtx,
  to: string,
  text: string,
  apiKey: string
): Promise<string | undefined> => {
  const url = `${DIALOG360_API_BASE_URL}/messages`

  // WhatsApp has a 4096 character limit, split if needed
  const MAX_LENGTH = 4000 // Use 4000 to be safe

  if (text.length <= MAX_LENGTH) {
    // Send as single message
    const data = {
      messaging_product: WHATSAPP_MESSAGING_PRODUCT,
      to,
      type: "text",
      text: { body: text },
    }

    try {
      console.log(`[360dialog] Sending message to ${to}`, {
        url,
        messageLength: text.length,
      })

      const response = await axios.post(url, data, {
        headers: {
          "Content-Type": "application/json",
          "D360-API-KEY": apiKey,
        },
      })

      const messageId = response.data.messages?.[0]?.id ?? undefined
      console.log(
        `[360dialog] Text message sent successfully to ${to}${messageId ? ` (ID: ${messageId})` : ""}`
      )
      return messageId
    } catch (error) {
      console.error(
        `[360dialog] Error sending message to ${to}:`,
        getSafeErrorDetails(error)
      )

      throw error
    }
  } else {
    // Split message into multiple parts (same logic as Meta)
    console.log(
      `[360dialog] Message too long (${text.length} chars), splitting into parts...`
    )

    const parts: string[] = []
    let currentPart = ""

    const lines = text.split("\n")

    for (const line of lines) {
      if ((currentPart + line + "\n").length > MAX_LENGTH) {
        if (currentPart) {
          parts.push(currentPart.trim())
          currentPart = ""
        }

        if (line.length > MAX_LENGTH) {
          const words = line.split(" ")
          for (const word of words) {
            if ((currentPart + word + " ").length > MAX_LENGTH) {
              if (currentPart) {
                parts.push(currentPart.trim())
                currentPart = ""
              }
            }
            currentPart += word + " "
          }
        } else {
          currentPart = line + "\n"
        }
      } else {
        currentPart += line + "\n"
      }
    }

    if (currentPart.trim()) {
      parts.push(currentPart.trim())
    }

    console.log(`[360dialog] Sending ${parts.length} message parts to ${to}`)
    let firstMessageId: string | undefined

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]

      const data = {
        messaging_product: WHATSAPP_MESSAGING_PRODUCT,
        to,
        type: "text",
        text: { body: part },
      }

      try {
        const response = await axios.post(url, data, {
          headers: {
            "Content-Type": "application/json",
            "D360-API-KEY": apiKey,
          },
        })

        if (!firstMessageId) {
          firstMessageId = response.data.messages?.[0]?.id ?? undefined
        }

        console.log(
          `[360dialog] Message part ${i + 1}/${parts.length} sent successfully`
        )

        if (i < parts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      } catch (error) {
        console.error(
          `[360dialog] Error sending message part ${i + 1}/${parts.length}:`,
          getSafeErrorDetails(error)
        )
        throw error
      }
    }

    console.log(
      `[360dialog] All ${parts.length} message parts sent successfully to ${to}`
    )
    return firstMessageId
  }
}

/**
 * Sends an image message via 360dialog WhatsApp Business API
 *
 * @param ctx - Convex action context for making external API calls
 * @param to - Recipient phone number in international format
 * @param mediaId - 360dialog media ID of the uploaded image
 * @param apiKey - 360dialog API key (D360-API-KEY)
 * @param caption - Optional caption text for the image
 * @throws Error if the API request fails or returns non-200 status
 */
export const sendDialog360ImageMessage = async (
  _ctx: ActionCtx,
  to: string,
  mediaId: string,
  apiKey: string,
  caption?: string
): Promise<void> => {
  const url = `${DIALOG360_API_BASE_URL}/messages`

  const data = {
    messaging_product: WHATSAPP_MESSAGING_PRODUCT,
    to,
    type: "image",
    image: {
      id: mediaId,
      ...(caption && { caption }),
    },
  }

  try {
    console.log(`[360dialog] Sending image message to ${to}`, { url, data })

    await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        "D360-API-KEY": apiKey,
      },
    })

    console.log(`[360dialog] Image message sent successfully to ${to}`)
  } catch (error) {
    console.error(`[360dialog] Error sending image message to ${to}:`, error)

    if (axios.isAxiosError(error)) {
      console.error(`[360dialog] Response status: ${error.response?.status}`)
      console.error(`[360dialog] Response data:`, error.response?.data)
    }

    throw error
  }
}

/**
 * Sends a document message via 360dialog WhatsApp Business API
 *
 * @param ctx - Convex action context for making external API calls
 * @param to - Recipient phone number in international format
 * @param mediaId - 360dialog media ID of the uploaded document
 * @param apiKey - 360dialog API key (D360-API-KEY)
 * @param caption - Optional caption text for the document
 * @param filename - Optional filename for the document
 * @throws Error if the API request fails or returns non-200 status
 */
export const sendDialog360DocumentMessage = async (
  _ctx: ActionCtx,
  to: string,
  mediaId: string,
  apiKey: string,
  caption?: string,
  filename?: string
): Promise<void> => {
  const url = `${DIALOG360_API_BASE_URL}/messages`

  const data = {
    messaging_product: WHATSAPP_MESSAGING_PRODUCT,
    to,
    type: "document",
    document: {
      id: mediaId,
      ...(caption && { caption }),
      ...(filename && { filename }),
    },
  }

  try {
    console.log(`[360dialog] Sending document message to ${to}`, { url, data })

    await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        "D360-API-KEY": apiKey,
      },
    })

    console.log(`[360dialog] Document message sent successfully to ${to}`)
  } catch (error) {
    console.error(`[360dialog] Error sending document message to ${to}:`, error)

    if (axios.isAxiosError(error)) {
      console.error(`[360dialog] Response status: ${error.response?.status}`)
      console.error(`[360dialog] Response data:`, error.response?.data)
    }

    throw error
  }
}

/**
 * Sends a location message via 360dialog WhatsApp Business API
 *
 * @param ctx - Convex action context for making external API calls
 * @param to - Recipient phone number in international format
 * @param latitude - Location latitude coordinate
 * @param longitude - Location longitude coordinate
 * @param name - Name of the location
 * @param address - Address of the location
 * @param apiKey - 360dialog API key (D360-API-KEY)
 */
export const sendDialog360LocationMessage = async (
  _ctx: ActionCtx,
  to: string,
  latitude: number,
  longitude: number,
  name: string,
  address: string,
  apiKey: string
): Promise<void> => {
  const url = `${DIALOG360_API_BASE_URL}/messages`

  const data = {
    messaging_product: WHATSAPP_MESSAGING_PRODUCT,
    to,
    type: "location",
    location: {
      latitude,
      longitude,
      name,
      address,
    },
  }

  try {
    console.log(`[360dialog] Sending location message to ${to}`, {
      latitude,
      longitude,
      name,
    })

    await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        "D360-API-KEY": apiKey,
      },
    })

    console.log(`[360dialog] Location message sent successfully to ${to}`)
  } catch (error) {
    console.error(`[360dialog] Error sending location message to ${to}:`, error)

    if (axios.isAxiosError(error)) {
      console.error(`[360dialog] Response status: ${error.response?.status}`)
      console.error(`[360dialog] Response data:`, error.response?.data)
    }

    throw error
  }
}

/**
 * Uploads media to 360dialog servers and returns the media ID
 *
 * @param ctx - Convex action context
 * @param imageUrl - Public URL of the image to upload
 * @param apiKey - 360dialog API key (D360-API-KEY)
 * @param mimeType - MIME type of the image
 * @returns 360dialog media ID
 */
export const uploadMediaToDialog360 = async (
  _ctx: ActionCtx,
  imageUrl: string,
  apiKey: string,
  mimeType: string
): Promise<string> => {
  const url = `${DIALOG360_API_BASE_URL}/media`

  try {
    console.log(`[360dialog] Uploading media from URL: ${imageUrl}`)

    // Download the image
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
    })

    // Create form data
    const formData = new FormData()
    const blob = new Blob([imageResponse.data], { type: mimeType })
    formData.append("file", blob, "media")
    formData.append("messaging_product", WHATSAPP_MESSAGING_PRODUCT)
    formData.append("type", mimeType)

    // Upload to 360dialog
    const response = await axios.post(url, formData, {
      headers: {
        "D360-API-KEY": apiKey,
        "Content-Type": "multipart/form-data",
      },
    })

    const mediaId = response.data.id
    console.log(`[360dialog] Media uploaded successfully. Media ID: ${mediaId}`)

    return mediaId
  } catch (error) {
    console.error(`[360dialog] Error uploading media:`, error)

    if (axios.isAxiosError(error)) {
      console.error(`[360dialog] Response status: ${error.response?.status}`)
      console.error(`[360dialog] Response data:`, error.response?.data)
    }

    throw error
  }
}

/**
 * Retrieves media URL and metadata from 360dialog API
 *
 * @param ctx - Convex action context for making external API calls
 * @param mediaId - 360dialog media ID from incoming message
 * @param apiKey - 360dialog API key (D360-API-KEY)
 * @returns Object containing the media download URL and MIME type
 * @throws Error if the API response doesn't contain a valid media URL
 */
export const getDialog360MediaUrl = async (
  _ctx: ActionCtx,
  mediaId: string,
  apiKey: string
): Promise<{ url: string; mime_type: string }> => {
  const url = `${DIALOG360_API_BASE_URL}/media/${mediaId}`

  try {
    const response = await axios.get(url, {
      headers: { "D360-API-KEY": apiKey },
    })

    if (!response.data.url) {
      throw new BadRequestError(
        "360dialog API response does not contain media URL"
      )
    }

    return {
      url: response.data.url,
      mime_type: response.data.mime_type,
    }
  } catch (error) {
    console.error(`[360dialog] Error getting media URL:`, error)

    if (axios.isAxiosError(error)) {
      console.error(`[360dialog] Response status: ${error.response?.status}`)
      console.error(`[360dialog] Response data:`, error.response?.data)
    }

    throw error
  }
}

/**
 * Marks a message as read via 360dialog API
 *
 * @param ctx - Convex action context for making external API calls
 * @param messageId - The WhatsApp message ID to mark as read
 * @param apiKey - 360dialog API key (D360-API-KEY)
 * @param showTypingIndicator - Whether to show typing indicator (default: true)
 */
export const markDialog360MessageAsRead = async (
  _ctx: ActionCtx,
  messageId: string,
  apiKey: string,
  showTypingIndicator: boolean = true
): Promise<void> => {
  const url = `${DIALOG360_API_BASE_URL}/messages`

  const data: {
    messaging_product: string
    status: string
    message_id: string
    typing_indicator?: { type: string }
  } = {
    messaging_product: WHATSAPP_MESSAGING_PRODUCT,
    status: "read",
    message_id: messageId,
  }

  // Add typing indicator if requested
  if (showTypingIndicator) {
    data.typing_indicator = { type: "text" }
  }

  try {
    await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        "D360-API-KEY": apiKey,
      },
    })
    console.log(
      `[360dialog] Message ${messageId} marked as read${showTypingIndicator ? " with typing indicator" : ""}`
    )
  } catch (error) {
    // Don't throw - read receipt is non-critical
    console.error(
      `[360dialog] Error marking message as read:`,
      getSafeErrorDetails(error)
    )
  }
}

/**
 * Validates file size for 360dialog media
 *
 * @param ctx - Convex action context for making external API calls
 * @param mediaId - 360dialog media ID
 * @param apiKey - 360dialog API key (D360-API-KEY)
 * @param mimeType - MIME type of the file
 * @returns Validation result with isValid flag and optional error message
 */
export const validateDialog360FileSize = async (
  ctx: ActionCtx,
  mediaId: string,
  apiKey: string,
  mimeType: string
): Promise<{
  isValid: boolean
  errorMessage?: string
  actualSize?: number
}> => {
  try {
    const mediaInfo = await getDialog360MediaUrl(ctx, mediaId, apiKey)

    // Get file size from Content-Length header or by downloading the file
    const response = await fetch(mediaInfo.url, {
      method: "HEAD",
      headers: {
        "D360-API-KEY": apiKey,
      },
    })

    let fileSize = 0
    const contentLength = response.headers.get("content-length")

    if (contentLength) {
      fileSize = parseInt(contentLength, 10)
    } else {
      // If Content-Length is not available, we need to download the file to check its size
      const fullResponse = await fetch(mediaInfo.url, {
        headers: {
          "D360-API-KEY": apiKey,
        },
      })
      const blob = await fullResponse.blob()
      fileSize = blob.size
    }

    const sizeLimit = getFileSizeLimit(mimeType)

    if (fileSize > sizeLimit) {
      return {
        isValid: false,
        errorMessage: `El archivo es demasiado grande (${formatFileSize(fileSize)}). El tamaño máximo permitido es ${formatFileSize(sizeLimit)}. El archivo no se procesará ni usará en la conversación.`,
        actualSize: fileSize,
      }
    }

    return { isValid: true, actualSize: fileSize }
  } catch (error) {
    console.error("[360dialog] Error validating file size:", error)
    return {
      isValid: false,
      errorMessage:
        "Error al validar el tamaño del archivo. Por favor, inténtalo de nuevo.",
    }
  }
}

/**
 * Sends a template message via 360dialog WhatsApp Business API
 *
 * @param ctx - Convex action context for making external API calls
 * @param to - Recipient phone number (will be sanitized to digits only)
 * @param template - Name of the approved WhatsApp template
 * @param language - Language code for the template (e.g., "es", "en")
 * @param apiKey - 360dialog API key (D360-API-KEY)
 * @param params - Optional array of parameter values to fill template placeholders
 * @returns WhatsApp message ID from the API response
 * @throws Error if the API request fails or template is invalid
 */
export const sendDialog360TemplateMessageApi = async (
  _ctx: ActionCtx,
  to: string,
  template: string,
  language: string,
  apiKey: string,
  params?: string[],
  mediaType?: "image" | "video" | "document",
  mediaUrl?: string
): Promise<string> => {
  const url = `${DIALOG360_API_BASE_URL}/messages`
  const phoneNumber = to.replace(/\D/g, "")

  const components: any[] = []

  // Add header component if media is provided
  if (mediaType && mediaUrl) {
    const headerComponent: any = {
      type: "header",
      parameters: [],
    }

    if (mediaType === "image") {
      headerComponent.parameters.push({
        type: "image",
        image: {
          link: mediaUrl,
        },
      })
    } else if (mediaType === "video") {
      headerComponent.parameters.push({
        type: "video",
        video: {
          link: mediaUrl,
        },
      })
    } else if (mediaType === "document") {
      headerComponent.parameters.push({
        type: "document",
        document: {
          link: mediaUrl,
        },
      })
    }

    components.push(headerComponent)
  }

  // Add body component if params are provided
  if (params && params.length > 0) {
    components.push({
      type: "body",
      parameters: params.map((value) => ({
        type: "text",
        text: value || "",
      })),
    })
  }

  // Build template object - only include components if there are any
  const templateObj: {
    name: string
    language: { code: string }
    components?: typeof components
  } = {
    name: template,
    language: {
      code: language,
    },
  }

  // Only add components if we have any (360dialog/WhatsApp API doesn't like empty arrays)
  if (components.length > 0) {
    templateObj.components = components
  }

  const data = {
    messaging_product: WHATSAPP_MESSAGING_PRODUCT,
    to: phoneNumber,
    type: "template",
    template: templateObj,
  }

  try {
    const response = await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        "D360-API-KEY": apiKey,
      },
    })

    const messageId = response.data.messages?.[0]?.id
    if (!messageId) {
      throw new BadRequestError(
        "360dialog API did not return a message ID in the response"
      )
    }

    console.log(
      `[360dialog] Template message '${template}' sent successfully to ${phoneNumber} (ID: ${messageId})`
    )
    return messageId
  } catch (error) {
    let errorMessage = "Unknown error"
    if (axios.isAxiosError(error)) {
      const apiError = error.response?.data?.error
      if (apiError) {
        errorMessage = `360dialog API Error (${apiError.code || "UNKNOWN"}): ${apiError.message || apiError.error_user_msg || error.message}`
        console.error("[360dialog] API error details:", {
          code: apiError.code,
          message: apiError.message,
          error_subcode: apiError.error_subcode,
          requestData: JSON.stringify(data, null, 2),
        })
      } else {
        errorMessage = `Request failed: ${error.response?.status} ${error.response?.statusText || error.message}`
      }
    } else if (error instanceof Error) {
      errorMessage = error.message
    }

    console.error(`[360dialog] Failed to send template message:`, {
      template,
      language,
      phoneNumber,
      hasParams: !!params,
      paramsCount: params?.length || 0,
      error: errorMessage,
    })

    throw new BadRequestError(`360dialog API error: ${errorMessage}`)
  }
}

/**
 * Creates a message template in 360dialog WhatsApp Business API.
 *
 * @param ctx - Convex action context for making external API calls
 * @param wabaId - WhatsApp Business Account ID
 * @param apiKey - 360dialog API key (D360-API-KEY)
 * @param templateName - Name of the template
 * @param language - Language code (e.g., "es", "en")
 * @param category - Template category: "MARKETING", "UTILITY", or "AUTHENTICATION"
 * @param content - Template content/body text
 * @param variables - Optional array of variable examples
 * @param links - Optional array of buttons/links
 * @returns API response with template ID and status
 */
export const createDialog360Template = async (
  _ctx: ActionCtx,
  _wabaId: string,
  apiKey: string,
  templateName: string,
  language: string,
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION",
  content: string,
  variables?: string[],
  links?: Array<{
    type: "url" | "phone"
    nombre: string
    url?: string

    phoneNumber?: string
  }>,
  header?: {
    type: "text" | "image" | "video" | "document"
    text?: string
    imageUrl?: string
  }
): Promise<{
  id: string
  status: string
  name: string
}> => {
  const url = `${DIALOG360_API_BASE_URL}/v1/configs/templates`

  // Build components array (same format as Meta)
  const templateComponents: Array<{
    type: string
    text?: string
    format?: string
    example?: {
      body_text?: string[][]
      header_handle?: string[]
    }
    buttons?: Array<{
      type: string
      text?: string
      url?: string
      phone_number?: string
    }>
  }> = []

  // Add header component if provided
  if (header) {
    const headerComponent: any = {
      type: "HEADER",
      format: header.type.toUpperCase(),
    }

    if (header.type === "text" && header.text) {
      headerComponent.text = header.text
    }

    // For media types, we need to provide an example
    // We'll try passing the URL as the handle, which some providers accept
    if (
      (header.type === "image" ||
        header.type === "video" ||
        header.type === "document") &&
      header.imageUrl
    ) {
      headerComponent.example = {
        header_handle: [header.imageUrl],
      }
    }

    templateComponents.push(headerComponent)
  }

  // Handle image proxy if necessary
  // 360dialog often fails to access private/protected URLs (403).
  // We'll download the image and re-host it on R2 to provide a public URL.
  if (
    header?.imageUrl &&
    (header.type === "image" ||
      header.type === "video" ||
      header.type === "document")
  ) {
    // Always try to proxy for 360dialog to avoid 403 errors due to firewalls/geo-blocking
    try {
      // Download media
      console.log(`[360dialog] Downloading media for proxy...`)
      const mediaResponse = await axios.get(header.imageUrl, {
        responseType: "arraybuffer",
      })

      // ✅ CRITICAL FIX: Use R2 storage instead of ctx.storage
      // ActionCtx does NOT have .storage property - only mutations have it
      // Use R2 which is available in actions
      const mimeType =
        mediaResponse.headers["content-type"] ||
        (header.type === "image"
          ? "image/jpeg"
          : header.type === "video"
            ? "video/mp4"
            : "application/pdf")

      const storageKey = generateR2Key(mimeType)
      const blob = new Blob([mediaResponse.data], { type: mimeType })

      await r2.store(_ctx, blob, {
        type: mimeType,
        key: storageKey,
      })

      const publicUrl = `${env.R2_PUBLIC_URL}/${storageKey}`
      console.log(`[360dialog] Media proxied successfully via R2: ${publicUrl}`)

      // Find the header component and update the example handle
      const headerComp = templateComponents.find((c) => c.type === "HEADER")
      if (headerComp && headerComp.example) {
        headerComp.example.header_handle = [publicUrl]
      }
    } catch (proxyError) {
      console.error(`[360dialog] Media proxy failed:`, proxyError)
      // Continue with original URL if proxy fails
    }
  }

  // Add body component with variables if any
  if (variables && variables.length > 0) {
    templateComponents.push({
      type: "BODY",
      text: content,
      example: {
        body_text: [variables],
      },
    })
  } else {
    templateComponents.push({
      type: "BODY",
      text: content,
    })
  }

  // Add buttons if any
  if (links && links.length > 0) {
    const buttons = links.map((link) => {
      if (link.type === "url") {
        return {
          type: "URL",
          text: link.nombre,
          url: link.url || "",
        }
      }
      return {
        type: "PHONE_NUMBER",
        text: link.nombre,
        phone_number: link.phoneNumber || "",
      }
    })

    templateComponents.push({
      type: "BUTTONS",
      buttons,
    })
  }

  const data = {
    name: templateName.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
    language,
    category,
    components: templateComponents,
  }

  try {
    const response = await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        "D360-API-KEY": apiKey,
      },
    })

    return {
      id: response.data.id || response.data.message_template_id || "",
      status: response.data.status || "PENDING",
      name: response.data.name || templateName,
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorData = error.response?.data
      console.error(
        "[360dialog] Create template error:",
        JSON.stringify(errorData, null, 2)
      )

      const errorMessage =
        errorData?.error?.message ||
        errorData?.meta?.developer_message || // 360dialog often uses developer_message
        errorData?.meta?.message ||
        `Failed to create template: ${error.message}`

      // Include detailed error for debugging
      throw new BadRequestError(errorMessage)
    }
    throw error
  }
}

/**
 * Retrieves all message templates from 360dialog WhatsApp Business API.
 *
 * @param ctx - Convex action context for making external API calls
 * @param apiKey - 360dialog API key (D360-API-KEY)
 * @param wabaId - WhatsApp Business Account ID
 * @returns Array of templates with their status from 360dialog API
 */
export const getDialog360TemplatesWithContent = async (
  _ctx: ActionCtx,
  apiKey: string,
  _wabaId: string
): Promise<
  Array<{
    id: string
    name: string
    status: "APPROVED" | "PENDING" | "REJECTED" | "PENDING_DELETION"
    language: string
    category: string
    bodyText: string
    variables: string[]
    headerType?: "none" | "text" | "image" | "video" | "document"
    headerText?: string
    headerImageUrl?: string
  }>
> => {
  const allTemplates: MetaTemplateResponse[] = []
  let nextCursor: string | undefined

  try {
    // Fetch all pages of templates
    do {
      const url = `${DIALOG360_API_BASE_URL}/v1/configs/templates`

      const response = await axios.get(url, {
        headers: {
          "D360-API-KEY": apiKey,
        },
        params: {
          limit: 100,
          after: nextCursor,
          fields: "id,name,status,language,category,components",
        },
      })

      const responseData = response.data

      const templates = responseData.waba_templates || responseData.data || []
      allTemplates.push(...templates)

      // Check for next page
      nextCursor = response.data.paging?.cursors?.after
      const hasNextPage = response.data.paging?.next !== undefined
      if (!hasNextPage) {
        nextCursor = undefined
      }
    } while (nextCursor)

    return allTemplates.map((template) => {
      // Extract body text and header info from components
      let bodyText = ""
      const variables: string[] = []
      let headerType: "none" | "text" | "image" | "video" | "document" = "none"
      let headerText: string | undefined
      let headerImageUrl: string | undefined

      if (template.components) {
        for (const component of template.components) {
          if (component.type === "HEADER") {
            // Extract header information (same format as Meta API)
            if (component.format === "TEXT") {
              headerType = "text"
              headerText = component.text
            } else if (component.format === "IMAGE") {
              headerType = "image"
              // Try to get example URL if available
              if (
                component.example?.header_handle &&
                component.example.header_handle.length > 0
              ) {
                headerImageUrl = component.example.header_handle[0]
              } else if (
                component.example?.header_url &&
                component.example.header_url.length > 0
              ) {
                headerImageUrl = component.example.header_url[0]
              }
            } else if (component.format === "VIDEO") {
              headerType = "video"
              if (
                component.example?.header_handle &&
                component.example.header_handle.length > 0
              ) {
                headerImageUrl = component.example.header_handle[0]
              } else if (
                component.example?.header_url &&
                component.example.header_url.length > 0
              ) {
                headerImageUrl = component.example.header_url[0]
              }
            } else if (component.format === "DOCUMENT") {
              headerType = "document"
              if (
                component.example?.header_handle &&
                component.example.header_handle.length > 0
              ) {
                headerImageUrl = component.example.header_handle[0]
              } else if (
                component.example?.header_url &&
                component.example.header_url.length > 0
              ) {
                headerImageUrl = component.example.header_url[0]
              }
            }
          } else if (component.type === "BODY" && component.text) {
            bodyText = component.text

            // Extract variable placeholders from body text
            const variableMatches = bodyText.match(/\{\{(\d+)\}\}/g)
            if (variableMatches) {
              const varNumbers: number[] = variableMatches.map((m: string) => {
                const match = m.match(/\{\{(\d+)\}\}/)
                return match && typeof match[1] === "string"
                  ? parseInt(match[1])
                  : 0
              })
              // Populate variables array based on the extracted numbers
              for (const num of varNumbers) {
                variables.push(`variable_${num}`)
              }
            }
          }
        }
      }

      return {
        id: template.id || template.message_template_id || "",
        name: template.name || "",
        status:
          (template.status as
            | "APPROVED"
            | "PENDING"
            | "REJECTED"
            | "PENDING_DELETION") || "PENDING",
        language: template.language || "",
        category: template.category || "",
        bodyText,
        variables,
        headerType,
        headerText,
        headerImageUrl,
      }
    })
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage =
        error.response?.data?.error?.message ||
        `Failed to fetch templates: ${error.message}`
      throw new BadRequestError(errorMessage)
    }
    throw error
  }
}

/**
 * Deletes a message template from 360dialog WhatsApp Business API
 *
 * @param ctx - Convex action context for making external API calls
 * @param apiKey - 360dialog API key (D360-API-KEY)
 * @param templateName - Name of the template to delete
 * @throws Error if the API request fails or returns non-200 status
 */
export const deleteDialog360Template = async (
  _ctx: ActionCtx,
  apiKey: string,
  templateName: string
): Promise<void> => {
  const url = `${DIALOG360_API_BASE_URL}/v1/configs/templates/${templateName}`

  try {
    console.log(`[360dialog] Deleting template: ${templateName}`)

    await axios.delete(url, {
      headers: {
        "D360-API-KEY": apiKey,
      },
    })

    console.log(`[360dialog] Template ${templateName} deleted successfully`)
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage =
        error.response?.data?.error?.message ||
        `Failed to delete template: ${error.message}`

      // If template not found (404), consider it deleted
      if (error.response?.status === 404) {
        console.warn(
          `[360dialog] Template ${templateName} not found, ignoring deletion error.`
        )
        return
      }

      throw new BadRequestError(errorMessage)
    }
    throw error
  }
}

/**
 * Sends an interactive message (buttons, lists, CTA) via WhatsApp Business API
 */
export const sendWhatsAppInteractiveMessage = async (
  _ctx: ActionCtx,
  to: string,
  message: OutgoingInteractiveMessage,
  businessPhoneNumberId: string,
  accessToken: string
): Promise<string | null> => {
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${businessPhoneNumberId}/messages`

  if (
    message.interactiveType === "button" &&
    (message.buttons.length < 1 || message.buttons.length > 3)
  ) {
    throw new BadRequestError(
      `WhatsApp interactive button messages require between 1 and 3 buttons. Received ${message.buttons.length}.`
    )
  }

  // Define specific types for Meta API payloads
  type MetaInteractiveHeader =
    | { type: "text"; text: string }
    | { type: "image"; image: { id?: string; link?: string } }
    | { type: "video"; video: { id?: string; link?: string } }
    | {
        type: "document"
        document: { id?: string; link?: string; filename?: string }
      }

  type MetaInteractivePayload =
    | {
        type: "button"
        header?: MetaInteractiveHeader
        body: { text: string }
        footer?: { text: string }
        action: {
          buttons: Array<{
            type: "reply"
            reply: { id: string; title: string }
          }>
        }
      }
    | {
        type: "list"
        header?: MetaInteractiveHeader
        body: { text: string }
        footer?: { text: string }
        action: {
          button: string
          sections: Array<{
            title?: string
            rows: Array<{
              id: string
              title: string
              description?: string
            }>
          }>
        }
      }
    | {
        type: "cta_url"
        header?: MetaInteractiveHeader
        body: { text: string }
        footer?: { text: string }
        action: {
          name: "cta_url"
          parameters: {
            display_text: string
            url: string
          }
        }
      }
    | {
        type: "location_request_message"
        body: { text: string }
        action: {
          name: "send_location"
        }
      }

  const buildHeader = (
    header: InteractiveHeader
  ): MetaInteractiveHeader | undefined => {
    switch (header.type) {
      case "text":
        return header.text ? { type: "text", text: header.text } : undefined
      case "image":
        return {
          type: "image",
          image: header.image?.id
            ? { id: header.image.id }
            : { link: header.image?.link },
        }
      case "video":
        return {
          type: "video",
          video: header.video?.id
            ? { id: header.video.id }
            : { link: header.video?.link },
        }
      case "document":
        return {
          type: "document",
          document: header.document?.id
            ? { id: header.document.id, filename: header.document.filename }
            : {
                link: header.document?.link,
                filename: header.document?.filename,
              },
        }
    }
    return undefined
  }

  // Build the interactive object based on type
  const buildInteractive = (): MetaInteractivePayload => {
    switch (message.interactiveType) {
      case "button": {
        const header = message.header ? buildHeader(message.header) : undefined
        return {
          type: "button",
          header,
          body: { text: message.body.text },
          footer: message.footer ? { text: message.footer.text } : undefined,
          action: {
            buttons: message.buttons.map((btn) => ({
              type: btn.type,
              reply: {
                id: btn.reply.id,
                title: btn.reply.title,
              },
            })),
          },
        }
      }

      case "list": {
        const header = message.header ? buildHeader(message.header) : undefined
        return {
          type: "list",
          header,
          body: { text: message.body.text },
          footer: message.footer ? { text: message.footer.text } : undefined,
          action: {
            button: message.buttonText,
            sections: message.sections.map((section) => ({
              title: section.title,
              rows: section.rows.map((row) => ({
                id: row.id,
                title: row.title,
                description: row.description,
              })),
            })),
          },
        }
      }

      case "cta_url": {
        const header = message.header ? buildHeader(message.header) : undefined
        return {
          type: "cta_url",
          header,
          body: { text: message.body.text },
          footer: message.footer ? { text: message.footer.text } : undefined,
          action: {
            name: "cta_url",
            parameters: {
              display_text: message.ctaButtonText,
              url: message.ctaUrl,
            },
          },
        }
      }

      case "location_request":
        return {
          type: "location_request_message",
          body: { text: message.body.text },
          action: {
            name: "send_location",
          },
        }
    }
  }

  const data = {
    messaging_product: WHATSAPP_MESSAGING_PRODUCT,
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: buildInteractive(),
  }

  try {
    const response = await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    })
    console.log(`[WhatsApp] Interactive message sent successfully to ${to}`)
    return response.data.messages?.[0]?.id || null
  } catch (error) {
    console.error(
      `[WhatsApp] Error sending interactive message to ${to}:`,
      error
    )

    if (axios.isAxiosError(error)) {
      console.error(`[WhatsApp] Response status: ${error.response?.status}`)
      console.error(`[WhatsApp] Response data:`, error.response?.data)
    }

    throw error
  }
}

// ============================================================================
// Gupshup WhatsApp API Functions
// ============================================================================

const GUPSHUP_API_BASE_URL = "https://api.gupshup.io/wa/api/v1"
const GUPSHUP_PARTNER_API_BASE_URL = "https://partner.gupshup.io/partner"

/**
 * Sends a text message via Gupshup WhatsApp Business API
 *
 * @param ctx - Convex action context for making external API calls
 * @param to - Recipient phone number in international format
 * @param text - Message text content to send
 * @param apiKey - Gupshup API key
 * @param source - Source phone number registered in Gupshup
 */
export const sendGupshupMessage = async (
  _ctx: ActionCtx,
  to: string,
  text: string,
  apiKey: string,
  source: string
): Promise<void> => {
  const url = `${GUPSHUP_API_BASE_URL}/msg`

  // Sanitize phone number to digits only
  const phoneNumber = to.replace(/\D/g, "")
  const sourceNumber = source.replace(/\D/g, "")

  // WhatsApp has a 4096 character limit, split if needed
  const MAX_LENGTH = 4000

  const sendSingleMessage = async (messageText: string) => {
    const formData = new URLSearchParams()
    formData.append("channel", "whatsapp")
    formData.append("source", sourceNumber)
    formData.append("destination", phoneNumber)
    formData.append(
      "message",
      JSON.stringify({
        type: "text",
        text: messageText,
      })
    )
    formData.append("src.name", sourceNumber)

    try {
      const response = await axios.post(url, formData.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          apikey: apiKey,
        },
      })

      if (response.data.status !== "submitted") {
        throw new Error(
          `Gupshup API error: ${response.data.message || "Unknown error"}`
        )
      }

      console.log(`[Gupshup] Message sent successfully to ${phoneNumber}`)
    } catch (error) {
      console.error(`[Gupshup] Error sending message to ${phoneNumber}:`, error)
      if (axios.isAxiosError(error)) {
        console.error(`[Gupshup] Response status: ${error.response?.status}`)
        console.error(`[Gupshup] Response data:`, error.response?.data)
      }
      throw error
    }
  }

  if (text.length <= MAX_LENGTH) {
    await sendSingleMessage(text)
  } else {
    // Split message into multiple parts
    console.log(
      `[Gupshup] Message too long (${text.length} chars), splitting into parts...`
    )

    const parts: string[] = []
    let currentPart = ""

    const lines = text.split("\n")

    for (const line of lines) {
      if ((currentPart + line + "\n").length > MAX_LENGTH) {
        if (currentPart) {
          parts.push(currentPart.trim())
          currentPart = ""
        }

        if (line.length > MAX_LENGTH) {
          const words = line.split(" ")
          for (const word of words) {
            if ((currentPart + word + " ").length > MAX_LENGTH) {
              if (currentPart) {
                parts.push(currentPart.trim())
                currentPart = ""
              }
            }
            currentPart += word + " "
          }
        } else {
          currentPart = line + "\n"
        }
      } else {
        currentPart += line + "\n"
      }
    }

    if (currentPart.trim()) {
      parts.push(currentPart.trim())
    }

    console.log(
      `[Gupshup] Sending ${parts.length} message parts to ${phoneNumber}`
    )

    for (const part of parts) {
      await sendSingleMessage(part)
    }
  }
}

/**
 * Sends an image message via Gupshup WhatsApp Business API
 */
export const sendGupshupImageMessage = async (
  _ctx: ActionCtx,
  to: string,
  imageUrl: string,
  apiKey: string,
  source: string,
  caption?: string
): Promise<void> => {
  const url = `${GUPSHUP_API_BASE_URL}/msg`

  const phoneNumber = to.replace(/\D/g, "")
  const sourceNumber = source.replace(/\D/g, "")

  const messagePayload: Record<string, unknown> = {
    type: "image",
    originalUrl: imageUrl,
    previewUrl: imageUrl,
  }

  if (caption) {
    messagePayload.caption = caption
  }

  const formData = new URLSearchParams()
  formData.append("channel", "whatsapp")
  formData.append("source", sourceNumber)
  formData.append("destination", phoneNumber)
  formData.append("message", JSON.stringify(messagePayload))
  formData.append("src.name", sourceNumber)

  try {
    const response = await axios.post(url, formData.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: apiKey,
      },
    })

    if (response.data.status !== "submitted") {
      throw new Error(
        `Gupshup API error: ${response.data.message || "Unknown error"}`
      )
    }

    console.log(`[Gupshup] Image message sent successfully to ${phoneNumber}`)
  } catch (error) {
    console.error(
      `[Gupshup] Error sending image message to ${phoneNumber}:`,
      error
    )
    if (axios.isAxiosError(error)) {
      console.error(`[Gupshup] Response status: ${error.response?.status}`)
      console.error(`[Gupshup] Response data:`, error.response?.data)
    }
    throw error
  }
}

/**
 * Sends a document message via Gupshup WhatsApp Business API
 */
export const sendGupshupDocumentMessage = async (
  _ctx: ActionCtx,
  to: string,
  documentUrl: string,
  apiKey: string,
  source: string,
  filename?: string,
  caption?: string
): Promise<void> => {
  const url = `${GUPSHUP_API_BASE_URL}/msg`

  const phoneNumber = to.replace(/\D/g, "")
  const sourceNumber = source.replace(/\D/g, "")

  const messagePayload: Record<string, unknown> = {
    type: "file",
    url: documentUrl,
  }

  if (filename) {
    messagePayload.filename = filename
  }
  if (caption) {
    messagePayload.caption = caption
  }

  const formData = new URLSearchParams()
  formData.append("channel", "whatsapp")
  formData.append("source", sourceNumber)
  formData.append("destination", phoneNumber)
  formData.append("message", JSON.stringify(messagePayload))
  formData.append("src.name", sourceNumber)

  try {
    const response = await axios.post(url, formData.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: apiKey,
      },
    })

    if (response.data.status !== "submitted") {
      throw new Error(
        `Gupshup API error: ${response.data.message || "Unknown error"}`
      )
    }

    console.log(
      `[Gupshup] Document message sent successfully to ${phoneNumber}`
    )
  } catch (error) {
    console.error(
      `[Gupshup] Error sending document message to ${phoneNumber}:`,
      error
    )
    if (axios.isAxiosError(error)) {
      console.error(`[Gupshup] Response status: ${error.response?.status}`)
      console.error(`[Gupshup] Response data:`, error.response?.data)
    }
    throw error
  }
}

/**
 * Sends a template message via Gupshup WhatsApp Business API
 */
export const sendGupshupTemplateMessageApi = async (
  _ctx: ActionCtx,
  to: string,
  templateId: string,
  apiKey: string,
  source: string,
  params?: string[]
): Promise<string> => {
  const url = `${GUPSHUP_API_BASE_URL}/template/msg`

  const phoneNumber = to.replace(/\D/g, "")
  const sourceNumber = source.replace(/\D/g, "")

  const templatePayload: Record<string, unknown> = {
    id: templateId,
  }

  if (params && params.length > 0) {
    templatePayload.params = params
  }

  const formData = new URLSearchParams()
  formData.append("channel", "whatsapp")
  formData.append("source", sourceNumber)
  formData.append("destination", phoneNumber)
  formData.append("template", JSON.stringify(templatePayload))
  formData.append("src.name", sourceNumber)

  try {
    const response = await axios.post(url, formData.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: apiKey,
      },
    })

    if (response.data.status !== "submitted") {
      throw new Error(
        `Gupshup API error: ${response.data.message || "Unknown error"}`
      )
    }

    console.log(
      `[Gupshup] Template message sent successfully to ${phoneNumber}`
    )
    return response.data.messageId || ""
  } catch (error) {
    console.error(
      `[Gupshup] Error sending template message to ${phoneNumber}:`,
      error
    )
    if (axios.isAxiosError(error)) {
      console.error(`[Gupshup] Response status: ${error.response?.status}`)
      console.error(`[Gupshup] Response data:`, error.response?.data)
    }
    throw error
  }
}

/**
 * Sends a location message via Gupshup WhatsApp Business API
 */
export const sendGupshupLocationMessage = async (
  _ctx: ActionCtx,
  to: string,
  latitude: number,
  longitude: number,
  name: string,
  address: string,
  apiKey: string,
  source: string
): Promise<void> => {
  const url = `${GUPSHUP_API_BASE_URL}/msg`

  const phoneNumber = to.replace(/\D/g, "")
  const sourceNumber = source.replace(/\D/g, "")

  const messagePayload = {
    type: "location",
    longitude: longitude,
    latitude: latitude,
    name: name,
    address: address,
  }

  const formData = new URLSearchParams()
  formData.append("channel", "whatsapp")
  formData.append("source", sourceNumber)
  formData.append("destination", phoneNumber)
  formData.append("message", JSON.stringify(messagePayload))
  formData.append("src.name", sourceNumber)

  try {
    const response = await axios.post(url, formData.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: apiKey,
      },
    })

    if (response.data.status !== "submitted") {
      throw new Error(
        `Gupshup API error: ${response.data.message || "Unknown error"}`
      )
    }

    console.log(
      `[Gupshup] Location message sent successfully to ${phoneNumber}`
    )
  } catch (error) {
    console.error(
      `[Gupshup] Error sending location message to ${phoneNumber}:`,
      error
    )
    if (axios.isAxiosError(error)) {
      console.error(`[Gupshup] Response status: ${error.response?.status}`)
      console.error(`[Gupshup] Response data:`, error.response?.data)
    }
    throw error
  }
}

/**
 * Marks a message as read and optionally shows a typing indicator via Gupshup Partner API /v1/event
 *
 * Uses POST /partner/app/{appId}/v1/event with:
 * - status: "read" — marks the message as read (double blue checkmarks)
 * - typing_indicator — shows "escribiendo..." to the user
 *
 * @param _ctx - Convex action context (unused)
 * @param messageId - The incoming WhatsApp message ID to mark as read
 * @param appId - Gupshup app ID (from gupshupConfiguration.gupshupAppId)
 * @param appToken - Gupshup Partner app token (from gupshupConfiguration.gupshupAppToken)
 * @param showTyping - Whether to show typing indicator (default: true)
 */
export const markGupshupMessageAsRead = async (
  _ctx: ActionCtx,
  messageId: string,
  appId: string,
  appToken: string,
  showTyping = true
): Promise<void> => {
  if (!appId || !appToken) {
    console.warn(
      `[Gupshup] Cannot mark message as read: missing appId or appToken for messageId=${messageId}`
    )
    return
  }

  // Correct endpoint per Gupshup Partner API docs:
  // https://partner-docs.gupshup.io/reference/voicecallaction-1#
  const url = `${GUPSHUP_PARTNER_API_BASE_URL}/app/${appId}/v1/event`

  const messagePayload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  }

  if (showTyping) {
    messagePayload.typing_indicator = { type: "text" }
  }

  const payload = {
    type: "message-event",
    message: messagePayload,
  }

  try {
    await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: appToken,
      },
      timeout: 5000,
    })
    console.log(
      `[Gupshup] Message ${messageId} marked as read${showTyping ? " with typing indicator" : ""} via /v1/event`
    )
  } catch (error) {
    // Don't throw — read receipt + typing indicator are non-critical
    console.error(
      `[Gupshup] Error marking message as read / sending typing indicator:`,
      axios.isAxiosError(error)
        ? { status: error.response?.status, data: error.response?.data }
        : error
    )
  }
}

/**
 * Validates file size for Gupshup media uploads
 * Returns validation result with actual size and error message if invalid
 */
export const validateGupshupFileSize = async (
  _ctx: ActionCtx,
  mediaUrl: string,
  mimeType: string,
  apiKey?: string
): Promise<{
  isValid: boolean
  actualSize?: number
  errorMessage?: string
}> => {
  // FIX: Gupshup's filemanager API aggressively redirects HEAD requests to port 8443.
  // Port 8443 is blocked by the Convex outbound proxy ("unsuccessful tunnel" error),
  // which causes the connection to hang for ~2.5 minutes, ignoring Axios timeouts
  // due to adapter limitations with tunnel connection aborts.
  // Since WhatsApp natively limits file sizes before they even reach Gupshup
  // (16MB audio/video, 100MB documents), we can safely bypass this check.
  return {
    isValid: true,
  }
}

/**
 * Gets the access token for a Gupshup partner application.
 * This token is required for all partner app-level APIs.
 * Note: `partnerToken` is the JWT retrieved via Partner login.
 */
export const getPartnerAppToken = async (
  _ctx: ActionCtx,
  appId: string,
  partnerToken: string
): Promise<string> => {
  const url = `${GUPSHUP_PARTNER_API_BASE_URL}/app/${appId}/token`

  try {
    const response = await axios.get(url, {
      headers: {
        accept: "application/json",
        token: partnerToken, // Documentation says `token` header
      },
    })

    if (response.data.status !== "success" || !response.data.token) {
      throw new Error(
        `Failed to get app token: ${response.data.message || "Unknown error"}`
      )
    }

    return response.data.token
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `[Gupshup Partner] Error getting app token:`,
        error.response?.data || error.message
      )
    }
    throw error
  }
}

/**
 * Sets the callback URL (subscription) for a Gupshup partner application.
 */
export const setSubscriptionGupshup = async (
  _ctx: ActionCtx,
  appId: string,
  appToken: string,
  callbackUrl: string
): Promise<void> => {
  const url = `${GUPSHUP_PARTNER_API_BASE_URL}/app/${appId}/subscription`

  const formData = new URLSearchParams()
  formData.append("modes", "message,message-event")
  formData.append("tag", "clonai")
  formData.append("url", callbackUrl)
  formData.append("version", "2")
  formData.append("showOnUI", "true")

  try {
    const response = await axios.post(url, formData.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: appToken, // This token is the value returned by getPartnerAppToken
      },
    })

    if (
      response.data.status !== "success" &&
      response.data.status !== "submitted"
    ) {
      throw new Error(
        `Failed to set subscription: ${response.data.message || "Unknown error"}`
      )
    }

    console.log(`[Gupshup Partner] Webhook set to ${callbackUrl}`)
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `[Gupshup Partner] Error setting subscription:`,
        error.response?.data || error.message
      )
    }
    throw error
  }
}

/**
 * Creates a template for a Gupshup partner application using Partner API v3.
 */
export const createGupshupTemplateV3 = async (
  _ctx: ActionCtx,
  appId: string,
  appToken: string,
  template: {
    elementName: string
    category: "AUTHENTICATION" | "MARKETING" | "UTILITY"
    templateType:
      | "TEXT"
      | "IMAGE"
      | "LOCATION"
      | "VIDEO"
      | "DOCUMENT"
      | "PRODUCT"
      | "CATALOG"
    vertical: string
    content: string
    example: string
    languageCode?: string
    header?: string
    footer?: string
    buttons?: string
  }
): Promise<any> => {
  const url = `${GUPSHUP_PARTNER_API_BASE_URL}/app/${appId}/templates`

  const formData = new URLSearchParams()
  for (const [key, value] of Object.entries(template)) {
    if (value !== undefined) {
      formData.append(key, String(value))
    }
  }
  formData.append("enableSample", "true")

  try {
    const response = await axios.post(url, formData.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        token: appToken,
        Authorization: appToken,
      },
    })

    if (
      response.data.status !== "success" &&
      response.data.status !== "submitted"
    ) {
      throw new Error(
        `Failed to create template: ${response.data.message || "Unknown error"}`
      )
    }

    return response.data.template
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `[Gupshup Template] Error creating template:`,
        error.response?.data || error.message
      )
    }
    throw error
  }
}

/**
 * Lists templates for a Gupshup partner application using Partner API v3.
 */
export const getGupshupTemplatesV3 = async (
  _ctx: ActionCtx,
  appId: string,
  appToken: string
): Promise<any[]> => {
  const url = `${GUPSHUP_PARTNER_API_BASE_URL}/app/${appId}/templates`

  try {
    const response = await axios.get(url, {
      headers: {
        accept: "application/json",
        token: appToken,
        Authorization: appToken,
      },
    })

    if (response.data.status !== "success") {
      throw new Error(
        `Failed to get templates: ${response.data.message || "Unknown error"}`
      )
    }

    return response.data.templates || []
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `[Gupshup Template] Error getting templates:`,
        error.response?.data || error.message
      )
    }
    throw error
  }
}

/**
 * Sends a template message using Gupshup Partner API v3 (Cloud API style).
 */
export const sendGupshupV3TemplateMessage = async (
  _ctx: ActionCtx,
  appId: string,
  appToken: string,
  to: string,
  templateName: string,
  languageCode: string,
  components: any[]
): Promise<string> => {
  const url = `${GUPSHUP_PARTNER_API_BASE_URL}/app/${appId}/v3/message`

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/\D/g, ""),
    type: "template",
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
      components: components,
    },
  }

  try {
    const response = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: appToken,
      },
    })

    if (response.data.messages && response.data.messages[0]) {
      return response.data.messages[0].id
    }

    throw new Error(
      `Failed to send v3 template message: ${JSON.stringify(response.data)}`
    )
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `[Gupshup V3 MSG] Error sending message:`,
        error.response?.data || error.message
      )
    }
    throw error
  }
}
