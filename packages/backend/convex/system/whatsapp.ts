import { createThread } from "@convex-dev/agent"
import { v } from "convex/values"
import { components, internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import { internalAction, internalMutation } from "../_generated/server"
import { WhatsappConfigurationNotFoundError } from "../lib/errors"
import { getOrCreateContact } from "../model/contacts"
import {
  createConversation,
  getConversationNotInResolvedStatusByContactIdAndWhatsappConfig,
} from "../model/conversations"
import { sendWhatsAppInteractiveMessage } from "../model/whatsapp"

/**
 * Type-safe interface for the result of incoming Meta message processing
 */
export interface ProcessMetaMessageResult {
  conversation: Doc<"conversations">
  contact: Doc<"contacts">
  whatsappConfiguration: Doc<"whatsappConfigurations">
}

/**
 * Process incoming WhatsApp message (Meta)
 */
export const processIncomingMessage = internalMutation({
  args: {
    contactPhoneNumber: v.string(),
    contactDisplayName: v.string(),
    businessPhoneNumberId: v.string(),
    businessDisplayPhoneNumber: v.string(),
    fromWhatsApp: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ProcessMetaMessageResult> => {
    // 1. Buscar configuración de Meta
    const whatsappConfiguration = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_phone_number_id", (q) =>
        q.eq("phoneNumberId", args.businessPhoneNumberId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .first()

    if (!whatsappConfiguration) {
      console.error(
        `❌ [META] Configuración de WhatsApp no encontrada para businessPhoneNumberId=${args.businessPhoneNumberId}`
      )
      throw new WhatsappConfigurationNotFoundError()
    }

    const organizationId = whatsappConfiguration.organizationId

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

    // Check if we have an existing unresolved or escalated conversation
    const existingConversation =
      (await getConversationNotInResolvedStatusByContactIdAndWhatsappConfig(
        ctx,
        {
          contactId: contact._id,
          whatsappConfigurationId: whatsappConfiguration._id,
        }
      )) as Doc<"conversations"> | null

    if (existingConversation) {
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
        whatsappConfiguration,
      }
    }

    // Create new conversation and thread
    const threadId = await createThread(ctx, components.agent, {
      userId: organizationId,
    })
    const conversation = (await createConversation(ctx, {
      contactId: contact._id,
      threadId: threadId,
      organizationId,
      status: "unresolved",
      whatsappConfigurationId: whatsappConfiguration._id,
      lastMessageAt: args.fromWhatsApp === true ? Date.now() : undefined,
    })) as Doc<"conversations">

    return { conversation, contact, whatsappConfiguration }
  },
})

/**
 * Send WhatsApp message for order status updates
 * This function is called when an order status changes and the 24-hour window allows it
 */
export const sendOrderStatusWhatsAppMessage = internalAction({
  args: {
    contactPhoneNumber: v.string(),
    message: v.string(),
    orderNumber: v.string(),
    businessPhoneNumberId: v.string(),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(
      `📱 [WHATSAPP STATUS] Sending order status message to ${args.contactPhoneNumber} for order ${args.orderNumber}`
    )
    try {
      // Get WhatsApp configuration by phoneNumberId
      const whatsappConfig = await ctx.runQuery(
        internal.system.whatsappConfiguration.getByBusinessPhoneNumberId,
        { businessPhoneNumberId: args.businessPhoneNumberId }
      )

      if (!whatsappConfig) {
        throw new Error("WhatsApp configuration not found")
      }

      // Send the WhatsApp message using dispatcher
      await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
        whatsappConfigurationId: whatsappConfig._id,
        to: args.contactPhoneNumber,
        message: args.message,
      })
      console.log(
        `✅ WhatsApp order status message sent successfully to ${args.contactPhoneNumber} for order ${args.orderNumber}`
      )
    } catch (error) {
      console.error(
        `❌ Error sending WhatsApp order status message to ${args.contactPhoneNumber}:`,
        error
      )
    }
  },
})

/**
 * Send WhatsApp message for operator responses
 * This function is called when an operator sends a message through the dashboard
 */
export const sendOperatorWhatsAppMessage = internalAction({
  args: {
    contactPhoneNumber: v.string(),
    message: v.string(),
    businessPhoneNumberId: v.optional(v.string()),
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
    accessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log(
      `👨‍💼 [WHATSAPP OPERATOR] Sending operator message to ${args.contactPhoneNumber}`
    )
    try {
      let whatsappConfig = null

      if (args.whatsappConfigurationId) {
        whatsappConfig = await ctx.runQuery(
          internal.system.whatsappConfiguration.get,
          { id: args.whatsappConfigurationId }
        )
      } else if (args.businessPhoneNumberId) {
        whatsappConfig = await ctx.runQuery(
          internal.system.whatsappConfiguration.getByBusinessPhoneNumberId,
          { businessPhoneNumberId: args.businessPhoneNumberId }
        )
      }

      if (!whatsappConfig) {
        throw new Error("WhatsApp configuration not found")
      }

      // Determine provider more robustly
      const is360Dialog =
        whatsappConfig.provider === "360dialog" ||
        !!whatsappConfig.dialog360ApiKey
      const isGupshup =
        whatsappConfig.provider === "gupshup" || !!whatsappConfig.gupshupApiKey

      if (is360Dialog) {
        // Send via 360dialog dispatcher
        await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
          dialog360ConfigurationId: whatsappConfig._id,
          to: args.contactPhoneNumber,
          message: args.message,
        })
      } else if (isGupshup) {
        // Send via Gupshup dispatcher
        await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
          gupshupConfigurationId: whatsappConfig._id,
          to: args.contactPhoneNumber,
          message: args.message,
        })
      } else {
        // Send via standard WhatsApp dispatcher
        await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
          whatsappConfigurationId: whatsappConfig._id,
          to: args.contactPhoneNumber,
          message: args.message,
        })
      }

      console.log(
        `✅ WhatsApp operator message sent successfully to ${args.contactPhoneNumber}`
      )
    } catch (error) {
      console.error(
        `❌ Error sending WhatsApp operator message to ${args.contactPhoneNumber}:`,
        error
      )
    }
  },
})

/**
 * Send WhatsApp image message for operator responses
 * This function is called when an operator sends an image through the dashboard
 * Now saves images to R2 storage for consistency with user images
 */
export const sendOperatorWhatsAppImageMessage = internalAction({
  args: {
    contactPhoneNumber: v.string(),
    imageUrl: v.string(),
    businessPhoneNumberId: v.optional(v.string()),
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
    accessToken: v.optional(v.string()),
    mimeType: v.string(),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log(
      `👨‍💼 [WHATSAPP OPERATOR] Sending operator image message to ${args.contactPhoneNumber}`
    )
    try {
      // First, download and store the image in R2 for persistent storage
      const { downloadAndStoreMediaR2 } = await import("../model/whatsapp")

      // Download image and store in R2 (same as user images)
      console.log(
        `👨‍💼 [WHATSAPP OPERATOR] Storing image in R2: ${args.imageUrl}`
      )
      const { storageId, url: r2ImageUrl } = await downloadAndStoreMediaR2(
        ctx,
        args.imageUrl,
        args.accessToken || "",
        args.mimeType
      )

      console.log(`✅ Image stored in R2 with ID: ${storageId}`)

      let whatsappConfig = null

      if (args.whatsappConfigurationId) {
        whatsappConfig = await ctx.runQuery(
          internal.system.whatsappConfiguration.get,
          { id: args.whatsappConfigurationId }
        )
      } else if (args.businessPhoneNumberId) {
        whatsappConfig = await ctx.runQuery(
          internal.system.whatsappConfiguration.getByBusinessPhoneNumberId,
          { businessPhoneNumberId: args.businessPhoneNumberId }
        )
      }

      if (!whatsappConfig) {
        throw new Error("WhatsApp configuration not found")
      }

      // Determine provider more robustly
      const is360Dialog =
        whatsappConfig.provider === "360dialog" ||
        !!whatsappConfig.dialog360ApiKey
      const isGupshup =
        whatsappConfig.provider === "gupshup" || !!whatsappConfig.gupshupApiKey

      if (is360Dialog) {
        // Send via 360dialog dispatcher
        await ctx.runAction(
          internal.system.whatsappDispatcher.sendImageMessage,
          {
            dialog360ConfigurationId: whatsappConfig._id,
            to: args.contactPhoneNumber,
            imageUrl: r2ImageUrl,
            caption: args.caption,
          }
        )
      } else if (isGupshup) {
        // Send via Gupshup dispatcher
        await ctx.runAction(
          internal.system.whatsappDispatcher.sendImageMessage,
          {
            gupshupConfigurationId: whatsappConfig._id,
            to: args.contactPhoneNumber,
            imageUrl: r2ImageUrl,
            caption: args.caption,
          }
        )
      } else {
        // Then send the image message using the dispatcher
        await ctx.runAction(
          internal.system.whatsappDispatcher.sendImageMessage,
          {
            whatsappConfigurationId: whatsappConfig._id,
            to: args.contactPhoneNumber,
            imageUrl: r2ImageUrl,
            caption: args.caption,
          }
        )
      }

      console.log(
        `✅ WhatsApp operator image message sent successfully to ${args.contactPhoneNumber}`
      )
    } catch (error) {
      console.error(
        `❌ Error sending WhatsApp operator image message to ${args.contactPhoneNumber}:`,
        error
      )
      throw error
    }
  },
})

// ============================================================================
// PROVIDER-SPECIFIC SEND FUNCTIONS (META ONLY)
// ============================================================================

/**
 * Send WhatsApp message via Meta
 */
export const sendMetaWhatsAppMessage = internalAction({
  args: {
    whatsappConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.whatsappConfiguration.get,
      { id: args.whatsappConfigurationId }
    )

    if (!config || (config.provider ?? "meta") !== "meta") {
      throw new Error("Invalid Meta configuration")
    }

    if (!config.phoneNumberId || !config.accessToken) {
      throw new Error("Meta configuration missing required fields")
    }

    const { sendWhatsAppMessage } = await import("../model/whatsapp")

    await sendWhatsAppMessage(ctx, args.to, args.message, {
      provider: "meta",
      accessToken: config.accessToken,
      phoneNumberId: config.phoneNumberId,
    })
  },
})

/**
 * Send WhatsApp image message via Meta
 */
export const sendMetaWhatsAppImageMessage = internalAction({
  args: {
    whatsappConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    imageUrl: v.string(),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.whatsappConfiguration.get,
      { id: args.whatsappConfigurationId }
    )

    if (!config || (config.provider ?? "meta") !== "meta") {
      throw new Error("Invalid Meta configuration")
    }

    if (!config.phoneNumberId || !config.accessToken) {
      throw new Error("Meta configuration missing required fields")
    }

    const { uploadMediaToWhatsApp, sendWhatsAppImageMessage } = await import(
      "../model/whatsapp"
    )

    // For Meta, we HAVE to upload the media first to get a mediaId
    const mediaId = await uploadMediaToWhatsApp(
      ctx,
      args.imageUrl,
      config.phoneNumberId,
      config.accessToken,
      "image/jpeg" // Default to jpeg
    )

    await sendWhatsAppImageMessage(
      ctx,
      args.to,
      mediaId,
      config.phoneNumberId,
      config.accessToken,
      args.caption
    )
  },
})

/**
 * Send WhatsApp document message via Meta
 */
export const sendMetaWhatsAppDocumentMessage = internalAction({
  args: {
    whatsappConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    documentUrl: v.string(),
    filename: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.whatsappConfiguration.get,
      { id: args.whatsappConfigurationId }
    )

    if (!config || (config.provider ?? "meta") !== "meta") {
      throw new Error("Invalid Meta configuration")
    }

    if (!config.phoneNumberId || !config.accessToken) {
      throw new Error("Meta configuration missing required fields")
    }

    const { uploadMediaToWhatsApp, sendWhatsAppDocumentMessage } = await import(
      "../model/whatsapp"
    )

    // For Meta, we HAVE to upload the media first to get a mediaId
    const mediaId = await uploadMediaToWhatsApp(
      ctx,
      args.documentUrl,
      config.phoneNumberId,
      config.accessToken,
      "application/pdf" // Default to pdf
    )

    await sendWhatsAppDocumentMessage(
      ctx,
      args.to,
      mediaId,
      config.phoneNumberId,
      config.accessToken,
      args.caption,
      args.filename
    )
  },
})

const interactiveHeaderValidator = v.object({
  type: v.union(
    v.literal("text"),
    v.literal("image"),
    v.literal("video"),
    v.literal("document")
  ),
  text: v.optional(v.string()),
  image: v.optional(
    v.object({ id: v.optional(v.string()), link: v.optional(v.string()) })
  ),
  video: v.optional(
    v.object({ id: v.optional(v.string()), link: v.optional(v.string()) })
  ),
  document: v.optional(
    v.object({
      id: v.optional(v.string()),
      link: v.optional(v.string()),
      filename: v.optional(v.string()),
    })
  ),
})

const interactiveBodyValidator = v.object({ text: v.string() })
const interactiveFooterValidator = v.object({ text: v.string() })

export const interactiveMessageValidator = v.union(
  // Button
  v.object({
    type: v.literal("interactive"),
    interactiveType: v.literal("button"),
    to: v.string(),
    header: v.optional(interactiveHeaderValidator),
    body: interactiveBodyValidator,
    footer: v.optional(interactiveFooterValidator),
    buttons: v.array(
      v.object({
        type: v.literal("reply"),
        reply: v.object({ id: v.string(), title: v.string() }),
      })
    ),
  }),
  // List
  v.object({
    type: v.literal("interactive"),
    interactiveType: v.literal("list"),
    to: v.string(),
    header: v.optional(interactiveHeaderValidator),
    body: interactiveBodyValidator,
    footer: v.optional(interactiveFooterValidator),
    buttonText: v.string(),
    sections: v.array(
      v.object({
        title: v.optional(v.string()),
        rows: v.array(
          v.object({
            id: v.string(),
            title: v.string(),
            description: v.optional(v.string()),
          })
        ),
      })
    ),
  }),
  // CTA URL
  v.object({
    type: v.literal("interactive"),
    interactiveType: v.literal("cta_url"),
    to: v.string(),
    header: v.optional(interactiveHeaderValidator),
    body: interactiveBodyValidator,
    footer: v.optional(interactiveFooterValidator),
    ctaButtonText: v.string(),
    ctaUrl: v.string(),
  }),
  // Location Request
  v.object({
    type: v.literal("interactive"),
    interactiveType: v.literal("location_request"),
    to: v.string(),
    body: interactiveBodyValidator,
  })
)

/**
 * Send WhatsApp interactive message via Meta
 */
export const sendMetaWhatsAppInteractiveMessage = internalAction({
  args: {
    whatsappConfigurationId: v.id("whatsappConfigurations"),
    to: v.string(),
    message: interactiveMessageValidator,
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.whatsappConfiguration.get,
      { id: args.whatsappConfigurationId }
    )

    if (!config || (config.provider ?? "meta") !== "meta") {
      throw new Error("Invalid Meta configuration")
    }

    if (!config.phoneNumberId || !config.accessToken) {
      throw new Error("Meta configuration missing required fields")
    }

    await sendWhatsAppInteractiveMessage(
      ctx,
      args.to,
      args.message,
      config.phoneNumberId,
      config.accessToken
    )
  },
})
