import { v } from "convex/values"
import type { Id } from "../_generated/dataModel"
import { authMutation, authQuery } from "../lib/helpers"

// Get all quick responses for an organization
export const list = authQuery({
  args: {
    organizationId: v.string(),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const isActive = !args.includeInactive

    const responses = await ctx.db
      .query("quickResponses")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("isActive"), isActive))
      .collect()

    // Sort by usage count (most used first), then by title
    return responses.sort((a, b) => {
      if (a.usageCount !== b.usageCount) {
        return b.usageCount - a.usageCount
      }
      return a.title.localeCompare(b.title)
    })
  },
})

// Get a single quick response by ID
export const getOne = authQuery({
  args: {
    organizationId: v.string(),
    quickResponseId: v.id("quickResponses"),
  },
  handler: async (ctx, args) => {
    const response = await ctx.db.get(args.quickResponseId)
    if (!response || response.organizationId !== args.organizationId) {
      throw new Error("Respuesta rápida no encontrada")
    }

    return response
  },
})

// Create a new quick response
export const create = authMutation({
  args: {
    organizationId: v.string(),
    title: v.string(),
    content: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate title uniqueness within organization
    const existing = await ctx.db
      .query("quickResponses")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("title"), args.title))
      .first()

    if (existing) {
      throw new Error("Ya existe una respuesta rápida con este título")
    }

    const quickResponseId = await ctx.db.insert("quickResponses", {
      organizationId: args.organizationId,
      title: args.title,
      content: args.content,
      category: args.category,
      isActive: true,
      usageCount: 0,
    })

    return quickResponseId
  },
})

// Update an existing quick response
export const update = authMutation({
  args: {
    organizationId: v.string(),
    quickResponseId: v.id("quickResponses"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    category: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.quickResponseId)
    if (!existing || existing.organizationId !== args.organizationId) {
      throw new Error("Respuesta rápida no encontrada")
    }

    // If title is being updated, check for uniqueness
    if (args.title && args.title !== existing.title) {
      const duplicate = await ctx.db
        .query("quickResponses")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .filter((q) => q.eq(q.field("title"), args.title))
        .first()

      if (duplicate) {
        throw new Error("Ya existe una respuesta rápida con este título")
      }
    }

    await ctx.db.patch(args.quickResponseId, {
      ...(args.title !== undefined && { title: args.title }),
      ...(args.content !== undefined && { content: args.content }),
      ...(args.category !== undefined && { category: args.category }),
      ...(args.isActive !== undefined && { isActive: args.isActive }),
    })

    return args.quickResponseId
  },
})

// Delete a quick response
export const remove = authMutation({
  args: {
    organizationId: v.string(),
    quickResponseId: v.id("quickResponses"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.quickResponseId)
    if (!existing || existing.organizationId !== args.organizationId) {
      throw new Error("Respuesta rápida no encontrada")
    }

    await ctx.db.delete(args.quickResponseId)

    return args.quickResponseId
  },
})

// Increment usage count when a quick response is used
export const incrementUsage = authMutation({
  args: {
    organizationId: v.string(),
    quickResponseId: v.id("quickResponses"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.quickResponseId)
    if (!existing || existing.organizationId !== args.organizationId) {
      throw new Error("Respuesta rápida no encontrada")
    }

    await ctx.db.patch(args.quickResponseId, {
      usageCount: existing.usageCount + 1,
      lastUsedAt: Date.now(),
    })

    return args.quickResponseId
  },
})

// Search quick responses by title
export const search = authQuery({
  args: {
    organizationId: v.string(),
    query: v.string(),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!args.query.trim()) {
      return []
    }

    const results = await ctx.db
      .query("quickResponses")
      .withSearchIndex("search_title", (q) =>
        q.search("title", args.query).eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("isActive"), !args.includeInactive))
      .take(10)

    return results
  },
})

// Get categories for quick responses
export const getCategories = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const responses = await ctx.db
      .query("quickResponses")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Extract unique categories
    const categories = [
      ...new Set(
        responses.map((r) => r.category).filter((c): c is string => c != null)
      ),
    ]
    return categories.sort()
  },
})
