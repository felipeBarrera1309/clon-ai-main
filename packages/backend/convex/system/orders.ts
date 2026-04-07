import { ConvexError, v } from "convex/values"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server"
import { DEFAULT_RESTAURANT_CONFIG } from "../lib/constants"
import {
  ContactNotFoundError,
  ConversationNotFoundError,
  OrderNotFoundError,
  RestaurantLocationNotFoundError,
  UnauthorizedError,
} from "../lib/errors"
import {
  sanitizeCedula,
  sanitizeNIT,
  validateInvoiceData,
} from "../lib/invoiceValidation"
import { getConversationByThreadId } from "../model/conversations"
import * as Orders from "../model/orders"
// Import business logic from model
import {
  activateScheduledOrderAction,
  type CreateOrderInput,
  calculateOrderTotals,
  createOrderRecord,
  getOrderWithItemsAndProducts,
  type OrderItemInput,
  validateModificationTimeWindow,
  validateOrderItems,
  validateOrderRequirements,
  validateRestaurantAvailability,
} from "../model/orders"
import {
  orderStatusValidator,
  orderTypeValidator,
  paymentMethodValidator,
} from "../schema"
import { parseColombianTime } from "./ai/constants"

// Unified function to check if an order can be modified
async function validateOrderCanBeModified(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  organizationId: string
) {
  const order = await ctx.db.get(orderId)
  if (!order) {
    throw new OrderNotFoundError()
  }

  if (order.organizationId !== organizationId) {
    throw new UnauthorizedError("No tienes permisos para modificar este pedido")
  }

  if (order.status !== "programado") {
    throw new ConvexError({
      code: "INVALID_ORDER_STATUS",
      message: `Solo se pueden modificar pedidos programados. El estado actual es: ${order.status}`,
    })
  }

  return order
}

export const create = internalMutation({
  args: {
    customerName: v.string(),
    customerPhone: v.string(),
    organizationId: v.string(),
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    restaurantLocationId: v.id("restaurantLocations"),
    items: v.array(
      v.object({
        menuProducts: v.array(v.id("menuProducts")), // Array of product IDs that form this combination
        quantity: v.number(),
        notes: v.optional(v.string()),
      })
    ),
    orderType: orderTypeValidator,
    deliveryAddress: v.optional(v.string()),
    paymentMethod: paymentMethodValidator,
  },
  handler: async (ctx, args) => {
    // Validate order requirements
    await validateOrderRequirements(ctx, {
      orderType: args.orderType,
      deliveryAddress: args.deliveryAddress,
    })

    // Validate restaurant availability
    const restaurantLocation = await validateRestaurantAvailability(
      ctx,
      args.restaurantLocationId
    )

    // Validate and calculate pricing for order items
    const itemsWithPrices = await validateOrderItems(
      ctx,
      args.items,
      args.organizationId
    )

    // Calculate totals
    const totals = calculateOrderTotals(itemsWithPrices, args.orderType)

    // Generate order number
    const orderNumber = await Orders.generateOrderNumber(
      ctx,
      restaurantLocation.code,
      args.organizationId,
      args.restaurantLocationId
    )

    // Create the order record
    const orderInput: CreateOrderInput = {
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      organizationId: args.organizationId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      restaurantLocationId: args.restaurantLocationId,
      items: args.items,
      orderType: args.orderType,
      deliveryAddress: args.deliveryAddress,
      paymentMethod: args.paymentMethod,
    }

    const orderId = await createOrderRecord(
      ctx,
      orderInput,
      orderNumber,
      itemsWithPrices,
      totals
    )

    // Create order items for each item in the order
    await Promise.all(
      itemsWithPrices.map(async (item) => {
        return await Orders.createOrderItem(ctx, {
          orderId,
          menuProducts: item.menuProducts,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          notes: item.notes,
          organizationId: args.organizationId,
        })
      })
    )

    return orderId
  },
})

// REMOVED: createScheduled function
// This function was redundant since createFromAiTool now handles both immediate and scheduled orders
// and provides better integration with centralized business logic

export const activateScheduledOrder = internalAction({
  args: {
    orderId: v.id("orders"),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await activateScheduledOrderAction(ctx, args.orderId, args.organizationId)
  },
})

export const updateStatus = internalMutation({
  args: {
    orderId: v.id("orders"),
    status: orderStatusValidator,
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await Orders.updateOrderStatus(
      ctx,
      args.orderId,
      args.status,
      args.organizationId
    )
  },
})

/**
 * Clean up tracking records for a scheduled order
 * Called after activation or when order is no longer valid
 */
export const cleanupOrderScheduledFunctionTracking = internalMutation({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const trackedFunctions = await ctx.db
      .query("orderScheduledFunctions")
      .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
      .collect()

    for (const tracked of trackedFunctions) {
      await ctx.db.delete(tracked._id)
    }

    if (trackedFunctions.length > 0) {
      console.log(
        `⏰ [SCHEDULED ORDER] Cleaned up ${trackedFunctions.length} tracking records for order ${args.orderId}`
      )
    }
  },
})

export const updateOrder = internalMutation({
  args: {
    orderId: v.id("orders"),
    organizationId: v.string(),
    scheduledTime: v.optional(v.union(v.number(), v.string())), // Support both timestamp and ISO string
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
    subtotal: v.optional(v.number()),
    total: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const order = await Orders.getOrder(ctx, args.orderId)
    await Orders.ensureCanBeModified(order, args.organizationId)

    // Parse scheduledTime to number (handles both number and ISO string inputs)
    let scheduledTimestamp: number | undefined
    if (typeof args.scheduledTime === "string") {
      scheduledTimestamp = parseColombianTime(args.scheduledTime)
    } else if (typeof args.scheduledTime === "number") {
      scheduledTimestamp = args.scheduledTime
    }

    // For scheduled orders, validate time constraints
    if (order.status === "programado" && scheduledTimestamp !== undefined) {
      const now = Date.now()
      const minAdvanceTime = 30 * 60 * 1000 // 30 minutes minimum
      const maxAdvanceTime = 7 * 24 * 60 * 60 * 1000 // 7 days maximum

      if (scheduledTimestamp <= now + minAdvanceTime) {
        throw new ConvexError({
          code: "INVALID_SCHEDULED_TIME",
          message:
            "El nuevo horario debe ser con al menos 30 minutos de anticipación",
        })
      }

      if (scheduledTimestamp > now + maxAdvanceTime) {
        throw new ConvexError({
          code: "INVALID_SCHEDULED_TIME",
          message:
            "El nuevo horario no puede ser con más de 7 días de anticipación",
        })
      }
    }

    // Prepare update data
    const updateData: Record<string, unknown> = {}

    if (scheduledTimestamp !== undefined) {
      // Only update if the scheduled time is different from current
      if (order.scheduledTime !== scheduledTimestamp) {
        updateData.scheduledTime = scheduledTimestamp
        // Cancel existing scheduled job and create new one
        await Orders.cancelOrderScheduledJobs(ctx, {
          orderId: args.orderId,
          organizationId: args.organizationId,
        })
        // Schedule new activation with tracking
        await Orders.scheduleOrderActivation(ctx, {
          orderId: args.orderId,
          organizationId: args.organizationId,
          scheduledTime: scheduledTimestamp,
        })
      }
    }

    if (args.deliveryAddress !== undefined) {
      updateData.deliveryAddress = args.deliveryAddress
    }

    if (args.paymentMethods !== undefined) {
      updateData.paymentMethods = args.paymentMethods
      if (args.paymentMethods.length > 0 && args.paymentMethods[0]) {
        updateData.paymentMethod = args.paymentMethods[0].method
      }
    } else if (args.paymentMethod !== undefined) {
      updateData.paymentMethod = args.paymentMethod
      updateData.paymentMethods = [{ method: args.paymentMethod }]
    }

    if (args.items !== undefined) {
      // Update order items using business logic
      const updateResult = await Orders.updateOrderItems(
        ctx,
        args.orderId,
        args.organizationId,
        args.items
      )

      updateData.items = updateResult.orderItemIds
      updateData.subtotal = updateResult.subtotal
      updateData.total = updateResult.total
    }

    if (Object.keys(updateData).length > 0) {
      await ctx.db.patch(args.orderId, updateData)
    }

    // Return success information for better response handling
    return {
      success: true,
      orderId: args.orderId,
      changes: Object.keys(updateData),
    }
  },
})

export const modifyScheduledOrder = internalMutation({
  args: {
    orderId: v.id("orders"),
    organizationId: v.string(),
    items: v.optional(
      v.array(
        v.object({
          menuProducts: v.array(v.string()),
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
                menuProductId: v.string(),
                productName: v.string(),
                upcharge: v.number(),
                quantity: v.optional(v.number()),
              })
            )
          ),
        })
      )
    ),
    orderType: v.optional(orderTypeValidator),
    deliveryAddress: v.optional(v.string()),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
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
    scheduledTime: v.optional(v.string()), // ISO string format for scheduled time
    deliveryFee: v.optional(v.number()),
    recipientName: v.optional(v.string()),
    recipientPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate that the order can be modified
    const order = await validateOrderCanBeModified(
      ctx,
      args.orderId,
      args.organizationId
    )

    // Validate delivery fee requirements for address changes
    if (args.deliveryAddress !== undefined && args.deliveryFee === undefined) {
      throw new ConvexError({
        code: "DELIVERY_FEE_REQUIRED",
        message:
          "Cuando se cambia la dirección de entrega, es obligatoria una nueva tarifa de domicilio obtenida de validateAddressTool",
      })
    }

    // Get restaurant configuration for payment settings (with fallback to defaults)
    const restaurantConfig =
      (await ctx.db
        .query("restaurantConfiguration")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .unique()) || DEFAULT_RESTAURANT_CONFIG

    // Validate and parse scheduled time if provided
    let scheduledTimestamp: number | undefined
    if (args.scheduledTime) {
      scheduledTimestamp = parseColombianTime(args.scheduledTime)

      const now = Date.now()
      const minAdvanceTime = restaurantConfig.minAdvanceMinutes * 60 * 1000 // 30 minutes minimum
      const maxAdvanceTime =
        restaurantConfig.maxAdvanceDays * 24 * 60 * 60 * 1000 // 7 days maximum

      if (scheduledTimestamp <= now + minAdvanceTime) {
        throw new ConvexError({
          code: "INVALID_SCHEDULED_TIME",
          message: `El nuevo horario debe ser con al menos ${restaurantConfig.minAdvanceMinutes} minutos de anticipación`,
        })
      }

      if (scheduledTimestamp > now + maxAdvanceTime) {
        throw new ConvexError({
          code: "INVALID_SCHEDULED_TIME",
          message: `El nuevo horario no puede ser con más de ${restaurantConfig.maxAdvanceDays} días de anticipación`,
        })
      }

      // Validate restaurant availability at the new scheduled time
      const restaurantLocationId =
        args.restaurantLocationId || order.restaurantLocationId
      await validateRestaurantAvailability(
        ctx,
        restaurantLocationId,
        scheduledTimestamp
      )
    }

    // Prepare items with proper Id types if provided
    let itemsWithCombinations: OrderItemInput[] | undefined
    let subtotal: number | undefined
    let total: number | undefined

    if (args.items) {
      // Convert menuProducts arrays to proper Id types
      itemsWithCombinations = args.items.map((item) => ({
        menuProducts: item.menuProducts.map(
          (productId) => productId as Id<"menuProducts">
        ),
        quantity: item.quantity,
        notes: item.notes,
        itemType: item.itemType,
        comboId: item.comboId,
        comboName: item.comboName,
        comboBasePrice: item.comboBasePrice,
        comboSlotSelections: item.comboSlotSelections?.map((sel) => ({
          ...sel,
          menuProductId: sel.menuProductId as Id<"menuProducts">,
        })),
      }))

      // Calculate new totals by getting product prices for each combination
      let calculatedSubtotal = 0
      for (const item of itemsWithCombinations) {
        // Get all products in this combination to calculate unit price
        const products = await Promise.all(
          item.menuProducts.map(async (productId) => {
            // Use ctx.db.get() instead of runQuery - CORRECT WAY
            const product = await ctx.db.get(productId)
            if (!product) {
              throw new ConvexError({
                code: "PRODUCT_NOT_FOUND",
                message: `Producto con ID ${productId} no encontrado`,
              })
            }
            return product
          })
        )

        // Calculate unit price for this combination (sum of all product prices)
        const unitPrice = products.reduce(
          (sum, product) => sum + product.price,
          0
        )
        calculatedSubtotal += unitPrice * item.quantity
      }

      subtotal = Math.round(calculatedSubtotal)
      total = subtotal // Total equals subtotal since menu products already include tax
    }

    // Prepare update data - DO ALL DATABASE OPERATIONS DIRECTLY
    const updateData: Record<string, unknown> = {}

    // Handle scheduled time update
    if (scheduledTimestamp !== undefined) {
      // Only update if the scheduled time is different from current
      if (order.scheduledTime !== scheduledTimestamp) {
        updateData.scheduledTime = scheduledTimestamp
        // Cancel existing scheduled job and create new one
        await Orders.cancelOrderScheduledJobs(ctx, {
          orderId: args.orderId,
          organizationId: args.organizationId,
        })
        // Schedule new activation with tracking
        await Orders.scheduleOrderActivation(ctx, {
          orderId: args.orderId,
          organizationId: args.organizationId,
          scheduledTime: scheduledTimestamp,
        })
      }
    }

    // Handle other field updates
    if (args.deliveryAddress !== undefined) {
      updateData.deliveryAddress = args.deliveryAddress
    }

    if (args.paymentMethods !== undefined) {
      updateData.paymentMethods = args.paymentMethods
      if (args.paymentMethods.length > 0 && args.paymentMethods[0]) {
        updateData.paymentMethod = args.paymentMethods[0].method
      }
    } else if (args.paymentMethod !== undefined) {
      updateData.paymentMethod = args.paymentMethod
      updateData.paymentMethods = [{ method: args.paymentMethod }]
    }

    if (args.orderType !== undefined) {
      updateData.orderType = args.orderType
    }

    if (args.restaurantLocationId !== undefined) {
      updateData.restaurantLocationId = args.restaurantLocationId
    }

    if (args.deliveryFee !== undefined) {
      updateData.deliveryFee = args.deliveryFee
    }

    if (args.recipientName !== undefined) {
      updateData.customerName = args.recipientName
    }

    if (args.recipientPhone !== undefined) {
      updateData.customerPhone = args.recipientPhone
    }

    if (args.items !== undefined) {
      const itemsWithIds = args.items.map((item) => ({
        menuProducts: item.menuProducts.map(
          (productId) => productId as Id<"menuProducts">
        ),
        quantity: item.quantity,
        notes: item.notes,
        itemType: item.itemType,
        comboId: item.comboId,
        comboName: item.comboName,
        comboBasePrice: item.comboBasePrice,
        comboSlotSelections: item.comboSlotSelections?.map((sel) => ({
          ...sel,
          menuProductId: sel.menuProductId as Id<"menuProducts">,
        })),
      }))

      // Update order items using business logic
      const updateResult = await Orders.updateOrderItems(
        ctx,
        args.orderId,
        args.organizationId,
        itemsWithIds
      )

      updateData.subtotal = updateResult.subtotal
      updateData.total = updateResult.total
    }

    // Recalculate total if deliveryFee changed and items weren't updated
    if (args.deliveryFee !== undefined && args.items === undefined) {
      const order = await ctx.db.get(args.orderId)
      if (order) {
        updateData.total = (order.subtotal || 0) + (args.deliveryFee || 0)
      }
    }

    // Apply all updates in one database operation
    if (Object.keys(updateData).length > 0) {
      await ctx.db.patch(args.orderId, updateData)
    }

    // Prepare response message
    const changes = []
    if (args.items) changes.push("productos")
    if (args.deliveryAddress) changes.push("dirección de entrega")
    if (args.paymentMethod) changes.push("método de pago")
    if (args.orderType) changes.push("tipo de pedido")
    if (args.restaurantLocationId) changes.push("ubicación del restaurante")
    if (args.deliveryFee !== undefined) changes.push("tarifa de domicilio")
    if (args.recipientName) changes.push("nombre del destinatario")
    if (args.recipientPhone) changes.push("teléfono del destinatario")
    if (scheduledTimestamp) {
      const newDate = new Date(scheduledTimestamp).toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
      changes.push(`horario programado a ${newDate}`)
    }

    let response = `Pedido programado modificado exitosamente. Cambios realizados: ${changes.join(", ")}.`

    // Add payment URL if payment method was changed to payment_link and URL is configured
    if (
      args.paymentMethod === "payment_link" &&
      restaurantConfig?.paymentLinkUrl
    ) {
      response += ` Para realizar el pago, utiliza este enlace: ${restaurantConfig.paymentLinkUrl}`
    }

    // Add bank accounts if payment method was changed to bank_transfer and accounts are configured
    if (
      args.paymentMethod === "bank_transfer" &&
      restaurantConfig?.bankAccounts &&
      restaurantConfig.bankAccounts.length > 0
    ) {
      response += ` Para realizar la transferencia a cuenta bancaria, puedes usar cualquiera de estas cuentas:\n`
      restaurantConfig.bankAccounts.forEach((account, index) => {
        response += `${index + 1}. ${account}\n`
      })
    }

    return {
      success: true,
      message: response,
      orderId: args.orderId,
      changes: changes,
    }
  },
})

export const getOne = internalQuery({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId)
    if (!order) return null

    // Get orderItems with their product details using business logic
    const orderItemsWithProducts = await getOrderWithItemsAndProducts(
      ctx,
      args.orderId
    )

    return {
      ...order,
      items: orderItemsWithProducts,
    }
  },
})

export const cancelScheduledOrder = internalMutation({
  args: {
    threadId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await getConversationByThreadId(ctx, {
      threadId: args.threadId,
    })
    const organizationId = conversation.organizationId
    if (!conversation.orderId) {
      console.error(
        `Error al cancelar el pedido programado: No hay pedido asociado a esta conversación: ${conversation.orderId}`
      )
      throw new ConversationNotFoundError()
    }
    await Orders.cancelOrderAndScheduledJob(
      ctx,
      conversation.orderId,
      organizationId,
      args.reason
    )
    return `Tu pedido programado #${conversation.orderId} ha sido cancelado.
**Razón:** ${args.reason}
Si deseas hacer un nuevo pedido, puedes iniciar una conversación en cualquier momento.`
  },
})

export const getScheduledOrders = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_organization_and_scheduled", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.neq(q.field("scheduledTime"), undefined))
      .collect()

    // Get orderItems with product details for each order using business logic
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const orderItemsWithProducts = await getOrderWithItemsAndProducts(
          ctx,
          order._id
        )

        return {
          ...order,
          items: orderItemsWithProducts,
        }
      })
    )

    return ordersWithItems
  },
})

export const cancelScheduledJob = internalMutation({
  args: {
    orderId: v.id("orders"),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await Orders.cancelOrderScheduledJobs(ctx, {
      orderId: args.orderId,
      organizationId: args.organizationId,
    })
  },
})

// OrderItems management functions
export const createOrderItem = internalMutation({
  args: {
    orderId: v.id("orders"),
    menuProducts: v.array(v.id("menuProducts")),
    quantity: v.number(),
    unitPrice: v.number(),
    notes: v.optional(v.string()),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await Orders.createOrderItem(ctx, args)
  },
})

export const getOrderItem = internalQuery({
  args: {
    orderItemId: v.id("orderItems"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.orderItemId)
  },
})

export const getOrderItemsByOrder = internalQuery({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orderItems")
      .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
      .collect()
  },
})

export const updatePendingOrder = internalMutation({
  args: {
    orderId: v.string(),
    organizationId: v.string(),
    items: v.optional(
      v.array(
        v.object({
          menuProducts: v.array(v.string()),
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
                menuProductId: v.string(),
                productName: v.string(),
                upcharge: v.number(),
                quantity: v.optional(v.number()),
              })
            )
          ),
        })
      )
    ),
    orderType: v.optional(orderTypeValidator),
    deliveryAddress: v.optional(v.string()),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
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
    deliveryFee: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const normalizedOrderId = await ctx.db.normalizeId("orders", args.orderId)
    if (!normalizedOrderId) {
      throw new ConvexError({
        code: "INVALID_ORDER_ID_FORMAT",
        message:
          "ID de pedido inválido. Usa el ID interno de Convex (ej: 'jh7...'), no el código visible del pedido (ej: BRA-000109).",
      })
    }

    // Validate that the order can be modified within the time window
    await validateModificationTimeWindow(
      ctx,
      normalizedOrderId,
      args.organizationId
    )

    // Validate delivery fee requirements for address changes
    if (args.deliveryAddress !== undefined && args.deliveryFee === undefined) {
      throw new ConvexError({
        code: "DELIVERY_FEE_REQUIRED",
        message:
          "Cuando se cambia la dirección de entrega, es obligatoria una nueva tarifa de domicilio obtenida de validateAddressTool",
      })
    }

    // Get restaurant configuration for payment settings
    const restaurantConfig =
      (await ctx.db
        .query("restaurantConfiguration")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .first()) || DEFAULT_RESTAURANT_CONFIG

    // Prepare update data
    const updateData: Record<string, unknown> = {}

    // Handle field updates
    if (args.deliveryAddress !== undefined) {
      updateData.deliveryAddress = args.deliveryAddress
    }

    if (args.paymentMethods !== undefined) {
      updateData.paymentMethods = args.paymentMethods
      if (args.paymentMethods.length > 0 && args.paymentMethods[0]) {
        updateData.paymentMethod = args.paymentMethods[0].method
      }
    } else if (args.paymentMethod !== undefined) {
      updateData.paymentMethod = args.paymentMethod
      updateData.paymentMethods = [{ method: args.paymentMethod }]
    }

    if (args.orderType !== undefined) {
      updateData.orderType = args.orderType
    }

    if (args.restaurantLocationId !== undefined) {
      updateData.restaurantLocationId = args.restaurantLocationId
    }

    if (args.deliveryFee !== undefined) {
      updateData.deliveryFee = args.deliveryFee
    }

    if (args.items !== undefined) {
      // Convert string IDs to proper Id types for updateOrderItems
      const itemsWithIds = args.items.map((item) => ({
        menuProducts: item.menuProducts.map(
          (productId) => productId as Id<"menuProducts">
        ),
        quantity: item.quantity,
        notes: item.notes,
        itemType: item.itemType,
        comboId: item.comboId,
        comboName: item.comboName,
        comboBasePrice: item.comboBasePrice,
        comboSlotSelections: item.comboSlotSelections?.map((sel) => ({
          ...sel,
          menuProductId: sel.menuProductId as Id<"menuProducts">,
        })),
      }))

      // Update order items using business logic
      const updateResult = await Orders.updateOrderItems(
        ctx,
        normalizedOrderId,
        args.organizationId,
        itemsWithIds
      )

      updateData.subtotal = updateResult.subtotal
      updateData.total = updateResult.total
    }

    // Recalculate total if deliveryFee changed and items weren't updated
    if (args.deliveryFee !== undefined && args.items === undefined) {
      const order = await ctx.db.get(normalizedOrderId)
      if (order) {
        updateData.total = (order.subtotal || 0) + (args.deliveryFee || 0)
      }
    }

    // Apply all updates in one database operation
    if (Object.keys(updateData).length > 0) {
      await ctx.db.patch(normalizedOrderId, updateData)
    }

    // Prepare response message
    const changes = []
    if (args.items) changes.push("productos")
    if (args.deliveryAddress) changes.push("dirección de entrega")
    if (args.paymentMethod) changes.push("método de pago")
    if (args.orderType) changes.push("tipo de pedido")
    if (args.restaurantLocationId) changes.push("ubicación del restaurante")
    if (args.deliveryFee !== undefined) changes.push("tarifa de domicilio")

    let response = `Pedido modificado exitosamente. Cambios realizados: ${changes.join(", ")}.`

    // Add payment URL if payment method was changed to payment_link and URL is configured
    if (
      args.paymentMethod === "payment_link" &&
      restaurantConfig?.paymentLinkUrl
    ) {
      response += ` Para realizar el pago, utiliza este enlace: ${restaurantConfig.paymentLinkUrl}`
    }

    // Add bank accounts if payment method was changed to bank_transfer and accounts are configured
    if (
      args.paymentMethod === "bank_transfer" &&
      restaurantConfig?.bankAccounts &&
      restaurantConfig.bankAccounts.length > 0
    ) {
      response += ` Para realizar la transferencia a cuenta bancaria, puedes usar cualquiera de estas cuentas:\n`
      restaurantConfig.bankAccounts.forEach((account, index) => {
        response += `${index + 1}. ${account}\n`
      })
    }

    return {
      success: true,
      message: response,
      orderId: normalizedOrderId,
      changes: changes,
    }
  },
})

export const createFromAiTool = internalMutation({
  args: {
    threadId: v.string(),
    items: v.array(
      v.object({
        menuProducts: v.array(v.string()),
        quantity: v.number(),
        notes: v.optional(v.string()),
        itemType: v.optional(v.union(v.literal("regular"), v.literal("combo"))),
        comboId: v.optional(v.string()),
        comboName: v.optional(v.string()),
        comboBasePrice: v.optional(v.number()),
        comboSlotSelections: v.optional(
          v.array(
            v.object({
              slotId: v.optional(v.string()),
              slotName: v.string(),
              menuProductId: v.string(),
              productName: v.string(),
              upcharge: v.number(),
              quantity: v.optional(v.number()),
            })
          )
        ),
      })
    ),
    orderType: orderTypeValidator,
    deliveryAddress: v.optional(v.string()),
    paymentMethod: paymentMethodValidator,
    restaurantLocationId: v.string(),
    deliveryFee: v.optional(v.number()),
    scheduledTime: v.optional(v.number()), // Optional for scheduled orders from AI tool
    recipientName: v.optional(v.string()),
    recipientPhone: v.optional(v.string()),
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
    invoiceData: v.optional(
      v.object({
        requiresInvoice: v.boolean(),
        invoiceType: v.optional(
          v.union(v.literal("natural"), v.literal("juridica"))
        ),
        email: v.optional(v.string()),
        fullName: v.optional(v.string()),
        cedula: v.optional(v.string()),
        nit: v.optional(v.string()),
      })
    ),
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Get conversation by threadId
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique()

    if (!conversation) {
      throw new ConversationNotFoundError("Conversación no encontrada")
    }

    const { order, restaurantLocation, restaurantConfig } =
      await Orders.createOrder(ctx, {
        conversation: conversation,
        contactId: conversation.contactId,
        items: args.items.map((item) => ({
          menuProducts: item.menuProducts.map(
            (productId) => productId as Id<"menuProducts">
          ),
          quantity: item.quantity,
          notes: item.notes,
          itemType: item.itemType,
          comboId: item.comboId,
          comboName: item.comboName,
          comboBasePrice: item.comboBasePrice,
          comboSlotSelections: item.comboSlotSelections?.map((sel) => ({
            ...sel,
            menuProductId: sel.menuProductId as Id<"menuProducts">,
          })),
        })),
        orderType: args.orderType,
        deliveryAddress: args.deliveryAddress,
        paymentMethod: args.paymentMethod,
        restaurantLocationId:
          args.restaurantLocationId as Id<"restaurantLocations">,
        deliveryFee: args.deliveryFee,
        scheduledTime: args.scheduledTime,
        recipientName: args.recipientName,
        recipientPhone: args.recipientPhone,
        paymentMethods: args.paymentMethods,
        coordinates: args.coordinates,
      })

    // Schedule order activation if this is a scheduled order
    // Schedule order activation if this is a scheduled order (with tracking)
    if (args.scheduledTime) {
      await Orders.scheduleOrderActivation(ctx, {
        orderId: order._id,
        organizationId: conversation.organizationId,
        scheduledTime: args.scheduledTime,
      })
    }

    // Create electronic invoice if required
    if (args.invoiceData?.requiresInvoice && args.invoiceData.invoiceType) {
      // Validate invoice data one more time before creating
      const validation = validateInvoiceData(args.invoiceData)
      if (!validation.isValid) {
        throw new ConvexError({
          code: "INVALID_INVOICE_DATA",
          message: validation.error || "Datos de factura inválidos",
        })
      }

      const invoiceId = await ctx.db.insert("electronicInvoices", {
        orderId: order._id,
        organizationId: conversation.organizationId,
        invoiceType: args.invoiceData.invoiceType,
        email: args.invoiceData.email || "",
        fullName: args.invoiceData.fullName || "",
        cedula:
          args.invoiceData.invoiceType === "natural"
            ? sanitizeCedula(args.invoiceData.cedula)
            : undefined,
        nit:
          args.invoiceData.invoiceType === "juridica"
            ? sanitizeNIT(args.invoiceData.nit)
            : undefined,
      })

      // Update order with invoice ID
      await ctx.db.patch(order._id, {
        electronicInvoiceId: invoiceId,
      })
    }

    // Save payment methods array directly on order if provided
    if (args.paymentMethods && args.paymentMethods.length > 0) {
      await ctx.db.patch(order._id, {
        paymentMethods: args.paymentMethods.map((payment) => ({
          method: payment.method,
          amount: payment.amount || order.total,
          referenceCode: payment.referenceCode,
          notes: payment.notes,
        })),
      })
    }

    // Update conversation to track creation state
    // NOTE: orderId is already set in Orders.createOrder, no need to set it again
    if (conversation.orderCreatedBeforeEscalation !== false) {
      await ctx.db.patch(conversation._id, {
        orderCreatedBeforeEscalation: true,
      })
    }

    return {
      conversation,
      order,
      restaurantConfig,
      restaurantLocation,
    }
  },
})

export const verifyOrderQuery = internalQuery({
  args: {
    deliveryAddress: v.optional(v.string()),
    threadId: v.string(),
    restaurantLocationId: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique()
    if (!conversation) {
      throw new ConversationNotFoundError()
    }
    if (!conversation.contactId) {
      throw new ContactNotFoundError()
    }
    const normalizedRestaurantLocationId = await ctx.db.normalizeId(
      "restaurantLocations",
      args.restaurantLocationId
    )
    if (!normalizedRestaurantLocationId) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Id de la sucursal no tiene el formato válido",
      })
    }
    const restaurantLocation = await ctx.db.get(normalizedRestaurantLocationId)
    if (!restaurantLocation) {
      throw new RestaurantLocationNotFoundError()
    }
    const contact = await ctx.db.get(conversation.contactId)
    if (!contact) {
      throw new ContactNotFoundError()
    }
    return {
      contact,
      restaurantLocation,
      conversation,
    }
  },
})

// ============================================================================
// PENDING ORDER CONFIRMATION FUNCTIONS
// These functions prevent LLM caching/hallucination issues by storing
// the confirmed order data and validating makeOrderTool against it
// ============================================================================

/**
 * Save pending order confirmation data when confirmOrderTool is called
 * This creates a "snapshot" of what the customer saw and confirmed
 */
export const savePendingOrderConfirmation = internalMutation({
  args: {
    threadId: v.string(),
    items: v.array(
      v.object({
        menuProducts: v.array(v.string()),
        quantity: v.number(),
        notes: v.optional(v.string()),
        itemType: v.optional(v.union(v.literal("regular"), v.literal("combo"))),
        comboId: v.optional(v.string()),
        comboName: v.optional(v.string()),
        comboBasePrice: v.optional(v.number()),
        comboSlotSelections: v.optional(
          v.array(
            v.object({
              slotId: v.optional(v.string()),
              slotName: v.string(),
              menuProductId: v.string(),
              productName: v.string(),
              upcharge: v.number(),
              quantity: v.optional(v.number()),
            })
          )
        ),
      })
    ),
    orderType: v.string(),
    deliveryAddress: v.optional(v.string()),
    paymentMethods: v.array(
      v.object({
        method: paymentMethodValidator, // Assuming paymentMethodTypeValidator is paymentMethodValidator
        amount: v.number(),
        referenceCode: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
    restaurantLocationId: v.string(),
    deliveryFee: v.optional(v.number()),
    recipientName: v.string(),
    recipientPhone: v.string(),
    invoiceData: v.object({
      requiresInvoice: v.boolean(),
      invoiceType: v.optional(
        v.union(v.literal("natural"), v.literal("juridica"))
      ), // Assuming invoiceTypeValidator is this union
      email: v.optional(v.string()),
      fullName: v.optional(v.string()),
      cedula: v.optional(v.string()),
      nit: v.optional(v.string()),
    }),
    // Validation fields
    subtotal: v.number(),
    total: v.number(),
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique()

    if (!conversation) {
      throw new ConversationNotFoundError()
    }

    const pendingOrderConfirmation = {
      items: args.items,
      orderType: args.orderType,
      deliveryAddress: args.deliveryAddress,
      paymentMethods: args.paymentMethods,
      restaurantLocationId: args.restaurantLocationId,
      deliveryFee: args.deliveryFee,
      recipientName: args.recipientName,
      recipientPhone: args.recipientPhone,
      invoiceData: args.invoiceData,
      subtotal: args.subtotal,
      total: args.total,
      confirmedAt: Date.now(),
      coordinates: args.coordinates,
    }

    await ctx.db.patch(conversation._id, {
      pendingOrderConfirmation,
    })

    console.log(
      `✅ [PENDING ORDER] Saved confirmation for conversation ${conversation._id}:`,
      {
        items: args.items,
        subtotal: args.subtotal,
        total: args.total,
        restaurantLocationId: args.restaurantLocationId,
      }
    )

    return pendingOrderConfirmation
  },
})

/**
 * Get pending order confirmation data for validation in makeOrderTool
 */
export const getPendingOrderConfirmation = internalQuery({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique()

    if (!conversation) {
      return null
    }

    return conversation.pendingOrderConfirmation
  },
})

/**
 * Clear pending order confirmation after successful order creation
 * NOTE: Currently NOT in use - pendingOrderConfirmation is kept as audit trail
 * This function is maintained for future use when data is migrated to audit table
 */
export const clearPendingOrderConfirmation = internalMutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique()

    if (conversation) {
      await ctx.db.patch(conversation._id, {
        pendingOrderConfirmation: undefined,
      })
      console.log(
        `🧹 [PENDING ORDER] Cleared confirmation for conversation ${conversation._id}`
      )
    }
  },
})
