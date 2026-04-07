import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../../_generated/server"
import { aggregateContactsByOrganization } from "../../contactsAggregate"
import { aggregateConversationsByOrganization } from "../../conversationsAggregate"
import { aggregateDeliveryAreasByOrganization } from "../../deliveryAreasAggregate"
import { aggregateMenuProductsByOrganization } from "../../menuProductsAggregate"
import { aggregateOrdersByOrganization } from "../../ordersAggregate"
import { aggregateRestaurantLocationsByOrganization } from "../../restaurantLocationsAggregate"

const PAGE_SIZE = 200

const pageArgs = {
  organizationId: v.string(),
  cursor: v.union(v.string(), v.null()),
  clearFirst: v.optional(v.boolean()),
}

type RebuildPageResult = {
  processed: number
  nextCursor: string | null
  isDone: boolean
}

export const rebuildConversationsAggregatePage = internalMutation({
  args: pageArgs,
  handler: async (ctx, args): Promise<RebuildPageResult> => {
    if (args.clearFirst) {
      await aggregateConversationsByOrganization.clear(ctx, {
        namespace: args.organizationId,
      })
    }

    const page = await ctx.db
      .query("conversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .paginate({ cursor: args.cursor, numItems: PAGE_SIZE })

    await Promise.all(
      page.page.map((doc) =>
        aggregateConversationsByOrganization.insertIfDoesNotExist(ctx, doc)
      )
    )

    return {
      processed: page.page.length,
      nextCursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    }
  },
})

export const rebuildContactsAggregatePage = internalMutation({
  args: pageArgs,
  handler: async (ctx, args): Promise<RebuildPageResult> => {
    if (args.clearFirst) {
      await aggregateContactsByOrganization.clear(ctx, {
        namespace: args.organizationId,
      })
    }

    const page = await ctx.db
      .query("contacts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .paginate({ cursor: args.cursor, numItems: PAGE_SIZE })

    await Promise.all(
      page.page.map((doc) =>
        aggregateContactsByOrganization.insertIfDoesNotExist(ctx, doc)
      )
    )

    return {
      processed: page.page.length,
      nextCursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    }
  },
})

export const rebuildMenuProductsAggregatePage = internalMutation({
  args: pageArgs,
  handler: async (ctx, args): Promise<RebuildPageResult> => {
    if (args.clearFirst) {
      await aggregateMenuProductsByOrganization.clear(ctx, {
        namespace: args.organizationId,
      })
    }

    const page = await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .paginate({ cursor: args.cursor, numItems: PAGE_SIZE })

    await Promise.all(
      page.page.map((doc) =>
        aggregateMenuProductsByOrganization.insertIfDoesNotExist(ctx, doc)
      )
    )

    return {
      processed: page.page.length,
      nextCursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    }
  },
})

export const rebuildRestaurantLocationsAggregatePage = internalMutation({
  args: pageArgs,
  handler: async (ctx, args): Promise<RebuildPageResult> => {
    if (args.clearFirst) {
      await aggregateRestaurantLocationsByOrganization.clear(ctx, {
        namespace: args.organizationId,
      })
    }

    const page = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .paginate({ cursor: args.cursor, numItems: PAGE_SIZE })

    await Promise.all(
      page.page.map((doc) =>
        aggregateRestaurantLocationsByOrganization.insertIfDoesNotExist(
          ctx,
          doc
        )
      )
    )

    return {
      processed: page.page.length,
      nextCursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    }
  },
})

export const rebuildDeliveryAreasAggregatePage = internalMutation({
  args: pageArgs,
  handler: async (ctx, args): Promise<RebuildPageResult> => {
    if (args.clearFirst) {
      await aggregateDeliveryAreasByOrganization.clear(ctx, {
        namespace: args.organizationId,
      })
    }

    const page = await ctx.db
      .query("deliveryAreas")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .paginate({ cursor: args.cursor, numItems: PAGE_SIZE })

    await Promise.all(
      page.page.map((doc) =>
        aggregateDeliveryAreasByOrganization.insertIfDoesNotExist(ctx, doc)
      )
    )

    return {
      processed: page.page.length,
      nextCursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    }
  },
})

export const rebuildOrdersAggregatePage = internalMutation({
  args: pageArgs,
  handler: async (ctx, args): Promise<RebuildPageResult> => {
    if (args.clearFirst) {
      await aggregateOrdersByOrganization.clear(ctx, {
        namespace: args.organizationId,
      })
    }

    const page = await ctx.db
      .query("orders")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .paginate({ cursor: args.cursor, numItems: PAGE_SIZE })

    await Promise.all(
      page.page.map((doc) =>
        aggregateOrdersByOrganization.insertIfDoesNotExist(ctx, doc)
      )
    )

    return {
      processed: page.page.length,
      nextCursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    }
  },
})

export const listOrganizationIdsForAggregateRebuild = internalQuery({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.runQuery(
      components.betterAuth.organizations.listAll,
      {}
    )
    return organizations.map((org) => org._id)
  },
})

export const rebuildOrganizationAggregatesForOrg = internalAction({
  args: {
    organizationId: v.string(),
    includeOrders: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    success: true
    organizationId: string
    counts: {
      conversations: number
      contacts: number
      menuProducts: number
      restaurantLocations: number
      deliveryAreas: number
      orders: number
    }
    timestamp: number
  }> => {
    const includeOrders = args.includeOrders ?? true
    const organizationId = args.organizationId

    let conversationsCount = 0
    let cursor: string | null = null
    let isFirstBatch = true
    while (true) {
      const batch: RebuildPageResult = await ctx.runMutation(
        internal.system.migrations.rebuildOrganizationAggregates
          .rebuildConversationsAggregatePage,
        { organizationId, cursor, clearFirst: isFirstBatch }
      )
      conversationsCount += batch.processed
      if (batch.isDone) break
      cursor = batch.nextCursor
      isFirstBatch = false
    }

    let contactsCount = 0
    cursor = null
    isFirstBatch = true
    while (true) {
      const batch: RebuildPageResult = await ctx.runMutation(
        internal.system.migrations.rebuildOrganizationAggregates
          .rebuildContactsAggregatePage,
        { organizationId, cursor, clearFirst: isFirstBatch }
      )
      contactsCount += batch.processed
      if (batch.isDone) break
      cursor = batch.nextCursor
      isFirstBatch = false
    }

    let menuProductsCount = 0
    cursor = null
    isFirstBatch = true
    while (true) {
      const batch: RebuildPageResult = await ctx.runMutation(
        internal.system.migrations.rebuildOrganizationAggregates
          .rebuildMenuProductsAggregatePage,
        { organizationId, cursor, clearFirst: isFirstBatch }
      )
      menuProductsCount += batch.processed
      if (batch.isDone) break
      cursor = batch.nextCursor
      isFirstBatch = false
    }

    let restaurantLocationsCount = 0
    cursor = null
    isFirstBatch = true
    while (true) {
      const batch: RebuildPageResult = await ctx.runMutation(
        internal.system.migrations.rebuildOrganizationAggregates
          .rebuildRestaurantLocationsAggregatePage,
        { organizationId, cursor, clearFirst: isFirstBatch }
      )
      restaurantLocationsCount += batch.processed
      if (batch.isDone) break
      cursor = batch.nextCursor
      isFirstBatch = false
    }

    let deliveryAreasCount = 0
    cursor = null
    isFirstBatch = true
    while (true) {
      const batch: RebuildPageResult = await ctx.runMutation(
        internal.system.migrations.rebuildOrganizationAggregates
          .rebuildDeliveryAreasAggregatePage,
        { organizationId, cursor, clearFirst: isFirstBatch }
      )
      deliveryAreasCount += batch.processed
      if (batch.isDone) break
      cursor = batch.nextCursor
      isFirstBatch = false
    }

    let ordersCount = 0
    if (includeOrders) {
      cursor = null
      isFirstBatch = true
      while (true) {
        const batch: RebuildPageResult = await ctx.runMutation(
          internal.system.migrations.rebuildOrganizationAggregates
            .rebuildOrdersAggregatePage,
          { organizationId, cursor, clearFirst: isFirstBatch }
        )
        ordersCount += batch.processed
        if (batch.isDone) break
        cursor = batch.nextCursor
        isFirstBatch = false
      }
    }

    return {
      success: true,
      organizationId,
      counts: {
        conversations: conversationsCount,
        contacts: contactsCount,
        menuProducts: menuProductsCount,
        restaurantLocations: restaurantLocationsCount,
        deliveryAreas: deliveryAreasCount,
        orders: ordersCount,
      },
      timestamp: Date.now(),
    }
  },
})

/**
 * Backwards-compatible entrypoint kept for existing scripts.
 * WARNING: can still timeout on large deployments.
 */
export const rebuildAllOrganizationAggregates = internalAction({
  args: {
    includeOrders: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    success: true
    organizationResults: Array<{
      organizationId: string
      counts: {
        conversations: number
        contacts: number
        menuProducts: number
        restaurantLocations: number
        deliveryAreas: number
        orders: number
      }
    }>
    timestamp: number
  }> => {
    const organizationIds = await ctx.runQuery(
      internal.system.migrations.rebuildOrganizationAggregates
        .listOrganizationIdsForAggregateRebuild,
      {}
    )

    const organizationResults: Array<{
      organizationId: string
      counts: {
        conversations: number
        contacts: number
        menuProducts: number
        restaurantLocations: number
        deliveryAreas: number
        orders: number
      }
    }> = []

    for (const organizationId of organizationIds) {
      const result = await ctx.runAction(
        internal.system.migrations.rebuildOrganizationAggregates
          .rebuildOrganizationAggregatesForOrg,
        { organizationId, includeOrders: args.includeOrders }
      )
      organizationResults.push({
        organizationId: result.organizationId,
        counts: result.counts,
      })
    }

    return {
      success: true,
      organizationResults,
      timestamp: Date.now(),
    }
  },
})
