import { ConvexError, v } from "convex/values"
import { paginator } from "convex-helpers/server/pagination"
import type { Doc } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import schema from "./schema"

/**
 * Auth admin functions for Better Auth component
 * These functions provide admin access to user data
 */

/**
 * List all users (for admin use)
 */
export const listAllUsers = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.string(),
      name: v.string(),
      email: v.string(),
      image: v.optional(v.union(v.null(), v.string())),
      role: v.optional(v.union(v.null(), v.string())),
      banned: v.optional(v.union(v.null(), v.boolean())),
      banReason: v.optional(v.union(v.null(), v.string())),
      banExpires: v.optional(v.union(v.null(), v.number())),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  async handler(ctx) {
    let cursor: string | null = null
    let hasMore = true
    const users: Doc<"user">[] = []

    while (hasMore) {
      const page = await paginator(ctx.db, schema).query("user").paginate({
        cursor,
        numItems: 500,
      })
      cursor = page.continueCursor
      hasMore = !page.isDone && page.continueCursor !== null
      users.push(...page.page)
    }

    return users.map((user) => ({
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }))
  },
})

/**
 * Get multiple users by their IDs
 */
export const getUsersBatch = query({
  args: {
    userIds: v.array(v.string()),
  },
  returns: v.array(
    v.object({
      _id: v.string(),
      name: v.string(),
      email: v.string(),
      image: v.optional(v.union(v.null(), v.string())),
      role: v.optional(v.union(v.null(), v.string())),
      banned: v.optional(v.union(v.null(), v.boolean())),
      banReason: v.optional(v.union(v.null(), v.string())),
      banExpires: v.optional(v.union(v.null(), v.number())),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    if (args.userIds.length > 500) {
      throw new ConvexError(
        "Demasiados IDs de usuario solicitados a la vez. Límite: 500"
      )
    }

    const users = await Promise.all(
      args.userIds.map(async (id) => {
        const normalizedId = ctx.db.normalizeId("user", id)
        if (!normalizedId) return null
        return await ctx.db.get(normalizedId)
      })
    )

    return users
      .filter((u): u is NonNullable<typeof u> => u !== null)
      .map((user) => ({
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }))
  },
})

export const listUsersForAdmin = query({
  args: {
    limit: v.number(),
    offset: v.number(),
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("banned"))),
    role: v.optional(
      v.union(
        v.literal("superadmin"),
        v.literal("admin"),
        v.literal("user"),
        v.literal("implementor")
      )
    ),
    skipTotal: v.optional(v.boolean()),
  },
  returns: v.object({
    users: v.array(
      v.object({
        _id: v.string(),
        name: v.string(),
        email: v.string(),
        image: v.optional(v.union(v.null(), v.string())),
        role: v.optional(v.union(v.null(), v.string())),
        banned: v.optional(v.union(v.null(), v.boolean())),
        banReason: v.optional(v.union(v.null(), v.string())),
        banExpires: v.optional(v.union(v.null(), v.number())),
        createdAt: v.number(),
        updatedAt: v.number(),
      })
    ),
    total: v.number(),
    hasMore: v.boolean(),
  }),
  async handler(ctx, args) {
    const searchLower = args.search?.toLowerCase().trim()
    const skipTotal = args.skipTotal === true
    const filteredUsers: Array<{
      _id: string
      name: string
      email: string
      image?: string | null
      role?: string | null
      banned?: boolean | null
      banReason?: string | null
      banExpires?: number | null
      createdAt: number
      updatedAt: number
    }> = []
    const targetUpperBound = args.offset + args.limit
    let matchedCount = 0
    let cursor: string | null = null
    let hasMore = true
    const batchSize = 500

    const matchesFilters = (user: {
      name: string
      email: string
      role?: string | null
      banned?: boolean | null
    }) => {
      if (searchLower) {
        const matchesSearch =
          user.name.toLowerCase().includes(searchLower) ||
          user.email.toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }

      if (args.status === "banned" && user.banned !== true) return false
      if (args.status === "active" && user.banned === true) return false

      if (args.role === "superadmin" && user.role !== "superadmin") return false
      if (args.role === "admin" && user.role !== "admin") return false
      if (args.role === "implementor" && user.role !== "implementor")
        return false
      if (
        args.role === "user" &&
        (user.role === "admin" ||
          user.role === "superadmin" ||
          user.role === "implementor")
      ) {
        return false
      }

      return true
    }

    while (hasMore) {
      if (
        skipTotal &&
        filteredUsers.length >= args.limit &&
        matchedCount >= targetUpperBound
      ) {
        break
      }

      const page = await paginator(ctx.db, schema)
        .query("user")
        .order("desc")
        .paginate({
          cursor,
          numItems: batchSize,
        })
      cursor = page.continueCursor
      hasMore = !page.isDone && page.continueCursor !== null

      for (const user of page.page) {
        if (!matchesFilters(user)) continue

        if (
          matchedCount >= args.offset &&
          matchedCount < targetUpperBound &&
          filteredUsers.length < args.limit
        ) {
          filteredUsers.push({
            _id: user._id.toString(),
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role,
            banned: user.banned,
            banReason: user.banReason,
            banExpires: user.banExpires,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          })
        }

        matchedCount += 1

        if (skipTotal && matchedCount > targetUpperBound) {
          break
        }
      }
    }

    if (skipTotal) {
      return {
        users: filteredUsers,
        total: -1,
        hasMore: matchedCount > targetUpperBound,
      }
    }

    return {
      users: filteredUsers,
      total: matchedCount,
      hasMore: args.offset + args.limit < matchedCount,
    }
  },
})

export const listUsersPageForAdmin = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.string()),
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("banned"))),
    role: v.optional(
      v.union(
        v.literal("superadmin"),
        v.literal("admin"),
        v.literal("user"),
        v.literal("implementor")
      )
    ),
  },
  returns: v.object({
    users: v.array(
      v.object({
        _id: v.string(),
        name: v.string(),
        email: v.string(),
        image: v.optional(v.union(v.null(), v.string())),
        role: v.optional(v.union(v.null(), v.string())),
        banned: v.optional(v.union(v.null(), v.boolean())),
        banReason: v.optional(v.union(v.null(), v.string())),
        banExpires: v.optional(v.union(v.null(), v.number())),
        createdAt: v.number(),
        updatedAt: v.number(),
      })
    ),
    continueCursor: v.optional(v.string()),
    isDone: v.boolean(),
  }),
  async handler(ctx, args) {
    const searchLower = args.search?.toLowerCase().trim()
    const filteredUsers: Array<{
      _id: string
      name: string
      email: string
      image?: string | null
      role?: string | null
      banned?: boolean | null
      banReason?: string | null
      banExpires?: number | null
      createdAt: number
      updatedAt: number
    }> = []
    let cursor: string | null = args.cursor ?? null
    let hasMore = true
    const batchSize = Math.max(args.limit * 2, 100)

    const matchesFilters = (user: {
      name: string
      email: string
      role?: string | null
      banned?: boolean | null
    }) => {
      if (searchLower) {
        const matchesSearch =
          user.name.toLowerCase().includes(searchLower) ||
          user.email.toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }

      if (args.status === "banned" && user.banned !== true) return false
      if (args.status === "active" && user.banned === true) return false

      if (args.role === "superadmin" && user.role !== "superadmin") return false
      if (args.role === "admin" && user.role !== "admin") return false
      if (args.role === "implementor" && user.role !== "implementor")
        return false
      if (
        args.role === "user" &&
        (user.role === "admin" ||
          user.role === "superadmin" ||
          user.role === "implementor")
      ) {
        return false
      }

      return true
    }

    while (hasMore && filteredUsers.length < args.limit) {
      const page = await paginator(ctx.db, schema)
        .query("user")
        .order("desc")
        .paginate({
          cursor,
          numItems: batchSize,
        })
      cursor = page.continueCursor
      hasMore = !page.isDone && page.continueCursor !== null

      for (const user of page.page) {
        if (filteredUsers.length >= args.limit) break
        if (!matchesFilters(user)) continue
        filteredUsers.push({
          _id: user._id.toString(),
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          banned: user.banned,
          banReason: user.banReason,
          banExpires: user.banExpires,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })
      }
    }

    return {
      users: filteredUsers,
      continueCursor: hasMore ? (cursor ?? undefined) : undefined,
      isDone: !hasMore,
    }
  },
})

/**
 * Delete all sessions for a user
 */
export const deleteUserSessions = mutation({
  args: { userId: v.string() },
  returns: v.number(),
  async handler(ctx, args) {
    const sessions = await ctx.db
      .query("session")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect()

    for (const session of sessions) {
      await ctx.db.delete(session._id)
    }

    return sessions.length
  },
})

/**
 * List all active sessions with user info
 */
export const listAllSessions = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.string(),
      userId: v.string(),
      createdAt: v.number(),
      expiresAt: v.number(),
      ipAddress: v.optional(v.union(v.null(), v.string())),
      userAgent: v.optional(v.union(v.null(), v.string())),
      user: v.optional(
        v.object({
          _id: v.string(),
          name: v.string(),
          email: v.string(),
          image: v.optional(v.union(v.null(), v.string())),
        })
      ),
    })
  ),
  async handler(ctx) {
    let cursor: string | null = null
    let hasMore = true
    const sessions: Doc<"session">[] = []

    while (hasMore) {
      const page = await paginator(ctx.db, schema).query("session").paginate({
        cursor,
        numItems: 500,
      })
      cursor = page.continueCursor
      hasMore = !page.isDone && page.continueCursor !== null
      sessions.push(...page.page)
    }

    const sessionsWithUsers = await Promise.all(
      sessions.map(async (session) => {
        const userId = ctx.db.normalizeId("user", session.userId)
        const user = userId ? await ctx.db.get(userId) : null

        return {
          _id: session._id.toString(),
          userId: session.userId,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          user: user
            ? {
                _id: user._id.toString(),
                name: user.name,
                email: user.email,
                image: user.image,
              }
            : undefined,
        }
      })
    )

    return sessionsWithUsers
  },
})

/**
 * Delete a specific session
 */
export const deleteSession = mutation({
  args: { sessionId: v.string() },
  returns: v.object({ success: v.boolean() }),
  async handler(ctx, args) {
    const sessionId = ctx.db.normalizeId("session", args.sessionId)
    if (!sessionId) {
      return { success: false }
    }

    const session = await ctx.db.get(sessionId)

    if (!session) {
      return { success: false }
    }

    await ctx.db.delete(sessionId)
    return { success: true }
  },
})
