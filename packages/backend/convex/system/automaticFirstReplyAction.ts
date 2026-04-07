"use node"

import { saveMessage } from "@convex-dev/agent"
import { v } from "convex/values"
import { components, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import type { ActionCtx } from "../_generated/server"
import { internalAction } from "../_generated/server"
import { env } from "../lib/env"
import { buildClosedScheduleMessage } from "../lib/scheduleUtils"
import { generateAgentResponse } from "./messages"

// Helper to extract filename from storage ID (same as sendMenuFiles.ts)
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

// Helper to get URL for a storage ID (supports both Convex and R2 storage)
async function getStorageUrl(
  ctx: ActionCtx,
  storageId: string
): Promise<string | null> {
  // Check if it's an R2 path (contains "/")
  if (storageId.includes("/")) {
    return `${env.R2_PUBLIC_URL}/${storageId}`
  }
  // Otherwise, it's a Convex storage ID
  return await ctx.storage.getUrl(storageId as Id<"_storage">)
}
// Simple greeting patterns that don't need agent follow-up
const SIMPLE_GREETING_PATTERNS = [
  /^hola!?$/i,
  /^buenos?\s*(d[ií]as?|tardes?|noches?)!?$/i,
  /^buenas!?$/i,
  /^buen\s+d[ií]a!?$/i,
  /^hi!?$/i,
  /^hey!?$/i,
  /^hello!?$/i,
  /^qu[eé]\s+tal\??$/i,
  /^c[oó]mo\s+est[aá]n?\??$/i,
  /^saludos!?$/i,
]

// Patterns dealing with menu requests
const MENU_REQUEST_PATTERNS = [
  /carta/i,
  /menú/i,
  /menu/i,
  /qu[eé]\s+(tienen|venden|hay)\??/i,
  /productos/i,
  /opciones/i,
]

// Define patterns that suggest the user needs more info than just the menu (price, schedule, location, etc.)
// These are "clarification questions" that the menu file might not immediately answer or that warrant interaction.
const NEEDS_AGENT_CLARIFICATION_PATTERNS = [
  // Price & Cost
  /\bpreci(o|os)\b/i,
  /\bcosto(s)?\b/i,
  /\bvalor(es)?\b/i,
  /\bcu[aá]nto(s)?\b/i,

  // Location & Schedule
  /\bhorario(s)?\b/i,
  /\babr(e|en)\b/i,
  /\bcierr(a|an)\b/i,
  /\bubicaci[oó]n\b/i,
  /\bd[oó]nde\b/i,

  // Services
  /\bdomicilio(s)?\b/i,
  /\benv[ií]o(s)?\b/i,
  /\batenci[oó]n\b/i,
  /\bservicio(s)?\b/i,
  /\binfo\b/i,
  /\binformaci[oó]n\b/i,

  // Product details
  /\bvegetarian[oa]s?\b/i,
  /\bvegan[oa]s?\b/i,
  /\bal[eé]rgenos\b/i,
  /\brecomienda(s)?\b/i,
  /\bsugerencia(s)?\b/i,
  /\bfavorito(s)?\b/i,
  /\bpromoci[oó]n(es)?\b/i,
  /\bpromo(s)?\b/i,
  /\bdescuento(s)?\b/i,
  /\bingredientes?\b/i,
]

/**
 * Send automatic first reply to a conversation.
 * This bypasses the AI agent for the first message and sends a deterministic response.
 *
 * Simplified approach:
 * - Sends the configured text message
 * - Optionally sends the restaurant's menu (using existing menuType/menuUrl/menuImages/menuPdf)
 * - Then invokes the agent for potential follow-up
 *
 * Flow:
 * 1. Send text message via WhatsApp (with URL appended if menuType is 'url')
 * 2. Send menu images/PDF if sendMenu is enabled
 * 3. Save messages to conversationMessages (dashboard display)
 * 4. Save text message to agent thread (context for future AI responses)
 * 5. Invoke generateAgentResponse to handle any questions beyond the greeting
 */
export const sendAutomaticFirstReply = internalAction({
  args: {
    conversationId: v.id("conversations"),
    organizationId: v.string(),
    threadId: v.string(),
    contactPhoneNumber: v.string(),
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
    twilioConfigurationId: v.optional(v.id("whatsappConfigurations")),
    dialog360ConfigurationId: v.optional(v.id("whatsappConfigurations")),
    gupshupConfigurationId: v.optional(v.id("whatsappConfigurations")),
    messageId: v.string(), // The user's message ID for agent context
    // Automatic reply configuration
    message: v.string(),
    sendMenu: v.boolean(),
    // Menu configuration (from restaurantConfiguration)
    menuType: v.optional(
      v.union(v.literal("images"), v.literal("pdf"), v.literal("url"))
    ),
    menuUrl: v.optional(v.string()),
    menuImages: v.optional(v.array(v.string())),
    menuPdf: v.optional(v.string()),
    restaurantName: v.optional(v.string()),
    // Branch schedule information
    branchScheduleInfo: v.optional(
      v.object({
        hasMultipleBranches: v.boolean(),
        allBranchesClosed: v.boolean(),
        branches: v.array(
          v.object({
            id: v.string(),
            name: v.string(),
            isOpen: v.boolean(),
            message: v.string(),
            nextOpenTime: v.optional(v.string()),
            weeklySchedule: v.array(
              v.object({
                day: v.string(),
                ranges: v.array(
                  v.object({
                    open: v.string(),
                    close: v.string(),
                  })
                ),
              })
            ),
          })
        ),
      })
    ),
  },
  returns: v.object({
    success: v.boolean(),
    agentFollowUp: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const {
      conversationId,
      organizationId,
      threadId,
      contactPhoneNumber,
      whatsappConfigurationId,
      twilioConfigurationId,
      dialog360ConfigurationId,
      gupshupConfigurationId,
      messageId,
      message,
      sendMenu,
      menuType,
      menuUrl,
      menuImages,
      menuPdf,
      restaurantName,
      branchScheduleInfo,
    } = args

    console.log(
      "🤖 [AUTOMATIC FIRST REPLY] Sending automatic first reply for conversation:",
      conversationId,
      "sendMenu:",
      sendMenu,
      "menuType:",
      menuType
    )

    // Build menu caption dynamically based on restaurant name
    const menuCaption = restaurantName
      ? `Menú de ${restaurantName}`
      : "Menú del restaurante"

    try {
      // Build the text message - just the greeting, no schedule info here
      let textMessage = message

      // Append URL if sendMenu is enabled and menuType is 'url'
      if (sendMenu && menuType === "url" && menuUrl) {
        textMessage = `${textMessage}\n\n${menuUrl}`
      }

      // 1. Send text message via WhatsApp (greeting only)
      await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
        whatsappConfigurationId,
        twilioConfigurationId,
        dialog360ConfigurationId,
        gupshupConfigurationId,
        to: contactPhoneNumber,
        message: textMessage,
      })

      console.log("✅ [AUTOMATIC FIRST REPLY] Text message sent")

      // 2. Save text message to conversationMessages for dashboard display
      await ctx.runMutation(
        internal.system.conversationMessages.saveOutboundMessage,
        {
          conversationId,
          organizationId,
          type: "text",
          content: { text: textMessage },
          status: "sent",
          sender: "agent",
        }
      )

      // 3. Save text message to agent thread for context
      await saveMessage(ctx, components.agent, {
        threadId,
        message: {
          role: "assistant",
          content: textMessage,
        },
      })

      console.log(
        "✅ [AUTOMATIC FIRST REPLY] Text message saved to thread and conversationMessages"
      )

      // 4. Send schedule information as a SEPARATE message if needed
      // ONLY for single branch - for multiple branches, schedule info is shown after address validation
      let scheduleMessage = ""

      if (branchScheduleInfo && !branchScheduleInfo.hasMultipleBranches) {
        // Single branch only - show schedule if closed
        if (
          branchScheduleInfo.branches.length === 1 &&
          !branchScheduleInfo.branches[0]!.isOpen
        ) {
          const branch = branchScheduleInfo.branches[0]!
          scheduleMessage = buildClosedScheduleMessage(
            branch.nextOpenTime,
            branch.weeklySchedule
          )
        }
      }
      // NOTE: For multiple branches, schedule info will be shown AFTER the customer
      // validates their address or selects a specific branch

      // Send schedule message if there is any
      if (scheduleMessage) {
        // Longer delay to ensure greeting arrives first and to avoid mixing with menu images
        await new Promise((resolve) => setTimeout(resolve, 1500))

        await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
          whatsappConfigurationId,
          twilioConfigurationId,
          dialog360ConfigurationId,
          gupshupConfigurationId,
          to: contactPhoneNumber,
          message: scheduleMessage,
        })

        // Save schedule message to conversationMessages
        await ctx.runMutation(
          internal.system.conversationMessages.saveOutboundMessage,
          {
            conversationId,
            organizationId,
            type: "text",
            content: { text: scheduleMessage },
            status: "sent",
            sender: "agent",
          }
        )

        // Save schedule message to thread
        await saveMessage(ctx, components.agent, {
          threadId,
          message: {
            role: "assistant",
            content: scheduleMessage,
          },
        })

        console.log("✅ [AUTOMATIC FIRST REPLY] Schedule message sent")
      }

      // 5. Send menu if enabled (images or PDF, URL is already in the text)
      if (sendMenu && menuType && menuType !== "url") {
        // Longer delay to ensure schedule message (if any) arrives completely first
        await new Promise((resolve) => setTimeout(resolve, 2000))

        if (menuType === "images" && menuImages && menuImages.length > 0) {
          // Send all menu images
          for (const imageStorageId of menuImages) {
            const imageUrl = await getStorageUrl(ctx, imageStorageId)

            if (!imageUrl) {
              console.error(
                `❌ [AUTOMATIC FIRST REPLY] Could not get URL for image: ${imageStorageId}`
              )
              continue
            }

            await ctx.runAction(
              internal.system.whatsappDispatcher.sendImageMessage,
              {
                whatsappConfigurationId,
                twilioConfigurationId,
                dialog360ConfigurationId,
                gupshupConfigurationId,
                to: contactPhoneNumber,
                imageUrl: imageUrl,
              }
            )

            // Save image to conversationMessages
            await ctx.runMutation(
              internal.system.conversationMessages.saveOutboundMessage,
              {
                conversationId,
                organizationId,
                type: "image",
                content: {
                  media: {
                    url: imageUrl,
                    mimeType: "image/jpeg",
                  },
                },
                status: "sent",
                sender: "agent",
              }
            )

            console.log(
              `✅ [AUTOMATIC FIRST REPLY] Menu image sent: ${imageStorageId}`
            )
          }
        } else if (menuType === "pdf" && menuPdf) {
          // Send PDF
          const pdfUrl = await getStorageUrl(ctx, menuPdf)

          if (!pdfUrl) {
            console.error(
              `❌ [AUTOMATIC FIRST REPLY] Could not get URL for PDF: ${menuPdf}`
            )
          } else {
            const filename = extractFilenameFromStorageId(menuPdf)

            await ctx.runAction(
              internal.system.whatsappDispatcher.sendDocumentMessage,
              {
                whatsappConfigurationId,
                twilioConfigurationId,
                dialog360ConfigurationId,
                gupshupConfigurationId,
                to: contactPhoneNumber,
                documentUrl: pdfUrl,
                filename: filename,
                caption: menuCaption,
              }
            )

            // Save PDF to conversationMessages
            await ctx.runMutation(
              internal.system.conversationMessages.saveOutboundMessage,
              {
                conversationId,
                organizationId,
                type: "document",
                content: {
                  media: {
                    url: pdfUrl,
                    mimeType: "application/pdf",
                    filename: filename,
                    caption: menuCaption,
                  },
                },
                status: "sent",
                sender: "agent",
              }
            )

            console.log("✅ [AUTOMATIC FIRST REPLY] Menu PDF sent")
          }
        }
      }

      // 5. Check if we should invoke the agent for follow-up
      // We only invoke the agent if the user's message(s) contain something beyond a simple greeting
      // This prevents the agent from sending a duplicate greeting when user just says "Hola"

      // Get the user's messages to check if they need a follow-up response
      const conversationMessages = await ctx.runQuery(
        internal.system.conversationMessages.getByConversationInternal,
        { conversationId }
      )

      // Get only inbound (user) messages
      const userMessages = conversationMessages.filter(
        (m: { direction: string }) => m.direction === "inbound"
      )
      const userText = userMessages
        .map((m: { type: string; content: { text?: string } }) => {
          if (m.type === "text" && m.content.text) {
            return m.content.text
          }
          return ""
        })
        .join(" ")
        .toLowerCase()
        .trim()

      const isSimpleGreeting = SIMPLE_GREETING_PATTERNS.some((pattern) =>
        pattern.test(userText)
      )

      if (isSimpleGreeting) {
        console.log(
          "📱 [AUTOMATIC FIRST REPLY] User sent simple greeting, no agent follow-up needed"
        )
        return { success: true, agentFollowUp: false }
      }

      // If sendMenu is enabled, check if user is asking for menu/carta
      // In this case, we already sent the menu, so no need for agent follow-up
      if (sendMenu) {
        const isAskingForMenu = MENU_REQUEST_PATTERNS.some((pattern) =>
          pattern.test(userText)
        )

        if (isAskingForMenu) {
          const needsClarification = NEEDS_AGENT_CLARIFICATION_PATTERNS.some(
            (pattern) => pattern.test(userText)
          )

          if (!needsClarification) {
            console.log(
              "📱 [AUTOMATIC FIRST REPLY] User asked for menu (generic question form), menu sent, no agent follow-up needed"
            )
            return { success: true, agentFollowUp: false }
          }
          console.log(
            "📱 [AUTOMATIC FIRST REPLY] User asked for menu BUT also asked for specific details, invoking agent"
          )
        }
      }

      // User sent something more than a greeting - invoke agent for follow-up
      console.log(
        "🤖 [AUTOMATIC FIRST REPLY] User message contains request/question, invoking agent for follow-up"
      )

      const agentResponse = await generateAgentResponse(ctx, {
        conversationId,
        threadId,
        organizationId,
        messageId,
      })
      const costRefresh = await ctx.runMutation(
        internal.system.conversations.refreshConversationCost,
        {
          conversationId,
        }
      )
      if (costRefresh.syncStatus !== "synced") {
        console.warn(
          "[AUTOMATIC FIRST REPLY] Conversation cost refresh completed with non-blocking failure",
          {
            conversationId,
            failedThreads: costRefresh.failedThreads,
            organizationId,
            syncStatus: costRefresh.syncStatus,
          }
        )
      }

      if (agentResponse.length > 0) {
        console.log(
          `📱 [AUTOMATIC FIRST REPLY] Agent generated ${agentResponse.length} follow-up message(s)`
        )

        // Send the agent's follow-up response
        for (const msg of agentResponse) {
          await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
            whatsappConfigurationId,
            twilioConfigurationId,
            dialog360ConfigurationId,
            gupshupConfigurationId,
            to: contactPhoneNumber,
            message: msg.text,
          })

          // Save to conversationMessages
          await ctx.runMutation(
            internal.system.conversationMessages.saveOutboundMessage,
            {
              conversationId,
              organizationId,
              type: "text",
              content: { text: msg.text },
              status: "sent",
              sender: "agent",
            }
          )
        }
      } else {
        console.log(
          "📱 [AUTOMATIC FIRST REPLY] Agent decided no follow-up needed"
        )
      }

      return { success: true, agentFollowUp: agentResponse.length > 0 }
    } catch (error) {
      console.error(
        "❌ [AUTOMATIC FIRST REPLY] Error sending automatic reply:",
        error
      )
      throw error
    }
  },
})
