import { ConvexError, v } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import { internalQuery } from "../_generated/server"
import { getOrderWithItemsAndProducts } from "../model/orders"
import type { ComboForPrompt } from "./ai/constants"

export const getRAGConfiguration = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, { organizationId }) => {
    const agentConfig = await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .unique()

    return agentConfig?.ragConfiguration || null
  },
})

export const getAgentConfiguration = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { conversationId }) => {
    const conversation = await ctx.db.get(conversationId)
    if (!conversation) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "No se ha encontrado la conversación",
      })
    }
    const organizationId = conversation.organizationId
    const contactId = conversation.contactId
    const contact = await ctx.db.get(contactId)
    if (!contact) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "No se ha encontrado el contacto",
      })
    }
    // Limit AI context: recent non-cancelled orders only (full history would blow up token budget)
    const allContactOrders = await ctx.db
      .query("orders")
      .withIndex("by_contact_id", (q) => q.eq("contactId", contactId))
      .collect()

    const totalOrderCount = allContactOrders.length

    const recentOrders = allContactOrders
      .filter((order) => order.status !== "cancelado")
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 5)

    const ordersWithProducts = await Promise.all(
      recentOrders.map(async (order: Doc<"orders">) => {
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
    const orgAgentConfig = await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .unique()
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

    // Get menu categories for the organization
    const menuCategories = await ctx.db
      .query("menuProductCategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
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
    // .every() returns true for empty arrays, so we must check length first
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

    return {
      agentConfig: orgAgentConfig,
      contact: contact,
      contactPreviousOrders: ordersWithProducts,
      totalOrderCount,
      restaurantConfig: restaurantConfig,
      restaurantLocations: restaurantLocations,
      menuCategories: menuCategories,
      // Flag to indicate if automatic first reply is enabled (used to skip greeting in system prompt)
      automaticFirstReplyEnabled:
        restaurantConfig?.automaticFirstReply?.enabled ?? false,
      hasMetaSupport,
      availableCombos,
    }
  },
})
