import { v } from "convex/values"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { internalAction } from "../_generated/server"
import { interactiveMessageValidator } from "./whatsapp"

/**
 * Dispatcher that routes WhatsApp messages to the correct provider
 * This ensures type safety by validating/**
 * Send WhatsApp text message using the correct provider
 */
export const sendMessage = internalAction({
  args: {
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
    twilioConfigurationId: v.optional(v.id("whatsappConfigurations")),
    dialog360ConfigurationId: v.optional(v.id("whatsappConfigurations")),
    gupshupConfigurationId: v.optional(v.id("whatsappConfigurations")),
    to: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<void> => {
    if (args.gupshupConfigurationId) {
      await ctx.runAction(internal.system.gupshup.sendGupshupWhatsAppMessage, {
        gupshupConfigurationId: args.gupshupConfigurationId,
        to: args.to,
        message: args.message,
      })
    } else if (args.dialog360ConfigurationId) {
      await ctx.runAction(
        internal.system.dialog360.sendDialog360WhatsAppMessage,
        {
          dialog360ConfigurationId: args.dialog360ConfigurationId,
          to: args.to,
          message: args.message,
        }
      )
    } else if (args.whatsappConfigurationId) {
      await ctx.runAction(internal.system.whatsapp.sendMetaWhatsAppMessage, {
        whatsappConfigurationId: args.whatsappConfigurationId,
        to: args.to,
        message: args.message,
      })
    } else if (args.twilioConfigurationId) {
      await ctx.runAction(internal.system.twilio.sendTwilioWhatsAppMessage, {
        twilioConfigurationId: args.twilioConfigurationId,
        to: args.to,
        message: args.message,
      })
    } else {
      throw new Error(
        "Missing configuration ID (Meta, Twilio, 360dialog, or Gupshup)"
      )
    }
  },
})

/**
 * Send WhatsApp image message using the correct provider
 */
export const sendImageMessage = internalAction({
  args: {
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
    twilioConfigurationId: v.optional(v.id("whatsappConfigurations")),
    dialog360ConfigurationId: v.optional(v.id("whatsappConfigurations")),
    gupshupConfigurationId: v.optional(v.id("whatsappConfigurations")),
    to: v.string(),
    imageUrl: v.string(),
    caption: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<void> => {
    if (args.gupshupConfigurationId) {
      await ctx.runAction(
        internal.system.gupshup.sendGupshupWhatsAppImageMessage,
        {
          gupshupConfigurationId: args.gupshupConfigurationId,
          to: args.to,
          imageUrl: args.imageUrl,
          caption: args.caption,
        }
      )
    } else if (args.dialog360ConfigurationId) {
      await ctx.runAction(
        internal.system.dialog360.sendDialog360WhatsAppImageMessage,
        {
          dialog360ConfigurationId: args.dialog360ConfigurationId,
          to: args.to,
          imageUrl: args.imageUrl,
          caption: args.caption,
        }
      )
    } else if (args.whatsappConfigurationId) {
      await ctx.runAction(
        internal.system.whatsapp.sendMetaWhatsAppImageMessage,
        {
          whatsappConfigurationId: args.whatsappConfigurationId,
          to: args.to,
          imageUrl: args.imageUrl,
          caption: args.caption,
        }
      )
    } else if (args.twilioConfigurationId) {
      await ctx.runAction(
        internal.system.twilio.sendTwilioWhatsAppImageMessage,
        {
          twilioConfigurationId: args.twilioConfigurationId,
          to: args.to,
          imageUrl: args.imageUrl,
          caption: args.caption,
        }
      )
    } else {
      throw new Error(
        "Missing configuration ID (Meta, Twilio, 360dialog, or Gupshup)"
      )
    }
  },
})

/**
 * Send WhatsApp document message using the correct provider
 */
export const sendDocumentMessage = internalAction({
  args: {
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
    twilioConfigurationId: v.optional(v.id("whatsappConfigurations")),
    dialog360ConfigurationId: v.optional(v.id("whatsappConfigurations")),
    gupshupConfigurationId: v.optional(v.id("whatsappConfigurations")),
    to: v.string(),
    documentUrl: v.string(),
    filename: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<void> => {
    if (args.gupshupConfigurationId) {
      await ctx.runAction(
        internal.system.gupshup.sendGupshupWhatsAppDocumentMessage,
        {
          gupshupConfigurationId: args.gupshupConfigurationId,
          to: args.to,
          documentUrl: args.documentUrl,
          filename: args.filename,
          caption: args.caption,
        }
      )
    } else if (args.dialog360ConfigurationId) {
      await ctx.runAction(
        internal.system.dialog360.sendDialog360WhatsAppDocumentMessage,
        {
          dialog360ConfigurationId: args.dialog360ConfigurationId,
          to: args.to,
          documentUrl: args.documentUrl,
          filename: args.filename,
          caption: args.caption,
        }
      )
    } else if (args.whatsappConfigurationId) {
      await ctx.runAction(
        internal.system.whatsapp.sendMetaWhatsAppDocumentMessage,
        {
          whatsappConfigurationId: args.whatsappConfigurationId,
          to: args.to,
          documentUrl: args.documentUrl,
          filename: args.filename,
          caption: args.caption,
        }
      )
    } else if (args.twilioConfigurationId) {
      await ctx.runAction(
        internal.system.twilio.sendTwilioWhatsAppDocumentMessage,
        {
          twilioConfigurationId: args.twilioConfigurationId,
          to: args.to,
          documentUrl: args.documentUrl,
          filename: args.filename,
          caption: args.caption,
        }
      )
    } else {
      throw new Error(
        "Missing configuration ID (Meta, Twilio, 360dialog, or Gupshup)"
      )
    }
  },
})

/**
 * Send WhatsApp location message using the correct provider
 */
export const sendLocationMessage = internalAction({
  args: {
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
    dialog360ConfigurationId: v.optional(v.id("whatsappConfigurations")),
    gupshupConfigurationId: v.optional(v.id("whatsappConfigurations")),
    to: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    name: v.string(),
    address: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<void> => {
    if (args.gupshupConfigurationId) {
      await ctx.runAction(
        internal.system.gupshup.sendGupshupWhatsAppLocationMessage,
        {
          gupshupConfigurationId: args.gupshupConfigurationId,
          to: args.to,
          latitude: args.latitude,
          longitude: args.longitude,
          name: args.name,
          address: args.address,
        }
      )
    } else if (args.dialog360ConfigurationId) {
      await ctx.runAction(
        internal.system.dialog360.sendDialog360WhatsAppLocationMessage,
        {
          dialog360ConfigurationId: args.dialog360ConfigurationId,
          to: args.to,
          latitude: args.latitude,
          longitude: args.longitude,
          name: args.name,
          address: args.address,
        }
      )
    } else if (args.whatsappConfigurationId) {
      // Meta location message - would need to be implemented in whatsapp.ts
      // For now, throw an error as it's not commonly used
      throw new Error(
        "Location messages via Meta not implemented in dispatcher"
      )
    } else {
      throw new Error("Missing configuration ID (Meta, 360dialog, or Gupshup)")
    }
  },
})

/**
 * Send WhatsApp interactive message (Meta only for now)
 */
export const sendInteractiveMessage = internalAction({
  args: {
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
    to: v.string(),
    message: interactiveMessageValidator,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<void> => {
    if (args.whatsappConfigurationId) {
      await ctx.runAction(
        internal.system.whatsapp.sendMetaWhatsAppInteractiveMessage,
        {
          whatsappConfigurationId: args.whatsappConfigurationId,
          to: args.to,
          message: args.message,
        }
      )
    } else {
      // Interactive messages are currently only supported on Meta via this flow
      throw new Error(
        "Interactive messages only supported for Meta provider currently"
      )
    }
  },
})
