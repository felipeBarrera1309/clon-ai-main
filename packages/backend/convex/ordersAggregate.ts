import { TableAggregate } from "@convex-dev/aggregate"
import { v } from "convex/values"
import { components } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"
import { internalMutation, internalQuery } from "./_generated/server"

/**
 * Order Aggregates Component
 *
 * This aggregate allows efficient counting and grouping of orders by:
 * - Organization (namespace)
 * - Restaurant Location & Date (sort key)
 */

export const aggregateOrdersByOrganization = new TableAggregate<{
  Namespace: string // organizationId
  Key: [string, number] // restaurantLocationId, date
  DataModel: DataModel
  TableName: "orders"
}>(components.aggregateOrdersByOrganization, {
  namespace: (doc) => doc.organizationId,
  sortKey: (doc) => [doc.restaurantLocationId, doc._creationTime],
  sumValue: (doc) => doc.total,
})

// Clear aggregate for entire organization
export const clearAggregateOrdersByOrganization = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("orders").collect()
    // Get unique organization IDs from orders
    const orgIds = new Set(orders.map((order) => order.organizationId))

    // Clear aggregate for each organization
    for (const orgId of orgIds) {
      await aggregateOrdersByOrganization.clear(ctx, {
        namespace: orgId,
      })
    }

    return {
      success: true,
      message: "Aggregate data cleared successfully",
      timestamp: Date.now(),
    }
  },
})

// Resync aggregate for entire organization
export const resyncAggregateOrdersByOrganization = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all orders to rebuild the aggregate
    const orders = await ctx.db.query("orders").collect()
    // Get unique organization IDs from orders
    for (const order of orders) {
      await aggregateOrdersByOrganization.insert(ctx, order)
    }
    return {
      success: true,
      message: "Aggregate data resynced successfully",
      timestamp: Date.now(),
    }
  },
})

// Count aggregate data for entire organization
export const countAggregateOrdersByOrganization = internalQuery({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("orders").collect()
    const orgIds = new Set(orders.map((order) => order.organizationId))
    const results: Record<string, { count: number; total: number }> = {}

    for (const orgId of orgIds) {
      const count = await aggregateOrdersByOrganization.count(ctx, {
        namespace: orgId,
      })
      const sum = await aggregateOrdersByOrganization.sum(ctx, {
        namespace: orgId,
      })
      results[orgId] = { count, total: sum }
    }

    console.log("results", results)
    return {
      success: true,
      timestamp: Date.now(),
      counts: results,
    }
  },
})
