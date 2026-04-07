import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { BadRequestError, UnauthorizedError } from "../lib/errors"
import { authMutation, authQuery } from "../lib/helpers"

export const list = authQuery({
  args: {
    organizationId: v.string(),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("menuProductCategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .paginate(args.paginationOpts || { numItems: 20, cursor: null })
  },
})

export const listAll = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("menuProductCategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
  },
})

export const create = authMutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate that the category name is not empty
    if (!args.name.trim()) {
      throw new BadRequestError(
        "El nombre de la categoría no puede estar vacío"
      )
    }

    // Check if category with this name already exists for this organization
    const existingCategories = await ctx.db
      .query("menuProductCategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const existingCategory = existingCategories.find(
      (cat) => cat.name.toLowerCase() === args.name.trim().toLowerCase()
    )

    if (existingCategory) {
      throw new BadRequestError("Ya existe una categoría con este nombre")
    }

    return await ctx.db.insert("menuProductCategories", {
      name: args.name.trim(),
      organizationId: args.organizationId,
    })
  },
})

export const updateCategory = authMutation({
  args: {
    organizationId: v.string(),
    id: v.id("menuProductCategories"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate that the category name is not empty
    if (!args.name.trim()) {
      throw new BadRequestError(
        "El nombre de la categoría no puede estar vacío"
      )
    }

    const category = await ctx.db.get(args.id)
    if (!category) {
      throw new BadRequestError("Categoría no encontrada")
    }

    if (category.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para editar esta categoría"
      )
    }

    // Check if another category with this name already exists for this organization
    const existingCategories = await ctx.db
      .query("menuProductCategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const existingCategory = existingCategories.find(
      (cat) =>
        cat.name.toLowerCase() === args.name.trim().toLowerCase() &&
        cat._id !== args.id
    )

    if (existingCategory) {
      throw new BadRequestError("Ya existe una categoría con este nombre")
    }

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
    })

    return args.id
  },
})

export const deleteCategory = authMutation({
  args: { organizationId: v.string(), id: v.id("menuProductCategories") },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.id)
    if (!category) {
      throw new BadRequestError("Categoría no encontrada")
    }

    if (category.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para eliminar esta categoría"
      )
    }

    // Check if there are subcategories using this category
    const subcategoriesUsingCategory = await ctx.db
      .query("menuProductSubcategories")
      .withIndex("by_category", (q) => q.eq("menuProductCategoryId", args.id))
      .take(1)

    if (subcategoriesUsingCategory.length > 0) {
      throw new BadRequestError(
        "No se puede eliminar la categoría porque tiene subcategorías asociadas"
      )
    }

    // Check if there are products using this category
    const productsUsingCategory = await ctx.db
      .query("menuProducts")
      .withIndex("by_category", (q) => q.eq("menuProductCategoryId", args.id))
      .take(1)

    if (productsUsingCategory.length > 0) {
      throw new BadRequestError(
        "No se puede eliminar la categoría porque tiene productos asociados"
      )
    }

    await ctx.db.delete(args.id)
  },
})

export const listWithCounts = authQuery({
  args: {
    organizationId: v.string(),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("menuProductCategories"),
        _creationTime: v.number(),
        name: v.string(),
        organizationId: v.string(),
        productCount: v.number(),
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
    // Get categories with pagination
    const categoriesResult = await ctx.db
      .query("menuProductCategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .paginate(args.paginationOpts || { numItems: 20, cursor: null })

    // Get product counts for each category
    const categoriesWithCounts = await Promise.all(
      categoriesResult.page.map(async (category) => {
        const productCount = await ctx.db
          .query("menuProducts")
          .withIndex("by_category", (q) =>
            q.eq("menuProductCategoryId", category._id)
          )
          .collect()
          .then((products) => products.length)

        return {
          ...category,
          productCount,
        }
      })
    )

    return {
      ...categoriesResult,
      page: categoriesWithCounts,
    }
  },
})
