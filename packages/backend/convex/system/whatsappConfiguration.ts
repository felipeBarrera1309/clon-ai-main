import { v } from "convex/values"
import { internalQuery } from "../_generated/server"

// --- Meta (WhatsApp Business API) Queries ---

// Get WhatsApp configuration by ID
export const get = internalQuery({
  args: {
    id: v.id("whatsappConfigurations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

// Get organization ID from business phone number
export const getByPhoneNumber = internalQuery({
  args: {
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const whatsappConfiguration = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_phone_number", (q) =>
        q.eq("phoneNumber", args.phoneNumber)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .unique()

    if (!whatsappConfiguration) {
      return null
    }

    return whatsappConfiguration
  },
})

// Get organization ID from business phone numberId
export const getByBusinessPhoneNumberId = internalQuery({
  args: {
    businessPhoneNumberId: v.string(),
  },
  handler: async (ctx, args) => {
    const whatsappConfiguration = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_phone_number_id", (q) =>
        q.eq("phoneNumberId", args.businessPhoneNumberId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .unique()

    if (!whatsappConfiguration) {
      return null
    }

    return whatsappConfiguration
  },
})

// Get all WhatsApp configurations for an organization
export const getByOrganization = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
  },
})

// --- Twilio Queries ---

// Get Twilio configuration by ID
export const getTwilio = internalQuery({
  args: {
    id: v.id("twilioConfigurations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

// Get Twilio configuration by phone number
export const getTwilioByPhoneNumber = internalQuery({
  args: {
    twilioPhoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const withPlus = args.twilioPhoneNumber.startsWith("+")
      ? args.twilioPhoneNumber
      : `+${args.twilioPhoneNumber}`
    const withoutPlus = args.twilioPhoneNumber.replace(/^\+/, "")

    // 1. Try whatsappConfigurations (new consolidated table)
    // Try both with and without + on phoneNumber and twilioPhoneNumber
    for (const phone of [withoutPlus, withPlus]) {
      // Check phoneNumber (display)
      const config = await ctx.db
        .query("whatsappConfigurations")
        .withIndex("by_phone_number", (q) => q.eq("phoneNumber", phone))
        .filter((q) =>
          q.and(
            q.eq(q.field("isActive"), true),
            q.eq(q.field("provider"), "twilio")
          )
        )
        .first()

      if (config) return config

      // Check twilioPhoneNumber (specific field)
      const configByTwilio = await ctx.db
        .query("whatsappConfigurations")
        .filter((q) =>
          q.and(
            q.eq(q.field("isActive"), true),
            q.eq(q.field("provider"), "twilio"),
            q.eq(q.field("twilioPhoneNumber"), phone)
          )
        )
        .first()

      if (configByTwilio) return configByTwilio
    }

    // 2. Fallback to legacy twilioConfigurations
    for (const phone of [withoutPlus, withPlus]) {
      const legacyConfig = await ctx.db
        .query("twilioConfigurations")
        .withIndex("by_phone_number", (q) => q.eq("phoneNumber", phone))
        .filter((q) => q.eq(q.field("isActive"), true))
        .first()

      if (legacyConfig) {
        // Map to new format for compatibility
        return {
          ...legacyConfig,
          provider: "twilio",
          twilioAccountSid: legacyConfig.accountSid,
          twilioAuthToken: legacyConfig.authToken,
          twilioPhoneNumber: legacyConfig.phoneNumber,
        }
      }
    }

    return null
  },
})

// Get all Twilio configurations for an organization
export const getTwilioByOrganization = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("twilioConfigurations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
  },
})
