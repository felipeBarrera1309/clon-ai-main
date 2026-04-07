import { v } from "convex/values"
import { aggregateDeliveryAreasByOrganization } from "../deliveryAreasAggregate"
import {
  DuplicatePriorityError,
  RestaurantLocationNotFoundError,
  UnauthorizedError,
} from "../lib/errors"
import { geocodeAddress } from "../lib/geocoding"
import { authAction, authMutation, authQuery } from "../lib/helpers"
import {
  getTodaySchedule,
  isRestaurantOpen,
  validateScheduledOrderTime,
} from "../lib/scheduleUtils"
import { aggregateRestaurantLocationsByOrganization } from "../restaurantLocationsAggregate"
import { weekDayValidator } from "../schema"

export const list = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
  },
})

export const get = authQuery({
  args: { organizationId: v.string(), id: v.id("restaurantLocations") },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.id)
    if (!location) {
      throw new RestaurantLocationNotFoundError()
    }

    if (location.organizationId !== args.organizationId) {
      throw new UnauthorizedError("No estás autorizado para ver esta ubicación")
    }

    return location
  },
})

export const create = authMutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
    code: v.string(),
    address: v.string(),
    coordinates: v.object({
      latitude: v.number(),
      longitude: v.number(),
    }),
    available: v.boolean(),
    color: v.string(),
    priority: v.number(),
    openingHours: v.optional(
      v.array(
        v.object({
          day: weekDayValidator,
          ranges: v.array(
            v.object({
              open: v.string(),
              close: v.string(),
            })
          ),
        })
      )
    ),
    specialSchedules: v.optional(
      v.array(
        v.object({
          date: v.string(),
          ranges: v.array(
            v.object({
              open: v.string(),
              close: v.string(),
            })
          ),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    // Check if priority already exists for this organization
    const existingLocations = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("priority"), args.priority))
      .collect()

    if (existingLocations.length > 0) {
      throw new DuplicatePriorityError(args.priority)
    }

    // Create the restaurant location
    const locationId = await ctx.db.insert("restaurantLocations", {
      ...args,
      code: args.code.toUpperCase(),
      organizationId: args.organizationId,
      available: args.available,
      openingHours: args.openingHours,
      specialSchedules: args.specialSchedules,
      priority: args.priority,
    })
    const createdLocation = await ctx.db.get(locationId)
    if (createdLocation) {
      await aggregateRestaurantLocationsByOrganization.insertIfDoesNotExist(
        ctx,
        createdLocation
      )
    }

    // Automatically create product availability for all existing products in this new location
    const products = await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Create availability records for all products for this new location
    // Default to available = true for new locations
    await Promise.all(
      products.map(async (product) => {
        await ctx.db.insert("menuProductAvailability", {
          menuProductId: product._id,
          restaurantLocationId: locationId,
          available: true,
          organizationId: args.organizationId,
        })
      })
    )

    // By default, a new location has all existing combos available.
    const combos = await ctx.db
      .query("combos")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect()

    await Promise.all(
      combos.map(async (combo) => {
        await ctx.db.insert("comboAvailability", {
          comboId: combo._id,
          restaurantLocationId: locationId,
          available: true,
          organizationId: args.organizationId,
        })
      })
    )

    return locationId
  },
})

export const update = authMutation({
  args: {
    organizationId: v.string(),
    id: v.string(),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    address: v.optional(v.string()),
    coordinates: v.optional(
      v.object({
        latitude: v.number(),
        longitude: v.number(),
      })
    ),
    available: v.optional(v.boolean()),
    color: v.optional(v.string()),
    priority: v.optional(v.number()),
    openingHours: v.optional(
      v.array(
        v.object({
          day: weekDayValidator,
          ranges: v.array(
            v.object({
              open: v.string(),
              close: v.string(),
            })
          ),
        })
      )
    ),
    specialSchedules: v.optional(
      v.array(
        v.object({
          date: v.string(),
          ranges: v.array(
            v.object({
              open: v.string(),
              close: v.string(),
            })
          ),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args

    // Ensure code is always uppercase if provided
    if (updates.code) {
      updates.code = updates.code.toUpperCase()
    }

    const normalizedId = ctx.db.normalizeId("restaurantLocations", id)
    if (!normalizedId) {
      throw new RestaurantLocationNotFoundError()
    }
    const location = await ctx.db.get(normalizedId)
    if (!location) {
      throw new RestaurantLocationNotFoundError()
    }
    if (location.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para actualizar esta ubicación"
      )
    }

    // Check if priority is being changed and if it conflicts with existing locations
    if (
      updates.priority !== undefined &&
      updates.priority !== location.priority
    ) {
      const existingLocations = await ctx.db
        .query("restaurantLocations")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .filter((q) => q.eq(q.field("priority"), updates.priority))
        .collect()

      // Filter out the current location being updated
      const conflictingLocations = existingLocations.filter(
        (loc) => loc._id !== normalizedId
      )

      if (conflictingLocations.length > 0) {
        throw new DuplicatePriorityError(updates.priority)
      }
    }

    await ctx.db.patch(normalizedId, updates)
  },
})

export const remove = authMutation({
  args: { organizationId: v.string(), id: v.id("restaurantLocations") },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.id)
    if (!location) {
      throw new RestaurantLocationNotFoundError()
    }

    if (location.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para eliminar esta ubicación"
      )
    }

    // Check if there are any active orders associated with this location
    const activeOrders = await ctx.db
      .query("orders")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("restaurantLocationId"), args.id))
      .filter((q) => q.neq(q.field("status"), "entregado"))
      .filter((q) => q.neq(q.field("status"), "cancelado"))
      .collect()

    if (activeOrders.length > 0) {
      throw new Error(
        `No se puede eliminar la ubicación porque tiene ${activeOrders.length} órdenes activas. Complete o cancele las órdenes antes de eliminar la ubicación.`
      )
    }

    // Delete all associated delivery areas
    const deliveryAreas = await ctx.db
      .query("deliveryAreas")
      .withIndex("by_restaurant_location", (q) =>
        q.eq("restaurantLocationId", args.id)
      )
      .collect()

    for (const area of deliveryAreas) {
      await ctx.db.delete(area._id)
      await aggregateDeliveryAreasByOrganization.deleteIfExists(ctx, area)
    }

    // Delete all menu product availability records for this location
    const menuAvailability = await ctx.db
      .query("menuProductAvailability")
      .withIndex("by_location", (q) => q.eq("restaurantLocationId", args.id))
      .collect()

    for (const availability of menuAvailability) {
      await ctx.db.delete(availability._id)
    }

    // Delete all combo availability records for this location
    const comboAvailability = await ctx.db
      .query("comboAvailability")
      .withIndex("by_restaurant_location_id", (q) =>
        q.eq("restaurantLocationId", args.id)
      )
      .collect()

    for (const availability of comboAvailability) {
      await ctx.db.delete(availability._id)
    }

    // Now delete the restaurant location
    await ctx.db.delete(args.id)
    await aggregateRestaurantLocationsByOrganization.deleteIfExists(
      ctx,
      location
    )
  },
})

// Schedule-related functions

export const checkAvailability = authQuery({
  args: {
    organizationId: v.string(),
    id: v.id("restaurantLocations"),
    scheduledTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.id)
    if (!location) {
      throw new RestaurantLocationNotFoundError()
    }

    if (location.organizationId !== args.organizationId) {
      throw new UnauthorizedError("No estás autorizado para ver esta ubicación")
    }

    if (args.scheduledTime) {
      return validateScheduledOrderTime(location, args.scheduledTime)
    } else {
      return isRestaurantOpen(location)
    }
  },
})

export const getTodayScheduleInfo = authQuery({
  args: { organizationId: v.string(), id: v.id("restaurantLocations") },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.id)
    if (!location) {
      throw new RestaurantLocationNotFoundError()
    }

    if (location.organizationId !== args.organizationId) {
      throw new UnauthorizedError("No estás autorizado para ver esta ubicación")
    }

    return getTodaySchedule(location)
  },
})

export const updateSchedule = authMutation({
  args: {
    organizationId: v.string(),
    id: v.id("restaurantLocations"),
    available: v.boolean(),
    openingHours: v.optional(
      v.array(
        v.object({
          day: weekDayValidator,
          ranges: v.array(
            v.object({
              open: v.string(),
              close: v.string(),
            })
          ),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.id)
    if (!location) {
      throw new RestaurantLocationNotFoundError()
    }

    if (location.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para actualizar esta ubicación"
      )
    }

    await ctx.db.patch(args.id, {
      available: args.available,
      openingHours: args.openingHours,
    })
  },
})

export const setDefaultSchedule = authMutation({
  args: {
    organizationId: v.string(),
    id: v.id("restaurantLocations"),
  },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.id)
    if (!location) {
      throw new RestaurantLocationNotFoundError()
    }

    if (location.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para actualizar esta ubicación"
      )
    }

    await ctx.db.patch(args.id, {
      available: true,
      openingHours: [
        { day: "monday", ranges: [{ open: "08:00", close: "18:00" }] },
        { day: "tuesday", ranges: [{ open: "08:00", close: "18:00" }] },
        { day: "wednesday", ranges: [{ open: "08:00", close: "18:00" }] },
        { day: "thursday", ranges: [{ open: "08:00", close: "18:00" }] },
        { day: "friday", ranges: [{ open: "08:00", close: "18:00" }] },
        { day: "saturday", ranges: [{ open: "08:00", close: "18:00" }] },
        { day: "sunday", ranges: [{ open: "10:00", close: "16:00" }] },
      ],
    })
  },
})

// Geocoding functions

export const geocodeAddressAction = authAction({
  args: {
    address: v.string(),
  },
  handler: async (_ctx, args) => {
    const result = await geocodeAddress(args.address)
    return result
  },
})
