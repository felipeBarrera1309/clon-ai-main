import { v } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import { aggregateDeliveryAreasByOrganization } from "../deliveryAreasAggregate"
import { normalizeCoordinates } from "../lib/coordinateUtils"
import { DeliveryAreaNotFoundError, UnauthorizedError } from "../lib/errors"
import { authMutation, authQuery } from "../lib/helpers"
import { weekDayValidator } from "../schema"

export const create = authMutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    coordinates: v.array(
      v.object({
        lat: v.number(),
        lng: v.number(),
      })
    ),
    isActive: v.boolean(),
    deliveryFee: v.optional(v.number()),
    minimumOrder: v.optional(v.number()),
    estimatedDeliveryTime: v.optional(v.string()),
    priority: v.optional(v.number()),
    restaurantLocationId: v.id("restaurantLocations"),
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
    // Normalize coordinates to ensure they are within valid ranges
    const normalizedCoordinates = normalizeCoordinates(args.coordinates)

    const areaId = await ctx.db.insert("deliveryAreas", {
      ...args,
      coordinates: normalizedCoordinates,
      organizationId: args.organizationId,
    })
    const createdArea = await ctx.db.get(areaId)
    if (createdArea) {
      await aggregateDeliveryAreasByOrganization.insertIfDoesNotExist(
        ctx,
        createdArea
      )
    }
    return areaId
  },
})

export const update = authMutation({
  args: {
    organizationId: v.string(),
    id: v.id("deliveryAreas"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    coordinates: v.optional(
      v.array(
        v.object({
          lat: v.number(),
          lng: v.number(),
        })
      )
    ),
    isActive: v.optional(v.boolean()),
    deliveryFee: v.optional(v.number()),
    minimumOrder: v.optional(v.number()),
    estimatedDeliveryTime: v.optional(v.string()),
    priority: v.optional(v.number()),
    restaurantLocationId: v.id("restaurantLocations"),
    openingHours: v.optional(
      v.union(
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
        ),
        v.null()
      )
    ),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args

    // Normalize coordinates if they are being updated
    if (updates.coordinates) {
      updates.coordinates = normalizeCoordinates(updates.coordinates)
    }

    // Build the patch object
    const patchData: Record<string, unknown> = {
      ...updates,
      organizationId: args.organizationId,
    }

    // Convert null to undefined for openingHours to remove the field
    if (updates.openingHours === null) {
      patchData.openingHours = undefined
    }

    return await ctx.db.patch(id, patchData)
  },
})

export const remove = authMutation({
  args: {
    organizationId: v.string(),
    id: v.id("deliveryAreas"),
  },
  handler: async (ctx, args) => {
    const area = await ctx.db.get(args.id)
    if (!area) {
      throw new DeliveryAreaNotFoundError()
    }

    if (area.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para eliminar esta área de entrega"
      )
    }

    await ctx.db.delete(args.id)
    await aggregateDeliveryAreasByOrganization.deleteIfExists(ctx, area)
    return args.id
  },
})

export const getById = authQuery({
  args: {
    organizationId: v.string(),
    id: v.id("deliveryAreas"),
  },
  handler: async (ctx, args) => {
    const area = await ctx.db.get(args.id)
    if (!area) {
      throw new DeliveryAreaNotFoundError()
    }

    if (area.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para ver esta área de entrega"
      )
    }
    return area
  },
})

export const getByOrganization = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("deliveryAreas")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
  },
})

export const getActiveByOrganization = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("deliveryAreas")
      .withIndex("by_organization_and_active", (q) =>
        q.eq("organizationId", args.organizationId).eq("isActive", true)
      )
      .collect()
  },
})

export const getByOrganizationPaginated = authQuery({
  args: {
    organizationId: v.string(),
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
    statusFilter: v.optional(v.string()),
    locationFilter: v.optional(v.id("restaurantLocations")),
    searchQuery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const hasSearchQuery =
      args.searchQuery && args.searchQuery.trim().length > 0
    const hasLocationFilter = args.locationFilter !== undefined
    const hasStatusFilter = args.statusFilter && args.statusFilter !== "all"
    const statusValue = args.statusFilter === "active"

    // If we have a search query, we need to fetch all, filter, then paginate in memory
    if (hasSearchQuery) {
      // Fetch all areas based on location/status filters first
      let allAreas: Doc<"deliveryAreas">[]

      if (hasLocationFilter && hasStatusFilter) {
        // We don't have a 3-way index, so use location index and filter by status
        allAreas = await ctx.db
          .query("deliveryAreas")
          .withIndex("by_organization_and_restaurant_location", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("restaurantLocationId", args.locationFilter!)
          )
          .filter((q) => q.eq(q.field("isActive"), statusValue))
          .order("desc")
          .collect()
      } else if (hasLocationFilter) {
        // Use location index
        allAreas = await ctx.db
          .query("deliveryAreas")
          .withIndex("by_organization_and_restaurant_location", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("restaurantLocationId", args.locationFilter!)
          )
          .order("desc")
          .collect()
      } else if (hasStatusFilter) {
        // Use status index
        allAreas = await ctx.db
          .query("deliveryAreas")
          .withIndex("by_organization_and_active", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("isActive", statusValue)
          )
          .order("desc")
          .collect()
      } else {
        // Just organization
        allAreas = await ctx.db
          .query("deliveryAreas")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .order("desc")
          .collect()
      }

      // Filter by search query
      const searchLower = args.searchQuery!.toLowerCase()
      const filteredAreas = allAreas.filter(
        (area) =>
          area.name.toLowerCase().includes(searchLower) ||
          area.description?.toLowerCase().includes(searchLower)
      )

      // Manual pagination
      const { numItems, cursor } = args.paginationOpts
      const startIndex = cursor ? Number.parseInt(cursor, 10) : 0
      const endIndex = startIndex + numItems
      const page = filteredAreas.slice(startIndex, endIndex)
      const hasMore = endIndex < filteredAreas.length

      return {
        page,
        isDone: !hasMore,
        continueCursor: hasMore ? endIndex.toString() : undefined,
      }
    }

    // No search query - use efficient database pagination with indexes
    if (hasLocationFilter && hasStatusFilter) {
      // Use location index and filter by status
      return await ctx.db
        .query("deliveryAreas")
        .withIndex("by_organization_and_restaurant_location", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("restaurantLocationId", args.locationFilter!)
        )
        .filter((q) => q.eq(q.field("isActive"), statusValue))
        .order("desc")
        .paginate(args.paginationOpts)
    }

    if (hasLocationFilter) {
      // Use location index only
      return await ctx.db
        .query("deliveryAreas")
        .withIndex("by_organization_and_restaurant_location", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("restaurantLocationId", args.locationFilter!)
        )
        .order("desc")
        .paginate(args.paginationOpts)
    }

    if (hasStatusFilter) {
      // Use status index
      return await ctx.db
        .query("deliveryAreas")
        .withIndex("by_organization_and_active", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("isActive", statusValue)
        )
        .order("desc")
        .paginate(args.paginationOpts)
    }

    // Default: just organization index
    return await ctx.db
      .query("deliveryAreas")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .paginate(args.paginationOpts)
  },
})

export const deleteAllByLocationId = authMutation({
  args: {
    organizationId: v.string(),
    restaurantLocationId: v.id("restaurantLocations"),
  },
  returns: v.object({
    deletedCount: v.number(),
    deletedAreaIds: v.array(v.id("deliveryAreas")),
  }),
  handler: async (ctx, args) => {
    // Verify the restaurant location belongs to the organization
    const location = await ctx.db.get(args.restaurantLocationId)
    if (!location || location.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para eliminar áreas de esta ubicación"
      )
    }

    // Get all delivery areas for this location
    const areas = await ctx.db
      .query("deliveryAreas")
      .withIndex("by_organization_and_restaurant_location", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("restaurantLocationId", args.restaurantLocationId)
      )
      .collect()

    // Delete all areas
    const deletedAreaIds = []
    for (const area of areas) {
      await ctx.db.delete(area._id)
      await aggregateDeliveryAreasByOrganization.deleteIfExists(ctx, area)
      deletedAreaIds.push(area._id)
    }

    return {
      deletedCount: deletedAreaIds.length,
      deletedAreaIds,
    }
  },
})

export const activateAllByLocationId = authMutation({
  args: {
    organizationId: v.string(),
    restaurantLocationId: v.id("restaurantLocations"),
  },
  returns: v.object({
    updatedCount: v.number(),
    updatedAreaIds: v.array(v.id("deliveryAreas")),
  }),
  handler: async (ctx, args) => {
    // Verify the restaurant location belongs to the organization
    const location = await ctx.db.get(args.restaurantLocationId)
    if (!location || location.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para modificar áreas de esta ubicación"
      )
    }

    // Get all inactive delivery areas for this location
    const areas = await ctx.db
      .query("deliveryAreas")
      .withIndex("by_organization_and_restaurant_location", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("restaurantLocationId", args.restaurantLocationId)
      )
      .filter((q) => q.eq(q.field("isActive"), false))
      .collect()

    // Activate all areas
    const updatedAreaIds = []
    for (const area of areas) {
      await ctx.db.patch(area._id, { isActive: true })
      updatedAreaIds.push(area._id)
    }

    return {
      updatedCount: updatedAreaIds.length,
      updatedAreaIds,
    }
  },
})

export const deactivateAllByLocationId = authMutation({
  args: {
    organizationId: v.string(),
    restaurantLocationId: v.id("restaurantLocations"),
  },
  returns: v.object({
    updatedCount: v.number(),
    updatedAreaIds: v.array(v.id("deliveryAreas")),
  }),
  handler: async (ctx, args) => {
    // Verify the restaurant location belongs to the organization
    const location = await ctx.db.get(args.restaurantLocationId)
    if (!location || location.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para modificar áreas de esta ubicación"
      )
    }

    // Get all active delivery areas for this location
    const areas = await ctx.db
      .query("deliveryAreas")
      .withIndex("by_organization_and_restaurant_location", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("restaurantLocationId", args.restaurantLocationId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect()

    // Deactivate all areas
    const updatedAreaIds = []
    for (const area of areas) {
      await ctx.db.patch(area._id, { isActive: false })
      updatedAreaIds.push(area._id)
    }

    return {
      updatedCount: updatedAreaIds.length,
      updatedAreaIds,
    }
  },
})

export const batchDelete = authMutation({
  args: {
    organizationId: v.string(),
    areaIds: v.array(v.id("deliveryAreas")),
  },
  returns: v.object({
    deletedCount: v.number(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    if (args.areaIds.length === 0) {
      throw new UnauthorizedError("No se seleccionaron áreas para eliminar")
    }

    if (args.areaIds.length > 50) {
      throw new UnauthorizedError(
        "No se pueden eliminar más de 50 áreas a la vez"
      )
    }

    // Verify all areas exist and belong to the organization
    const areasToDelete: Doc<"deliveryAreas">[] = []
    for (const areaId of args.areaIds) {
      const area = await ctx.db.get(areaId)
      if (!area) {
        throw new DeliveryAreaNotFoundError(
          `Área con ID ${areaId} no encontrada`
        )
      }

      if (area.organizationId !== args.organizationId) {
        throw new UnauthorizedError(
          `No estás autorizado para eliminar el área con ID ${areaId}`
        )
      }
      areasToDelete.push(area)
    }

    // Delete all areas in batch
    const deletePromises = args.areaIds.map((areaId) => ctx.db.delete(areaId))
    await Promise.all(deletePromises)
    await Promise.all(
      areasToDelete.map((area) =>
        aggregateDeliveryAreasByOrganization.deleteIfExists(ctx, area)
      )
    )

    return {
      deletedCount: args.areaIds.length,
      message: `Se eliminaron ${args.areaIds.length} áreas de entrega exitosamente`,
    }
  },
})
