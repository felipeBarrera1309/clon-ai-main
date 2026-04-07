import { v } from "convex/values"
import type { Id } from "../_generated/dataModel"
import { internalQuery } from "../_generated/server"
import { DEFAULT_RESTAURANT_CONFIG } from "../lib/constants"
import { BadRequestError, NotFoundError } from "../lib/errors"
import { authMutation, authQuery, validateAuth } from "../lib/helpers"
import {
  getRestaurantConfigForOrg,
  upsertRestaurantConfigForOrg,
} from "../model/config"

// Query for restaurant configuration
export const getRestaurantConfigQuery = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await getRestaurantConfigForOrg(ctx, args.organizationId)
    return config
  },
})

// Internal query for restaurant configuration (for agent/scheduler use)
export const getRestaurantConfigInternal = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await getRestaurantConfigForOrg(ctx, args.organizationId)
  },
})

// Mutation to create restaurant configuration
export const createRestaurantConfigMutation = authMutation({
  args: {
    organizationId: v.string(),
    minAdvanceMinutes: v.number(),
    maxAdvanceDays: v.number(),
    orderModificationBufferMinutes: v.number(),
    paymentLinkUrl: v.optional(v.string()),
    bankAccounts: v.optional(v.array(v.string())),
    menuUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const config = await getRestaurantConfigForOrg(ctx, args.organizationId)
    if (config) {
      throw new BadRequestError("Configuración del restaurante ya existe")
    }
    return await upsertRestaurantConfigForOrg(ctx, args.organizationId, args)
  },
})

// Mutation to upsert restaurant configuration (handles both create and update)
export const updateRestaurantConfigMutation = authMutation({
  args: v.any(), // Accept any format from frontend
  handler: async (ctx, args) => {
    // Handle both individual args and nested config object from frontend
    const config = args.config || args

    // Validate payment link URL is required when payment link is enabled
    if (config.acceptPaymentLink && !config.paymentLinkUrl?.trim()) {
      throw new BadRequestError(
        "URL de link de pago es requerida cuando el pago por link de pago está habilitado"
      )
    }

    // Validate bank accounts are required when bank transfer is enabled
    if (
      config.acceptBankTransfer &&
      (!config.bankAccounts || config.bankAccounts.length === 0)
    ) {
      throw new BadRequestError(
        "Cuentas bancarias son requeridas cuando la transferencia bancaria está habilitada"
      )
    }

    // Clean up unused menu types based on selected menuType
    const updateData = args.config || args

    if (updateData.menuType) {
      if (updateData.menuType === "url") {
        // If URL is selected, delete images and PDF
        if (updateData.menuImages && Array.isArray(updateData.menuImages)) {
          for (const imageId of updateData.menuImages) {
            try {
              await ctx.storage.delete(imageId as Id<"_storage">)
            } catch (error) {
              console.log(`Image ${imageId} not found, skipping deletion`)
            }
          }
        }
        if (updateData.menuPdf) {
          try {
            await ctx.storage.delete(updateData.menuPdf as Id<"_storage">)
          } catch (error) {
            console.log(
              `PDF ${updateData.menuPdf} not found, skipping deletion`
            )
          }
        }
        updateData.menuImages = []
        updateData.menuPdf = undefined
      } else if (updateData.menuType === "images") {
        // If images is selected, delete PDF and clear URL
        if (updateData.menuPdf) {
          try {
            await ctx.storage.delete(updateData.menuPdf as Id<"_storage">)
          } catch (error) {
            console.log(
              `PDF ${updateData.menuPdf} not found, skipping deletion`
            )
          }
        }
        updateData.menuPdf = undefined
        updateData.menuUrl = ""
      } else if (updateData.menuType === "pdf") {
        // If PDF is selected, delete images and clear URL
        if (updateData.menuImages && Array.isArray(updateData.menuImages)) {
          for (const imageId of updateData.menuImages) {
            try {
              await ctx.storage.delete(imageId as Id<"_storage">)
            } catch (error) {
              console.log(`Image ${imageId} not found, skipping deletion`)
            }
          }
        }
        updateData.menuImages = []
        updateData.menuUrl = ""
      } else if (updateData.menuType === "none") {
        // If none is selected, delete everything
        if (updateData.menuImages && Array.isArray(updateData.menuImages)) {
          for (const imageId of updateData.menuImages) {
            try {
              await ctx.storage.delete(imageId as Id<"_storage">)
            } catch (error) {
              console.log(`Image ${imageId} not found, skipping deletion`)
            }
          }
        }
        if (updateData.menuPdf) {
          try {
            await ctx.storage.delete(updateData.menuPdf as Id<"_storage">)
          } catch (error) {
            console.log(
              `PDF ${updateData.menuPdf} not found, skipping deletion`
            )
          }
        }
        updateData.menuImages = []
        updateData.menuPdf = undefined
        updateData.menuUrl = ""
      }
    }

    // Clean args to remove undefined/null values and extra fields
    const cleanArgs = {
      ...updateData,
      // Ensure arrays are not null
      bankAccounts: updateData.bankAccounts || [],
      menuImages: updateData.menuImages,
      automaticFirstReply: updateData.automaticFirstReply,
    }

    return await upsertRestaurantConfigForOrg(
      ctx,
      args.organizationId,
      cleanArgs
    )
  },
})

export const getRestaurantConfig = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await getRestaurantConfigForOrg(ctx, args.organizationId)

    // Return default values if no config exists (like agent configuration does)
    if (!config) {
      return {
        minAdvanceMinutes: DEFAULT_RESTAURANT_CONFIG.minAdvanceMinutes,
        maxAdvanceDays: DEFAULT_RESTAURANT_CONFIG.maxAdvanceDays,
        orderModificationBufferMinutes:
          DEFAULT_RESTAURANT_CONFIG.orderModificationBufferMinutes,
        conversationResolutionBufferMinutes:
          DEFAULT_RESTAURANT_CONFIG.conversationResolutionBufferMinutes,
        paymentLinkUrl: "",
        bankAccounts: [],
        acceptCash: DEFAULT_RESTAURANT_CONFIG.acceptCash,
        acceptCard: DEFAULT_RESTAURANT_CONFIG.acceptCard,
        acceptPaymentLink: DEFAULT_RESTAURANT_CONFIG.acceptPaymentLink,
        acceptDynamicPaymentLink:
          DEFAULT_RESTAURANT_CONFIG.acceptDynamicPaymentLink,
        acceptBankTransfer: DEFAULT_RESTAURANT_CONFIG.acceptBankTransfer,
        acceptCorporateCredit: DEFAULT_RESTAURANT_CONFIG.acceptCorporateCredit,
        acceptGiftVoucher: DEFAULT_RESTAURANT_CONFIG.acceptGiftVoucher,
        acceptSodexoVoucher: DEFAULT_RESTAURANT_CONFIG.acceptSodexoVoucher,

        enableDelivery: DEFAULT_RESTAURANT_CONFIG.enableDelivery,
        enablePickup: DEFAULT_RESTAURANT_CONFIG.enablePickup,
        enableElectronicInvoice:
          DEFAULT_RESTAURANT_CONFIG.enableElectronicInvoice,
        deliveryInstructions: DEFAULT_RESTAURANT_CONFIG.deliveryInstructions,
        pickupInstructions: DEFAULT_RESTAURANT_CONFIG.pickupInstructions,
        restaurantName: "",
        restaurantPhone: "",
        restaurantAddress: "",
        menuType: undefined,
        orderStatusMessages: undefined,
        menuUrl: "",
        menuImages: [],
        menuPdf: undefined,
        lastModified: undefined,
      }
    }

    return config
  },
})

export const getRestaurantConfigForAgent = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    const config = await getRestaurantConfigForOrg(ctx, args.organizationId)

    // Return default values if no config exists
    if (!config) {
      return {
        minAdvanceMinutes: DEFAULT_RESTAURANT_CONFIG.minAdvanceMinutes,
        maxAdvanceDays: DEFAULT_RESTAURANT_CONFIG.maxAdvanceDays,
        orderModificationBufferMinutes:
          DEFAULT_RESTAURANT_CONFIG.orderModificationBufferMinutes,
        conversationResolutionBufferMinutes:
          DEFAULT_RESTAURANT_CONFIG.conversationResolutionBufferMinutes,
        paymentLinkUrl: "",
        bankAccounts: [],
        acceptCash: DEFAULT_RESTAURANT_CONFIG.acceptCash,
        acceptCard: DEFAULT_RESTAURANT_CONFIG.acceptCard,
        acceptPaymentLink: DEFAULT_RESTAURANT_CONFIG.acceptPaymentLink,
        acceptBankTransfer: DEFAULT_RESTAURANT_CONFIG.acceptBankTransfer,
        acceptCorporateCredit: DEFAULT_RESTAURANT_CONFIG.acceptCorporateCredit,
        acceptGiftVoucher: DEFAULT_RESTAURANT_CONFIG.acceptGiftVoucher,
        acceptSodexoVoucher: DEFAULT_RESTAURANT_CONFIG.acceptSodexoVoucher,

        enableDelivery: DEFAULT_RESTAURANT_CONFIG.enableDelivery,
        enablePickup: DEFAULT_RESTAURANT_CONFIG.enablePickup,
        enableElectronicInvoice:
          DEFAULT_RESTAURANT_CONFIG.enableElectronicInvoice,
        deliveryInstructions: DEFAULT_RESTAURANT_CONFIG.deliveryInstructions,
        pickupInstructions: DEFAULT_RESTAURANT_CONFIG.pickupInstructions,
        restaurantName: "",
        restaurantPhone: "",
        restaurantAddress: "",
        menuType: undefined,
        orderStatusMessages: undefined,
        menuUrl: "",
        menuImages: [],
        menuPdf: undefined,
        lastModified: undefined,
      }
    }

    return config
  },
})

export const createRestaurantConfig = authMutation({
  args: {
    organizationId: v.string(),
    minAdvanceMinutes: v.number(),
    maxAdvanceDays: v.number(),
    orderModificationBufferMinutes: v.number(),
    paymentLinkUrl: v.optional(v.string()),
    bankAccounts: v.optional(v.array(v.string())),
    menuUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const config = await getRestaurantConfigForOrg(ctx, args.organizationId)
    if (config) {
      throw new BadRequestError("Configuración del restaurante ya existe")
    }
    return await upsertRestaurantConfigForOrg(ctx, args.organizationId, args)
  },
})

export const updateRestaurantConfig = authMutation({
  args: v.any(), // Accept any format from frontend
  handler: async (ctx, args) => {
    // Handle both individual args and nested config object from frontend
    const config = args.config || args

    // Validate payment link URL is required when payment link is enabled
    if (config.acceptPaymentLink && !config.paymentLinkUrl?.trim()) {
      throw new BadRequestError(
        "URL de link de pago es requerida cuando el pago por link de pago está habilitado"
      )
    }

    // Validate bank accounts are required when bank transfer is enabled
    if (
      config.acceptBankTransfer &&
      (!config.bankAccounts || config.bankAccounts.length === 0)
    ) {
      throw new BadRequestError(
        "Cuentas bancarias son requeridas cuando la transferencia bancaria está habilitada"
      )
    }

    // Get current configuration to know what files to delete
    const currentConfig = await getRestaurantConfigForOrg(
      ctx,
      args.organizationId
    )

    // Validate menu configuration: only one type can be active at a time
    let menuType = config.menuType
    let menuUrl = config.menuUrl
    let menuImages = config.menuImages || []
    let menuPdf = config.menuPdf

    // If menuType is being set, clear other menu fields and delete old files
    if (menuType === "images") {
      // Delete PDF if exists
      if (currentConfig?.menuPdf) {
        try {
          await ctx.storage.delete(currentConfig.menuPdf)
          console.log(
            `🗑️ [MENU CLEANUP] Deleted old PDF: ${currentConfig.menuPdf}`
          )
        } catch (error) {
          console.log(
            `⚠️ [MENU CLEANUP] Could not delete old PDF ${currentConfig.menuPdf}:`,
            error
          )
        }
      }
      // Clear all other menu options completely
      menuUrl = undefined
      menuPdf = undefined
    } else if (menuType === "pdf") {
      // Delete all images if exist
      if (currentConfig?.menuImages && currentConfig.menuImages.length > 0) {
        for (const imageId of currentConfig.menuImages) {
          try {
            await ctx.storage.delete(imageId)
            console.log(`🗑️ [MENU CLEANUP] Deleted old image: ${imageId}`)
          } catch (error) {
            console.log(
              `⚠️ [MENU CLEANUP] Could not delete old image ${imageId}:`,
              error
            )
          }
        }
      }
      // Clear all other menu options completely
      menuUrl = undefined
      menuImages = []
    } else if (menuType === "url") {
      // Delete all images and PDF if exist
      if (currentConfig?.menuImages && currentConfig.menuImages.length > 0) {
        for (const imageId of currentConfig.menuImages) {
          try {
            await ctx.storage.delete(imageId)
            console.log(`🗑️ [MENU CLEANUP] Deleted old image: ${imageId}`)
          } catch (error) {
            console.log(
              `⚠️ [MENU CLEANUP] Could not delete old image ${imageId}:`,
              error
            )
          }
        }
      }
      if (currentConfig?.menuPdf) {
        try {
          await ctx.storage.delete(currentConfig.menuPdf)
          console.log(
            `🗑️ [MENU CLEANUP] Deleted old PDF: ${currentConfig.menuPdf}`
          )
        } catch (error) {
          console.log(
            `⚠️ [MENU CLEANUP] Could not delete old PDF ${currentConfig.menuPdf}:`,
            error
          )
        }
      }
      // Clear all other menu options completely
      menuImages = []
      menuPdf = undefined
    }

    // If menu content is being set, update menuType accordingly and clear others
    if (menuImages && menuImages.length > 0 && menuType !== "images") {
      // Delete PDF if exists
      if (currentConfig?.menuPdf) {
        try {
          await ctx.storage.delete(currentConfig.menuPdf)
          console.log(
            `🗑️ [MENU CLEANUP] Deleted old PDF: ${currentConfig.menuPdf}`
          )
        } catch (error) {
          console.log(
            `⚠️ [MENU CLEANUP] Could not delete old PDF ${currentConfig.menuPdf}:`,
            error
          )
        }
      }
      menuType = "images"
      // Clear all other menu options completely
      menuUrl = undefined
      menuPdf = undefined
    } else if (menuPdf && menuType !== "pdf") {
      // Delete all images if exist
      if (currentConfig?.menuImages && currentConfig.menuImages.length > 0) {
        for (const imageId of currentConfig.menuImages) {
          try {
            await ctx.storage.delete(imageId)
            console.log(`🗑️ [MENU CLEANUP] Deleted old image: ${imageId}`)
          } catch (error) {
            console.log(
              `⚠️ [MENU CLEANUP] Could not delete old image ${imageId}:`,
              error
            )
          }
        }
      }
      menuType = "pdf"
      // Clear all other menu options completely
      menuUrl = undefined
      menuImages = []
    } else if (menuUrl && menuUrl.trim() && menuType !== "url") {
      // Delete all images and PDF if exist
      if (currentConfig?.menuImages && currentConfig.menuImages.length > 0) {
        for (const imageId of currentConfig.menuImages) {
          try {
            await ctx.storage.delete(imageId)
            console.log(`🗑️ [MENU CLEANUP] Deleted old image: ${imageId}`)
          } catch (error) {
            console.log(
              `⚠️ [MENU CLEANUP] Could not delete old image ${imageId}:`,
              error
            )
          }
        }
      }
      if (currentConfig?.menuPdf) {
        try {
          await ctx.storage.delete(currentConfig.menuPdf)
          console.log(
            `🗑️ [MENU CLEANUP] Deleted old PDF: ${currentConfig.menuPdf}`
          )
        } catch (error) {
          console.log(
            `⚠️ [MENU CLEANUP] Could not delete old PDF ${currentConfig.menuPdf}:`,
            error
          )
        }
      }
      menuType = "url"
      // Clear all other menu options completely
      menuImages = []
      menuPdf = undefined
    }

    // Clean args to remove undefined/null values and extra fields
    const cleanArgs = {
      minAdvanceMinutes: config.minAdvanceMinutes,
      maxAdvanceDays: config.maxAdvanceDays,
      orderModificationBufferMinutes: config.orderModificationBufferMinutes,
      conversationResolutionBufferMinutes:
        config.conversationResolutionBufferMinutes,
      paymentLinkUrl: config.paymentLinkUrl,
      bankAccounts: config.bankAccounts || [],
      acceptCash: config.acceptCash,
      acceptCard: config.acceptCard,
      acceptPaymentLink: config.acceptPaymentLink,
      acceptBankTransfer: config.acceptBankTransfer,
      acceptCorporateCredit: config.acceptCorporateCredit,
      acceptGiftVoucher: config.acceptGiftVoucher,
      acceptSodexoVoucher: config.acceptSodexoVoucher,
      enableDelivery: config.enableDelivery,
      enablePickup: config.enablePickup,
      enableElectronicInvoice: config.enableElectronicInvoice,
      deliveryInstructions: config.deliveryInstructions,
      pickupInstructions: config.pickupInstructions,
      restaurantName: config.restaurantName,
      restaurantPhone: config.restaurantPhone,
      restaurantAddress: config.restaurantAddress,
      menuType: menuType,
      menuUrl: menuUrl,
      menuImages: menuImages,
      menuPdf: menuPdf,
      orderStatusMessages: config.orderStatusMessages,
      automaticFirstReply: config.automaticFirstReply,
      lastModified: Date.now(),
    }

    return await upsertRestaurantConfigForOrg(
      ctx,
      args.organizationId,
      cleanArgs
    )
  },
})

// ============================================================================
// AUTOMATIC FIRST REPLY CONFIGURATION
// ============================================================================

/**
 * Get automatic first reply configuration for an organization
 */
export const getAutomaticFirstReplyConfig = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await getRestaurantConfigForOrg(ctx, args.organizationId)

    if (!config?.automaticFirstReply) {
      return {
        enabled: false,
        message: "",
        sendMenu: false,
      }
    }

    return config.automaticFirstReply
  },
})

/**
 * Update automatic first reply configuration
 * Simplified approach: uses the existing menu configuration for media
 * - enabled: Whether automatic first reply is enabled
 * - message: The text message to send
 * - sendMenu: Whether to send the menu with the first reply (uses menuType/menuUrl/menuImages/menuPdf)
 */
export const updateAutomaticFirstReply = authMutation({
  args: {
    organizationId: v.string(),
    enabled: v.boolean(),
    message: v.string(),
    sendMenu: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { organizationId, enabled, message, sendMenu } = args

    // Validate message is provided when enabled
    if (enabled && !message.trim()) {
      throw new BadRequestError(
        "El mensaje es requerido cuando la respuesta automática está habilitada"
      )
    }

    // Build the automatic first reply configuration
    // Always save the config (even when disabled) so users can configure it before enabling
    const automaticFirstReply = {
      enabled,
      message: message.trim(),
      sendMenu: sendMenu ?? false,
    }

    // Update the restaurant configuration
    const existingConfig = await ctx.db
      .query("restaurantConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .first()

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, {
        automaticFirstReply,
        lastModified: Date.now(),
      })
      return existingConfig._id
    } else {
      // Create new config with just the automatic first reply
      const newConfigId = await ctx.db.insert("restaurantConfiguration", {
        organizationId,
        minAdvanceMinutes: DEFAULT_RESTAURANT_CONFIG.minAdvanceMinutes,
        maxAdvanceDays: DEFAULT_RESTAURANT_CONFIG.maxAdvanceDays,
        orderModificationBufferMinutes:
          DEFAULT_RESTAURANT_CONFIG.orderModificationBufferMinutes,
        conversationResolutionBufferMinutes:
          DEFAULT_RESTAURANT_CONFIG.conversationResolutionBufferMinutes,
        automaticFirstReply,
        lastModified: Date.now(),
      })
      return newConfigId
    }
  },
})

/**
 * Disable automatic first reply
 * Note: Media files are stored in R2 (external storage), cleanup is handled separately.
 */
export const disableAutomaticFirstReply = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { organizationId } = args

    // Update the restaurant configuration
    const existingConfig = await ctx.db
      .query("restaurantConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .first()

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, {
        automaticFirstReply: undefined,
        lastModified: Date.now(),
      })
      return existingConfig._id
    }

    return null
  },
})
