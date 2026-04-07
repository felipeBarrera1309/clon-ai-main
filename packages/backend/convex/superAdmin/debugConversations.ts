import { listMessages } from "@convex-dev/agent"
import { paginationOptsValidator } from "convex/server"
import { ConvexError, v } from "convex/values"
import { components } from "../_generated/api"
import { authComponent } from "../auth"
import { authMutation, authQuery } from "../lib/helpers"
import {
  platformSuperAdminMutation,
  platformSuperAdminQuery,
} from "../lib/superAdmin"

/**
 * List shared debug conversations
 * Returns all debug conversations regardless of organization (superadmin cross-org access)
 */
export const list = platformSuperAdminQuery({
  args: {},
  handler: async (ctx) => {
    const debugConversations = await ctx.db
      .query("adminDebugConversations")
      .withIndex("by_added_at")
      .order("desc")
      .take(100)

    const enriched = await Promise.all(
      debugConversations.map(async (item) => {
        const conversation = await ctx.db.get(item.conversationId)
        const contact = conversation
          ? await ctx.db.get(conversation.contactId)
          : null

        return {
          ...item,
          conversationStatus: conversation?.status ?? "unknown",
          contactPhone: contact?.phoneNumber,
        }
      })
    )

    // Sort by most recent activity (lastUpdatedAt if exists, otherwise addedAt)
    return enriched.sort((a, b) => {
      const aTime = a.lastUpdatedAt ?? a.addedAt
      const bTime = b.lastUpdatedAt ?? b.addedAt
      return bTime - aTime
    })
  },
})

export const listOrganizations = platformSuperAdminQuery({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.runQuery(
      components.betterAuth.organizations.listAll,
      {}
    )

    const organizationMap = new Map(organizations.map((org) => [org._id, org]))
    const aggregated = new Map<
      string,
      {
        organizationId: string
        organizationName?: string
        organizationSlug?: string
        organizationLogo?: string | null
        debugCount: number
        lastActivityAt: number
      }
    >()

    let cursor: string | null = null
    let hasMore = true
    const batchSize = 200
    const maxScan = 5000
    const maxOrganizations = 200
    let scanned = 0

    while (hasMore && scanned < maxScan && aggregated.size < maxOrganizations) {
      const page = await ctx.db
        .query("adminDebugConversations")
        .withIndex("by_added_at")
        .order("desc")
        .paginate({
          cursor,
          numItems: batchSize,
        })

      cursor = page.continueCursor
      hasMore = !page.isDone && page.continueCursor !== null
      scanned += page.page.length

      for (const item of page.page) {
        const current = aggregated.get(item.organizationId)
        const activityAt = item.lastUpdatedAt ?? item.addedAt
        if (!current) {
          const org = organizationMap.get(item.organizationId)
          aggregated.set(item.organizationId, {
            organizationId: item.organizationId,
            organizationName: org?.name,
            organizationSlug: org?.slug,
            organizationLogo: org?.logo,
            debugCount: 1,
            lastActivityAt: activityAt,
          })
          continue
        }

        current.debugCount += 1
        if (activityAt > current.lastActivityAt) {
          current.lastActivityAt = activityAt
        }
      }
    }

    return Array.from(aggregated.values()).sort((a, b) => {
      if (b.debugCount !== a.debugCount) {
        return b.debugCount - a.debugCount
      }

      return b.lastActivityAt - a.lastActivityAt
    })
  },
})

export const listByOrganization = platformSuperAdminQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    const maxItems = 300
    const debugConversations = await ctx.db
      .query("adminDebugConversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(maxItems)

    const enriched = await Promise.all(
      debugConversations.map(async (item) => {
        const conversation = await ctx.db.get(item.conversationId)
        const contact = conversation
          ? await ctx.db.get(conversation.contactId)
          : null

        return {
          ...item,
          conversationStatus: conversation?.status ?? "unknown",
          contactPhone: contact?.phoneNumber,
        }
      })
    )

    // Keep explicit sorting by last activity because records can be updated after creation.
    return enriched.sort((a, b) => {
      const aTime = a.lastUpdatedAt ?? a.addedAt
      const bTime = b.lastUpdatedAt ?? b.addedAt
      return bTime - aTime
    })
  },
})

export const listAllConfigs = platformSuperAdminMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("whatsappConfigurations").collect()
  },
})

/**
 * Search conversations by partial threadId or conversationId
 * Minimum 4 characters required
 * Optimized to avoid full table scans:
 * - Uses search index for threadId partial matching
 * - Limits results to prevent memory issues
 */
export const search = platformSuperAdminQuery({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    if (args.query.length < 4) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Search requires minimum 4 characters",
      })
    }

    const searchQuery = args.query.toLowerCase()

    // Use search index for threadId partial matching
    // This is more efficient than collecting all conversations
    const searchResults = await ctx.db
      .query("conversations")
      .withSearchIndex("search_thread_id", (q) =>
        q.search("threadId", args.query)
      )
      .take(50)

    // Also check by _id prefix if the query looks like an ID
    // IDs in Convex start with specific prefixes
    let idMatches: typeof searchResults = []
    if (args.query.length >= 4) {
      // Get recent conversations and filter by ID - limited to avoid full scan
      const recentConversations = await ctx.db
        .query("conversations")
        .order("desc")
        .take(500) // Limit to recent conversations for ID search

      idMatches = recentConversations.filter(
        (c) =>
          c._id.toLowerCase().includes(searchQuery) &&
          !searchResults.some((s) => s._id === c._id)
      )
    }

    // Combine and deduplicate results
    const allMatches = [...searchResults, ...idMatches].slice(0, 20)

    // Enrich with contact info
    const enriched = await Promise.all(
      allMatches.map(async (conv) => {
        const contact = await ctx.db.get(conv.contactId)
        return {
          _id: conv._id,
          threadId: conv.threadId,
          organizationId: conv.organizationId,
          status: conv.status,
          contactDisplayName: contact?.displayName,
          contactPhone: contact?.phoneNumber,
          _creationTime: conv._creationTime,
        }
      })
    )

    return enriched
  },
})

/**
 * Add a conversation to the debug list
 * Any authenticated user can add debug reports for conversations in their organization
 * Validates conversation exists, belongs to user's org, and updates if already exists
 */
export const add = authMutation({
  args: {
    organizationId: v.string(),
    conversationId: v.id("conversations"),
    reason: v.string(),
    expectedResponse: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx)
    if (!user)
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Not authenticated",
      })

    if (!args.reason.trim()) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Reason is required",
      })
    }

    const normalizedExpectedResponse = args.expectedResponse?.trim() || undefined

    // Verify conversation exists
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversation not found",
      })
    }

    // Verify conversation belongs to user's organization
    if (conversation.organizationId !== args.organizationId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You can only report conversations from your organization",
      })
    }

    // Check for existing entry
    const existing = await ctx.db
      .query("adminDebugConversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", conversation.threadId))
      .first()

    if (existing) {
      // Append new info to preserve historical context
      const updatedReason = `${existing.reason}\n\n--- Updated by ${user._id.toString()} ---\n${args.reason.trim()}`
      const nextExpectedResponse = normalizedExpectedResponse
      const updatedExpectedResponse = nextExpectedResponse
        ? existing.expectedResponse?.trim()
          ? `${existing.expectedResponse}\n\n--- Updated by ${user._id.toString()} ---\n${nextExpectedResponse}`
          : nextExpectedResponse
        : existing.expectedResponse

      await ctx.db.patch(existing._id, {
        reason: updatedReason,
        expectedResponse: updatedExpectedResponse,
        lastUpdatedBy: user._id.toString(),
        lastUpdatedAt: Date.now(),
      })
      return { success: true, updated: true }
    }

    // Get contact name
    const contact = await ctx.db.get(conversation.contactId)

    await ctx.db.insert("adminDebugConversations", {
      threadId: conversation.threadId,
      conversationId: args.conversationId,
      organizationId: conversation.organizationId, // Store for display purposes
      contactDisplayName: contact?.displayName,
      reason: args.reason.trim(),
      expectedResponse: normalizedExpectedResponse,
      addedBy: user._id.toString(),
      addedAt: Date.now(),
    })

    return { success: true, updated: false }
  },
})

/**
 * Get existing debug entry for a conversation
 * Any authenticated user can check if a debug entry exists for conversations in their organization
 * Returns the existing debug entry if it exists, null otherwise
 */
export const getByConversation = authQuery({
  args: {
    organizationId: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      return null
    }

    // Verify conversation belongs to user's organization
    if (conversation.organizationId !== args.organizationId) {
      return null
    }

    const existing = await ctx.db
      .query("adminDebugConversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", conversation.threadId))
      .first()

    return existing
  },
})

/**
 * Remove a single debug conversation entry
 * Shared list: any superadmin can remove an entry
 */
export const remove = platformSuperAdminMutation({
  args: { id: v.id("adminDebugConversations") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id)
    if (!item) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Debug entry not found",
      })
    }

    await ctx.db.delete(args.id)
    return { success: true }
  },
})

/**
 * Clear all debug conversations (shared list)
 * Deletes in batches of 500 until all are removed (capped at 4000 to stay within mutation limits)
 */
export const clearAll = platformSuperAdminMutation({
  args: {},
  handler: async (ctx) => {
    let totalDeleted = 0
    const batchSize = 500
    const maxDeletes = 4000

    while (totalDeleted < maxDeletes) {
      const items = await ctx.db
        .query("adminDebugConversations")
        .take(batchSize)
      if (items.length === 0) break

      for (const item of items) {
        await ctx.db.delete(item._id)
      }
      totalDeleted += items.length
    }

    return { success: true, deleted: totalDeleted }
  },
})

/**
 * Get all messages for a thread including tool calls
 * Used in debug detail view to see full conversation history
 */
export const getThreadMessages = platformSuperAdminQuery({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    // Get messages from the agent system - include tool messages for debugging
    const messages = await listMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
      // CRITICAL: excludeToolMessages defaults to true, we MUST set false for debug view
      excludeToolMessages: false,
    })

    return messages
  },
})

/**
 * Get conversation metadata for debug view header
 */
export const getConversationDetails = platformSuperAdminQuery({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find conversation by threadId
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .first()

    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversation not found",
      })
    }

    // Get contact info
    const contact = await ctx.db.get(conversation.contactId)

    // Get order if exists
    const order = conversation.orderId
      ? await ctx.db.get(conversation.orderId)
      : null

    return {
      _id: conversation._id,
      threadId: conversation.threadId,
      organizationId: conversation.organizationId,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt,
      _creationTime: conversation._creationTime,
      contact: contact
        ? {
            _id: contact._id,
            displayName: contact.displayName,
            phoneNumber: contact.phoneNumber,
          }
        : null,
      order: order
        ? {
            _id: order._id,
            orderNumber: order.orderNumber,
            status: order.status,
            total: order.total,
          }
        : null,
    }
  },
})
