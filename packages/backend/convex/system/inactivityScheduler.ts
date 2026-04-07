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
import {
  DEFAULT_FOLLOW_UP_SEQUENCE,
  type FollowUpStep,
} from "../lib/followUpConstants"
import { substituteFollowUpPlaceholders } from "../lib/followUpPlaceholders"
import { cancelInactivityTimers } from "../model/activityTimers"
import { sendWhatsAppMessage } from "../model/whatsapp"

type InactivityDataSuccess = {
  shouldProceed: true
  conversation: Doc<"conversations">
  contact: Doc<"contacts">
  whatsappConfig: Doc<"whatsappConfigurations"> | null
  twilioConfig: Doc<"whatsappConfigurations"> | null
  dialog360Config: Doc<"whatsappConfigurations"> | null
  gupshupConfig: Doc<"whatsappConfigurations"> | null
  canSendWhatsApp: boolean
  whatsappRestrictionReason: string
}

type InactivityDataFailure = {
  shouldProceed: false
  conversation: null
  contact: null
  whatsappConfig: null
  twilioConfig: null
  dialog360Config: null
  gupshupConfig: null
  canSendWhatsApp: false
  whatsappRestrictionReason: string
}

type InactivityData = InactivityDataSuccess | InactivityDataFailure

type FollowUpStepNameType =
  | "followUpStep_0"
  | "followUpStep_1"
  | "followUpStep_2"
  | "followUpStep_3"
  | "followUpStep_4"
  | "followUpStep_5"
  | "followUpStep_6"
  | "followUpStep_7"
  | "followUpStep_8"
  | "followUpStep_9"

function getFollowUpStepName(stepIndex: number): FollowUpStepNameType {
  const validNames: FollowUpStepNameType[] = [
    "followUpStep_0",
    "followUpStep_1",
    "followUpStep_2",
    "followUpStep_3",
    "followUpStep_4",
    "followUpStep_5",
    "followUpStep_6",
    "followUpStep_7",
    "followUpStep_8",
    "followUpStep_9",
  ]
  if (stepIndex < 0 || stepIndex > 9) {
    throw new Error(`Invalid step index: ${stepIndex}. Must be 0-9.`)
  }
  const name = validNames[stepIndex]
  if (!name) throw new Error(`Invalid step index: ${stepIndex}`)
  return name
}

export const getFollowUpConfig = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    return {
      sequence: config?.followUpSequence ?? DEFAULT_FOLLOW_UP_SEQUENCE,
      restaurantName:
        config?.restaurantContext?.split("\n")[0]?.substring(0, 50) ||
        undefined,
    }
  },
})

export const scheduleInitialInactivityWarning = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    organizationId: v.string(),
  },
  handler: async (ctx, args): Promise<string | null> => {
    await cancelInactivityTimers(ctx, args.conversationId)

    console.log(
      `⏰ [INACTIVIDAD] Scheduling follow-up sequence for conversation:`,
      args.conversationId
    )

    const config = await ctx.runQuery(
      internal.system.inactivityScheduler.getFollowUpConfig,
      { organizationId: args.organizationId }
    )

    if (config.sequence.length === 0) {
      console.log(`⏰ [INACTIVIDAD] No follow-up sequence configured, skipping`)
      return null
    }

    const firstStep = config.sequence[0]!
    const delayMs = firstStep.delayMinutes * 60 * 1000

    const scheduledId = await ctx.scheduler.runAfter(
      delayMs,
      internal.system.inactivityScheduler.executeFollowUpStep,
      {
        conversationId: args.conversationId,
        contactId: args.contactId,
        organizationId: args.organizationId,
        stepIndex: 0,
      }
    )

    await ctx.db.insert("conversationScheduledFunctions", {
      name: "followUpStep_0",
      conversationId: args.conversationId,
      scheduledFunctionId: scheduledId as Id<"_scheduled_functions">,
    })

    console.log(
      `⏰ [INACTIVIDAD] Scheduled step 0 in ${firstStep.delayMinutes}min for conversation:`,
      args.conversationId
    )

    return scheduledId
  },
})

export const scheduleFollowUpStep = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    organizationId: v.string(),
    stepIndex: v.number(),
  },
  handler: async (ctx, args): Promise<string | null> => {
    const existingTimer = await ctx.db
      .query("conversationScheduledFunctions")
      .withIndex("by_conversation_id_and_name", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("name", getFollowUpStepName(args.stepIndex))
      )
      .unique()

    if (existingTimer) {
      try {
        await ctx.scheduler.cancel(
          existingTimer.scheduledFunctionId as Id<"_scheduled_functions">
        )
      } catch {
        // Timer may have already executed
      }
      await ctx.db.delete(existingTimer._id)
    }

    const config = await ctx.runQuery(
      internal.system.inactivityScheduler.getFollowUpConfig,
      { organizationId: args.organizationId }
    )

    if (args.stepIndex >= config.sequence.length) {
      console.log(
        `⏰ [INACTIVIDAD] Step ${args.stepIndex} exceeds sequence length, skipping`
      )
      return null
    }

    const step = config.sequence[args.stepIndex]!
    const delayMs = step.delayMinutes * 60 * 1000

    const scheduledId = await ctx.scheduler.runAfter(
      delayMs,
      internal.system.inactivityScheduler.executeFollowUpStep,
      {
        conversationId: args.conversationId,
        contactId: args.contactId,
        organizationId: args.organizationId,
        stepIndex: args.stepIndex,
      }
    )

    await ctx.db.insert("conversationScheduledFunctions", {
      name: getFollowUpStepName(args.stepIndex),
      conversationId: args.conversationId,
      scheduledFunctionId: scheduledId as Id<"_scheduled_functions">,
    })

    console.log(
      `⏰ [INACTIVIDAD] Scheduled step ${args.stepIndex} in ${step.delayMinutes}min for conversation:`,
      args.conversationId
    )

    return scheduledId
  },
})

export const executeFollowUpStep = internalAction({
  args: {
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    organizationId: v.string(),
    stepIndex: v.number(),
  },
  handler: async (ctx, args) => {
    console.log(
      `⏰ [INACTIVIDAD] Executing follow-up step ${args.stepIndex} for conversation:`,
      args.conversationId
    )

    const data = await ctx.runQuery(
      internal.system.inactivityScheduler.getInactivityData,
      {
        conversationId: args.conversationId,
        contactId: args.contactId,
        organizationId: args.organizationId,
      }
    )

    if (!data.shouldProceed) {
      return
    }

    const config = await ctx.runQuery(
      internal.system.inactivityScheduler.getFollowUpConfig,
      { organizationId: args.organizationId }
    )

    if (args.stepIndex >= config.sequence.length) {
      console.log(
        `⏰ [INACTIVIDAD] Step ${args.stepIndex} exceeds sequence length, aborting`
      )
      return
    }

    const step = config.sequence[args.stepIndex]!
    const isLastStep = args.stepIndex === config.sequence.length - 1

    const messageText = substituteFollowUpPlaceholders(step.messageTemplate, {
      customerName: data.contact.displayName || undefined,
      restaurantName: config.restaurantName,
    })

    await saveMessage(ctx, components.agent, {
      threadId: data.conversation.threadId,
      message: {
        role: "assistant",
        content: [{ type: "text", text: messageText }],
      },
      agentName: "supportAgent",
    })

    await sendMessageToWhatsApp(
      ctx,
      data.conversation._id,
      data.conversation.organizationId,
      data.contact,
      data.whatsappConfig,
      data.twilioConfig,
      data.dialog360Config,
      data.gupshupConfig,
      messageText,
      data.canSendWhatsApp,
      data.whatsappRestrictionReason,
      `step-${args.stepIndex}`
    )

    if (isLastStep) {
      await ctx.runMutation(
        internal.system.conversations.forceResolveWithCost,
        {
          threadId: data.conversation.threadId,
          resolutionReason:
            "Cierre automático por inactividad del cliente (secuencia de seguimiento completada)",
          resolvedBy: "system:inactivity",
        }
      )
      console.log("✅ [INACTIVIDAD] Conversation closed (final step)")
    } else {
      const nextStepIndex = args.stepIndex + 1
      const nextStep = config.sequence[nextStepIndex]
      if (nextStep) {
        const currentStep = config.sequence[args.stepIndex]!
        const delayMs =
          (nextStep.delayMinutes - currentStep.delayMinutes) * 60 * 1000

        const scheduledId = await ctx.scheduler.runAfter(
          delayMs,
          internal.system.inactivityScheduler.executeFollowUpStep,
          {
            conversationId: args.conversationId,
            contactId: args.contactId,
            organizationId: args.organizationId,
            stepIndex: nextStepIndex,
          }
        )

        await ctx.runMutation(
          internal.system.inactivityScheduler.trackScheduledFunction,
          {
            name: getFollowUpStepName(nextStepIndex),
            conversationId: args.conversationId,
            scheduledFunctionId: scheduledId,
          }
        )

        console.log(
          `⏰ [INACTIVIDAD] Scheduled step ${nextStepIndex} in ${nextStep.delayMinutes - currentStep.delayMinutes}min`
        )
      }
    }
  },
})

export const trackScheduledFunction = internalMutation({
  args: {
    name: v.union(
      v.literal("followUpStep_0"),
      v.literal("followUpStep_1"),
      v.literal("followUpStep_2"),
      v.literal("followUpStep_3"),
      v.literal("followUpStep_4"),
      v.literal("followUpStep_5"),
      v.literal("followUpStep_6"),
      v.literal("followUpStep_7"),
      v.literal("followUpStep_8"),
      v.literal("followUpStep_9")
    ),
    conversationId: v.id("conversations"),
    scheduledFunctionId: v.string(),
  },
  handler: async (ctx, args) => {
    const existingScheduledFunctions = await ctx.db
      .query("conversationScheduledFunctions")
      .withIndex("by_conversation_id_and_name", (q) =>
        q.eq("conversationId", args.conversationId).eq("name", args.name)
      )
      .collect()

    for (const scheduledFunction of existingScheduledFunctions) {
      try {
        await ctx.scheduler.cancel(
          scheduledFunction.scheduledFunctionId as Id<"_scheduled_functions">
        )
      } catch {
        // Timer may have already executed
      }
      await ctx.db.delete(scheduledFunction._id)
    }

    await ctx.db.insert("conversationScheduledFunctions", {
      name: args.name,
      conversationId: args.conversationId,
      scheduledFunctionId:
        args.scheduledFunctionId as Id<"_scheduled_functions">,
    })
  },
})

// ============================================================================
// LEGACY FUNCTIONS - Kept for backward compatibility with in-flight tasks
// These will be removed after all scheduled tasks using them have completed
// ============================================================================

const DELAY_3_MINUTES_MS = 3 * 60 * 1000
const DELAY_5_MINUTES_MS = 5 * 60 * 1000
const DELAY_10_MINUTES_MS = 10 * 60 * 1000

/** @deprecated Use scheduleFollowUpStep instead */
export const scheduleInactivityWarning5Min = internalMutation({
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
          .eq("name", "sendInactivityWarning5Min")
      )
      .unique()

    if (scheduledFunction) {
      await ctx.scheduler.cancel(
        scheduledFunction.scheduledFunctionId as Id<"_scheduled_functions">
      )
      await ctx.db.delete(scheduledFunction._id)
    }

    const scheduledId = await ctx.scheduler.runAfter(
      DELAY_5_MINUTES_MS,
      internal.system.inactivityScheduler.sendInactivityWarning5Min,
      {
        conversationId: args.conversationId,
        contactId: args.contactId,
        organizationId: args.organizationId,
      }
    )

    await ctx.db.insert("conversationScheduledFunctions", {
      name: "sendInactivityWarning5Min",
      conversationId: args.conversationId,
      scheduledFunctionId: scheduledId as Id<"_scheduled_functions">,
    })

    return scheduledId
  },
})

/** @deprecated Use scheduleFollowUpStep instead */
export const scheduleInactivityClosure = internalMutation({
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
          .eq("name", "closeConversationForInactivity")
      )
      .unique()

    if (scheduledFunction) {
      await ctx.scheduler.cancel(
        scheduledFunction.scheduledFunctionId as Id<"_scheduled_functions">
      )
      await ctx.db.delete(scheduledFunction._id)
    }

    const scheduledId = await ctx.scheduler.runAfter(
      DELAY_10_MINUTES_MS,
      internal.system.inactivityScheduler.closeConversationForInactivity,
      {
        conversationId: args.conversationId,
        contactId: args.contactId,
        organizationId: args.organizationId,
      }
    )

    await ctx.db.insert("conversationScheduledFunctions", {
      name: "closeConversationForInactivity",
      conversationId: args.conversationId,
      scheduledFunctionId: scheduledId as Id<"_scheduled_functions">,
    })

    return scheduledId
  },
})

/** @deprecated Use executeFollowUpStep instead */
export const sendInactivityWarning3Min = internalAction({
  args: {
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(
      "⏰ [INACTIVIDAD] [LEGACY] Executing 3-minute inactivity warning for conversation:",
      args.conversationId
    )

    const data = await ctx.runQuery(
      internal.system.inactivityScheduler.getInactivityData,
      {
        conversationId: args.conversationId,
        contactId: args.contactId,
        organizationId: args.organizationId,
      }
    )

    if (!data.shouldProceed) {
      return
    }

    const messageText = "¿Sigues ahí? Estoy listo para tu pedido 😊"

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
      data.twilioConfig,
      data.dialog360Config,
      data.gupshupConfig,
      messageText,
      data.canSendWhatsApp,
      data.whatsappRestrictionReason,
      "3-minute"
    )

    await ctx.runMutation(
      internal.system.inactivityScheduler.scheduleInactivityWarning5Min,
      {
        conversationId: data.conversation._id,
        contactId: data.conversation.contactId,
        organizationId: data.conversation.organizationId,
      }
    )
  },
})

/** @deprecated Use executeFollowUpStep instead */
export const sendInactivityWarning5Min = internalAction({
  args: {
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(
      "⏰ [INACTIVIDAD] [LEGACY] Executing 5-minute inactivity warning for conversation:",
      args.conversationId
    )

    const data = await ctx.runQuery(
      internal.system.inactivityScheduler.getInactivityData,
      {
        conversationId: args.conversationId,
        contactId: args.contactId,
        organizationId: args.organizationId,
      }
    )

    if (!data.shouldProceed) {
      return
    }

    const messageText = "¡Sigo aquí! ¿Alguna duda?"

    await saveMessage(ctx, components.agent, {
      threadId: data.conversation.threadId,
      message: {
        role: "assistant",
        content: [{ type: "text", text: messageText }],
      },
      agentName: "supportAgent",
    })

    await sendMessageToWhatsApp(
      ctx,
      data.conversation._id,
      data.conversation.organizationId,
      data.contact,
      data.whatsappConfig,
      data.twilioConfig,
      data.dialog360Config,
      data.gupshupConfig,
      messageText,
      data.canSendWhatsApp,
      data.whatsappRestrictionReason,
      "5-minute"
    )

    await ctx.runMutation(
      internal.system.inactivityScheduler.scheduleInactivityClosure,
      {
        conversationId: args.conversationId,
        contactId: args.contactId,
        organizationId: args.organizationId,
      }
    )
  },
})

/** @deprecated Use executeFollowUpStep instead */
export const closeConversationForInactivity = internalAction({
  args: {
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(
      "⏰ [INACTIVIDAD] [LEGACY] Executing conversation closure for conversation:",
      args.conversationId
    )

    const data = await ctx.runQuery(
      internal.system.inactivityScheduler.getInactivityData,
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
      "Chat cerrado por ahora. Escríbeme de nuevo cuando quieras, ¡te atiendo enseguida! 😊"

    await saveMessage(ctx, components.agent, {
      threadId: data.conversation.threadId,
      message: {
        role: "assistant",
        content: [{ type: "text", text: messageText }],
      },
      agentName: "supportAgent",
    })

    await sendMessageToWhatsApp(
      ctx,
      data.conversation._id,
      data.conversation.organizationId,
      data.contact,
      data.whatsappConfig,
      data.twilioConfig,
      data.dialog360Config,
      data.gupshupConfig,
      messageText,
      data.canSendWhatsApp,
      data.whatsappRestrictionReason,
      "closure"
    )

    await ctx.runMutation(internal.system.conversations.forceResolveWithCost, {
      threadId: data.conversation.threadId,
      resolutionReason: "Cierre automático por inactividad del cliente",
      resolvedBy: "system:inactivity",
    })

    console.log("✅ [INACTIVIDAD] Conversation closed successfully")
  },
})

// ============================================================================
// SHARED FUNCTIONS
// ============================================================================

export const getInactivityData = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    organizationId: v.string(),
  },
  handler: async (ctx, args): Promise<InactivityData> => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      console.log("⏰ [INACTIVIDAD] Conversation not found")
      return {
        shouldProceed: false,
        conversation: null,
        contact: null,
        whatsappConfig: null,
        twilioConfig: null,
        dialog360Config: null,
        gupshupConfig: null,
        canSendWhatsApp: false,
        whatsappRestrictionReason: "Conversation not found",
      }
    }

    const contact = await ctx.db.get(args.contactId)
    if (!contact) {
      console.log("⏰ [INACTIVIDAD] Contact not found")
      return {
        shouldProceed: false,
        conversation: null,
        contact: null,
        whatsappConfig: null,
        twilioConfig: null,
        dialog360Config: null,
        gupshupConfig: null,
        canSendWhatsApp: false,
        whatsappRestrictionReason: "Contact not found",
      }
    }

    if (conversation.status === "resolved") {
      console.log("⏰ [INACTIVIDAD] Conversation already resolved")
      return {
        shouldProceed: false,
        conversation: null,
        contact: null,
        whatsappConfig: null,
        twilioConfig: null,
        dialog360Config: null,
        gupshupConfig: null,
        canSendWhatsApp: false,
        whatsappRestrictionReason: "Conversation already resolved",
      }
    }

    if (conversation.status === "escalated") {
      console.log(
        "⏰ [INACTIVIDAD] Conversation is escalated, skipping inactivity messages"
      )
      return {
        shouldProceed: false,
        conversation: null,
        contact: null,
        whatsappConfig: null,
        twilioConfig: null,
        dialog360Config: null,
        gupshupConfig: null,
        canSendWhatsApp: false,
        whatsappRestrictionReason: "Conversation is escalated to operator",
      }
    }

    if (conversation.orderId) {
      console.log("⏰ [INACTIVIDAD] Active order exists, skipping warning")
      return {
        shouldProceed: false,
        conversation: null,
        contact: null,
        whatsappConfig: null,
        twilioConfig: null,
        dialog360Config: null,
        gupshupConfig: null,
        canSendWhatsApp: false,
        whatsappRestrictionReason: "Active order exists",
      }
    }

    let whatsappConfig: Doc<"whatsappConfigurations"> | null = null
    let twilioConfig: Doc<"whatsappConfigurations"> | null = null
    let dialog360Config: Doc<"whatsappConfigurations"> | null = null
    let gupshupConfig: Doc<"whatsappConfigurations"> | null = null

    if (conversation.whatsappConfigurationId) {
      const config = await ctx.db.get(conversation.whatsappConfigurationId)
      if (config) {
        // Determine provider type
        const is360 =
          config.provider === "360dialog" || !!config.dialog360ApiKey
        const isGupshup =
          config.provider === "gupshup" || !!config.gupshupApiKey
        if (is360) {
          dialog360Config = config
        } else if (isGupshup) {
          gupshupConfig = config
        } else {
          whatsappConfig = config
        }
      }
    } else if (conversation.twilioConfigurationId) {
      twilioConfig = await ctx.db.get(conversation.twilioConfigurationId)
    }

    const now = Date.now()
    const lastMessageTime = contact.lastMessageAt || contact._creationTime
    const timeSinceLastMessage = now - lastMessageTime
    const canSend = timeSinceLastMessage < 24 * 60 * 60 * 1000

    return {
      shouldProceed: true,
      conversation,
      contact,
      whatsappConfig,
      twilioConfig,
      dialog360Config,
      gupshupConfig,
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
  twilioConfig: Doc<"whatsappConfigurations"> | null,
  dialog360Config: Doc<"whatsappConfigurations"> | null,
  gupshupConfig: Doc<"whatsappConfigurations"> | null,
  messageText: string,
  canSend: boolean,
  restrictionReason: string,
  stage: string
): Promise<void> {
  try {
    let messageSent = false

    if (whatsappConfig && canSend) {
      await sendWhatsAppMessage(ctx, contact.phoneNumber, messageText, {
        provider: "meta",
        phoneNumberId: whatsappConfig.phoneNumberId,
        accessToken: whatsappConfig.accessToken,
      })
      messageSent = true
      console.log(
        `✅ [INACTIVIDAD] ${stage} message sent successfully to WhatsApp (Meta)`
      )
    } else if (twilioConfig && canSend) {
      await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
        twilioConfigurationId: twilioConfig._id,
        to: contact.phoneNumber,
        message: messageText,
      })
      messageSent = true
      console.log(
        `✅ [INACTIVIDAD] ${stage} message sent successfully to WhatsApp (Twilio)`
      )
    } else if (dialog360Config && canSend) {
      await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
        dialog360ConfigurationId: dialog360Config._id,
        to: contact.phoneNumber,
        message: messageText,
      })
      messageSent = true
      console.log(
        `✅ [INACTIVIDAD] ${stage} message sent successfully to WhatsApp (360dialog)`
      )
    } else if (gupshupConfig && canSend) {
      await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
        gupshupConfigurationId: gupshupConfig._id,
        to: contact.phoneNumber,
        message: messageText,
      })
      messageSent = true
      console.log(
        `✅ [INACTIVIDAD] ${stage} message sent successfully to WhatsApp (Gupshup)`
      )
    } else {
      if (
        !whatsappConfig &&
        !twilioConfig &&
        !dialog360Config &&
        !gupshupConfig
      ) {
        console.log(
          `⏰ [INACTIVIDAD] Cannot send ${stage} message - WhatsApp configuration not found`
        )
      } else if (!canSend) {
        console.log(
          `⏰ [INACTIVIDAD] Cannot send ${stage} message - ${restrictionReason}`
        )
      }
    }

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
      `❌ [INACTIVIDAD] Error sending ${stage} message to WhatsApp:`,
      error
    )
  }
}

export const cancelInactivityTimerInternal = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    await cancelInactivityTimers(ctx, args.conversationId)
  },
})
