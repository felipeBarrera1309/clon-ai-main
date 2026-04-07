import { ConvexError, v } from "convex/values"
import { components } from "../_generated/api"
import { mutation, query } from "../_generated/server"
import { authComponent } from "../auth"
import type { AuthContext } from "../lib/helpers"
import {
  assertOrganizationAccess,
  requirePlatformSuperAdmin,
} from "../lib/superAdmin"

/**
 * Super Admin Users Management
 * Functions for managing users across the platform
 */

// Helper to check if user is platform admin (admin or superadmin)
const requirePlatformAdmin = async (ctx: AuthContext) => {
  const user = await authComponent.getAuthUser(ctx)
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    throw new ConvexError("Platform admin access required")
  }
  return user
}

// Keep old name for backward compatibility
const requireSuperAdmin = requirePlatformAdmin

// Helper to check if user is platform admin or implementor
const requireAdminOrImplementor = async (ctx: AuthContext) => {
  const user = await authComponent.getAuthUser(ctx)
  if (
    !user ||
    (user.role !== "admin" &&
      user.role !== "superadmin" &&
      user.role !== "implementor")
  ) {
    throw new ConvexError("Admin or Implementor access required")
  }
  return user
}

// Helper to verify a target user is within the implementor's scope
// (shares an organization or was created by the implementor)
export async function assertUserInImplementorScope(
  ctx: AuthContext,
  implementorId: string,
  targetUserId: string
) {
  // An implementor always has access to their own data
  if (implementorId === targetUserId) return

  const orgIds = await ctx.runQuery(
    components.betterAuth.admin.getImplementorMemberOrgIds,
    { userId: implementorId }
  )
  const memberUserIds = await ctx.runQuery(
    components.betterAuth.admin.getMemberUserIdsForOrgs,
    { orgIds }
  )
  const createdUserIds = await ctx.runQuery(
    components.betterAuth.admin.getUsersCreatedBy,
    { adminUserId: implementorId }
  )
  const visibleUserIds = new Set([...memberUserIds, ...createdUserIds])

  if (!visibleUserIds.has(targetUserId)) {
    throw new ConvexError(
      "Access denied: User is outside your organization scope"
    )
  }
}

/**
 * List all users with pagination and filtering
 */
export const listUsers = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
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
        organizationCount: v.number(),
      })
    ),
    total: v.number(),
    hasMore: v.boolean(),
  }),
  async handler(ctx, args) {
    await requireSuperAdmin(ctx)

    const limit = Math.min(Math.max(1, args.limit ?? 25), 100)
    const offset = Math.max(0, args.offset ?? 0)

    const usersPage = await ctx.runQuery(
      components.betterAuth.authAdmin.listUsersForAdmin,
      {
        limit,
        offset,
        search: args.search,
        status: args.status,
        role: args.role,
      }
    )
    const paginatedUsers = usersPage.users

    // Get organization counts for each user
    const membershipCounts =
      paginatedUsers.length === 0
        ? []
        : await ctx.runQuery(
            components.betterAuth.organizations.getMembershipCountsForUsers,
            {
              userIds: paginatedUsers.map((user) => user._id),
            }
          )

    const membershipCountMap = new Map(
      membershipCounts.map(({ userId, count }) => [userId, count] as const)
    )

    const usersWithOrgCount = paginatedUsers.map((user) => ({
      ...user,
      organizationCount: membershipCountMap.get(user._id) ?? 0,
    }))

    return {
      users: usersWithOrgCount,
      total: usersPage.total,
      hasMore: usersPage.hasMore,
    }
  },
})

export const listUsersPage = query({
  args: {
    limit: v.optional(v.number()),
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
        organizationCount: v.number(),
      })
    ),
    continueCursor: v.optional(v.string()),
    isDone: v.boolean(),
  }),
  async handler(ctx, args) {
    await requireSuperAdmin(ctx)

    const limit = Math.min(Math.max(1, args.limit ?? 25), 100)

    const usersPage = await ctx.runQuery(
      components.betterAuth.authAdmin.listUsersPageForAdmin,
      {
        limit,
        cursor: args.cursor,
        search: args.search,
        status: args.status,
        role: args.role,
      }
    )

    const membershipCounts =
      usersPage.users.length === 0
        ? []
        : await ctx.runQuery(
            components.betterAuth.organizations.getMembershipCountsForUsers,
            {
              userIds: usersPage.users.map((user) => user._id),
            }
          )

    const membershipCountMap = new Map(
      membershipCounts.map(({ userId, count }) => [userId, count] as const)
    )

    return {
      users: usersPage.users.map((user) => ({
        ...user,
        organizationCount: membershipCountMap.get(user._id) ?? 0,
      })),
      continueCursor: usersPage.continueCursor,
      isDone: usersPage.isDone,
    }
  },
})

/**
 * List users scoped to the organizations where the current implementor is a member.
 * Returns same shape as listUsersPage for transparent frontend swapping.
 */
export const listImplementorUsers = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    search: v.optional(v.string()),
    role: v.optional(
      v.union(
        v.literal("superadmin"),
        v.literal("admin"),
        v.literal("user"),
        v.literal("implementor")
      )
    ),
    banned: v.optional(v.boolean()),
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
        organizationCount: v.number(),
      })
    ),
    total: v.number(),
    hasMore: v.boolean(),
  }),
  async handler(ctx, args) {
    const user = await requireAdminOrImplementor(ctx)
    if (user.role !== "implementor") {
      // Guard: this query must only be called for implementors;
      // admins/superadmins should use listUsersPage instead.
      throw new ConvexError("This query is only for implementors")
    }

    const limit = Math.min(Math.max(1, args.limit ?? 25), 100)
    const offset = Math.max(0, args.offset ?? 0)
    const searchLower = args.search?.toLowerCase()

    // Get org IDs where caller is a member
    const orgIds = await ctx.runQuery(
      components.betterAuth.admin.getImplementorMemberOrgIds,
      { userId: user._id.toString() }
    )

    // Get all member userIds across those orgs
    const memberUserIds = await ctx.runQuery(
      components.betterAuth.admin.getMemberUserIdsForOrgs,
      { orgIds }
    )

    // Get all users created by this implementor
    const createdUserIds = await ctx.runQuery(
      components.betterAuth.admin.getUsersCreatedBy,
      { adminUserId: user._id.toString() }
    )

    const visibleUserIds = new Set([...memberUserIds, ...createdUserIds])

    if (visibleUserIds.size === 0) {
      return { users: [], total: 0, hasMore: false }
    }

    // Fetch ONLY visible users details for all found userIds in parallel chunks of 500
    // Graceful degradation: Slice the set to 2000 instead of throwing a hard error
    // so the implementor can at least see the first 2000 users without the UI breaking.
    let userIdsArray = Array.from(visibleUserIds)
    if (userIdsArray.length > 2000) {
      userIdsArray = userIdsArray.slice(0, 2000)
    }
    const chunkPromises = []

    for (let i = 0; i < userIdsArray.length; i += 500) {
      const chunk = userIdsArray.slice(i, i + 500)
      chunkPromises.push(
        ctx.runQuery(components.betterAuth.authAdmin.getUsersBatch, {
          userIds: chunk,
        })
      )
    }

    const chunks = await Promise.all(chunkPromises)
    const allUsers = chunks.flat()

    let filtered = allUsers.filter((u) => {
      if (args.role) {
        const effectiveRole = u.role || "user"
        if (effectiveRole !== args.role) return false
      }

      if (args.banned !== undefined) {
        const isBanned = u.banned ?? false
        if (isBanned !== args.banned) return false
      }

      if (searchLower) {
        return (
          u.name.toLowerCase().includes(searchLower) ||
          u.email.toLowerCase().includes(searchLower)
        )
      }
      return true
    })

    filtered = filtered.sort((a, b) => b.createdAt - a.createdAt)
    const total = filtered.length
    const page = filtered.slice(offset, offset + limit)

    const membershipCounts =
      page.length === 0
        ? []
        : await ctx.runQuery(
            components.betterAuth.organizations.getMembershipCountsForUsers,
            { userIds: page.map((u) => u._id) }
          )
    const membershipCountMap = new Map(
      membershipCounts.map(({ userId, count }) => [userId, count] as const)
    )

    return {
      users: page.map((u) => ({
        ...u,
        organizationCount: membershipCountMap.get(u._id) ?? 0,
      })),
      total,
      hasMore: offset + limit < total,
    }
  },
})

/**
 * Get detailed user information
 */
export const getUserDetails = query({
  args: {
    userId: v.string(),
  },
  returns: v.object({
    user: v.object({
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
    }),
    organizations: v.array(
      v.object({
        _id: v.string(),
        name: v.string(),
        slug: v.string(),
        role: v.string(),
        joinedAt: v.number(),
        memberId: v.string(),
      })
    ),
    sessions: v.array(
      v.object({
        _id: v.string(),
        createdAt: v.number(),
        expiresAt: v.number(),
        ipAddress: v.optional(v.union(v.null(), v.string())),
        userAgent: v.optional(v.union(v.null(), v.string())),
      })
    ),
  }),
  async handler(ctx, args) {
    const adminUser = await requireAdminOrImplementor(ctx)

    if (adminUser.role === "implementor") {
      await assertUserInImplementorScope(
        ctx,
        adminUser._id.toString(),
        args.userId
      )
    }

    // Get user details from Better Auth admin functions
    const result = await ctx.runQuery(
      components.betterAuth.admin.getUserDetail,
      {
        adminUserId: adminUser._id.toString(),
        userId: args.userId,
      }
    )

    return result
  },
})

/**
 * Update user role
 */
export const updateUserRole = mutation({
  args: {
    userId: v.string(),
    role: v.union(
      v.literal("superadmin"),
      v.literal("admin"),
      v.literal("user"),
      v.literal("implementor"),
      v.null()
    ),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  async handler(ctx, args) {
    const adminUser = await requireAdminOrImplementor(ctx)

    if (adminUser.role === "implementor") {
      await assertUserInImplementorScope(
        ctx,
        adminUser._id.toString(),
        args.userId
      )
    }

    await ctx.runMutation(components.betterAuth.admin.updateUserRole, {
      adminUserId: adminUser._id.toString(),
      userId: args.userId,
      role: args.role,
    })

    return { success: true }
  },
})

/**
 * Ban or unban a user
 */
export const setUserBanStatus = mutation({
  args: {
    userId: v.string(),
    banned: v.boolean(),
    banReason: v.optional(v.string()),
    banExpires: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  async handler(ctx, args) {
    const adminUser = await requireAdminOrImplementor(ctx)

    if (adminUser.role === "implementor") {
      await assertUserInImplementorScope(
        ctx,
        adminUser._id.toString(),
        args.userId
      )
    }

    await ctx.runMutation(components.betterAuth.admin.setUserBanStatus, {
      adminUserId: adminUser._id.toString(),
      userId: args.userId,
      banned: args.banned,
      banReason: args.banReason,
      banExpires: args.banExpires,
    })

    return { success: true }
  },
})

/**
 * Add user to organization
 */
export const addUserToOrganization = mutation({
  args: {
    userId: v.string(),
    organizationId: v.string(),
    role: v.string(),
  },
  returns: v.object({
    memberId: v.string(),
  }),
  async handler(ctx, args) {
    const adminUser = await requireAdminOrImplementor(ctx)
    await assertOrganizationAccess(
      { ...ctx, user: adminUser },
      args.organizationId
    )

    // Ensure implementors can only add users that are already within their purview
    if (adminUser.role === "implementor") {
      await assertUserInImplementorScope(
        ctx,
        adminUser._id.toString(),
        args.userId
      )
    }

    const result = await ctx.runMutation(
      components.betterAuth.admin.addUserToOrganization,
      {
        adminUserId: adminUser._id.toString(),
        userId: args.userId,
        organizationId: args.organizationId,
        role: args.role,
      }
    )

    return result
  },
})

/**
 * Remove user from organization
 */
export const removeUserFromOrganization = mutation({
  args: {
    memberId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  async handler(ctx, args) {
    const adminUser = await requireAdminOrImplementor(ctx)

    // Verify implementor access to the member's organization
    const orgId = await ctx.runQuery(
      components.betterAuth.admin.getMemberOrganizationId,
      { memberId: args.memberId }
    )
    if (!orgId) throw new ConvexError("Member not found")
    await assertOrganizationAccess({ ...ctx, user: adminUser }, orgId)

    await ctx.runMutation(
      components.betterAuth.admin.removeMemberFromOrganization,
      {
        adminUserId: adminUser._id.toString(),
        memberId: args.memberId,
      }
    )

    return { success: true }
  },
})

/**
 * Delete user sessions (force logout)
 */
export const deleteUserSessions = mutation({
  args: {
    userId: v.string(),
  },
  returns: v.object({
    deletedCount: v.number(),
  }),
  async handler(ctx, args) {
    const adminUser = await requireAdminOrImplementor(ctx)

    if (adminUser.role === "implementor") {
      await assertUserInImplementorScope(
        ctx,
        adminUser._id.toString(),
        args.userId
      )
    }

    const deletedCount = await ctx.runMutation(
      components.betterAuth.admin.deleteUserSessions,
      {
        adminUserId: adminUser._id.toString(),
        userId: args.userId,
      }
    )

    return { deletedCount }
  },
})

/**
 * Delete a specific session
 */
export const deleteSession = mutation({
  args: {
    sessionId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  async handler(ctx, args) {
    const adminUser = await requireAdminOrImplementor(ctx)

    if (adminUser.role === "implementor") {
      const session = await ctx.runQuery(
        components.betterAuth.admin.getSessionById,
        { sessionId: args.sessionId }
      )
      if (!session) throw new ConvexError("Session not found")
      await assertUserInImplementorScope(
        ctx,
        adminUser._id.toString(),
        session.userId
      )
    }

    await ctx.runMutation(components.betterAuth.admin.deleteSession, {
      adminUserId: adminUser._id.toString(),
      sessionId: args.sessionId,
    })

    return { success: true }
  },
})

/**
 * Get all active sessions across all users
 */
export const listAllSessions = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  returns: v.object({
    sessions: v.array(
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
    total: v.number(),
    hasMore: v.boolean(),
  }),
  async handler(ctx, args) {
    await requireSuperAdmin(ctx)

    const limit = args.limit ?? 25
    const offset = args.offset ?? 0

    const allSessions = await ctx.runQuery(
      components.betterAuth.authAdmin.listAllSessions,
      {}
    )

    // Filter to only active sessions
    const activeSessions = allSessions.filter((s) => s.expiresAt > Date.now())
    const total = activeSessions.length
    const paginatedSessions = activeSessions.slice(offset, offset + limit)

    return {
      sessions: paginatedSessions,
      total,
      hasMore: offset + limit < total,
    }
  },
})

/**
 * Impersonate a user (create a session for admin to act as user)
 * Returns a token that can be used to authenticate as the user
 */
export const impersonateUser = mutation({
  args: {
    userId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  async handler(ctx, args) {
    await requireSuperAdmin(ctx)

    // For now, just return a message - actual impersonation requires
    // Better Auth client-side integration
    // This is a placeholder for the impersonation feature
    return {
      success: true,
      message: `Impersonation ready for user ${args.userId}. Use the Better Auth client to complete impersonation.`,
    }
  },
})

/**
 * Create a new user (admin only)
 */
export const createUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
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
    userId: v.string(),
  }),
  async handler(ctx, args) {
    const adminUser = await requireAdminOrImplementor(ctx)

    const result = await ctx.runMutation(
      components.betterAuth.admin.createUser,
      {
        adminUserId: adminUser._id.toString(),
        name: args.name,
        email: args.email,
        password: args.password,
        role: args.role,
      }
    )

    return result
  },
})

/**
 * Update member role in organization
 */
export const updateMemberRole = mutation({
  args: {
    memberId: v.string(),
    role: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  async handler(ctx, args) {
    const adminUser = await requireAdminOrImplementor(ctx)

    if (adminUser.role === "implementor") {
      const orgId = await ctx.runQuery(
        components.betterAuth.admin.getMemberOrganizationId,
        { memberId: args.memberId }
      )
      if (!orgId) throw new ConvexError("Member not found")
      await assertOrganizationAccess({ ...ctx, user: adminUser }, orgId)
    }

    await ctx.runMutation(components.betterAuth.admin.updateMemberRole, {
      adminUserId: adminUser._id.toString(),
      memberId: args.memberId,
      role: args.role,
    })

    return { success: true }
  },
})

/**
 * Change a user's password (admin only)
 * Invalidates all existing sessions after the change.
 */
export const changeUserPassword = mutation({
  args: {
    userId: v.string(),
    newPassword: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  async handler(ctx, args) {
    if (
      !args.newPassword ||
      args.newPassword.length < 8 ||
      args.newPassword.length > 1024
    ) {
      throw new ConvexError(
        "La contraseña debe tener entre 8 y 1024 caracteres"
      )
    }

    const adminUser = await requireAdminOrImplementor(ctx)

    if (adminUser.role === "implementor") {
      await assertUserInImplementorScope(
        ctx,
        adminUser._id.toString(),
        args.userId
      )
    }

    await ctx.runMutation(components.betterAuth.admin.changeUserPassword, {
      adminUserId: adminUser._id.toString(),
      userId: args.userId,
      newPassword: args.newPassword,
    })

    return { success: true }
  },
})

/**
 * Delete a user and all associated data (superadmin only).
 * Blocked if the user is the sole owner of any organization.
 */
export const deleteUser = mutation({
  args: {
    userId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    deletedSessions: v.number(),
    deletedAccounts: v.number(),
    deletedMemberships: v.number(),
  }),
  async handler(ctx, args) {
    const adminUser = await requirePlatformSuperAdmin(ctx)

    return await ctx.runMutation(components.betterAuth.admin.deleteUser, {
      adminUserId: adminUser._id.toString(),
      userId: args.userId,
    })
  },
})
