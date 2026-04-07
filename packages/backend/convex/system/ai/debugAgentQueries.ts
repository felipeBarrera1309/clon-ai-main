import { listMessages } from "@convex-dev/agent"
import { ConvexError, v } from "convex/values"
import { components } from "../../_generated/api"
import type { Doc } from "../../_generated/dataModel"
import { internalQuery } from "../../_generated/server"
import { buildCompleteAgentSystemPrompt } from "./constants"

export const getDebugConversationsForOrg = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const debugConversations = await ctx.db
      .query("adminDebugConversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .collect()

    return debugConversations.map((conv) => ({
      threadId: conv.threadId,
      reason: conv.reason,
      contactDisplayName: conv.contactDisplayName || "Sin nombre",
      addedAt: conv.addedAt,
    }))
  },
})

export const getAgentConfigForOrg = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const agentConfig = await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .unique()

    if (!agentConfig) {
      return null
    }

    return {
      brandVoice: agentConfig.brandVoice,
      restaurantContext: agentConfig.restaurantContext,
      customGreeting: agentConfig.customGreeting,
      businessRules: agentConfig.businessRules,
      specialInstructions: agentConfig.specialInstructions,
      coreIdentityOverride: agentConfig.coreIdentityOverride,
      coreToolsOverride: agentConfig.coreToolsOverride,
      coreConversationOverride: agentConfig.coreConversationOverride,
      coreOperationsOverride: agentConfig.coreOperationsOverride,
      supportAgentModel: agentConfig.supportAgentModel,
      validationMenuAgentModel: agentConfig.validationMenuAgentModel,
      menuValidationAgentPrompt: agentConfig.menuValidationAgentPrompt,
      ragConfiguration: agentConfig.ragConfiguration,
      requireInitialLocationValidation:
        agentConfig.requireInitialLocationValidation,
      followUpSequence: agentConfig.followUpSequence,
      lastModified: agentConfig.lastModified,
    }
  },
})

export const getConversationMessagesForDebug = internalQuery({
  args: {
    organizationId: v.string(),
    threadId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const debugConversation = await ctx.db
      .query("adminDebugConversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .first()

    if (!debugConversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "La conversación debug no existe para este threadId",
      })
    }

    if (debugConversation.organizationId !== args.organizationId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message:
          "El threadId no pertenece a una conversación debug de esta organización",
      })
    }

    const boundedLimit = Math.max(1, Math.min(args.limit ?? 100, 200))

    const messagesResult = await listMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: { numItems: boundedLimit, cursor: null },
      excludeToolMessages: false,
    })

    if (!messagesResult.page || messagesResult.page.length === 0) {
      return []
    }

    return messagesResult.page.map((msg) => ({
      role: msg.message?.role ?? "unknown",
      content:
        typeof msg.message?.content === "string"
          ? msg.message.content
          : JSON.stringify(msg.message?.content ?? ""),
      timestamp: msg._creationTime,
    }))
  },
})

export const getBuiltSystemPromptForOrg = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const agentConfig = await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .unique()

    const restaurantConfig = await ctx.db
      .query("restaurantConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    const allLocations = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Check for Meta WhatsApp support
    const whatsappConfigs = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const activeWhatsappConfigs = whatsappConfigs.filter((c) => c.isActive)
    const hasActiveNumbers = activeWhatsappConfigs.length > 0
    const hasMetaSupport =
      hasActiveNumbers &&
      activeWhatsappConfigs.every((c) => c.provider === "meta")

    const restaurantLocations = allLocations.filter(
      (loc) => loc.available === true
    )

    const mockContact: Doc<"contacts"> = {
      _id: "mock" as any,
      _creationTime: Date.now(),
      organizationId: args.organizationId,
      phoneNumber: "+57000000000",
      displayName: "[Contacto de prueba]",
    }

    const systemPrompt = buildCompleteAgentSystemPrompt({
      agentConfig: agentConfig,
      contact: mockContact,
      contactPreviousOrders: [],
      restaurantConfig: restaurantConfig,
      restaurantLocations: restaurantLocations,
      menuCategories: [],
      automaticFirstReplyEnabled:
        restaurantConfig?.automaticFirstReply?.enabled ?? false,
      hasMetaSupport,
    })

    return {
      promptLength: systemPrompt.length,
      fullPrompt: systemPrompt,
      hasAgentConfig: !!agentConfig,
      hasRestaurantConfig: !!restaurantConfig,
      locationCount: restaurantLocations.length,
      automaticFirstReplyEnabled:
        restaurantConfig?.automaticFirstReply?.enabled ?? false,
    }
  },
})
