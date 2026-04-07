import { v } from "convex/values"
import { api, internal } from "../_generated/api"
import { internalQuery } from "../_generated/server"
import {
  MenuProductNotFoundError,
  RestaurantLocationNotFoundError,
} from "../lib/errors"
import { authMutation, authQuery } from "../lib/helpers"
import { getMenuNamespace } from "../system/rag"

export const list = authQuery({
  args: {
    organizationId: v.string(),
    productIds: v.optional(v.array(v.id("menuProducts"))),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 1000
    const cursor = args.cursor ?? null

    if (args.productIds && args.productIds.length > 0) {
      // Only fetch availability for specific products to avoid hitting Convex limits
      const availabilityRecords = []
      for (const productId of args.productIds) {
        // Verify product ownership
        const product = await ctx.db.get(productId)
        if (product && product.organizationId === args.organizationId) {
          const records = await ctx.db
            .query("menuProductAvailability")
            .withIndex("by_menu_product", (q) =>
              q.eq("menuProductId", productId)
            )
            .collect()
          availabilityRecords.push(...records)
        }
      }
      // Safety limit to prevent array size errors
      if (availabilityRecords.length > 8000) {
        return availabilityRecords.slice(0, 8000)
      }
      return availabilityRecords
    } else {
      // When no productIds provided, return empty array for compatibility
      return []
    }
  },
})

export const getByProduct = authQuery({
  args: {
    organizationId: v.string(),
    productId: v.optional(v.id("menuProducts")),
  },
  handler: async (ctx, args) => {
    if (!args.productId) {
      return []
    }

    const product = await ctx.db.get(args.productId)
    if (!product || product.organizationId !== args.organizationId) {
      throw new MenuProductNotFoundError()
    }

    return await ctx.db
      .query("menuProductAvailability")
      .withIndex("by_menu_product", (q) =>
        q.eq("menuProductId", args.productId!)
      )
      .collect()
  },
})

export const getByLocation = authQuery({
  args: { organizationId: v.string(), locationId: v.id("restaurantLocations") },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.locationId)
    if (!location || location.organizationId !== args.organizationId) {
      throw new RestaurantLocationNotFoundError()
    }

    return await ctx.db
      .query("menuProductAvailability")
      .withIndex("by_location", (q) =>
        q.eq("restaurantLocationId", args.locationId)
      )
      .collect()
  },
})

export const toggleAvailability = authMutation({
  args: {
    organizationId: v.string(),
    productId: v.id("menuProducts"),
    locationId: v.id("restaurantLocations"),
    available: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Verify product ownership
    const product = await ctx.db.get(args.productId)
    if (!product || product.organizationId !== args.organizationId) {
      throw new MenuProductNotFoundError()
    }

    // Verify location ownership
    const location = await ctx.db.get(args.locationId)
    if (!location || location.organizationId !== args.organizationId) {
      throw new RestaurantLocationNotFoundError()
    }

    // Check if availability record exists
    const existing = await ctx.db
      .query("menuProductAvailability")
      .withIndex("by_menu_and_location", (q) =>
        q
          .eq("menuProductId", args.productId)
          .eq("restaurantLocationId", args.locationId)
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, { available: args.available })
    } else {
      await ctx.db.insert("menuProductAvailability", {
        menuProductId: args.productId,
        restaurantLocationId: args.locationId,
        available: args.available,
        organizationId: args.organizationId,
      })
    }

    // Trigger RAG update específico para cambio de disponibilidad usando scheduler
    // COMENTADO: El RAG no afecta la disponibilidad mostrada en el frontend, solo la búsqueda
    // try {
    //   if (args.available) {
    //     // AGREGAR producto a ubicación específica usando scheduler
    //     await ctx.scheduler.runAfter(0, api.system.menuIndexing.addProductToLocationInRAG, {
    //       productId: args.productId,
    //       locationId: args.locationId,
    //       organizationId: args.organizationId,
    //     });
    //   } else {
    //     // QUITAR producto de ubicación específica usando scheduler
    //     await ctx.scheduler.runAfter(0, api.system.menuIndexing.removeProductFromLocationInRAG, {
    //       productId: args.productId,
    //       locationId: args.locationId,
    //       organizationId: args.organizationId,
    //     });
    //   }
    // } catch (ragError) {
    //   console.error(`❌ [RAG TRIGGER] Error en actualización específica de producto ${args.productId}:`, ragError);
    //   // No lanzamos error para no fallar el cambio de disponibilidad
    // }
  },
})

// Función interna para obtener disponibilidad sin auth (usada por indexación RAG)
export const getAvailabilityByProductInternal = internalQuery({
  args: { productId: v.id("menuProducts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("menuProductAvailability")
      .withIndex("by_menu_product", (q) =>
        q.eq("menuProductId", args.productId)
      )
      .collect()
  },
})

export const bulkUpdateAvailability = authMutation({
  args: {
    organizationId: v.string(),
    productIds: v.array(v.id("menuProducts")),
    locationUpdates: v.array(
      v.object({
        locationId: v.id("restaurantLocations"),
        available: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Verify all products belong to organization
    const products = await Promise.all(
      args.productIds.map((id) => ctx.db.get(id))
    )

    for (const product of products) {
      if (!product || product.organizationId !== args.organizationId) {
        throw new MenuProductNotFoundError()
      }
    }

    // Verify all locations belong to organization
    const locations = await Promise.all(
      args.locationUpdates.map((update) => ctx.db.get(update.locationId))
    )

    for (const location of locations) {
      if (!location || location.organizationId !== args.organizationId) {
        throw new RestaurantLocationNotFoundError()
      }
    }

    // Perform bulk updates directly
    await Promise.all(
      args.productIds.flatMap((productId) =>
        args.locationUpdates.map(async (update) => {
          // Check if availability record exists
          const existing = await ctx.db
            .query("menuProductAvailability")
            .withIndex("by_menu_and_location", (q) =>
              q
                .eq("menuProductId", productId)
                .eq("restaurantLocationId", update.locationId)
            )
            .unique()

          if (existing) {
            await ctx.db.patch(existing._id, { available: update.available })
          } else {
            await ctx.db.insert("menuProductAvailability", {
              menuProductId: productId,
              restaurantLocationId: update.locationId,
              available: update.available,
              organizationId: args.organizationId,
            })
          }
        })
      )
    )

    // Trigger RAG updates específicos para cada producto-ubicación usando scheduler
    // COMENTADO: El RAG no afecta la disponibilidad mostrada en el frontend, solo la búsqueda
    // try {
    //   // Procesar cada actualización usando scheduler
    //   for (const productId of args.productIds) {
    //     for (const update of args.locationUpdates) {
    //       if (update.available) {
    //         // AGREGAR producto a ubicación específica usando scheduler
    //         await ctx.scheduler.runAfter(0, api.system.menuIndexing.addProductToLocationInRAG, {
    //           productId: productId,
    //           locationId: update.locationId,
    //           organizationId: args.organizationId,
    //         });
    //       } else {
    //         // QUITAR producto de ubicación específica usando scheduler
    //         await ctx.scheduler.runAfter(0, api.system.menuIndexing.removeProductFromLocationInRAG, {
    //           productId: productId,
    //           locationId: update.locationId,
    //           organizationId: args.organizationId,
    //         });
    //       }
    //     }
    //   }
    // } catch (ragError) {
    //   console.error(`❌ [RAG TRIGGER] Error en bulk update de productos:`, ragError);
    //   // No lanzamos error para no fallar el bulk update
    // }
  },
})

export const setProductAvailabilityForAllLocations = authMutation({
  args: {
    organizationId: v.string(),
    productId: v.id("menuProducts"),
    available: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Verify product ownership
    const product = await ctx.db.get(args.productId)
    if (!product || product.organizationId !== args.organizationId) {
      throw new MenuProductNotFoundError()
    }

    // Get all locations for this organization
    const locations = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Update availability for all locations directly
    await Promise.all(
      locations.map(async (location) => {
        // Check if availability record exists
        const existing = await ctx.db
          .query("menuProductAvailability")
          .withIndex("by_menu_and_location", (q) =>
            q
              .eq("menuProductId", args.productId)
              .eq("restaurantLocationId", location._id)
          )
          .unique()

        if (existing) {
          await ctx.db.patch(existing._id, { available: args.available })
        } else {
          await ctx.db.insert("menuProductAvailability", {
            menuProductId: args.productId,
            restaurantLocationId: location._id,
            available: args.available,
            organizationId: args.organizationId,
          })
        }
      })
    )

    // Trigger RAG update para todas las ubicaciones usando scheduler
    // COMENTADO: El RAG no afecta la disponibilidad mostrada en el frontend, solo la búsqueda
    // try {
    //   const locations = await ctx.db
    //     .query("restaurantLocations")
    //     .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
    //     .collect();

    //   // Procesar cada ubicación usando scheduler
    //   for (const location of locations) {
    //     if (args.available) {
    //       // AGREGAR producto a ubicación específica usando scheduler
    //       await ctx.scheduler.runAfter(0, api.system.menuIndexing.addProductToLocationInRAG, {
    //         productId: args.productId,
    //         locationId: location._id,
    //         organizationId: args.organizationId,
    //       });
    //     } else {
    //       // QUITAR producto de ubicación específica usando scheduler
    //       await ctx.scheduler.runAfter(0, api.system.menuIndexing.removeProductFromLocationInRAG, {
    //         productId: args.productId,
    //         locationId: location._id,
    //         organizationId: args.organizationId,
    //       });
    //     }
    //   }
    // } catch (ragError) {
    //   console.error(`❌ [RAG TRIGGER] Error en actualización de producto ${args.productId} en todas las ubicaciones:`, ragError);
    //   // No lanzamos error para no fallar el cambio de disponibilidad
    // }
  },
})
