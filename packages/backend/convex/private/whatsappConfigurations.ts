import { ConvexError, v } from "convex/values"
import { internalQuery } from "../_generated/server"
import { authMutation, authQuery, validateAuth } from "../lib/helpers"

/**
 * Get a specific WhatsApp configuration by ID
 */
export const get = internalQuery({
  args: {
    configurationId: v.id("whatsappConfigurations"),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.configurationId)

    if (!config) {
      return null
    }

    return config
  },
})

export const getByTwilioAccountSidInternal = internalQuery({
  args: {
    accountSid: v.string(),
  },
  handler: async (ctx, args) => {
    // ✅ FIX: Use indexed query for better performance + security filters
    const config = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_twilio_account_sid", (q) =>
        q.eq("twilioAccountSid", args.accountSid)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("isActive"), true),
          q.eq(q.field("provider"), "twilio")
        )
      )
      .first()

    return config
  },
})

/**
 * Get all WhatsApp configurations for the current organization
 */
export const getConfigurations = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const configs = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    return configs
  },
})

/**
 * Get all WhatsApp configurations for an organization (internal - no auth)
 */
export const getConfigurationsInternal = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const configs = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    return configs
  },
})

/**
 * Get a specific WhatsApp configuration by ID (authenticated)
 */
export const getConfiguration = authQuery({
  args: {
    organizationId: v.string(),
    configId: v.id("whatsappConfigurations"),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.configId)

    if (!config || config.organizationId !== args.organizationId) {
      return null
    }

    return config
  },
})

/**
 * Create a new WhatsApp configuration
 */
export const createConfiguration = authMutation({
  args: {
    organizationId: v.string(),
    provider: v.union(
      v.literal("meta"),
      v.literal("twilio"),
      v.literal("360dialog"),
      v.literal("gupshup")
    ),
    // Meta fields
    accessToken: v.optional(v.string()),
    phoneNumberId: v.optional(v.string()),
    wabaId: v.optional(v.string()),
    metaAppId: v.optional(v.string()),
    // Twilio fields
    twilioAccountSid: v.optional(v.string()),
    twilioAuthToken: v.optional(v.string()),
    twilioPhoneNumber: v.optional(v.string()),
    // 360dialog fields
    dialog360ApiKey: v.optional(v.string()),
    // Gupshup fields
    gupshupApiKey: v.optional(v.string()),
    gupshupAppName: v.optional(v.string()),
    gupshupAppId: v.optional(v.string()), // Gupshup App ID
    gupshupSourceNumber: v.optional(v.string()),
    gupshupAppToken: v.optional(v.string()),
    gupshupMediaToken: v.optional(v.string()),
    // Common fields
    phoneNumber: v.string(),
    displayName: v.optional(v.string()),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
  },
  returns: v.id("whatsappConfigurations"),
  handler: async (ctx, args) => {
    const { provider, ...configData } = args

    // Validate required fields based on provider
    if (provider === "meta") {
      if (!configData.accessToken || !configData.phoneNumberId) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message:
            "Para Meta WhatsApp se requieren accessToken y phoneNumberId",
        })
      }
    } else if (provider === "twilio") {
      if (
        !configData.twilioAccountSid ||
        !configData.twilioAuthToken ||
        !configData.twilioPhoneNumber
      ) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message:
            "Para Twilio se requieren twilioAccountSid, twilioAuthToken y twilioPhoneNumber",
        })
      }
    } else if (provider === "360dialog") {
      if (!configData.dialog360ApiKey) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: "Para 360dialog se requiere dialog360ApiKey",
        })
      }
    } else if (provider === "gupshup") {
      if (!configData.gupshupApiKey || !configData.gupshupAppName) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: "Para Gupshup se requieren gupshupApiKey y gupshupAppName",
        })
      }
    }

    // Check if a configuration with the same phone number already exists
    const existingConfig = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_organization_and_phone_number", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("phoneNumber", args.phoneNumber)
      )
      .first()

    if (existingConfig) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Ya existe una configuración con este número de teléfono",
      })
    }

    // Create new configuration as active by default
    // Multiple active configurations are now allowed
    return await ctx.db.insert("whatsappConfigurations", {
      ...configData,
      provider,
      organizationId: args.organizationId,
      isActive: true,
      lastModified: Date.now(),
    })
  },
})

/**
 * Update an existing WhatsApp configuration
 */
export const updateConfiguration = authMutation({
  args: {
    organizationId: v.string(),
    configurationId: v.id("whatsappConfigurations"),
    // Provider (accepted but not used - provider cannot be changed after creation)
    provider: v.optional(
      v.union(
        v.literal("meta"),
        v.literal("twilio"),
        v.literal("360dialog"),
        v.literal("gupshup")
      )
    ),
    // Meta fields
    accessToken: v.optional(v.string()),
    phoneNumberId: v.optional(v.string()),
    wabaId: v.optional(v.string()),
    metaAppId: v.optional(v.string()),
    // Twilio fields
    twilioAccountSid: v.optional(v.string()),
    twilioAuthToken: v.optional(v.string()),
    twilioPhoneNumber: v.optional(v.string()),
    // 360dialog fields
    dialog360ApiKey: v.optional(v.string()),
    // Gupshup fields
    gupshupApiKey: v.optional(v.string()),
    gupshupAppName: v.optional(v.string()),
    gupshupAppId: v.optional(v.string()), // Gupshup App ID
    gupshupSourceNumber: v.optional(v.string()),
    gupshupAppToken: v.optional(v.string()),
    gupshupMediaToken: v.optional(v.string()),
    // Common fields
    phoneNumber: v.optional(v.string()),
    displayName: v.optional(v.string()),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { configurationId, provider: _provider, ...updateData } = args

    // Verify the configuration belongs to the user's organization
    const existingConfig = await ctx.db.get(configurationId)
    if (
      !existingConfig ||
      existingConfig.organizationId !== args.organizationId
    ) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Configuration not found or access denied",
      })
    }

    // Validate required fields based on provider if updating provider-specific fields
    if (
      existingConfig.provider === "meta" &&
      (updateData.accessToken !== undefined ||
        updateData.phoneNumberId !== undefined)
    ) {
      const newAccessToken =
        updateData.accessToken ?? existingConfig.accessToken
      const newPhoneNumberId =
        updateData.phoneNumberId ?? existingConfig.phoneNumberId
      if (!newAccessToken || !newPhoneNumberId) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message:
            "Para Meta WhatsApp se requieren accessToken y phoneNumberId",
        })
      }
    } else if (
      existingConfig.provider === "twilio" &&
      (updateData.twilioAccountSid !== undefined ||
        updateData.twilioAuthToken !== undefined ||
        updateData.twilioPhoneNumber !== undefined)
    ) {
      const newAccountSid =
        updateData.twilioAccountSid ?? existingConfig.twilioAccountSid
      const newAuthToken =
        updateData.twilioAuthToken ?? existingConfig.twilioAuthToken
      const newPhoneNumber =
        updateData.twilioPhoneNumber ?? existingConfig.twilioPhoneNumber
      if (!newAccountSid || !newAuthToken || !newPhoneNumber) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message:
            "Para Twilio se requieren twilioAccountSid, twilioAuthToken y twilioPhoneNumber",
        })
      }
    } else if (
      existingConfig.provider === "360dialog" &&
      updateData.dialog360ApiKey !== undefined
    ) {
      if (!updateData.dialog360ApiKey && !existingConfig.dialog360ApiKey) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: "Para 360dialog se requiere dialog360ApiKey",
        })
      }
    }

    await ctx.db.patch(configurationId, {
      ...updateData,
      lastModified: Date.now(),
    })

    return null
  },
})

/**
 * Delete a WhatsApp configuration
 */
export const deleteConfiguration = authMutation({
  args: {
    organizationId: v.string(),
    configurationId: v.id("whatsappConfigurations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Verify the configuration belongs to the user's organization
    const existingConfig = await ctx.db.get(args.configurationId)
    if (
      !existingConfig ||
      existingConfig.organizationId !== args.organizationId
    ) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Configuration not found or access denied",
      })
    }

    // Don't allow deletion of active configurations to prevent accidental data loss
    if (existingConfig.isActive) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message:
          "No se puede eliminar una configuración activa. Desactívala primero.",
      })
    }

    await ctx.db.delete(args.configurationId)
    return null
  },
})

/**
 * Toggle active status of a WhatsApp configuration
 * Multiple configurations can be active simultaneously
 */
export const toggleActiveStatus = authMutation({
  args: {
    organizationId: v.string(),
    configurationId: v.id("whatsappConfigurations"),
  },
  returns: v.object({
    isActive: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // Verify the configuration belongs to the user's organization
    const config = await ctx.db.get(args.configurationId)
    if (!config || config.organizationId !== args.organizationId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Configuration not found or access denied",
      })
    }

    const newActiveStatus = !config.isActive

    // Update only the selected configuration
    // Multiple active configurations are now allowed
    await ctx.db.patch(args.configurationId, {
      isActive: newActiveStatus,
      lastModified: Date.now(),
    })

    return { isActive: newActiveStatus }
  },
})

/**
 * Get WhatsApp configurations by restaurant location
 */
export const getConfigurationsByRestaurantLocation = authQuery({
  args: {
    organizationId: v.string(),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
  },
  handler: async (ctx, args) => {
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

/**
 * Associate or disassociate a WhatsApp configuration with a restaurant location
 */
export const updateRestaurantLocationAssociation = authMutation({
  args: {
    organizationId: v.string(),
    configurationId: v.id("whatsappConfigurations"),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Verify the configuration belongs to the user's organization
    const existingConfig = await ctx.db.get(args.configurationId)
    if (
      !existingConfig ||
      existingConfig.organizationId !== args.organizationId
    ) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Configuration not found or access denied",
      })
    }

    // If associating with a restaurant location, verify it exists and belongs to the organization
    if (args.restaurantLocationId) {
      const restaurantLocation = await ctx.db.get(args.restaurantLocationId)
      if (
        !restaurantLocation ||
        restaurantLocation.organizationId !== args.organizationId
      ) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Restaurant location not found or access denied",
        })
      }
    }

    await ctx.db.patch(args.configurationId, {
      restaurantLocationId: args.restaurantLocationId,
      lastModified: Date.now(),
    })

    return null
  },
})

/**
 * Update the wabaId for a WhatsApp configuration
 */
export const updateWabaId = authMutation({
  args: {
    organizationId: v.string(),
    configId: v.id("whatsappConfigurations"),
    wabaId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Verify the configuration belongs to the user's organization
    const existingConfig = await ctx.db.get(args.configId)
    if (
      !existingConfig ||
      existingConfig.organizationId !== args.organizationId
    ) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Configuration not found or access denied",
      })
    }

    await ctx.db.patch(args.configId, {
      wabaId: args.wabaId,
      lastModified: Date.now(),
    })

    return null
  },
})
