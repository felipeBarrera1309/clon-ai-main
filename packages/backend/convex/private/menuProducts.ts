import { Buffer } from "buffer"
import { type PaginationResult, paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import * as XLSX from "xlsx"
import { api, internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import { BadRequestError, UnauthorizedError } from "../lib/errors"
import { authMutation, authQuery } from "../lib/helpers"
import { normalizeSearchText } from "../lib/textUtils"
import { aggregateMenuProductsByOrganization } from "../menuProductsAggregate"

export const list = authQuery({
  args: {
    organizationId: v.string(),
    paginationOpts: v.optional(paginationOptsValidator),
    categoryId: v.optional(v.id("menuProductCategories")),
    subcategoryId: v.optional(v.id("menuProductSubcategories")),
    locationId: v.optional(v.id("restaurantLocations")),
    searchQuery: v.optional(v.string()),
    sheetId: v.optional(v.string()),
    filterKey: v.optional(v.string()),
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("menuProducts"),
        _creationTime: v.number(),
        name: v.string(),
        description: v.string(),
        price: v.number(),
        menuProductCategoryId: v.id("menuProductCategories"),
        menuProductSubcategoryId: v.optional(v.id("menuProductSubcategories")),
        standAlone: v.boolean(),
        combinableWith: v.optional(
          v.array(
            v.object({
              menuProductCategoryId: v.id("menuProductCategories"),
              sizeId: v.optional(v.id("sizes")),
              menuProductId: v.optional(v.id("menuProducts")),
              categoryName: v.string(),
              sizeName: v.union(v.string(), v.null()),
            })
          )
        ),
        sizeId: v.optional(v.id("sizes")),
        combinableHalf: v.boolean(),
        minimumQuantity: v.optional(v.number()),
        maximumQuantity: v.optional(v.number()),
        imageUrl: v.optional(v.string()),
        externalCode: v.optional(v.string()),
        instructions: v.optional(v.string()),
        componentsId: v.optional(v.array(v.id("menuProducts"))),
        organizationId: v.string(),
        categoryName: v.string(),
        subcategoryName: v.union(v.string(), v.null()),
        sizeName: v.union(v.string(), v.null()),
        availability: v.record(v.string(), v.boolean()),
      })
    ),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(
        v.literal("SplitRecommended"),
        v.literal("SplitRequired"),
        v.null()
      )
    ),
  }),
  handler: async (ctx, args) => {
    // Handle cursor with filterKey to prevent invalid cursor errors when filters change (for availability sheet)
    let effectiveCursor: string | null = null
    if (args.sheetId && args.filterKey && args.paginationOpts?.cursor) {
      const cursorParts = args.paginationOpts.cursor.split(":", 2)
      if (cursorParts.length === 2) {
        const [cursorFilterKey, realCursor] = cursorParts
        if (cursorFilterKey === args.filterKey) {
          effectiveCursor = realCursor ?? null
        }
        // If filterKey doesn't match, effectiveCursor remains null (reset pagination)
      }
    } else {
      effectiveCursor = args.paginationOpts?.cursor || null
    }

    const paginationOpts =
      args.sheetId && args.filterKey
        ? {
            ...args.paginationOpts,
            cursor: effectiveCursor,
            numItems: args.paginationOpts?.numItems || 20,
          }
        : args.paginationOpts || { numItems: 20, cursor: null }

    let paginationResult: PaginationResult<Doc<"menuProducts">>

    if (args.searchQuery?.trim()) {
      const normalizedQuery = normalizeSearchText(args.searchQuery)

      // Use normalized search index for case-insensitive and accent-insensitive text search
      const query = ctx.db
        .query("menuProducts")
        .withSearchIndex("search_name_normalized", (q) => {
          let filter = q.search("nameNormalized", normalizedQuery)
          filter = filter.eq("organizationId", args.organizationId)
          if (args.categoryId) {
            filter = filter.eq("menuProductCategoryId", args.categoryId)
          }
          if (args.subcategoryId) {
            filter = filter.eq("menuProductSubcategoryId", args.subcategoryId)
          }
          return filter
        })

      paginationResult = await query.paginate(paginationOpts)
    } else {
      // Use regular indexes for non-search queries
      let query = ctx.db
        .query("menuProducts")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )

      // Apply category filter
      if (args.categoryId) {
        query = query.filter((q) =>
          q.eq(q.field("menuProductCategoryId"), args.categoryId)
        )
      }

      // Apply subcategory filter
      if (args.subcategoryId) {
        query = query.filter((q) =>
          q.eq(q.field("menuProductSubcategoryId"), args.subcategoryId)
        )
      }
      paginationResult = await query.paginate(paginationOpts)
    }

    // Get all sizes, categories, subcategories, and locations for resolution
    const [sizes, categories, subcategories, locations] = await Promise.all([
      ctx.db
        .query("sizes")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
      ctx.db
        .query("menuProductCategories")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
      ctx.db
        .query("menuProductSubcategories")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
      ctx.db
        .query("restaurantLocations")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
    ])

    // Create lookup maps
    const sizeMap = new Map(sizes.map((size) => [size._id, size.name]))
    const categoryMap = new Map(categories.map((cat) => [cat._id, cat.name]))
    const subcategoryMap = new Map(
      subcategories.map((subcat) => [subcat._id, subcat.name])
    )
    const locationMap = new Map(locations.map((loc) => [loc._id, loc.name]))

    // Get availability for all products in the current page
    const productIds = paginationResult.page.map((p) => p._id)
    const availabilityRecords = await ctx.db
      .query("menuProductAvailability")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Create availability lookup map using location _ids
    const availabilityMap = new Map<string, Record<string, boolean>>()
    productIds.forEach((productId) => {
      const productAvailability: Record<string, boolean> = {}
      availabilityRecords
        .filter((record) => record.menuProductId === productId)
        .forEach((record) => {
          productAvailability[record.restaurantLocationId] = record.available
        })
      availabilityMap.set(productId, productAvailability)
    })

    // Resolve IDs to names
    const resolvedProducts = paginationResult.page.map((product) => {
      const { nameNormalized, ...productWithoutNormalized } = product
      return {
        ...productWithoutNormalized,
        categoryName:
          categoryMap.get(product.menuProductCategoryId) || "Unknown Category",
        subcategoryName: product.menuProductSubcategoryId
          ? subcategoryMap.get(product.menuProductSubcategoryId) ||
            "Unknown Subcategory"
          : null,
        sizeName: product.sizeId
          ? sizeMap.get(product.sizeId) || "Unknown Size"
          : null,
        availability: availabilityMap.get(product._id) || {},
        combinableWith:
          product.combinableWith?.map((combination) => ({
            ...combination,
            categoryName:
              categoryMap.get(combination.menuProductCategoryId) ||
              "Unknown Category",
            sizeName: combination.sizeId
              ? sizeMap.get(combination.sizeId) || "Unknown Size"
              : null,
          })) || [],
      }
    })

    // Prefix cursors with filterKey to make them filter-specific (for availability sheet)
    const prefixedContinueCursor =
      args.sheetId && args.filterKey && paginationResult.continueCursor
        ? `${args.filterKey}:${paginationResult.continueCursor}`
        : paginationResult.continueCursor
    const prefixedSplitCursor =
      args.sheetId && args.filterKey && paginationResult.splitCursor
        ? `${args.filterKey}:${paginationResult.splitCursor}`
        : paginationResult.splitCursor

    return {
      ...paginationResult,
      continueCursor: prefixedContinueCursor,
      splitCursor: prefixedSplitCursor,
      page: resolvedProducts,
    }
  },
})

export const listByCategory = authQuery({
  args: {
    organizationId: v.string(),
    menuProductCategoryId: v.id("menuProductCategories"),
  },
  returns: v.array(
    v.object({
      _id: v.id("menuProducts"),
      _creationTime: v.number(),
      name: v.string(),
      description: v.string(),
      price: v.number(),
      menuProductCategoryId: v.id("menuProductCategories"),
      standAlone: v.boolean(),
      combinableWith: v.optional(
        v.array(
          v.object({
            menuProductCategoryId: v.id("menuProductCategories"),
            sizeId: v.optional(v.id("sizes")),
            menuProductId: v.optional(v.id("menuProducts")),
          })
        )
      ),
      sizeId: v.optional(v.id("sizes")),
      combinableHalf: v.boolean(),
      minimumQuantity: v.optional(v.number()),
      maximumQuantity: v.optional(v.number()),
      imageUrl: v.optional(v.string()),
      externalCode: v.optional(v.string()),
      instructions: v.optional(v.string()),
      componentsId: v.optional(v.array(v.id("menuProducts"))),
      organizationId: v.string(),
      categoryName: v.string(),
      sizeName: v.union(v.string(), v.null()),
      availability: v.record(v.string(), v.boolean()),
    })
  ),
  handler: async (ctx, args) => {
    // Get menu products by category
    const menuProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_category", (q) =>
        q.eq("menuProductCategoryId", args.menuProductCategoryId)
      )
      .collect()

    // Get all sizes, categories, and locations for resolution
    const [sizes, categories, locations] = await Promise.all([
      ctx.db
        .query("sizes")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
      ctx.db
        .query("menuProductCategories")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
      ctx.db
        .query("restaurantLocations")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
    ])

    // Create lookup maps
    const sizeMap = new Map(sizes.map((size) => [size._id, size.name]))
    const categoryMap = new Map(categories.map((cat) => [cat._id, cat.name]))
    const locationMap = new Map(locations.map((loc) => [loc._id, loc.name]))

    // Get availability for all products
    const productIds = menuProducts.map((p) => p._id)
    const availabilityRecords = await ctx.db
      .query("menuProductAvailability")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Create availability lookup map using location _ids
    const availabilityMap = new Map<string, Record<string, boolean>>()
    productIds.forEach((productId) => {
      const productAvailability: Record<string, boolean> = {}
      availabilityRecords
        .filter((record) => record.menuProductId === productId)
        .forEach((record) => {
          productAvailability[record.restaurantLocationId] = record.available
        })
      availabilityMap.set(productId, productAvailability)
    })

    // Resolve IDs to names
    return menuProducts.map((product) => ({
      ...product,
      categoryName:
        categoryMap.get(product.menuProductCategoryId) || "Unknown Category",
      sizeName: product.sizeId
        ? sizeMap.get(product.sizeId) || "Unknown Size"
        : null,
      availability: availabilityMap.get(product._id) || {},
      combinableWith:
        product.combinableWith?.map((combination) => ({
          ...combination,
          categoryName:
            categoryMap.get(combination.menuProductCategoryId) ||
            "Unknown Category",
          sizeName: combination.sizeId
            ? sizeMap.get(combination.sizeId) || "Unknown Size"
            : null,
        })) || [],
    }))
  },
})

export const create = authMutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
    description: v.string(),
    price: v.number(),
    menuProductCategoryId: v.id("menuProductCategories"),
    menuProductSubcategoryId: v.optional(v.id("menuProductSubcategories")),
    standAlone: v.boolean(),
    combinableWith: v.optional(
      v.array(
        v.object({
          menuProductCategoryId: v.id("menuProductCategories"),
          sizeId: v.optional(v.id("sizes")),
        })
      )
    ),
    sizeId: v.optional(v.id("sizes")),
    combinableHalf: v.boolean(),
    minimumQuantity: v.optional(v.number()),
    maximumQuantity: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    externalCode: v.optional(v.string()),
    instructions: v.optional(v.string()),
    componentsId: v.optional(v.array(v.id("menuProducts"))),
  },
  handler: async (ctx, args) => {
    // Validate that the name is not empty
    if (!args.name.trim()) {
      throw new BadRequestError("El nombre del producto no puede estar vacío")
    }

    // Validate price is not negative
    if (args.price < 0) {
      throw new BadRequestError("El precio no puede ser negativo")
    }

    // Validate that the category exists and belongs to the organization
    const category = await ctx.db.get(args.menuProductCategoryId)
    if (!category) {
      throw new BadRequestError("Categoría no encontrada")
    }
    if (category.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para usar esta categoría"
      )
    }

    // Validate subcategory if provided
    if (args.menuProductSubcategoryId) {
      const subcategory = await ctx.db.get(args.menuProductSubcategoryId)
      if (!subcategory) {
        throw new BadRequestError("Subcategoría no encontrada")
      }
      if (subcategory.organizationId !== args.organizationId) {
        throw new UnauthorizedError(
          "No estás autorizado para usar esta subcategoría"
        )
      }
      // Verify that subcategory belongs to the specified category
      if (subcategory.menuProductCategoryId !== args.menuProductCategoryId) {
        throw new BadRequestError(
          "La subcategoría no pertenece a la categoría especificada"
        )
      }
    }

    // If combinableWith is provided, validate all categories exist and belong to the organization
    if (args.combinableWith) {
      for (const combinable of args.combinableWith) {
        const combinableCategory = await ctx.db.get(
          combinable.menuProductCategoryId
        )
        if (!combinableCategory) {
          throw new BadRequestError("Categoría combinable no encontrada")
        }
        if (combinableCategory.organizationId !== args.organizationId) {
          throw new UnauthorizedError(
            "No estás autorizado para usar la categoría combinable"
          )
        }

        // If size is provided, validate it exists and belongs to the organization
        if (combinable.sizeId) {
          const size = await ctx.db.get(combinable.sizeId)
          if (!size) {
            throw new BadRequestError("Tamaño combinable no encontrado")
          }
          if (size.organizationId !== args.organizationId) {
            throw new UnauthorizedError(
              "No estás autorizado para usar el tamaño combinable"
            )
          }
        }
      }
    }

    // Validate quantity constraints
    if (
      args.minimumQuantity !== undefined &&
      args.maximumQuantity !== undefined
    ) {
      if (args.minimumQuantity > args.maximumQuantity) {
        throw new BadRequestError(
          "La cantidad mínima no puede ser mayor a la máxima"
        )
      }
    }

    // Validate componentsId if provided
    if (args.componentsId) {
      for (const componentId of args.componentsId) {
        const component = await ctx.db.get(componentId)
        if (!component) {
          throw new BadRequestError(
            `Componente con ID ${componentId} no encontrado`
          )
        }
        if (component.organizationId !== args.organizationId) {
          throw new UnauthorizedError(
            `No estás autorizado para usar el componente con ID ${componentId}`
          )
        }
      }
    }

    const productId = await ctx.db.insert("menuProducts", {
      ...args,
      name: args.name.trim(),
      nameNormalized: normalizeSearchText(args.name.trim()),
      description: args.description.trim(),
      sizeId: args.sizeId ? (args.sizeId as Id<"sizes">) : undefined,
      organizationId: args.organizationId,
      imageUrl: args.imageUrl,
    })
    const createdProduct = await ctx.db.get(productId)
    if (createdProduct) {
      await aggregateMenuProductsByOrganization.insertIfDoesNotExist(
        ctx,
        createdProduct
      )
    }

    // Automatically make the product available in all restaurant locations
    const locations = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Create availability records for all locations
    await Promise.all(
      locations.map((location) =>
        ctx.db.insert("menuProductAvailability", {
          menuProductId: productId,
          restaurantLocationId: location._id,
          available: true, // Products are available by default
          organizationId: args.organizationId,
        })
      )
    )

    /*
    // Trigger RAG update for new product
    try {
      await ctx.scheduler.runAfter(0, (internal as any).system.menuIndexing.triggerRAGUpdateOnProductChange, {
        organizationId: args.organizationId,
        productId: productId,
        operation: "create"
      });
      console.log(`✅ [RAG TRIGGER] Producto ${productId} programado para indexación en RAG después de creación`);
    } catch (ragError) {
      console.error(`❌ [RAG TRIGGER] Error programando indexación de producto ${productId} en RAG:`, ragError);
      // No lanzamos error para no fallar la creación del producto
    }
    */

    return productId
  },
})

export const updateProduct = authMutation({
  args: {
    organizationId: v.string(),
    id: v.id("menuProducts"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    price: v.optional(v.number()),
    menuProductCategoryId: v.optional(v.id("menuProductCategories")),
    menuProductSubcategoryId: v.optional(v.id("menuProductSubcategories")),
    standAlone: v.optional(v.boolean()),
    combinableWith: v.optional(
      v.array(
        v.object({
          menuProductCategoryId: v.id("menuProductCategories"),
          sizeId: v.optional(v.id("sizes")),
          menuProductId: v.optional(v.id("menuProducts")),
        })
      )
    ),
    sizeId: v.optional(v.id("sizes")),
    combinableHalf: v.optional(v.boolean()),
    minimumQuantity: v.optional(v.number()),
    maximumQuantity: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    externalCode: v.optional(v.string()),
    instructions: v.optional(v.string()),
    componentsId: v.optional(v.array(v.id("menuProducts"))),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args

    const product = await ctx.db.get(id)
    if (!product) {
      throw new BadRequestError("Producto no encontrado")
    }

    if (product.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para editar este producto"
      )
    }

    // Validate name if provided
    if (updates.name !== undefined && !updates.name.trim()) {
      throw new BadRequestError("El nombre del producto no puede estar vacío")
    }

    // Validate price if provided
    if (updates.price !== undefined && updates.price < 0) {
      throw new BadRequestError("El precio no puede ser negativo")
    }

    // Validate category if provided
    if (updates.menuProductCategoryId) {
      const category = await ctx.db.get(updates.menuProductCategoryId)
      if (!category) {
        throw new BadRequestError("Categoría no encontrada")
      }
      if (category.organizationId !== args.organizationId) {
        throw new UnauthorizedError(
          "No estás autorizado para usar esta categoría"
        )
      }
    }
    if (updates.sizeId) {
      const size = await ctx.db.get(updates.sizeId)
      if (!size) {
        throw new BadRequestError("Tamaño no encontrado")
      }
      if (size.organizationId !== args.organizationId) {
        throw new UnauthorizedError("No estás autorizado para usar este tamaño")
      }
    }

    // Validate subcategory if provided
    if (updates.menuProductSubcategoryId) {
      const subcategory = await ctx.db.get(updates.menuProductSubcategoryId)
      if (!subcategory) {
        throw new BadRequestError("Subcategoría no encontrada")
      }
      if (subcategory.organizationId !== args.organizationId) {
        throw new UnauthorizedError(
          "No estás autorizado para usar esta subcategoría"
        )
      }
      // Verify that subcategory belongs to the category (current or updated)
      const categoryId =
        updates.menuProductCategoryId || product.menuProductCategoryId
      if (subcategory.menuProductCategoryId !== categoryId) {
        throw new BadRequestError(
          "La subcategoría no pertenece a la categoría especificada"
        )
      }
    }

    // Validate combinableWith if provided
    if (updates.combinableWith) {
      for (const combinable of updates.combinableWith) {
        const combinableCategory = await ctx.db.get(
          combinable.menuProductCategoryId
        )
        if (!combinableCategory) {
          throw new BadRequestError("Categoría combinable no encontrada")
        }
        if (combinableCategory.organizationId !== args.organizationId) {
          throw new UnauthorizedError(
            "No estás autorizado para usar la categoría combinable"
          )
        }
      }
    }

    // Validate quantity constraints
    if (
      updates.minimumQuantity !== undefined ||
      updates.maximumQuantity !== undefined
    ) {
      const minQty = updates.minimumQuantity ?? product.minimumQuantity
      const maxQty = updates.maximumQuantity ?? product.maximumQuantity

      if (minQty !== undefined && maxQty !== undefined && minQty > maxQty) {
        throw new BadRequestError(
          "La cantidad mínima no puede ser mayor a la máxima"
        )
      }
    }

    // Validate componentsId if provided
    if (updates.componentsId) {
      for (const componentId of updates.componentsId) {
        const component = await ctx.db.get(componentId)
        if (!component) {
          throw new BadRequestError(
            `Componente con ID ${componentId} no encontrado`
          )
        }
        if (component.organizationId !== args.organizationId) {
          throw new UnauthorizedError(
            `No estás autorizado para usar el componente con ID ${componentId}`
          )
        }
      }
    }

    const updateData = {
      ...updates,
      name: updates.name?.trim(),
      nameNormalized: updates.name
        ? normalizeSearchText(updates.name.trim())
        : undefined,
      description: updates.description?.trim(),
      sizeId: updates.sizeId ? (updates.sizeId as Id<"sizes">) : undefined,
      imageUrl: updates.imageUrl,
    }

    // Remove undefined values
    Object.keys(updateData).forEach((key) => {
      if (updateData[key as keyof typeof updateData] === undefined) {
        delete updateData[key as keyof typeof updateData]
      }
    })

    await ctx.db.patch(id, updateData)

    /*
    // Trigger RAG update for updated product
    try {
      await ctx.scheduler.runAfter(0, (internal as any).system.menuIndexing.triggerRAGUpdateOnProductChange, {
        organizationId: args.organizationId,
        productId: id,
        operation: "update"
      });
      console.log(`✅ [RAG TRIGGER] Producto ${id} programado para actualización en RAG después de modificación`);
    } catch (ragError) {
      console.error(`❌ [RAG TRIGGER] Error programando actualización de producto ${id} en RAG:`, ragError);
      // No lanzamos error para no fallar la actualización del producto
    }
    */

    return id
  },
})

export const deleteProduct = authMutation({
  args: { organizationId: v.string(), id: v.id("menuProducts") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id)
    if (!product) {
      throw new BadRequestError("Producto no encontrado")
    }

    if (product.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para eliminar este producto"
      )
    }

    // TODO: Check if product is used in any orders
    // Note: This check is disabled for now as querying array fields requires a different approach
    // const ordersUsingProduct = await ctx.db
    //   .query("orderProducts")
    //   .filter((q) => q.eq("products", args.id))
    //   .take(1)
    //
    // if (ordersUsingProduct.length > 0) {
    //   throw new BadRequestError(
    //     "No se puede eliminar el producto porque está siendo usado en pedidos"
    //   )
    // }

    // Check if product is referenced by any combo slot options
    const comboSlotOptionReference = await ctx.db
      .query("comboSlotOptions")
      .withIndex("by_menu_product_id", (q) => q.eq("menuProductId", args.id))
      .first()

    if (comboSlotOptionReference) {
      throw new BadRequestError(
        "Este producto está siendo usado en opciones de combo. Elimina las opciones de combo primero."
      )
    }

    await ctx.db.delete(args.id)
    await aggregateMenuProductsByOrganization.deleteIfExists(ctx, product)

    /*
    // Trigger RAG update for deleted product (cleanup)
    try {
      await ctx.scheduler.runAfter(0, (internal as any).system.menuIndexing.triggerRAGUpdateOnProductChange, {
        organizationId: args.organizationId,
        productId: args.id,
        operation: "delete"
      });
      console.log(`✅ [RAG TRIGGER] Producto ${args.id} programado para eliminación del RAG después de borrado`);
    } catch (ragError) {
      console.error(`❌ [RAG TRIGGER] Error programando eliminación de producto ${args.id} del RAG:`, ragError);
      // No lanzamos error para no fallar el borrado del producto
    }
    */
  },
})

export const batchDeleteProducts = authMutation({
  args: {
    organizationId: v.string(),
    productIds: v.array(v.id("menuProducts")),
  },
  handler: async (ctx, args) => {
    if (args.productIds.length === 0) {
      throw new BadRequestError("No se seleccionaron productos para eliminar")
    }

    if (args.productIds.length > 100) {
      throw new BadRequestError(
        "No se pueden eliminar más de 50 productos a la vez"
      )
    }

    // Verify all products exist and belong to the organization
    const productsToDelete: Doc<"menuProducts">[] = []
    for (const productId of args.productIds) {
      const product = await ctx.db.get(productId)
      if (!product) {
        throw new BadRequestError(`Producto con ID ${productId} no encontrado`)
      }

      if (product.organizationId !== args.organizationId) {
        throw new UnauthorizedError(
          `No estás autorizado para eliminar el producto con ID ${productId}`
        )
      }
      productsToDelete.push(product)
    }

    // TODO: Check if any products are used in orders
    // Note: This check is disabled for now as querying array fields requires a different approach

    // Delete all products in batch
    const deletePromises = args.productIds.map((productId) =>
      ctx.db.delete(productId)
    )
    await Promise.all(deletePromises)
    await Promise.all(
      productsToDelete.map((product) =>
        aggregateMenuProductsByOrganization.deleteIfExists(ctx, product)
      )
    )

    /*
    // Trigger RAG cleanup for deleted products
    try {
      const ragPromises = args.productIds.map((productId) =>
        ctx.scheduler.runAfter(0, (internal as any).system.menuIndexing.triggerRAGUpdateOnProductChange, {
          organizationId: args.organizationId,
          productId: productId,
          operation: "delete"
        })
      );
      await Promise.all(ragPromises);
      console.log(`✅ [RAG TRIGGER] ${args.productIds.length} productos programados para eliminación del RAG después de borrado batch`);
    } catch (ragError) {
      console.error(`❌ [RAG TRIGGER] Error programando eliminación de productos del RAG en batch:`, ragError);
      // No lanzamos error para no fallar el borrado de productos
    }
    */

    return {
      deletedCount: args.productIds.length,
      message: `Se eliminaron ${args.productIds.length} productos exitosamente`,
    }
  },
})

export const exportMenuToXlsx = authQuery({
  args: { organizationId: v.string(), trigger: v.optional(v.string()) },
  returns: v.union(v.string(), v.null()), // Base64 encoded XLSX file or null
  handler: async (ctx, args) => {
    if (!args.trigger) {
      return null
    }
    // Get all menu products for the organization
    const menuProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Get all sizes, categories, subcategories, and locations for resolution
    const [sizes, categories, subcategories, locations] = await Promise.all([
      ctx.db
        .query("sizes")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
      ctx.db
        .query("menuProductCategories")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
      ctx.db
        .query("menuProductSubcategories")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
      ctx.db
        .query("restaurantLocations")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
    ])

    // Create lookup maps
    const sizeMap = new Map(sizes.map((size) => [size._id, size.name]))
    const categoryMap = new Map(categories.map((cat) => [cat._id, cat.name]))
    const subcategoryMap = new Map(
      subcategories.map((subcat) => [subcat._id, subcat.name])
    )
    const locationCodeMap = new Map(locations.map((loc) => [loc._id, loc.code]))
    const productMap = new Map(menuProducts.map((p) => [p._id, p.name]))

    // Get availability records to determine disabled locations
    const availabilityRecords = await ctx.db
      .query("menuProductAvailability")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Create disabled locations lookup map
    const disabledLocationsMap = new Map<string, string[]>()
    menuProducts.forEach((product) => {
      const disabledLocations: string[] = []
      availabilityRecords
        .filter(
          (record) => record.menuProductId === product._id && !record.available
        )
        .forEach((record) => {
          const locationCode = locationCodeMap.get(record.restaurantLocationId)
          if (locationCode) {
            disabledLocations.push(locationCode)
          }
        })
      disabledLocationsMap.set(product._id, disabledLocations)
    })

    // Group products by category
    const productsByCategory = new Map<string, any[]>()

    // Format products for export
    const formattedProducts = menuProducts.map((product) => {
      const categoryName =
        categoryMap.get(product.menuProductCategoryId) || "Unknown Category"
      const subcategoryName = product.menuProductSubcategoryId
        ? subcategoryMap.get(product.menuProductSubcategoryId) ||
          "Unknown Subcategory"
        : ""
      const sizeName = product.sizeId ? sizeMap.get(product.sizeId) || "" : ""

      // Format combinable_with
      const combinableWith =
        product.combinableWith
          ?.map((combination) => {
            const catName =
              categoryMap.get(combination.menuProductCategoryId) || "Unknown"

            // Format: Category[:Product][&Size]
            let comboStr = catName

            // Add Product if present
            if (combination.menuProductId) {
              const prodName = productMap.get(combination.menuProductId)
              if (prodName) {
                comboStr += `:${prodName}`
              }
            }

            // Add Size if present
            if (combination.sizeId) {
              const szName = sizeMap.get(combination.sizeId)
              if (szName) {
                comboStr += `&${szName}`
              }
            }

            return comboStr
          })
          .join(";") || ""

      const formattedProduct = {
        id_producto: product._id,
        nombre_producto: product.name,
        descripcion: product.description,
        instrucciones: product.instructions || "",
        categoria: categoryName,
        subcategoria: subcategoryName,
        tamaño: sizeName,
        precio: product.price.toString(),
        individual: product.standAlone ? "si" : "no",
        combinable_mitad: product.combinableHalf ? "si" : "no",
        cantidad_minima: product.minimumQuantity?.toString() || "",
        cantidad_maxima: product.maximumQuantity?.toString() || "",
        combinable_con: combinableWith,
        codigo_externo: product.externalCode || "",
        link_imagen: product.imageUrl || "",
        deshabilitar_en: disabledLocationsMap.get(product._id)?.join(";") || "",
      }

      // Group by category
      if (!productsByCategory.has(categoryName)) {
        productsByCategory.set(categoryName, [])
      }
      productsByCategory.get(categoryName)!.push(formattedProduct)

      return formattedProduct
    })

    // Create workbook
    const workbook = XLSX.utils.book_new()

    // Add "TODOS" sheet with all products
    const todosSheet = XLSX.utils.json_to_sheet(formattedProducts)
    XLSX.utils.book_append_sheet(workbook, todosSheet, "TODOS")

    // Add sheets for each category
    for (const [categoryName, products] of productsByCategory) {
      const categorySheet = XLSX.utils.json_to_sheet(products)
      // Sheet names must be <= 31 chars and can't contain certain chars
      const safeSheetName = categoryName
        .replace(/[:\\/?*[\]]/g, "")
        .substring(0, 31)
      XLSX.utils.book_append_sheet(workbook, categorySheet, safeSheetName)
    }

    // Generate XLSX as Uint8Array
    const uint8Array = XLSX.write(workbook, { type: "array", bookType: "xlsx" })

    // Convert to base64 for return
    const base64 = Buffer.from(uint8Array).toString("base64")

    return base64
  },
})
