import { v } from "convex/values"
import { getAll } from "convex-helpers/server/relationships"
import type { Id } from "../_generated/dataModel"
import { internalQuery } from "../_generated/server"

export const getMany = internalQuery({
  args: {
    organizationId: v.string(),
    locationId: v.optional(v.id("restaurantLocations")),
  },
  handler: async (ctx, args) => {
    // Get all products for the organization
    const products = await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    if (!args.locationId) {
      // If no location specified, return all products (for backward compatibility)
      return products
    }

    // Get availability for the specific location
    const locationId = args.locationId
    const availabilityRecords = await ctx.db
      .query("menuProductAvailability")
      .withIndex("by_location", (q) => q.eq("restaurantLocationId", locationId))
      .filter((q) => q.eq(q.field("available"), true))
      .collect()

    // Create a set of available product IDs
    const availableProductIds = new Set(
      availabilityRecords.map((record) => record.menuProductId)
    )

    // Filter products to only include those available at the location
    return products.filter((product) => availableProductIds.has(product._id))
  },
})

export const getOne = internalQuery({
  args: {
    productId: v.id("menuProducts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.productId)
  },
})

export const checkAvailability = internalQuery({
  args: {
    menuProductId: v.id("menuProducts"),
    restaurantLocationId: v.id("restaurantLocations"),
  },
  handler: async (ctx, args) => {
    const availability = await ctx.db
      .query("menuProductAvailability")
      .withIndex("by_menu_and_location", (q) =>
        q
          .eq("menuProductId", args.menuProductId)
          .eq("restaurantLocationId", args.restaurantLocationId)
      )
      .unique()

    return availability?.available ?? false
  },
})

export const getManyByIdsWithSizeAndCategoryAndAvailability = internalQuery({
  args: {
    productIds: v.array(v.id("menuProducts")),
    organizationId: v.string(),
    restaurantLocationId: v.id("restaurantLocations"),
  },
  handler: async (ctx, args) => {
    // Fetch products by Id in parallel
    const products = await getAll(ctx.db, args.productIds)

    // Filter nulls and enforce org
    const filtered = products.filter(
      (p): p is NonNullable<typeof p> =>
        p !== null && p.organizationId === args.organizationId
    )

    // Collect related Ids
    const sizeIds = filtered
      .map((p) => p.sizeId)
      .filter(Boolean) as Id<"sizes">[]
    const categoryIds = filtered
      .map((p) => p.menuProductCategoryId)
      .filter(Boolean)

    // Get availability records for the location
    const availabilityRecords = await ctx.db
      .query("menuProductAvailability")
      .withIndex("by_location", (q) =>
        q.eq("restaurantLocationId", args.restaurantLocationId)
      )
      .collect()

    // Build availability lookup map
    const availabilityById = new Map(
      availabilityRecords.map((record) => [
        record.menuProductId,
        record.available,
      ])
    )

    // Batch fetch related docs
    const [sizes, categories] = await Promise.all([
      getAll(ctx.db, sizeIds),
      getAll(ctx.db, categoryIds),
    ])

    // Build quick lookup maps
    const sizeById = new Map(
      sizes.filter(Boolean).map((s) => [s!._id, s!.name])
    )
    const categoryById = new Map(
      categories.filter(Boolean).map((c) => [c!._id, c!.name])
    )

    // Merge all data together
    const result = filtered.map((p) => ({
      ...p,
      size: p.sizeId ? sizeById.get(p.sizeId) : null,
      category: categoryById.get(p.menuProductCategoryId),
      available: availabilityById.get(p._id) ?? false,
    }))

    return result
  },
})

export const getManyByIdsWithSizeAndCategoryAndAvailabilityForAI =
  internalQuery({
    args: {
      productIds: v.array(v.id("menuProducts")),
      restaurantLocationId: v.optional(v.id("restaurantLocations")),
    },
    handler: async (ctx, args) => {
      // Fetch products by Id in parallel
      const products = await getAll(ctx.db, args.productIds)

      // Filter nulls and enforce org
      const filtered = products.filter(
        (p): p is NonNullable<typeof p> => p !== null
      )

      // Collect related Ids
      const sizeIds = filtered
        .map((p) => p.sizeId)
        .filter(Boolean) as Id<"sizes">[]
      const categoryIds = filtered
        .map((p) => p.menuProductCategoryId)
        .filter(Boolean)

      // Build availability lookup map (only if locationId is provided)
      let availabilityById = new Map<Id<"menuProducts">, boolean>()
      if (args.restaurantLocationId) {
        // Get availability records for the location
        const availabilityRecords = await ctx.db
          .query("menuProductAvailability")
          .withIndex("by_location", (q) =>
            q.eq("restaurantLocationId", args.restaurantLocationId!)
          )
          .collect()

        availabilityById = new Map(
          availabilityRecords.map((record) => [
            record.menuProductId,
            record.available,
          ])
        )
      }

      // Batch fetch related docs
      const [sizes, categories] = await Promise.all([
        getAll(ctx.db, sizeIds),
        getAll(ctx.db, categoryIds),
      ])

      // Build quick lookup maps
      const sizeById = new Map(
        sizes.filter(Boolean).map((s) => [s!._id, s!.name])
      )
      const categoryById = new Map(
        categories.filter(Boolean).map((c) => [c!._id, c!.name])
      )

      // Merge all data together
      // When no locationId is provided, set available to true by default
      const result = filtered.map((p) => ({
        ...p,
        id: p._id,
        size: p.sizeId ? sizeById.get(p.sizeId) : null,
        category: categoryById.get(p.menuProductCategoryId),
        available: args.restaurantLocationId
          ? (availabilityById.get(p._id) ?? false)
          : true,
      }))

      return result
    },
  })

export const getManyWithSizeAndCategoryAndAvailabilityForAI = internalQuery({
  args: {
    organizationId: v.string(),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
  },
  handler: async (ctx, args) => {
    // Fetch products by Id in parallel
    const products = await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Only include products that belong to the org (defensive, in case of data drift)
    const filtered = products.filter(
      (p): p is NonNullable<typeof p> =>
        p !== null && p.organizationId === args.organizationId
    )

    // Get availability records only if a specific location is provided
    // If no location is specified, we don't check availability (we don't know which location)
    let availabilityById: Map<Id<"menuProducts">, boolean>
    let productsToReturn = filtered
    if (args.restaurantLocationId) {
      const availabilityRecords = await ctx.db
        .query("menuProductAvailability")
        .withIndex("by_location", (q) =>
          q.eq("restaurantLocationId", args.restaurantLocationId!)
        )
        .collect()

      availabilityById = new Map(
        availabilityRecords.map((record) => [
          record.menuProductId,
          record.available,
        ])
      )

      // Filter products to only include those available at the location
      productsToReturn = filtered.filter(
        (p) => availabilityById.get(p._id) === true
      )
    } else {
      // No location specified: skip availability check
      // Set all products as available by default
      availabilityById = new Map()
    }

    // Gather unique related IDs from products to return
    const sizeIds = Array.from(
      new Set(productsToReturn.map((p) => p.sizeId).filter(Boolean))
    ) as Id<"sizes">[]
    const categoryIds = Array.from(
      new Set(
        productsToReturn.map((p) => p.menuProductCategoryId).filter(Boolean)
      )
    )

    // Gather unique category IDs from combinableWith arrays
    const combinableCategoryIds = Array.from(
      new Set(
        productsToReturn
          .flatMap(
            (p) => p.combinableWith?.map((c) => c.menuProductCategoryId) || []
          )
          .filter(Boolean)
      )
    )

    // Batch fetch related docs
    const [sizes, categories, combinableCategories] = await Promise.all([
      getAll(ctx.db, sizeIds),
      getAll(ctx.db, categoryIds),
      getAll(ctx.db, combinableCategoryIds),
    ])

    // Build lookup maps for size and category
    const sizeById = new Map(
      sizes.filter(Boolean).map((s) => [s!._id, s!.name])
    )
    const categoryById = new Map(
      categories.filter(Boolean).map((c) => [c!._id, c!.name])
    )
    const combinableCategoryById = new Map(
      combinableCategories.filter(Boolean).map((c) => [c!._id, c!.name])
    )

    // Return only essential fields for AI context (optimized for token usage)
    return productsToReturn.map((p) => ({
      id: p._id,
      name: p.name,
      description: p.description,
      price: p.price,
      category: categoryById.get(p.menuProductCategoryId) ?? null,
      size: p.sizeId ? (sizeById.get(p.sizeId) ?? null) : null,
      standAlone: p.standAlone,
      combinableHalf: p.combinableHalf,
      combinableWith:
        p.combinableWith?.map((combo) => ({
          categoryName:
            combinableCategoryById.get(combo.menuProductCategoryId) ??
            "Categoría desconocida",
          sizeName: combo.sizeId ? (sizeById.get(combo.sizeId) ?? null) : null,
        })) || [],
      instructions: p.instructions,
      // If no location specified, assume all products are available (true)
      // If location specified, use actual availability (default to false if not found)
      available: args.restaurantLocationId
        ? (availabilityById.get(p._id) ?? false)
        : true,
    }))
  },
})

export const searchProductsByCategory = internalQuery({
  args: {
    organizationId: v.string(),
    categoryIds: v.optional(v.array(v.id("menuProductCategories"))),
    limit: v.optional(v.number()),
    locationId: v.optional(v.id("restaurantLocations")),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50

    // If we have specific categories, use optimized index query
    if (args.categoryIds && args.categoryIds.length > 0) {
      // Query products for each category separately with limits
      const productsPerCategory = await Promise.all(
        args.categoryIds.map(async (categoryId) => {
          const query = ctx.db
            .query("menuProducts")
            .withIndex("by_organization_and_category", (q) =>
              q
                .eq("organizationId", args.organizationId)
                .eq("menuProductCategoryId", categoryId)
            )

          // If location filter is specified, we need to check availability
          if (args.locationId) {
            const locationId = args.locationId
            const products = await query.take(limit * 2) // Take more to account for availability filtering

            const availabilityRecords = await ctx.db
              .query("menuProductAvailability")
              .withIndex("by_location", (q) =>
                q.eq("restaurantLocationId", locationId)
              )
              .filter((q) => q.eq(q.field("available"), true))
              .take(1000) // Reasonable limit for availability records

            const availableProductIds = new Set(
              availabilityRecords.map((record) => record.menuProductId)
            )

            return products
              .filter((product) => availableProductIds.has(product._id))
              .slice(0, limit)
          }

          return await query.take(limit)
        })
      )

      // Flatten and limit total results
      const allProducts = productsPerCategory.flat().slice(0, limit)

      // Get related data
      const sizeIds = allProducts
        .map((p) => p.sizeId)
        .filter(Boolean) as Id<"sizes">[]
      const categoryIds = allProducts.map((p) => p.menuProductCategoryId)

      const [sizes, categories] = await Promise.all([
        getAll(ctx.db, sizeIds),
        getAll(ctx.db, categoryIds),
      ])

      const sizeById = new Map(
        sizes.filter(Boolean).map((s) => [s!._id, s!.name])
      )
      const categoryById = new Map(
        categories.filter(Boolean).map((c) => [c!._id, c!.name])
      )

      return allProducts.map((p) => ({
        _id: p._id,
        name: p.name,
        description: p.description,
        price: p.price,
        category: categoryById.get(p.menuProductCategoryId) || "Sin categoría",
        size: p.sizeId ? sizeById.get(p.sizeId) : null,
        standAlone: p.standAlone,
        combinableHalf: p.combinableHalf,
      }))
    }

    // If no categories specified, get from all categories with limit
    const query = ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )

    if (args.locationId) {
      const locationId = args.locationId
      const products = await query.take(limit * 2) // Take more to account for availability filtering

      const availabilityRecords = await ctx.db
        .query("menuProductAvailability")
        .withIndex("by_location", (q) =>
          q.eq("restaurantLocationId", locationId)
        )
        .filter((q) => q.eq(q.field("available"), true))
        .take(1000) // Reasonable limit for availability records

      const availableProductIds = new Set(
        availabilityRecords.map((record) => record.menuProductId)
      )

      const filteredProducts = products
        .filter((product) => availableProductIds.has(product._id))
        .slice(0, limit)

      const sizeIds = filteredProducts
        .map((p) => p.sizeId)
        .filter(Boolean) as Id<"sizes">[]
      const categoryIds = filteredProducts.map((p) => p.menuProductCategoryId)

      const [sizes, categories] = await Promise.all([
        getAll(ctx.db, sizeIds),
        getAll(ctx.db, categoryIds),
      ])

      const sizeById = new Map(
        sizes.filter(Boolean).map((s) => [s!._id, s!.name])
      )
      const categoryById = new Map(
        categories.filter(Boolean).map((c) => [c!._id, c!.name])
      )

      return filteredProducts.map((p) => ({
        _id: p._id,
        name: p.name,
        description: p.description,
        price: p.price,
        category: categoryById.get(p.menuProductCategoryId) || "Sin categoría",
        size: p.sizeId ? sizeById.get(p.sizeId) : null,
        standAlone: p.standAlone,
        combinableHalf: p.combinableHalf,
      }))
    }

    // No location filter - simple take
    const products = await query.take(limit)

    const sizeIds = products
      .map((p) => p.sizeId)
      .filter(Boolean) as Id<"sizes">[]
    const categoryIds = products.map((p) => p.menuProductCategoryId)

    const [sizes, categories] = await Promise.all([
      getAll(ctx.db, sizeIds),
      getAll(ctx.db, categoryIds),
    ])

    const sizeById = new Map(
      sizes.filter(Boolean).map((s) => [s!._id, s!.name])
    )
    const categoryById = new Map(
      categories.filter(Boolean).map((c) => [c!._id, c!.name])
    )

    return products.map((p) => ({
      _id: p._id,
      name: p.name,
      description: p.description,
      price: p.price,
      category: categoryById.get(p.menuProductCategoryId) || "Sin categoría",
      size: p.sizeId ? sizeById.get(p.sizeId) : null,
      standAlone: p.standAlone,
      combinableHalf: p.combinableHalf,
    }))
  },
})

export const getAvailabilityByLocation = internalQuery({
  args: {
    locationId: v.id("restaurantLocations"),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    // Verificar que la ubicación pertenece a la organización
    const location = await ctx.db.get(args.locationId)
    if (!location || location.organizationId !== args.organizationId) {
      return []
    }

    return await ctx.db
      .query("menuProductAvailability")
      .withIndex("by_location", (q) =>
        q.eq("restaurantLocationId", args.locationId)
      )
      .collect()
  },
})

// Función para obtener productos por organización (sin auth, para uso interno)
export const getProductsByOrganization = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
  },
})

/**
 * Search products by name using text search
 * Returns products with their imageUrl for the sendProductImage tool
 */
export const searchByName = internalQuery({
  args: {
    organizationId: v.string(),
    searchQuery: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 5

    // Use the search index for name matching
    const products = await ctx.db
      .query("menuProducts")
      .withSearchIndex("search_name", (q) =>
        q
          .search("name", args.searchQuery)
          .eq("organizationId", args.organizationId)
      )
      .take(limit)

    // Get category names for context
    const categoryIds = products.map((p) => p.menuProductCategoryId)
    const categories = await Promise.all(
      categoryIds.map((id) => ctx.db.get(id))
    )
    const categoryById = new Map(
      categories.filter(Boolean).map((c) => [c!._id, c!.name])
    )

    return products.map((p) => ({
      _id: p._id,
      name: p.name,
      description: p.description,
      price: p.price,
      imageUrl: p.imageUrl,
      category: categoryById.get(p.menuProductCategoryId) || "Sin categoría",
    }))
  },
})
