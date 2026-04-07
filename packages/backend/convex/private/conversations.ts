import type { OrderedQuery } from "convex/server"
import { makeFunctionReference, paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import type { DataModel, Doc } from "../_generated/dataModel"
import {
  BadRequestError,
  ConversationNotFoundError,
  UnauthorizedError,
} from "../lib/errors"
import { authMutation, authQuery } from "../lib/helpers"
import {
  checkContactHasUnresolvedConversations,
  escalateConversation,
} from "../model/conversations"

const forceResolveWithCostRef = makeFunctionReference<"mutation">(
  "system/conversations:forceResolveWithCost"
)

const omitConversationCost = <
  T extends {
    cost?: number | undefined
    costCoverage?: "complete" | "estimated" | undefined
    costUpdatedAt?: number | undefined
  },
>(
  conversation: T
) => {
  const {
    cost: _cost,
    costCoverage: _costCoverage,
    costUpdatedAt: _costUpdatedAt,
    ...rest
  } = conversation
  return rest
}

export const updateStatus = authMutation({
  args: {
    organizationId: v.string(),
    conversationId: v.id("conversations"),
    status: v.union(
      v.literal("unresolved"),
      v.literal("escalated"),
      v.literal("resolved")
    ),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)

    if (!conversation) {
      throw new ConversationNotFoundError()
    }

    if (conversation.organizationId !== args.organizationId) {
      throw new UnauthorizedError("ID de organización inválido")
    }

    // Business rule: Prevent setting status to unresolved/escalated if contact has other unresolved conversations
    if (args.status !== "resolved") {
      const hasUnresolvedConversations =
        await checkContactHasUnresolvedConversations(
          ctx,
          conversation.contactId,
          args.conversationId // Exclude current conversation
        )

      if (hasUnresolvedConversations) {
        throw new BadRequestError(
          "No se puede cambiar el estado de la conversación porque el contacto ya tiene otras conversaciones activas"
        )
      }
    }

    // If resolving, use the force resolve function to calculate costs without order validation
    if (args.status === "resolved") {
      await ctx.runMutation(forceResolveWithCostRef, {
        threadId: conversation.threadId,
        resolutionReason:
          "Resuelta manualmente por operador desde el dashboard",
        resolvedBy: "operator",
      })
    } else {
      // For other status changes, just patch directly
      await ctx.db.patch(args.conversationId, {
        status: args.status,
      })
    }
  },
})

export const escalate = authMutation({
  args: {
    organizationId: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)

    if (!conversation) {
      throw new ConversationNotFoundError()
    }

    if (conversation.organizationId !== args.organizationId) {
      throw new UnauthorizedError("ID de organización inválido")
    }

    await escalateConversation(ctx, conversation, {
      reason: "Escalado manualmente por operador desde el dashboard",
    })
  },
})

export const getOne = authQuery({
  args: {
    organizationId: v.string(),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    if (!args.conversationId) {
      return null
    }
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation || conversation.organizationId !== args.organizationId) {
      return null
    }
    const contact = await ctx.db.get(conversation.contactId)
    if (!contact) {
      return null
    }
    // Obtener el pedido asociado si existe
    let order = null
    if (conversation.orderId) {
      order = await ctx.db.get(conversation.orderId)
    }

    // Obtener la configuración de WhatsApp asociada si existe
    let whatsappConfiguration = null
    if (conversation.whatsappConfigurationId) {
      whatsappConfiguration = await ctx.db.get(
        conversation.whatsappConfigurationId
      )
    }

    return {
      ...omitConversationCost(conversation),
      contact,
      order,
      whatsappConfiguration,
    }
  },
})

export const listForNotifications = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_organization_and_last_message", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(20)

    return conversations
  },
})

export const getMany = authQuery({
  args: {
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
    status: v.optional(
      v.union(
        v.array(
          v.union(
            v.literal("unresolved"),
            v.literal("escalated"),
            v.literal("resolved")
          )
        ),
        v.union(
          v.literal("unresolved"),
          v.literal("escalated"),
          v.literal("resolved")
        )
      )
    ),
    orderExistence: v.optional(
      v.union(
        v.array(v.union(v.literal("with-order"), v.literal("without-order"))),
        v.union(v.literal("with-order"), v.literal("without-order"))
      )
    ),
    orderStatus: v.optional(
      v.union(
        v.array(
          v.union(
            v.literal("programado"),
            v.literal("pendiente"),
            v.literal("preparando"),
            v.literal("listo_para_recoger"),
            v.literal("en_camino"),
            v.literal("entregado"),
            v.literal("cancelado")
          )
        ),
        v.union(
          v.literal("programado"),
          v.literal("pendiente"),
          v.literal("preparando"),
          v.literal("listo_para_recoger"),
          v.literal("en_camino"),
          v.literal("entregado"),
          v.literal("cancelado")
        )
      )
    ),
    searchText: v.optional(v.string()),
    whatsappConfigurationIds: v.optional(
      v.array(v.id("whatsappConfigurations"))
    ),
  },
  handler: async (ctx, args) => {
    // Optimized approach: Apply filters, paginate early, then process expensive operations only for visible items

    // Stage 1: Parse orderStatus filter
    const validOrderStatuses: Doc<"orders">["status"][] = []
    if (args.orderStatus) {
      if (Array.isArray(args.orderStatus)) {
        validOrderStatuses.push(...args.orderStatus)
      } else {
        validOrderStatuses.push(args.orderStatus)
      }
    }

    // Stage 2: Get relevant order IDs if there are valid order statuses (create independent queries)
    let relevantOrderIds: Doc<"orders">["_id"][] | null = null
    if (validOrderStatuses.length > 0) {
      const orderQueries = validOrderStatuses.map((status) =>
        ctx.db
          .query("orders")
          .withIndex("by_organization_and_status", (q) =>
            q.eq("organizationId", args.organizationId).eq("status", status)
          )
      )

      const orderResults = await Promise.all(
        orderQueries.map((q) => q.collect())
      )
      const allOrders = orderResults.flat()

      // Remove duplicates
      const uniqueOrders = allOrders.filter(
        (order, index, arr) =>
          arr.findIndex((o) => o._id === order._id) === index
      )

      relevantOrderIds = uniqueOrders.map((order) => order._id)
    }

    // Stage 3: Get relevant contact IDs if searchText filter is applied
    let relevantContactIds: Doc<"contacts">["_id"][] | null = null
    if (args.searchText) {
      const contacts = await ctx.db
        .query("contacts")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()
      const matchingContacts = contacts.filter((contact) => {
        const searchLower = args.searchText!.toLowerCase().trim()
        const displayNameLower = (contact.displayName || "")
          .toLowerCase()
          .trim()
        const phoneNumberLower = contact.phoneNumber.toLowerCase().trim()
        return (
          displayNameLower.includes(searchLower) ||
          phoneNumberLower.includes(searchLower)
        )
      })
      relevantContactIds = matchingContacts.map((c) => c._id)
    }

    // Stage 4: Build independent queries for each combination of status and WhatsApp configuration
    const baseQueries: OrderedQuery<DataModel["conversations"]>[] = []

    // Determine statuses to query
    const statusesToQuery: string[] = []
    if (args.status) {
      if (Array.isArray(args.status)) {
        statusesToQuery.push(...args.status)
      } else {
        statusesToQuery.push(args.status)
      }
    } else {
      // No status filter: will use general index
      statusesToQuery.push("__all__") // Special marker for no status filter
    }

    // Determine WhatsApp configurations to query
    const whatsappConfigsToQuery =
      args.whatsappConfigurationIds && args.whatsappConfigurationIds.length > 0
        ? args.whatsappConfigurationIds
        : ["__all__"] // Special marker for no WhatsApp filter

    // Create independent queries for each combination
    for (const status of statusesToQuery) {
      for (const whatsappConfigId of whatsappConfigsToQuery) {
        let query: OrderedQuery<DataModel["conversations"]>

        if (status === "__all__") {
          // No status filter
          query = ctx.db
            .query("conversations")
            .withIndex("by_organization_and_last_message", (q) =>
              q.eq("organizationId", args.organizationId)
            )
            .order("desc")
        } else {
          // With status filter
          query = ctx.db
            .query("conversations")
            .withIndex("by_organization_status_and_last_message", (q) =>
              q
                .eq("organizationId", args.organizationId)
                .eq("status", status as Doc<"conversations">["status"])
            )
            .order("desc")
        }

        // Apply WhatsApp filter if needed
        if (whatsappConfigId !== "__all__") {
          query = query.filter((q) =>
            q.eq(q.field("whatsappConfigurationId"), whatsappConfigId)
          )
        }

        baseQueries.push(query)
      }
    }

    // Stage 5: Collect conversations from independent queries
    const allConversations: Doc<"conversations">[] = []

    for (const query of baseQueries) {
      const conversations = await query.collect()
      allConversations.push(...conversations)
    }

    // Remove duplicates (can happen when multiple queries overlap)
    const uniqueConversations = allConversations.filter(
      (conv, index, arr) => arr.findIndex((c) => c._id === conv._id) === index
    )

    // Stage 6: Apply order existence and order status filters in memory
    let filteredConversations = uniqueConversations

    // Apply order existence filter
    if (args.orderExistence) {
      if (Array.isArray(args.orderExistence)) {
        const hasWithOrder = args.orderExistence.includes("with-order")
        const hasWithoutOrder = args.orderExistence.includes("without-order")

        filteredConversations = filteredConversations.filter((conv) => {
          const hasOrder = !!conv.orderId
          if (hasWithOrder && hasOrder) return true
          if (hasWithoutOrder && !hasOrder) return true
          return false
        })
      } else {
        if (args.orderExistence === "with-order") {
          filteredConversations = filteredConversations.filter(
            (conv) => !!conv.orderId
          )
        } else if (args.orderExistence === "without-order") {
          filteredConversations = filteredConversations.filter(
            (conv) => !conv.orderId
          )
        }
      }
    }

    // Apply order status filter - only affects conversations with orders
    if (relevantOrderIds !== null) {
      filteredConversations = filteredConversations.filter((conv) => {
        // If no order, always include
        if (!conv.orderId) return true
        // If has order, check if matches status
        return relevantOrderIds.includes(conv.orderId)
      })
    }

    // Apply search text filter
    if (relevantContactIds !== null) {
      filteredConversations = filteredConversations.filter((conv) =>
        relevantContactIds!.includes(conv.contactId)
      )
    }

    // Stage 7: Apply pagination early to limit expensive operations
    const { numItems = 15, cursor = null } = args.paginationOpts || {}
    const startIndex = cursor ? parseInt(cursor, 10) : 0
    const endIndex = startIndex + numItems
    const paginatedConversations = filteredConversations.slice(
      startIndex,
      endIndex
    )

    const hasMore = endIndex < filteredConversations.length
    const nextCursor = hasMore ? endIndex.toString() : null

    // Stage 8: Collect unique IDs for batch operations (only for paginated items)
    const contactIds = [
      ...new Set(paginatedConversations.map((c) => c.contactId)),
    ]
    const orderIds = [
      ...new Set(paginatedConversations.map((c) => c.orderId).filter(Boolean)),
    ]
    const whatsappConfigIds = [
      ...new Set(
        paginatedConversations
          .map((c) => c.whatsappConfigurationId)
          .filter(Boolean)
      ),
    ]
    const twilioConfigIds = [
      ...new Set(
        paginatedConversations
          .map((c) => c.twilioConfigurationId)
          .filter(Boolean)
      ),
    ]

    // Stage 9: Batch fetch related data (only for paginated items)
    const [contacts, orders, whatsappConfigurations, twilioConfigurations] =
      await Promise.all([
        // Batch fetch contacts
        ctx.db
          .query("contacts")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .collect()
          .then((contacts) =>
            contacts.filter((c) => contactIds.includes(c._id))
          ),

        // Batch fetch orders
        orderIds.length > 0
          ? ctx.db
              .query("orders")
              .withIndex("by_organization_id", (q) =>
                q.eq("organizationId", args.organizationId)
              )
              .collect()
              .then((orders) => orders.filter((o) => orderIds.includes(o._id)))
          : Promise.resolve([]),

        // Batch fetch WhatsApp configurations (Meta)
        whatsappConfigIds.length > 0
          ? ctx.db
              .query("whatsappConfigurations")
              .withIndex("by_organization_id", (q) =>
                q.eq("organizationId", args.organizationId)
              )
              .collect()
              .then((configs) =>
                configs.filter((c) => whatsappConfigIds.includes(c._id))
              )
          : Promise.resolve([]),

        // Batch fetch Twilio configurations
        twilioConfigIds.length > 0
          ? ctx.db
              .query("whatsappConfigurations")
              .withIndex("by_organization_id", (q) =>
                q.eq("organizationId", args.organizationId)
              )
              .collect()
              .then((configs) =>
                configs.filter((c) => twilioConfigIds.includes(c._id))
              )
          : Promise.resolve([]),
      ])

    // Stage 10: Create lookup maps for O(1) access
    const contactsMap = new Map(contacts.map((c) => [c._id, c]))
    const ordersMap = new Map(orders.map((o) => [o._id, o]))
    const whatsappConfigsMap = new Map(
      whatsappConfigurations.map((c) => [c._id, c])
    )
    const twilioConfigsMap = new Map(
      twilioConfigurations.map((c) => [c._id, c])
    )

    // Stage 11: Expand conversations with additional data using batch-fetched data (only for paginated items)
    const conversationsWithAdditionalData = await Promise.all(
      paginatedConversations.map(async (conversation) => {
        const contact = contactsMap.get(conversation.contactId)

        if (!contact) {
          return null
        }

        // Get last message from conversationMessages table (more efficient and accurate)
        // Use by_conversation_timestamp index to get the most recent message by messageTimestamp
        const lastConversationMessage = await ctx.db
          .query("conversationMessages")
          .withIndex("by_conversation_timestamp", (q) =>
            q.eq("conversationId", conversation._id)
          )
          .order("desc")
          .first()

        // Format last message for display
        let lastMessage: { text: string; message: { role: string } } | null =
          null
        if (lastConversationMessage) {
          // Determine text to display based on message type
          let displayText = lastConversationMessage.content.text || ""
          if (!displayText) {
            // Fallback text for media messages
            switch (lastConversationMessage.type) {
              case "image":
                displayText = "📷 Imagen"
                break
              case "audio":
                displayText = "🎤 Audio"
                break
              case "document":
                displayText = "📄 Documento"
                break
              case "video":
                displayText = "🎬 Video"
                break
              case "location":
                displayText = "📍 Ubicación"
                break
              case "sticker":
                displayText = "🏷️ Sticker"
                break
              default:
                displayText = "Mensaje"
            }
          }

          lastMessage = {
            text: displayText,
            message: {
              role:
                lastConversationMessage.direction === "inbound"
                  ? "user"
                  : "assistant",
            },
          }
        }

        // Get associated order from batch data
        const order = conversation.orderId
          ? ordersMap.get(conversation.orderId) || null
          : null

        // Get associated WhatsApp configuration from batch data (Meta)
        const whatsappConfiguration = conversation.whatsappConfigurationId
          ? whatsappConfigsMap.get(conversation.whatsappConfigurationId) || null
          : null

        // Get associated Twilio configuration from batch data
        const twilioConfiguration = conversation.twilioConfigurationId
          ? twilioConfigsMap.get(conversation.twilioConfigurationId) || null
          : null

        return {
          ...omitConversationCost(conversation),
          lastMessage,
          contact,
          order,
          whatsappConfiguration,
          twilioConfiguration,
        }
      })
    )

    const validConversations = conversationsWithAdditionalData.filter(
      (conv): conv is NonNullable<typeof conv> => conv !== null
    )

    return {
      page: validConversations,
      isDone: !hasMore,
      continueCursor: nextCursor as string,
    }
  },
})
