import { ConvexError, v } from "convex/values"
import { authComponent } from "../auth"
import { platformAdminMutation, platformAdminQuery } from "../lib/superAdmin"
import {
  ADMIN_TEAM_ONLY_PAGES,
  ALL_AVAILABLE_PAGES,
  DEFAULT_PERMISSIONS,
  ORGANIZATION_ROLES,
  type OrganizationRole,
} from "../private/organizationPermissions"

const validateDefaultPages = (pages: string[], allowAdminTeamOnly = false) => {
  // Must exist + must not be admin-team-only (unless explicitly allowed)
  return pages.filter((page) => {
    const isValidPage = ALL_AVAILABLE_PAGES.includes(
      page as (typeof ALL_AVAILABLE_PAGES)[number]
    )
    if (allowAdminTeamOnly) {
      return isValidPage
    }
    const isAdminTeamOnly = ADMIN_TEAM_ONLY_PAGES.includes(
      page as (typeof ADMIN_TEAM_ONLY_PAGES)[number]
    )
    return isValidPage && !isAdminTeamOnly
  })
}

/**
 * Get platform-wide permission defaults (super admin)
 * If not configured, UI should fall back to code defaults.
 */
export const getPlatformDefaults = platformAdminQuery({
  args: {},
  returns: v.object({
    permissions: v.union(
      v.null(),
      v.object({
        ownerAllowedPages: v.optional(v.array(v.string())),
        adminAllowedPages: v.optional(v.array(v.string())),
        managerAllowedPages: v.optional(v.array(v.string())),
        cashierAllowedPages: v.optional(v.array(v.string())),
        kitchenAllowedPages: v.optional(v.array(v.string())),
        viewerAllowedPages: v.optional(v.array(v.string())),
        lastModifiedBy: v.optional(v.string()),
        lastModifiedAt: v.optional(v.number()),
      })
    ),
    defaults: v.object({
      owner: v.array(v.string()),
      admin: v.array(v.string()),
      manager: v.array(v.string()),
      cashier: v.array(v.string()),
      kitchen: v.array(v.string()),
      viewer: v.array(v.string()),
    }),
    availablePages: v.array(v.string()),
    adminTeamOnlyPages: v.array(v.string()),
    roles: v.array(
      v.object({
        value: v.string(),
        labelEn: v.string(),
        labelEs: v.string(),
        level: v.number(),
        description: v.string(),
        descriptionEs: v.string(),
      })
    ),
  }),
  handler: async (ctx) => {
    const permissions = await ctx.db
      .query("platformPermissionsDefaults")
      .first()

    return {
      permissions: permissions
        ? {
            ownerAllowedPages: permissions.ownerAllowedPages,
            adminAllowedPages: permissions.adminAllowedPages,
            managerAllowedPages: permissions.managerAllowedPages,
            cashierAllowedPages: permissions.cashierAllowedPages,
            kitchenAllowedPages: permissions.kitchenAllowedPages,
            viewerAllowedPages: permissions.viewerAllowedPages,
            lastModifiedBy: permissions.lastModifiedBy,
            lastModifiedAt: permissions.lastModifiedAt,
          }
        : null,
      defaults: {
        owner: [...DEFAULT_PERMISSIONS.owner],
        admin: [...DEFAULT_PERMISSIONS.admin],
        manager: [...DEFAULT_PERMISSIONS.manager],
        cashier: [...DEFAULT_PERMISSIONS.cashier],
        kitchen: [...DEFAULT_PERMISSIONS.kitchen],
        viewer: [...DEFAULT_PERMISSIONS.viewer],
      },
      availablePages: [...ALL_AVAILABLE_PAGES],
      adminTeamOnlyPages: [...ADMIN_TEAM_ONLY_PAGES],
      roles: ORGANIZATION_ROLES.map((r) => ({ ...r })),
    }
  },
})

/**
 * Update platform-wide permission defaults (super admin)
 */
export const updatePlatformDefaults = platformAdminMutation({
  args: {
    ownerAllowedPages: v.optional(v.array(v.string())),
    adminAllowedPages: v.optional(v.array(v.string())),
    managerAllowedPages: v.optional(v.array(v.string())),
    cashierAllowedPages: v.optional(v.array(v.string())),
    kitchenAllowedPages: v.optional(v.array(v.string())),
    viewerAllowedPages: v.optional(v.array(v.string())),
    // Legacy fields for backward compatibility
    memberAllowedPages: v.optional(v.array(v.string())),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx)
    if (!user) {
      throw new ConvexError("Not authenticated")
    }

    // Validate pages for each role
    // Owner can have admin-team-only pages, others cannot
    const validOwnerPages = args.ownerAllowedPages
      ? validateDefaultPages(args.ownerAllowedPages, true)
      : undefined
    const validAdminPages = args.adminAllowedPages
      ? validateDefaultPages(args.adminAllowedPages)
      : undefined
    const validManagerPages = args.managerAllowedPages
      ? validateDefaultPages(args.managerAllowedPages)
      : undefined
    const validCashierPages = args.cashierAllowedPages
      ? validateDefaultPages(args.cashierAllowedPages)
      : undefined
    const validKitchenPages = args.kitchenAllowedPages
      ? validateDefaultPages(args.kitchenAllowedPages)
      : undefined
    const validViewerPages = args.viewerAllowedPages
      ? validateDefaultPages(args.viewerAllowedPages)
      : undefined

    const existing = await ctx.db.query("platformPermissionsDefaults").first()

    const updateData = {
      ...(validOwnerPages !== undefined && {
        ownerAllowedPages: validOwnerPages,
      }),
      ...(validAdminPages !== undefined && {
        adminAllowedPages: validAdminPages,
      }),
      ...(validManagerPages !== undefined && {
        managerAllowedPages: validManagerPages,
      }),
      ...(validCashierPages !== undefined && {
        cashierAllowedPages: validCashierPages,
      }),
      ...(validKitchenPages !== undefined && {
        kitchenAllowedPages: validKitchenPages,
      }),
      ...(validViewerPages !== undefined && {
        viewerAllowedPages: validViewerPages,
      }),
      lastModifiedBy: user._id.toString(),
      lastModifiedAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, updateData)
    } else {
      // When creating new, use defaults for any missing roles
      await ctx.db.insert("platformPermissionsDefaults", {
        ownerAllowedPages: validOwnerPages ?? [...DEFAULT_PERMISSIONS.owner],
        adminAllowedPages: validAdminPages ?? [...DEFAULT_PERMISSIONS.admin],
        managerAllowedPages: validManagerPages ?? [
          ...DEFAULT_PERMISSIONS.manager,
        ],
        cashierAllowedPages: validCashierPages ?? [
          ...DEFAULT_PERMISSIONS.cashier,
        ],
        kitchenAllowedPages: validKitchenPages ?? [
          ...DEFAULT_PERMISSIONS.kitchen,
        ],
        viewerAllowedPages: validViewerPages ?? [...DEFAULT_PERMISSIONS.viewer],
        lastModifiedBy: user._id.toString(),
        lastModifiedAt: Date.now(),
      })
    }

    return { success: true }
  },
})

/**
 * Update permissions for a single role (super admin)
 */
export const updateRoleDefaults = platformAdminMutation({
  args: {
    role: v.string(),
    allowedPages: v.array(v.string()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx)
    if (!user) {
      throw new ConvexError("Not authenticated")
    }

    // Validate role
    const validRoles = ORGANIZATION_ROLES.map((r) => r.value)
    if (!validRoles.includes(args.role as OrganizationRole)) {
      throw new ConvexError(`Invalid role: ${args.role}`)
    }

    // Owner can have admin-team-only pages, others cannot
    const allowAdminTeamOnly = args.role === "owner"
    const validPages = validateDefaultPages(
      args.allowedPages,
      allowAdminTeamOnly
    )

    const existing = await ctx.db.query("platformPermissionsDefaults").first()

    // Build the field name for this role
    const roleFieldMap: Record<OrganizationRole, string> = {
      owner: "ownerAllowedPages",
      admin: "adminAllowedPages",
      manager: "managerAllowedPages",
      cashier: "cashierAllowedPages",
      kitchen: "kitchenAllowedPages",
      viewer: "viewerAllowedPages",
    }
    const field = roleFieldMap[args.role as OrganizationRole]

    if (existing) {
      await ctx.db.patch(existing._id, {
        [field]: validPages,
        lastModifiedBy: user._id.toString(),
        lastModifiedAt: Date.now(),
      })
    } else {
      // When creating new, use defaults for all roles except the one being set
      await ctx.db.insert("platformPermissionsDefaults", {
        ownerAllowedPages: [...DEFAULT_PERMISSIONS.owner],
        adminAllowedPages: [...DEFAULT_PERMISSIONS.admin],
        managerAllowedPages: [...DEFAULT_PERMISSIONS.manager],
        cashierAllowedPages: [...DEFAULT_PERMISSIONS.cashier],
        kitchenAllowedPages: [...DEFAULT_PERMISSIONS.kitchen],
        viewerAllowedPages: [...DEFAULT_PERMISSIONS.viewer],
        [field]: validPages,
        lastModifiedBy: user._id.toString(),
        lastModifiedAt: Date.now(),
      })
    }

    return { success: true }
  },
})

/**
 * Reset platform defaults to code defaults (super admin)
 * (Deletes the singleton row.)
 */
export const resetPlatformDefaults = platformAdminMutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx) => {
    const existing = await ctx.db.query("platformPermissionsDefaults").first()
    if (existing) {
      await ctx.db.delete(existing._id)
    }
    return { success: true }
  },
})
