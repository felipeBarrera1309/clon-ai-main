import { ConvexError } from "convex/values"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server"
import { DEFAULT_RESTAURANT_CONFIG } from "../lib/constants"
import {
  ContactNotFoundError,
  OrderNotFoundError,
  RestaurantLocationNotFoundError,
} from "../lib/errors"
import { isRestaurantOpen } from "../lib/scheduleUtils"
import { aggregateOrdersByOrganization } from "../ordersAggregate"
import { createComboOrderItem } from "./orderItems"

// Types for better type safety
export interface OrderItemInput {
  menuProducts: Id<"menuProducts">[]
  quantity: number
  notes?: string
  itemType?: "regular" | "combo"
  comboId?: string
  comboName?: string
  comboBasePrice?: number
  comboSlotSelections?: Array<{
    slotId?: Id<"comboSlots"> | string
    slotName: string
    menuProductId: Id<"menuProducts">
    productName: string
    upcharge: number
    quantity?: number
  }>
}

export interface OrderItemWithPricing extends OrderItemInput {
  unitPrice: number
  totalPrice: number
  products: Doc<"menuProducts">[]
}

// Temporal snapshot types for historical order data
export interface TemporalProductSnapshot {
  _id: Id<"menuProducts">
  name: string
  description: string
  quantity?: number
  price: number
  categoryName: string
  sizeName?: string
  comboSlotId?: string
  comboSlotName?: string
  upcharge?: number
}

export interface OrderItemWithProducts extends Doc<"orderItems"> {
  products: TemporalProductSnapshot[]
}

export interface OrderWithItems extends Doc<"orders"> {
  items: OrderItemWithProducts[]
}

export interface CreateOrderInput {
  customerName: string
  customerPhone: string
  organizationId: string
  conversationId: Id<"conversations">
  contactId: Id<"contacts">
  restaurantLocationId: Id<"restaurantLocations">
  items: OrderItemInput[]
  orderType: "delivery" | "pickup"
  deliveryAddress?: string
  paymentMethod:
    | "cash"
    | "card"
    | "payment_link"
    | "bank_transfer"
    | "corporate_credit"
    | "gift_voucher"
    | "sodexo_voucher"
    | "dynamic_payment_link"
  scheduledTime?: number
  coordinates?: {
    lat: number
    lng: number
  }
}

/**
 * Validate order type specific requirements
 */
export async function validateOrderRequirements(
  _ctx: QueryCtx | MutationCtx,
  args: Pick<CreateOrderInput, "orderType" | "deliveryAddress">
): Promise<void> {
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
}

/**
 * Validate restaurant availability
 */
export async function validateRestaurantAvailability(
  ctx: QueryCtx | MutationCtx,
  restaurantLocationId: Id<"restaurantLocations">,
  scheduledTime?: number
): Promise<Doc<"restaurantLocations">> {
  const location = await ctx.db.get(restaurantLocationId)
  if (!location) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Ubicación del restaurante no encontrada",
    })
  }

  // Convert UTC timestamp to Colombian timezone for validation
  const checkTime = scheduledTime
    ? new Date(
        new Date(scheduledTime).toLocaleString("en-US", {
          timeZone: "America/Bogota",
        })
      )
    : undefined

  const availability = isRestaurantOpen(location, checkTime)
  if (!availability.isOpen) {
    const timeContext = scheduledTime
      ? "en el horario programado"
      : "actualmente"
    throw new ConvexError({
      code: "UNAVAILABLE",
      message: `El restaurante no está abierto ${timeContext}. ${availability.message}`,
    })
  }

  return location
}

/**
 * Validate scheduled time constraints
 */
export async function validateScheduledTime(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  scheduledTime: number
): Promise<void> {
  // Get restaurant configuration for this organization
  const restaurantConfig = await ctx.db
    .query("restaurantConfiguration")
    .withIndex("by_organization_id", (q) =>
      q.eq("organizationId", organizationId)
    )
    .first()

  // Use default values if no configuration exists
  const minAdvanceMinutes =
    restaurantConfig?.minAdvanceMinutes ??
    DEFAULT_RESTAURANT_CONFIG.minAdvanceMinutes
  const maxAdvanceDays =
    restaurantConfig?.maxAdvanceDays ?? DEFAULT_RESTAURANT_CONFIG.maxAdvanceDays

  // Validate scheduled time is in the future
  const now = Date.now()
  const minAdvanceTime = minAdvanceMinutes * 60 * 1000 // Convert minutes to milliseconds
  const maxAdvanceTime = maxAdvanceDays * 24 * 60 * 60 * 1000 // Convert days to milliseconds

  if (scheduledTime <= now + minAdvanceTime) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: `El pedido debe programarse con al menos ${minAdvanceMinutes} minutos de anticipación`,
    })
  }

  if (scheduledTime > now + maxAdvanceTime) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: `El pedido no puede programarse con más de ${maxAdvanceDays} días de anticipación`,
    })
  }
}

/**
 * Validate that menu products exist and belong to the organization
 */
export async function validateOrderItems(
  ctx: QueryCtx | MutationCtx,
  items: OrderItemInput[],
  organizationId: string
): Promise<OrderItemWithPricing[]> {
  return await Promise.all(
    items.map(async (item) => {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: "La cantidad de cada item debe ser un entero mayor a 0",
        })
      }

      if (
        item.itemType === "combo" &&
        item.comboSlotSelections &&
        item.comboBasePrice !== undefined
      ) {
        for (const selection of item.comboSlotSelections) {
          if (
            selection.quantity !== undefined &&
            (!Number.isInteger(selection.quantity) || selection.quantity <= 0)
          ) {
            throw new ConvexError({
              code: "BAD_REQUEST",
              message:
                "La cantidad de cada selección de combo debe ser un entero mayor a 0",
            })
          }
        }

        const totalUpcharges = item.comboSlotSelections.reduce(
          (sum, sel) => sum + sel.upcharge * (sel.quantity ?? 1),
          0
        )
        const unitPrice = item.comboBasePrice + totalUpcharges
        return {
          ...item,
          unitPrice,
          totalPrice: unitPrice * item.quantity,
          products: [],
        }
      }

      const products = await Promise.all(
        item.menuProducts.map(async (productId) => {
          const product = await ctx.db.get(productId)
          if (!product) {
            throw new ConvexError({
              code: "NOT_FOUND",
              message: `Producto con ID ${productId} no encontrado`,
            })
          }
          if (product.organizationId !== organizationId) {
            throw new ConvexError({
              code: "UNAUTHORIZED",
              message: `Producto ${productId} no pertenece a la organización`,
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
}

/**
 * Calculate order totals
 */
export function calculateOrderTotals(
  itemsWithPrices: OrderItemWithPricing[],
  orderType: "delivery" | "pickup",
  deliveryFee?: number
) {
  // Calculate subtotal from all order items
  const subtotal = itemsWithPrices.reduce(
    (sum, item) => sum + item.totalPrice,
    0
  )

  // Calculate delivery fee based on order type
  const finalDeliveryFee = orderType === "pickup" ? 0 : deliveryFee || 0

  // Total includes subtotal plus delivery fee (menu products already include tax)
  const total = subtotal + finalDeliveryFee

  return {
    subtotal: Math.round(subtotal),
    deliveryFee: finalDeliveryFee,
    total: Math.round(total),
  }
}

/**
 * Generate unique order number based on location and sequential counter
 * Format: {locationCode}{6-digit-number} e.g., "BAR000010"
 */

export async function generateOrderNumber(
  ctx: MutationCtx,
  locationCode: string,
  organizationId: string,
  restaurantLocationId: Id<"restaurantLocations">
): Promise<string> {
  const number = await aggregateOrdersByOrganization.count(ctx, {
    namespace: organizationId,
    bounds: { prefix: [restaurantLocationId] },
  })
  const paddedNumber = String(number).padStart(6, "0")
  return `${locationCode}-${paddedNumber}`
}

export async function ensureCanBeModified(
  order: Doc<"orders">,
  organizationId: string
) {
  if (order.organizationId !== organizationId) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "No autorizado para modificar este pedido",
    })
  }
  if (order.status !== "programado" && order.status !== "pendiente") {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Solo se pueden modificar pedidos programados o pendientes",
    })
  }
  return order
}

export async function getOrder(ctx: QueryCtx, orderId: Id<"orders">) {
  const order = await ctx.db.get(orderId)
  if (!order)
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Pedido no encontrado",
    })
  return order
}

export async function createOrder(
  ctx: MutationCtx,
  args: {
    conversation: Doc<"conversations">
    contactId: Id<"contacts">
    restaurantLocationId: Id<"restaurantLocations">
    items: OrderItemInput[]
    orderType: "delivery" | "pickup"
    deliveryAddress?: string
    paymentMethod:
      | "cash"
      | "card"
      | "payment_link"
      | "bank_transfer"
      | "corporate_credit"
      | "gift_voucher"
      | "sodexo_voucher"
      | "dynamic_payment_link"
    paymentMethods?: Array<{
      method:
        | "cash"
        | "card"
        | "payment_link"
        | "bank_transfer"
        | "corporate_credit"
        | "gift_voucher"
        | "sodexo_voucher"
        | "dynamic_payment_link"
      amount?: number
      referenceCode?: string
      notes?: string
    }>
    scheduledTime?: number
    coordinates?: {
      lat: number
      lng: number
    }
    deliveryFee?: number
    recipientName?: string
    recipientPhone?: string
  }
) {
  // Validate that the conversation doesn't already have an order
  if (args.conversation.orderId) {
    throw new ConvexError({
      code: "CONVERSATION_HAS_ORDER",
      message:
        "Esta conversación ya tiene un pedido asociado. Cada conversación solo puede tener un pedido.",
    })
  }

  // Get contact information
  const contact = await ctx.db.get(args.contactId)

  if (!contact) {
    throw new ContactNotFoundError()
  }
  if (!contact.displayName) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message:
        "El cliente no tiene nombre registrado. Pídele al cliente que proporcione su nombre.",
    })
  }
  const organizationId = contact.organizationId

  // Get restaurant configuration for business rules and payment settings
  const restaurantConfig = await ctx.db
    .query("restaurantConfiguration")
    .withIndex("by_organization_id", (q) =>
      q.eq("organizationId", organizationId)
    )
    .unique()

  // Check payment method requirements
  if (
    args.paymentMethod === "payment_link" &&
    !restaurantConfig?.paymentLinkUrl
  ) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "No hay enlace de pago configurado para pagos por link",
    })
  }

  if (
    args.paymentMethod === "bank_transfer" &&
    (!restaurantConfig?.bankAccounts ||
      restaurantConfig.bankAccounts.length === 0)
  ) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "No hay cuentas bancarias configuradas para transferencias",
    })
  }
  const restaurantLocation = await ctx.db.get(args.restaurantLocationId)
  if (!restaurantLocation) {
    throw new RestaurantLocationNotFoundError()
  }
  // Validate restaurant availability
  // For scheduled orders, check availability at the scheduled time, not current time
  await validateRestaurantAvailability(
    ctx,
    args.restaurantLocationId,
    args.scheduledTime
  )

  const processedItems = args.items.map((item) => ({
    menuProducts: item.menuProducts.map(
      (productId) => productId as Id<"menuProducts">
    ),
    quantity: item.quantity,
    notes: item.notes,
    itemType: item.itemType,
    comboId: item.comboId,
    comboBasePrice: item.comboBasePrice,
    comboSlotSelections: item.comboSlotSelections,
  }))

  if (processedItems.length === 0) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "El pedido debe tener al menos un producto.",
    })
  }

  // Validate and calculate pricing for order items
  const itemsWithPrices = await validateOrderItems(
    ctx,
    processedItems,
    organizationId
  )

  // Use provided delivery fee or 0 for pickup orders
  const deliveryFee = args.orderType === "pickup" ? 0 : args.deliveryFee || 0

  // Calculate totals
  const totals = calculateOrderTotals(
    itemsWithPrices,
    args.orderType,
    deliveryFee
  )

  // Generate order number using location code and sequential counter
  const orderNumber = await generateOrderNumber(
    ctx,
    restaurantLocation.code,
    organizationId,
    args.restaurantLocationId
  )

  // Create the order record
  // Use provided recipient info or fall back to contact info
  const orderInput: CreateOrderInput = {
    customerName: args.recipientName || contact.displayName,
    customerPhone: args.recipientPhone || contact.phoneNumber,
    organizationId: organizationId,
    conversationId: args.conversation._id,
    contactId: args.contactId,
    restaurantLocationId: args.restaurantLocationId,
    items: processedItems,
    orderType: args.orderType,
    deliveryAddress: args.deliveryAddress,
    paymentMethod: args.paymentMethod,
    scheduledTime: args.scheduledTime,
    coordinates: args.coordinates,
  }

  const orderId = await createOrderRecord(
    ctx,
    orderInput,
    orderNumber,
    itemsWithPrices,
    totals,
    args.paymentMethods
  )
  const order = await ctx.db.get(orderId)
  if (!order) {
    throw new OrderNotFoundError()
  }

  // Create order items for each item in the order
  await Promise.all(
    itemsWithPrices.map(async (item) => {
      if (
        item.itemType === "combo" &&
        item.comboSlotSelections &&
        item.comboId &&
        item.comboBasePrice !== undefined
      ) {
        return await createComboOrderItem(ctx, {
          orderId,
          organizationId,
          quantity: item.quantity,
          comboId: item.comboId as Id<"combos">,
          comboBasePrice: item.comboBasePrice,
          comboName: item.comboName,
          comboSlotSelections: item.comboSlotSelections,
          notes: item.notes,
        })
      }
      return await createOrderItem(ctx, {
        orderId,
        menuProducts: item.menuProducts,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        notes: item.notes,
        organizationId,
      })
    })
  )

  // Update contact's last known address (only for delivery orders)
  if (args.orderType === "delivery" && args.deliveryAddress) {
    await ctx.db.patch(args.contactId, {
      lastKnownAddress: args.deliveryAddress,
    })
  }
  return {
    order,
    restaurantConfig,
    contact,
    restaurantLocation,
  }
}

/**
 * Create order record in database
 */
export async function createOrderRecord(
  ctx: MutationCtx,
  input: CreateOrderInput,
  orderNumber: string,
  _itemsWithPrices: OrderItemWithPricing[],
  totals: { subtotal: number; deliveryFee?: number; total: number },
  paymentMethods?: Array<{
    method:
      | "cash"
      | "card"
      | "payment_link"
      | "bank_transfer"
      | "corporate_credit"
      | "gift_voucher"
      | "sodexo_voucher"
      | "dynamic_payment_link"
    amount?: number
    referenceCode?: string
    notes?: string
  }>
): Promise<Id<"orders">> {
  // Create order first (without items, we'll add them after)
  const orderId = await ctx.db.insert("orders", {
    orderNumber,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    contactId: input.contactId,
    ...totals,
    status: input.scheduledTime ? "programado" : "pendiente",
    orderType: input.orderType,
    deliveryAddress: input.deliveryAddress,
    paymentMethod: input.paymentMethod,
    paymentMethods: paymentMethods,
    scheduledTime: input.scheduledTime,
    printedAt: undefined,
    paidAt: undefined,
    restaurantLocationId: input.restaurantLocationId,
    coordinates: input.coordinates,
  })

  // Get the created order to insert into aggregate
  const order = await ctx.db.get(orderId)
  if (!order) {
    throw new OrderNotFoundError()
  }
  // Update the aggregate for efficient counting
  await aggregateOrdersByOrganization.insertIfDoesNotExist(ctx, order!)

  // Update conversation to link the order
  await ctx.db.patch(input.conversationId, {
    orderId,
  })

  return orderId
}

/**
 * Create order item record
 */
export async function createOrderItem(
  ctx: MutationCtx,
  args: {
    orderId: Id<"orders">
    menuProducts: Id<"menuProducts">[]
    quantity: number
    unitPrice: number
    notes?: string
    organizationId: string
  }
): Promise<Id<"orderItems">> {
  // Validate that all menuProducts exist and belong to the organization
  for (const productId of args.menuProducts) {
    const product = await ctx.db.get(productId)
    if (!product) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `Producto con ID ${productId} no encontrado`,
      })
    }
    if (product.organizationId !== args.organizationId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: `Producto ${productId} no pertenece a la organización`,
      })
    }
  }

  const totalPrice = args.unitPrice * args.quantity

  // Create the order item first
  const orderItemId = await ctx.db.insert("orderItems", {
    orderId: args.orderId,
    quantity: args.quantity,
    unitPrice: args.unitPrice,
    totalPrice,
    notes: args.notes,
    organizationId: args.organizationId,
  })

  // Create menu product order items for each product in the combination
  for (const productId of args.menuProducts) {
    const product = await ctx.db.get(productId)
    if (product) {
      // Get category and size names for temporal snapshot
      const category = await ctx.db.get(product.menuProductCategoryId)
      const size = product.sizeId ? await ctx.db.get(product.sizeId) : null

      await ctx.db.insert("menuProductOrderItems", {
        menuProductId: productId,
        orderItemId,
        quantity: args.quantity,
        unitPrice: product.price,
        totalPrice: product.price * args.quantity,
        // Temporal snapshot fields - immutable product data at time of order
        productName: product.name,
        productDescription: product.description,
        productCategoryName: category?.name || "Sin categoría",
        productSizeName: size?.name,
        organizationId: args.organizationId,
      })
    }
  }

  return orderItemId
}

/**
 * Update order status with validation
 */
export async function updateOrderStatus(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  status:
    | "programado"
    | "pendiente"
    | "preparando"
    | "listo_para_recoger"
    | "en_camino"
    | "entregado"
    | "cancelado",
  organizationId: string
): Promise<void> {
  const order = await ctx.db.get(orderId)
  if (!order) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Pedido no encontrado",
    })
  }
  if (order.organizationId !== organizationId) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "No autorizado para modificar este pedido",
    })
  }
  await ctx.db.patch(orderId, { status })
}

/**
 * Get order items with product details
 */
export async function getOrderWithItemsAndProducts(
  ctx: QueryCtx,
  orderId: Id<"orders">
): Promise<OrderItemWithProducts[]> {
  const orderItems = await ctx.db
    .query("orderItems")
    .withIndex("by_order_id", (q) => q.eq("orderId", orderId))
    .collect()

  // Get product details for each order item
  const orderItemsWithProducts = await Promise.all(
    orderItems.map(async (orderItem) => {
      // Get menu product order items for this order item
      const menuProductOrderItems = await ctx.db
        .query("menuProductOrderItems")
        .withIndex("by_order_item_id", (q) =>
          q.eq("orderItemId", orderItem._id)
        )
        .collect()

      const products = menuProductOrderItems.map((menuProductOrderItem) => ({
        _id: menuProductOrderItem.menuProductId,
        name: menuProductOrderItem.productName,
        description: menuProductOrderItem.productDescription,
        price: menuProductOrderItem.unitPrice, // Use the price at time of order
        categoryName: menuProductOrderItem.productCategoryName,
        sizeName: menuProductOrderItem.productSizeName,
        comboSlotName: menuProductOrderItem.comboSlotName,
        upcharge: menuProductOrderItem.upcharge,
      }))

      return {
        ...orderItem,
        products,
      }
    })
  )

  return orderItemsWithProducts
}

/**
 * Cancel a scheduled order and its activation job
 * Uses orderScheduledFunctions tracking table for efficient cancellation
 */
export async function cancelOrderAndScheduledJob(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  organizationId: string,
  cancelReason?: string
): Promise<void> {
  const order = await ctx.db.get(orderId)
  if (!order)
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Pedido no encontrado",
    })
  if (order.organizationId !== organizationId)
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "No autorizado para cancelar este pedido",
    })
  if (order.status !== "programado")
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Solo se pueden cancelar pedidos programados",
    })

  // Update order status and store cancellation reason
  const updateData: Record<string, unknown> = { status: "cancelado" }
  if (cancelReason) {
    updateData.cancelReason = cancelReason
  }
  await ctx.db.patch(orderId, updateData)

  // Use tracking table for efficient cancellation (instead of full table scan)
  const trackedFunctions = await ctx.db
    .query("orderScheduledFunctions")
    .withIndex("by_order_id", (q) => q.eq("orderId", orderId))
    .collect()

  for (const tracked of trackedFunctions) {
    try {
      await ctx.scheduler.cancel(tracked.scheduledFunctionId)
    } catch (error) {
      console.error(
        `⏰ [SCHEDULED ORDER] Error cancelling scheduled function ${tracked.scheduledFunctionId}:`,
        error
      )
    }
    // Clean up the tracking record
    await ctx.db.delete(tracked._id)
  }

  console.log(
    `⏰ [SCHEDULED ORDER] Cancelled ${trackedFunctions.length} scheduled activation jobs for order ${orderId}`
  )
}

/**
 * Cancel scheduled activation jobs for an order
 * Uses orderScheduledFunctions tracking table for efficient cancellation
 * (Fixes performance issue where full table scan on _scheduled_functions caused app crashes)
 */
export async function cancelOrderScheduledJobs(
  ctx: MutationCtx,
  args: {
    orderId: Id<"orders">
    organizationId: string
  }
): Promise<void> {
  const order = await ctx.db.get(args.orderId)
  if (!order)
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Pedido no encontrado",
    })
  if (order.organizationId !== args.organizationId) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message:
        "No autorizado para cancelar trabajos programados de este pedido",
    })
  }

  // Use tracking table for efficient cancellation (instead of full table scan)
  const trackedFunctions = await ctx.db
    .query("orderScheduledFunctions")
    .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
    .collect()

  // Cancel each tracked scheduled function
  for (const tracked of trackedFunctions) {
    try {
      await ctx.scheduler.cancel(tracked.scheduledFunctionId)
    } catch (error) {
      console.error(
        `⏰ [SCHEDULED ORDER] Error cancelling scheduled function ${tracked.scheduledFunctionId}:`,
        error
      )
    }
    // Clean up the tracking record
    await ctx.db.delete(tracked._id)
  }

  console.log(
    `⏰ [SCHEDULED ORDER] Cancelled ${trackedFunctions.length} scheduled activation jobs for order ${args.orderId}`
  )
}

/**
 * Schedule order activation and track it in orderScheduledFunctions table
 * This enables efficient cancellation without full table scans
 */
export async function scheduleOrderActivation(
  ctx: MutationCtx,
  args: {
    orderId: Id<"orders">
    organizationId: string
    scheduledTime: number
  }
): Promise<Id<"_scheduled_functions">> {
  // Schedule the activation job
  const scheduledId = await ctx.scheduler.runAt(
    args.scheduledTime,
    internal.system.orders.activateScheduledOrder,
    {
      orderId: args.orderId,
      organizationId: args.organizationId,
    }
  )

  // Track the scheduled function for efficient cancellation
  await ctx.db.insert("orderScheduledFunctions", {
    name: "activateScheduledOrder",
    orderId: args.orderId,
    scheduledFunctionId: scheduledId,
    scheduledAt: args.scheduledTime,
    organizationId: args.organizationId,
  })

  console.log(
    `⏰ [SCHEDULED ORDER] Scheduled activation for order ${args.orderId} at ${new Date(args.scheduledTime).toISOString()}`
  )

  return scheduledId
}

/**
 * Activate a scheduled order (for mutation context)
 * Also cleans up the tracking record in orderScheduledFunctions
 */
export async function activateScheduledOrder(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  organizationId: string
): Promise<void> {
  console.log(`⏰ [PROGRAMADO] Activando pedido programado: ${orderId}`)

  const order = await ctx.db.get(orderId)

  if (!order) {
    console.error(`⏰ [PROGRAMADO] Pedido no encontrado: ${orderId}`)
    // Clean up tracking record even if order not found
    await cleanupOrderScheduledFunctionTracking(ctx, orderId)
    return
  }

  // Only activate if still in scheduled status
  if (order.status !== "programado") {
    console.log(`⏰ [PROGRAMADO] Pedido ya no está programado: ${order.status}`)
    // Clean up tracking record since order is no longer scheduled
    await cleanupOrderScheduledFunctionTracking(ctx, orderId)
    return
  }

  await updateOrderStatus(ctx, orderId, "pendiente", organizationId)
  // Clean up tracking record after successful activation
  await cleanupOrderScheduledFunctionTracking(ctx, orderId)
  console.log(`⏰ [PROGRAMADO] Pedido activado exitosamente: ${orderId}`)
}

/**
 * Clean up tracking records for a scheduled order
 * Called after activation or when order is no longer valid
 */
async function cleanupOrderScheduledFunctionTracking(
  ctx: MutationCtx,
  orderId: Id<"orders">
): Promise<void> {
  const trackedFunctions = await ctx.db
    .query("orderScheduledFunctions")
    .withIndex("by_order_id", (q) => q.eq("orderId", orderId))
    .collect()

  for (const tracked of trackedFunctions) {
    await ctx.db.delete(tracked._id)
  }

  if (trackedFunctions.length > 0) {
    console.log(
      `⏰ [SCHEDULED ORDER] Cleaned up ${trackedFunctions.length} tracking records for order ${orderId}`
    )
  }
}

/**
 * Activate a scheduled order (for action context)
 * Cleans up tracking record via internal mutation after activation
 */
export async function activateScheduledOrderAction(
  ctx: ActionCtx,
  orderId: Id<"orders">,
  organizationId: string
): Promise<void> {
  console.log(`⏰ [PROGRAMADO] Activando pedido programado: ${orderId}`)

  const order = await ctx.runQuery(internal.system.orders.getOne, { orderId })

  if (!order) {
    console.error(`⏰ [PROGRAMADO] Pedido no encontrado: ${orderId}`)
    // Clean up tracking record even if order not found
    await ctx.runMutation(
      internal.system.orders.cleanupOrderScheduledFunctionTracking,
      { orderId }
    )
    return
  }

  // Only activate if still in scheduled status
  if (order.status !== "programado") {
    console.log(`⏰ [PROGRAMADO] Pedido ya no está programado: ${order.status}`)
    // Clean up tracking record since order is no longer scheduled
    await ctx.runMutation(
      internal.system.orders.cleanupOrderScheduledFunctionTracking,
      { orderId }
    )
    return
  }

  await ctx.runMutation(internal.system.orders.updateStatus, {
    orderId,
    status: "pendiente",
    organizationId,
  })
  // Clean up tracking record after successful activation
  await ctx.runMutation(
    internal.system.orders.cleanupOrderScheduledFunctionTracking,
    { orderId }
  )
  console.log(`⏰ [PROGRAMADO] Pedido activado exitosamente: ${orderId}`)
}

/**
 * Update order with new items and recalculate pricing
 */
export async function updateOrderItems(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  organizationId: string,
  newItems: OrderItemInput[]
): Promise<{
  orderItemIds: Id<"orderItems">[]
  subtotal: number
  total: number
}> {
  // Delete existing orderItems
  const existingOrderItems = await ctx.db
    .query("orderItems")
    .withIndex("by_order_id", (q) => q.eq("orderId", orderId))
    .collect()

  for (const orderItem of existingOrderItems) {
    await ctx.db.delete(orderItem._id)
  }

  // Calculate unit price for each new combination and validate products
  const itemsWithPrices = await validateOrderItems(
    ctx,
    newItems,
    organizationId
  )

  // Create new orderItems (dispatch combo vs regular, matching createOrder pattern)
  const orderItemIds = await Promise.all(
    itemsWithPrices.map(async (item) => {
      if (
        item.itemType === "combo" &&
        item.comboSlotSelections &&
        item.comboId &&
        item.comboBasePrice !== undefined
      ) {
        return await createComboOrderItem(ctx, {
          orderId,
          organizationId,
          quantity: item.quantity,
          comboId: item.comboId as Id<"combos">,
          comboBasePrice: item.comboBasePrice,
          comboSlotSelections: item.comboSlotSelections,
          comboName: item.comboName,
          notes: item.notes,
        })
      }
      return await createOrderItem(ctx, {
        orderId,
        menuProducts: item.menuProducts,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        notes: item.notes,
        organizationId,
      })
    })
  )

  // Delete existing menu product order items
  for (const orderItem of existingOrderItems) {
    const menuProductOrderItems = await ctx.db
      .query("menuProductOrderItems")
      .withIndex("by_order_item_id", (q) => q.eq("orderItemId", orderItem._id))
      .collect()

    for (const menuProductOrderItem of menuProductOrderItems) {
      await ctx.db.delete(menuProductOrderItem._id)
    }
  }

  // Calculate new totals
  const order = await ctx.db.get(orderId)
  if (!order) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Pedido no encontrado",
    })
  }

  // Use existing delivery fee from order record
  // Only items are being updated, not delivery details, so preserve original pricing
  const deliveryFee = order.deliveryFee || 0

  const totals = calculateOrderTotals(
    itemsWithPrices,
    order.orderType,
    deliveryFee
  )

  return {
    orderItemIds,
    subtotal: totals.subtotal,
    total: totals.total,
  }
}

/**
 * Validate that an order can still be modified within the time window
 */
export async function validateModificationTimeWindow(
  ctx: MutationCtx | QueryCtx,
  orderId: Id<"orders">,
  organizationId: string
): Promise<void> {
  const order = await ctx.db.get(orderId)
  if (!order) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Pedido no encontrado",
    })
  }

  if (order.organizationId !== organizationId) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "No autorizado para modificar este pedido",
    })
  }

  // Only allow modification of pending orders
  if (order.status !== "pendiente") {
    throw new ConvexError({
      code: "INVALID_ORDER_STATUS",
      message: `Solo se pueden modificar pedidos en estado 'pendiente'. Estado actual: ${order.status}`,
    })
  }

  // Get restaurant configuration for time buffer
  const config = await ctx.db
    .query("restaurantConfiguration")
    .withIndex("by_organization_id", (q) =>
      q.eq("organizationId", organizationId)
    )
    .first()

  const bufferMinutes = config?.orderModificationBufferMinutes || 0

  const now = Date.now()
  const creationTime = order._creationTime
  const timeWindow = bufferMinutes * 60 * 1000 // Convert minutes to milliseconds

  if (now - creationTime > timeWindow) {
    throw new ConvexError({
      code: "MODIFICATION_TIME_EXPIRED",
      message: `El tiempo permitido para modificar el pedido ha expirado. Tiempo límite: ${bufferMinutes} minutos después de la creación.`,
    })
  }
}
