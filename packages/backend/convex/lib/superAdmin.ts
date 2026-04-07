import { ConvexError, v } from "convex/values"
import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions"
import { components } from "../_generated/api"
import {
  action,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "../_generated/server"
import { authComponent } from "../auth"
import type { AuthContext } from "./helpers"
import { validateAuth } from "./helpers"

/**
 * Platform Admin Access Control
 *
 * With Better Auth, platform admin access is determined by the user's role field.
 * Users with role="admin" OR role="superadmin" are considered platform admins.
 * This allows both roles to access admin features.
 *
 * Naming convention:
 * - platformAdmin* → requires admin OR superadmin role
 * - platformSuperAdmin* → requires ONLY superadmin role (for destructive operations)
 */

const requirePlatformAdmin = async (ctx: AuthContext) => {
  const user = await authComponent.getAuthUser(ctx)
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "No tienes permisos de administrador de plataforma",
    })
  }
  return user
}

/**
 * Platform Super Admin Access Control
 *
 * Only users with role="superadmin" can access superadmin-only features.
 * This is used for destructive operations like deleting organizations.
 */
export const requirePlatformSuperAdmin = async (ctx: AuthContext) => {
  const user = await authComponent.getAuthUser(ctx)
  if (!user || user.role !== "superadmin") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "No tienes permisos de super administrador de plataforma",
    })
  }
  return user
}

// ============================================
// PLATFORM ADMIN (admin OR superadmin)
// ============================================

export const platformAdminQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const { identity } = await validateAuth(ctx)
    const user = await requirePlatformAdmin(ctx)
    return { identity, user }
  })
)

export const platformAdminMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const { identity } = await validateAuth(ctx)
    const user = await requirePlatformAdmin(ctx)
    return { identity, user }
  })
)

export const platformAdminAction = customAction(
  action,
  customCtx(async (ctx) => {
    const { identity } = await validateAuth(ctx)
    const user = await requirePlatformAdmin(ctx)
    return { identity, user }
  })
)

// ============================================
// PLATFORM SUPER ADMIN (superadmin ONLY)
// ============================================

export const platformSuperAdminQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const { identity } = await validateAuth(ctx)
    const user = await requirePlatformSuperAdmin(ctx)
    return { identity, user }
  })
)

export const platformSuperAdminMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const { identity } = await validateAuth(ctx)
    const user = await requirePlatformSuperAdmin(ctx)
    return { identity, user }
  })
)

export const platformSuperAdminAction = customAction(
  action,
  customCtx(async (ctx) => {
    const { identity } = await validateAuth(ctx)
    const user = await requirePlatformSuperAdmin(ctx)
    return { identity, user }
  })
)

// ============================================
// PLATFORM ADMIN OR IMPLEMENTOR
// ============================================

const requirePlatformAdminOrImplementor = async (ctx: AuthContext) => {
  const user = await authComponent.getAuthUser(ctx)
  if (
    !user ||
    (user.role !== "admin" &&
      user.role !== "superadmin" &&
      user.role !== "implementor")
  ) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "No tienes permisos de administrador o implementador",
    })
  }
  return user
}

export const platformAdminOrImplementorQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const { identity } = await validateAuth(ctx)
    const user = await requirePlatformAdminOrImplementor(ctx)
    return { identity, user }
  })
)

export const platformAdminOrImplementorMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const { identity } = await validateAuth(ctx)
    const user = await requirePlatformAdminOrImplementor(ctx)
    return { identity, user }
  })
)

/**
 * Asserts that the caller has access to the given organization.
 * For implementors, this means they must be a member of the organization.
 * For superadmins and admins, they have global access.
 */
export const assertOrganizationAccess = async (
  ctx: {
    runQuery: QueryCtx["runQuery"] | MutationCtx["runQuery"]
    user: { role?: string | null; _id: any }
  },
  organizationId: string
) => {
  if (ctx.user.role === "implementor") {
    const memberOrgIds = await ctx.runQuery(
      components.betterAuth.admin.getImplementorMemberOrgIds,
      { userId: ctx.user._id.toString() }
    )
    const memberOrgIdSet = new Set(memberOrgIds)
    if (!memberOrgIdSet.has(organizationId)) {
      throw new ConvexError(
        "No tienes permisos para gestionar esta organización"
      )
    }
  }
}

// ============================================
// PLATFORM ADMIN FUNCTIONS
// ============================================

export const listContactsForPromptBuilder = platformAdminQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(50) // Limit for performance

    return contacts.map((contact) => ({
      _id: contact._id,
      displayName: contact.displayName,
      phoneNumber: contact.phoneNumber,
      lastMessageAt: contact.lastMessageAt,
    }))
  },
})
