import { v } from "convex/values"
import { paginator } from "convex-helpers/server/pagination"
import type { Doc } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import schema from "./schema"

/**
 * Organization management functions for Better Auth
 * Based on Better Auth organizations plugin
 * Docs: https://better-auth.vercel.app/docs/plugins/organization
 */

/**
 * Get the active organization ID for the current user
 * Returns the activeOrganizationId from the most recent active session
 */
export const getActiveOrganizationId = query({
  args: {},
  returns: v.union(v.null(), v.string()),
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const userId = identity.subject

    // Get all sessions for this user
    const sessions = await ctx.db
      .query("session")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect()

    // Find the most recent active session (not expired)
    const activeSession = sessions
      .filter((s) => s.expiresAt > Date.now())
      .sort((a, b) => b.createdAt - a.createdAt)[0]

    return activeSession?.activeOrganizationId ?? null
  },
})

/**
 * Get all organizations where the current user is a member
 */
export const getUserOrganizations = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.string(),
      name: v.string(),
      slug: v.string(),
      logo: v.optional(v.union(v.null(), v.string())),
      createdAt: v.number(),
      metadata: v.optional(v.union(v.null(), v.string())),
      role: v.optional(v.string()),
    })
  ),
  async handler(ctx) {
    try {
      // Get the current user's ID from the authenticated session
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) {
        return []
      }

      const userId = identity.subject

      // Get all organizations where user is a member
      const memberships = await ctx.db
        .query("member")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect()

      const organizations = (
        await Promise.all(
          memberships.map(async (membership) => {
            const orgId = ctx.db.normalizeId(
              "organization",
              membership.organizationId
            )
            if (!orgId) return null

            const org = await ctx.db.get(orgId)
            if (!org) return null

            return {
              _id: org._id.toString(),
              name: org.name,
              slug: org.slug,
              logo: org.logo,
              createdAt: org.createdAt,
              metadata: org.metadata,
              role: membership.role,
            }
          })
        )
      ).filter((org): org is NonNullable<typeof org> => org !== null)

      return organizations
    } catch (error) {
      console.error("Error getting user organizations:", error)
      return []
    }
  },
})

/**
 * Get organization members with their roles
 */
export const getOrganizationMembers = query({
  args: { organizationId: v.string() },
  returns: v.array(
    v.object({
      _id: v.string(),
      userId: v.string(),
      role: v.string(),
      createdAt: v.number(),
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
  async handler(ctx, args) {
    // Get all members for this organization
    const members = await ctx.db
      .query("member")
      .withIndex("organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Fetch user details for each member
    const membersWithUsers = await Promise.all(
      members.map(async (member) => {
        const userId = ctx.db.normalizeId("user", member.userId)
        const user = userId ? await ctx.db.get(userId) : null

        return {
          _id: member._id.toString(),
          userId: member.userId,
          role: member.role,
          createdAt: member.createdAt,
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

    return membersWithUsers
  },
})

/**
 * Get pending invitations for an organization
 */
export const getOrganizationInvitations = query({
  args: { organizationId: v.string() },
  returns: v.array(
    v.object({
      _id: v.string(),
      email: v.string(),
      role: v.optional(v.union(v.null(), v.string())),
      status: v.string(),
      expiresAt: v.number(),
      inviterId: v.string(),
      organizationId: v.string(),
    })
  ),
  async handler(ctx, args) {
    const invitations = await ctx.db
      .query("invitation")
      .withIndex("organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect()

    return invitations.map((inv) => ({
      _id: inv._id.toString(),
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      inviterId: inv.inviterId,
      organizationId: inv.organizationId,
    }))
  },
})

/**
 * Get all organizations (for admin)
 */
export const listAll = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.string(),
      name: v.string(),
      slug: v.string(),
      logo: v.optional(v.union(v.null(), v.string())),
      createdAt: v.number(),
      metadata: v.optional(v.union(v.null(), v.string())),
    })
  ),
  async handler(ctx) {
    let cursor: string | null = null
    let hasMore = true
    const orgs: Doc<"organization">[] = []

    while (hasMore) {
      const page = await paginator(ctx.db, schema)
        .query("organization")
        .paginate({
          cursor,
          numItems: 500,
        })
      cursor = page.continueCursor
      hasMore = !page.isDone && page.continueCursor !== null
      orgs.push(...page.page)
    }

    return orgs.map((org) => ({
      _id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      logo: org.logo,
      createdAt: org.createdAt,
      metadata: org.metadata,
    }))
  },
})

export const getById = query({
  args: { organizationId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.string(),
      name: v.string(),
      slug: v.string(),
      logo: v.optional(v.union(v.null(), v.string())),
      createdAt: v.number(),
      metadata: v.optional(v.union(v.null(), v.string())),
    })
  ),
  async handler(ctx, args) {
    const orgId = ctx.db.normalizeId("organization", args.organizationId)
    if (!orgId) return null

    const org = await ctx.db.get(orgId)
    if (!org) return null

    return {
      _id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      logo: org.logo,
      createdAt: org.createdAt,
      metadata: org.metadata,
    }
  },
})

export const getOrganizationsByIds = query({
  args: { organizationIds: v.array(v.string()) },
  returns: v.array(
    v.object({
      _id: v.string(),
      name: v.string(),
      slug: v.string(),
      logo: v.optional(v.union(v.null(), v.string())),
      createdAt: v.number(),
      metadata: v.optional(v.union(v.null(), v.string())),
    })
  ),
  async handler(ctx, args) {
    const orgs = (
      await Promise.all(
        args.organizationIds.map(async (id) => {
          const orgId = ctx.db.normalizeId("organization", id)
          if (!orgId) return null
          return await ctx.db.get(orgId)
        })
      )
    ).filter((org): org is NonNullable<typeof org> => org !== null)

    return orgs.map((org) => ({
      _id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      logo: org.logo,
      createdAt: org.createdAt,
      metadata: org.metadata,
    }))
  },
})

/**
 * Get user memberships by userId (for admin)
 */
export const getUserMemberships = query({
  args: { userId: v.string() },
  returns: v.array(
    v.object({
      _id: v.string(),
      organizationId: v.string(),
      userId: v.string(),
      role: v.string(),
      createdAt: v.number(),
    })
  ),
  async handler(ctx, args) {
    const memberships = await ctx.db
      .query("member")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect()

    return memberships.map((m) => ({
      _id: m._id.toString(),
      organizationId: m.organizationId,
      userId: m.userId,
      role: m.role,
      createdAt: m.createdAt,
    }))
  },
})

export const getMembershipCountsForUsers = query({
  args: { userIds: v.array(v.string()) },
  returns: v.array(
    v.object({
      userId: v.string(),
      count: v.number(),
    })
  ),
  async handler(ctx, args) {
    const uniqueUserIds = Array.from(new Set(args.userIds)).slice(0, 200)

    return await Promise.all(
      uniqueUserIds.map(async (userId) => {
        const memberships = await ctx.db
          .query("member")
          .withIndex("userId", (q) => q.eq("userId", userId))
          .collect()

        return {
          userId,
          count: memberships.length,
        }
      })
    )
  },
})

/**
 * Remove a member from organization
 */
export const removeMember = mutation({
  args: { memberId: v.string() },
  returns: v.object({ success: v.boolean() }),
  async handler(ctx, args) {
    const memberId = ctx.db.normalizeId("member", args.memberId)
    if (!memberId) {
      return { success: false }
    }

    const member = await ctx.db.get(memberId)

    if (!member) {
      return { success: false }
    }

    await ctx.db.delete(memberId)
    return { success: true }
  },
})

/**
 * Ensure user has an active organization
 * This function is called after sign-in to ensure the user always has an active organization
 */
export const ensureActiveOrganization = mutation({
  args: {},
  returns: v.union(v.null(), v.string()),
  async handler(ctx) {
    try {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) {
        return null
      }

      const userId = identity.subject

      // Get all sessions for this user
      const sessions = await ctx.db
        .query("session")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect()

      // Find the most recent active session (not expired)
      const activeSession = sessions
        .filter((s) => s.expiresAt > Date.now())
        .sort((a, b) => b.createdAt - a.createdAt)[0]

      if (!activeSession) {
        return null
      }

      // If session already has an active organization, verify it exists and user is a member
      if (activeSession.activeOrganizationId) {
        const orgIdString = activeSession.activeOrganizationId
        const orgId = ctx.db.normalizeId("organization", orgIdString)
        const org = orgId ? await ctx.db.get(orgId) : null

        if (org) {
          // Verify user is a member using the compound index
          const membership = await ctx.db
            .query("member")
            .withIndex("organizationId_userId", (q) =>
              q.eq("organizationId", org._id.toString()).eq("userId", userId)
            )
            .first()

          if (membership) {
            // User is a member and org is active, all good
            return org._id.toString()
          }
        }
      }

      // Get all organizations where user is a member
      const memberships = await ctx.db
        .query("member")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect()

      if (memberships.length === 0) {
        // User has no organizations
        // Check if user is admin - only admins can create organizations automatically
        const normalizedUserId = ctx.db.normalizeId("user", userId)
        if (!normalizedUserId) {
          return null
        }
        const user = await ctx.db.get(normalizedUserId)

        if (!user) {
          return null
        }

        // Only create default organization if user is admin
        if (user.role === "admin") {
          // Create default organization for admin
          const orgId = await ctx.db.insert("organization", {
            name: `${user.name || user.email}'s Organization`,
            slug: `org-${userId}-${Date.now()}`,
            createdAt: Date.now(),
          })

          // Add user as owner
          await ctx.db.insert("member", {
            organizationId: orgId.toString(),
            userId: userId,
            role: "owner",
            createdAt: Date.now(),
          })

          // Update session with active organization
          await ctx.db.patch(activeSession._id, {
            activeOrganizationId: orgId.toString(),
          })

          return orgId.toString()
        }

        // Non-admin user without organizations - return null
        return null
      }

      // User has organizations, set the first one as active
      const firstMembership = memberships[0]
      if (!firstMembership) {
        return null
      }

      const orgIdString = firstMembership.organizationId
      const orgId = ctx.db.normalizeId("organization", orgIdString)
      const org = orgId ? await ctx.db.get(orgId) : null

      if (!org) {
        return null
      }

      // Update session with active organization
      await ctx.db.patch(activeSession._id, {
        activeOrganizationId: org._id.toString(),
      })

      return org._id.toString()
    } catch (error) {
      console.error("Error ensuring active organization:", error)
      return null
    }
  },
})

/**
 * Debug function to check membership status for a user and organization
 * This helps diagnose 403 errors on setActive
 */
export const debugMembershipCheck = query({
  args: { organizationId: v.string() },
  returns: v.object({
    userId: v.union(v.null(), v.string()),
    organizationExists: v.boolean(),
    membershipExists: v.boolean(),
    membershipDetails: v.union(
      v.null(),
      v.object({
        _id: v.string(),
        organizationId: v.string(),
        userId: v.string(),
        role: v.string(),
      })
    ),
    sessionInfo: v.union(
      v.null(),
      v.object({
        activeOrganizationId: v.union(v.null(), v.string()),
        expiresAt: v.number(),
      })
    ),
  }),
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return {
        userId: null,
        organizationExists: false,
        membershipExists: false,
        membershipDetails: null,
        sessionInfo: null,
      }
    }

    const userId = identity.subject

    // Check if organization exists
    const orgId = ctx.db.normalizeId("organization", args.organizationId)
    const org = orgId ? await ctx.db.get(orgId) : null

    // Check membership using compound index for efficiency
    const membership = await ctx.db
      .query("member")
      .withIndex("organizationId_userId", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", userId)
      )
      .first()

    // Get session info
    const sessions = await ctx.db
      .query("session")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect()

    const activeSession = sessions
      .filter((s) => s.expiresAt > Date.now())
      .sort((a, b) => b.createdAt - a.createdAt)[0]

    return {
      userId,
      organizationExists: !!org,
      membershipExists: !!membership,
      membershipDetails: membership
        ? {
            _id: membership._id.toString(),
            organizationId: membership.organizationId,
            userId: membership.userId,
            role: membership.role,
          }
        : null,
      sessionInfo: activeSession
        ? {
            activeOrganizationId: activeSession.activeOrganizationId ?? null,
            expiresAt: activeSession.expiresAt,
          }
        : null,
    }
  },
})
