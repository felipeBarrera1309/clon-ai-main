import { ConvexError } from "convex/values"
import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions"
import { action, mutation, query } from "../_generated/server"
import { authComponent } from "../auth"
import type { AuthContext } from "./helpers"
import { validateAuth } from "./helpers"

/**
 * Platform Admin Access Control
 *
 * With Better Auth, platform admin access is determined by the user's role field.
 * Users with role="admin" OR role="superadmin" are considered platform admins.
 *
 * This is different from organization admin (owner/admin role within an org).
 *
 * Role hierarchy:
 * - superadmin: Highest level, can delete organizations and perform destructive ops
 * - admin: Platform admin, can manage all organizations and users
 * - (no role): Regular user, access based on organization membership
 *
 * To make a user a platform admin:
 * 1. Use the Better Auth admin plugin to set their role to "admin" or "superadmin"
 * 2. Or update the user's role directly in the database
 */

/**
 * Validates if the current user is a platform admin (has admin or superadmin role)
 * @param ctx - The Convex context
 * @throws ConvexError if user is not a platform admin
 */
export const requirePlatformAdminAccess = async (ctx: AuthContext) => {
  const user = await authComponent.getAuthUser(ctx)
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "No tienes permisos de administrador de plataforma",
    })
  }
  return user
}

export const platformAdminQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const { identity } = await validateAuth(ctx)
    await requirePlatformAdminAccess(ctx)
    return { identity }
  })
)

export const platformAdminMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const { identity } = await validateAuth(ctx)
    await requirePlatformAdminAccess(ctx)
    return { identity }
  })
)

export const platformAdminAction = customAction(
  action,
  customCtx(async (ctx) => {
    const { identity } = await validateAuth(ctx)
    await requirePlatformAdminAccess(ctx)
    return { identity }
  })
)

// Example platform admin function - you can remove this and add your own
export const getPlatformAdminStats = platformAdminQuery({
  args: {},
  handler: async (ctx) => {
    // This is just an example - you can implement your own platform admin functions
    const totalOrganizations = await ctx.db
      .query("restaurantLocations")
      .collect()
    const uniqueOrgIds = new Set(
      totalOrganizations.map((loc) => loc.organizationId)
    )

    return {
      totalOrganizations: uniqueOrgIds.size,
      totalLocations: totalOrganizations.length,
      adminUserId: ctx.identity.subject,
    }
  },
})
