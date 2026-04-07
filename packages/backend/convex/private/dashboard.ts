import { v } from "convex/values"
import type { Id } from "../_generated/dataModel"
import { action } from "../_generated/server"
import {
  authMutation,
  authQuery,
  calculatePercentageChange,
  getDateRange,
} from "../lib/helpers"

// RAG Status Check and Management
export const checkAndPopulateRAG = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Get menu products count
      const menuProducts = await ctx.db
        .query("menuProducts")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      // Get menu categories
      const menuCategories = await ctx.db
        .query("menuProductCategories")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      let ragStatus = {
        status: "unknown" as string,
        indexedProducts: 0,
        error: null as string | null,
        action: "none" as string,
      }

      // Check if we need to index
      if (menuProducts.length === 0) {
        ragStatus = {
          status: "no_products",
          indexedProducts: 0,
          error: "No hay productos en el menú para indexar",
          action: "add_menu_products",
        }
      } else {
        // For now, we'll mark as needs_indexing since we can't run actions from mutations easily
        ragStatus = {
          status: "needs_indexing",
          indexedProducts: 0,
          error: null,
          action: "run_indexing_action",
        }
      }

      return {
        databaseStatus: {
          totalProducts: menuProducts.length,
          totalCategories: menuCategories.length,
        },
        ragStatus,
        timestamp: Date.now(),
      }
    } catch (error) {
      return {
        error: "Error checking RAG status",
        details: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      }
    }
  },
})

// RAG Status Check - Verificar estado del sistema RAG
export const getRAGStatus = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Get menu products count
      const menuProducts = await ctx.db
        .query("menuProducts")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      // Get menu categories
      const menuCategories = await ctx.db
        .query("menuProductCategories")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      // For now, we'll assume RAG status based on menu products
      // In a real implementation, you'd check the RAG database directly
      let ragStatus = "unknown"
      let ragProductCount = 0
      const ragError = "RAG status check not implemented in query context"

      // Simple heuristic: if we have menu products, RAG might be populated
      if (menuProducts.length > 0) {
        ragStatus = "possibly_populated"
        ragProductCount = menuProducts.length // Approximation
      } else {
        ragStatus = "empty"
      }

      return {
        databaseStatus: {
          totalProducts: menuProducts.length,
          totalCategories: menuCategories.length,
          availableProducts: menuProducts.length, // For now, assume all products are available
        },
        ragStatus: {
          status: ragStatus,
          indexedProducts: ragProductCount,
          error: ragError,
          lastChecked: Date.now(),
        },
        recommendations: {
          needsIndexing: menuProducts.length > 0 && ragProductCount === 0,
          hasProducts: menuProducts.length > 0,
          hasCategories: menuCategories.length > 0,
        },
      }
    } catch (error) {
      return {
        error: "Error checking RAG status",
        details: error instanceof Error ? error.message : String(error),
      }
    }
  },
})

export const getMetrics = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    // Parallel execution for better performance
    const [orders, conversations, menuProducts, menuCategories] =
      await Promise.all([
        // Get all orders for the organization using optimized index
        ctx.db
          .query("orders")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .order("desc")
          .collect(),

        // Get all conversations for the organization using optimized index
        ctx.db
          .query("conversations")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .order("desc")
          .collect(),

        // Get all menu products for the organization
        ctx.db
          .query("menuProducts")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .collect(),

        // Get all menu categories for the organization
        ctx.db
          .query("menuProductCategories")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .collect(),
      ])

    // Calculate metrics
    const totalOrders = orders.length
    const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0)
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

    // Order status distribution
    const ordersByStatus = orders.reduce(
      (acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    // Conversation status distribution
    const conversationsByStatus = conversations.reduce(
      (acc, conversation) => {
        acc[conversation.status] = (acc[conversation.status] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    // Recent orders (last 10)
    const recentOrders = orders
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 10)
      .map((order) => ({
        _id: order._id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        total: order.total,
        status: order.status,
        _creationTime: order._creationTime,
      }))

    // Monthly revenue (current month)
    const now = new Date()
    const currentMonthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).getTime()
    const currentMonthOrders = orders.filter(
      (order) => order._creationTime >= currentMonthStart
    )
    const monthlyRevenue = currentMonthOrders.reduce(
      (sum, order) => sum + order.total,
      0
    )

    return {
      totalOrders,
      totalRevenue,
      averageOrderValue,
      monthlyRevenue,
      ordersByStatus,
      conversationsByStatus,
      recentOrders,
      productsStats: {
        total: menuProducts.length,
        categories: menuCategories.length,
      },
      totalConversations: conversations.length,
    }
  },
})

export const getRecentActivity = authQuery({
  args: {
    organizationId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 5

    // Parallel execution with optimized indexes for better performance
    const [recentOrders, recentConversations] = await Promise.all([
      // Get recent orders using optimized compound index
      ctx.db
        .query("orders")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .order("desc")
        .take(limit),

      // Get recent conversations using optimized compound index
      ctx.db
        .query("conversations")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .order("desc")
        .take(limit),
    ])

    return {
      recentOrders: recentOrders.map((order) => ({
        _id: order._id,
        type: "order" as const,
        title: `Pedido #${order.orderNumber}`,
        subtitle: `${order.customerName} - $${Math.round(order.total).toLocaleString("es-CO")}`,
        status: order.status,
        timestamp: order._creationTime,
      })),
      recentConversations: recentConversations.map((conversation) => ({
        _id: conversation._id,
        type: "conversation" as const,
        title: "Nueva conversación",
        subtitle: `Estado: ${conversation.status}`,
        status: conversation.status,
        timestamp: conversation._creationTime,
      })),
    }
  },
})

export const getFilteredMetrics = authQuery({
  args: {
    organizationId: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    console.log(`[DEBUG] getFilteredMetrics called with args:`, args)

    let currentStartTime: number
    let currentEndTime: number
    let previousStartTime: number
    let previousEndTime: number

    // Check if custom date range is provided
    if (args.startDate && args.endDate) {
      currentStartTime = args.startDate
      // Always include the entire end date (from start of day to end of day)
      currentEndTime = args.endDate + 24 * 60 * 60 * 1000 - 1

      // Calculate previous period for comparison (same duration before start date)
      const duration = currentEndTime - currentStartTime
      previousEndTime = currentStartTime - 1
      previousStartTime = previousEndTime - duration

      console.log(`[DEBUG] Custom date range:`, {
        start: new Date(currentStartTime).toISOString(),
        end: new Date(currentEndTime).toISOString(),
        duration: duration,
        originalStart: new Date(args.startDate).toISOString(),
        originalEnd: new Date(args.endDate).toISOString(),
      })
    } else {
      // Use default last week
      const { current, previous } = getDateRange("lastWeek")
      currentStartTime = current.start
      currentEndTime = current.end
      previousStartTime = previous.start
      previousEndTime = previous.end
    }

    // Parallel execution with optimized compound indexes for better performance
    const [currentOrders, previousOrders, currentConversations] =
      await Promise.all([
        // Get current period orders using optimized compound index
        ctx.db
          .query("orders")
          .withIndex("by_organization_id", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .gte("_creationTime", currentStartTime)
              .lte("_creationTime", currentEndTime)
          )
          .collect(),

        // Get previous period orders using optimized compound index
        ctx.db
          .query("orders")
          .withIndex(
            "by_organization_id",
            (q) =>
              q
                .eq("organizationId", args.organizationId)
                .gte("_creationTime", previousStartTime)
                .lte("_creationTime", previousEndTime + 24 * 60 * 60 * 1000 - 1) // Include the entire end date
          )
          .collect(),

        // Get current period conversations using optimized compound index
        ctx.db
          .query("conversations")
          .withIndex("by_organization_id", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .gte("_creationTime", currentStartTime)
              .lte("_creationTime", currentEndTime)
          )
          .collect(),
      ])

    // Note: Previous conversations are not used in current comparison calculations
    // but could be added later for conversation-specific comparisons

    // Get all menu products for the organization (for product stats)
    const menuProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Get all contacts for total clients calculation
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Calculate current period metrics
    const currentTotalOrders = currentOrders.length
    const currentTotalRevenue = currentOrders.reduce(
      (sum, order) => sum + order.total,
      0
    )
    const currentAverageOrderValue =
      currentTotalOrders > 0 ? currentTotalRevenue / currentTotalOrders : 0

    // Calculate previous period metrics
    const previousTotalOrders = previousOrders.length
    const previousTotalRevenue = previousOrders.reduce(
      (sum, order) => sum + order.total,
      0
    )
    const previousAverageOrderValue =
      previousTotalOrders > 0 ? previousTotalRevenue / previousTotalOrders : 0

    // Calculate comparisons using shared utility
    const ordersChange = calculatePercentageChange(
      currentTotalOrders,
      previousTotalOrders
    )
    const revenueChange = calculatePercentageChange(
      currentTotalRevenue,
      previousTotalRevenue
    )
    const averageOrderChange = calculatePercentageChange(
      currentAverageOrderValue,
      previousAverageOrderValue
    )

    // Order status distribution for current period
    const ordersByStatus = currentOrders.reduce(
      (acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    // Conversation status distribution for current period
    const conversationsByStatus = currentConversations.reduce(
      (acc, conversation) => {
        acc[conversation.status] = (acc[conversation.status] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    // Order creation timing statistics
    const orderCreatedBeforeEscalationConversations =
      currentConversations.filter(
        (c) => c.orderCreatedBeforeEscalation === true
      ).length
    const resolvedConversations = currentConversations.filter(
      (c) => c.status === "resolved"
    ).length
    const conversationsWithOrders = currentConversations.filter(
      (c) => c.orderId !== undefined
    ).length
    const aiAutomationRate =
      conversationsWithOrders > 0
        ? (orderCreatedBeforeEscalationConversations /
            conversationsWithOrders) *
          100
        : 0
    return {
      totalOrders: currentTotalOrders,
      totalRevenue: currentTotalRevenue,
      averageOrderValue: currentAverageOrderValue,
      totalClients: contacts.length,
      ordersByStatus,
      conversationsByStatus,
      productsStats: {
        total: menuProducts.length,
      },
      totalConversations: currentConversations.length,
      // AI automation metrics
      aiAutomationStats: {
        aiCompletedConversations: orderCreatedBeforeEscalationConversations,
        resolvedConversations,
        aiAutomationRate: Math.round(aiAutomationRate * 100) / 100, // Round to 2 decimal places
      },
      // Comparison data
      comparisons: {
        ordersChange,
        revenueChange,
        averageOrderChange,
        previousOrders: previousTotalOrders,
        previousRevenue: previousTotalRevenue,
        previousAverageOrderValue,
      },
    }
  },
})

// Location-based analytics query
export const getLocationMetrics = authQuery({
  args: {
    organizationId: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let currentStartTime: number
    let currentEndTime: number

    if (args.startDate && args.endDate) {
      currentStartTime = args.startDate
      currentEndTime = args.endDate
    } else {
      const { current } = getDateRange("lastWeek")
      currentStartTime = current.start
      currentEndTime = current.end
    }

    // Get all restaurant locations for the organization
    const locations = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Get orders for the current period
    const orders = await ctx.db
      .query("orders")
      .withIndex(
        "by_organization_id",
        (q) =>
          q
            .eq("organizationId", args.organizationId)
            .gte("_creationTime", currentStartTime)
            .lte("_creationTime", currentEndTime + 24 * 60 * 60 * 1000 - 1) // Include the entire end date
      )
      .collect()

    // Revenue by location
    const revenueByLocation = locations
      .map((location) => {
        const locationOrders = orders.filter(
          (order) => order.restaurantLocationId === location._id
        )
        const revenue = locationOrders.reduce(
          (sum, order) => sum + order.total,
          0
        )
        const orderCount = locationOrders.length

        return {
          locationId: location._id,
          locationName: location.name,
          locationCode: location.code,
          revenue,
          orderCount,
          averageOrderValue: orderCount > 0 ? revenue / orderCount : 0,
        }
      })
      .sort((a, b) => b.revenue - a.revenue)

    // Order type distribution by location
    const orderTypeByLocation = locations.map((location) => {
      const locationOrders = orders.filter(
        (order) => order.restaurantLocationId === location._id
      )
      const delivery = locationOrders.filter(
        (order) => order.orderType === "delivery"
      ).length
      const pickup = locationOrders.filter(
        (order) => order.orderType === "pickup"
      ).length

      return {
        locationName: location.name,
        delivery,
        pickup,
        total: delivery + pickup,
      }
    })

    // Status distribution by location
    const statusByLocation = locations.map((location) => {
      const locationOrders = orders.filter(
        (order) => order.restaurantLocationId === location._id
      )
      const statusCounts = locationOrders.reduce(
        (acc, order) => {
          acc[order.status] = (acc[order.status] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )

      return {
        locationName: location.name,
        ...statusCounts,
      }
    })

    // Payment method distribution by location
    const paymentMethodByLocation = locations.map((location) => {
      const locationOrders = orders.filter(
        (order) => order.restaurantLocationId === location._id
      )
      const paymentCounts = locationOrders.reduce(
        (acc, order) => {
          acc[order.paymentMethod] = (acc[order.paymentMethod] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )

      return {
        locationName: location.name,
        cash: paymentCounts.cash || 0,
        card: paymentCounts.card || 0,
        transfer: paymentCounts.bank_transfer || 0,
      }
    })

    return {
      revenueByLocation,
      orderTypeByLocation,
      statusByLocation,
      paymentMethodByLocation,
      totalLocations: locations.length,
    }
  },
})

// Enhanced order analytics query
export const getOrderAnalytics = authQuery({
  args: {
    organizationId: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    console.log(`[DEBUG] getOrderAnalytics called with args:`, args)

    let currentStartTime: number
    let currentEndTime: number

    if (args.startDate && args.endDate) {
      currentStartTime = args.startDate
      // Always include the entire end date (from start of day to end of day)
      currentEndTime = args.endDate + 24 * 60 * 60 * 1000 - 1
    } else {
      const { current } = getDateRange("lastWeek")
      currentStartTime = current.start
      currentEndTime = current.end
    }

    const orders = await ctx.db
      .query("orders")
      .withIndex(
        "by_organization_id",
        (q) =>
          q
            .eq("organizationId", args.organizationId)
            .gte("_creationTime", currentStartTime)
            .lte("_creationTime", currentEndTime + 24 * 60 * 60 * 1000 - 1) // Include the entire end date
      )
      .collect()

    // Order status timeline (by day)
    const statusTimeline: Record<string, Record<string, number>> = {}
    const dayKey = (ts: number) => {
      const d = new Date(ts)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    }

    orders.forEach((order) => {
      const day = dayKey(order._creationTime)
      if (!statusTimeline[day]) {
        statusTimeline[day] = {}
      }
      statusTimeline[day][order.status] =
        (statusTimeline[day][order.status] || 0) + 1
    })

    // Convert to array format for charts
    const statusTimelineData = Object.entries(statusTimeline)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, statuses]) => ({
        date,
        ...statuses,
      }))

    // Order timing analysis (hours of day)
    const hourlyDistribution: Record<number, number> = {}
    orders.forEach((order) => {
      const hour = new Date(order._creationTime).getHours()
      hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1
    })

    const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      orders: hourlyDistribution[hour] || 0,
      label: `${hour.toString().padStart(2, "0")}:00`,
    }))

    // Payment method trends
    const paymentMethodTrends = {
      cash: orders.filter((o) => o.paymentMethod === "cash").length,
      card: orders.filter((o) => o.paymentMethod === "card").length,
      transfer: orders.filter((o) => o.paymentMethod === "bank_transfer")
        .length,
      payment_link: orders.filter((o) => o.paymentMethod === "payment_link")
        .length,
      corporate_credit: orders.filter(
        (o) => o.paymentMethod === "corporate_credit"
      ).length,
      gift_voucher: orders.filter((o) => o.paymentMethod === "gift_voucher")
        .length,
      sodexo_voucher: orders.filter((o) => o.paymentMethod === "sodexo_voucher")
        .length,
      dynamic_payment_link: orders.filter(
        (o) => o.paymentMethod === "dynamic_payment_link"
      ).length,
    }

    // Order type performance
    const orderTypePerformance = {
      delivery: {
        count: orders.filter((o) => o.orderType === "delivery").length,
        revenue: orders
          .filter((o) => o.orderType === "delivery")
          .reduce((sum, o) => sum + o.total, 0),
      },
      pickup: {
        count: orders.filter((o) => o.orderType === "pickup").length,
        revenue: orders
          .filter((o) => o.orderType === "pickup")
          .reduce((sum, o) => sum + o.total, 0),
      },
    }

    return {
      statusTimelineData,
      hourlyData,
      paymentMethodTrends,
      orderTypePerformance,
    }
  },
})

// Customer analytics query
export const getCustomerAnalytics = authQuery({
  args: {
    organizationId: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    console.log(`[DEBUG] getCustomerAnalytics called with args:`, args)

    let currentStartTime: number
    let currentEndTime: number

    if (args.startDate && args.endDate) {
      currentStartTime = args.startDate
      // Always include the entire end date (from start of day to end of day)
      currentEndTime = args.endDate + 24 * 60 * 60 * 1000 - 1
    } else {
      const { current } = getDateRange("lastWeek")
      currentStartTime = current.start
      currentEndTime = current.end
    }

    // Get all contacts and conversations for the organization
    const [contacts, conversations, orders] = await Promise.all([
      ctx.db
        .query("contacts")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
      ctx.db
        .query("conversations")
        .withIndex(
          "by_organization_id",
          (q) =>
            q
              .eq("organizationId", args.organizationId)
              .gte("_creationTime", currentStartTime)
              .lte("_creationTime", currentEndTime + 24 * 60 * 60 * 1000 - 1) // Include the entire end date
        )
        .collect(),
      ctx.db
        .query("orders")
        .withIndex(
          "by_organization_id",
          (q) =>
            q
              .eq("organizationId", args.organizationId)
              .gte("_creationTime", currentStartTime)
              .lte("_creationTime", currentEndTime + 24 * 60 * 60 * 1000 - 1) // Include the entire end date
        )
        .collect(),
    ])

    // Customer acquisition trends (new customers per day)
    const dayKey = (ts: number) => {
      const d = new Date(ts)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    }

    const newCustomersByDay: Record<string, number> = {}
    contacts.forEach((contact) => {
      if (contact._creationTime >= currentStartTime) {
        const day = dayKey(contact._creationTime)
        newCustomersByDay[day] = (newCustomersByDay[day] || 0) + 1
      }
    })

    const customerAcquisitionData = Object.entries(newCustomersByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, newCustomers: count }))

    // Customer lifetime value distribution
    const customerOrderCounts: Record<string, number> = {}
    orders.forEach((order) => {
      const customerId = String(order.contactId)
      customerOrderCounts[customerId] =
        (customerOrderCounts[customerId] || 0) + 1
    })

    const lifetimeValueDistribution = {
      oneTime: Object.values(customerOrderCounts).filter((count) => count === 1)
        .length,
      repeat: Object.values(customerOrderCounts).filter(
        (count) => count > 1 && count <= 5
      ).length,
      loyal: Object.values(customerOrderCounts).filter((count) => count > 5)
        .length,
    }

    // Conversation to order conversion
    const conversationIds = new Set(conversations.map((c) => c._id))
    const ordersWithConversations = orders.filter((order) =>
      conversationIds.has(order.conversationId)
    )

    const conversionRate =
      conversations.length > 0
        ? (ordersWithConversations.length / conversations.length) * 100
        : 0

    // Geographic distribution (delivery areas)
    const deliveryOrders = orders.filter(
      (order) => order.orderType === "delivery" && order.deliveryAddress
    )
    const addressPatterns: Record<string, number> = {}

    deliveryOrders.forEach((order) => {
      // Extract neighborhood/area from address (simple pattern matching)
      const address = order.deliveryAddress?.toLowerCase() || ""
      const words = address.split(" ")

      // Look for common Colombian neighborhood patterns
      const neighborhood =
        words.find(
          (word) =>
            word.includes("barrio") ||
            word.includes("sector") ||
            word.includes("conjunto") ||
            word.includes("urbanización")
        ) || "Otros"

      addressPatterns[neighborhood] = (addressPatterns[neighborhood] || 0) + 1
    })

    const geographicDistribution = Object.entries(addressPatterns)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([area, count]) => ({ area, count }))

    return {
      customerAcquisitionData,
      lifetimeValueDistribution,
      conversionRate,
      geographicDistribution,
      totalCustomers: contacts.length,
      activeCustomers: Object.keys(customerOrderCounts).length,
    }
  },
})

export const getSalesAnalytics = authQuery({
  args: {
    organizationId: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    console.log(`[DEBUG] getSalesAnalytics called with args:`, args)

    let currentStartTime: number
    let currentEndTime: number

    if (args.startDate && args.endDate) {
      currentStartTime = args.startDate
      // Always include the entire end date (from start of day to end of day)
      currentEndTime = args.endDate + 24 * 60 * 60 * 1000 - 1
    } else {
      const { current } = getDateRange("lastWeek")
      currentStartTime = current.start
      currentEndTime = current.end
    }

    const orders = await ctx.db
      .query("orders")
      .withIndex(
        "by_organization_id",
        (q) =>
          q
            .eq("organizationId", args.organizationId)
            .gte("_creationTime", currentStartTime)
            .lte("_creationTime", currentEndTime + 24 * 60 * 60 * 1000 - 1) // Include the entire end date
      )
      .collect()

    // Sales trend by month for the current year
    const monthKey = (ts: number) => {
      const d = new Date(ts)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    }

    const monthNames = [
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ]

    // Get current year
    const currentYear = new Date().getFullYear()

    // Create map of actual sales data
    const trendMap: Record<string, number> = {}
    for (const order of orders) {
      const key = monthKey(order._creationTime)
      trendMap[key] = (trendMap[key] || 0) + order.total
    }

    // Generate all 12 months of current year with data where available
    const salesTrend = []
    for (let month = 1; month <= 12; month++) {
      const monthKey = `${currentYear}-${String(month).padStart(2, "0")}`
      const monthName = monthNames[month - 1]
      const total = trendMap[monthKey] || 0

      salesTrend.push({
        month: monthName,
        total,
      })
    }

    // Batch load all order items and menu product order items to avoid N+1 queries
    const orderIds = orders.map((order) => order._id)

    // Single query to get all order items for all orders
    const allOrderItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order_id")
      .collect()
      .then((items) => items.filter((item) => orderIds.includes(item.orderId)))

    // Single query to get all menu product order items for all order items
    const orderItemIds = allOrderItems.map((item) => item._id)
    const allMenuProductOrderItems = await ctx.db
      .query("menuProductOrderItems")
      .withIndex("by_order_item_id")
      .collect()
      .then((items) =>
        items.filter((item) => orderItemIds.includes(item.orderItemId))
      )

    // Create lookup maps for efficient data access
    const orderItemsByOrderId = new Map<string, typeof allOrderItems>()
    for (const orderItem of allOrderItems) {
      const orderId = String(orderItem.orderId)
      if (!orderItemsByOrderId.has(orderId)) {
        orderItemsByOrderId.set(orderId, [])
      }
      orderItemsByOrderId.get(orderId)!.push(orderItem)
    }

    const menuProductOrderItemsByOrderItemId = new Map<
      string,
      typeof allMenuProductOrderItems
    >()
    for (const menuProductOrderItem of allMenuProductOrderItems) {
      const orderItemId = String(menuProductOrderItem.orderItemId)
      if (!menuProductOrderItemsByOrderItemId.has(orderItemId)) {
        menuProductOrderItemsByOrderItemId.set(orderItemId, [])
      }
      menuProductOrderItemsByOrderItemId
        .get(orderItemId)!
        .push(menuProductOrderItem)
    }

    // Collect product data using the preloaded data
    const productIdSet = new Set<string>()
    const productUnitsMap: Record<string, number> = {}
    const productRevenueMap: Record<string, number> = {}
    const categoryRevenues = new Map<string, number>()

    for (const order of orders) {
      const orderItems = orderItemsByOrderId.get(String(order._id)) || []

      for (const orderItem of orderItems) {
        const revenue = orderItem.totalPrice
        const menuProductOrderItems =
          menuProductOrderItemsByOrderItemId.get(String(orderItem._id)) || []

        // Collect product IDs and count units
        for (const menuProductOrderItem of menuProductOrderItems) {
          const key = String(menuProductOrderItem.menuProductId)
          productIdSet.add(key)
          productUnitsMap[key] =
            (productUnitsMap[key] || 0) + menuProductOrderItem.quantity
          productRevenueMap[key] =
            (productRevenueMap[key] || 0) + menuProductOrderItem.totalPrice
        }

        // Use first product for category classification
        const firstProductId = menuProductOrderItems[0]?.menuProductId
        if (firstProductId) {
          const productKey = String(firstProductId)
          categoryRevenues.set(
            productKey,
            (categoryRevenues.get(productKey) || 0) + revenue
          )
        }
      }
    }

    // Batch load all products and categories
    const uniqueProductIds = Array.from(productIdSet) as Id<"menuProducts">[]
    const products = await Promise.all(
      uniqueProductIds.map((id) => ctx.db.get(id))
    )

    // Extract unique category IDs and batch load categories
    const categoryIds = new Set<Id<"menuProductCategories">>()
    const validProducts = products.filter(
      (p): p is NonNullable<typeof p> => p !== null
    )

    for (const product of validProducts) {
      categoryIds.add(product.menuProductCategoryId)
    }

    const categories = await Promise.all(
      Array.from(categoryIds).map((id) => ctx.db.get(id))
    )

    // Create lookup maps
    const productIdToName: Record<string, string> = {}
    const productIdToCategory: Record<string, string> = {}
    const categoryIdToName = new Map<string, string>()

    // Map category IDs to names
    for (const category of categories) {
      if (category) {
        categoryIdToName.set(String(category._id), category.name)
      }
    }

    // Map product data
    for (const product of validProducts) {
      const productKey = String(product._id)
      productIdToName[productKey] = product.name

      const categoryName =
        categoryIdToName.get(String(product.menuProductCategoryId)) ||
        "desconocido"
      productIdToCategory[productKey] = categoryName
    }

    // Map category keys to display names
    const categoryDisplayNames: Record<string, string> = {
      pizzas_clasicas: "Pizzas Clásicas",
      pizzas_especiales: "Pizzas Especiales",
      entrantes: "Entrantes",
      bebidas: "Bebidas",
      desconocido: "Otros",
    }

    // Process category revenues using the collected data
    const finalCategoryMap: Record<string, number> = {}
    for (const [productId, revenue] of categoryRevenues.entries()) {
      const category = productIdToCategory[productId] || "desconocido"
      finalCategoryMap[category] = (finalCategoryMap[category] || 0) + revenue
    }

    const salesByCategory = Object.entries(finalCategoryMap)
      .sort((a, b) => b[1] - a[1])
      .map(([category, total]) => ({
        category: categoryDisplayNames[category] || category,
        total,
      }))

    const productDisplayName = (key: string) =>
      productIdToName[key] || "Producto"

    const productsRanked = Object.entries(productUnitsMap)
      .map(([key, units]) => ({ name: productDisplayName(key), units }))
      .sort((a, b) => b.units - a.units)

    const topProducts = productsRanked.slice(0, 10)
    const bottomProducts = productsRanked.slice(-10).reverse()

    const productsRankedByRevenue = Object.entries(productRevenueMap)
      .map(([key, revenue]) => ({ name: productDisplayName(key), revenue }))
      .sort((a, b) => b.revenue - a.revenue)

    const topProductsByProfit = productsRankedByRevenue.slice(0, 10)

    // Combo metrics
    let comboOrderCount = 0
    let comboItemCount = 0
    let comboRevenue = 0
    const comboCountMap = new Map<
      string,
      { name: string; count: number; revenue: number }
    >()

    for (const order of orders) {
      const orderItems = orderItemsByOrderId.get(String(order._id)) || []
      let hasCombo = false

      for (const orderItem of orderItems) {
        if (orderItem.itemType === "combo") {
          hasCombo = true
          comboItemCount++
          comboRevenue += orderItem.totalPrice

          const comboName = orderItem.comboName ?? "Combo"
          const existing = comboCountMap.get(comboName) || {
            name: comboName,
            count: 0,
            revenue: 0,
          }
          existing.count++
          existing.revenue += orderItem.totalPrice
          comboCountMap.set(comboName, existing)
        }
      }

      if (hasCombo) comboOrderCount++
    }

    const topCombos = Array.from(comboCountMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      salesTrend,
      salesByCategory,
      topProducts,
      bottomProducts,
      topProductsByProfit,
      comboMetrics: {
        comboOrderCount,
        comboItemCount,
        comboRevenue,
        topCombos,
      },
    }
  },
})
