import { createThread } from "@convex-dev/agent"
import { v } from "convex/values"
import { components, internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server"
import { GupshupConfigurationNotFoundError } from "../lib/errors"
import { getOrCreateContact } from "../model/contacts"
import {
  createConversation,
  getConversationNotInResolvedStatusByContactIdAndGupshupConfig,
} from "../model/conversations"

const whatsappConfigurationValidator = v.object({
  _id: v.id("whatsappConfigurations"),
  _creationTime: v.number(),
  organizationId: v.string(),
  provider: v.optional(v.string()),
  accessToken: v.optional(v.string()),
  phoneNumberId: v.optional(v.string()),
  wabaId: v.optional(v.string()),
  metaAppId: v.optional(v.string()),
  twilioAccountSid: v.optional(v.string()),
  twilioAuthToken: v.optional(v.string()),
  twilioPhoneNumber: v.optional(v.string()),
  dialog360ApiKey: v.optional(v.string()),
  phoneNumber: v.string(),
  isActive: v.boolean(),
  displayName: v.optional(v.string()),
  restaurantLocationId: v.optional(v.id("restaurantLocations")),
  lastModified: v.optional(v.number()),
  gupshupApiKey: v.optional(v.string()),
  gupshupAppName: v.optional(v.string()),
  gupshupSourceNumber: v.optional(v.string()),
  gupshupClientSecret: v.optional(v.string()),
  gupshupAppId: v.optional(v.string()),
  gupshupAppToken: v.optional(v.string()),
  gupshupMediaToken: v.optional(v.string()),
})

const contactValidator = v.object({
  _id: v.id("contacts"),
  _creationTime: v.number(),
  phoneNumber: v.string(),
  displayName: v.optional(v.string()),
  organizationId: v.string(),
  lastMessageAt: v.optional(v.number()),
  isBlocked: v.optional(v.boolean()),
  lastKnownAddress: v.optional(v.string()),
})

const conversationValidator = v.object({
  _id: v.id("conversations"),
  _creationTime: v.number(),
  threadId: v.string(),
  organizationId: v.string(),
  contactId: v.id("contacts"),
  orderId: v.optional(v.id("orders")),
  status: v.string(),
  orderCreatedBeforeEscalation: v.optional(v.boolean()),
  whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
  twilioConfigurationId: v.optional(v.id("whatsappConfigurations")),
  gupshupConfigurationId: v.optional(v.id("whatsappConfigurations")),
  lastMessageAt: v.optional(v.number()),
  stopSignal: v.optional(v.boolean()),
  cost: v.optional(v.number()),
  costUpdatedAt: v.optional(v.number()),
  costCoverage: v.optional(
    v.union(v.literal("complete"), v.literal("estimated"))
  ),
  aiCostLedgerSyncedAt: v.optional(v.number()),
  aiCostLastSyncError: v.optional(v.string()),
  aiCostLastSyncFailedAt: v.optional(v.number()),
  resolutionReason: v.optional(v.string()),
  resolvedAt: v.optional(v.number()),
  resolvedBy: v.optional(v.string()),
  agentLockActive: v.optional(v.boolean()),
  processingUserMessageId: v.optional(v.string()),
  queuedUserMessageId: v.optional(v.string()),
  queuedWhatsappMessageId: v.optional(v.string()),
  agentSoftAbort: v.optional(v.boolean()),
  pendingOrderConfirmation: v.optional(v.any()),
})

/**
 * Type-safe interface for the result of incoming Gupshup message processing
 */
export interface ProcessGupshupMessageResult {
  conversation: Doc<"conversations">
  contact: Doc<"contacts">
  gupshupConfiguration: Doc<"whatsappConfigurations">
}

/**
 * Get Gupshup configuration by ID
 */
export const getGupshupConfiguration = internalQuery({
  args: { id: v.id("whatsappConfigurations") },
  returns: v.union(whatsappConfigurationValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

/**
 * Get Gupshup configuration by App Name
 * Used for webhook processing to identify which organization the message belongs to
 */
export const getGupshupConfigurationByAppName = internalQuery({
  args: { appName: v.string() },
  returns: v.union(whatsappConfigurationValidator, v.null()),
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_provider_and_gupshup_app_name", (q) =>
        q
          .eq("provider", "gupshup")
          .eq("gupshupAppName", args.appName)
          .eq("isActive", true)
      )
      .first()

    if (!config) {
      console.error(
        `❌ [GUPSHUP] No config found for App Name: ${args.appName}`
      )
    } else {
      console.log(`✅ [GUPSHUP] Found config for App Name: ${config._id}`)
    }

    return config
  },
})

/**
 * Get Gupshup configuration by phone number
 * Used for webhook processing when app name is not available
 */
export const getGupshupConfigurationByPhoneNumber = internalQuery({
  args: { phoneNumber: v.string() },
  returns: v.union(whatsappConfigurationValidator, v.null()),
  handler: async (ctx, args) => {
    // Normalize phone numbers for search
    const rawNumber = args.phoneNumber.replace(/^\+/, "")
    const plusNumber = `+${rawNumber}`

    let config = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_phone_number_is_active_provider", (q) =>
        q
          .eq("phoneNumber", rawNumber)
          .eq("isActive", true)
          .eq("provider", "gupshup")
      )
      .first()

    if (!config) {
      config = await ctx.db
        .query("whatsappConfigurations")
        .withIndex("by_phone_number_is_active_provider", (q) =>
          q
            .eq("phoneNumber", plusNumber)
            .eq("isActive", true)
            .eq("provider", "gupshup")
        )
        .first()
    }

    return config
  },
})

/**
 * Process incoming Gupshup WhatsApp message
 * Handles contact creation, conversation management and thread initialization
 */
export const processGupshupIncomingMessage = internalMutation({
  args: {
    contactPhoneNumber: v.string(),
    contactDisplayName: v.string(),
    gupshupAppId: v.string(),
    fromWhatsApp: v.optional(v.boolean()),
  },
  returns: v.object({
    conversation: conversationValidator,
    contact: contactValidator,
    gupshupConfiguration: whatsappConfigurationValidator,
  }),
  handler: async (ctx, args): Promise<ProcessGupshupMessageResult> => {
    // Find active Gupshup configuration by App ID
    let gupshupConfiguration = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_provider_and_gupshup_app_id", (q) =>
        q
          .eq("provider", "gupshup")
          .eq("gupshupAppId", args.gupshupAppId)
          .eq("isActive", true)
      )
      .first()

    // Fallback: try searching by app name (V2 payloads send the app name, not the app ID)
    if (!gupshupConfiguration) {
      console.warn(
        `⚠️ [GUPSHUP] Config not found by gupshupAppId="${args.gupshupAppId}", trying by gupshupAppName...`
      )
      gupshupConfiguration = await ctx.db
        .query("whatsappConfigurations")
        .withIndex("by_provider_and_gupshup_app_name", (q) =>
          q
            .eq("provider", "gupshup")
            .eq("gupshupAppName", args.gupshupAppId)
            .eq("isActive", true)
        )
        .first()
    }

    // Debug: list all active Gupshup configs if still not found
    if (!gupshupConfiguration) {
      const allGupshupConfigs = await ctx.db
        .query("whatsappConfigurations")
        .filter((q) => q.eq(q.field("provider"), "gupshup"))
        .collect()
      console.error(
        `❌ [GUPSHUP] Configuration not found for app: ${args.gupshupAppId}. ` +
          `Existing Gupshup configs (${allGupshupConfigs.length}): ` +
          JSON.stringify(
            allGupshupConfigs.map((c) => ({
              id: c._id,
              appId: c.gupshupAppId,
              appName: c.gupshupAppName,
              isActive: c.isActive,
              org: c.organizationId,
            }))
          )
      )
      throw new GupshupConfigurationNotFoundError()
    }

    console.log(
      `📱 [GUPSHUP] Processing message from ${args.contactPhoneNumber} via app ${args.gupshupAppId} (${gupshupConfiguration.organizationId})`
    )

    const organizationId = gupshupConfiguration.organizationId

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
      (await getConversationNotInResolvedStatusByContactIdAndGupshupConfig(
        ctx,
        {
          contactId: contact._id,
          gupshupConfigurationId: gupshupConfiguration._id,
        }
      )) as Doc<"conversations"> | null

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
        gupshupConfiguration,
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
      gupshupConfigurationId: gupshupConfiguration._id,
      lastMessageAt: args.fromWhatsApp === true ? Date.now() : undefined,
    })) as Doc<"conversations">

    return { conversation, contact, gupshupConfiguration }
  },
})

/**
 * Send WhatsApp text message via Gupshup
 */
export const sendGupshupWhatsAppMessage = internalAction({
  args: {
    gupshupConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.gupshup.getGupshupConfiguration,
      { id: args.gupshupConfigurationId }
    )
    if (!config || config.provider !== "gupshup" || !config.gupshupApiKey) {
      throw new Error(
        `Gupshup configuration invalid or not found: ${args.gupshupConfigurationId}`
      )
    }

    const { sendGupshupMessage } = await import("../model/whatsapp")

    await sendGupshupMessage(
      ctx,
      args.to,
      args.message,
      config.gupshupApiKey,
      config.gupshupSourceNumber || config.phoneNumber
    )
  },
})

/**
 * Send WhatsApp image message via Gupshup
 */
export const sendGupshupWhatsAppImageMessage = internalAction({
  args: {
    gupshupConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    imageUrl: v.string(),
    caption: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.gupshup.getGupshupConfiguration,
      { id: args.gupshupConfigurationId }
    )
    if (!config || config.provider !== "gupshup" || !config.gupshupApiKey) {
      throw new Error(
        `Gupshup configuration invalid or not found: ${args.gupshupConfigurationId}`
      )
    }

    const { sendGupshupImageMessage } = await import("../model/whatsapp")

    await sendGupshupImageMessage(
      ctx,
      args.to,
      args.imageUrl,
      config.gupshupApiKey,
      config.gupshupSourceNumber || config.phoneNumber,
      args.caption
    )
  },
})

/**
 * Send WhatsApp document message via Gupshup
 */
export const sendGupshupWhatsAppDocumentMessage = internalAction({
  args: {
    gupshupConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    documentUrl: v.string(),
    filename: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.gupshup.getGupshupConfiguration,
      { id: args.gupshupConfigurationId }
    )
    if (!config || config.provider !== "gupshup" || !config.gupshupApiKey) {
      throw new Error(
        `Gupshup configuration invalid or not found: ${args.gupshupConfigurationId}`
      )
    }

    const { sendGupshupDocumentMessage } = await import("../model/whatsapp")

    await sendGupshupDocumentMessage(
      ctx,
      args.to,
      args.documentUrl,
      config.gupshupApiKey,
      config.gupshupSourceNumber || config.phoneNumber,
      args.filename,
      args.caption
    )
  },
})

/**
 * Send WhatsApp template message via Gupshup
 */
export const sendGupshupTemplateMessage = internalAction({
  args: {
    gupshupConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    templateId: v.string(),
    params: v.optional(v.array(v.string())),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const config = await ctx.runQuery(
      internal.system.gupshup.getGupshupConfiguration,
      { id: args.gupshupConfigurationId }
    )
    if (!config || config.provider !== "gupshup" || !config.gupshupApiKey) {
      throw new Error(
        `Gupshup configuration invalid or not found: ${args.gupshupConfigurationId}`
      )
    }

    const { sendGupshupTemplateMessageApi } = await import("../model/whatsapp")

    return await sendGupshupTemplateMessageApi(
      ctx,
      args.to,
      args.templateId,
      config.gupshupApiKey,
      config.gupshupSourceNumber || config.phoneNumber,
      args.params
    )
  },
})

/**
 * Send WhatsApp location message via Gupshup
 */
export const sendGupshupWhatsAppLocationMessage = internalAction({
  args: {
    gupshupConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    name: v.string(),
    address: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.gupshup.getGupshupConfiguration,
      { id: args.gupshupConfigurationId }
    )
    if (!config || config.provider !== "gupshup" || !config.gupshupApiKey) {
      throw new Error(
        `Gupshup configuration invalid or not found: ${args.gupshupConfigurationId}`
      )
    }

    const { sendGupshupLocationMessage } = await import("../model/whatsapp")

    await sendGupshupLocationMessage(
      ctx,
      args.to,
      args.latitude,
      args.longitude,
      args.name,
      args.address,
      config.gupshupApiKey,
      config.gupshupSourceNumber || config.phoneNumber
    )
  },
})

/**
 * Configure Gupshup Webhook via Partner API v3
 *
 * Sets the webhook subscription for a Gupshup application using the Partner API.
 * This is required for new apps created in the Partner Portal, where the webhook
 * section is not available in the UI and must be configured via API.
 *
 * @param appId - The Gupshup application ID (e.g., "455685b0-7e55-48b9-93aa-...")
 * @param appToken - The app token from App Details (e.g., "sk_3c048559...")
 * @param webhookUrl - The URL where Gupshup will send webhook events
 * @param modes - Comma-separated event modes to subscribe to (default: "MESSAGE")
 *                Available modes: MESSAGE, DELIVERED, READ, SENT, FAILED,
 *                FLOWS_MESSAGE, PAYMENTS, OTHERS, COEXISTENCE, TEMPLATE
 */
export const setGupshupWebhook = internalAction({
  args: {
    appId: v.string(),
    appToken: v.string(),
    webhookUrl: v.string(),
    modes: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (_ctx, args) => {
    const url = `https://partner.gupshup.io/partner/app/${args.appId}/subscription`
    const modes = args.modes || "MESSAGE"

    console.log(
      `[GUPSHUP] Setting webhook for app ${args.appId} to ${args.webhookUrl} (modes: ${modes})`
    )

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: args.appToken,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          modes,
          tag: "V3 Subscription",
          showOnUI: "true",
          version: "3",
          url: args.webhookUrl,
        }),
      })

      const responseData = await response.json()

      if (!response.ok) {
        console.error(
          `❌ [GUPSHUP] Error setting webhook (${response.status}):`,
          responseData
        )
        throw new Error(
          `Failed to set webhook: ${response.status} - ${JSON.stringify(responseData)}`
        )
      }

      console.log(`✅ [GUPSHUP] Successfully set webhook:`, responseData)
      return responseData
    } catch (error) {
      console.error(`❌ [GUPSHUP] Failed to set webhook:`, error)
      throw error
    }
  },
})
