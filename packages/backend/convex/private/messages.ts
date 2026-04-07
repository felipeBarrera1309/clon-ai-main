import { listMessages, saveMessage } from "@convex-dev/agent"
import { gateway, generateText } from "ai"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { components, internal } from "../_generated/api"
import type { Doc } from "../_generated/dataModel"
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server"
import { env } from "../lib/env"
import { ConversationNotFoundError, UnauthorizedError } from "../lib/errors"
import { authAction, authMutation, authQuery } from "../lib/helpers"
import { canSendWhatsAppMessage } from "../lib/whatsapp"
import {
  escalateConversation,
  getConversationById,
} from "../model/conversations"
import type { TypingIndicatorResult } from "../model/whatsapp"
import { OPERATOR_MESSAGE_ENHANCEMENT_PROMPT } from "../system/ai/constants"

type OperatorTypingProvider = "meta" | "360dialog" | "twilio" | "gupshup"

type OperatorTypingResult =
  | { success: true }
  | { success: false; reason: string }

type ConversationTypingData = {
  conversation: Doc<"conversations">
  contact: Doc<"contacts">
  whatsappConfig: Doc<"whatsappConfigurations"> | null
  latestInboundWhatsappMessageId?: string
}

const WHATSAPP_MESSAGE_ID_SCAN_PAGE_SIZE = 100
const MAX_WHATSAPP_MESSAGE_ID_SCAN = 500

export const getRecentMessages = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    // Get conversation to get threadId
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      return []
    }

    // Get messages from the agent system
    const messages = await listMessages(ctx, components.agent, {
      threadId: conversation.threadId,
      paginationOpts: { numItems: args.limit, cursor: null },
    })

    return messages.page
  },
})

export const list = internalQuery({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    // Get messages from the agent system
    const messages = await listMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    })

    return messages
  },
})

export const saveSystemMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      throw new ConversationNotFoundError()
    }

    await saveMessage(ctx, components.agent, {
      threadId: conversation.threadId,
      agentName: args.name || "System",
      message: {
        role: args.role,
        content: args.content,
      },
    })
  },
})

export const enhanceResponse = authAction({
  args: {
    prompt: v.string(),
  },
  handler: async (_ctx, args) => {
    const response = await generateText({
      model: gateway("xai/grok-4-fast-non-reasoning"),
      messages: [
        {
          role: "system",
          content: OPERATOR_MESSAGE_ENHANCEMENT_PROMPT,
        },
        {
          role: "user",
          content: args.prompt,
        },
      ],
    })
    return response.text
  },
})

export const create = authMutation({
  args: {
    prompt: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const conversation = await getConversationById(ctx, {
      conversationId: args.conversationId,
    })

    // Save message to thread IMMEDIATELY for instant UI update
    await saveMessage(ctx, components.agent, {
      threadId: conversation.threadId,
      agentName: ctx.identity.name || "Unknown Operator",
      message: {
        role: "assistant",
        content: args.prompt,
      },
    })

    // Update conversation's last message time IMMEDIATELY so it appears at the top of the list
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: Date.now(),
    })

    console.log(
      `✅ [OPERATOR MESSAGE] Mensaje guardado en thread y conversación actualizada para aparecer de primero`
    )

    // Do all expensive operations asynchronously (WhatsApp sending and escalation)
    ctx.scheduler.runAfter(
      0,
      internal.private.messages.processOperatorMessageAsync,
      {
        conversationId: args.conversationId,
        prompt: args.prompt,
        agentName: ctx.identity.name || "Unknown Operator",
      }
    )
  },
})

export const createWithImage = authMutation({
  args: {
    conversationId: v.id("conversations"),
    storageId: v.string(),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log(
      `🖼️ [CREATE WITH IMAGE] conversationId: ${args.conversationId}, storageId: ${args.storageId}`
    )
    const conversation = await getConversationById(ctx, {
      conversationId: args.conversationId,
    })

    // Get the image URL (check if it's R2 or Convex)
    let imageUrl: string | null = null
    if (args.storageId.includes("/")) {
      // It's an R2 key (e.g. images/...)
      imageUrl = `${env.R2_PUBLIC_URL}/${args.storageId}`
      console.log(`📡 [CREATE WITH IMAGE] Using R2 URL: ${imageUrl}`)
    } else {
      // It's a Convex storageId
      imageUrl = await ctx.storage.getUrl(args.storageId)
      console.log(`☁️ [CREATE WITH IMAGE] Using Convex URL: ${imageUrl}`)
    }

    if (!imageUrl) {
      throw new ConversationNotFoundError(
        "No se pudo obtener la URL de la imagen"
      )
    }

    // Save the message to the conversation thread with image IMMEDIATELY for instant UI update
    await saveMessage(ctx, components.agent, {
      threadId: conversation.threadId,
      agentName: ctx.identity.name,
      message: {
        role: "assistant",
        content: [
          ...(args.caption
            ? [
                {
                  type: "text" as const,
                  text: args.caption,
                },
              ]
            : []),
        ],
      },
      metadata: {
        sources: [
          {
            type: "source",
            sourceType: "url",
            id: args.storageId,
            url: imageUrl,
            title: args.caption,
            providerMetadata: {
              attachment: {
                mimeType: "image/jpeg",
                caption: args.caption,
              },
            },
          },
        ],
      },
    })

    // Update conversation's last message time IMMEDIATELY so it appears at the top of the list
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: Date.now(),
    })

    console.log(
      `✅ [OPERATOR IMAGE MESSAGE] Mensaje guardado en thread y conversación actualizada para aparecer de primero`
    )

    // Do all expensive operations asynchronously (WhatsApp sending and escalation)
    ctx.scheduler.runAfter(
      0,
      internal.private.messages.processOperatorImageMessageAsync,
      {
        conversationId: args.conversationId,
        storageId: args.storageId,
        caption: args.caption,
        agentName: ctx.identity.name || "Unknown Operator",
      }
    )
  },
})

export const processOperatorMessageAsync = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    prompt: v.string(),
    agentName: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log(
        `🔄 [ASYNC OPERATOR MESSAGE] Procesando escalación y envío WhatsApp asíncronamente para conversación ${args.conversationId}`
      )

      const conversation = await getConversationById(ctx, {
        conversationId: args.conversationId,
      })

      // Get contact information to send WhatsApp message
      const contact = await ctx.db.get(conversation.contactId)
      if (!contact) {
        console.error(
          `❌ [ASYNC OPERATOR MESSAGE] Contacto no encontrado para conversación ${args.conversationId}`
        )
        return
      }

      // Save to conversationMessages for dashboard display
      await ctx.db.insert("conversationMessages", {
        conversationId: args.conversationId,
        organizationId: conversation.organizationId,
        direction: "outbound",
        sender: "operator",
        type: "text",
        content: { text: args.prompt },
        status: "sent",
        messageTimestamp: Date.now(),
      })

      // Check if we can send WhatsApp message based on 24-hour window
      const whatsappValidation = canSendWhatsAppMessage(contact)
      if (!whatsappValidation.canSend) {
        console.log(
          `🚫 [ASYNC OPERATOR MESSAGE] No se puede enviar mensaje WhatsApp a ${contact.phoneNumber}: ${whatsappValidation.reason}`
        )
        // Continue with escalation even if WhatsApp can't be sent
      } else if (conversation.whatsappConfigurationId) {
        // Handle Meta WhatsApp
        const whatsappConfig = await ctx.db.get(
          conversation.whatsappConfigurationId
        )
        if (!whatsappConfig) {
          console.error(
            `❌ [ASYNC OPERATOR MESSAGE] No se encontró configuración WhatsApp ${conversation.whatsappConfigurationId}`
          )
        } else if (!whatsappConfig.isActive) {
          console.error(
            `❌ [ASYNC OPERATOR MESSAGE] La configuración WhatsApp ${conversation.whatsappConfigurationId} no está activa`
          )
        } else {
          // Send WhatsApp message asynchronously
          const startTime = Date.now()
          try {
            console.log(
              `📱 [ASYNC OPERATOR MESSAGE] Enviando mensaje WhatsApp a ${contact.phoneNumber} usando línea ${whatsappConfig.phoneNumberId}`
            )

            // Determine provider
            const is360Dialog =
              whatsappConfig.provider === "360dialog" ||
              !!whatsappConfig.dialog360ApiKey
            const isMeta =
              !is360Dialog && (whatsappConfig.provider || "meta") === "meta"

            console.log(
              `🔍 [ASYNC OPERATOR MESSAGE] validation - used config: ${whatsappConfig._id}, provider: ${whatsappConfig.provider}, has360Key: ${!!whatsappConfig.dialog360ApiKey}, is360: ${is360Dialog}`
            )

            // Auto-detect provider if missing but key is present (fix for missing provider field)
            if (!whatsappConfig.provider && whatsappConfig.dialog360ApiKey) {
              console.log(
                `⚠️ [ASYNC OPERATOR MESSAGE] Inferring 360dialog provider from API key`
              )
            }

            // We relax the validation here and let the Action handle the specific errors
            // This prevents the mutation from failing early if our strict check is mismatched with user data
            if (is360Dialog && !whatsappConfig.dialog360ApiKey) {
              console.warn(
                `⚠️ [ASYNC OPERATOR MESSAGE] 360dialog provider detected but missing API key? Continuing to Action to attempt send.`
              )
            } else if (
              isMeta &&
              (!whatsappConfig.phoneNumberId || !whatsappConfig.accessToken)
            ) {
              console.warn(
                `⚠️ [ASYNC OPERATOR MESSAGE] Meta provider detected but missing credentials? Continuing to Action to attempt send.`
              )
            }

            await ctx.scheduler.runAfter(
              0,
              internal.system.whatsapp.sendOperatorWhatsAppMessage,
              {
                contactPhoneNumber: contact.phoneNumber,
                message: args.prompt,
                whatsappConfigurationId: whatsappConfig._id,
                businessPhoneNumberId: whatsappConfig.phoneNumberId,
                accessToken: whatsappConfig.accessToken || "",
              }
            )

            // Schedule initial inactivity warning after operator sends a response (5 minutes)
            await ctx.scheduler.runAfter(
              0,
              internal.system.inactivityScheduler
                .scheduleInitialInactivityWarning,
              {
                conversationId: args.conversationId,
                contactId: contact._id,
                organizationId: conversation.organizationId,
              }
            )

            const sendDuration = Date.now() - startTime
            console.log(
              `✅ [ASYNC OPERATOR MESSAGE] Mensaje WhatsApp enviado en ${sendDuration}ms`
            )
          } catch (error) {
            const sendDuration = Date.now() - startTime
            console.error(
              `❌ [ASYNC OPERATOR MESSAGE] Error al enviar mensaje WhatsApp (${sendDuration}ms):`,
              error
            )
            // Don't throw - continue with escalation
          }
        }
      } else if (conversation.twilioConfigurationId) {
        // Handle Twilio
        const twilioConfig = await ctx.db.get(
          conversation.twilioConfigurationId
        )
        if (!twilioConfig) {
          console.error(
            `❌ [ASYNC OPERATOR MESSAGE] No se encontró configuración Twilio ${conversation.twilioConfigurationId}`
          )
        } else if (!twilioConfig.isActive) {
          console.error(
            `❌ [ASYNC OPERATOR MESSAGE] La configuración Twilio ${conversation.twilioConfigurationId} no está activa`
          )
        } else {
          // Send Twilio message asynchronously
          const startTime = Date.now()
          try {
            console.log(
              `📱 [ASYNC OPERATOR MESSAGE] Enviando mensaje Twilio a ${contact.phoneNumber}`
            )

            await ctx.scheduler.runAfter(
              0,
              internal.system.twilio.sendTwilioWhatsAppMessage,
              {
                twilioConfigurationId: twilioConfig._id,
                to: contact.phoneNumber,
                message: args.prompt,
              }
            )

            // Schedule initial inactivity warning after operator sends a response (5 minutes)
            await ctx.scheduler.runAfter(
              0,
              internal.system.inactivityScheduler
                .scheduleInitialInactivityWarning,
              {
                conversationId: args.conversationId,
                contactId: contact._id,
                organizationId: conversation.organizationId,
              }
            )

            const sendDuration = Date.now() - startTime
            console.log(
              `✅ [ASYNC OPERATOR MESSAGE] Mensaje Twilio enviado en ${sendDuration}ms`
            )
          } catch (error) {
            const sendDuration = Date.now() - startTime
            console.error(
              `❌ [ASYNC OPERATOR MESSAGE] Error al enviar mensaje Twilio (${sendDuration}ms):`,
              error
            )
            // Don't throw - continue with escalation
          }
        }
      } else {
        console.error(
          `❌ [ASYNC OPERATOR MESSAGE] Conversación ${conversation._id} no tiene whatsappConfigurationId ni twilioConfigurationId asociado`
        )
      }

      // Do the expensive escalation operation
      await escalateConversation(ctx, conversation, {
        reason: "Operador envió mensaje de texto al cliente",
      })

      console.log(
        `✅ [ASYNC OPERATOR MESSAGE] Escalación completada para conversación ${args.conversationId}`
      )
    } catch (error) {
      console.error(
        `❌ [ASYNC OPERATOR MESSAGE] Error procesando escalación asíncrona:`,
        error
      )
      // Don't throw - this is async processing, failure shouldn't affect the immediate response
    }
  },
})

export const processOperatorImageMessageAsync = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    storageId: v.string(),
    caption: v.optional(v.string()),
    agentName: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log(
        `🔄 [ASYNC OPERATOR IMAGE MESSAGE] Procesando escalación y envío WhatsApp asíncronamente para conversación ${args.conversationId}`
      )

      const conversation = await getConversationById(ctx, {
        conversationId: args.conversationId,
      })

      // Get contact information to send WhatsApp message
      const contact = await ctx.db.get(conversation.contactId)
      if (!contact) {
        console.error(
          `❌ [ASYNC OPERATOR IMAGE MESSAGE] Contacto no encontrado para conversación ${args.conversationId}`
        )
        console.log(
          "🖼️ [OPERATOR IMAGE MESSAGE] Storage ID received:",
          args.storageId
        )
        return
      }

      // Get the image URL (check if it's R2 or Convex)
      let imageUrl: string | null = null
      if (args.storageId.includes("/")) {
        imageUrl = `${env.R2_PUBLIC_URL}/${args.storageId}`
      } else {
        imageUrl = await ctx.storage.getUrl(args.storageId)
      }

      if (!imageUrl) {
        console.error(
          `❌ [ASYNC OPERATOR IMAGE MESSAGE] No se pudo obtener la URL de la imagen`
        )
        return
      }

      // Save to conversationMessages for dashboard display
      await ctx.db.insert("conversationMessages", {
        conversationId: args.conversationId,
        organizationId: conversation.organizationId,
        direction: "outbound",
        sender: "operator",
        type: "image",
        content: {
          text: args.caption,
          media: {
            url: imageUrl,
            mimeType: "image/jpeg",
            caption: args.caption,
            storageId: args.storageId,
          },
        },
        status: "sent",
        messageTimestamp: Date.now(),
      })

      // Do the expensive escalation operation first
      const escalatedConversation = await escalateConversation(
        ctx,
        conversation,
        { reason: "Operador envió imagen al cliente" }
      )

      // Check if we can send WhatsApp message based on 24-hour window
      const whatsappValidation = canSendWhatsAppMessage(contact)
      if (!whatsappValidation.canSend) {
        console.log(
          `🚫 [ASYNC OPERATOR IMAGE MESSAGE] No se puede enviar mensaje WhatsApp a ${contact.phoneNumber}: ${whatsappValidation.reason}`
        )
        // Don't throw here - message was saved successfully, but WhatsApp sending is restricted
        return
      }

      // Send image message to WhatsApp or Twilio
      try {
        if (conversation.whatsappConfigurationId) {
          const whatsappConfig = await ctx.db.get(
            conversation.whatsappConfigurationId
          )
          if (!whatsappConfig) {
            console.error(
              `❌ [ASYNC OPERATOR IMAGE MESSAGE] No se encontró configuración WhatsApp ${conversation.whatsappConfigurationId}`
            )
            return
          }

          if (!whatsappConfig.isActive) {
            console.error(
              `❌ [ASYNC OPERATOR IMAGE MESSAGE] La configuración WhatsApp ${conversation.whatsappConfigurationId} no está activa`
            )
            return
          }

          console.log(
            `📱 [ASYNC OPERATOR IMAGE MESSAGE] Enviando imagen WhatsApp a ${contact.phoneNumber} usando línea ${whatsappConfig.phoneNumberId} (validación pasada)`
          )

          // Determine provider
          const is360Dialog =
            whatsappConfig.provider === "360dialog" ||
            !!whatsappConfig.dialog360ApiKey
          const isMeta =
            !is360Dialog && (whatsappConfig.provider || "meta") === "meta"

          console.log(
            `🔍 [ASYNC OPERATOR IMAGE MESSAGE] validation - used config: ${whatsappConfig._id}, provider: ${whatsappConfig.provider}, has360Key: ${!!whatsappConfig.dialog360ApiKey}, is360: ${is360Dialog}`
          )

          // Auto-detect provider if missing but key is present
          if (!whatsappConfig.provider && whatsappConfig.dialog360ApiKey) {
            console.log(
              `⚠️ [ASYNC OPERATOR IMAGE MESSAGE] Inferring 360dialog provider from API key`
            )
          }

          if (is360Dialog && !whatsappConfig.dialog360ApiKey) {
            console.warn(
              `⚠️ [ASYNC OPERATOR IMAGE MESSAGE] 360dialog provider detected but missing API key? Continuing to Action.`
            )
          } else if (
            isMeta &&
            (!whatsappConfig.phoneNumberId || !whatsappConfig.accessToken)
          ) {
            console.warn(
              `⚠️ [ASYNC OPERATOR IMAGE MESSAGE] Meta provider detected but missing credentials? Continuing to Action.`
            )
          }

          await ctx.scheduler.runAfter(
            0,
            internal.system.whatsapp.sendOperatorWhatsAppImageMessage,
            {
              contactPhoneNumber: contact.phoneNumber,
              imageUrl: imageUrl,
              whatsappConfigurationId: whatsappConfig._id,
              businessPhoneNumberId: whatsappConfig.phoneNumberId,
              accessToken: whatsappConfig.accessToken || "",
              mimeType: "image/jpeg",
              caption: args.caption,
            }
          )

          // Schedule initial inactivity warning after operator sends a response (5 minutes)
          await ctx.scheduler.runAfter(
            0,
            internal.system.inactivityScheduler
              .scheduleInitialInactivityWarning,
            {
              conversationId: args.conversationId,
              contactId: contact._id,
              organizationId: conversation.organizationId,
            }
          )
        } else if (conversation.twilioConfigurationId) {
          const twilioConfig = await ctx.db.get(
            conversation.twilioConfigurationId
          )
          if (!twilioConfig) {
            console.error(
              `❌ [ASYNC OPERATOR IMAGE MESSAGE] No se encontró configuración Twilio ${conversation.twilioConfigurationId}`
            )
            return
          }

          if (!twilioConfig.isActive) {
            console.error(
              `❌ [ASYNC OPERATOR IMAGE MESSAGE] La configuración Twilio ${conversation.twilioConfigurationId} no está activa`
            )
            return
          }

          console.log(
            `📱 [ASYNC OPERATOR IMAGE MESSAGE] Enviando imagen Twilio a ${contact.phoneNumber}`
          )

          await ctx.scheduler.runAfter(
            0,
            internal.system.twilio.sendTwilioWhatsAppImageMessage,
            {
              twilioConfigurationId: twilioConfig._id,
              to: contact.phoneNumber,
              imageUrl: imageUrl,
              caption: args.caption,
            }
          )

          // Schedule initial inactivity warning after operator sends a response (5 minutes)
          await ctx.scheduler.runAfter(
            0,
            internal.system.inactivityScheduler
              .scheduleInitialInactivityWarning,
            {
              conversationId: args.conversationId,
              contactId: contact._id,
              organizationId: conversation.organizationId,
            }
          )
        } else {
          console.error(
            `❌ [ASYNC OPERATOR IMAGE MESSAGE] Conversación ${conversation._id} no tiene configuración de WhatsApp ni Twilio asociada`
          )
        }
      } catch (error) {
        console.error(
          "Error al enviar mensaje de imagen para respuesta del operador:",
          error
        )
      }
    } catch (error) {
      console.error(
        `❌ [ASYNC OPERATOR IMAGE MESSAGE] Error procesando escalación asíncrona:`,
        error
      )
      // Don't throw - this is async processing, failure shouldn't affect the immediate response
    }
  },
})

export const getMany = authQuery({
  args: {
    organizationId: v.string(),
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique()

    if (!conversation) {
      throw new ConversationNotFoundError()
    }

    if (conversation.organizationId !== args.organizationId) {
      throw new UnauthorizedError("ID de organización inválido")
    }

    const paginated = await listMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    })

    return paginated
  },
})

/**
 * Send typing indicator to WhatsApp when operator is typing
 * This shows "escribiendo..." to the customer in WhatsApp
 */
export const sendOperatorTypingIndicator = authAction({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args): Promise<OperatorTypingResult> => {
    // Get conversation details
    const conversationData: ConversationTypingData | null = await ctx.runQuery(
      internal.private.messages.getConversationForTyping,
      { conversationId: args.conversationId }
    )

    if (!conversationData) {
      console.log(
        "🚫 [OPERATOR TYPING] Conversation not found or not escalated"
      )
      return { success: false, reason: "conversation_not_found" }
    }

    const {
      conversation,
      contact,
      whatsappConfig,
      latestInboundWhatsappMessageId,
    } = conversationData

    // Only send typing indicator for escalated conversations
    if (conversation.status !== "escalated") {
      console.log(
        `🚫 [OPERATOR TYPING] Conversation ${args.conversationId} is not escalated (status: ${conversation.status})`
      )
      return { success: false, reason: "not_escalated" }
    }

    if (!whatsappConfig) {
      console.log(
        `🚫 [OPERATOR TYPING] No WhatsApp config for conversation ${args.conversationId}`
      )
      return { success: false, reason: "no_whatsapp_config" }
    }

    if (!whatsappConfig.isActive) {
      console.log(
        `🚫 [OPERATOR TYPING] WhatsApp config ${whatsappConfig._id} is inactive for conversation ${args.conversationId}`
      )
      return { success: false, reason: "inactive_whatsapp_config" }
    }

    // Determine provider more robustly
    const is360Dialog: boolean =
      whatsappConfig.provider === "360dialog" ||
      !!whatsappConfig.dialog360ApiKey
    const isGupshup: boolean =
      whatsappConfig.provider === "gupshup" ||
      !!whatsappConfig.gupshupApiKey ||
      (!!whatsappConfig.gupshupAppId && !!whatsappConfig.gupshupAppToken)
    const isTwilio: boolean =
      !!conversation.twilioConfigurationId ||
      whatsappConfig.provider === "twilio" ||
      (!!whatsappConfig.twilioAccountSid && !!whatsappConfig.twilioAuthToken)

    const providerName: OperatorTypingProvider = is360Dialog
      ? "360dialog"
      : isGupshup
        ? "gupshup"
        : isTwilio
          ? "twilio"
          : "meta"

    // Send typing indicator based on provider
    try {
      const result: TypingIndicatorResult = await ctx.runAction(
        internal.private.messages.sendTypingIndicatorToWhatsApp,
        {
          provider: providerName,
          phoneNumberId: whatsappConfig.phoneNumberId,
          accessToken: whatsappConfig.accessToken,
          dialog360ApiKey: whatsappConfig.dialog360ApiKey,
          contactPhoneNumber: contact.phoneNumber,
          metaMessageId: latestInboundWhatsappMessageId,
          gupshupAppToken: whatsappConfig.gupshupAppToken,
          gupshupAppId: whatsappConfig.gupshupAppId,
          gupshupMessageId: latestInboundWhatsappMessageId,
          gupshupSourceNumber: whatsappConfig.gupshupSourceNumber,
        }
      )

      if (!result.sent) {
        console.log(
          `🚫 [OPERATOR TYPING] Typing indicator skipped for conversation ${args.conversationId} (${result.reason})`
        )
        return { success: false, reason: result.reason }
      }

      console.log(
        `✅ [OPERATOR TYPING] Typing indicator sent for conversation ${args.conversationId}`
      )
      return { success: true }
    } catch (error) {
      console.error(
        `❌ [OPERATOR TYPING] Error sending typing indicator:`,
        error
      )
      return { success: false, reason: "send_failed" }
    }
  },
})

export const getConversationForTyping = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) return null

    const contact = await ctx.db.get(conversation.contactId)
    if (!contact) return null

    // Get WhatsApp config
    let whatsappConfig = null
    if (conversation.whatsappConfigurationId) {
      whatsappConfig = await ctx.db.get(conversation.whatsappConfigurationId)
    } else if (conversation.twilioConfigurationId) {
      whatsappConfig = await ctx.db.get(conversation.twilioConfigurationId)
    }

    let latestInboundWhatsappMessageId: string | undefined
    let scannedMessages = 0
    let cursor: string | null = null
    let hasMore = true

    while (
      hasMore &&
      scannedMessages < MAX_WHATSAPP_MESSAGE_ID_SCAN &&
      !latestInboundWhatsappMessageId
    ) {
      const page = await ctx.db
        .query("conversationMessages")
        .withIndex("by_conversation_and_direction", (q) =>
          q.eq("conversationId", args.conversationId).eq("direction", "inbound")
        )
        .order("desc")
        .paginate({
          cursor,
          numItems: WHATSAPP_MESSAGE_ID_SCAN_PAGE_SIZE,
        })

      latestInboundWhatsappMessageId = page.page.find(
        (message) => typeof message.whatsappMessageId === "string"
      )?.whatsappMessageId

      scannedMessages += page.page.length
      cursor = page.continueCursor
      hasMore = !page.isDone && page.continueCursor !== null
    }

    return {
      conversation,
      contact,
      whatsappConfig,
      latestInboundWhatsappMessageId,
    }
  },
})

export const sendTypingIndicatorToWhatsApp = internalAction({
  args: {
    provider: v.union(
      v.literal("meta"),
      v.literal("360dialog"),
      v.literal("twilio"),
      v.literal("gupshup")
    ),
    phoneNumberId: v.optional(v.string()),
    accessToken: v.optional(v.string()),
    dialog360ApiKey: v.optional(v.string()),
    contactPhoneNumber: v.string(),
    metaMessageId: v.optional(v.string()),
    gupshupAppToken: v.optional(v.string()),
    gupshupAppId: v.optional(v.string()),
    gupshupMessageId: v.optional(v.string()),
    gupshupSourceNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { sendTypingIndicatorToContact } = await import("../model/whatsapp")

    return await sendTypingIndicatorToContact(
      ctx,
      args.provider,
      args.contactPhoneNumber,
      args.phoneNumberId,
      args.accessToken,
      args.dialog360ApiKey,
      args.gupshupAppToken,
      args.gupshupSourceNumber,
      args.gupshupAppId,
      args.gupshupMessageId,
      args.metaMessageId
    )
  },
})
