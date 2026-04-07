import { createClient, type GenericCtx } from "@convex-dev/better-auth"
import { convex } from "@convex-dev/better-auth/plugins"
import { type BetterAuthOptions, betterAuth } from "better-auth/minimal"
import { admin, organization } from "better-auth/plugins"
import { v } from "convex/values"
import { components } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import authConfig from "./auth.config"
import authSchema from "./betterAuth/schema"

// Component client with local schema
export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    local: {
      schema: authSchema,
    },
  }
)

/**
 * Create Better Auth options
 * Separated for use in adapter.ts
 */
export const createAuthOptions = (
  ctx: GenericCtx<DataModel>
): BetterAuthOptions => {
  // Access env vars inside the function to avoid module-load-time evaluation
  const siteUrl = process.env.SITE_URL ?? "http://localhost:3000"
  const googleClientId = process.env.GOOGLE_CLIENT_ID
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET

  // Build trusted origins list - include both with and without trailing slash
  const trustedOrigins = [
    siteUrl,
    siteUrl.replace(/\/$/, ""), // Without trailing slash
    "http://localhost:3000",
    "https://admin.clonai.co",
  ].filter((origin, index, self) => self.indexOf(origin) === index) // Remove duplicates

  return {
    baseURL: siteUrl,
    trustedOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    socialProviders: {
      google:
        googleClientId && googleClientSecret
          ? {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            }
          : undefined,
    },
    plugins: [
      convex({ authConfig }),
      admin(),
      organization({
        allowUserToCreateOrganization: true,
        membershipLimit: 100,
      }),
    ],
  }
}

/**
 * Create Better Auth instance
 * @param ctx - Convex context
 */
export const createAuth = (
  ctx: GenericCtx<DataModel>
): ReturnType<typeof betterAuth> => {
  return betterAuth(createAuthOptions(ctx))
}

/**
 * Get the current authenticated user
 */
export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.string(),
      name: v.string(),
      email: v.string(),
      image: v.optional(v.union(v.null(), v.string())),
      role: v.optional(v.union(v.null(), v.string())),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  async handler(ctx) {
    try {
      const user = await authComponent.getAuthUser(ctx)
      if (!user) {
        return null
      }
      // Transform to match validator - exclude Convex internal fields and extra fields
      return {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        ...(user.image !== undefined && { image: user.image }),
        ...(user.role !== undefined && { role: user.role }),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }
    } catch (error) {
      console.error("getCurrentUser error:", error)
      return null
    }
  },
})

/**
 * Check if the current user is a platform admin
 * Platform admin = user with role="admin" OR role="superadmin" in Better Auth (not organization admin)
 * This is different from organization admin (owner/admin role within an org)
 * Both admin and superadmin roles pass this check
 */
export const isPlatformAdmin = query({
  args: {},
  returns: v.boolean(),
  async handler(ctx) {
    try {
      const user = await authComponent.getAuthUser(ctx)
      return user?.role === "admin" || user?.role === "superadmin"
    } catch {
      return false
    }
  },
})

/**
 * Check if the current user is an implementor
 */
export const isImplementor = query({
  args: {},
  returns: v.boolean(),
  async handler(ctx) {
    try {
      const user = await authComponent.getAuthUser(ctx)
      return user?.role === "implementor"
    } catch {
      return false
    }
  },
})

/**
 * Check if the current user is a platform superadmin
 * Superadmin = user with role="superadmin" in Better Auth
 * This is the highest privilege level, with access to destructive operations like deleting organizations
 */
export const isPlatformSuperAdmin = query({
  args: {},
  returns: v.boolean(),
  async handler(ctx) {
    try {
      const user = await authComponent.getAuthUser(ctx)
      return user?.role === "superadmin"
    } catch {
      return false
    }
  },
})

/**
 * Get user organizations
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
    return await ctx.runQuery(
      components.betterAuth.organizations.getUserOrganizations,
      {}
    )
  },
})

/**
 * Organization Management Queries
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
    return await ctx.runQuery(
      components.betterAuth.organizations.getOrganizationMembers,
      { organizationId: args.organizationId }
    )
  },
})

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
    return await ctx.runQuery(
      components.betterAuth.organizations.getOrganizationInvitations,
      { organizationId: args.organizationId }
    )
  },
})

/**
 * Ensure user has an active organization after sign-in
 * This should be called after successful authentication
 */
export const ensureActiveOrganization = mutation({
  args: {},
  returns: v.union(v.null(), v.string()),
  async handler(ctx) {
    const result = await ctx.runMutation(
      components.betterAuth.organizations.ensureActiveOrganization,
      {}
    )
    return result ? result.toString() : null
  },
})
