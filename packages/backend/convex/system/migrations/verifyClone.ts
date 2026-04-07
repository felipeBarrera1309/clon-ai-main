import { v } from "convex/values"
import { internalQuery } from "../../_generated/server"

/**
 * Verify that organization data was cloned successfully
 *
 * Usage:
 * npx convex run system/migrations/verifyClone:verify '{"organizationId":"org_TARGET"}' --prod
 */
export const verify = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { organizationId } = args

    const counts = {
      agentConfiguration: 0,
      restaurantConfiguration: 0,
      restaurantLocations: 0,
      whatsappConfigurations: 0,
      deliveryAreas: 0,
      contacts: 0,
      menuProductCategories: 0,
      menuProductSubcategories: 0,
      sizes: 0,
      menuProducts: 0,
      menuProductAvailability: 0,
    }

    // Count records in each table
    counts.agentConfiguration = (
      await ctx.db
        .query("agentConfiguration")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", organizationId)
        )
        .collect()
    ).length

    counts.restaurantConfiguration = (
      await ctx.db
        .query("restaurantConfiguration")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", organizationId)
        )
        .collect()
    ).length

    counts.restaurantLocations = (
      await ctx.db
        .query("restaurantLocations")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", organizationId)
        )
        .collect()
    ).length

    counts.whatsappConfigurations = (
      await ctx.db
        .query("whatsappConfigurations")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", organizationId)
        )
        .collect()
    ).length

    counts.deliveryAreas = (
      await ctx.db
        .query("deliveryAreas")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", organizationId)
        )
        .collect()
    ).length

    counts.contacts = (
      await ctx.db
        .query("contacts")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", organizationId)
        )
        .collect()
    ).length

    counts.menuProductCategories = (
      await ctx.db
        .query("menuProductCategories")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", organizationId)
        )
        .collect()
    ).length

    counts.menuProductSubcategories = (
      await ctx.db
        .query("menuProductSubcategories")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", organizationId)
        )
        .collect()
    ).length

    counts.sizes = (
      await ctx.db
        .query("sizes")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", organizationId)
        )
        .collect()
    ).length

    counts.menuProducts = (
      await ctx.db
        .query("menuProducts")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", organizationId)
        )
        .collect()
    ).length

    counts.menuProductAvailability = (
      await ctx.db
        .query("menuProductAvailability")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", organizationId)
        )
        .collect()
    ).length

    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

    // Get some sample data
    const locations = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect()

    const categories = await ctx.db
      .query("menuProductCategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .take(5)

    return {
      organizationId,
      counts,
      total,
      sampleData: {
        locations: locations.map((l) => ({
          _id: l._id,
          name: l.name,
          code: l.code,
          available: l.available,
        })),
        categories: categories.map((c) => ({
          _id: c._id,
          name: c.name,
        })),
      },
    }
  },
})
