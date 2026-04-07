import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { BadRequestError, UnauthorizedError } from "../lib/errors"
import { authMutation, authQuery } from "../lib/helpers"

export const list = authQuery({
  args: {
    organizationId: v.string(),
    paginationOpts: v.optional(paginationOptsValidator),
    categoryId: v.optional(v.id("menuProductCategories")),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("menuProductSubcategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )

    // Filter by category if provided
    if (args.categoryId) {
      query = query.filter((q) =>
        q.eq(q.field("menuProductCategoryId"), args.categoryId)
      )
    }

    return await query.paginate(
      args.paginationOpts || { numItems: 20, cursor: null }
    )
  },
})

export const listAll = authQuery({
  args: {
    organizationId: v.string(),
    categoryId: v.optional(v.id("menuProductCategories")),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("menuProductSubcategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )

    // Filter by category if provided
    if (args.categoryId) {
      query = query.filter((q) =>
        q.eq(q.field("menuProductCategoryId"), args.categoryId)
      )
    }

    return await query.collect()
  },
})

export const listWithCounts = authQuery({
  args: {
    organizationId: v.string(),
    paginationOpts: v.optional(paginationOptsValidator),
    categoryId: v.optional(v.id("menuProductCategories")),
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("menuProductSubcategories"),
        _creationTime: v.number(),
        name: v.string(),
        organizationId: v.string(),
        menuProductCategoryId: v.id("menuProductCategories"),
        categoryName: v.string(),
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
    let query = ctx.db
      .query("menuProductSubcategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )

    // Filter by category if provided
    if (args.categoryId) {
      query = query.filter((q) =>
        q.eq(q.field("menuProductCategoryId"), args.categoryId)
      )
    }

    // Get subcategories with pagination
    const subcategoriesResult = await query.paginate(
      args.paginationOpts || { numItems: 20, cursor: null }
    )

    // Get categories for name resolution
    const categories = await ctx.db
      .query("menuProductCategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const categoryMap = new Map(categories.map((cat) => [cat._id, cat.name]))

    // Get product counts for each subcategory
    const subcategoriesWithCounts = await Promise.all(
      subcategoriesResult.page.map(async (subcategory) => {
        const productCount = await ctx.db
          .query("menuProducts")
          .withIndex("by_subcategory", (q) =>
            q.eq("menuProductSubcategoryId", subcategory._id)
          )
          .collect()
          .then((products) => products.length)

        return {
          ...subcategory,
          categoryName:
            categoryMap.get(subcategory.menuProductCategoryId) ||
            "Unknown Category",
          productCount,
        }
      })
    )

    return {
      ...subcategoriesResult,
      page: subcategoriesWithCounts,
    }
  },
})

export const create = authMutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
    menuProductCategoryId: v.id("menuProductCategories"),
  },
  handler: async (ctx, args) => {
    // Validate that the subcategory name is not empty
    if (!args.name.trim()) {
      throw new BadRequestError(
        "El nombre de la subcategoría no puede estar vacío"
      )
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

    // Check if subcategory with this name already exists for this category
    const existingSubcategories = await ctx.db
      .query("menuProductSubcategories")
      .withIndex("by_organization_and_category", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("menuProductCategoryId", args.menuProductCategoryId)
      )
      .collect()

    const existingSubcategory = existingSubcategories.find(
      (subcat) => subcat.name.toLowerCase() === args.name.trim().toLowerCase()
    )

    if (existingSubcategory) {
      throw new BadRequestError(
        "Ya existe una subcategoría con este nombre en esta categoría"
      )
    }

    return await ctx.db.insert("menuProductSubcategories", {
      name: args.name.trim(),
      organizationId: args.organizationId,
      menuProductCategoryId: args.menuProductCategoryId,
    })
  },
})

export const updateSubcategory = authMutation({
  args: {
    organizationId: v.string(),
    id: v.id("menuProductSubcategories"),
    name: v.string(),
    menuProductCategoryId: v.optional(v.id("menuProductCategories")),
  },
  handler: async (ctx, args) => {
    // Validate that the subcategory name is not empty
    if (!args.name.trim()) {
      throw new BadRequestError(
        "El nombre de la subcategoría no puede estar vacío"
      )
    }

    const subcategory = await ctx.db.get(args.id)
    if (!subcategory) {
      throw new BadRequestError("Subcategoría no encontrada")
    }

    if (subcategory.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para editar esta subcategoría"
      )
    }

    // If category is being changed, validate it
    const categoryId =
      args.menuProductCategoryId || subcategory.menuProductCategoryId
    const category = await ctx.db.get(categoryId)
    if (!category) {
      throw new BadRequestError("Categoría no encontrada")
    }
    if (category.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para usar esta categoría"
      )
    }

    // Check if another subcategory with this name already exists for this category
    const existingSubcategories = await ctx.db
      .query("menuProductSubcategories")
      .withIndex("by_organization_and_category", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("menuProductCategoryId", categoryId)
      )
      .collect()

    const existingSubcategory = existingSubcategories.find(
      (subcat) =>
        subcat.name.toLowerCase() === args.name.trim().toLowerCase() &&
        subcat._id !== args.id
    )

    if (existingSubcategory) {
      throw new BadRequestError(
        "Ya existe una subcategoría con este nombre en esta categoría"
      )
    }

    const updateData = {
      name: args.name.trim(),
      ...(args.menuProductCategoryId && {
        menuProductCategoryId: args.menuProductCategoryId,
      }),
    }

    await ctx.db.patch(args.id, updateData)

    return args.id
  },
})

export const deleteSubcategory = authMutation({
  args: { organizationId: v.string(), id: v.id("menuProductSubcategories") },
  handler: async (ctx, args) => {
    const subcategory = await ctx.db.get(args.id)
    if (!subcategory) {
      throw new BadRequestError("Subcategoría no encontrada")
    }

    if (subcategory.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para eliminar esta subcategoría"
      )
    }

    // Check if there are products using this subcategory
    const productsUsingSubcategory = await ctx.db
      .query("menuProducts")
      .withIndex("by_subcategory", (q) =>
        q.eq("menuProductSubcategoryId", args.id)
      )
      .take(1)

    if (productsUsingSubcategory.length > 0) {
      throw new BadRequestError(
        "No se puede eliminar la subcategoría porque tiene productos asociados"
      )
    }

    await ctx.db.delete(args.id)
  },
})

export const getByCategory = authQuery({
  args: {
    organizationId: v.string(),
    categoryId: v.id("menuProductCategories"),
  },
  handler: async (ctx, args) => {
    // Validate that the category exists and belongs to the organization
    const category = await ctx.db.get(args.categoryId)
    if (!category) {
      throw new BadRequestError("Categoría no encontrada")
    }
    if (category.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para acceder a esta categoría"
      )
    }

    return await ctx.db
      .query("menuProductSubcategories")
      .withIndex("by_organization_and_category", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("menuProductCategoryId", args.categoryId)
      )
      .collect()
  },
})
