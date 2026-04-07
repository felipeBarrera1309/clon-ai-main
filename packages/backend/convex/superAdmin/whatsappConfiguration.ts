import { v } from "convex/values"
import {
  assertOrganizationAccess,
  platformAdminOrImplementorMutation,
  platformAdminOrImplementorQuery,
} from "../lib/superAdmin"
import { whatsappProviderValidator } from "../schema"

// --- Meta (WhatsApp Business API) Queries ---

export const getConfigurations = platformAdminOrImplementorQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOrganizationAccess(ctx, args.organizationId)
    return await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
  },
})

// --- Twilio Queries ---

export const getTwilioConfigurations = platformAdminOrImplementorQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOrganizationAccess(ctx, args.organizationId)
    return await ctx.db
      .query("twilioConfigurations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
  },
})

// --- Meta (WhatsApp Business API) Mutations ---

export const createConfiguration = platformAdminOrImplementorMutation({
  args: {
    organizationId: v.string(),
    provider: v.optional(whatsappProviderValidator),
    // Meta fields
    accessToken: v.optional(v.string()),
    phoneNumberId: v.optional(v.string()),
    wabaId: v.optional(v.string()),
    // Twilio fields
    twilioAccountSid: v.optional(v.string()),
    twilioAuthToken: v.optional(v.string()),
    twilioPhoneNumber: v.optional(v.string()),
    // 360dialog fields
    dialog360ApiKey: v.optional(v.string()),
    // Gupshup fields
    gupshupApiKey: v.optional(v.string()),
    gupshupAppName: v.optional(v.string()),
    gupshupAppId: v.optional(v.string()),
    gupshupAppToken: v.optional(v.string()),
    gupshupSourceNumber: v.optional(v.string()),
    gupshupMediaToken: v.optional(v.string()),
    // Common fields
    phoneNumber: v.string(),
    displayName: v.optional(v.string()),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
  },
  handler: async (ctx, args) => {
    await assertOrganizationAccess(ctx, args.organizationId)

    const existingConfig = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_organization_and_phone_number", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("phoneNumber", args.phoneNumber)
      )
      .first()

    if (existingConfig) {
      throw new Error(
        "Ya existe una configuración con este número de teléfono para esta organización"
      )
    }

    return await ctx.db.insert("whatsappConfigurations", {
      organizationId: args.organizationId,
      provider: args.provider || "meta",
      accessToken: args.accessToken,
      phoneNumberId: args.phoneNumberId,
      wabaId: args.wabaId,
      twilioAccountSid: args.twilioAccountSid,
      twilioAuthToken: args.twilioAuthToken,
      twilioPhoneNumber: args.twilioPhoneNumber,
      dialog360ApiKey: args.dialog360ApiKey,
      gupshupApiKey: args.gupshupApiKey,
      gupshupAppName: args.gupshupAppName,
      gupshupAppId: args.gupshupAppId,
      gupshupAppToken: args.gupshupAppToken,
      gupshupSourceNumber: args.gupshupSourceNumber,
      gupshupMediaToken: args.gupshupMediaToken,
      phoneNumber: args.phoneNumber,
      displayName: args.displayName,
      restaurantLocationId: args.restaurantLocationId,
      isActive: false,
      lastModified: Date.now(),
    })
  },
})

export const updateConfiguration = platformAdminOrImplementorMutation({
  args: {
    organizationId: v.string(),
    configurationId: v.id("whatsappConfigurations"),
    provider: v.optional(whatsappProviderValidator),
    accessToken: v.optional(v.string()),
    phoneNumberId: v.optional(v.string()),
    wabaId: v.optional(v.string()),
    twilioAccountSid: v.optional(v.string()),
    twilioAuthToken: v.optional(v.string()),
    twilioPhoneNumber: v.optional(v.string()),
    dialog360ApiKey: v.optional(v.string()),
    gupshupApiKey: v.optional(v.string()),
    gupshupAppName: v.optional(v.string()),
    gupshupAppId: v.optional(v.string()),
    gupshupAppToken: v.optional(v.string()),
    gupshupSourceNumber: v.optional(v.string()),
    gupshupMediaToken: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    displayName: v.optional(v.string()),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { configurationId, organizationId, ...updateData } = args
    await assertOrganizationAccess(ctx, organizationId)

    const existingConfig = await ctx.db.get(configurationId)
    if (!existingConfig || existingConfig.organizationId !== organizationId) {
      throw new Error("Configuration not found or access denied")
    }

    await ctx.db.patch(configurationId, {
      ...updateData,
      lastModified: Date.now(),
    })

    return null
  },
})

export const deleteConfiguration = platformAdminOrImplementorMutation({
  args: {
    organizationId: v.string(),
    configurationId: v.id("whatsappConfigurations"),
  },
  handler: async (ctx, args) => {
    await assertOrganizationAccess(ctx, args.organizationId)

    const existingConfig = await ctx.db.get(args.configurationId)
    if (
      !existingConfig ||
      existingConfig.organizationId !== args.organizationId
    ) {
      throw new Error("Configuration not found or access denied")
    }

    if (existingConfig.isActive) {
      throw new Error(
        "No puedes eliminar una configuración activa. Desactívala primero."
      )
    }

    await ctx.db.delete(args.configurationId)
    return null
  },
})

export const toggleActiveStatus = platformAdminOrImplementorMutation({
  args: {
    organizationId: v.string(),
    configurationId: v.id("whatsappConfigurations"),
  },
  handler: async (ctx, args) => {
    await assertOrganizationAccess(ctx, args.organizationId)

    const config = await ctx.db.get(args.configurationId)
    if (!config || config.organizationId !== args.organizationId) {
      throw new Error("Configuration not found or access denied")
    }

    const newActiveStatus = !config.isActive

    await ctx.db.patch(args.configurationId, {
      isActive: newActiveStatus,
      lastModified: Date.now(),
    })

    return { isActive: newActiveStatus }
  },
})

// --- Twilio Mutations ---

export const createTwilioConfiguration = platformAdminOrImplementorMutation({
  args: {
    organizationId: v.string(),
    accountSid: v.string(),
    authToken: v.string(),
    phoneNumber: v.string(),
    displayName: v.optional(v.string()),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
  },
  handler: async (ctx, args) => {
    await assertOrganizationAccess(ctx, args.organizationId)

    const existingConfig = await ctx.db
      .query("twilioConfigurations")
      .withIndex("by_organization_and_phone_number", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("phoneNumber", args.phoneNumber)
      )
      .first()

    if (existingConfig) {
      throw new Error(
        "Ya existe una configuración con este número de teléfono para esta organización"
      )
    }

    return await ctx.db.insert("twilioConfigurations", {
      organizationId: args.organizationId,
      accountSid: args.accountSid,
      authToken: args.authToken,
      phoneNumber: args.phoneNumber,
      displayName: args.displayName,
      restaurantLocationId: args.restaurantLocationId,
      isActive: false,
      lastModified: Date.now(),
    })
  },
})

export const updateTwilioConfiguration = platformAdminOrImplementorMutation({
  args: {
    organizationId: v.string(),
    configurationId: v.id("twilioConfigurations"),
    accountSid: v.optional(v.string()),
    authToken: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    displayName: v.optional(v.string()),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
  },
  handler: async (ctx, args) => {
    const { configurationId, organizationId, ...updateData } = args
    await assertOrganizationAccess(ctx, organizationId)

    const existingConfig = await ctx.db.get(configurationId)
    if (!existingConfig || existingConfig.organizationId !== organizationId) {
      throw new Error("Configuration not found or access denied")
    }

    await ctx.db.patch(configurationId, {
      ...updateData,
      lastModified: Date.now(),
    })

    return null
  },
})

export const deleteTwilioConfiguration = platformAdminOrImplementorMutation({
  args: {
    organizationId: v.string(),
    configurationId: v.id("twilioConfigurations"),
  },
  handler: async (ctx, args) => {
    await assertOrganizationAccess(ctx, args.organizationId)

    const existingConfig = await ctx.db.get(args.configurationId)
    if (
      !existingConfig ||
      existingConfig.organizationId !== args.organizationId
    ) {
      throw new Error("Configuration not found or access denied")
    }

    if (existingConfig.isActive) {
      throw new Error(
        "No puedes eliminar una configuración activa. Desactívala primero."
      )
    }

    await ctx.db.delete(args.configurationId)
    return null
  },
})

export const toggleTwilioActiveStatus = platformAdminOrImplementorMutation({
  args: {
    organizationId: v.string(),
    configurationId: v.id("twilioConfigurations"),
  },
  handler: async (ctx, args) => {
    await assertOrganizationAccess(ctx, args.organizationId)

    const config = await ctx.db.get(args.configurationId)
    if (!config || config.organizationId !== args.organizationId) {
      throw new Error("Configuration not found or access denied")
    }

    const newActiveStatus = !config.isActive

    await ctx.db.patch(args.configurationId, {
      isActive: newActiveStatus,
      lastModified: Date.now(),
    })

    return { isActive: newActiveStatus }
  },
})

export const getConfigurationsByRestaurantLocation =
  platformAdminOrImplementorQuery({
    args: {
      organizationId: v.string(),
      restaurantLocationId: v.optional(v.id("restaurantLocations")),
    },
    handler: async (ctx, args) => {
      await assertOrganizationAccess(ctx, args.organizationId)

      if (args.restaurantLocationId) {
        // Get configurations for a specific restaurant location
        const configs = await ctx.db
          .query("whatsappConfigurations")
          .withIndex("by_organization_and_restaurant_location", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("restaurantLocationId", args.restaurantLocationId)
          )
          .collect()
        return configs
      } else {
        // Get configurations not associated with any specific location (general configurations)
        const configs = await ctx.db
          .query("whatsappConfigurations")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .filter((q) => q.eq(q.field("restaurantLocationId"), undefined))
          .collect()
        return configs
      }
    },
  })

export const getTwilioConfigurationsByRestaurantLocation =
  platformAdminOrImplementorQuery({
    args: {
      organizationId: v.string(),
      restaurantLocationId: v.optional(v.id("restaurantLocations")),
    },
    handler: async (ctx, args) => {
      await assertOrganizationAccess(ctx, args.organizationId)

      if (args.restaurantLocationId) {
        const configs = await ctx.db
          .query("twilioConfigurations")
          .withIndex("by_organization_and_restaurant_location", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("restaurantLocationId", args.restaurantLocationId)
          )
          .collect()
        return configs
      } else {
        const configs = await ctx.db
          .query("twilioConfigurations")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .filter((q) => q.eq(q.field("restaurantLocationId"), undefined))
          .collect()
        return configs
      }
    },
  })

export const updateRestaurantLocationAssociation =
  platformAdminOrImplementorMutation({
    args: {
      organizationId: v.string(),
      configurationId: v.id("whatsappConfigurations"),
      restaurantLocationId: v.optional(v.id("restaurantLocations")),
    },
    handler: async (ctx, args) => {
      await assertOrganizationAccess(ctx, args.organizationId)

      const existingConfig = await ctx.db.get(args.configurationId)
      if (
        !existingConfig ||
        existingConfig.organizationId !== args.organizationId
      ) {
        throw new Error("Configuration not found or access denied")
      }

      if (args.restaurantLocationId) {
        const location = await ctx.db.get(args.restaurantLocationId)
        if (!location || location.organizationId !== args.organizationId) {
          throw new Error("Restaurant location not found or access denied")
        }
      }

      await ctx.db.patch(args.configurationId, {
        restaurantLocationId: args.restaurantLocationId,
        lastModified: Date.now(),
      })
    },
  })

export const updateTwilioRestaurantLocationAssociation =
  platformAdminOrImplementorMutation({
    args: {
      organizationId: v.string(),
      configurationId: v.id("twilioConfigurations"),
      restaurantLocationId: v.optional(v.id("restaurantLocations")),
    },
    handler: async (ctx, args) => {
      await assertOrganizationAccess(ctx, args.organizationId)

      const existingConfig = await ctx.db.get(args.configurationId)
      if (
        !existingConfig ||
        existingConfig.organizationId !== args.organizationId
      ) {
        throw new Error("Configuration not found or access denied")
      }

      if (args.restaurantLocationId) {
        const location = await ctx.db.get(args.restaurantLocationId)
        if (!location || location.organizationId !== args.organizationId) {
          throw new Error("Restaurant location not found or access denied")
        }
      }

      await ctx.db.patch(args.configurationId, {
        restaurantLocationId: args.restaurantLocationId,
        lastModified: Date.now(),
      })
    },
  })
