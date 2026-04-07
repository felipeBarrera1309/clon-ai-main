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
      .query("sizes")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .paginate(args.paginationOpts || { numItems: 20, cursor: null })
  },
})

export const create = authMutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate that the size name is not empty
    if (!args.name.trim()) {
      throw new BadRequestError("El nombre del tamaño no puede estar vacío")
    }

    // Check if size with this name already exists for this organization
    const existingSizes = await ctx.db
      .query("sizes")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const existingSize = existingSizes.find(
      (size) => size.name.toLowerCase() === args.name.trim().toLowerCase()
    )

    if (existingSize) {
      throw new BadRequestError("Ya existe un tamaño con este nombre")
    }

    return await ctx.db.insert("sizes", {
      name: args.name.trim(),
      organizationId: args.organizationId,
    })
  },
})

export const updateSize = authMutation({
  args: {
    organizationId: v.string(),
    id: v.id("sizes"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate that the size name is not empty
    if (!args.name.trim()) {
      throw new BadRequestError("El nombre del tamaño no puede estar vacío")
    }

    const size = await ctx.db.get(args.id)
    if (!size) {
      throw new BadRequestError("Tamaño no encontrado")
    }

    if (size.organizationId !== args.organizationId) {
      throw new UnauthorizedError("No estás autorizado para editar este tamaño")
    }

    // Check if another size with this name already exists for this organization
    const existingSizes = await ctx.db
      .query("sizes")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const existingSize = existingSizes.find(
      (s) =>
        s.name.toLowerCase() === args.name.trim().toLowerCase() &&
        s._id !== args.id
    )

    if (existingSize) {
      throw new BadRequestError("Ya existe un tamaño con este nombre")
    }

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
    })

    return args.id
  },
})

export const deleteSize = authMutation({
  args: { organizationId: v.string(), id: v.id("sizes") },
  handler: async (ctx, args) => {
    const size = await ctx.db.get(args.id)
    if (!size) {
      throw new BadRequestError("Tamaño no encontrado")
    }

    if (size.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para eliminar este tamaño"
      )
    }

    // Check if there are products using this size
    const productsUsingSize = await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("sizeId"), args.id))
      .take(1)

    if (productsUsingSize.length > 0) {
      throw new BadRequestError(
        "No se puede eliminar el tamaño porque tiene productos asociados"
      )
    }

    // For now, we'll skip the combinableWith check as it requires more complex querying
    // This can be implemented later with proper array filtering

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
        _id: v.id("sizes"),
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
    // Get sizes with pagination
    const sizesResult = await ctx.db
      .query("sizes")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .paginate(args.paginationOpts || { numItems: 20, cursor: null })

    // Get product counts for each size
    const sizesWithCounts = await Promise.all(
      sizesResult.page.map(async (size) => {
        const products = await ctx.db
          .query("menuProducts")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .filter((q) => q.eq(q.field("sizeId"), size._id))
          .collect()

        return {
          ...size,
          productCount: products.length,
        }
      })
    )

    return {
      ...sizesResult,
      page: sizesWithCounts,
    }
  },
})
