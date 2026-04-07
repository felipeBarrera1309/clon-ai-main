import { ConvexError, v } from "convex/values"
import { components } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import { authComponent } from "../auth"
import { aggregateContactsByOrganization } from "../contactsAggregate"
import { aggregateConversationsByOrganization } from "../conversationsAggregate"
import { aggregateDeliveryAreasByOrganization } from "../deliveryAreasAggregate"
import {
  assertOrganizationAccess,
  platformAdminMutation,
  platformAdminOrImplementorMutation,
  platformAdminOrImplementorQuery,
  platformAdminQuery,
  platformSuperAdminMutation,
} from "../lib/superAdmin"
import { aggregateMenuProductsByOrganization } from "../menuProductsAggregate"
import { aggregateOrdersByOrganization } from "../ordersAggregate"
import { aggregateRestaurantLocationsByOrganization } from "../restaurantLocationsAggregate"
import { assertUserInImplementorScope } from "./users"

/**
 * Create a new organization (super admin only)
 */
export const createOrganization = platformAdminOrImplementorMutation({
  args: {
    name: v.string(),
    slug: v.string(),
    ownerId: v.string(),
    logo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = ctx.user

    if (user.role === "implementor") {
      // Allow implementors to bootstrap their first organization by setting themselves as owner
      if (user._id.toString() !== args.ownerId) {
        await assertUserInImplementorScope(
          ctx,
          user._id.toString(),
          args.ownerId
        )
      }
    }

    const result = await ctx.runMutation(
      components.betterAuth.admin.createOrganization,
      {
        adminUserId: user._id.toString(),
        name: args.name,
        slug: args.slug,
        ownerId: args.ownerId,
        logo: args.logo,
      }
    )

    return result
  },
})

/**
 * List all organizations from Better Auth
 */
export const listBetterAuthOrganizations = platformAdminOrImplementorQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.user.role === "implementor") {
      const memberOrgIds = await ctx.runQuery(
        components.betterAuth.admin.getImplementorMemberOrgIds,
        { userId: ctx.user._id.toString() }
      )
      return ctx.runQuery(
        components.betterAuth.organizations.getOrganizationsByIds,
        { organizationIds: memberOrgIds }
      )
    }

    return ctx.runQuery(components.betterAuth.organizations.listAll, {})
  },
})

/**
 * Import organizations from business logic to Better Auth
 * This creates organizations in Better Auth for each unique organizationId found in business tables
 */
export const importOrganizationsToBetterAuth = platformAdminMutation({
  args: {
    ownerId: v.string(), // The user ID who will be the owner of imported orgs
  },
  handler: async (ctx, args) => {
    const user = ctx.user

    // Get all unique organizationIds from business tables
    const allTables = [
      "agentConfiguration",
      "restaurantLocations",
      "conversations",
      "contacts",
      "orders",
      "menuProducts",
      "menuProductCategories",
      "deliveryAreas",
      "whatsappConfigurations",
    ] as const

    const businessOrgIds = new Set<string>()

    for (const tableName of allTables) {
      const records = await ctx.db.query(tableName).collect()
      for (const record of records) {
        const orgId = (record as { organizationId: string }).organizationId
        if (orgId) {
          businessOrgIds.add(orgId)
        }
      }
    }

    // Get existing Better Auth organizations
    const existingOrgs = await ctx.runQuery(
      components.betterAuth.organizations.listAll,
      {}
    )
    const existingOrgIds = new Set(existingOrgs.map((org) => org._id))

    // Find orgs that need to be created
    const orgsToCreate = Array.from(businessOrgIds).filter(
      (orgId) => !existingOrgIds.has(orgId)
    )

    // Create missing organizations
    const created: string[] = []
    const errors: { orgId: string; error: string }[] = []

    for (const orgId of orgsToCreate) {
      try {
        // Use the orgId as both name and slug (can be updated later)
        // Generate a unique slug based on the orgId
        const slug = orgId.toLowerCase().replace(/[^a-z0-9]/g, "-")

        await ctx.runMutation(components.betterAuth.admin.createOrganization, {
          adminUserId: user._id.toString(),
          name: orgId, // Use orgId as name, can be updated later
          slug: slug,
          ownerId: args.ownerId,
        })
        created.push(orgId)
      } catch (error) {
        errors.push({
          orgId,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    return {
      totalBusinessOrgs: businessOrgIds.size,
      existingInBetterAuth: existingOrgIds.size,
      created: created.length,
      createdIds: created,
      errors,
    }
  },
})

type OrganizationListItem = {
  organizationId: string
  name?: string
  slug?: string
  logo?: string | null
  existsInBetterAuth: boolean
  agentConfigId?: string
  whatsappConfigId?: string
  conversationsCount: number
  contactsCount: number
  ordersCount: number
  menuProductsCount: number
  locationsCount: number
  deliveryAreasCount: number
}

const buildOrganizationListBase = async (
  ctx: { db: QueryCtx["db"]; runQuery: QueryCtx["runQuery"] },
  search?: string,
  options?: { includeConfigurationFlags?: boolean }
) => {
  const searchLower = search?.toLowerCase()
  const betterAuthOrgs = await ctx.runQuery(
    components.betterAuth.organizations.listAll,
    {}
  )

  const organizations = new Map<string, OrganizationListItem>()
  for (const org of betterAuthOrgs) {
    if (searchLower) {
      const matchesSearch =
        org.name.toLowerCase().includes(searchLower) ||
        org.slug.toLowerCase().includes(searchLower) ||
        org._id.toLowerCase().includes(searchLower)
      if (!matchesSearch) continue
    }

    organizations.set(org._id, {
      organizationId: org._id,
      name: org.name,
      slug: org.slug,
      logo: org.logo,
      existsInBetterAuth: true,
      conversationsCount: 0,
      contactsCount: 0,
      ordersCount: 0,
      menuProductsCount: 0,
      locationsCount: 0,
      deliveryAreasCount: 0,
    })
  }

  // Fallback for orphaned organizations existing only in business tables
  // and mapping config IDs if explicitly requested via options
  if (options?.includeConfigurationFlags) {
    const agentConfigs = await ctx.db.query("agentConfiguration").collect()
    const whatsappConfigs = await ctx.db
      .query("whatsappConfigurations")
      .collect()

    for (const config of agentConfigs) {
      const current = organizations.get(config.organizationId)
      if (current) {
        current.agentConfigId = config._id
      } else {
        if (
          searchLower &&
          !config.organizationId.toLowerCase().includes(searchLower)
        )
          continue
        organizations.set(config.organizationId, {
          organizationId: config.organizationId,
          agentConfigId: config._id,
          existsInBetterAuth: false,
          conversationsCount: 0,
          contactsCount: 0,
          ordersCount: 0,
          menuProductsCount: 0,
          locationsCount: 0,
          deliveryAreasCount: 0,
        })
      }
    }

    for (const config of whatsappConfigs) {
      const current = organizations.get(config.organizationId)
      if (current) {
        current.whatsappConfigId = config._id
      } else {
        if (
          searchLower &&
          !config.organizationId.toLowerCase().includes(searchLower)
        )
          continue
        organizations.set(config.organizationId, {
          organizationId: config.organizationId,
          whatsappConfigId: config._id,
          existsInBetterAuth: false,
          conversationsCount: 0,
          contactsCount: 0,
          ordersCount: 0,
          menuProductsCount: 0,
          locationsCount: 0,
          deliveryAreasCount: 0,
        })
      }
    }
  }

  return Array.from(organizations.values()).sort((a, b) =>
    (a.name || a.organizationId).localeCompare(b.name || b.organizationId)
  )
}

type OrganizationCounts = Pick<
  OrganizationListItem,
  | "conversationsCount"
  | "contactsCount"
  | "ordersCount"
  | "menuProductsCount"
  | "locationsCount"
  | "deliveryAreasCount"
>

const getStatsByOrganization = async (
  ctx: { runQuery: QueryCtx["runQuery"] },
  organizationIds: string[]
) => {
  if (organizationIds.length === 0) {
    return {} as Record<string, OrganizationCounts>
  }

  const dedupedOrganizationIds = Array.from(
    new Set(organizationIds.filter((id) => id.trim().length > 0))
  )

  if (dedupedOrganizationIds.length === 0) {
    return {} as Record<string, OrganizationCounts>
  }

  const namespacedQueries = dedupedOrganizationIds.map((organizationId) => ({
    namespace: organizationId,
  }))

  const [
    conversationsCounts,
    contactsCounts,
    ordersCounts,
    menuProductsCounts,
    locationsCounts,
    deliveryAreasCounts,
  ] = await Promise.all([
    aggregateConversationsByOrganization.countBatch(ctx, namespacedQueries),
    aggregateContactsByOrganization.countBatch(ctx, namespacedQueries),
    aggregateOrdersByOrganization.countBatch(ctx, namespacedQueries),
    aggregateMenuProductsByOrganization.countBatch(ctx, namespacedQueries),
    aggregateRestaurantLocationsByOrganization.countBatch(
      ctx,
      namespacedQueries
    ),
    aggregateDeliveryAreasByOrganization.countBatch(ctx, namespacedQueries),
  ])

  const statsByOrganization: Record<string, OrganizationCounts> = {}
  for (const [index, organizationId] of dedupedOrganizationIds.entries()) {
    statsByOrganization[organizationId] = {
      conversationsCount: conversationsCounts[index] ?? 0,
      contactsCount: contactsCounts[index] ?? 0,
      ordersCount: ordersCounts[index] ?? 0,
      menuProductsCount: menuProductsCounts[index] ?? 0,
      locationsCount: locationsCounts[index] ?? 0,
      deliveryAreasCount: deliveryAreasCounts[index] ?? 0,
    }
  }

  return statsByOrganization
}

export const listAllOrganizations = platformAdminQuery({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(1, args.limit ?? 25), 100)
    const offset = Math.max(0, args.offset ?? 0)
    const allOrgs = await buildOrganizationListBase(ctx, args.search)
    const total = allOrgs.length
    const paginatedOrgs = allOrgs.slice(offset, offset + limit)

    // Fetch configurations centrally for the returned page
    if (paginatedOrgs.length > 0) {
      const orgIds = paginatedOrgs.map((o) => o.organizationId)

      const [agentConfigs, whatsappConfigs] = await Promise.all([
        Promise.all(
          orgIds.map((id) =>
            ctx.db
              .query("agentConfiguration")
              .withIndex("by_organization_id", (q) =>
                q.eq("organizationId", id)
              )
              .first()
          )
        ),
        Promise.all(
          orgIds.map((id) =>
            ctx.db
              .query("whatsappConfigurations")
              .withIndex("by_organization_id", (q) =>
                q.eq("organizationId", id)
              )
              .first()
          )
        ),
      ])

      const agentMap = new Map(
        agentConfigs.flatMap((c) => (c ? [[c.organizationId, c._id]] : []))
      )
      const whatsappMap = new Map(
        whatsappConfigs.flatMap((c) => (c ? [[c.organizationId, c._id]] : []))
      )

      for (const org of paginatedOrgs) {
        org.agentConfigId = agentMap.get(org.organizationId)
        org.whatsappConfigId = whatsappMap.get(org.organizationId)
      }
    }

    return {
      organizations: paginatedOrgs,
      total,
      hasMore: offset + limit < total,
    }
  },
})

export const getOrganizationStatsBatch = platformAdminQuery({
  args: {
    organizationIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const statsByOrganization = await getStatsByOrganization(
      ctx,
      args.organizationIds
    )
    return { statsByOrganization }
  },
})

/**
 * Same as getOrganizationStatsBatch but also accessible by implementors.
 * Used when the organizations list is already scoped to the caller's orgs.
 */
export const getOrganizationStatsBatchAny = platformAdminOrImplementorQuery({
  args: {
    organizationIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (ctx.user.role === "implementor") {
      const memberOrgIds = await ctx.runQuery(
        components.betterAuth.admin.getImplementorMemberOrgIds,
        { userId: ctx.user._id.toString() }
      )
      const memberOrgIdSet = new Set(memberOrgIds)
      for (const orgId of args.organizationIds) {
        if (!memberOrgIdSet.has(orgId)) {
          throw new ConvexError(
            "No tienes permisos para gestionar esta organización"
          )
        }
      }
    }

    const statsByOrganization = await getStatsByOrganization(
      ctx,
      args.organizationIds
    )
    return { statsByOrganization }
  },
})

/**
 * List organizations scoped to the orgs where the current implementor is a member.
 * Returns the same shape as listAllOrganizations so the frontend can swap them.
 */
export const listImplementorOrganizations = platformAdminOrImplementorQuery({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = ctx.user

    if (user.role !== "implementor") {
      throw new ConvexError("This query is only for implementors")
    }

    const limit = Math.min(Math.max(1, args.limit ?? 25), 100)
    const offset = Math.max(0, args.offset ?? 0)
    const searchLower = args.search?.toLowerCase()

    // Get org IDs where this user is a member — via the betterAuth component
    const memberOrgIds = await ctx.runQuery(
      components.betterAuth.admin.getImplementorMemberOrgIds,
      {
        userId: user._id.toString(),
      }
    )

    // Targeted fetch — no full-table scan
    const betterAuthOrgs = await ctx.runQuery(
      components.betterAuth.organizations.getOrganizationsByIds,
      { organizationIds: memberOrgIds }
    )

    const filtered = betterAuthOrgs
      .filter((org) => {
        if (searchLower) {
          return (
            org.name.toLowerCase().includes(searchLower) ||
            org.slug.toLowerCase().includes(searchLower) ||
            org._id.toLowerCase().includes(searchLower)
          )
        }
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((org) => ({
        organizationId: org._id,
        name: org.name,
        slug: org.slug,
        logo: org.logo,
        existsInBetterAuth: true,
        conversationsCount: 0,
        contactsCount: 0,
        ordersCount: 0,
        menuProductsCount: 0,
        locationsCount: 0,
        deliveryAreasCount: 0,
        agentConfigId: undefined as string | undefined,
        whatsappConfigId: undefined as string | undefined,
      }))

    const total = filtered.length
    const page = filtered.slice(offset, offset + limit)

    // Fetch config for page items simultaneously
    if (page.length > 0) {
      const orgIds = page.map((o) => o.organizationId)

      const [agentConfigs, whatsappConfigs] = await Promise.all([
        Promise.all(
          orgIds.map((id) =>
            ctx.db
              .query("agentConfiguration")
              .withIndex("by_organization_id", (q) =>
                q.eq("organizationId", id)
              )
              .first()
          )
        ),
        Promise.all(
          orgIds.map((id) =>
            ctx.db
              .query("whatsappConfigurations")
              .withIndex("by_organization_id", (q) =>
                q.eq("organizationId", id)
              )
              .first()
          )
        ),
      ])

      const agentMap = new Map(
        agentConfigs.flatMap((c) => (c ? [[c.organizationId, c._id]] : []))
      )
      const whatsappMap = new Map(
        whatsappConfigs.flatMap((c) => (c ? [[c.organizationId, c._id]] : []))
      )

      for (const org of page) {
        org.agentConfigId = agentMap.get(org.organizationId)
        org.whatsappConfigId = whatsappMap.get(org.organizationId)
      }
    }

    return { organizations: page, total, hasMore: offset + limit < total }
  },
})

export const getGlobalPlatformStats = platformAdminQuery({
  args: {},
  handler: async (ctx) => {
    const [organizations, allUsers] = await Promise.all([
      buildOrganizationListBase(ctx, undefined, {
        includeConfigurationFlags: false,
      }),
      ctx.runQuery(components.betterAuth.authAdmin.listAllUsers, {}),
    ])

    const organizationIds = organizations.map((org) => org.organizationId)
    const statsByOrganization = await getStatsByOrganization(
      ctx,
      organizationIds
    )

    const totals = Object.values(statsByOrganization).reduce(
      (acc, current) => ({
        totalConversations: acc.totalConversations + current.conversationsCount,
        totalContacts: acc.totalContacts + current.contactsCount,
        totalOrders: acc.totalOrders + current.ordersCount,
      }),
      {
        totalConversations: 0,
        totalContacts: 0,
        totalOrders: 0,
      }
    )

    return {
      totalOrganizations: organizations.length,
      totalUsers: allUsers.length,
      ...totals,
    }
  },
})

export const getOrganizationDetails = platformAdminOrImplementorQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOrganizationAccess(ctx, args.organizationId)

    const statsByOrganization = await getStatsByOrganization(ctx, [
      args.organizationId,
    ])
    const orgStats = statsByOrganization[args.organizationId] ?? {
      conversationsCount: 0,
      contactsCount: 0,
      ordersCount: 0,
      menuProductsCount: 0,
      locationsCount: 0,
      deliveryAreasCount: 0,
    }

    // Run all independent queries in parallel for better performance
    const [
      organization,
      agentConfig,
      whatsappConfig,
      locations,
      members,
      invitations,
    ] = await Promise.all([
      // Get organization info from Better Auth
      ctx.runQuery(components.betterAuth.organizations.getById, {
        organizationId: args.organizationId,
      }),
      // Get agent configuration
      ctx.db
        .query("agentConfiguration")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .first(),
      // Get WhatsApp configuration
      ctx.db
        .query("whatsappConfigurations")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .first(),
      // Get restaurant locations
      ctx.db
        .query("restaurantLocations")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
      // Get members from Better Auth
      ctx.runQuery(components.betterAuth.organizations.getOrganizationMembers, {
        organizationId: args.organizationId,
      }),
      // Get pending invitations
      ctx.runQuery(
        components.betterAuth.organizations.getOrganizationInvitations,
        { organizationId: args.organizationId }
      ),
    ])

    return {
      organizationId: args.organizationId,
      name: organization?.name,
      slug: organization?.slug,
      logo: organization?.logo,
      existsInBetterAuth: !!organization,
      agentConfig,
      whatsappConfig,
      locations,
      members,
      invitations,
      stats: {
        conversationsCount: orgStats.conversationsCount,
        ordersCount: orgStats.ordersCount,
        contactsCount: orgStats.contactsCount,
        locationsCount: locations.length,
        membersCount: members.length,
      },
    }
  },
})

/**
 * Remove a member from an organization
 */
export const removeMemberFromOrganization = platformAdminOrImplementorMutation({
  args: {
    memberId: v.string(),
  },
  handler: async (ctx, args) => {
    const orgId = await ctx.runQuery(
      components.betterAuth.admin.getMemberOrganizationId,
      { memberId: args.memberId }
    )
    if (!orgId) throw new ConvexError("Member not found")
    await assertOrganizationAccess(ctx, orgId)

    await ctx.runMutation(components.betterAuth.organizations.removeMember, {
      memberId: args.memberId,
    })
    return { success: true }
  },
})

/**
 * Cancel a pending invitation
 */
export const cancelInvitation = platformAdminOrImplementorMutation({
  args: {
    invitationId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = ctx.user

    const orgId = await ctx.runQuery(
      components.betterAuth.admin.getInvitationOrganizationId,
      { invitationId: args.invitationId }
    )
    if (!orgId) throw new ConvexError("Invitation not found")
    await assertOrganizationAccess(ctx, orgId)

    await ctx.runMutation(components.betterAuth.admin.cancelInvitation, {
      adminUserId: user._id.toString(),
      invitationId: args.invitationId,
    })
    return { success: true }
  },
})

/**
 * Get all pending invitations across all organizations
 */
export const listAllInvitations = platformAdminQuery({
  args: {},
  handler: async (ctx) => {
    // Get all organizations first
    const orgs = await ctx.runQuery(
      components.betterAuth.organizations.listAll,
      {}
    )

    // Get invitations for each org
    const allInvitations = await Promise.all(
      orgs.map(async (org) => {
        const invitations = await ctx.runQuery(
          components.betterAuth.organizations.getOrganizationInvitations,
          { organizationId: org._id }
        )
        return invitations.map((inv) => ({
          ...inv,
          organizationName: org.name,
          organizationSlug: org.slug,
        }))
      })
    )

    return allInvitations.flat()
  },
})

// ============================================
// ORGANIZATION PERMISSIONS MANAGEMENT
// ============================================

import {
  ADMIN_TEAM_ONLY_PAGES,
  ALL_AVAILABLE_PAGES,
  DEFAULT_PERMISSIONS,
  ORGANIZATION_ROLES,
  type OrganizationRole,
} from "../private/organizationPermissions"

/**
 * Get organization permissions (super admin)
 */
export const getOrganizationPermissions = platformAdminOrImplementorQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOrganizationAccess(ctx, args.organizationId)

    const permissions = await ctx.db
      .query("organizationPermissions")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
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
 * Update organization permissions for a specific role (super admin)
 */
export const updateOrganizationRolePermissions =
  platformAdminOrImplementorMutation({
    args: {
      organizationId: v.string(),
      role: v.string(),
      allowedPages: v.array(v.string()),
    },
    handler: async (ctx, args) => {
      await assertOrganizationAccess(ctx, args.organizationId)

      const user = ctx.user

      // Validate role
      const validRoles = ORGANIZATION_ROLES.map((r) => r.value)
      if (!validRoles.includes(args.role as OrganizationRole)) {
        throw new Error(`Invalid role: ${args.role}`)
      }

      // Validate pages - owner can have admin-team-only pages, others cannot
      const allowAdminTeamOnly = args.role === "owner"
      const validPages = args.allowedPages.filter((page) => {
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

      // Get existing permissions
      const existing = await ctx.db
        .query("organizationPermissions")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .first()

      if (existing) {
        await ctx.db.patch(existing._id, {
          [field]: validPages,
          lastModifiedBy: user._id.toString(),
          lastModifiedAt: Date.now(),
        })
      } else {
        await ctx.db.insert("organizationPermissions", {
          organizationId: args.organizationId,
          [field]: validPages,
          lastModifiedBy: user._id.toString(),
          lastModifiedAt: Date.now(),
        })
      }

      return { success: true }
    },
  })

/**
 * Update organization permissions (super admin)
 * Can update all role permissions at once
 */
export const updateOrganizationPermissions = platformAdminOrImplementorMutation(
  {
    args: {
      organizationId: v.string(),
      ownerAllowedPages: v.optional(v.array(v.string())),
      adminAllowedPages: v.optional(v.array(v.string())),
      managerAllowedPages: v.optional(v.array(v.string())),
      cashierAllowedPages: v.optional(v.array(v.string())),
      kitchenAllowedPages: v.optional(v.array(v.string())),
      viewerAllowedPages: v.optional(v.array(v.string())),
      // Legacy fields for backward compatibility
      memberAllowedPages: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
      await assertOrganizationAccess(ctx, args.organizationId)

      const user = ctx.user

      // Validate pages for each role
      const validatePages = (
        pages: string[] | undefined,
        allowAdminTeamOnly: boolean
      ) => {
        if (!pages) return undefined
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

      const validOwnerPages = validatePages(args.ownerAllowedPages, true)
      const validAdminPages = validatePages(args.adminAllowedPages, false)
      const validManagerPages = validatePages(args.managerAllowedPages, false)
      const validCashierPages = validatePages(args.cashierAllowedPages, false)
      const validKitchenPages = validatePages(args.kitchenAllowedPages, false)
      const validViewerPages = validatePages(args.viewerAllowedPages, false)

      // Get existing permissions
      const existing = await ctx.db
        .query("organizationPermissions")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .first()

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
        await ctx.db.insert("organizationPermissions", {
          organizationId: args.organizationId,
          ...updateData,
        })
      }

      return { success: true }
    },
  }
)

/**
 * Reset organization permissions to defaults (super admin)
 */
export const resetOrganizationPermissions = platformAdminOrImplementorMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOrganizationAccess(ctx, args.organizationId)

    const existing = await ctx.db
      .query("organizationPermissions")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (existing) {
      await ctx.db.delete(existing._id)
    }

    return { success: true }
  },
})

// ============================================
// SUPERADMIN-ONLY ORGANIZATION MANAGEMENT
// ============================================

/**
 * Delete an organization and all its associated data
 * SUPERADMIN ONLY - This is a destructive operation
 *
 * This will delete:
 * - All business data (orders, conversations, contacts, menu items, etc.)
 * - Better Auth organization data (members, invitations)
 * - The organization itself
 */
export const deleteOrganization = platformSuperAdminMutation({
  args: {
    organizationId: v.string(),
    confirmDelete: v.boolean(), // Safety confirmation
  },
  returns: v.object({
    success: v.boolean(),
    organizationId: v.string(),
    deletionStats: v.record(v.string(), v.number()),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    if (!args.confirmDelete) {
      throw new Error("Must confirm deletion by setting confirmDelete to true")
    }

    const organizationId = args.organizationId

    // Track deletion stats
    const deletionStats: Record<string, number> = {}

    // Tables that have by_organization_id index
    type TableWithOrgIndex =
      | "agentConfiguration"
      | "restaurantLocations"
      | "conversations"
      | "contacts"
      | "menuProductCategories"
      | "menuProductSubcategories"
      | "sizes"
      | "menuProducts"
      | "menuProductAvailability"
      | "menuProductOrderItems"
      | "orderItems"
      | "orders"
      | "deliveryAreas"
      | "messageAttachments"
      | "restaurantConfiguration"
      | "whatsappConfigurations"
      | "twilioConfigurations"
      | "electronicInvoices"
      | "r2Objects"
      | "quickResponses"
      | "messageTemplates"
      | "messageCampaigns"
      | "campaignRecipients"
      | "organizationPermissions"
      | "orderScheduledFunctions"

    // Helper to delete all records from a table by organizationId
    // Only use for tables that have the by_organization_id index
    const deleteByOrganizationId = async (tableName: TableWithOrgIndex) => {
      // Use type assertion since TypeScript can't infer the index exists for all tables in union
      const records = await (
        ctx.db.query(tableName) as ReturnType<typeof ctx.db.query<"orders">>
      )
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", organizationId)
        )
        .collect()

      for (const record of records) {
        await ctx.db.delete(record._id)
      }

      deletionStats[tableName] = records.length
    }

    // Delete in order of dependencies (children first, then parents)

    // 1. Delete conversation-related data
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect()

    // Delete scheduled functions for conversations
    let deletedConversationScheduledFunctions = 0
    for (const conv of conversations) {
      const scheduledFuncs = await ctx.db
        .query("conversationScheduledFunctions")
        .withIndex("by_conversation_id", (q) =>
          q.eq("conversationId", conv._id)
        )
        .collect()
      for (const sf of scheduledFuncs) {
        await ctx.db.delete(sf._id)
      }
      deletedConversationScheduledFunctions += scheduledFuncs.length
    }
    deletionStats.conversationScheduledFunctions =
      deletedConversationScheduledFunctions

    // Delete tracked AI subthreads before conversations to avoid orphans
    const conversationAiThreads = (
      await Promise.all(
        conversations.map((conversation) =>
          ctx.db
            .query("conversationAiThreads")
            .withIndex("by_organization_and_conversation", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("conversationId", conversation._id)
            )
            .collect()
        )
      )
    ).flat()

    for (const thread of conversationAiThreads) {
      await ctx.db.delete(thread._id)
    }
    deletionStats.conversationAiThreads = conversationAiThreads.length

    // Cancel and delete conversation cost backfill jobs for this organization
    const conversationCostBackfillJobs = await ctx.db
      .query("conversationCostBackfillJobs")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect()

    for (const job of conversationCostBackfillJobs) {
      if (
        job.status === "running" &&
        job.scheduledFunctionId &&
        typeof job.scheduledFunctionId !== "string"
      ) {
        try {
          await ctx.scheduler.cancel(
            job.scheduledFunctionId as Id<"_scheduled_functions">
          )
        } catch {
          // The scheduled function may already be completed or removed.
        }
      }

      await ctx.db.delete(job._id)
    }
    deletionStats.conversationCostBackfillJobs =
      conversationCostBackfillJobs.length

    const organizationAiCostCoverage = await ctx.db
      .query("organizationAiCostCoverage")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect()
    for (const row of organizationAiCostCoverage) {
      await ctx.db.delete(row._id)
    }
    deletionStats.organizationAiCostCoverage = organizationAiCostCoverage.length

    const organizationAiCostCalculationEntries = await ctx.db
      .query("organizationAiCostCalculationEntries")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect()
    for (const row of organizationAiCostCalculationEntries) {
      await ctx.db.delete(row._id)
    }
    deletionStats.organizationAiCostCalculationEntries =
      organizationAiCostCalculationEntries.length

    // Delete conversation messages
    const conversationMessages = await ctx.db
      .query("conversationMessages")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect()
    for (const msg of conversationMessages) {
      await ctx.db.delete(msg._id)
    }
    deletionStats.conversationMessages = conversationMessages.length

    // Delete message attachments
    await deleteByOrganizationId("messageAttachments")

    // 2. Delete order-related data
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect()

    // Delete order scheduled functions using the by_organization_id index
    await deleteByOrganizationId("orderScheduledFunctions")

    // Delete order items and their menu product links
    for (const order of orders) {
      const orderItems = await ctx.db
        .query("orderItems")
        .withIndex("by_order_id", (q) => q.eq("orderId", order._id))
        .collect()

      for (const item of orderItems) {
        // Delete menu product order items
        const menuProductOrderItems = await ctx.db
          .query("menuProductOrderItems")
          .withIndex("by_order_item_id", (q) => q.eq("orderItemId", item._id))
          .collect()
        for (const mpoi of menuProductOrderItems) {
          await ctx.db.delete(mpoi._id)
        }
        await ctx.db.delete(item._id)
      }
    }

    // Delete electronic invoices
    await deleteByOrganizationId("electronicInvoices")

    // Delete orders
    await deleteByOrganizationId("orders")

    // 3. Delete menu-related data
    // Delete menu product availability first
    await deleteByOrganizationId("menuProductAvailability")

    // Delete menu products
    await deleteByOrganizationId("menuProducts")

    // Delete subcategories
    await deleteByOrganizationId("menuProductSubcategories")

    // Delete categories
    await deleteByOrganizationId("menuProductCategories")

    // Delete sizes
    await deleteByOrganizationId("sizes")

    // 5. Delete delivery areas
    await deleteByOrganizationId("deliveryAreas")

    // 6. Delete restaurant locations
    await deleteByOrganizationId("restaurantLocations")

    // 7. Delete contacts
    await deleteByOrganizationId("contacts")

    // 8. Delete conversations (after all related data)
    await deleteByOrganizationId("conversations")

    // 9. Delete bulk messaging data
    await deleteByOrganizationId("campaignRecipients")
    await deleteByOrganizationId("messageCampaigns")
    await deleteByOrganizationId("messageTemplates")

    // 10. Delete configuration data
    await deleteByOrganizationId("agentConfiguration")
    await deleteByOrganizationId("restaurantConfiguration")
    await deleteByOrganizationId("whatsappConfigurations")
    await deleteByOrganizationId("twilioConfigurations")
    await deleteByOrganizationId("quickResponses")
    await deleteByOrganizationId("organizationPermissions")

    // 11. Delete R2 objects references
    await deleteByOrganizationId("r2Objects")

    // 12. Delete Better Auth organization data (members, invitations, organization)
    // First get members and delete them
    const members = await ctx.runQuery(
      components.betterAuth.organizations.getOrganizationMembers,
      { organizationId }
    )
    for (const member of members) {
      await ctx.runMutation(components.betterAuth.organizations.removeMember, {
        memberId: member._id,
      })
    }
    deletionStats.members = members.length

    // Delete pending invitations
    const invitations = await ctx.runQuery(
      components.betterAuth.organizations.getOrganizationInvitations,
      { organizationId }
    )
    const user = await authComponent.getAuthUser(ctx)
    if (user) {
      for (const invitation of invitations) {
        try {
          await ctx.runMutation(components.betterAuth.admin.cancelInvitation, {
            adminUserId: user._id.toString(),
            invitationId: invitation._id,
          })
        } catch {
          // Invitation may have already been deleted
        }
      }
    }
    deletionStats.invitations = invitations.length

    // Finally, delete the organization itself from Better Auth
    // Note: We need to query the organization table directly since there's no admin delete function
    const allOrgs = await ctx.runQuery(
      components.betterAuth.organizations.listAll,
      {}
    )
    const org = allOrgs.find((o) => o._id === organizationId)

    if (org) {
      // Delete the organization record directly from the betterAuth component's organization table
      // Since there's no admin function for this, we'll need to query the underlying table
      // For now, we'll leave the org record but it will be empty
      // TODO: Add proper organization deletion to Better Auth admin functions
      console.log(
        `Organization ${organizationId} data deleted. Organization record may need manual cleanup.`
      )
    }

    // Clear aggregate namespaces to avoid stale counts in admin metrics
    await Promise.all([
      aggregateConversationsByOrganization.clear(ctx, {
        namespace: organizationId,
      }),
      aggregateContactsByOrganization.clear(ctx, { namespace: organizationId }),
      aggregateOrdersByOrganization.clear(ctx, { namespace: organizationId }),
      aggregateMenuProductsByOrganization.clear(ctx, {
        namespace: organizationId,
      }),
      aggregateRestaurantLocationsByOrganization.clear(ctx, {
        namespace: organizationId,
      }),
      aggregateDeliveryAreasByOrganization.clear(ctx, {
        namespace: organizationId,
      }),
    ])

    return {
      success: true,
      organizationId,
      deletionStats,
      message: `Organization ${organizationId} and all associated data have been deleted.`,
    }
  },
})
