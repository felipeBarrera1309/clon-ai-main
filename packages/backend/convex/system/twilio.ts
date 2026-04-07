import { createThread } from "@convex-dev/agent"
import { v } from "convex/values"
import { components, internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server"
import { TwilioConfigurationNotFoundError } from "../lib/errors"
import { getOrCreateContact } from "../model/contacts"
import {
  createConversation,
  getConversationNotInResolvedStatusByContactIdAndTwilioConfig,
} from "../model/conversations"

/**
 * Get Twilio configuration by ID
 */
export const getTwilioConfiguration = internalQuery({
  args: { id: v.id("whatsappConfigurations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

/**
 * Type-safe interface for the result of incoming message processing
 */
export interface ProcessTwilioMessageResult {
  conversation: Doc<"conversations">
  contact: Doc<"contacts">
  twilioConfiguration: Doc<"whatsappConfigurations">
}

/**
 * Get Twilio configuration by AccountSid
 * CRITICAL for multi-tenant: Resolves the correct subaccount credentials
 * based on the AccountSid from the webhook payload
 */
export const getTwilioConfigurationByAccountSid = internalQuery({
  args: { accountSid: v.string() },
  handler: async (ctx, args) => {
    // ✅ FIX: Use indexed query instead of filter for better performance
    const configs = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_twilio_account_sid", (q) =>
        q.eq("twilioAccountSid", args.accountSid)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("provider"), "twilio"),
          q.eq(q.field("isActive"), true)
        )
      )
      .collect()

    if (configs.length === 0) {
      console.error(
        `❌ [TWILIO] No config found for AccountSid: ${args.accountSid}`
      )

      // Debug: Show all available Twilio configurations
      const allConfigs = await ctx.db
        .query("whatsappConfigurations")
        .filter((q) => q.eq(q.field("provider"), "twilio"))
        .collect()

      console.error(
        `❌ [TWILIO] Available Twilio configs:`,
        allConfigs.map((c) => ({
          id: c._id,
          accountSid: c.twilioAccountSid,
          phoneNumber: c.phoneNumber,
          isActive: c.isActive,
          organizationId: c.organizationId,
        }))
      )
      return null
    }

    // ✅ FIX: Log warning but allow graceful degradation instead of blocking all status updates
    // Previously this threw an error, blocking ALL webhook status updates until admin intervened
    // Now we return null and log the issue, allowing the system to continue (though messages won't route)
    if (configs.length > 1) {
      console.error(
        `🚨 [TWILIO] WARNING: Multiple active configs found for AccountSid ${args.accountSid}:`,
        configs.map((c) => ({
          id: c._id,
          org: c.organizationId,
          phone: c.phoneNumber,
        }))
      )
      console.error(
        `⚠️ [TWILIO] This is a data integrity issue. Admin should either:` +
          `\n  1. Deactivate duplicate configs, OR` +
          `\n  2. Use unique AccountSids per organization.` +
          `\nAffected orgs: ${configs.map((c) => c.organizationId).join(", ")}` +
          `\nReturning null to prevent routing to wrong organization.`
      )
      // Return null instead of throwing - allows status webhooks to continue gracefully
      return null
    }

    const config = configs[0]

    if (!config) {
      throw new Error(
        `Unexpected state: config is undefined for AccountSid ${args.accountSid}`
      )
    }

    console.log(
      `✅ [TWILIO] Found config for AccountSid AC****${args.accountSid.slice(-4)}: ${config._id}`
    )
    return config
  },
})

/**
 * Process incoming Twilio WhatsApp message
 * Handles contact creation, conversation management and thread initialization
 */
export const processTwilioIncomingMessage = internalMutation({
  args: {
    contactPhoneNumber: v.string(),
    contactDisplayName: v.string(),
    twilioPhoneNumber: v.string(),
    fromWhatsApp: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ProcessTwilioMessageResult> => {
    // Normalize phone numbers for search
    const rawTwilioNumber = args.twilioPhoneNumber.replace(/^\+/, "")
    const plusTwilioNumber = `+${rawTwilioNumber}`

    // Find active Twilio configuration
    // We try both formats (with and without +) to be robust against inconsistencies in DB
    let twilioConfiguration = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_phone_number", (q) => q.eq("phoneNumber", rawTwilioNumber))
      .filter((q) =>
        q.and(
          q.eq(q.field("isActive"), true),
          q.eq(q.field("provider"), "twilio")
        )
      )
      .first()

    if (!twilioConfiguration) {
      twilioConfiguration = await ctx.db
        .query("whatsappConfigurations")
        .withIndex("by_phone_number", (q) =>
          q.eq("phoneNumber", plusTwilioNumber)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("isActive"), true),
            q.eq(q.field("provider"), "twilio")
          )
        )
        .first()
    }

    // Fallback: Check twilioPhoneNumber field (legacy/alternate field)
    if (!twilioConfiguration) {
      twilioConfiguration = await ctx.db
        .query("whatsappConfigurations")
        .filter((q) =>
          q.and(
            q.eq(q.field("isActive"), true),
            q.eq(q.field("provider"), "twilio"),
            q.or(
              q.eq(q.field("twilioPhoneNumber"), plusTwilioNumber),
              q.eq(q.field("twilioPhoneNumber"), rawTwilioNumber)
            )
          )
        )
        .first()
    }

    if (!twilioConfiguration) {
      console.error(
        `❌ [TWILIO] Configuration not found for ${args.twilioPhoneNumber}`
      )
      console.error(
        `❌ [TWILIO] Searched for rawNumber: "${rawTwilioNumber}", plusNumber: "${plusTwilioNumber}"`
      )

      // Debug: Show all Twilio configs in the DB
      const allTwilioConfigs = await ctx.db
        .query("whatsappConfigurations")
        .filter((q) => q.eq(q.field("provider"), "twilio"))
        .collect()

      console.error(
        `❌ [TWILIO] Available Twilio configurations in DB (provider=twilio):`,
        allTwilioConfigs.map((c) => ({
          id: c._id,
          phoneNumber: c.phoneNumber,
          twilioPhoneNumber: c.twilioPhoneNumber,
          isActive: c.isActive,
          organizationId: c.organizationId,
        }))
      )

      // Debug: Show ALL configs regardless of provider
      const allConfigs = await ctx.db.query("whatsappConfigurations").collect()

      console.error(
        `❌ [TWILIO] ALL whatsappConfigurations in DB (any provider):`,
        allConfigs.map((c) => ({
          id: c._id,
          provider: c.provider,
          phoneNumber: c.phoneNumber,
          twilioPhoneNumber: c.twilioPhoneNumber,
          phoneNumberId: c.phoneNumberId,
          isActive: c.isActive,
          organizationId: c.organizationId,
        }))
      )

      throw new TwilioConfigurationNotFoundError()
    }

    console.log(
      `📱 [TWILIO] Processing message from ${args.contactPhoneNumber} to ${args.twilioPhoneNumber} (${twilioConfiguration.organizationId})`
    )

    const organizationId = twilioConfiguration.organizationId

    // Get or create contact
    const contact = (await getOrCreateContact(ctx, {
      phoneNumber: args.contactPhoneNumber,
      displayName: args.contactDisplayName,
      organizationId: organizationId,
    })) as Doc<"contacts">

    // Update contact's last message time
    if (args.fromWhatsApp === true) {
      await ctx.db.patch(contact._id, {
        lastMessageAt: Date.now(),
      })
    }

    // Check for existing unresolved or escalated conversation
    const existingConversation =
      (await getConversationNotInResolvedStatusByContactIdAndTwilioConfig(ctx, {
        contactId: contact._id,
        twilioConfigurationId: twilioConfiguration!._id,
      })) as Doc<"conversations"> | null

    if (existingConversation) {
      // Cancel pending inactivity/reminder timers for existing conversation
      const scheduledFunctions = await ctx.db
        .query("conversationScheduledFunctions")
        .withIndex("by_conversation_id", (q) =>
          q.eq("conversationId", existingConversation._id)
        )
        .collect()

      for (const scheduled of scheduledFunctions) {
        if (scheduled.scheduledFunctionId) {
          await ctx.scheduler.cancel(
            scheduled.scheduledFunctionId as Id<"_scheduled_functions">
          )
        }
        await ctx.db.delete(scheduled._id)
      }

      // Update conversation's last message time
      if (args.fromWhatsApp === true) {
        await ctx.db.patch(existingConversation._id, {
          lastMessageAt: Date.now(),
        })
      }

      return {
        conversation: existingConversation,
        contact,
        twilioConfiguration,
      }
    }

    // Create new conversation and thread for a fresh interaction
    const threadId = await createThread(ctx, components.agent, {
      userId: organizationId,
    })

    const conversation = (await createConversation(ctx, {
      contactId: contact._id,
      threadId: threadId,
      organizationId,
      status: "unresolved",
      twilioConfigurationId: twilioConfiguration._id,
      lastMessageAt: args.fromWhatsApp === true ? Date.now() : undefined,
    })) as Doc<"conversations">

    return { conversation, contact, twilioConfiguration }
  },
})

/**
 * Send WhatsApp text message via Twilio
 */
export const sendTwilioWhatsAppMessage = internalAction({
  args: {
    twilioConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.twilio.getTwilioConfiguration,
      { id: args.twilioConfigurationId }
    )
    if (!config || !config.twilioAccountSid || !config.twilioAuthToken) {
      throw new Error(
        `Twilio configuration invalid or not found: ${args.twilioConfigurationId}`
      )
    }

    const fromNumber = config.twilioPhoneNumber || config.phoneNumber
    if (!fromNumber)
      throw new Error("Twilio configuration missing phone number")

    await ctx.runAction(
      internal.actions.twilioActions.sendTwilioWhatsAppMessage,
      {
        twilioAccountSid: config.twilioAccountSid,
        twilioAuthToken: config.twilioAuthToken,
        from: fromNumber,
        to: args.to,
        body: args.message,
      }
    )
  },
})

/**
 * Send WhatsApp image message via Twilio
 */
export const sendTwilioWhatsAppImageMessage = internalAction({
  args: {
    twilioConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    imageUrl: v.string(),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.twilio.getTwilioConfiguration,
      { id: args.twilioConfigurationId }
    )
    if (!config || !config.twilioAccountSid || !config.twilioAuthToken) {
      throw new Error(
        `Twilio configuration invalid or not found: ${args.twilioConfigurationId}`
      )
    }

    const fromNumber = config.twilioPhoneNumber || config.phoneNumber
    if (!fromNumber)
      throw new Error("Twilio configuration missing phone number")

    await ctx.runAction(
      internal.actions.twilioActions.sendTwilioWhatsAppImageMessage,
      {
        twilioAccountSid: config.twilioAccountSid,
        twilioAuthToken: config.twilioAuthToken,
        from: fromNumber,
        to: args.to,
        mediaUrl: args.imageUrl,
        body: args.caption,
      }
    )
  },
})

/**
 * Send WhatsApp document message via Twilio
 */
export const sendTwilioWhatsAppDocumentMessage = internalAction({
  args: {
    twilioConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    documentUrl: v.string(),
    filename: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.twilio.getTwilioConfiguration,
      { id: args.twilioConfigurationId }
    )
    if (!config || !config.twilioAccountSid || !config.twilioAuthToken) {
      throw new Error(
        `Twilio configuration invalid or not found: ${args.twilioConfigurationId}`
      )
    }

    const fromNumber = config.twilioPhoneNumber || config.phoneNumber
    if (!fromNumber)
      throw new Error("Twilio configuration missing phone number")

    await ctx.runAction(
      internal.actions.twilioActions.sendTwilioWhatsAppDocumentMessage,
      {
        twilioAccountSid: config.twilioAccountSid,
        twilioAuthToken: config.twilioAuthToken,
        from: fromNumber,
        to: args.to,
        mediaUrl: args.documentUrl,
        body: args.caption,
      }
    )
  },
})
