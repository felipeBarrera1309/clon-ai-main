import { v } from "convex/values"
import { internalQuery } from "../_generated/server"
import {
  ConversationNotFoundError,
  RestaurantLocationNotFoundError,
} from "../lib/errors"

export const getInternalById = internalQuery({
  args: { id: v.id("restaurantLocations") },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.id)
    if (!location) {
      throw new RestaurantLocationNotFoundError()
    }
    return location
  },
})

export const validateId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const normalizedId = ctx.db.normalizeId("restaurantLocations", args.id)
    return normalizedId
  },
})

export const getAllFromThreadQuery = internalQuery({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique()
    if (!conversation) {
      throw new ConversationNotFoundError()
    }
    const locations = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", conversation.organizationId)
      )
      .collect()
    return locations
  },
})

export const getOne = internalQuery({
  args: { id: v.id("restaurantLocations") },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.id)
    if (!location) {
      throw new RestaurantLocationNotFoundError()
    }

    return location
  },
})

export const getAllByOrganization = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
  },
})
