import type { MutationCtx, QueryCtx } from "../_generated/server"

import { DEFAULT_RESTAURANT_CONFIG } from "../lib/constants"

// Type for automatic first reply configuration
export type AutomaticFirstReplyConfig = {
  enabled: boolean
  message: string
  sendMenu?: boolean
}

// Business logic function to get agent configuration for an organization
export async function getAgentConfigForOrg(
  ctx: QueryCtx,
  organizationId: string
) {
  const config = await ctx.db
    .query("agentConfiguration")
    .withIndex("by_organization_id", (q) =>
      q.eq("organizationId", organizationId)
    )
    .first()

  return config
}

// Business logic function to create or update agent configuration
export async function upsertAgentConfigForOrg(
  ctx: MutationCtx,
  organizationId: string,
  data: {
    systemPrompt?: string
    brandVoice?: string
    restaurantContext?: string
    customGreeting?: string
    businessRules?: string
    specialInstructions?: string
  }
) {
  const existingConfig = await ctx.db
    .query("agentConfiguration")
    .withIndex("by_organization_id", (q) =>
      q.eq("organizationId", organizationId)
    )
    .first()

  const configData = {
    organizationId,
    systemPrompt: data.systemPrompt,
    brandVoice: data.brandVoice,
    restaurantContext: data.restaurantContext,
    customGreeting: data.customGreeting,
    businessRules: data.businessRules,
    specialInstructions: data.specialInstructions,
  }

  if (existingConfig) {
    await ctx.db.patch(existingConfig._id, configData)
    return existingConfig._id
  } else {
    return await ctx.db.insert("agentConfiguration", configData)
  }
}

// Business logic function to get restaurant configuration for an organization
export async function getRestaurantConfigForOrg(
  ctx: QueryCtx,
  organizationId: string
) {
  const config = await ctx.db
    .query("restaurantConfiguration")
    .withIndex("by_organization_id", (q) =>
      q.eq("organizationId", organizationId)
    )
    .first()

  return config
}

// Business logic function to get restaurant configuration for an organization
export async function getOrCreateRestaurantConfigForOrg(
  ctx: MutationCtx,
  organizationId: string
) {
  const config = await ctx.db
    .query("restaurantConfiguration")
    .withIndex("by_organization_id", (q) =>
      q.eq("organizationId", organizationId)
    )
    .first()
  if (!config) {
    const createdConfigId = await upsertRestaurantConfigForOrg(
      ctx,
      organizationId,
      {
        minAdvanceMinutes: DEFAULT_RESTAURANT_CONFIG.minAdvanceMinutes,
        maxAdvanceDays: DEFAULT_RESTAURANT_CONFIG.maxAdvanceDays,
        orderModificationBufferMinutes:
          DEFAULT_RESTAURANT_CONFIG.orderModificationBufferMinutes,
        conversationResolutionBufferMinutes:
          DEFAULT_RESTAURANT_CONFIG.conversationResolutionBufferMinutes,
        paymentLinkUrl: DEFAULT_RESTAURANT_CONFIG.paymentLinkUrl,
        bankAccounts: DEFAULT_RESTAURANT_CONFIG.bankAccounts,
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
        menuType: DEFAULT_RESTAURANT_CONFIG.menuType,
        menuUrl: DEFAULT_RESTAURANT_CONFIG.menuUrl,
        menuImages: DEFAULT_RESTAURANT_CONFIG.menuImages as string[],
        menuPdf: DEFAULT_RESTAURANT_CONFIG.menuPdf as string | undefined,
      }
    )
    return await ctx.db.get(createdConfigId)
  }
  return config
}

// Business logic function to create or update restaurant configuration
export async function upsertRestaurantConfigForOrg(
  ctx: MutationCtx,
  organizationId: string,
  data: Partial<{
    // Scheduling
    minAdvanceMinutes: number
    maxAdvanceDays: number
    // Order Management
    orderModificationBufferMinutes: number
    // Conversation Management
    conversationResolutionBufferMinutes: number
    // Payment
    paymentLinkUrl: string
    bankAccounts: string[]
    acceptCash: boolean
    acceptCard: boolean
    acceptPaymentLink: boolean
    acceptDynamicPaymentLink: boolean
    acceptBankTransfer: boolean
    acceptCorporateCredit: boolean
    acceptGiftVoucher: boolean
    acceptSodexoVoucher: boolean
    // Order Types
    enableDelivery: boolean
    enablePickup: boolean
    // Invoice Configuration
    enableElectronicInvoice: boolean
    // Custom Order Instructions
    deliveryInstructions: string
    pickupInstructions: string
    // Restaurant Information
    restaurantName: string
    restaurantPhone: string
    restaurantAddress: string
    // Menu Configuration
    menuType?: "images" | "pdf" | "url"
    menuUrl?: string
    menuImages?: string[]
    menuPdf?: string
    // Automatic First Reply Configuration
    automaticFirstReply?: AutomaticFirstReplyConfig
    // Custom Order Status Messages
    orderStatusMessages?: any
  }>
) {
  const existingConfig = await ctx.db
    .query("restaurantConfiguration")
    .withIndex("by_organization_id", (q) =>
      q.eq("organizationId", organizationId)
    )
    .first()

  const configData = {
    organizationId,
    // Scheduling defaults
    minAdvanceMinutes:
      data.minAdvanceMinutes ?? DEFAULT_RESTAURANT_CONFIG.minAdvanceMinutes,
    maxAdvanceDays:
      data.maxAdvanceDays ?? DEFAULT_RESTAURANT_CONFIG.maxAdvanceDays,

    // Order management defaults
    orderModificationBufferMinutes:
      data.orderModificationBufferMinutes ??
      DEFAULT_RESTAURANT_CONFIG.orderModificationBufferMinutes,

    // Conversation management defaults
    conversationResolutionBufferMinutes:
      data.conversationResolutionBufferMinutes ??
      DEFAULT_RESTAURANT_CONFIG.conversationResolutionBufferMinutes,

    // Payment defaults
    paymentLinkUrl: data.paymentLinkUrl,
    bankAccounts: data.bankAccounts,
    acceptCash: data.acceptCash ?? DEFAULT_RESTAURANT_CONFIG.acceptCash,
    acceptCard: data.acceptCard ?? DEFAULT_RESTAURANT_CONFIG.acceptCard,
    acceptPaymentLink:
      data.acceptPaymentLink ?? DEFAULT_RESTAURANT_CONFIG.acceptPaymentLink,
    acceptDynamicPaymentLink:
      data.acceptDynamicPaymentLink ??
      DEFAULT_RESTAURANT_CONFIG.acceptDynamicPaymentLink,
    acceptBankTransfer:
      data.acceptBankTransfer ?? DEFAULT_RESTAURANT_CONFIG.acceptBankTransfer,
    acceptCorporateCredit:
      data.acceptCorporateCredit ??
      DEFAULT_RESTAURANT_CONFIG.acceptCorporateCredit,
    acceptGiftVoucher:
      data.acceptGiftVoucher ?? DEFAULT_RESTAURANT_CONFIG.acceptGiftVoucher,
    acceptSodexoVoucher:
      data.acceptSodexoVoucher ?? DEFAULT_RESTAURANT_CONFIG.acceptSodexoVoucher,

    // Order type defaults
    enableDelivery:
      data.enableDelivery ?? DEFAULT_RESTAURANT_CONFIG.enableDelivery,
    enablePickup: data.enablePickup ?? DEFAULT_RESTAURANT_CONFIG.enablePickup,

    // Invoice defaults
    enableElectronicInvoice:
      data.enableElectronicInvoice ??
      DEFAULT_RESTAURANT_CONFIG.enableElectronicInvoice,

    // Custom instruction defaults
    deliveryInstructions:
      data.deliveryInstructions ??
      DEFAULT_RESTAURANT_CONFIG.deliveryInstructions,
    pickupInstructions:
      data.pickupInstructions ?? DEFAULT_RESTAURANT_CONFIG.pickupInstructions,

    // Restaurant information defaults
    restaurantName: data.restaurantName,
    restaurantPhone: data.restaurantPhone,
    restaurantAddress: data.restaurantAddress,
    menuType: data.menuType,
    menuUrl: data.menuUrl,
    ...(data.menuImages !== undefined && { menuImages: data.menuImages }),
    ...(data.menuPdf !== undefined && { menuPdf: data.menuPdf }),
    ...(data.orderStatusMessages !== undefined && {
      orderStatusMessages: data.orderStatusMessages,
    }),
    ...(data.automaticFirstReply !== undefined && {
      automaticFirstReply: data.automaticFirstReply,
    }),
  }

  if (existingConfig) {
    await ctx.db.patch(existingConfig._id, configData)
    return existingConfig._id
  } else {
    return await ctx.db.insert("restaurantConfiguration", configData)
  }
}

// Business logic function to create default restaurant configuration
export async function createDefaultRestaurantConfigForOrg(
  ctx: MutationCtx,
  organizationId: string
) {
  const existingConfig = await ctx.db
    .query("restaurantConfiguration")
    .withIndex("by_organization_id", (q) =>
      q.eq("organizationId", organizationId)
    )
    .first()

  if (existingConfig) {
    // Configuration already exists, no need to create default
    return
  }

  // Create default configuration
  await ctx.db.insert("restaurantConfiguration", {
    organizationId,
    // Scheduling
    minAdvanceMinutes: DEFAULT_RESTAURANT_CONFIG.minAdvanceMinutes,
    maxAdvanceDays: DEFAULT_RESTAURANT_CONFIG.maxAdvanceDays,

    // Order management
    orderModificationBufferMinutes:
      DEFAULT_RESTAURANT_CONFIG.orderModificationBufferMinutes,

    // Conversation management
    conversationResolutionBufferMinutes:
      DEFAULT_RESTAURANT_CONFIG.conversationResolutionBufferMinutes,

    // Payment configuration
    paymentLinkUrl: DEFAULT_RESTAURANT_CONFIG.paymentLinkUrl,
    bankAccounts: DEFAULT_RESTAURANT_CONFIG.bankAccounts,
    acceptCash: DEFAULT_RESTAURANT_CONFIG.acceptCash,
    acceptCard: DEFAULT_RESTAURANT_CONFIG.acceptCard,
    acceptPaymentLink: DEFAULT_RESTAURANT_CONFIG.acceptPaymentLink,
    acceptDynamicPaymentLink:
      DEFAULT_RESTAURANT_CONFIG.acceptDynamicPaymentLink,
    acceptBankTransfer: DEFAULT_RESTAURANT_CONFIG.acceptBankTransfer,
    acceptCorporateCredit: DEFAULT_RESTAURANT_CONFIG.acceptCorporateCredit,
    acceptGiftVoucher: DEFAULT_RESTAURANT_CONFIG.acceptGiftVoucher,
    acceptSodexoVoucher: DEFAULT_RESTAURANT_CONFIG.acceptSodexoVoucher,

    // Order type configuration
    enableDelivery: DEFAULT_RESTAURANT_CONFIG.enableDelivery,
    enablePickup: DEFAULT_RESTAURANT_CONFIG.enablePickup,

    // Invoice configuration
    enableElectronicInvoice: DEFAULT_RESTAURANT_CONFIG.enableElectronicInvoice,

    // Custom instructions
    deliveryInstructions: DEFAULT_RESTAURANT_CONFIG.deliveryInstructions,
    pickupInstructions: DEFAULT_RESTAURANT_CONFIG.pickupInstructions,

    // Menu configuration
    menuType: DEFAULT_RESTAURANT_CONFIG.menuType,
    menuUrl: DEFAULT_RESTAURANT_CONFIG.menuUrl,
    menuImages: DEFAULT_RESTAURANT_CONFIG.menuImages as string[],
    menuPdf: DEFAULT_RESTAURANT_CONFIG.menuPdf as string | undefined,
    orderStatusMessages: DEFAULT_RESTAURANT_CONFIG.orderStatusMessages,
  })
}
