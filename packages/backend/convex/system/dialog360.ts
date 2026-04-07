import { createThread } from "@convex-dev/agent"
import { v } from "convex/values"
import { components, internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server"
import { Dialog360ConfigurationNotFoundError } from "../lib/errors"
import { getOrCreateContact } from "../model/contacts"
import {
  createConversation,
  getConversationNotInResolvedStatusByContactIdAndDialog360Config,
} from "../model/conversations"

// 360dialog API constants
const DIALOG360_API_BASE_URL = "https://waba-v2.360dialog.io"
const WHATSAPP_MESSAGING_PRODUCT = "whatsapp"

/**
 * Type-safe interface for the result of incoming 360dialog message processing
 */
export interface ProcessDialog360MessageResult {
  conversation: Doc<"conversations">
  contact: Doc<"contacts">
  dialog360Configuration: Doc<"whatsappConfigurations">
}

/**
 * Get 360dialog configuration by ID
 */
export const getDialog360Configuration = internalQuery({
  args: { id: v.id("whatsappConfigurations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

/**
 * Get 360dialog configuration by API Key
 * Used for webhook processing to identify which organization the message belongs to
 */
export const getDialog360ConfigurationByApiKey = internalQuery({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("whatsappConfigurations")
      .filter((q) =>
        q.and(
          q.eq(q.field("provider"), "360dialog"),
          q.eq(q.field("dialog360ApiKey"), args.apiKey),
          q.eq(q.field("isActive"), true)
        )
      )
      .first()

    if (!config) {
      console.error(
        `❌ [360DIALOG] No config found for API Key: ${args.apiKey.substring(0, 10)}...`
      )
    } else {
      console.log(`✅ [360DIALOG] Found config for API Key: ${config._id}`)
    }

    return config
  },
})

/**
 * Get 360dialog configuration by phone number
 * Used for webhook processing when API key is not available in headers
 */
export const getDialog360ConfigurationByPhoneNumber = internalQuery({
  args: { phoneNumber: v.string() },
  handler: async (ctx, args) => {
    // Normalize phone numbers for search
    const rawNumber = args.phoneNumber.replace(/^\+/, "")
    const plusNumber = `+${rawNumber}`

    let config = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_phone_number", (q) => q.eq("phoneNumber", rawNumber))
      .filter((q) =>
        q.and(
          q.eq(q.field("isActive"), true),
          q.eq(q.field("provider"), "360dialog")
        )
      )
      .first()

    if (!config) {
      config = await ctx.db
        .query("whatsappConfigurations")
        .withIndex("by_phone_number", (q) => q.eq("phoneNumber", plusNumber))
        .filter((q) =>
          q.and(
            q.eq(q.field("isActive"), true),
            q.eq(q.field("provider"), "360dialog")
          )
        )
        .first()
    }

    return config
  },
})

/**
 * Process incoming 360dialog WhatsApp message
 * Handles contact creation, conversation management and thread initialization
 */
export const processDialog360IncomingMessage = internalMutation({
  args: {
    contactPhoneNumber: v.string(),
    contactDisplayName: v.string(),
    businessPhoneNumber: v.string(),
    fromWhatsApp: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ProcessDialog360MessageResult> => {
    // Normalize phone numbers for search
    const rawBusinessNumber = args.businessPhoneNumber.replace(/^\+/, "")
    const plusBusinessNumber = `+${rawBusinessNumber}`

    // Find active 360dialog configuration
    let dialog360Configuration = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_phone_number", (q) =>
        q.eq("phoneNumber", rawBusinessNumber)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("isActive"), true),
          q.eq(q.field("provider"), "360dialog")
        )
      )
      .first()

    if (!dialog360Configuration) {
      dialog360Configuration = await ctx.db
        .query("whatsappConfigurations")
        .withIndex("by_phone_number", (q) =>
          q.eq("phoneNumber", plusBusinessNumber)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("isActive"), true),
            q.eq(q.field("provider"), "360dialog")
          )
        )
        .first()
    }

    if (!dialog360Configuration) {
      console.error(
        `❌ [360DIALOG] Configuration not found for ${args.businessPhoneNumber}`
      )
      throw new Dialog360ConfigurationNotFoundError()
    }

    console.log(
      `📱 [360DIALOG] Processing message from ${args.contactPhoneNumber} to ${args.businessPhoneNumber} (${dialog360Configuration.organizationId})`
    )

    const organizationId = dialog360Configuration.organizationId

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
      (await getConversationNotInResolvedStatusByContactIdAndDialog360Config(
        ctx,
        {
          contactId: contact._id,
          dialog360ConfigurationId: dialog360Configuration._id,
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
        dialog360Configuration,
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
      dialog360ConfigurationId: dialog360Configuration._id,
      lastMessageAt: args.fromWhatsApp === true ? Date.now() : undefined,
    })) as Doc<"conversations">

    return { conversation, contact, dialog360Configuration }
  },
})

/**
 * Send WhatsApp text message via 360dialog
 */
export const sendDialog360WhatsAppMessage = internalAction({
  args: {
    dialog360ConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.dialog360.getDialog360Configuration,
      { id: args.dialog360ConfigurationId }
    )
    if (!config || config.provider !== "360dialog" || !config.dialog360ApiKey) {
      throw new Error(
        `360dialog configuration invalid or not found: ${args.dialog360ConfigurationId}`
      )
    }

    const { sendDialog360Message } = await import("../model/whatsapp")

    await sendDialog360Message(
      ctx,
      args.to,
      args.message,
      config.dialog360ApiKey
    )
  },
})

/**
 * Send WhatsApp image message via 360dialog
 */
export const sendDialog360WhatsAppImageMessage = internalAction({
  args: {
    dialog360ConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    imageUrl: v.string(),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.dialog360.getDialog360Configuration,
      { id: args.dialog360ConfigurationId }
    )
    if (!config || config.provider !== "360dialog" || !config.dialog360ApiKey) {
      throw new Error(
        `360dialog configuration invalid or not found: ${args.dialog360ConfigurationId}`
      )
    }

    const { uploadMediaToDialog360, sendDialog360ImageMessage } = await import(
      "../model/whatsapp"
    )

    // Determine MIME type from URL extension
    const urlLower = args.imageUrl.toLowerCase()
    let mimeType = "image/jpeg" // Default
    if (urlLower.includes(".png")) {
      mimeType = "image/png"
    } else if (urlLower.includes(".gif")) {
      mimeType = "image/gif"
    } else if (urlLower.includes(".webp")) {
      mimeType = "image/webp"
    }

    // Upload media to 360dialog first
    const mediaId = await uploadMediaToDialog360(
      ctx,
      args.imageUrl,
      config.dialog360ApiKey,
      mimeType
    )

    // Send the image message
    await sendDialog360ImageMessage(
      ctx,
      args.to,
      mediaId,
      config.dialog360ApiKey,
      args.caption
    )
  },
})

/**
 * Send WhatsApp document message via 360dialog
 */
export const sendDialog360WhatsAppDocumentMessage = internalAction({
  args: {
    dialog360ConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    documentUrl: v.string(),
    filename: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.dialog360.getDialog360Configuration,
      { id: args.dialog360ConfigurationId }
    )
    if (!config || config.provider !== "360dialog" || !config.dialog360ApiKey) {
      throw new Error(
        `360dialog configuration invalid or not found: ${args.dialog360ConfigurationId}`
      )
    }

    const { uploadMediaToDialog360, sendDialog360DocumentMessage } =
      await import("../model/whatsapp")

    // Upload media to 360dialog first
    const mediaId = await uploadMediaToDialog360(
      ctx,
      args.documentUrl,
      config.dialog360ApiKey,
      "application/pdf"
    )

    // Send the document message
    await sendDialog360DocumentMessage(
      ctx,
      args.to,
      mediaId,
      config.dialog360ApiKey,
      args.caption,
      args.filename
    )
  },
})

/**
 * Send WhatsApp template message via 360dialog
 */
export const sendDialog360TemplateMessage = internalAction({
  args: {
    dialog360ConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    templateName: v.string(),
    language: v.string(),
    params: v.optional(v.array(v.string())),
    mediaType: v.optional(
      v.union(v.literal("image"), v.literal("video"), v.literal("document"))
    ),
    mediaUrl: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const config = await ctx.runQuery(
      internal.system.dialog360.getDialog360Configuration,
      { id: args.dialog360ConfigurationId }
    )
    if (!config || config.provider !== "360dialog" || !config.dialog360ApiKey) {
      throw new Error(
        `360dialog configuration invalid or not found: ${args.dialog360ConfigurationId}`
      )
    }

    const { sendDialog360TemplateMessageApi } = await import(
      "../model/whatsapp"
    )

    return await sendDialog360TemplateMessageApi(
      ctx,
      args.to,
      args.templateName,
      args.language,
      config.dialog360ApiKey,
      args.params,
      args.mediaType,
      args.mediaUrl
    )
  },
})

/**
 * Send WhatsApp location message via 360dialog
 */
export const sendDialog360WhatsAppLocationMessage = internalAction({
  args: {
    dialog360ConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    name: v.string(),
    address: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.dialog360.getDialog360Configuration,
      { id: args.dialog360ConfigurationId }
    )
    if (!config || config.provider !== "360dialog" || !config.dialog360ApiKey) {
      throw new Error(
        `360dialog configuration invalid or not found: ${args.dialog360ConfigurationId}`
      )
    }

    const { sendDialog360LocationMessage } = await import("../model/whatsapp")

    await sendDialog360LocationMessage(
      ctx,
      args.to,
      args.latitude,
      args.longitude,
      args.name,
      args.address,
      config.dialog360ApiKey
    )
  },
})
