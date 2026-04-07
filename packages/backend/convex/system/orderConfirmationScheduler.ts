import { saveMessage } from "@convex-dev/agent"
import { v } from "convex/values"
import { components, internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { ActionCtx } from "../_generated/server"
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server"
import { sendWhatsAppMessage } from "../model/whatsapp"

type OrderConfirmationDataSuccess = {
  shouldProceed: true
  conversation: Doc<"conversations">
  contact: Doc<"contacts">
  whatsappConfig: Doc<"whatsappConfigurations"> | null
  dispatcherConfigKey: string
  canSendWhatsApp: boolean
  whatsappRestrictionReason: string
}

type OrderConfirmationDataFailure = {
  shouldProceed: false
  conversation: null
  contact: null
  whatsappConfig: null
  canSendWhatsApp: false
  whatsappRestrictionReason: string
}

type OrderConfirmationData =
  | OrderConfirmationDataSuccess
  | OrderConfirmationDataFailure

const DELAY_2_MINUTES_MS = 2 * 60 * 1000
const DELAY_4_MINUTES_MS = 4 * 60 * 1000

export const scheduleOrderConfirmationReminder2Min = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    organizationId: v.string(),
  },
  handler: async (ctx, args): Promise<string | null> => {
    const scheduledFunction = await ctx.db
      .query("conversationScheduledFunctions")
      .withIndex("by_conversation_id_and_name", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("name", "sendOrderConfirmationReminder2Min")
      )
      .unique()

    if (scheduledFunction) {
      await ctx.scheduler.cancel(
        scheduledFunction.scheduledFunctionId as Id<"_scheduled_functions">
      )
    }

    const scheduledId = await ctx.scheduler.runAfter(
      DELAY_2_MINUTES_MS,
      internal.system.orderConfirmationScheduler
        .sendOrderConfirmationReminder2Min,
      {
        conversationId: args.conversationId,
        contactId: args.contactId,
        organizationId: args.organizationId,
      }
    )

    await ctx.db.insert("conversationScheduledFunctions", {
      name: "sendOrderConfirmationReminder2Min",
      conversationId: args.conversationId,
      scheduledFunctionId: scheduledId as Id<"_scheduled_functions">,
    })

    console.log(
      `⏰ [CONFIRMACIÓN PEDIDO] Scheduled 2-min confirmation reminder in ${DELAY_2_MINUTES_MS}ms for conversation:`,
      args.conversationId
    )

    return scheduledId
  },
})

export const scheduleOrderConfirmationReminder4Min = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    organizationId: v.string(),
  },
  handler: async (ctx, args): Promise<string | null> => {
    const scheduledFunction = await ctx.db
      .query("conversationScheduledFunctions")
      .withIndex("by_conversation_id_and_name", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("name", "sendOrderConfirmationReminder4Min")
      )
      .unique()

    if (scheduledFunction) {
      await ctx.scheduler.cancel(
        scheduledFunction.scheduledFunctionId as Id<"_scheduled_functions">
      )
    }

    const scheduledId = await ctx.scheduler.runAfter(
      DELAY_4_MINUTES_MS,
      internal.system.orderConfirmationScheduler
        .sendOrderConfirmationReminder4Min,
      {
        conversationId: args.conversationId,
        contactId: args.contactId,
        organizationId: args.organizationId,
      }
    )

    await ctx.db.insert("conversationScheduledFunctions", {
      name: "sendOrderConfirmationReminder4Min",
      conversationId: args.conversationId,
      scheduledFunctionId: scheduledId as Id<"_scheduled_functions">,
    })

    console.log(
      `⏰ [CONFIRMACIÓN PEDIDO] Scheduled 4-min confirmation reminder in ${DELAY_4_MINUTES_MS}ms for conversation:`,
      args.conversationId
    )

    return scheduledId
  },
})

export const sendOrderConfirmationReminder2Min = internalAction({
  args: {
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(
      "⏰ [CONFIRMACIÓN PEDIDO] Executing 2-minute order confirmation reminder for conversation:",
      args.conversationId
    )

    const data = await ctx.runQuery(
      internal.system.orderConfirmationScheduler.getOrderConfirmationData,
      {
        conversationId: args.conversationId,
        contactId: args.contactId,
        organizationId: args.organizationId,
      }
    )

    if (!data.shouldProceed) {
      return
    }

    const messageText =
      "*Confirma tu pedido para iniciar con la preparación.* ¿Toda la información es correcta?"

    await saveMessage(ctx, components.agent, {
      threadId: data.conversation.threadId,
      message: {
        role: "assistant",
        content: [{ type: "text", text: messageText }],
      },
    })

    await sendMessageToWhatsApp(
      ctx,
      data.conversation._id,
      data.conversation.organizationId,
      data.contact,
      data.whatsappConfig,
      data.dispatcherConfigKey,
      messageText,
      data.canSendWhatsApp,
      data.whatsappRestrictionReason,
      "2-minute order confirmation reminder"
    )

    // Schedule the 4-minute reminder
    await ctx.runMutation(
      internal.system.orderConfirmationScheduler
        .scheduleOrderConfirmationReminder4Min,
      {
        conversationId: data.conversation._id,
        contactId: data.conversation.contactId,
        organizationId: data.conversation.organizationId,
      }
    )
  },
})

export const sendOrderConfirmationReminder4Min = internalAction({
  args: {
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(
      "⏰ [CONFIRMACIÓN PEDIDO] Executing 4-minute order confirmation reminder for conversation:",
      args.conversationId
    )

    const data = await ctx.runQuery(
      internal.system.orderConfirmationScheduler.getOrderConfirmationData,
      {
        conversationId: args.conversationId,
        contactId: args.contactId,
        organizationId: args.organizationId,
      }
    )

    if (!data.shouldProceed) {
      return
    }

    const messageText =
      "*Confirma tu pedido para iniciar con la preparación.* ¿Toda la información es correcta?"

    await saveMessage(ctx, components.agent, {
      threadId: data.conversation.threadId,
      message: {
        role: "assistant",
        content: [{ type: "text", text: messageText }],
      },
    })

    await sendMessageToWhatsApp(
      ctx,
      data.conversation._id,
      data.conversation.organizationId,
      data.contact,
      data.whatsappConfig,
      data.dispatcherConfigKey,
      messageText,
      data.canSendWhatsApp,
      data.whatsappRestrictionReason,
      "4-minute order confirmation reminder"
    )
  },
})

export const getOrderConfirmationData = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    organizationId: v.string(),
  },
  handler: async (ctx, args): Promise<OrderConfirmationData> => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      console.log("⏰ [CONFIRMACIÓN PEDIDO] Conversation not found")
      return {
        shouldProceed: false,
        conversation: null,
        contact: null,
        whatsappConfig: null,
        canSendWhatsApp: false,
        whatsappRestrictionReason: "Conversation not found",
      }
    }

    const contact = await ctx.db.get(args.contactId)
    if (!contact) {
      console.log("⏰ [CONFIRMACIÓN PEDIDO] Contact not found")
      return {
        shouldProceed: false,
        conversation: null,
        contact: null,
        whatsappConfig: null,
        canSendWhatsApp: false,
        whatsappRestrictionReason: "Contact not found",
      }
    }

    // Check if order has already been created (no need to send reminder)
    if (conversation.orderId) {
      console.log(
        "⏰ [CONFIRMACIÓN PEDIDO] Order already exists, skipping reminder"
      )
      return {
        shouldProceed: false,
        conversation: null,
        contact: null,
        whatsappConfig: null,
        canSendWhatsApp: false,
        whatsappRestrictionReason: "Order already created",
      }
    }

    // Check if there's no pending order confirmation (no need to send reminder)
    if (!conversation.pendingOrderConfirmation) {
      console.log(
        "⏰ [CONFIRMACIÓN PEDIDO] No pending order confirmation, skipping reminder"
      )
      return {
        shouldProceed: false,
        conversation: null,
        contact: null,
        whatsappConfig: null,
        canSendWhatsApp: false,
        whatsappRestrictionReason: "No pending order confirmation",
      }
    }

    const whatsappConfig = conversation.whatsappConfigurationId
      ? await ctx.db.get(conversation.whatsappConfigurationId)
      : null

    // Determine actual provider for proper dispatcher routing
    let dispatcherConfigKey:
      | "whatsappConfigurationId"
      | "dialog360ConfigurationId"
      | "gupshupConfigurationId"
      | "twilioConfigurationId" = "whatsappConfigurationId"
    if (whatsappConfig) {
      if (
        whatsappConfig.provider === "360dialog" ||
        !!whatsappConfig.dialog360ApiKey
      ) {
        dispatcherConfigKey = "dialog360ConfigurationId"
      } else if (
        whatsappConfig.provider === "gupshup" ||
        !!whatsappConfig.gupshupApiKey
      ) {
        dispatcherConfigKey = "gupshupConfigurationId"
      }
    }

    // Check Twilio config
    const twilioConfig = conversation.twilioConfigurationId
      ? await ctx.db.get(conversation.twilioConfigurationId)
      : null
    if (twilioConfig) {
      dispatcherConfigKey = "twilioConfigurationId"
    }

    const activeConfig = whatsappConfig || twilioConfig

    const now = Date.now()
    const lastMessageTime = contact.lastMessageAt || contact._creationTime
    const timeSinceLastMessage = now - lastMessageTime
    const canSend = timeSinceLastMessage < 24 * 60 * 60 * 1000

    return {
      shouldProceed: true,
      conversation,
      contact,
      whatsappConfig: activeConfig,
      dispatcherConfigKey,
      canSendWhatsApp: canSend,
      whatsappRestrictionReason: canSend
        ? ""
        : "24-hour messaging window expired",
    }
  },
})

async function sendMessageToWhatsApp(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  organizationId: string,
  contact: Doc<"contacts">,
  whatsappConfig: Doc<"whatsappConfigurations"> | null,
  dispatcherConfigKey: string,
  messageText: string,
  canSend: boolean,
  restrictionReason: string,
  stage: string
): Promise<void> {
  try {
    let messageSent = false

    if (whatsappConfig && canSend) {
      // Use dispatcher with correct provider config key
      await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
        [dispatcherConfigKey]: whatsappConfig._id,
        to: contact.phoneNumber,
        message: messageText,
      })
      messageSent = true
      console.log(
        `✅ [CONFIRMACIÓN PEDIDO] ${stage} message sent successfully to WhatsApp`
      )
    } else {
      if (!whatsappConfig) {
        console.log(
          `⏰ [CONFIRMACIÓN PEDIDO] Cannot send ${stage} message - WhatsApp configuration not found`
        )
      } else if (!canSend) {
        console.log(
          `⏰ [CONFIRMACIÓN PEDIDO] Cannot send ${stage} message - ${restrictionReason}`
        )
      }
    }

    // Save to conversationMessages for dashboard display
    if (messageSent) {
      await ctx.runMutation(
        internal.system.conversationMessages.saveOutboundMessage,
        {
          conversationId,
          organizationId,
          type: "text",
          content: { text: messageText },
          status: "sent",
          sender: "system",
        }
      )
    }
  } catch (error) {
    console.error(
      `❌ [CONFIRMACIÓN PEDIDO] Error sending ${stage} message to WhatsApp:`,
      error
    )
  }
}

export const cancelOrderConfirmationTimers = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    console.log(
      "⏰ [CONFIRMACIÓN PEDIDO] Cancelando temporizadores de recordatorio de confirmación"
    )

    try {
      // Use the tracking table instead of querying all scheduled functions
      const trackedFunctions = await ctx.db
        .query("conversationScheduledFunctions")
        .withIndex("by_conversation_id_and_name", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .collect()

      // Cancel each tracked scheduled function
      for (const tracked of trackedFunctions) {
        try {
          await ctx.scheduler.cancel(
            tracked.scheduledFunctionId as Id<"_scheduled_functions">
          )
          // Clean up the tracking record
          await ctx.db.delete(tracked._id)
        } catch (error) {
          console.error(
            "⏰ [CONFIRMACIÓN PEDIDO] Error cancelando función específica:",
            error
          )
        }
      }

      console.log(
        `⏰ [CONFIRMACIÓN PEDIDO] Canceladas ${trackedFunctions.length} funciones programadas de recordatorio`
      )
    } catch (error) {
      console.error(
        "⏰ [CONFIRMACIÓN PEDIDO] Error cancelando temporizadores:",
        error
      )
    }
  },
})
