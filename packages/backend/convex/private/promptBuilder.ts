import { ConvexError, v } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import { mutation, query } from "../_generated/server"
import { validateAuthWithOrg } from "../lib/helpers"
import { upsertAgentConfigurationWithPromptAudit } from "../lib/promptAudit"
import {
  getOrderWithItemsAndProducts,
  type OrderWithItems,
} from "../model/orders"
import {
  buildCompleteAgentSystemPrompt,
  type ComboForPrompt,
  type ContactForPrompt,
} from "../system/ai/constants"

export const getPromptParts = query({
  args: {
    organizationId: v.string(),
    contactId: v.optional(v.id("contacts")),
  },
  handler: async (ctx, args) => {
    await validateAuthWithOrg(ctx, args.organizationId)

    const organizationId = args.organizationId

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

    // Get restaurant locations for the organization
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

    // Get contact data if provided
    let contact: Doc<"contacts"> | null = null
    let contactPreviousOrders: OrderWithItems[] = []

    if (args.contactId !== null && args.contactId !== undefined) {
      contact = await ctx.db.get(args.contactId)
      if (!contact) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: "Contacto no encontrado",
        })
      }

      // Get previous orders for this contact
      if (contact !== null && contact !== undefined) {
        const orders = await ctx.db
          .query("orders")
          .withIndex("by_contact_id", (q) => q.eq("contactId", contact!._id))
          .order("desc")
          .take(10) // Limit for performance

        // Enrich orders with product details for AI context
        contactPreviousOrders = await Promise.all(
          orders.map(async (order: Doc<"orders">) => {
            const orderItemsWithProducts = await getOrderWithItemsAndProducts(
              ctx,
              order._id
            )

            return {
              ...order,
              items: orderItemsWithProducts,
            }
          })
        )
      }
    }

    // Build the complete prompt for preview using runtime-equivalent assembly.
    const previewContact: ContactForPrompt = contact ?? {
      organizationId,
      phoneNumber: "+57000000000",
      displayName: "[Contacto de previsualización]",
    }

    const completePrompt = buildCompleteAgentSystemPrompt({
      agentConfig: agentConfig || null,
      contact: previewContact,
      contactPreviousOrders: contactPreviousOrders || [],
      restaurantConfig: restaurantConfig || null,
      restaurantLocations,
      availableCombos,
      automaticFirstReplyEnabled:
        restaurantConfig?.automaticFirstReply?.enabled ?? false,
      hasMetaSupport,
    })

    return {
      agentConfig,
      contact: contact
        ? {
            _id: contact._id,
            displayName: contact.displayName,
            phoneNumber: contact.phoneNumber,
            lastKnownAddress: contact.lastKnownAddress,
          }
        : null,
      contactPreviousOrders: contactPreviousOrders.map((order) => ({
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        deliveryAddress: order.deliveryAddress,
        _creationTime: order._creationTime,
        items: order.items || [],
      })),
      completePrompt,
      contactCount: contactPreviousOrders.length,
      // Add configuration flags for frontend to generate real dynamic sections
      configFlags: {
        enableDelivery: restaurantConfig?.enableDelivery ?? true,
        enablePickup: restaurantConfig?.enablePickup ?? true,
        enableInvoice: restaurantConfig?.enableElectronicInvoice ?? true,
      },
    }
  },
})

export const updateCorePromptSection = mutation({
  args: {
    organizationId: v.string(),
    section: v.string(), // "identity", "tools", "conversation", "operations"
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const { identity } = await validateAuthWithOrg(ctx, args.organizationId)

    const organizationId = args.organizationId

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
      organizationId,
      updates: {
        [fieldName]: args.content,
        lastModified: Date.now(),
      },
      source: "private_prompt_builder",
      action: "update_core_section",
      changedByUserId: identity.subject,
      changedByEmail: identity.email,
    })
  },
})

export const resetCorePromptSection = mutation({
  args: {
    organizationId: v.string(),
    section: v.string(),
  },
  handler: async (ctx, args) => {
    const { identity } = await validateAuthWithOrg(ctx, args.organizationId)

    const organizationId = args.organizationId

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

    const existingConfig = await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .first()

    if (!existingConfig) {
      return null
    }

    return await upsertAgentConfigurationWithPromptAudit(ctx, {
      organizationId,
      updates: {
        [fieldName]: undefined,
        lastModified: Date.now(),
      },
      existingConfig,
      source: "private_prompt_builder",
      action: "reset_core_section",
      changedByUserId: identity.subject,
      changedByEmail: identity.email,
    })
  },
})
