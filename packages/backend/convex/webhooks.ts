import { saveMessage } from "@convex-dev/agent"
import { components, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { httpAction } from "./_generated/server"
import { formatFileSize, getFileSizeLimit } from "./lib/constants"

import { processIncomingMessage } from "./lib/whatsapp"
import type {
  WhatsAppMessageValue,
  WhatsAppWebhookPayload,
} from "./lib/whatsappTypes"
import { downloadAndStoreMediaR2Widget, verifyWebhook } from "./model/whatsapp"
import { analyzeImageUrl, transcribeAudioFileUrl } from "./public/files"
import { saveUserMessage } from "./system/messages"

export const whatsappGetWebhook = httpAction(async (_ctx, request) => {
  const url = new URL(request.url)
  const mode = url.searchParams.get("hub.mode") || ""
  const token = url.searchParams.get("hub.verify_token") || ""
  const challenge = url.searchParams.get("hub.challenge") || ""
  const challengeResponse = await verifyWebhook(mode, token, challenge)
  if (challengeResponse) {
    return new Response(challengeResponse, { status: 200 })
  }
  return new Response(null, { status: 403 })
})

export const whatsappPostWebhook = httpAction(async (ctx, request) => {
  const payload = (await request.json()) as WhatsAppWebhookPayload
  // Schedule async processing immediately
  await ctx.scheduler.runAfter(
    0,
    internal.system.whatsappAsyncProcessor.processWhatsAppWebhookMessage,
    {
      payload,
    }
  )
  // Respond immediately to WhatsApp to prevent timeout
  console.log(
    "📱 [WEBHOOK] Scheduled async processing and responding to WhatsApp"
  )
  return new Response("OK", { status: 200 })
})

/**
 * 360dialog WhatsApp webhook endpoint
 *
 * Receives incoming messages from 360dialog and processes them.
 * 360dialog uses the same payload format as Meta's Cloud API.
 */
export const dialog360PostWebhook = httpAction(async (ctx, request) => {
  try {
    const payload = (await request.json()) as WhatsAppWebhookPayload

    console.log("📱 [360DIALOG-WEBHOOK] Received 360dialog webhook")

    // Schedule async processing immediately
    await ctx.scheduler.runAfter(
      0,
      internal.system.dialog360Processor.processDialog360WebhookMessage,
      {
        payload,
      }
    )

    // Respond immediately to 360dialog to prevent timeout
    console.log(
      "📱 [360DIALOG-WEBHOOK] Scheduled async processing and responding to 360dialog"
    )
    return new Response("OK", { status: 200 })
  } catch (error) {
    console.error(
      "❌ [360DIALOG-WEBHOOK] Error processing 360dialog webhook:",
      error
    )
    // Still return 200 to prevent retries for malformed payloads
    return new Response("OK", { status: 200 })
  }
})

/**
 * Gupshup WhatsApp webhook endpoint
 *
 * Receives incoming messages from Gupshup and processes them.
 * Gupshup uses its own webhook payload format.
 */
export const gupshupPostWebhook = httpAction(async (ctx, request) => {
  try {
    // Read raw body for signature verification
    const rawBody = await request.text()

    // Validate webhook signature if GUPSHUP_WEBHOOK_SECRET is configured
    // SECURITY TRADE-OFF: If GUPSHUP_WEBHOOK_SECRET is not set, webhook signature validation
    // is bypassed. This carries a risk of spoofed messages if the endpoint URL is discovered.
    // It is highly recommended to set this environment variable in production.
    const webhookSecret = process.env.GUPSHUP_WEBHOOK_SECRET
    if (webhookSecret) {
      const signature = request.headers.get("x-hub-signature-256") || ""
      if (!signature) {
        console.error("❌ [GUPSHUP-WEBHOOK] Missing x-hub-signature-256 header")
        return new Response("Unauthorized", { status: 401 })
      }

      const { createHmac } = await import("node:crypto")
      const expectedSignature =
        "sha256=" +
        createHmac("sha256", webhookSecret).update(rawBody).digest("hex")

      if (signature !== expectedSignature) {
        console.error("❌ [GUPSHUP-WEBHOOK] Invalid webhook signature")
        return new Response("Unauthorized", { status: 401 })
      }
    } else {
      console.warn(
        "⚠️ [GUPSHUP-WEBHOOK] GUPSHUP_WEBHOOK_SECRET is not configured. Webhook signature validation is DISABLED. Set this variable in production to prevent message spoofing."
      )
    }

    let payload
    try {
      payload = JSON.parse(rawBody)
    } catch (e) {
      console.error("❌ [GUPSHUP-WEBHOOK] Invalid JSON payload")
      return new Response("Bad Request", { status: 400 })
    }

    console.log("📱 [GUPSHUP-WEBHOOK] Received Gupshup webhook")
    console.log(
      "📦 [GUPSHUP-WEBHOOK] Payload metadata:",
      JSON.stringify({
        app: payload.app || payload.gs_app_id,
        type: payload.type || payload.object,
      })
    )

    // V3 format uses gs_app_id at root level, V2 uses app
    const appName = payload.app || payload.gs_app_id || "UNKNOWN"
    // V3 format uses 'object' for type, V2 uses 'type'
    const eventType = payload.type || payload.object || "UNKNOWN"

    console.log(`🔑 [GUPSHUP-WEBHOOK] App: ${appName}, Type: ${eventType}`)

    // Schedule async processing immediately
    await ctx.scheduler.runAfter(
      0,
      internal.system.gupshupProcessor.processGupshupWebhookMessage,
      {
        payload: rawBody,
      }
    )

    // Respond immediately to Gupshup to prevent timeout
    console.log(
      "📱 [GUPSHUP-WEBHOOK] Scheduled async processing and responding to Gupshup"
    )
    return new Response("OK", { status: 200 })
  } catch (error) {
    console.error(
      "❌ [GUPSHUP-WEBHOOK] Error processing Gupshup webhook:",
      error
    )
    // Still return 200 to prevent retries for malformed payloads
    return new Response("OK", { status: 200 })
  }
})

/**
 * Gupshup validation endpoint (GET)
 */
export const gupshupGetWebhook = httpAction(async (_ctx, _request) => {
  console.log("📱 [GUPSHUP-WEBHOOK] Received GET validation request")
  return new Response("OK", { status: 200 })
})

/**
 * Twilio WhatsApp webhook endpoint
 *
 * Receives incoming messages from Twilio and processes them with dedicated Twilio logic.
 * This is completely separate from Meta webhook processing.
 *
 * IMPORTANT — TwiML response body:
 * Twilio treats the HTTP response body as a TwiML document. If you return plain
 * text (e.g. "OK"), Twilio will deliver that text as a WhatsApp message to the
 * contact. An empty <Response/> tells Twilio to acknowledge receipt and send
 * nothing back to the user.
 */
const TWILIO_EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>'
const TWILIO_TWIML_HEADERS = { "Content-Type": "text/xml" }

export const twilioPostWebhook = httpAction(async (ctx, request) => {
  try {
    const formData = await request.formData()

    const formDataObj: Record<string, string> = {}
    formData.forEach((value, key) => {
      formDataObj[key] = value.toString()
    })

    const accountSid = formDataObj.AccountSid

    if (!accountSid) {
      console.warn(
        "[Twilio Webhook] Missing AccountSid in webhook payload, ignoring"
      )
      return new Response(TWILIO_EMPTY_TWIML, {
        status: 200,
        headers: TWILIO_TWIML_HEADERS,
      })
    }

    const twilioConfig = await ctx.runQuery(
      internal.private.whatsappConfigurations.getByTwilioAccountSidInternal,
      { accountSid }
    )

    if (!twilioConfig) {
      console.warn(
        `[Twilio Webhook] Unknown AccountSid: ${accountSid}, ignoring`
      )
      return new Response(TWILIO_EMPTY_TWIML, {
        status: 200,
        headers: TWILIO_TWIML_HEADERS,
      })
    }

    const status = formDataObj.SmsStatus || formDataObj.MessageStatus
    if (formDataObj.ErrorCode) {
      console.warn(
        `[Twilio] Error ${formDataObj.ErrorCode}: ${formDataObj.ErrorMessage}`
      )
    }

    await ctx.scheduler.runAfter(
      0,
      internal.system.twilioProcessor.processTwilioWebhook,
      {
        MessageSid: formDataObj.MessageSid || "",
        AccountSid: formDataObj.AccountSid || "",
        From: formDataObj.From || "",
        To: formDataObj.To || "",
        Body: formDataObj.Body,
        NumMedia: formDataObj.NumMedia,
        MediaUrl0: formDataObj.MediaUrl0,
        MediaContentType0: formDataObj.MediaContentType0,
        SmsStatus: status,
        ProfileName: formDataObj.ProfileName,
        ErrorCode: formDataObj.ErrorCode,
      }
    )

    // Return empty TwiML — NOT plain text — so Twilio sends nothing to the user
    return new Response(TWILIO_EMPTY_TWIML, {
      status: 200,
      headers: TWILIO_TWIML_HEADERS,
    })
  } catch (error) {
    console.error("[Twilio Webhook] EXCEPTION processing webhook:", error)
    console.error("[Twilio Webhook] Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    // Return empty TwiML even on exceptions to prevent retries AND spurious "OK" messages
    return new Response(TWILIO_EMPTY_TWIML, {
      status: 200,
      headers: TWILIO_TWIML_HEADERS,
    })
  }
})

// export const widgetIncoming = httpAction(
//   async (ctx, request: Request): Promise<Response> => {
//     try {
//       const payload = (await request.json()) as WhatsAppWebhookPayload

//       // Schedule async processing immediately
//       await ctx.scheduler.runAfter(
//         0,
//         internal.system.whatsappAsyncProcessor.processWhatsAppWebhookMessage,
//         {
//           payload,
//         }
//       )

//       // Respond immediately to prevent timeout
//       console.log(
//         "📱 [WIDGET] Scheduled async processing and responding to widget"
//       )

//       return new Response("Mensaje procesado correctamente", {
//         status: 200,
//         headers: {
//           "Access-Control-Allow-Origin": "*",
//           "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
//           "Access-Control-Allow-Headers": "Content-Type",
//         },
//       })
//     } catch (error) {
//       console.error(
//         "❌ [WIDGET] Error procesando el mensaje de widget:",
//         error
//       )
//       return new Response("Error procesando mensaje", {
//         status: 500,
//         headers: {
//           "Access-Control-Allow-Origin": "*",
//           "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
//           "Access-Control-Allow-Headers": "Content-Type",
//         },
//       })
//     }
//   }
// )

// Keep the original widget webhook as a backup/reference (this can be removed later)
export const widgetIncoming = httpAction(
  async (ctx, request: Request): Promise<Response> => {
    try {
      const payload = (await request.json()) as WhatsAppWebhookPayload

      // Validate payload structure before accessing nested properties
      if (!payload.entry || payload.entry.length === 0) {
        return new Response("Invalid payload: no entry", { status: 200 })
      }

      const entry = payload.entry[0]
      if (!entry) {
        return new Response("Invalid payload: entry is undefined", {
          status: 200,
        })
      }

      if (!entry.changes || entry.changes.length === 0) {
        return new Response("Invalid payload: no changes", { status: 200 })
      }

      const change = entry.changes[0]
      if (!change) {
        return new Response("Invalid payload: no change", { status: 200 })
      }

      const value = change.value as WhatsAppMessageValue

      if (request.method === "POST") {
        if (!value) {
          return new Response("No se pudo procesar el mensaje", { status: 200 })
        }
        const message = await processIncomingMessage(value)

        if (!message) {
          return new Response("No se pudo procesar el mensaje", { status: 200 })
        }
        const {
          contactPhoneNumber,
          contactDisplayName,
          text,
          image,
          audio,
          document,
          businessDisplayPhoneNumber,
        } = message

        const whatsappConfiguration = await ctx.runQuery(
          internal.system.whatsappConfiguration.getByPhoneNumber,
          {
            phoneNumber: businessDisplayPhoneNumber,
          }
        )
        if (!whatsappConfiguration) {
          return new Response("No se pudo procesar el mensaje", { status: 200 })
        }

        if (!whatsappConfiguration.phoneNumberId) {
          console.error("❌ [WEBHOOK] Missing phoneNumberId in configuration")
          return new Response("Configuración de WhatsApp incompleta", {
            status: 200,
          })
        }

        console.log(
          "🔍 [WEBHOOK-PROCESADO] Whatsapp configuration:",
          whatsappConfiguration
        )

        const { conversation, contact } = await ctx.runMutation(
          internal.system.whatsapp.processIncomingMessage,
          {
            contactPhoneNumber,
            contactDisplayName,
            businessPhoneNumberId:
              whatsappConfiguration.phoneNumberId as string,
            businessDisplayPhoneNumber: businessDisplayPhoneNumber,
            fromWhatsApp: false, // Widget messages don't count as WhatsApp messages for lastMessageAt
          }
        )

        if (text) {
          console.log("📝 [WEBHOOK-PROCESADO] Mensaje de texto:", text)
          const savedMessageId = await saveUserMessage(ctx, {
            type: "text",
            conversation: conversation,
            contact: contact,
            prompt: text,
          })

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

          if (savedMessageId && conversation.status === "unresolved") {
            console.log("🤖 [WIDGET] Generating agent response immediately")
            await ctx.runAction(
              internal.system.messages.generateAgentResponseAction,
              {
                conversationId: conversation._id,
                threadId: conversation.threadId,
                organizationId: conversation.organizationId,
                messageId: savedMessageId,
              }
            )
          }
        }

        if (image) {
          console.log("🖼️ [WEBHOOK-PROCESADO] Mensaje de imagen:", image)
          const imageId = image.id as Id<"_storage">

          const imageUrl = await ctx.storage.getUrl(imageId)
          if (!imageUrl) {
            console.error(
              "❌ [WEBHOOK-EXTRACTED] Image URL not found for storage ID:",
              image.id
            )
            // ✅ Return 200 to prevent Meta retries
            console.warn(
              "[WEBHOOK] Image URL not found, but returning 200 to prevent retries"
            )
            return new Response("OK", { status: 200 })
          }
          console.log(
            "🖼️ [WEBHOOK-EXTRACTED] Downloading image from WhatsApp storage..."
          )
          const { blob, storageId, url } = await downloadAndStoreMediaR2Widget(
            ctx,
            imageUrl,
            image.mime_type
          )
          if (!blob) {
            console.error(
              "❌ [WEBHOOK-EXTRACTED] Failed to download image file"
            )
            // ✅ Return 200 to prevent Meta retries
            console.warn(
              "[WEBHOOK] Failed to download image, but returning 200 to prevent retries"
            )
            return new Response("OK", { status: 200 })
          }
          // Use R2 URL directly (no Convex storage)
          const imageUrlConvex = url

          if (!imageUrlConvex) {
            console.error(
              "❌ [WEBHOOK-EXTRACTED] Failed to get R2 URL for image"
            )
            // ✅ Return 200 to prevent Meta retries
            console.warn(
              "[WEBHOOK] Failed to get R2 URL for image, but returning 200 to prevent retries"
            )
            return new Response("OK", { status: 200 })
          }

          // Analyze image content
          let imageAnalysis = ""
          try {
            imageAnalysis = await analyzeImageUrl(imageUrlConvex)
            console.log("🖼️ [WEBHOOK-EXTRACTED] Image analyzed successfully")
          } catch (error) {
            console.error(
              "❌ [WEBHOOK-EXTRACTED] Image analysis failed:",
              error
            )
            imageAnalysis =
              "[Error al analizar imagen, no se pudo analizar el contenido de la imagen]"
          }

          // Combine original caption with image analysis
          const finalCaption = image.caption
            ? `${image.caption}\n\nAnálisis de la imagen: ${imageAnalysis}`
            : imageAnalysis

          const savedMessageId = await saveUserMessage(ctx, {
            type: "image",
            conversation: conversation,
            contact: contact,
            attachment: {
              imageUrl: imageUrlConvex,
              mimeType: image.mime_type,
              caption: finalCaption,
              storageId: storageId,
            },
          })

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

          if (savedMessageId && conversation.status === "unresolved") {
            console.log("🤖 [WIDGET] Generating agent response immediately")
            await ctx.runAction(
              internal.system.messages.generateAgentResponseAction,
              {
                conversationId: conversation._id,
                threadId: conversation.threadId,
                organizationId: conversation.organizationId,
                messageId: savedMessageId,
              }
            )
          }
        }

        if (audio) {
          console.log("🎵 [WEBHOOK-PROCESADO] Mensaje de audio:", audio)
          const originalAudioId = audio.id as Id<"_storage">
          const originalAudioUrl = await ctx.storage.getUrl(originalAudioId)
          if (!originalAudioUrl) {
            console.error(
              "❌ [WEBHOOK-EXTRACTED] Original audio URL not found for storage ID:",
              audio.id
            )
            return new Response(
              "Error procesando audio, no se encontró la URL del audio",
              // ✅ Return 200 to prevent Meta retries
              { status: 200 }
            )
          }
          const { blob, storageId, url } = await downloadAndStoreMediaR2Widget(
            ctx,
            originalAudioUrl,
            audio.mime_type
          )
          if (!blob) {
            console.error(
              "❌ [WEBHOOK-EXTRACTED] Original audio URL not found for storage ID:",
              audio.id
            )
            return new Response(
              "Error procesando audio, no se encontró la URL del audio",
              { status: 500 }
            )
          }
          // Use R2 URL directly (no Convex storage)
          const audioUrlConvex = url

          if (!audioUrlConvex) {
            console.error(
              "❌ [WEBHOOK-EXTRACTED] Failed to get R2 URL for audio"
            )
            // ✅ Return 200 to prevent Meta retries
            console.warn(
              "[WEBHOOK] Failed to store audio, but returning 200 to prevent retries"
            )
            return new Response("OK", { status: 200 })
          }

          console.log(
            "🎵 [WEBHOOK-EXTRACTED] Processing audio for transcription..."
          )
          let transcription = ""
          try {
            transcription = await transcribeAudioFileUrl(audioUrlConvex)
            console.log(
              "🎵 [WEBHOOK-EXTRACTED] Transcription completed:",
              `${transcription.substring(0, 100)}...`
            )
          } catch (error) {
            console.error(
              "❌ [WEBHOOK-EXTRACTED] Error transcribing audio:",
              error
            )
            transcription =
              "[Error al transcribir audio, no se pudo transcribir el audio]"
          }

          // Create agent message with audio file and transcription
          console.log(
            "🎵 [WEBHOOK-EXTRACTED] Creating agent message with audio file and transcription..."
          )
          console.log("🎵 [WEBHOOK-EXTRACTED] Audio URL:", audioUrlConvex)
          console.log(
            "🎵 [WEBHOOK-EXTRACTED] Audio MIME type:",
            audio.mime_type
          )
          console.log("🎵 [WEBHOOK-EXTRACTED] Transcription:", transcription)
          const savedMessageId = await saveUserMessage(ctx, {
            type: "file",
            conversation: conversation,
            contact: contact,
            attachment: {
              dataUrl: audioUrlConvex,
              mimeType: audio.mime_type,
              caption: transcription,
              storageId: storageId,
            },
          })

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

          if (savedMessageId && conversation.status === "unresolved") {
            console.log("🤖 [WIDGET] Generating agent response immediately")
            await ctx.runAction(
              internal.system.messages.generateAgentResponseAction,
              {
                conversationId: conversation._id,
                threadId: conversation.threadId,
                organizationId: conversation.organizationId,
                messageId: savedMessageId,
              }
            )
          }
        }

        if (document) {
          console.log("📄 [WEBHOOK-PROCESADO] Mensaje de documento:", document)

          const documentId = document.id as Id<"_storage">

          const documentUrl = await ctx.storage.getUrl(documentId)
          if (!documentUrl) {
            console.error(
              "❌ [WEBHOOK-EXTRACTED] Document URL not found for storage ID:",
              document.id
            )
            // ✅ Return 200 to prevent Meta retries
            console.warn(
              "[WEBHOOK] Document URL not found, but returning 200 to prevent retries"
            )
            return new Response("OK", { status: 200 })
          }
          const { blob, storageId, url } = await downloadAndStoreMediaR2Widget(
            ctx,
            documentUrl,
            document.mime_type
          )
          if (!blob) {
            console.error(
              "❌ [WEBHOOK-EXTRACTED] Failed to download document file"
            )
            return new Response(
              "Error descargando documento, no se pudo descargar el archivo",
              { status: 500 }
            )
          }

          const sizeLimit = getFileSizeLimit(document.mime_type)
          if (blob.size > sizeLimit) {
            console.error(
              `❌ [WEBHOOK-EXTRACTED] Document too large: ${formatFileSize(blob.size)} > ${formatFileSize(sizeLimit)}`
            )
            return new Response(
              `Documento demasiado grande (${formatFileSize(blob.size)}). Máximo permitido: ${formatFileSize(sizeLimit)}`,
              { status: 200 }
            )
          }

          // Use R2 URL directly (no Convex storage)
          const documentUrlConvex = url

          if (!documentUrlConvex) {
            console.error(
              "❌ [WEBHOOK-EXTRACTED] Failed to get R2 URL for document"
            )
            // ✅ Return 200 to prevent Meta retries
            console.warn(
              "[WEBHOOK] Failed to store document, but returning 200 to prevent retries"
            )
            return new Response("OK", { status: 200 })
          }

          const documentDescription = `El cliente ha enviado un documento: ${document.filename || "archivo sin nombre"} (${document.mime_type}) - URL: ${documentUrlConvex}${document.caption ? `\nMensaje del cliente: "${document.caption}"` : ""}. No podemos procesar este tipo de archivo.`

          await saveMessage(ctx, components.agent, {
            threadId: conversation.threadId,
            prompt: documentDescription,
          })

          await saveMessage(ctx, components.agent, {
            threadId: conversation.threadId,
            message: {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Solo podemos procesar mensajes de texto, imágenes y audios. Los documentos no son compatibles en este momento.",
                },
              ],
            },
          })
        }

        return new Response("Mensaje procesado correctamente", {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        })
      }

      return new Response("Método no permitido", {
        status: 405,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      })
    } catch (error) {
      console.error(
        "❌ [WEBHOOK-EXTRACTED] Error procesando el mensaje de WhatsApp:",
        error
      )
      return new Response("Error procesando mensaje", {
        // ✅ Return 200 to prevent Meta retries even on unexpected errors
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      })
    }
  }
)

export const widgetOptions = httpAction(async (_ctx, request) => {
  // Handle CORS preflight request
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    })
  }

  return new Response("Método no permitido", { status: 405 })
})
