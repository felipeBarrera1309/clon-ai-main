import { v } from "convex/values"
import { internal } from "../_generated/api"
import { internalAction, internalMutation } from "../_generated/server"
import { saveUserMessage } from "./messages"

/**
 * Update message status based on Twilio webhook
 */
export const processTwilioStatusUpdate = internalMutation({
  args: {
    MessageSid: v.string(),
    SmsStatus: v.string(),
    ErrorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { MessageSid, SmsStatus, ErrorCode } = args

    // Map Twilio status to our status
    let status: "sent" | "delivered" | "read" | "failed" | null = null

    if (SmsStatus === "delivered") status = "delivered"
    else if (SmsStatus === "read") status = "read"
    else if (SmsStatus === "failed" || SmsStatus === "undelivered")
      status = "failed"
    else if (SmsStatus === "sent") status = "sent"

    if (!status) return // Ignore intermediate states like 'queued', 'sending'

    // 1. Update Campaign Recipient if exists
    const recipient = await ctx.db
      .query("campaignRecipients")
      .withIndex("by_whatsapp_message_id", (q) =>
        q.eq("whatsappMessageId", MessageSid)
      )
      .first()

    if (recipient) {
      // ✅ IDEMPOTENCY: Skip recipient update if already processed this status
      const skipRecipientUpdate = recipient.status === status

      if (!skipRecipientUpdate) {
        const oldStatus = recipient.status

        // ✅ FIX: Prevent backward status transitions to protect analytics integrity
        // Status hierarchy: sent(1) → delivered(2) → read(3), failed is terminal
        const statusHierarchy: Record<string, number> = {
          sent: 1,
          delivered: 2,
          read: 3,
          failed: 99, // Terminal state
        }

        const oldHierarchy = statusHierarchy[oldStatus] || 0
        const newHierarchy = statusHierarchy[status] || 0

        // Don't allow backward transitions (except to failed)
        if (oldHierarchy > newHierarchy && status !== "failed") {
          console.warn(
            `⚠️ [TWILIO STATUS] Rejecting backward transition ${oldStatus} → ${status} for recipient ${recipient._id}`
          )
          // Don't return — still need to check conversation message below
        } else {
          await ctx.db.patch(recipient._id, {
            status: status,
            // Update timestamps based on status
            ...(status === "delivered" ? { deliveredAt: Date.now() } : {}),
            ...(status === "read" ? { readAt: Date.now() } : {}),
            // Store error if failed
            ...(status === "failed"
              ? { errorMessage: ErrorCode || "Twilio delivery failed" }
              : {}),
          })
          console.log(
            `✅ [TWILIO STATUS] Updated campaign recipient ${recipient._id} to ${status}`
          )

          // Update Campaign stats if status changed
          if (oldStatus !== status) {
            // ✅ FIX: Use atomic delta-based updates to prevent race conditions
            // Calculate deltas for old and new status
            const deltas: {
              sentCount?: number
              deliveredCount?: number
              readCount?: number
              failedCount?: number
            } = {}

            // Decrement old status bucket
            if (oldStatus === "sent") {
              deltas.sentCount = -1
            } else if (oldStatus === "delivered") {
              deltas.deliveredCount = -1
            } else if (oldStatus === "read") {
              deltas.readCount = -1
            }

            // Increment new status bucket
            if (status === "sent") {
              deltas.sentCount = (deltas.sentCount || 0) + 1
            } else if (status === "delivered") {
              deltas.deliveredCount = (deltas.deliveredCount || 0) + 1
            } else if (status === "read") {
              deltas.readCount = (deltas.readCount || 0) + 1
            } else if (status === "failed") {
              deltas.failedCount = (deltas.failedCount || 0) + 1
            }

            // Apply atomic updates using delta-based mutation
            if (Object.keys(deltas).length > 0) {
              await ctx.runMutation(
                internal.system.bulkMessaging.updateCampaignStatsAtomic,
                {
                  campaignId: recipient.campaignId,
                  deltas,
                }
              )
              console.log(
                `📊 [TWILIO STATUS] Updated campaign stats (${oldStatus} → ${status}):`,
                deltas
              )
            }
          }
        }
      }
    }

    // 2. Update Conversation Message if exists
    const message = await ctx.db
      .query("conversationMessages")
      .withIndex("by_whatsapp_id", (q) => q.eq("whatsappMessageId", MessageSid))
      .first()

    if (message) {
      // ✅ IDEMPOTENCY: Skip if already at this status
      if (message.status === status) {
        return
      }

      // ✅ FIX: Apply the same backward-transition guard for conversation messages
      const statusHierarchy: Record<string, number> = {
        sent: 1,
        delivered: 2,
        read: 3,
        failed: 99, // Terminal state
      }

      const oldHierarchy = statusHierarchy[message.status || ""] || 0
      const newHierarchy = statusHierarchy[status] || 0

      // Don't allow backward transitions (except to failed)
      if (oldHierarchy > newHierarchy && status !== "failed") {
        console.warn(
          `⚠️ [TWILIO STATUS] Rejecting backward transition ${message.status} → ${status} for conversation message ${message._id}`
        )
        return
      }

      await ctx.db.patch(message._id, {
        status: status,
        ...(status === "failed" ? { errorMessage: ErrorCode } : {}),
      })
      console.log(
        `✅ [TWILIO STATUS] Updated conversation message ${message._id} to ${status}`
      )
    }
  },
})

/**
 * Process incoming Twilio WhatsApp webhook
 * This is completely separate from Meta webhook processing
 */
export const processTwilioWebhook = internalAction({
  args: {
    MessageSid: v.string(),
    AccountSid: v.string(), // ✅ CRITICAL: Subaccount identifier from webhook
    From: v.string(), // Customer's WhatsApp number (e.g., "whatsapp:+573001234567")
    To: v.string(), // Your Twilio WhatsApp number (e.g., "whatsapp:+14155238886")
    Body: v.optional(v.string()),
    NumMedia: v.optional(v.string()),
    MediaUrl0: v.optional(v.string()),
    MediaContentType0: v.optional(v.string()),
    SmsStatus: v.optional(v.string()),
    ProfileName: v.optional(v.string()),
    ErrorCode: v.optional(v.string()), // Add ErrorCode to args
  },
  handler: async (ctx, args) => {
    // Handle status updates
    if (args.SmsStatus && args.SmsStatus !== "received") {
      await ctx.runMutation(
        internal.system.twilioProcessor.processTwilioStatusUpdate,
        {
          MessageSid: args.MessageSid,
          SmsStatus: args.SmsStatus,
          ErrorCode: args.ErrorCode,
        }
      )
      return
    }

    const cleanNumber = (num: string) => num.replace("whatsapp:", "")
    const customerPhone = cleanNumber(args.From)
    const twilioPhone = cleanNumber(args.To)

    const twilioConfiguration = await ctx.runQuery(
      internal.system.twilio.getTwilioConfigurationByAccountSid,
      { accountSid: args.AccountSid }
    )

    if (!twilioConfiguration) {
      console.error(`[Twilio] No config for AccountSid: ${args.AccountSid}`)
      return
    }
    const { conversation, contact } = await ctx.runMutation(
      internal.system.twilio.processTwilioIncomingMessage,
      {
        contactPhoneNumber: customerPhone,
        contactDisplayName: args.ProfileName || customerPhone,
        twilioPhoneNumber: twilioPhone,
        fromWhatsApp: true,
      }
    )

    let savedMessageId: string | null = null

    const body = args.Body
    const mediaUrl = args.MediaUrl0
    const mediaContentType = args.MediaContentType0
    const numMedia = parseInt(args.NumMedia || "0")

    // 2. Save Message
    if (numMedia > 0 && mediaUrl && mediaContentType) {
      console.log(
        `🖼️ [TWILIO PROCESSOR] Received media: ${mediaContentType} (${mediaUrl})`
      )

      // Download media from Twilio with authentication
      let finalImageUrl = mediaUrl
      let finalStorageId = args.MessageSid

      try {
        const sid = twilioConfiguration.twilioAccountSid?.trim()
        const token = twilioConfiguration.twilioAuthToken?.trim()

        console.log(`🔐 [TWILIO PROCESSOR] Credentials check:`)
        console.log(`   - sid exists: ${!!sid}, length: ${sid?.length || 0}`)
        console.log(
          `   - token exists: ${!!token}, length: ${token?.length || 0}`
        )
        console.log(
          `   - token type: ${typeof twilioConfiguration.twilioAuthToken}`
        )

        if (sid && token) {
          // ✅ Extract AccountSid from media URL for validation
          const mediaUrlMatch = mediaUrl.match(/\/Accounts\/(AC[a-zA-Z0-9]+)\//)
          const mediaUrlAccountSid = mediaUrlMatch ? mediaUrlMatch[1] : null

          console.log(`🔐 [TWILIO PROCESSOR] Media download validation:`)
          console.log(`   - mediaUrl: ${mediaUrl}`)
          console.log(
            `   - mediaUrlAccountSid: AC****${mediaUrlAccountSid?.slice(-4)}`
          )
          console.log(`   - authAccountSidUsed: AC****${sid?.slice(-4)}`)

          // ✅ CRITICAL: Verify AccountSid consistency
          if (mediaUrlAccountSid && mediaUrlAccountSid !== sid) {
            console.error(`🚨 [TWILIO PROCESSOR] ACCOUNTSID MISMATCH DETECTED!`)
            console.error(`   Media URL contains: ${mediaUrlAccountSid}`)
            console.error(`   But using auth for: ${sid}`)
            console.error(`   This will cause 401 Unauthorized`)
            throw new Error(
              `AccountSid mismatch: URL has ${mediaUrlAccountSid} but using ${sid} for auth`
            )
          }

          console.log(
            `✅ [TWILIO PROCESSOR] AccountSid match verified. Downloading...`
          )

          const auth = btoa(`${sid}:${token}`)
          console.log(
            `🖼️ [TWILIO PROCESSOR] Attempting to download media from Twilio...`
          )
          console.log(
            `🔐 [TWILIO PROCESSOR] Auth token length: ${token?.length || 0}, starts with: ${token?.substring(0, 4)}...`
          )

          // ⚠️ IMPORTANT: Twilio media URLs redirect to a CDN (cross-origin)
          // The Authorization header is dropped on cross-origin redirects for security
          // So we need to handle redirects manually
          let currentUrl = mediaUrl
          let response: Response

          // Follow redirects manually to preserve auth header on first request
          // and get the final URL which doesn't need auth
          for (let i = 0; i < 5; i++) {
            response = await fetch(currentUrl, {
              headers: i === 0 ? { Authorization: `Basic ${auth}` } : {},
              redirect: "manual",
            })

            console.log(
              `🔐 [TWILIO PROCESSOR] Fetch attempt ${i + 1}: status=${response.status}, url=${currentUrl}`
            )

            // If it's a redirect, follow it (the redirected URL is usually a signed CDN URL that doesn't need auth)
            if (response.status >= 300 && response.status < 400) {
              const location = response.headers.get("location")
              if (location) {
                currentUrl = location
                console.log(
                  `🔐 [TWILIO PROCESSOR] Following redirect to: ${location.substring(0, 100)}...`
                )
                continue
              }
            }
            break
          }

          console.log(
            `🔐 [TWILIO PROCESSOR] Final response status: ${response!.status}`
          )

          if (response!.ok) {
            const blob = await response!.blob()
            console.log(
              `🖼️ [TWILIO PROCESSOR] Downloaded ${blob.size} bytes. Storing...`
            )

            // Store in R2 using the same method as WhatsApp
            const { R2 } = await import("@convex-dev/r2")
            const { components } = await import("../_generated/api")
            const { env } = await import("../lib/env")
            const { generateR2Key } = await import("../model/whatsapp")

            const r2 = new R2(components.r2)
            const storageKey = generateR2Key(mediaContentType)

            const storageId = await r2.store(ctx, blob, {
              type: mediaContentType,
              key: storageKey,
            })

            // Get the public URL for the stored file (same as WhatsApp)
            const publicUrl = `${env.R2_PUBLIC_URL}/${storageId}`

            finalImageUrl = publicUrl
            finalStorageId = storageId
            console.log(
              `✅ [TWILIO PROCESSOR] Media successfully stored in R2. Public URL: ${publicUrl}`
            )
          } else {
            console.warn(
              `⚠️ [TWILIO PROCESSOR] Failed to download media from Twilio. Status: ${response!.status} ${response!.statusText}`
            )
            console.warn(
              `⚠️ [TWILIO PROCESSOR] This usually means the twilioAuthToken in the database is incorrect or expired. Please update it in the WhatsApp configuration.`
            )
            // Log response body for debugging if possible
            try {
              const errorText = await response!.text()
              console.warn(
                `⚠️ [TWILIO PROCESSOR] Error body: ${errorText.substring(0, 200)}`
              )
            } catch (e) {
              /* ignore */
            }
          }
        } else {
          console.warn(
            "⚠️ [TWILIO PROCESSOR] Missing Twilio credentials for media download"
          )
        }
      } catch (error) {
        console.error(
          "❌ [TWILIO PROCESSOR] Unexpected error processing media:",
          error
        )
      }

      // Determine type based on content type
      const isImage = mediaContentType.startsWith("image/")
      const isAudio = mediaContentType.startsWith("audio/")

      if (isImage) {
        // Analyze image content
        let imageAnalysis = ""
        try {
          const { analyzeImageUrl } = await import("../public/files")
          imageAnalysis = await analyzeImageUrl(finalImageUrl)
          console.log("🖼️ [TWILIO PROCESSOR] Image analyzed successfully")
        } catch (error) {
          console.error("❌ [TWILIO PROCESSOR] Image analysis failed:", error)
          imageAnalysis = "[Error al analizar imagen]"
        }

        // Combine original caption with image analysis
        const finalCaption = body
          ? `${body}\n\nAnálisis de la imagen: ${imageAnalysis}`
          : imageAnalysis

        savedMessageId = await saveUserMessage(ctx, {
          type: "image",
          conversation,
          contact,
          attachment: {
            imageUrl: finalImageUrl,
            mimeType: mediaContentType,
            caption: finalCaption,
            storageId: finalStorageId,
          },
        })

        // Save to conversationMessages for dashboard display
        await ctx.runMutation(
          internal.system.conversationMessages.saveInboundMessage,
          {
            conversationId: conversation._id,
            organizationId: conversation.organizationId,
            whatsappMessageId: args.MessageSid,
            type: "image",
            content: {
              text: body,
              media: {
                url: finalImageUrl,
                mimeType: mediaContentType,
                caption: body,
                storageId: finalStorageId,
              },
            },
            whatsappTimestamp: Math.floor(Date.now() / 1000),
          }
        )
      } else if (isAudio) {
        // Transcribe audio content
        let transcription = ""
        try {
          const { transcribeAudioFileUrl } = await import("../public/files")
          transcription = await transcribeAudioFileUrl(finalImageUrl)
          console.log("🎵 [TWILIO PROCESSOR] Audio transcribed successfully")
        } catch (error) {
          console.error(
            "❌ [TWILIO PROCESSOR] Audio transcription failed:",
            error
          )
          transcription = "[Error al transcribir audio]"
        }

        savedMessageId = await saveUserMessage(ctx, {
          type: "file",
          conversation,
          contact,
          attachment: {
            dataUrl: finalImageUrl,
            mimeType: mediaContentType,
            caption: transcription,
            storageId: finalStorageId,
          },
        })

        // Save to conversationMessages for dashboard display
        await ctx.runMutation(
          internal.system.conversationMessages.saveInboundMessage,
          {
            conversationId: conversation._id,
            organizationId: conversation.organizationId,
            whatsappMessageId: args.MessageSid,
            type: "audio",
            content: {
              text: transcription,
              media: {
                url: finalImageUrl,
                mimeType: mediaContentType,
                caption: transcription,
                storageId: finalStorageId,
              },
            },
            whatsappTimestamp: Math.floor(Date.now() / 1000),
          }
        )
      } else {
        // Default to file for other media (pdf, etc)
        savedMessageId = await saveUserMessage(ctx, {
          type: "file",
          conversation,
          contact,
          attachment: {
            dataUrl: finalImageUrl,
            mimeType: mediaContentType,
            caption: body || undefined,
            storageId: finalStorageId,
          },
        })

        // Save to conversationMessages for dashboard display
        await ctx.runMutation(
          internal.system.conversationMessages.saveInboundMessage,
          {
            conversationId: conversation._id,
            organizationId: conversation.organizationId,
            whatsappMessageId: args.MessageSid,
            type: "document",
            content: {
              text: body,
              media: {
                url: finalImageUrl,
                mimeType: mediaContentType,
                caption: body,
                storageId: finalStorageId,
              },
            },
            whatsappTimestamp: Math.floor(Date.now() / 1000),
          }
        )
      }
    } else if (body) {
      // Handle Text
      savedMessageId = await saveUserMessage(ctx, {
        type: "text",
        conversation,
        contact,
        prompt: body,
      })

      // Save to conversationMessages for dashboard display
      await ctx.runMutation(
        internal.system.conversationMessages.saveInboundMessage,
        {
          conversationId: conversation._id,
          organizationId: conversation.organizationId,
          whatsappMessageId: args.MessageSid,
          type: "text",
          content: { text: body },
          whatsappTimestamp: Math.floor(Date.now() / 1000),
        }
      )
    }

    // Cancel any pending order confirmation reminder or inactivity timers when user responds
    if (savedMessageId) {
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

    // 3. Trigger Agent Response
    if (savedMessageId && conversation.status === "unresolved") {
      console.log("⏰ [TWILIO PROCESSOR] Scheduling agent response")
      await ctx.runMutation(
        internal.system.responseDebounceScheduler.scheduleAgentResponse,
        {
          twilioConfiguration: twilioConfiguration,
          conversation: conversation,
          contact: contact,
          messageId: savedMessageId,
        }
      )
    }
  },
})
