import { scryptAsync } from "@noble/hashes/scrypt.js"
import { ConvexError, v } from "convex/values"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"

/**
 * Admin functions for Better Auth component
 * These functions directly access Better Auth tables
 * Called from outside the component via ctx.runQuery/ctx.runMutation
 */

/**
 * Check if a user is an admin by userId
 */
const getUserRole = async (
  ctx: QueryCtx | MutationCtx,
  userId: string
): Promise<string | null | undefined> => {
  const user = await ctx.db
    .query("user")
    .filter((q) => q.eq(q.field("_id"), userId))
    .first()
  return user?.role
}

const requireAdmin = async (
  ctx: QueryCtx | MutationCtx,
  userId: string
): Promise<string> => {
  const role = await getUserRole(ctx, userId)
  // Admin, superadmin, and implementor can perform admin operations
  if (role !== "admin" && role !== "superadmin" && role !== "implementor") {
    throw new ConvexError("Admin access required")
  }
  return role as string
}

/**
 * Get all users with pagination
 */
export const listUsers = query({
  args: {
    adminUserId: v.string(),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
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
        createdAt: v.number(),
        updatedAt: v.number(),
      })
    ),
    total: v.number(),
  }),
  async handler(ctx, args) {
    await requireAdmin(ctx, args.adminUserId)

    const limit = args.limit ?? 50
    const offset = args.offset ?? 0

    const allUsers = await ctx.db.query("user").collect()
    const total = allUsers.length

    const users = allUsers.slice(offset, offset + limit).map((user) => ({
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }))

    return { users, total }
  },
})

/**
 * Get detailed user information
 */
export const getUserDetail = query({
  args: {
    adminUserId: v.string(),
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
    await requireAdmin(ctx, args.adminUserId)

    const user = await ctx.db
      .query("user")
      .filter((q) => q.eq(q.field("_id"), args.userId))
      .first()

    if (!user) {
      throw new ConvexError("User not found")
    }

    const memberships = await ctx.db
      .query("member")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect()

    const organizations = await Promise.all(
      memberships.map(async (membership) => {
        const org = await ctx.db
          .query("organization")
          .filter((q) => q.eq(q.field("_id"), membership.organizationId))
          .first()

        return org
          ? {
              _id: org._id.toString(),
              name: org.name,
              slug: org.slug,
              role: membership.role,
              joinedAt: membership.createdAt,
              memberId: membership._id.toString(),
            }
          : null
      })
    )

    const sessions = await ctx.db
      .query("session")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.gt(q.field("expiresAt"), Date.now()))
      .collect()

    return {
      user: {
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
      },
      organizations: organizations.filter(
        (org): org is NonNullable<typeof org> => org !== null
      ),
      sessions: sessions.map((session) => ({
        _id: session._id.toString(),
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })),
    }
  },
})

/**
 * Get the organization ID for a given invitation ID.
 */
export const getInvitationOrganizationId = query({
  args: { invitationId: v.string() },
  returns: v.union(v.string(), v.null()),
  async handler(ctx, args) {
    const id = ctx.db.normalizeId("invitation", args.invitationId)
    if (!id) return null

    const invitation = await ctx.db.get(id)
    return invitation?.organizationId ?? null
  },
})

/**
 * Get all organizations with member counts
 */
export const listOrganizations = query({
  args: {
    adminUserId: v.string(),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  returns: v.object({
    organizations: v.array(
      v.object({
        _id: v.string(),
        name: v.string(),
        slug: v.string(),
        logo: v.optional(v.union(v.null(), v.string())),
        createdAt: v.number(),
        memberCount: v.number(),
      })
    ),
    total: v.number(),
  }),
  async handler(ctx, args) {
    await requireAdmin(ctx, args.adminUserId)

    const limit = args.limit ?? 50
    const offset = args.offset ?? 0

    const allOrgs = await ctx.db.query("organization").collect()
    const total = allOrgs.length

    const orgsPage = allOrgs.slice(offset, offset + limit)

    const organizations = await Promise.all(
      orgsPage.map(async (org) => {
        const members = await ctx.db
          .query("member")
          .withIndex("organizationId", (q) =>
            q.eq("organizationId", org._id.toString())
          )
          .collect()

        return {
          _id: org._id.toString(),
          name: org.name,
          slug: org.slug,
          logo: org.logo,
          createdAt: org.createdAt,
          memberCount: members.length,
        }
      })
    )

    return { organizations, total }
  },
})

/**
 * Create a new organization
 */
export const createOrganization = mutation({
  args: {
    adminUserId: v.string(),
    name: v.string(),
    slug: v.string(),
    logo: v.optional(v.string()),
    ownerId: v.string(),
  },
  returns: v.object({
    organizationId: v.string(),
  }),
  async handler(ctx, args) {
    const callerRole = await requireAdmin(ctx, args.adminUserId)

    const existingOrg = await ctx.db
      .query("organization")
      .withIndex("slug", (q) => q.eq("slug", args.slug))
      .first()

    if (existingOrg) {
      throw new ConvexError("Organization slug already in use")
    }

    const now = Date.now()

    const orgId = await ctx.db.insert("organization", {
      name: args.name,
      slug: args.slug,
      logo: args.logo,
      createdAt: now,
    })

    await ctx.db.insert("member", {
      organizationId: orgId.toString(),
      userId: args.ownerId,
      role: "owner",
      createdAt: now,
    })

    // If caller is an implementor and they are not the owner, add them as an admin so they can manage it
    if (callerRole === "implementor" && args.adminUserId !== args.ownerId) {
      await ctx.db.insert("member", {
        organizationId: orgId.toString(),
        userId: args.adminUserId,
        role: "admin",
        createdAt: now,
      })
    }

    return { organizationId: orgId.toString() }
  },
})

/**
 * Add user directly to organization (admin only)
 * This bypasses the invitation system and adds the user immediately
 */
export const addUserToOrganization = mutation({
  args: {
    adminUserId: v.string(),
    userId: v.string(),
    organizationId: v.string(),
    role: v.string(), // "owner" | "admin" | "member"
  },
  returns: v.object({
    memberId: v.string(),
  }),
  async handler(ctx, args) {
    await requireAdmin(ctx, args.adminUserId)

    // Verify user exists (O(1) index lookup)
    const normalizedUserId = ctx.db.normalizeId("user", args.userId)
    if (!normalizedUserId) throw new ConvexError("User not found")
    const user = await ctx.db.get(normalizedUserId)

    if (!user) {
      throw new ConvexError("User not found")
    }

    // Verify organization exists (O(1) index lookup)
    const normalizedOrgId = ctx.db.normalizeId(
      "organization",
      args.organizationId
    )
    if (!normalizedOrgId) throw new ConvexError("Organization not found")
    const org = await ctx.db.get(normalizedOrgId)

    if (!org) {
      throw new ConvexError("Organization not found")
    }

    // Check if user is already a member using compound index
    const existingMembership = await ctx.db
      .query("member")
      .withIndex("organizationId_userId", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first()

    if (existingMembership) {
      throw new ConvexError("User is already a member of this organization")
    }

    // Add user as member
    const memberId = await ctx.db.insert("member", {
      organizationId: args.organizationId,
      userId: args.userId,
      role: args.role,
      createdAt: Date.now(),
    })

    return { memberId: memberId.toString() }
  },
})

/**
 * Update user role (admin only)
 * Supports: "superadmin" (highest), "admin", "user", or null
 */
export const updateUserRole = mutation({
  args: {
    adminUserId: v.string(),
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
    const callerRole = await requireAdmin(ctx, args.adminUserId)

    if (callerRole === "implementor") {
      if (args.role !== "user" && args.role !== null) {
        throw new ConvexError("Implementors can only assign the 'user' role")
      }
      const targetRole = await getUserRole(ctx, args.userId)
      if (
        targetRole === "admin" ||
        targetRole === "superadmin" ||
        targetRole === "implementor"
      ) {
        throw new ConvexError(
          "Implementors cannot modify users of equal or higher rank"
        )
      }
    }

    if (callerRole === "admin") {
      if (
        args.role === "superadmin" ||
        args.role === "admin" ||
        args.role === "implementor"
      ) {
        throw new ConvexError(
          "Admins cannot assign the 'admin', 'superadmin', or 'implementor' role"
        )
      }
      const targetRole = await getUserRole(ctx, args.userId)
      if (
        targetRole === "superadmin" ||
        targetRole === "implementor" ||
        (targetRole === "admin" && args.adminUserId !== args.userId)
      ) {
        throw new ConvexError(
          "Admins cannot modify users of equal or higher rank"
        )
      }
    }

    // Find the user (O(1) index lookup)
    const normalizedUserId = ctx.db.normalizeId("user", args.userId)
    if (!normalizedUserId) throw new ConvexError("User not found")

    const user = await ctx.db.get(normalizedUserId)

    if (!user) {
      throw new ConvexError("User not found")
    }

    // Update the user role
    await ctx.db.patch(user._id, {
      role: args.role,
      updatedAt: Date.now(),
    })

    return { success: true }
  },
})

/**
 * Ban/unban user (admin only)
 */
export const setUserBanStatus = mutation({
  args: {
    adminUserId: v.string(),
    userId: v.string(),
    banned: v.boolean(),
    banReason: v.optional(v.string()),
    banExpires: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  async handler(ctx, args) {
    const callerRole = await requireAdmin(ctx, args.adminUserId)

    if (callerRole === "implementor") {
      const targetRole = await getUserRole(ctx, args.userId)
      if (
        targetRole === "admin" ||
        targetRole === "superadmin" ||
        targetRole === "implementor"
      ) {
        throw new ConvexError(
          "Implementors cannot modify users of equal or higher rank"
        )
      }
    }

    if (callerRole === "admin") {
      const targetRole = await getUserRole(ctx, args.userId)
      if (
        targetRole === "superadmin" ||
        targetRole === "implementor" ||
        (targetRole === "admin" && args.adminUserId !== args.userId)
      ) {
        throw new ConvexError(
          "Admins cannot modify users of equal or higher rank"
        )
      }
    }

    // Find the user (O(1) index lookup)
    const normalizedUserId = ctx.db.normalizeId("user", args.userId)
    if (!normalizedUserId) throw new ConvexError("User not found")

    const user = await ctx.db.get(normalizedUserId)

    if (!user) {
      throw new ConvexError("User not found")
    }

    // Update the user ban status
    await ctx.db.patch(user._id, {
      banned: args.banned,
      banReason: args.banned ? args.banReason : null,
      banExpires: args.banned ? args.banExpires : null,
      updatedAt: Date.now(),
    })

    return { success: true }
  },
})

/**
 * Cancel/delete an invitation (admin only)
 */
export const cancelInvitation = mutation({
  args: {
    adminUserId: v.string(),
    invitationId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  async handler(ctx, args) {
    await requireAdmin(ctx, args.adminUserId)

    // Find the invitation (O(1) index lookup)
    const normalizedInvId = ctx.db.normalizeId("invitation", args.invitationId)
    if (!normalizedInvId) throw new ConvexError("Invitation not found")

    const invitation = await ctx.db.get(normalizedInvId)

    if (!invitation) {
      throw new ConvexError("Invitation not found")
    }

    // Delete the invitation
    await ctx.db.delete(invitation._id)

    return { success: true }
  },
})

/**
 * Delete all sessions for a user (force logout)
 */
export const deleteUserSessions = mutation({
  args: {
    adminUserId: v.string(),
    userId: v.string(),
  },
  returns: v.number(),
  async handler(ctx, args) {
    const callerRole = await requireAdmin(ctx, args.adminUserId)

    if (callerRole === "implementor") {
      const targetRole = await getUserRole(ctx, args.userId)
      if (
        targetRole === "admin" ||
        targetRole === "superadmin" ||
        targetRole === "implementor"
      ) {
        throw new ConvexError(
          "Implementors cannot modify users of equal or higher rank"
        )
      }
    }

    if (callerRole === "admin") {
      const targetRole = await getUserRole(ctx, args.userId)
      if (
        targetRole === "superadmin" ||
        targetRole === "implementor" ||
        (targetRole === "admin" && args.adminUserId !== args.userId)
      ) {
        throw new ConvexError(
          "Admins cannot modify users of equal or higher rank"
        )
      }
    }

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
 * Remove a member from an organization
 */
export const removeMemberFromOrganization = mutation({
  args: {
    adminUserId: v.string(),
    memberId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  async handler(ctx, args) {
    await requireAdmin(ctx, args.adminUserId)

    const memberId = ctx.db.normalizeId("member", args.memberId)
    if (!memberId) throw new ConvexError("Invalid member ID format")

    const member = await ctx.db.get(memberId)

    if (!member) {
      throw new ConvexError("Member not found")
    }

    if (member.role === "owner") {
      const otherOwners = await ctx.db
        .query("member")
        .withIndex("organizationId", (q) =>
          q.eq("organizationId", member.organizationId)
        )
        .filter((q) => q.eq(q.field("role"), "owner"))
        .filter((q) => q.neq(q.field("_id"), member._id))
        .first()

      if (!otherOwners) {
        throw new ConvexError(
          "No se puede eliminar al último propietario de la organización"
        )
      }
    }

    await ctx.db.delete(member._id)

    return { success: true }
  },
})

/**
 * Delete a specific session (admin only)
 */
export const deleteSession = mutation({
  args: {
    adminUserId: v.string(),
    sessionId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  async handler(ctx, args) {
    const callerRole = await requireAdmin(ctx, args.adminUserId)

    const normalizedId = ctx.db.normalizeId("session", args.sessionId)
    if (!normalizedId) throw new ConvexError("Invalid session ID format")

    const session = await ctx.db.get(normalizedId)

    if (!session) {
      throw new ConvexError("Session not found")
    }

    // Enforce the same rank ceiling as deleteUserSessions
    if (callerRole === "implementor") {
      const targetRole = await getUserRole(ctx, session.userId)
      if (
        targetRole === "admin" ||
        targetRole === "superadmin" ||
        targetRole === "implementor"
      ) {
        throw new ConvexError(
          "Implementors cannot modify users of equal or higher rank"
        )
      }
    }

    if (callerRole === "admin") {
      const targetRole = await getUserRole(ctx, session.userId)
      if (
        targetRole === "superadmin" ||
        targetRole === "implementor" ||
        (targetRole === "admin" && args.adminUserId !== session.userId)
      ) {
        throw new ConvexError(
          "Admins cannot modify users of equal or higher rank"
        )
      }
    }

    await ctx.db.delete(session._id)

    return { success: true }
  },
})

/**
 * Create a new user (admin only)
 * Creates a user with email/password authentication
 */
export const createUser = mutation({
  args: {
    adminUserId: v.string(),
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
    const callerRole = await requireAdmin(ctx, args.adminUserId)

    if (callerRole === "implementor") {
      if (args.role && args.role !== "user") {
        throw new ConvexError(
          "Implementors can only create users with the 'user' role"
        )
      }
    }

    if (callerRole === "admin") {
      if (
        args.role === "admin" ||
        args.role === "superadmin" ||
        args.role === "implementor"
      ) {
        throw new ConvexError(
          "Admins cannot create users with the 'admin', 'superadmin', or 'implementor' role"
        )
      }
    }

    // Normalize email — Better Auth lowercases on sign-in, so we must store lowercase too
    const normalizedEmail = args.email.toLowerCase().trim()

    // Check if email already exists
    const existingUser = await ctx.db
      .query("user")
      .withIndex("email_name", (q) => q.eq("email", normalizedEmail))
      .first()

    if (existingUser) {
      throw new ConvexError("A user with this email already exists")
    }

    const now = Date.now()

    // Create the user
    const userId = await ctx.db.insert("user", {
      name: args.name,
      email: normalizedEmail,
      emailVerified: true, // Admin-created users are pre-verified
      role: args.role ?? null,
      createdBy: args.adminUserId,
      createdAt: now,
      updatedAt: now,
    })

    const hashedPassword = await hashPassword(args.password)

    // For credential accounts, accountId must be the normalized email
    // (Better Auth's convention — it uses email as the accountId for email+password auth)
    await ctx.db.insert("account", {
      userId: userId.toString(),
      accountId: normalizedEmail,
      providerId: "credential",
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    })

    return { userId: userId.toString() }
  },
})

// Scrypt parameters matching Better Auth's defaults exactly.
// Format: `${salt_hex}:${key_hex}` — verified by Better Auth's verifyPassword.
const SCRYPT_CONFIG = { N: 16384, r: 16, p: 1, dkLen: 64 } as const

async function hashPassword(password: string): Promise<string> {
  // 16-byte random salt, hex-encoded
  const saltBytes = crypto.getRandomValues(new Uint8Array(16))
  const salt = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  const key = (await scryptAsync(password.normalize("NFKC"), salt, {
    N: SCRYPT_CONFIG.N,
    r: SCRYPT_CONFIG.r,
    p: SCRYPT_CONFIG.p,
    dkLen: SCRYPT_CONFIG.dkLen,
    maxmem: 128 * SCRYPT_CONFIG.N * SCRYPT_CONFIG.r * 2,
  })) as Uint8Array

  const keyHex = Array.from(key)
    .map((b: number) => b.toString(16).padStart(2, "0"))
    .join("")

  return `${salt}:${keyHex}`
}

/**
 * Change a user's password (admin only)
 * Also invalidates all existing sessions so user must log in again.
 */
export const changeUserPassword = mutation({
  args: {
    adminUserId: v.string(),
    userId: v.string(),
    newPassword: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  async handler(ctx, args) {
    const callerRole = await requireAdmin(ctx, args.adminUserId)

    if (callerRole === "implementor") {
      const targetRole = await getUserRole(ctx, args.userId)
      if (
        targetRole === "admin" ||
        targetRole === "superadmin" ||
        targetRole === "implementor"
      ) {
        throw new ConvexError(
          "Implementors cannot modify users of equal or higher rank"
        )
      }
    }

    if (callerRole === "admin") {
      const targetRole = await getUserRole(ctx, args.userId)
      if (
        targetRole === "superadmin" ||
        targetRole === "implementor" ||
        (targetRole === "admin" && args.adminUserId !== args.userId)
      ) {
        throw new ConvexError(
          "Admins cannot modify users of equal or higher rank"
        )
      }
    }

    const normalizedUserId = ctx.db.normalizeId("user", args.userId)
    if (!normalizedUserId) throw new ConvexError("User not found")

    const user = await ctx.db.get(normalizedUserId)
    if (!user) throw new ConvexError("User not found")

    const hashedPassword = await hashPassword(args.newPassword)

    const account = await ctx.db
      .query("account")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("providerId"), "credential"))
      .first()

    if (account) {
      await ctx.db.patch(account._id, {
        password: hashedPassword,
        updatedAt: Date.now(),
      })
    } else {
      await ctx.db.insert("account", {
        userId: args.userId,
        accountId: user.email.toLowerCase(),
        providerId: "credential",
        password: hashedPassword,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }

    // Invalidate all sessions so the user must re-login with the new password
    const sessions = await ctx.db
      .query("session")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect()
    for (const session of sessions) {
      await ctx.db.delete(session._id)
    }

    return { success: true }
  },
})

/**
 * Update member role in organization (admin only)
 */
export const updateMemberRole = mutation({
  args: {
    adminUserId: v.string(),
    memberId: v.string(),
    role: v.string(), // "owner" | "admin" | "member"
  },
  returns: v.object({
    success: v.boolean(),
  }),
  async handler(ctx, args) {
    await requireAdmin(ctx, args.adminUserId)

    const memberId = ctx.db.normalizeId("member", args.memberId)
    if (!memberId) throw new ConvexError("Invalid member ID format")

    const member = await ctx.db.get(memberId)

    if (!member) {
      throw new ConvexError("Member not found")
    }

    if (member.role === "owner" && args.role !== "owner") {
      const otherOwners = await ctx.db
        .query("member")
        .withIndex("organizationId", (q) =>
          q.eq("organizationId", member.organizationId)
        )
        .filter((q) => q.eq(q.field("role"), "owner"))
        .filter((q) => q.neq(q.field("_id"), member._id))
        .first()

      if (!otherOwners) {
        throw new ConvexError(
          "No se puede cambiar el rol del último propietario de la organización"
        )
      }
    }

    await ctx.db.patch(member._id, {
      role: args.role,
    })

    return { success: true }
  },
})

/**
 * Get user by clerkId
 */
export const getUserByClerkId = query({
  args: {
    adminUserId: v.string(),
    clerkId: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.string(),
      name: v.string(),
      email: v.string(),
      clerkId: v.optional(v.union(v.null(), v.string())),
    }),
    v.null()
  ),
  async handler(ctx, args) {
    await requireAdmin(ctx, args.adminUserId)

    const user = await ctx.db
      .query("user")
      .withIndex("clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first()

    if (!user) return null

    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      clerkId: user.clerkId,
    }
  },
})

/**
 * Get the organization ID for a given member ID.
 */
export const getMemberOrganizationId = query({
  args: { memberId: v.string() },
  returns: v.union(v.string(), v.null()),
  async handler(ctx, args) {
    const id = ctx.db.normalizeId("member", args.memberId)
    if (!id) return null

    const member = await ctx.db.get(id)
    return member?.organizationId ?? null
  },
})

/**
 * Get organization by clerkId
 */
export const getOrganizationByClerkId = query({
  args: {
    adminUserId: v.string(),
    clerkId: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.string(),
      name: v.string(),
      slug: v.string(),
      clerkId: v.optional(v.union(v.null(), v.string())),
    }),
    v.null()
  ),
  async handler(ctx, args) {
    await requireAdmin(ctx, args.adminUserId)

    const org = await ctx.db
      .query("organization")
      .withIndex("clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first()

    if (!org) return null

    return {
      _id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      clerkId: org.clerkId,
    }
  },
})

/**
 * List all organizations with clerkId field
 */
export const listOrganizationsWithClerkId = query({
  args: {
    adminUserId: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.string(),
      name: v.string(),
      slug: v.string(),
      logo: v.optional(v.union(v.null(), v.string())),
      clerkId: v.optional(v.union(v.null(), v.string())),
      createdAt: v.number(),
    })
  ),
  async handler(ctx, args) {
    await requireAdmin(ctx, args.adminUserId)

    const orgs = await ctx.db.query("organization").collect()

    return orgs.map((org) => ({
      _id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      logo: org.logo,
      clerkId: org.clerkId,
      createdAt: org.createdAt,
    }))
  },
})

/**
 * Delete a user and all associated data (superadmin only).
 *
 * Safety check: if the user is the sole owner of any organization,
 * deletion is blocked — the org would be left without an owner.
 */
export const deleteUser = mutation({
  args: {
    adminUserId: v.string(),
    userId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    deletedSessions: v.number(),
    deletedAccounts: v.number(),
    deletedMemberships: v.number(),
  }),
  async handler(ctx, args) {
    // Only superadmins may delete users
    const callerRole = await requireAdmin(ctx, args.adminUserId)
    if (callerRole !== "superadmin") {
      throw new ConvexError("Only superadmins can delete users")
    }

    // Prevent self-deletion
    if (args.adminUserId === args.userId) {
      throw new ConvexError("You cannot delete your own account")
    }

    // Verify target user exists
    const normalizedUserId = ctx.db.normalizeId("user", args.userId)
    if (!normalizedUserId) throw new ConvexError("User not found")
    const user = await ctx.db.get(normalizedUserId)
    if (!user) throw new ConvexError("User not found")

    // --- Orphan check ---
    // Find all orgs where this user is an owner
    const userMemberships = await ctx.db
      .query("member")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect()

    const ownerMemberships = userMemberships.filter((m) => m.role === "owner")

    for (const ownerMembership of ownerMemberships) {
      // Count other owners in this org
      const otherOwners = await ctx.db
        .query("member")
        .withIndex("organizationId", (q) =>
          q.eq("organizationId", ownerMembership.organizationId)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("role"), "owner"),
            q.neq(q.field("userId"), args.userId)
          )
        )
        .collect()

      if (otherOwners.length === 0) {
        // Look up the org name for the error message
        const orgNormalizedId = ctx.db.normalizeId(
          "organization",
          ownerMembership.organizationId
        )
        const org = orgNormalizedId ? await ctx.db.get(orgNormalizedId) : null
        throw new ConvexError(
          `Cannot delete user: they are the sole owner of organization "${org?.name ?? ownerMembership.organizationId}". Transfer ownership or delete the organization first.`
        )
      }
    }

    // --- Cascade delete ---
    // 1. Sessions
    const sessions = await ctx.db
      .query("session")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect()
    for (const s of sessions) await ctx.db.delete(s._id)

    // 2. Accounts (credential, OAuth, etc.)
    const accounts = await ctx.db
      .query("account")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect()
    for (const a of accounts) await ctx.db.delete(a._id)

    // 3. Org memberships
    const allMemberships = await ctx.db
      .query("member")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect()
    for (const m of allMemberships) await ctx.db.delete(m._id)

    // 4. Invitations
    const sentInvitations = await ctx.db
      .query("invitation")
      .withIndex("inviterId", (q) => q.eq("inviterId", args.userId))
      .collect()
    for (const inv of sentInvitations) await ctx.db.delete(inv._id)

    const receivedInvitations = await ctx.db
      .query("invitation")
      .withIndex("email", (q) => q.eq("email", user.email))
      .collect()
    for (const inv of receivedInvitations) await ctx.db.delete(inv._id)

    // 5. Verification tokens
    // Note: BetterAuth usually stores the email in `identifier`
    const verificationTokens = await ctx.db
      .query("verification")
      .withIndex("identifier", (q) => q.eq("identifier", user.email))
      .collect()
    for (const token of verificationTokens) await ctx.db.delete(token._id)

    // 6. User record
    await ctx.db.delete(user._id)

    return {
      success: true,
      deletedSessions: sessions.length,
      deletedAccounts: accounts.length,
      deletedMemberships: allMemberships.length,
    }
  },
})

/**
 * Returns the list of organizationIds where a given userId is a member.
 * Used to scope the organizations list for implementors.
 */
export const getImplementorMemberOrgIds = query({
  args: {
    userId: v.string(),
  },
  returns: v.array(v.string()),
  async handler(ctx, args) {
    const memberships = await ctx.db
      .query("member")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect()
    return memberships.map((m) => m.organizationId.toString())
  },
})

/**
 * Returns deduplicated userIds for all members across a list of org IDs.
 * Used to scope the user list for implementors.
 */
export const getMemberUserIdsForOrgs = query({
  args: {
    orgIds: v.array(v.string()),
  },
  returns: v.array(v.string()),
  async handler(ctx, args) {
    const results = await Promise.all(
      args.orgIds.map((orgId) =>
        ctx.db
          .query("member")
          .withIndex("organizationId", (q) => q.eq("organizationId", orgId))
          .collect()
      )
    )
    const userIds = new Set<string>()
    for (const members of results) {
      for (const m of members) userIds.add(m.userId.toString())
    }
    return Array.from(userIds)
  },
})

/**
 * Get all users created by an admin
 */
export const getUsersCreatedBy = query({
  args: {
    adminUserId: v.string(),
  },
  returns: v.array(v.string()),
  async handler(ctx, args) {
    const users = await ctx.db
      .query("user")
      .withIndex("createdBy", (q) => q.eq("createdBy", args.adminUserId))
      .collect()

    return users.map((u) => u._id.toString())
  },
})

/**
 * Get a session by its ID without checking component admin role
 * Intended for use by the outer platform context to do scope checks
 */
export const getSessionById = query({
  args: { sessionId: v.string() },
  returns: v.union(v.object({ _id: v.string(), userId: v.string() }), v.null()),
  async handler(ctx, args) {
    const normalizedId = ctx.db.normalizeId("session", args.sessionId)
    if (!normalizedId) return null

    const session = await ctx.db.get(normalizedId)

    return session
      ? { _id: session._id.toString(), userId: session.userId }
      : null
  },
})
