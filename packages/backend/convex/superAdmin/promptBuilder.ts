import { ConvexError, v } from "convex/values"
import { upsertAgentConfigurationWithPromptAudit } from "../lib/promptAudit"
import {
  assertOrganizationAccess,
  platformAdminOrImplementorMutation,
  platformAdminOrImplementorQuery,
} from "../lib/superAdmin"
import {
  buildCompleteAgentSystemPrompt,
  type ComboForPrompt,
  type ContactForPrompt,
} from "../system/ai/constants"

export const getPromptParts = platformAdminOrImplementorQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const organizationId = args.organizationId
    await assertOrganizationAccess(ctx, organizationId)

    // Get agent configuration
    const agentConfig = await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .first()

    // Get restaurant configuration
    const restaurantConfig = await ctx.db
      .query("restaurantConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .first()

    // Get menu context
    const menuProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect()

    // Get restaurant locations
    const restaurantLocations = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .filter((q) => q.eq(q.field("available"), true))
      .collect()

    // Check for Meta WhatsApp support
    const whatsappConfigs = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect()

    const activeWhatsappConfigs = whatsappConfigs.filter((c) => c.isActive)
    const hasActiveNumbers = activeWhatsappConfigs.length > 0
    const hasMetaSupport =
      hasActiveNumbers &&
      activeWhatsappConfigs.every((c) => c.provider === "meta")

    const activeCombos = await ctx.db
      .query("combos")
      .withIndex("by_organization_id_and_is_active", (q) =>
        q.eq("organizationId", organizationId).eq("isActive", true)
      )
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect()

    const availableCombos: ComboForPrompt[] = await Promise.all(
      activeCombos.map(async (combo) => {
        const slots = await ctx.db
          .query("comboSlots")
          .withIndex("by_combo_id", (q) => q.eq("comboId", combo._id))
          .collect()

        const slotsWithOptionCount = await Promise.all(
          slots
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(async (slot) => {
              const options = await ctx.db
                .query("comboSlotOptions")
                .withIndex("by_combo_slot_id", (q) =>
                  q.eq("comboSlotId", slot._id)
                )
                .collect()

              return {
                name: slot.name,
                minSelections: slot.minSelections,
                maxSelections: slot.maxSelections,
                optionCount: options.length,
              }
            })
        )

        return {
          name: combo.name,
          description: combo.description,
          basePrice: combo.basePrice,
          slots: slotsWithOptionCount,
        }
      })
    )

    const previewContact: ContactForPrompt = {
      organizationId,
      phoneNumber: "+57000000000",
      displayName: "[Contacto de previsualización]",
    }

    // Build the complete prompt for preview using runtime-equivalent assembly.
    const completePrompt = buildCompleteAgentSystemPrompt({
      agentConfig: agentConfig || null,
      contact: previewContact,
      contactPreviousOrders: [],
      restaurantConfig: restaurantConfig || null,
      restaurantLocations,
      availableCombos,
      automaticFirstReplyEnabled:
        restaurantConfig?.automaticFirstReply?.enabled ?? false,
      hasMetaSupport,
    })

    return {
      customSections: {
        brandVoice: agentConfig?.brandVoice || "",
        restaurantContext: agentConfig?.restaurantContext || "",
        customGreeting: agentConfig?.customGreeting || "",
        businessRules: agentConfig?.businessRules || "",
        specialInstructions: agentConfig?.specialInstructions || "",
      },
      coreSections: {
        identity: agentConfig?.coreIdentityOverride || "",
        tools: agentConfig?.coreToolsOverride || "",
        conversation: agentConfig?.coreConversationOverride || "",
        operations: agentConfig?.coreOperationsOverride || "",
      },
      contextInfo: {
        menuItemsCount: menuProducts.length,
        restaurantLocationsCount: restaurantLocations.length,
      },
      completePrompt,
    }
  },
})

export const updateCorePromptSection = platformAdminOrImplementorMutation({
  args: {
    organizationId: v.string(),
    section: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOrganizationAccess(ctx, args.organizationId)

    // Validate content length
    if (args.content.length > 10000) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "El contenido es demasiado largo (máximo 10,000 caracteres)",
      })
    }

    // Map section names to database field names
    const fieldMapping = {
      identity: "coreIdentityOverride",
      tools: "coreToolsOverride",
      conversation: "coreConversationOverride",
      operations: "coreOperationsOverride",
    } as const

    const fieldName = fieldMapping[args.section as keyof typeof fieldMapping]
    if (!fieldName) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Sección de prompt no válida",
      })
    }

    return await upsertAgentConfigurationWithPromptAudit(ctx, {
      organizationId: args.organizationId,
      updates: {
        [fieldName]: args.content,
        lastModified: Date.now(),
      },
      source: "superadmin_prompt_builder",
      action: "update_core_section",
      changedByUserId: ctx.identity.subject,
      changedByEmail: ctx.identity.email,
    })
  },
})

export const resetCorePromptSection = platformAdminOrImplementorMutation({
  args: {
    organizationId: v.string(),
    section: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOrganizationAccess(ctx, args.organizationId)

    // Map section names to database field names
    const fieldMapping = {
      identity: "coreIdentityOverride",
      tools: "coreToolsOverride",
      conversation: "coreConversationOverride",
      operations: "coreOperationsOverride",
    } as const

    const fieldName = fieldMapping[args.section as keyof typeof fieldMapping]
    if (!fieldName) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Sección de prompt no válida",
      })
    }

    return await upsertAgentConfigurationWithPromptAudit(ctx, {
      organizationId: args.organizationId,
      updates: {
        [fieldName]: undefined,
        lastModified: Date.now(),
      },
      source: "superadmin_prompt_builder",
      action: "reset_core_section",
      changedByUserId: ctx.identity.subject,
      changedByEmail: ctx.identity.email,
    })
  },
})
