import { saveMessage } from "@convex-dev/agent"
import type { OrderedQuery, Query, QueryInitializer } from "convex/server"
import { paginationOptsValidator } from "convex/server"
import { ConvexError, v } from "convex/values"
import { components, internal } from "../_generated/api"
import type { DataModel, Doc } from "../_generated/dataModel"
import { aggregateContactsByOrganization } from "../contactsAggregate"
import { aggregateConversationsByOrganization } from "../conversationsAggregate"
import { DEFAULT_RESTAURANT_CONFIG } from "../lib/constants"
import {
  ContactNotFoundError,
  ConversationNotFoundError,
  OrderNotFoundError,
  UnauthorizedError,
} from "../lib/errors"
import {
  authMutation,
  authQuery,
  isValidStatusTransition,
  type OrderStatus,
} from "../lib/helpers"
import { validateScheduledOrderTime } from "../lib/scheduleUtils"
import { notifyOrderStatusChange } from "../model/orderNotifications"
import type { OrderItemWithProducts } from "../model/orders"
import * as Orders from "../model/orders"
import { updateOrderItems, updateOrderStatus } from "../model/orders"
import { aggregateOrdersByOrganization } from "../ordersAggregate"
import {
  orderStatusValidator,
  orderTypeValidator,
  paymentMethodValidator,
} from "../schema"

export const list = authQuery({
  args: {
    organizationId: v.string(),
    paginationOpts: v.optional(paginationOptsValidator),
    status: v.optional(orderStatusValidator),
    orderType: v.optional(orderTypeValidator),
    printed: v.optional(
      v.union(v.literal("printed"), v.literal("unprinted"), v.literal("all"))
    ),
    paid: v.optional(
      v.union(v.literal("paid"), v.literal("unpaid"), v.literal("all"))
    ),
    scheduled: v.optional(
      v.union(
        v.literal("all"),
        v.literal("scheduled"),
        v.literal("upcoming"),
        v.literal("today"),
        v.literal("tomorrow")
      )
    ),
  },
  handler: async (ctx, args) => {
    // Stage 1: start from the table
    const tableQuery: QueryInitializer<DataModel["orders"]> =
      ctx.db.query("orders")

    // Stage 2: choose exactly one index/range
    let indexedQuery: Query<DataModel["orders"]> = tableQuery
    if (args.status && args.orderType) {
      // Use compound index for both status and type
      indexedQuery = tableQuery.withIndex("by_organization_and_status", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("status", args.status as Doc<"orders">["status"])
      )
      // Filter by order type post-query since we don't have a compound index for both
      indexedQuery = indexedQuery.filter((q) =>
        q.eq(q.field("orderType"), args.orderType)
      )
    } else if (args.status) {
      indexedQuery = tableQuery.withIndex("by_organization_and_status", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("status", args.status as Doc<"orders">["status"])
      )
    } else if (args.orderType) {
      const orderType = args.orderType
      indexedQuery = tableQuery.withIndex("by_organization_and_type", (q) =>
        q.eq("organizationId", args.organizationId).eq("orderType", orderType)
      )
    } else {
      indexedQuery = tableQuery.withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
    }

    // Stage 3: apply ordering (only when compatible)
    let orderedQuery: OrderedQuery<DataModel["orders"]> = indexedQuery
    if (!args.status && !args.orderType) {
      // only order when using by_organization_id (most general index)
      orderedQuery = indexedQuery.order("desc")
    }

    // Optional post-filters (don't change type)
    if (args.printed === "printed") {
      orderedQuery = orderedQuery.filter((q) =>
        q.neq(q.field("printedAt"), undefined)
      )
    } else if (args.printed === "unprinted") {
      orderedQuery = orderedQuery.filter((q) =>
        q.eq(q.field("printedAt"), undefined)
      )
    }

    if (args.paid === "paid") {
      orderedQuery = orderedQuery.filter((q) =>
        q.neq(q.field("paidAt"), undefined)
      )
    } else if (args.paid === "unpaid") {
      orderedQuery = orderedQuery.filter((q) =>
        q.eq(q.field("paidAt"), undefined)
      )
    }

    // Scheduled filter - apply complex timezone logic
    if (args.scheduled && args.scheduled !== "all") {
      // Normalize day boundaries in Colombian timezone (UTC-5)
      // Colombia is UTC-5 (no DST)
      const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000 // -5 hours in milliseconds

      // Get current time in Colombia timezone
      const now = Date.now()
      const colombiaNow = new Date(now + COLOMBIA_OFFSET_MS)

      // Create start of today in Colombia timezone
      const startOfToday = new Date(colombiaNow)
      startOfToday.setHours(0, 0, 0, 0) // Start of today at 00:00:00.000 Colombia time
      const startOfTodayUTC = new Date(
        startOfToday.getTime() - COLOMBIA_OFFSET_MS
      )

      // Create start of tomorrow in Colombia timezone
      const startOfTomorrow = new Date(startOfToday)
      startOfTomorrow.setDate(startOfToday.getDate() + 1) // Start of tomorrow at 00:00:00.000 Colombia time
      const startOfTomorrowUTC = new Date(
        startOfTomorrow.getTime() - COLOMBIA_OFFSET_MS
      )

      // Create start of day after tomorrow in Colombia timezone
      const startOfDayAfterTomorrow = new Date(startOfTomorrow)
      startOfDayAfterTomorrow.setDate(startOfTomorrow.getDate() + 1) // Start of day after tomorrow
      const startOfDayAfterTomorrowUTC = new Date(
        startOfDayAfterTomorrow.getTime() - COLOMBIA_OFFSET_MS
      )

      switch (args.scheduled) {
        case "scheduled":
          // Orders with scheduledTime and status "programado"
          orderedQuery = orderedQuery.filter((q) =>
            q.and(
              q.neq(q.field("scheduledTime"), undefined),
              q.eq(q.field("status"), "programado")
            )
          )
          break
        case "upcoming":
          // Orders scheduled for tomorrow and beyond in Colombia time (not including today's future times)
          orderedQuery = orderedQuery.filter((q) =>
            q.and(
              q.neq(q.field("scheduledTime"), undefined),
              q.gte(q.field("scheduledTime"), startOfTomorrowUTC.getTime())
            )
          )
          break
        case "today":
          // Orders scheduled for today in Colombia time (from start of today to end of today)
          orderedQuery = orderedQuery.filter((q) =>
            q.and(
              q.neq(q.field("scheduledTime"), undefined),
              q.gte(q.field("scheduledTime"), startOfTodayUTC.getTime()),
              q.lt(q.field("scheduledTime"), startOfTomorrowUTC.getTime())
            )
          )
          break
        case "tomorrow":
          // Orders scheduled for tomorrow in Colombia time (from start of tomorrow to end of tomorrow)
          orderedQuery = orderedQuery.filter((q) =>
            q.and(
              q.neq(q.field("scheduledTime"), undefined),
              q.gte(q.field("scheduledTime"), startOfTomorrowUTC.getTime()),
              q.lt(
                q.field("scheduledTime"),
                startOfDayAfterTomorrowUTC.getTime()
              )
            )
          )
          break
      }
    }

    // Use pagination instead of take
    const result = await orderedQuery.paginate(
      args.paginationOpts || { numItems: 10, cursor: null }
    )

    // Expand items for each order
    const ordersWithItems = await Promise.all(
      result.page.map(async (order) => {
        const orderItemsWithProducts: OrderItemWithProducts[] =
          await Orders.getOrderWithItemsAndProducts(ctx, order._id)

        return {
          ...order,
          items: orderItemsWithProducts,
        }
      })
    )

    return {
      ...result,
      page: ordersWithItems,
    }
  },
})

export const getMany = authQuery({
  args: {
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator, // REQUERIDO para usePaginatedQuery
    status: v.optional(
      v.union(v.array(orderStatusValidator), orderStatusValidator)
    ),
    orderType: v.optional(orderTypeValidator),
    printed: v.optional(
      v.union(
        v.array(
          v.union(
            v.literal("printed"),
            v.literal("unprinted"),
            v.literal("all")
          )
        ),
        v.union(v.literal("printed"), v.literal("unprinted"), v.literal("all"))
      )
    ),
    paid: v.optional(
      v.union(
        v.array(
          v.union(v.literal("paid"), v.literal("unpaid"), v.literal("all"))
        ),
        v.union(v.literal("paid"), v.literal("unpaid"), v.literal("all"))
      )
    ),
    scheduled: v.optional(
      v.union(
        v.array(
          v.union(
            v.literal("upcoming"),
            v.literal("today"),
            v.literal("tomorrow")
          )
        ),
        v.union(
          v.literal("upcoming"),
          v.literal("today"),
          v.literal("tomorrow")
        )
      )
    ),
    dateRange: v.optional(
      v.object({
        from: v.optional(v.number()),
        to: v.optional(v.number()),
      })
    ),
    restaurantLocationId: v.optional(v.array(v.id("restaurantLocations"))),
  },
  handler: async (ctx, args) => {
    // Optimized approach: Apply filters efficiently before pagination, then batch fetch related data only for visible items

    // Stage 1: Parse and prepare filter values for efficient querying
    let includePrinted = false
    let includeUnprinted = false
    const printedStatuses: ("printed" | "unprinted")[] = []
    if (args.printed) {
      if (Array.isArray(args.printed)) {
        for (const printed of args.printed) {
          if (printed === "printed") includePrinted = true
          else if (printed === "unprinted") includeUnprinted = true
          else if (printed === "all") {
            includePrinted = true
            includeUnprinted = true
          }
        }
      } else {
        if (args.printed === "printed") includePrinted = true
        else if (args.printed === "unprinted") includeUnprinted = true
        else if (args.printed === "all") {
          includePrinted = true
          includeUnprinted = true
        }
      }
    } else {
      // No printed filter: include both
      includePrinted = true
      includeUnprinted = true
    }

    let includePaid = false
    let includeUnpaid = false
    if (args.paid) {
      if (Array.isArray(args.paid)) {
        for (const paid of args.paid) {
          if (paid === "paid") includePaid = true
          else if (paid === "unpaid") includeUnpaid = true
          else if (paid === "all") {
            includePaid = true
            includeUnpaid = true
          }
        }
      } else {
        if (args.paid === "paid") includePaid = true
        else if (args.paid === "unpaid") includeUnpaid = true
        else if (args.paid === "all") {
          includePaid = true
          includeUnpaid = true
        }
      }
    } else {
      // No paid filter: include both
      includePaid = true
      includeUnpaid = true
    }

    // Stage 2: Prepare scheduled time boundaries (Colombian timezone UTC-5)
    const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000
    const now = Date.now()
    const colombiaNow = new Date(now + COLOMBIA_OFFSET_MS)

    const startOfToday = new Date(colombiaNow)
    startOfToday.setHours(0, 0, 0, 0)
    const startOfTodayUTC = new Date(
      startOfToday.getTime() - COLOMBIA_OFFSET_MS
    )

    const startOfTomorrow = new Date(startOfToday)
    startOfTomorrow.setDate(startOfToday.getDate() + 1)
    const startOfTomorrowUTC = new Date(
      startOfTomorrow.getTime() - COLOMBIA_OFFSET_MS
    )

    const startOfDayAfterTomorrow = new Date(startOfTomorrow)
    startOfDayAfterTomorrow.setDate(startOfTomorrow.getDate() + 1)
    const startOfDayAfterTomorrowUTC = new Date(
      startOfDayAfterTomorrow.getTime() - COLOMBIA_OFFSET_MS
    )

    // Stage 3: Build independent queries for each filter combination
    const baseQueries: OrderedQuery<DataModel["orders"]>[] = []

    // Determine status combinations to query
    const statusToQuery = args.status
      ? Array.isArray(args.status)
        ? args.status
        : [args.status]
      : ["__all__"]
    const orderTypeToQuery = args.orderType ? [args.orderType] : ["__all__"]
    const restaurantLocationIds =
      args.restaurantLocationId && args.restaurantLocationId.length > 0
        ? args.restaurantLocationId
        : ["__all__"]

    // Create independent queries for each combination
    for (const status of statusToQuery) {
      for (const orderType of orderTypeToQuery) {
        for (const locationId of restaurantLocationIds) {
          let query: OrderedQuery<DataModel["orders"]>

          // Choose appropriate index based on filters
          if (status !== "__all__") {
            query = ctx.db
              .query("orders")
              .withIndex("by_organization_and_status", (q) =>
                q
                  .eq("organizationId", args.organizationId)
                  .eq("status", status as Doc<"orders">["status"])
              )
              .order("desc")
          } else if (orderType !== "__all__") {
            query = ctx.db
              .query("orders")
              .withIndex("by_organization_and_type", (q) =>
                q
                  .eq("organizationId", args.organizationId)
                  .eq("orderType", orderType as Doc<"orders">["orderType"])
              )
              .order("desc")
          } else {
            query = ctx.db
              .query("orders")
              .withIndex("by_organization_id", (q) =>
                q.eq("organizationId", args.organizationId)
              )
              .order("desc")
          }

          // Apply location filter if needed
          if (locationId !== "__all__") {
            query = query.filter((q) =>
              q.eq(q.field("restaurantLocationId"), locationId)
            )
          }

          // Apply orderType filter if both status and orderType were provided
          if (status !== "__all__" && orderType !== "__all__") {
            query = query.filter((q) => q.eq(q.field("orderType"), orderType))
          }

          baseQueries.push(query)
        }
      }
    }

    // Stage 4: Collect orders from independent queries
    const allOrders: Doc<"orders">[] = []
    for (const query of baseQueries) {
      const orders = await query.collect()
      allOrders.push(...orders)
    }

    // Remove duplicates
    const uniqueOrders = allOrders.filter(
      (order, index, arr) => arr.findIndex((o) => o._id === order._id) === index
    )

    // Stage 5: Apply complex filters in memory (printed, paid, scheduled, dateRange)
    let filteredOrders = uniqueOrders

    // Apply printed filter
    if (!(includePrinted && includeUnprinted)) {
      filteredOrders = filteredOrders.filter((order) => {
        const isPrinted = !!order.printedAt
        return (includePrinted && isPrinted) || (includeUnprinted && !isPrinted)
      })
    }

    // Apply paid filter
    if (!(includePaid && includeUnpaid)) {
      filteredOrders = filteredOrders.filter((order) => {
        const isPaid = !!order.paidAt
        return (includePaid && isPaid) || (includeUnpaid && !isPaid)
      })
    }

    // Apply scheduled filter
    if (args.scheduled) {
      const scheduledFilters = Array.isArray(args.scheduled)
        ? args.scheduled
        : [args.scheduled]
      filteredOrders = filteredOrders.filter((order) => {
        if (!order.scheduledTime) return false

        return scheduledFilters.some((scheduled) => {
          switch (scheduled) {
            case "upcoming":
              return order.scheduledTime! >= startOfTomorrowUTC.getTime()
            case "today":
              return (
                order.scheduledTime! >= startOfTodayUTC.getTime() &&
                order.scheduledTime! < startOfTomorrowUTC.getTime()
              )
            case "tomorrow":
              return (
                order.scheduledTime! >= startOfTomorrowUTC.getTime() &&
                order.scheduledTime! < startOfDayAfterTomorrowUTC.getTime()
              )
            default:
              return false
          }
        })
      })
    }

    // Apply date range filter
    if (args.dateRange) {
      const { from, to } = args.dateRange
      filteredOrders = filteredOrders.filter((order) => {
        const creationTime = order._creationTime
        if (from && to) {
          return creationTime >= from && creationTime < to
        } else if (from) {
          return creationTime >= from
        } else if (to) {
          return creationTime < to
        }
        return true
      })
    }

    // Sort by creation time (descending - newest first) to ensure consistent ordering
    // This is especially important when filtering by multiple restaurant locations
    filteredOrders.sort((a, b) => b._creationTime - a._creationTime)

    // Stage 6: Apply pagination early to limit expensive operations
    const { numItems = 15, cursor = null } = args.paginationOpts || {}
    const startIndex = cursor ? parseInt(cursor, 10) : 0
    const endIndex = startIndex + numItems
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex)

    const hasMore = endIndex < filteredOrders.length
    const nextCursor = hasMore ? endIndex.toString() : null

    // Stage 7: Collect unique IDs for batch operations (only for paginated items)
    const contactIds = [...new Set(paginatedOrders.map((o) => o.contactId))]
    const restaurantLocationIdsForBatch = [
      ...new Set(paginatedOrders.map((o) => o.restaurantLocationId)),
    ]

    // Stage 8: Batch fetch related data (only for paginated items)
    const [contacts, restaurantLocations] = await Promise.all([
      // Batch fetch contacts
      ctx.db
        .query("contacts")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()
        .then((contacts) => contacts.filter((c) => contactIds.includes(c._id))),

      // Batch fetch restaurant locations
      ctx.db
        .query("restaurantLocations")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()
        .then((locations) =>
          locations.filter((l) => restaurantLocationIdsForBatch.includes(l._id))
        ),
    ])

    // Stage 9: Create lookup maps for O(1) access
    const contactsMap = new Map(contacts.map((c) => [c._id, c]))
    const locationsMap = new Map(restaurantLocations.map((l) => [l._id, l]))

    // Stage 10: Expand orders with items and additional data using batch-fetched data (only for paginated items)
    const ordersWithAdditionalData = await Promise.all(
      paginatedOrders.map(async (order) => {
        // Get order items with products
        const orderItemsWithProducts: OrderItemWithProducts[] =
          await Orders.getOrderWithItemsAndProducts(ctx, order._id)

        // Get contact and location from batch data
        const contact = contactsMap.get(order.contactId)
        const restaurantLocation = locationsMap.get(order.restaurantLocationId)

        if (!contact || !restaurantLocation) {
          return null // Skip orders with missing related data
        }

        return {
          ...order,
          items: orderItemsWithProducts,
          contact,
          restaurantLocation,
        }
      })
    )

    const validOrders = ordersWithAdditionalData.filter(
      (order): order is NonNullable<typeof order> => order !== null
    )

    return {
      page: validOrders,
      isDone: !hasMore,
      continueCursor: nextCursor as string,
    }
  },
})

export const listWithConversations = authQuery({
  args: {
    organizationId: v.string(),
    status: v.optional(orderStatusValidator),
    orderType: v.optional(orderTypeValidator),
    printed: v.optional(
      v.union(v.literal("printed"), v.literal("unprinted"), v.literal("all"))
    ),
    paid: v.optional(
      v.union(v.literal("paid"), v.literal("unpaid"), v.literal("all"))
    ),
  },
  handler: async (ctx, args) => {
    // Stage 1: start from the table
    const tableQuery: QueryInitializer<DataModel["orders"]> =
      ctx.db.query("orders")

    // Stage 2: choose exactly one index/range
    let indexedQuery: Query<DataModel["orders"]> = tableQuery
    if (args.status && args.orderType) {
      // Use compound index for both status and type
      indexedQuery = tableQuery.withIndex("by_organization_and_status", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("status", args.status as Doc<"orders">["status"])
      )
      // Filter by order type post-query since we don't have a compound index for both
      indexedQuery = indexedQuery.filter((q) =>
        q.eq(q.field("orderType"), args.orderType)
      )
    } else if (args.status) {
      indexedQuery = tableQuery.withIndex("by_organization_and_status", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("status", args.status as Doc<"orders">["status"])
      )
    } else if (args.orderType) {
      const orderType = args.orderType
      indexedQuery = tableQuery.withIndex("by_organization_and_type", (q) =>
        q.eq("organizationId", args.organizationId).eq("orderType", orderType)
      )
    } else {
      indexedQuery = tableQuery.withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
    }

    // Stage 3: apply ordering (only when compatible)
    let orderedQuery: OrderedQuery<DataModel["orders"]> = indexedQuery
    if (!args.status && !args.orderType) {
      // only order when using by_organization_id (most general index)
      orderedQuery = indexedQuery.order("desc")
    }

    // Optional post-filters (don't change type)
    if (args.printed === "printed") {
      orderedQuery = orderedQuery.filter((q) =>
        q.neq(q.field("printedAt"), undefined)
      )
    } else if (args.printed === "unprinted") {
      orderedQuery = orderedQuery.filter((q) =>
        q.eq(q.field("printedAt"), undefined)
      )
    }

    if (args.paid === "paid") {
      orderedQuery = orderedQuery.filter((q) =>
        q.neq(q.field("paidAt"), undefined)
      )
    } else if (args.paid === "unpaid") {
      orderedQuery = orderedQuery.filter((q) =>
        q.eq(q.field("paidAt"), undefined)
      )
    }

    // Prefer take/paginate over unbounded collect
    const orders = await orderedQuery.take(100)

    // Get conversations for orders that have them
    const ordersWithConversations = await Promise.all(
      orders.map(async (order) => {
        if (order.conversationId) {
          const conversation = await ctx.db.get(order.conversationId)
          return { ...order, conversation }
        }
        return { ...order, conversation: null }
      })
    )

    return ordersWithConversations
  },
})
export const listWithMenuProducts = authQuery({
  args: {
    organizationId: v.string(),
    status: v.optional(orderStatusValidator),
    orderType: v.optional(orderTypeValidator),
    printed: v.optional(
      v.union(v.literal("printed"), v.literal("unprinted"), v.literal("all"))
    ),
    paid: v.optional(
      v.union(v.literal("paid"), v.literal("unpaid"), v.literal("all"))
    ),
  },
  handler: async (ctx, args) => {
    // Stage 1: start from the table
    const tableQuery: QueryInitializer<DataModel["orders"]> =
      ctx.db.query("orders")

    // Stage 2: choose exactly one index/range
    let indexedQuery: Query<DataModel["orders"]> = tableQuery
    if (args.status && args.orderType) {
      // Use compound index for both status and type
      indexedQuery = tableQuery.withIndex("by_organization_and_status", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("status", args.status as Doc<"orders">["status"])
      )
      // Filter by order type post-query since we don't have a compound index for both
      indexedQuery = indexedQuery.filter((q) =>
        q.eq(q.field("orderType"), args.orderType)
      )
    } else if (args.status) {
      indexedQuery = tableQuery.withIndex("by_organization_and_status", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("status", args.status as Doc<"orders">["status"])
      )
    } else if (args.orderType) {
      const orderType = args.orderType
      indexedQuery = tableQuery.withIndex("by_organization_and_type", (q) =>
        q.eq("organizationId", args.organizationId).eq("orderType", orderType)
      )
    } else {
      indexedQuery = tableQuery.withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
    }

    // Stage 3: apply ordering (only when compatible)
    let orderedQuery: OrderedQuery<DataModel["orders"]> = indexedQuery
    if (!args.status && !args.orderType) {
      // only order when using by_organization_id (most general index)
      orderedQuery = indexedQuery.order("desc")
    }

    // Optional post-filters (don't change type)
    if (args.printed === "printed") {
      orderedQuery = orderedQuery.filter((q) =>
        q.neq(q.field("printedAt"), undefined)
      )
    } else if (args.printed === "unprinted") {
      orderedQuery = orderedQuery.filter((q) =>
        q.eq(q.field("printedAt"), undefined)
      )
    }

    if (args.paid === "paid") {
      orderedQuery = orderedQuery.filter((q) =>
        q.neq(q.field("paidAt"), undefined)
      )
    } else if (args.paid === "unpaid") {
      orderedQuery = orderedQuery.filter((q) =>
        q.eq(q.field("paidAt"), undefined)
      )
    }

    // Prefer take/paginate over unbounded collect
    const orders = await orderedQuery.take(100)

    const ordersWithMenuProducts = await Promise.all(
      orders.map(async (order) => {
        const orderItemsWithProducts = await ctx.db
          .query("orderItems")
          .withIndex("by_order_id", (q) => q.eq("orderId", order._id))
          .collect()
        return { ...order, items: orderItemsWithProducts }
      })
    )

    return ordersWithMenuProducts
  },
})

export const updateStatus = authMutation({
  args: {
    organizationId: v.string(),
    id: v.id("orders"),
    status: v.union(
      v.literal("programado"),
      v.literal("pendiente"),
      v.literal("preparando"),
      v.literal("listo_para_recoger"),
      v.literal("en_camino"),
      v.literal("entregado"),
      v.literal("cancelado")
    ),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.id)
    if (!order) throw new OrderNotFoundError()
    if (order.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para actualizar este pedido"
      )
    }
    if (order.status === args.status) {
      return
    }
    // Validate status transition based on order type
    if (
      !isValidStatusTransition(
        order.status as OrderStatus,
        args.status,
        order.orderType
      )
    ) {
      throw new ConvexError({
        code: "INVALID_STATUS_TRANSITION",
        message: `Transición de estado no válida para pedido tipo ${order.orderType}. Estado actual: ${order.status}, Estado nuevo: ${args.status}`,
      })
    }
    // Update the order status using business logic
    await updateOrderStatus(ctx, args.id, args.status, args.organizationId)
    const updatedOrder = await ctx.db.get(args.id)
    if (!updatedOrder) {
      throw new OrderNotFoundError()
    }

    // Send status notification if conversation exists
    if (updatedOrder.conversationId) {
      await notifyOrderStatusChange(ctx, {
        order: updatedOrder,
        newStatus: args.status,
        agentName: (await ctx.auth.getUserIdentity())?.familyName || "Sistema",
      })
    }
  },
})

export const updateOrder = authMutation({
  args: {
    organizationId: v.string(),
    orderId: v.id("orders"),
    scheduledTime: v.optional(v.number()),
    deliveryAddress: v.optional(v.string()),
    paymentMethod: v.optional(paymentMethodValidator),
    paymentMethods: v.optional(
      v.array(
        v.object({
          method: paymentMethodValidator,
          amount: v.optional(v.number()),
          referenceCode: v.optional(v.string()),
          notes: v.optional(v.string()),
        })
      )
    ),
    orderType: v.optional(orderTypeValidator),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
    items: v.optional(
      v.array(
        v.object({
          menuProducts: v.array(v.id("menuProducts")),
          quantity: v.number(),
          notes: v.optional(v.string()),
          itemType: v.optional(
            v.union(v.literal("regular"), v.literal("combo"))
          ),
          comboId: v.optional(v.string()),
          comboName: v.optional(v.string()),
          comboBasePrice: v.optional(v.number()),
          comboSlotSelections: v.optional(
            v.array(
              v.object({
                slotId: v.optional(v.string()),
                slotName: v.string(),
                menuProductId: v.id("menuProducts"),
                productName: v.string(),
                upcharge: v.number(),
                quantity: v.optional(v.number()),
              })
            )
          ),
        })
      )
    ),
    deliveryFee: v.optional(v.number()),
    subtotal: v.optional(v.number()),
    total: v.optional(v.number()),
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const orgId = args.organizationId

    // Get restaurant configuration for validation rules
    const restaurantConfig = (await ctx.db
      .query("restaurantConfiguration")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .unique()) || {
      minAdvanceMinutes: DEFAULT_RESTAURANT_CONFIG.minAdvanceMinutes,
      maxAdvanceDays: DEFAULT_RESTAURANT_CONFIG.maxAdvanceDays,
      paymentUrl: null,
    }

    // Validate items if provided
    if (args.items) {
      for (let i = 0; i < args.items.length; i++) {
        const item = args.items[i]

        // Ensure item exists
        if (!item) {
          throw new ConvexError({
            code: "BAD_REQUEST",
            message: `El artículo ${i + 1} no está definido`,
          })
        }

        // Validate quantity is a positive integer
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          throw new ConvexError({
            code: "BAD_REQUEST",
            message: `El artículo ${i + 1} debe tener una cantidad entera positiva`,
          })
        }

        // Validate menuProducts is a non-empty array (combo items use slot selections instead)
        if (item.itemType !== "combo") {
          if (!item.menuProducts || item.menuProducts.length === 0) {
            throw new ConvexError({
              code: "BAD_REQUEST",
              message: `El artículo ${i + 1} debe tener al menos un producto del menú`,
            })
          }
        }

        // Validate all menuProducts exist and belong to the organization
        for (const productId of item.menuProducts) {
          const product = await ctx.db.get(productId)
          if (!product) {
            throw new ConvexError({
              code: "NOT_FOUND",
              message: `Producto del menú ${productId} no encontrado`,
            })
          }
          if (product.organizationId !== orgId) {
            throw new ConvexError({
              code: "UNAUTHORIZED",
              message: `Producto del menú ${productId} no pertenece a la organización`,
            })
          }
        }
      }
    }

    // Get the order and validate permissions
    const order = await ctx.db.get(args.orderId)
    if (!order) {
      throw new OrderNotFoundError()
    }
    if (order.organizationId !== orgId) {
      throw new UnauthorizedError(
        "No estás autorizado para modificar este pedido"
      )
    }

    // Validate order can be modified based on status
    if (!["programado", "pendiente"].includes(order.status)) {
      throw new ConvexError({
        code: "INVALID_ORDER_STATUS",
        message: `Solo se pueden modificar pedidos en estado 'programado' o 'pendiente'. Estado actual: ${order.status}`,
      })
    }

    // Validate scheduled time if provided
    if (args.scheduledTime !== undefined) {
      const now = Date.now()
      const minAdvanceTime = restaurantConfig.minAdvanceMinutes * 60 * 1000
      const maxAdvanceTime =
        restaurantConfig.maxAdvanceDays * 24 * 60 * 60 * 1000

      if (args.scheduledTime <= now + minAdvanceTime) {
        throw new ConvexError({
          code: "INVALID_SCHEDULED_TIME",
          message: `El horario programado debe ser con al menos ${restaurantConfig.minAdvanceMinutes} minutos de anticipación`,
        })
      }

      if (args.scheduledTime > now + maxAdvanceTime) {
        throw new ConvexError({
          code: "INVALID_SCHEDULED_TIME",
          message: `El horario programado no puede ser con más de ${restaurantConfig.maxAdvanceDays} días de anticipación`,
        })
      }
    }

    // Validate restaurant location if provided
    if (args.restaurantLocationId) {
      const location = await ctx.db.get(args.restaurantLocationId)
      if (!location) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Ubicación del restaurante no encontrada",
        })
      }
      if (location.organizationId !== orgId) {
        throw new ConvexError({
          code: "UNAUTHORIZED",
          message:
            "La ubicación del restaurante no pertenece a la organización",
        })
      }
    }

    // Validate delivery address is provided for delivery orders
    if (
      args.orderType === "delivery" &&
      !args.deliveryAddress &&
      !order.deliveryAddress
    ) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message:
          "La dirección de entrega es obligatoria para pedidos de delivery",
      })
    }

    // Prepare update data - ALL OPERATIONS IN SINGLE TRANSACTION
    const updateData: Record<string, unknown> = {}

    // Handle scheduled time update with job management
    if (
      args.scheduledTime !== undefined &&
      args.scheduledTime !== order.scheduledTime
    ) {
      // Validate restaurant is open at scheduled time
      const restaurantLocationId =
        args.restaurantLocationId || order.restaurantLocationId
      const location = await ctx.db.get(restaurantLocationId)
      if (!location) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Ubicación del restaurante no encontrada",
        })
      }

      const scheduleValidation = validateScheduledOrderTime(
        location,
        args.scheduledTime
      )
      if (!scheduleValidation.isOpen) {
        throw new ConvexError({
          code: "INVALID_SCHEDULED_TIME",
          message: `El restaurante no está abierto en el horario programado. ${scheduleValidation.message}`,
        })
      }

      updateData.scheduledTime = args.scheduledTime
      // Automatically change status to "programado" when scheduling
      updateData.status = "programado"

      // Cancel existing scheduled job if it exists
      if (order.scheduledTime) {
        await Orders.cancelOrderScheduledJobs(ctx, {
          orderId: args.orderId,
          organizationId: orgId,
        })
      }

      // Schedule new activation job with tracking
      await Orders.scheduleOrderActivation(ctx, {
        orderId: args.orderId,
        organizationId: orgId,
        scheduledTime: args.scheduledTime,
      })
    }

    // Handle other field updates
    if (args.deliveryAddress !== undefined) {
      updateData.deliveryAddress = args.deliveryAddress
    }

    if (args.coordinates !== undefined) {
      updateData.coordinates = args.coordinates
    }

    if (args.paymentMethod !== undefined) {
      updateData.paymentMethod = args.paymentMethod
    }

    if (args.paymentMethods !== undefined) {
      updateData.paymentMethods = args.paymentMethods
      // Also update single paymentMethod for backward compatibility
      if (args.paymentMethods.length > 0 && args.paymentMethods[0]) {
        updateData.paymentMethod = args.paymentMethods[0].method
      }
    }

    // Handle orderType and deliveryFee logic
    if (args.orderType !== undefined) {
      updateData.orderType = args.orderType
      // When changing orderType, update deliveryFee accordingly
      if (args.orderType === "pickup") {
        updateData.deliveryFee = 0
      } else if (args.orderType === "delivery") {
        // For delivery, if deliveryFee is provided, use it; otherwise keep existing or set to undefined
        if (args.deliveryFee !== undefined) {
          if (args.deliveryFee > 0) {
            updateData.deliveryFee = args.deliveryFee
          } else {
            throw new ConvexError({
              code: "INVALID_DELIVERYFEE",
              message: `El valor del envío debe ser superior a 0.`,
            })
          }
        }
        // If no deliveryFee provided for delivery, keep existing value
      }
    } else {
      // If orderType not changing, handle deliveryFee updates directly
      if (args.deliveryFee !== undefined) {
        if (args.deliveryFee > 0) {
          updateData.deliveryFee = args.deliveryFee
        } else {
          throw new ConvexError({
            code: "INVALID_DELIVERYFEE",
            message: `El valor del envío debe ser superior a 0.`,
          })
        }
      }
    }

    if (args.restaurantLocationId !== undefined) {
      updateData.restaurantLocationId = args.restaurantLocationId
    }

    // Handle items update if provided - this will recalculate totals
    if (args.items !== undefined) {
      const updateResult = await updateOrderItems(
        ctx,
        args.orderId,
        orgId,
        args.items
      )
      updateData.subtotal = updateResult.subtotal
      // Recalculate total with updated deliveryFee
      const finalDeliveryFee =
        updateData.deliveryFee !== undefined
          ? Number(updateData.deliveryFee)
          : Number(order.deliveryFee || 0)
      updateData.total = Number(updateResult.subtotal) + finalDeliveryFee
    } else {
      // If no items update but other fields changed, preserve existing totals
      if (args.subtotal !== undefined) {
        updateData.subtotal = args.subtotal
      }
      if (args.total !== undefined) {
        updateData.total = args.total
      }

      // If deliveryFee was updated but total wasn't explicitly provided, recalculate total
      if (updateData.deliveryFee !== undefined && args.total === undefined) {
        const currentSubtotal =
          args.subtotal !== undefined
            ? Number(args.subtotal)
            : Number(order.subtotal)
        const deliveryFeeValue = Number(updateData.deliveryFee)
        updateData.total = currentSubtotal + deliveryFeeValue
      }
    }

    // Apply all updates in a single database operation
    if (Object.keys(updateData).length > 0) {
      // If restaurantLocationId is being updated, we need to update the aggregate
      if (updateData.restaurantLocationId !== undefined) {
        const oldOrder = order
        await ctx.db.patch(args.orderId, updateData)
        const newOrder = await ctx.db.get(args.orderId)

        // Update aggregate with new location
        await aggregateOrdersByOrganization.replaceOrInsert(
          ctx,
          oldOrder,
          newOrder!
        )
      } else {
        await ctx.db.patch(args.orderId, updateData)
      }
    }

    return {
      success: true,
      message: "Pedido actualizado exitosamente.",
      orderId: args.orderId,
    }
  },
})

export const getOne = authQuery({
  args: {
    organizationId: v.string(),
    id: v.optional(v.id("orders")),
  },
  returns: v.any(), // Will be properly typed later
  handler: async (ctx, args) => {
    if (!args.id) {
      return null
    }
    const order = await ctx.db.get(args.id)
    if (!order || order.organizationId !== args.organizationId) {
      return null
    }

    // Get orderItems with their product details
    const orderItemsWithProducts: OrderItemWithProducts[] =
      await Orders.getOrderWithItemsAndProducts(ctx, args.id)

    // Get electronic invoice if exists
    let electronicInvoice = null
    if (order.electronicInvoiceId) {
      electronicInvoice = await ctx.db.get(order.electronicInvoiceId)
    }

    // Get payment methods from new array field with backward compatibility
    const paymentMethods =
      order.paymentMethods ||
      (order.paymentMethod
        ? [
            {
              method: order.paymentMethod,
              amount: order.total,
            },
          ]
        : undefined)

    return {
      ...order,
      items: orderItemsWithProducts,
      electronicInvoice,
      paymentMethods,
    }
  },
})

export const markAsPrinted = authMutation({
  args: {
    organizationId: v.string(),
    id: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.id)
    if (!order) throw new OrderNotFoundError()

    if (order.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para actualizar este pedido"
      )
    }

    await ctx.db.patch(args.id, {
      printedAt: Date.now(),
    })
  },
})

export const unmarkAsPrinted = authMutation({
  args: {
    organizationId: v.string(),
    id: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.id)
    if (!order) throw new OrderNotFoundError()

    if (order.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para actualizar este pedido"
      )
    }

    await ctx.db.patch(args.id, {
      printedAt: undefined,
    })
  },
})

export const markAsPaid = authMutation({
  args: {
    organizationId: v.string(),
    id: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.id)
    if (!order) throw new OrderNotFoundError()

    if (order.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para actualizar este pedido"
      )
    }

    await ctx.db.patch(args.id, {
      paidAt: Date.now(),
    })
  },
})

export const unmarkAsPaid = authMutation({
  args: {
    organizationId: v.string(),
    id: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.id)
    if (!order) throw new OrderNotFoundError()

    if (order.organizationId !== args.organizationId) {
      throw new UnauthorizedError(
        "No estás autorizado para actualizar este pedido"
      )
    }

    await ctx.db.patch(args.id, {
      paidAt: undefined,
    })
  },
})

export const createOrderFromConversation = authMutation({
  args: {
    organizationId: v.string(),
    conversationId: v.id("conversations"),
    items: v.array(
      v.object({
        menuProducts: v.array(v.id("menuProducts")),
        quantity: v.number(),
        notes: v.optional(v.string()),
      })
    ),
    orderType: orderTypeValidator,
    deliveryAddress: v.optional(v.string()),
    paymentMethod: paymentMethodValidator,
    restaurantLocationId: v.id("restaurantLocations"),
    scheduledTime: v.optional(v.number()),
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      })
    ),
    deliveryFee: v.optional(v.number()),
    paymentMethods: v.optional(
      v.array(
        v.object({
          method: paymentMethodValidator,
          amount: v.optional(v.number()),
          referenceCode: v.optional(v.string()),
          notes: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const orgId = args.organizationId

    // Get and validate conversation
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversación no encontrada",
      })
    }

    if (conversation.organizationId !== orgId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "No estás autorizado para usar esta conversación",
      })
    }

    if (conversation.status !== "escalated") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Solo se pueden crear pedidos desde conversaciones escaladas",
      })
    }

    // Get contact information
    const contact = await ctx.db.get(conversation.contactId)
    if (!contact) {
      throw new ContactNotFoundError()
    }

    if (!contact.displayName) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "El cliente no tiene nombre registrado",
      })
    }

    // Validate order type specific requirements
    if (args.orderType === "delivery" && !args.deliveryAddress) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message:
          "La dirección de entrega es obligatoria para pedidos de delivery",
      })
    }

    if (args.orderType === "pickup" && args.deliveryAddress) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Para pedidos de pickup NO se requiere dirección de entrega",
      })
    }

    // Validate restaurant location
    const restaurantLocation = await ctx.db.get(args.restaurantLocationId)
    if (!restaurantLocation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Ubicación del restaurante no encontrada",
      })
    }

    if (restaurantLocation.organizationId !== orgId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "No estás autorizado para usar esta ubicación de restaurante",
      })
    }

    // Validate items
    for (let i = 0; i < args.items.length; i++) {
      const item = args.items[i]

      if (!item) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: `El artículo ${i + 1} no está definido`,
        })
      }

      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: `El artículo ${i + 1} debe tener una cantidad entera positiva`,
        })
      }

      if (!item.menuProducts || item.menuProducts.length === 0) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: `El artículo ${i + 1} debe tener al menos un producto del menú`,
        })
      }

      // Validate all menuProducts exist and belong to the organization
      for (const productId of item.menuProducts) {
        const product = await ctx.db.get(productId)
        if (!product) {
          throw new ConvexError({
            code: "NOT_FOUND",
            message: `Producto del menú ${productId} no encontrado`,
          })
        }
        if (product.organizationId !== orgId) {
          throw new ConvexError({
            code: "UNAUTHORIZED",
            message: `Producto del menú ${productId} no pertenece a la organización`,
          })
        }
      }
    }

    // Validate scheduled time if provided
    if (args.scheduledTime) {
      const restaurantConfig = await ctx.db
        .query("restaurantConfiguration")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
        .first()

      const minAdvanceMinutes =
        restaurantConfig?.minAdvanceMinutes ??
        DEFAULT_RESTAURANT_CONFIG.minAdvanceMinutes
      const maxAdvanceDays =
        restaurantConfig?.maxAdvanceDays ??
        DEFAULT_RESTAURANT_CONFIG.maxAdvanceDays

      const now = Date.now()
      const minAdvanceTime = minAdvanceMinutes * 60 * 1000
      const maxAdvanceTime = maxAdvanceDays * 24 * 60 * 60 * 1000

      if (args.scheduledTime <= now + minAdvanceTime) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: `El pedido debe programarse con al menos ${minAdvanceMinutes} minutos de anticipación`,
        })
      }

      if (args.scheduledTime > now + maxAdvanceTime) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: `El pedido no puede programarse con más de ${maxAdvanceDays} días de anticipación`,
        })
      }
    }

    // Calculate item pricing
    const itemsWithPrices = await Promise.all(
      args.items.map(async (item) => {
        const products = await Promise.all(
          item.menuProducts.map(async (productId) => {
            const product = await ctx.db.get(productId)
            if (!product) {
              throw new ConvexError({
                code: "NOT_FOUND",
                message: `Producto con ID ${productId} no encontrado`,
              })
            }
            return product
          })
        )

        const unitPrice = products.reduce(
          (sum, product) => sum + product.price,
          0
        )

        return {
          ...item,
          unitPrice,
          totalPrice: unitPrice * item.quantity,
          products,
        }
      })
    )

    // Calculate totals
    const subtotal = itemsWithPrices.reduce(
      (sum, item) => sum + item.totalPrice,
      0
    )
    const deliveryFee = args.orderType === "pickup" ? 0 : args.deliveryFee || 0
    const total = subtotal + (deliveryFee || 0)

    // Generate order number
    const orderNumber = await Orders.generateOrderNumber(
      ctx,
      restaurantLocation.code,
      orgId,
      args.restaurantLocationId
    )

    // Create the order
    const orderId = await ctx.db.insert("orders", {
      orderNumber,
      customerName: contact.displayName,
      customerPhone: contact.phoneNumber,
      organizationId: orgId,
      conversationId: args.conversationId,
      contactId: contact._id,
      restaurantLocationId: args.restaurantLocationId,
      subtotal: Math.round(subtotal),
      deliveryFee,
      total: Math.round(total),
      status: args.scheduledTime ? "programado" : "pendiente",
      orderType: args.orderType,
      deliveryAddress: args.deliveryAddress,
      coordinates: args.coordinates,
      paymentMethod: args.paymentMethod,
      paymentMethods: args.paymentMethods,
      scheduledTime: args.scheduledTime,
      printedAt: undefined,
      paidAt: undefined,
    })
    const createdOrder = await ctx.db.get(orderId)
    if (createdOrder) {
      await aggregateOrdersByOrganization.insertIfDoesNotExist(
        ctx,
        createdOrder
      )
    }

    // Update conversation with order reference
    await ctx.db.patch(args.conversationId, {
      orderId,
    })

    // Create order items
    await Promise.all(
      itemsWithPrices.map(async (item) => {
        const orderItemId = await ctx.db.insert("orderItems", {
          orderId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          notes: item.notes,
          organizationId: orgId,
        })

        // Create menu product order items for each product in the combination
        await Promise.all(
          item.menuProducts.map(async (productId) => {
            const product = await ctx.db.get(productId)
            if (product) {
              const category = await ctx.db.get(product.menuProductCategoryId)
              const size = product.sizeId
                ? await ctx.db.get(product.sizeId)
                : null

              await ctx.db.insert("menuProductOrderItems", {
                menuProductId: productId,
                orderItemId,
                quantity: item.quantity,
                unitPrice: product.price,
                totalPrice: product.price * item.quantity,
                productName: product.name,
                productDescription: product.description,
                productCategoryName: category?.name || "Sin categoría",
                productSizeName: size?.name,
                organizationId: orgId,
              })
            }
          })
        )
      })
    )

    // Update contact's last known address (only for delivery orders)
    if (args.orderType === "delivery" && args.deliveryAddress) {
      await ctx.db.patch(contact._id, {
        lastKnownAddress: args.deliveryAddress,
      })
    }

    // Schedule activation if it's a scheduled order (with tracking)
    if (args.scheduledTime) {
      await Orders.scheduleOrderActivation(ctx, {
        orderId,
        organizationId: orgId,
        scheduledTime: args.scheduledTime,
      })
    }

    return {
      orderId,
      orderNumber,
      total: Math.round(total),
    }
  },
})

export const createManualOrder = authMutation({
  args: {
    organizationId: v.string(),
    customerName: v.string(),
    customerPhone: v.string(),
    items: v.array(
      v.object({
        menuProducts: v.array(v.id("menuProducts")),
        quantity: v.number(),
        notes: v.optional(v.string()),
      })
    ),
    orderType: orderTypeValidator,
    deliveryAddress: v.optional(v.string()),
    paymentMethod: paymentMethodValidator,
    restaurantLocationId: v.id("restaurantLocations"),
    scheduledTime: v.optional(v.number()),
    deliveryFee: v.optional(v.number()),
    paymentMethods: v.optional(
      v.array(
        v.object({
          method: paymentMethodValidator,
          amount: v.optional(v.number()),
          referenceCode: v.optional(v.string()),
          notes: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const orgId = args.organizationId

    // Validate order type specific requirements
    if (args.orderType === "delivery" && !args.deliveryAddress) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message:
          "La dirección de entrega es obligatoria para pedidos de delivery",
      })
    }

    if (args.orderType === "pickup" && args.deliveryAddress) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Para pedidos de pickup NO se requiere dirección de entrega",
      })
    }

    // Validate restaurant location
    const restaurantLocation = await ctx.db.get(args.restaurantLocationId)
    if (!restaurantLocation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Ubicación del restaurante no encontrada",
      })
    }

    if (restaurantLocation.organizationId !== orgId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "No estás autorizado para usar esta ubicación de restaurante",
      })
    }

    // Validate items
    for (let i = 0; i < args.items.length; i++) {
      const item = args.items[i]

      if (!item) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: `El artículo ${i + 1} no está definido`,
        })
      }

      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: `El artículo ${i + 1} debe tener una cantidad entera positiva`,
        })
      }

      if (!item.menuProducts || item.menuProducts.length === 0) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: `El artículo ${i + 1} debe tener al menos un producto del menú`,
        })
      }

      // Validate all menuProducts exist and belong to the organization
      for (const productId of item.menuProducts) {
        const product = await ctx.db.get(productId)
        if (!product) {
          throw new ConvexError({
            code: "NOT_FOUND",
            message: `Producto del menú ${productId} no encontrado`,
          })
        }
        if (product.organizationId !== orgId) {
          throw new ConvexError({
            code: "UNAUTHORIZED",
            message: `Producto del menú ${productId} no pertenece a la organización`,
          })
        }
      }
    }

    // Validate scheduled time if provided
    if (args.scheduledTime) {
      const restaurantConfig = await ctx.db
        .query("restaurantConfiguration")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
        .first()

      const minAdvanceMinutes =
        restaurantConfig?.minAdvanceMinutes ??
        DEFAULT_RESTAURANT_CONFIG.minAdvanceMinutes
      const maxAdvanceDays =
        restaurantConfig?.maxAdvanceDays ??
        DEFAULT_RESTAURANT_CONFIG.maxAdvanceDays

      const now = Date.now()
      const minAdvanceTime = minAdvanceMinutes * 60 * 1000
      const maxAdvanceTime = maxAdvanceDays * 24 * 60 * 60 * 1000

      if (args.scheduledTime <= now + minAdvanceTime) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: `El pedido debe programarse con al menos ${minAdvanceMinutes} minutos de anticipación`,
        })
      }

      if (args.scheduledTime > now + maxAdvanceTime) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: `El pedido no puede programarse con más de ${maxAdvanceDays} días de anticipación`,
        })
      }
    }

    // Create a contact for this customer if it doesn't exist
    let contact = await ctx.db
      .query("contacts")
      .withIndex("by_organization_and_phone", (q) =>
        q.eq("organizationId", orgId).eq("phoneNumber", args.customerPhone)
      )
      .first()

    if (!contact) {
      const contactId = await ctx.db.insert("contacts", {
        phoneNumber: args.customerPhone,
        displayName: args.customerName,
        organizationId: orgId,
        lastMessageAt: undefined,
        isBlocked: false,
        lastKnownAddress:
          args.orderType === "delivery" ? args.deliveryAddress : undefined,
      })
      contact = await ctx.db.get(contactId)
      if (!contact) {
        throw new ContactNotFoundError()
      }
      await aggregateContactsByOrganization.insertIfDoesNotExist(ctx, contact)
    } else if (!contact.displayName && args.customerName) {
      // Update contact name if not set
      await ctx.db.patch(contact._id, {
        displayName: args.customerName,
      })
      contact.displayName = args.customerName
    }

    // Get first active WhatsApp configuration for manual orders
    const whatsappConfig = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_organization_and_active", (q) =>
        q.eq("organizationId", orgId).eq("isActive", true)
      )
      .first()

    if (!whatsappConfig) {
      throw new ConvexError({
        code: "CONFIGURATION_ERROR",
        message:
          "No hay configuración activa de WhatsApp disponible para crear el pedido",
      })
    }

    // Create a conversation for this order
    const threadId = `manual-order-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    const conversationId = await ctx.db.insert("conversations", {
      threadId,
      organizationId: orgId,
      contactId: contact._id,
      status: "unresolved", // Will be resolved after order creation
      whatsappConfigurationId: whatsappConfig._id,
    })
    const createdConversation = await ctx.db.get(conversationId)
    if (createdConversation) {
      await aggregateConversationsByOrganization.insertIfDoesNotExist(
        ctx,
        createdConversation
      )
    }

    // Calculate item pricing
    const itemsWithPrices = await Promise.all(
      args.items.map(async (item) => {
        const products = await Promise.all(
          item.menuProducts.map(async (productId) => {
            const product = await ctx.db.get(productId)
            if (!product) {
              throw new ConvexError({
                code: "NOT_FOUND",
                message: `Producto con ID ${productId} no encontrado`,
              })
            }
            return product
          })
        )

        const unitPrice = products.reduce(
          (sum, product) => sum + product.price,
          0
        )

        return {
          ...item,
          unitPrice,
          totalPrice: unitPrice * item.quantity,
          products,
        }
      })
    )

    // Calculate totals
    const subtotal = itemsWithPrices.reduce(
      (sum, item) => sum + item.totalPrice,
      0
    )
    const deliveryFee = args.orderType === "pickup" ? 0 : undefined
    const total = subtotal + (deliveryFee || 0)

    // Generate order number
    const orderNumber = await Orders.generateOrderNumber(
      ctx,
      restaurantLocation.code,
      orgId,
      args.restaurantLocationId
    )

    // Create the order
    const orderId = await ctx.db.insert("orders", {
      orderNumber,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      organizationId: orgId,
      conversationId: conversationId,
      contactId: contact._id,
      restaurantLocationId: args.restaurantLocationId,
      subtotal: Math.round(subtotal),
      deliveryFee,
      total: Math.round(total),
      status: args.scheduledTime ? "programado" : "pendiente",
      orderType: args.orderType,
      deliveryAddress: args.deliveryAddress,
      paymentMethod: args.paymentMethod,
      paymentMethods: args.paymentMethods,
      scheduledTime: args.scheduledTime,
      printedAt: undefined,
      paidAt: undefined,
    })
    const createdOrder = await ctx.db.get(orderId)
    if (createdOrder) {
      await aggregateOrdersByOrganization.insertIfDoesNotExist(
        ctx,
        createdOrder
      )
    }

    // Update conversation with order reference
    await ctx.db.patch(conversationId, {
      orderId,
    })

    // Create order items
    await Promise.all(
      itemsWithPrices.map(async (item) => {
        const orderItemId = await ctx.db.insert("orderItems", {
          orderId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          notes: item.notes,
          organizationId: orgId,
        })

        // Create menu product order items for each product in the combination
        await Promise.all(
          item.menuProducts.map(async (productId) => {
            const product = await ctx.db.get(productId)
            if (product) {
              const category = await ctx.db.get(product.menuProductCategoryId)
              const size = product.sizeId
                ? await ctx.db.get(product.sizeId)
                : null

              await ctx.db.insert("menuProductOrderItems", {
                menuProductId: productId,
                orderItemId,
                quantity: item.quantity,
                unitPrice: product.price,
                totalPrice: product.price * item.quantity,
                productName: product.name,
                productDescription: product.description,
                productCategoryName: category?.name || "Sin categoría",
                productSizeName: size?.name,
                organizationId: orgId,
              })
            }
          })
        )
      })
    )

    // Update contact's last known address (only for delivery orders)
    if (args.orderType === "delivery" && args.deliveryAddress) {
      await ctx.db.patch(contact._id, {
        lastKnownAddress: args.deliveryAddress,
      })
    }

    // Schedule activation if it's a scheduled order (with tracking)
    if (args.scheduledTime) {
      await Orders.scheduleOrderActivation(ctx, {
        orderId,
        organizationId: orgId,
        scheduledTime: args.scheduledTime,
      })
    }

    return {
      orderId,
      orderNumber,
      total: Math.round(total),
    }
  },
})
