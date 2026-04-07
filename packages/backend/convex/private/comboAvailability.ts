import { v } from "convex/values"
import { NotFoundError, RestaurantLocationNotFoundError } from "../lib/errors"
import { authMutation, authQuery } from "../lib/helpers"

export const getByCombo = authQuery({
  args: {
    organizationId: v.string(),
    comboId: v.id("combos"),
  },
  handler: async (ctx, args) => {
    const combo = await ctx.db.get(args.comboId)
    if (!combo || combo.organizationId !== args.organizationId) {
      throw new NotFoundError("Combo no encontrado")
    }

    return await ctx.db
      .query("comboAvailability")
      .withIndex("by_combo_id", (q) => q.eq("comboId", args.comboId))
      .collect()
  },
})

export const getByLocation = authQuery({
  args: {
    organizationId: v.string(),
    locationId: v.id("restaurantLocations"),
  },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.locationId)
    if (!location || location.organizationId !== args.organizationId) {
      throw new RestaurantLocationNotFoundError()
    }

    return await ctx.db
      .query("comboAvailability")
      .withIndex("by_restaurant_location_id", (q) =>
        q.eq("restaurantLocationId", args.locationId)
      )
      .collect()
  },
})

export const set = authMutation({
  args: {
    organizationId: v.string(),
    comboId: v.id("combos"),
    locationId: v.id("restaurantLocations"),
    available: v.boolean(),
  },
  handler: async (ctx, args) => {
    const combo = await ctx.db.get(args.comboId)
    if (!combo || combo.organizationId !== args.organizationId) {
      throw new NotFoundError("Combo no encontrado")
    }

    const location = await ctx.db.get(args.locationId)
    if (!location || location.organizationId !== args.organizationId) {
      throw new RestaurantLocationNotFoundError()
    }

    const existing = await ctx.db
      .query("comboAvailability")
      .withIndex("by_combo_id", (q) => q.eq("comboId", args.comboId))
      .filter((q) => q.eq(q.field("restaurantLocationId"), args.locationId))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, { available: args.available })
    } else {
      await ctx.db.insert("comboAvailability", {
        comboId: args.comboId,
        restaurantLocationId: args.locationId,
        available: args.available,
        organizationId: args.organizationId,
      })
    }
  },
})

export const bulkSet = authMutation({
  args: {
    organizationId: v.string(),
    comboId: v.id("combos"),
    locationUpdates: v.array(
      v.object({
        locationId: v.id("restaurantLocations"),
        available: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const combo = await ctx.db.get(args.comboId)
    if (!combo || combo.organizationId !== args.organizationId) {
      throw new NotFoundError("Combo no encontrado")
    }

    const locations = await Promise.all(
      args.locationUpdates.map((update) => ctx.db.get(update.locationId))
    )

    for (const location of locations) {
      if (!location || location.organizationId !== args.organizationId) {
        throw new RestaurantLocationNotFoundError()
      }
    }

    await Promise.all(
      args.locationUpdates.map(async (update) => {
        const existing = await ctx.db
          .query("comboAvailability")
          .withIndex("by_combo_id", (q) => q.eq("comboId", args.comboId))
          .filter((q) =>
            q.eq(q.field("restaurantLocationId"), update.locationId)
          )
          .unique()

        if (existing) {
          await ctx.db.patch(existing._id, { available: update.available })
        } else {
          await ctx.db.insert("comboAvailability", {
            comboId: args.comboId,
            restaurantLocationId: update.locationId,
            available: update.available,
            organizationId: args.organizationId,
          })
        }
      })
    )
  },
})
