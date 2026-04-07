import { ConvexError, v } from "convex/values"
import { components } from "../_generated/api"
import { mutation, query } from "../_generated/server"
import { authComponent } from "../auth"

/**
 * All available pages that can be configured for permissions
 * This is the source of truth for what pages exist in the system
 */
export const ALL_AVAILABLE_PAGES = [
  "/",
  "/conversations",
  "/quick-responses",
  "/contacts",
  "/orders",
  "/menu",
  "/bulk-messaging",
  "/delivery-areas",
  "/restaurant-locations",
  "/customization",
  "/settings",
  "/prompt-builder",
  "/whatsapp",
] as const

/**
 * Organization roles with metadata
 * Ordered by hierarchy level (0 = highest)
 */
export const ORGANIZATION_ROLES = [
  {
    value: "owner",
    labelEn: "Owner",
    labelEs: "Propietario",
    level: 0,
    description: "Full access including AI config and WhatsApp setup",
    descriptionEs: "Acceso completo incluyendo configuración de IA y WhatsApp",
  },
  {
    value: "admin",
    labelEn: "Administrator",
    labelEs: "Administrador",
    level: 1,
    description: "Full operational access, can manage staff and settings",
    descriptionEs:
      "Acceso operacional completo, puede gestionar personal y configuración",
  },
  {
    value: "manager",
    labelEn: "Manager",
    labelEs: "Gerente",
    level: 2,
    description: "Day-to-day operations, menu, orders, staff schedules",
    descriptionEs: "Operaciones diarias, menú, pedidos, horarios de personal",
  },
  {
    value: "cashier",
    labelEn: "Cashier",
    labelEs: "Cajero",
    level: 3,
    description: "Order management, conversations, contacts",
    descriptionEs: "Gestión de pedidos, conversaciones, contactos",
  },
  {
    value: "kitchen",
    labelEn: "Kitchen",
    labelEs: "Cocina",
    level: 4,
    description: "View-only access to orders",
    descriptionEs: "Acceso de solo lectura a pedidos",
  },
  {
    value: "viewer",
    labelEn: "Viewer",
    labelEs: "Observador",
    level: 5,
    description: "Read-only access to orders and basic stats",
    descriptionEs: "Acceso de solo lectura a pedidos y estadísticas básicas",
  },
] as const

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number]["value"]

/**
 * Default permissions for each role
 * Used when organization has no custom permissions configured
 */
export const DEFAULT_PERMISSIONS: Record<OrganizationRole, readonly string[]> =
  {
    owner: [
      "/",
      "/conversations",
      "/quick-responses",
      "/contacts",
      "/orders",
      "/menu",
      "/bulk-messaging",
      "/delivery-areas",
      "/restaurant-locations",
      "/customization",
      "/settings",
      "/prompt-builder",
      "/whatsapp",
    ],
    admin: [
      "/",
      "/conversations",
      "/quick-responses",
      "/contacts",
      "/orders",
      "/menu",
      "/bulk-messaging",
      "/delivery-areas",
      "/restaurant-locations",
      "/settings",
    ],
    manager: [
      "/",
      "/conversations",
      "/quick-responses",
      "/contacts",
      "/orders",
      "/menu",
      "/delivery-areas",
      "/restaurant-locations",
    ],
    cashier: ["/conversations", "/quick-responses", "/contacts", "/orders"],
    kitchen: ["/orders"],
    viewer: ["/", "/orders"],
  } as const

/**
 * Pages that only platform admins (super admins) can access
 * These cannot be granted to regular org members except owners
 */
export const ADMIN_TEAM_ONLY_PAGES = [
  "/customization",
  "/prompt-builder",
  "/whatsapp",
] as const

/**
 * Helper to get role metadata
 */
export const getRoleMetadata = (role: string) => {
  return ORGANIZATION_ROLES.find((r) => r.value === role)
}

/**
 * Helper to check if a role can assign another role
 * Users can only assign roles at their level or below
 */
export const canAssignRole = (
  assignerRole: string,
  targetRole: string
): boolean => {
  const assigner = getRoleMetadata(assignerRole)
  const target = getRoleMetadata(targetRole)
  if (!assigner || !target) return false
  return assigner.level <= target.level
}

/**
 * Get organization permissions
 * Returns custom permissions if set, otherwise returns null (use defaults)
 * Returns null gracefully when not authenticated (e.g., during logout)
 */
export const getPermissions = query({
  args: {},
  returns: v.union(
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
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx)
    if (!user) {
      // Return null gracefully during logout or unauthenticated state
      return null
    }

    const orgId = await ctx.runQuery(
      components.betterAuth.organizations.getActiveOrganizationId,
      {}
    )
    if (!orgId) {
      // Return null gracefully when no active organization
      return null
    }

    const permissions = await ctx.db
      .query("organizationPermissions")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .first()

    if (!permissions) {
      return null
    }

    return {
      ownerAllowedPages: permissions.ownerAllowedPages,
      adminAllowedPages: permissions.adminAllowedPages,
      managerAllowedPages: permissions.managerAllowedPages,
      cashierAllowedPages: permissions.cashierAllowedPages,
      kitchenAllowedPages: permissions.kitchenAllowedPages,
      viewerAllowedPages: permissions.viewerAllowedPages,
      lastModifiedBy: permissions.lastModifiedBy,
      lastModifiedAt: permissions.lastModifiedAt,
    }
  },
})

/**
 * Get resolved permissions for the current user
 * Combines org-specific permissions with defaults
 */
export const getResolvedPermissions = query({
  args: {},
  returns: v.object({
    allowedPages: v.array(v.string()),
    role: v.string(),
    isCustomized: v.boolean(),
  }),
  handler: async (ctx) => {
    // Get user's role in the organization
    const user = await authComponent.getAuthUser(ctx)
    if (!user) {
      return {
        allowedPages: [],
        role: "unknown",
        isCustomized: false,
      }
    }

    // Get user's membership in the active organization
    const activeOrgId = await ctx.runQuery(
      components.betterAuth.organizations.getActiveOrganizationId,
      {}
    )

    if (!activeOrgId) {
      return {
        allowedPages: [],
        role: "unknown",
        isCustomized: false,
      }
    }

    // Get membership to determine role
    const memberships = await ctx.runQuery(
      components.betterAuth.organizations.getUserMemberships,
      { userId: user._id.toString() }
    )

    const membership = memberships.find((m) => m.organizationId === activeOrgId)

    if (!membership) {
      return {
        allowedPages: [],
        role: "unknown",
        isCustomized: false,
      }
    }

    // Get the actual role from Better Auth membership
    // Better Auth stores: "owner", "admin", "member" by default
    // We map "member" to our new roles or use the role directly if it's one of ours
    const betterAuthRole = membership.role as string

    // Determine the effective role
    // If it's a legacy "member" role, map to "cashier" (most common use case)
    // Otherwise use the role directly if it's one of our defined roles
    let effectiveRole: OrganizationRole
    const validRoles = ORGANIZATION_ROLES.map((r) => r.value)

    if (validRoles.includes(betterAuthRole as OrganizationRole)) {
      effectiveRole = betterAuthRole as OrganizationRole
    } else if (betterAuthRole === "member") {
      // Legacy "member" role maps to "cashier"
      effectiveRole = "cashier"
    } else {
      // Unknown role, default to viewer (most restrictive)
      effectiveRole = "viewer"
    }

    // Get org-specific permissions
    const permissions = await ctx.db
      .query("organizationPermissions")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", activeOrgId)
      )
      .first()

    // Platform-wide defaults (singleton)
    const platformDefaults = await ctx.db
      .query("platformPermissionsDefaults")
      .first()

    // Build fallback pages for each role from platform defaults or code defaults
    const getFallbackPages = (role: OrganizationRole): string[] => {
      const roleFieldMap: Record<OrganizationRole, string> = {
        owner: "ownerAllowedPages",
        admin: "adminAllowedPages",
        manager: "managerAllowedPages",
        cashier: "cashierAllowedPages",
        kitchen: "kitchenAllowedPages",
        viewer: "viewerAllowedPages",
      }
      const field = roleFieldMap[role]
      const platformPages = platformDefaults?.[
        field as keyof typeof platformDefaults
      ] as string[] | undefined
      return platformPages ?? [...DEFAULT_PERMISSIONS[role]]
    }

    // Resolve permissions for the effective role
    let allowedPages: string[]
    let isCustomized = false

    if (permissions) {
      // Check if org has custom permissions for this role
      const roleFieldMap: Record<OrganizationRole, string> = {
        owner: "ownerAllowedPages",
        admin: "adminAllowedPages",
        manager: "managerAllowedPages",
        cashier: "cashierAllowedPages",
        kitchen: "kitchenAllowedPages",
        viewer: "viewerAllowedPages",
      }
      const field = roleFieldMap[effectiveRole]
      const orgPages = permissions[field as keyof typeof permissions] as
        | string[]
        | undefined

      if (orgPages && orgPages.length > 0) {
        allowedPages = orgPages
        isCustomized = true
      } else {
        // Fall back to platform defaults or code defaults
        allowedPages = getFallbackPages(effectiveRole)
      }
    } else {
      // No custom permissions, use platform defaults or code defaults
      allowedPages = getFallbackPages(effectiveRole)
    }

    return {
      allowedPages,
      role: effectiveRole,
      isCustomized,
    }
  },
})

/**
 * Update permissions for a specific role in the organization
 * Only org owners can update permissions
 */
export const updateRolePermissions = mutation({
  args: {
    role: v.string(),
    allowedPages: v.array(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // Verify user is owner of the organization
    const user = await authComponent.getAuthUser(ctx)
    if (!user) {
      throw new ConvexError("Not authenticated")
    }

    const activeOrgId = await ctx.runQuery(
      components.betterAuth.organizations.getActiveOrganizationId,
      {}
    )

    if (!activeOrgId) {
      throw new ConvexError("No active organization")
    }

    const memberships = await ctx.runQuery(
      components.betterAuth.organizations.getUserMemberships,
      { userId: user._id.toString() }
    )

    const membership = memberships.find((m) => m.organizationId === activeOrgId)

    if (!membership || membership.role !== "owner") {
      throw new ConvexError("Only organization owners can update permissions")
    }

    // Validate role
    const validRoles = ORGANIZATION_ROLES.map((r) => r.value)
    if (!validRoles.includes(args.role as OrganizationRole)) {
      throw new ConvexError(`Invalid role: ${args.role}`)
    }

    // Validate pages - can only grant pages that exist
    // For non-owner roles, also exclude admin-team-only pages
    const validPages = args.allowedPages.filter((page) => {
      const isValidPage = ALL_AVAILABLE_PAGES.includes(
        page as (typeof ALL_AVAILABLE_PAGES)[number]
      )
      if (args.role === "owner") {
        return isValidPage
      }
      const isAdminTeamOnly = ADMIN_TEAM_ONLY_PAGES.includes(
        page as (typeof ADMIN_TEAM_ONLY_PAGES)[number]
      )
      return isValidPage && !isAdminTeamOnly
    })

    // Get existing permissions
    const existing = await ctx.db
      .query("organizationPermissions")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", activeOrgId)
      )
      .first()

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
      await ctx.db.insert("organizationPermissions", {
        organizationId: activeOrgId,
        [field]: validPages,
        lastModifiedBy: user._id.toString(),
        lastModifiedAt: Date.now(),
      })
    }

    return { success: true }
  },
})

/**
 * Update member permissions for the organization (legacy - maps to cashier)
 * Only org owners can update permissions
 * @deprecated Use updateRolePermissions instead
 */
export const updateMemberPermissions = mutation({
  args: {
    allowedPages: v.array(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // Verify user is owner of the organization
    const user = await authComponent.getAuthUser(ctx)
    if (!user) {
      throw new ConvexError("Not authenticated")
    }

    const activeOrgId = await ctx.runQuery(
      components.betterAuth.organizations.getActiveOrganizationId,
      {}
    )

    if (!activeOrgId) {
      throw new ConvexError("No active organization")
    }

    const memberships = await ctx.runQuery(
      components.betterAuth.organizations.getUserMemberships,
      { userId: user._id.toString() }
    )

    const membership = memberships.find((m) => m.organizationId === activeOrgId)

    if (!membership || membership.role !== "owner") {
      throw new ConvexError("Only organization owners can update permissions")
    }

    // Validate pages - can only grant pages that exist and are not admin-team-only
    const validPages = args.allowedPages.filter(
      (page) =>
        ALL_AVAILABLE_PAGES.includes(
          page as (typeof ALL_AVAILABLE_PAGES)[number]
        ) &&
        !ADMIN_TEAM_ONLY_PAGES.includes(
          page as (typeof ADMIN_TEAM_ONLY_PAGES)[number]
        )
    )

    // Get existing permissions
    const existing = await ctx.db
      .query("organizationPermissions")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", activeOrgId)
      )
      .first()

    // Update cashier permissions (legacy member role)
    if (existing) {
      await ctx.db.patch(existing._id, {
        cashierAllowedPages: validPages,
        memberAllowedPages: validPages, // Keep legacy field in sync
        lastModifiedBy: user._id.toString(),
        lastModifiedAt: Date.now(),
      })
    } else {
      await ctx.db.insert("organizationPermissions", {
        organizationId: activeOrgId,
        cashierAllowedPages: validPages,
        memberAllowedPages: validPages, // Keep legacy field in sync
        lastModifiedBy: user._id.toString(),
        lastModifiedAt: Date.now(),
      })
    }

    return { success: true }
  },
})

/**
 * Reset permissions to defaults
 * Only org owners can reset permissions
 */
export const resetToDefaults = mutation({
  args: {},
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx) => {
    // Verify user is owner of the organization
    const user = await authComponent.getAuthUser(ctx)
    if (!user) {
      throw new ConvexError("Not authenticated")
    }

    const activeOrgId = await ctx.runQuery(
      components.betterAuth.organizations.getActiveOrganizationId,
      {}
    )

    if (!activeOrgId) {
      throw new ConvexError("No active organization")
    }

    const memberships = await ctx.runQuery(
      components.betterAuth.organizations.getUserMemberships,
      { userId: user._id.toString() }
    )

    const membership = memberships.find((m) => m.organizationId === activeOrgId)

    if (!membership || membership.role !== "owner") {
      throw new ConvexError("Only organization owners can reset permissions")
    }

    // Delete existing permissions (will fall back to defaults)
    const existing = await ctx.db
      .query("organizationPermissions")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", activeOrgId)
      )
      .first()

    if (existing) {
      await ctx.db.delete(existing._id)
    }

    return { success: true }
  },
})

/**
 * Auto-migrate legacy permission fields for the current organization
 * This is called automatically when loading the dashboard to ensure
 * old data is migrated to the new format.
 *
 * Migrations performed:
 * - memberAllowedPages → cashierAllowedPages (if cashierAllowedPages is not set)
 */
export const autoMigratePermissions = mutation({
  args: {},
  returns: v.object({
    migrated: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx)
    if (!user) {
      return { migrated: false, message: "Not authenticated" }
    }

    const activeOrgId = await ctx.runQuery(
      components.betterAuth.organizations.getActiveOrganizationId,
      {}
    )

    if (!activeOrgId) {
      return { migrated: false, message: "No active organization" }
    }

    // Check org permissions
    const permissions = await ctx.db
      .query("organizationPermissions")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", activeOrgId)
      )
      .first()

    if (permissions?.memberAllowedPages && !permissions.cashierAllowedPages) {
      await ctx.db.patch(permissions._id, {
        cashierAllowedPages: permissions.memberAllowedPages,
      })
      return {
        migrated: true,
        message: "Migrated memberAllowedPages to cashierAllowedPages",
      }
    }

    return { migrated: false, message: "No migration needed" }
  },
})
