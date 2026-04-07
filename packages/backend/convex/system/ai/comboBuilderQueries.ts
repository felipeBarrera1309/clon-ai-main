import { v } from "convex/values"
import { internalQuery } from "../../_generated/server"

export const listMenuProducts = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    const products = await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const categories = await ctx.db
      .query("menuProductCategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const categoryMap = new Map(categories.map((cat) => [cat._id, cat.name]))

    return products.map((p) => ({
      id: p._id,
      name: p.name,
      price: p.price,
      categoryName: categoryMap.get(p.menuProductCategoryId) ?? "Sin categoría",
    }))
  },
})

export const listCombos = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    const combos = await ctx.db
      .query("combos")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const combosWithSlotCount = await Promise.all(
      combos
        .filter((combo) => combo.isDeleted !== true)
        .map(async (combo) => {
          const slots = await ctx.db
            .query("comboSlots")
            .withIndex("by_combo_id", (q) => q.eq("comboId", combo._id))
            .collect()

          return {
            id: combo._id,
            name: combo.name,
            description: combo.description,
            basePrice: combo.basePrice,
            isActive: combo.isActive,
            slotsCount: slots.length,
          }
        })
    )

    return combosWithSlotCount
  },
})
