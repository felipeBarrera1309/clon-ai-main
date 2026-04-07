import { ConvexError } from "convex/values"
import type { Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import type { OrderItemWithProducts } from "./orders"

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

export async function updateOrderItem(
  ctx: MutationCtx,
  orderItemId: Id<"orderItems">,
  newItem: {
    menuProducts?: Id<"menuProducts">[]
    quantity?: number
    unitPrice?: number
    totalPrice?: number
    notes?: string
    organizationId: string
  }
) {
  // Update the order item (excluding menuProducts which is handled separately)
  const updateData: Partial<{
    quantity: number
    unitPrice: number
    totalPrice: number
    notes: string
  }> = {}
  if (newItem.quantity !== undefined) updateData.quantity = newItem.quantity
  if (newItem.unitPrice !== undefined) updateData.unitPrice = newItem.unitPrice
  if (newItem.totalPrice !== undefined)
    updateData.totalPrice = newItem.totalPrice
  if (newItem.notes !== undefined) updateData.notes = newItem.notes

  if (Object.keys(updateData).length > 0) {
    await ctx.db.patch(orderItemId, updateData)
  }

  // Handle menuProducts update if provided
  if (newItem.menuProducts) {
    // Delete existing menu product order items
    const existingMenuProductOrderItems = await ctx.db
      .query("menuProductOrderItems")
      .withIndex("by_order_item_id", (q) => q.eq("orderItemId", orderItemId))
      .collect()

    for (const item of existingMenuProductOrderItems) {
      await ctx.db.delete(item._id)
    }

    // Create new menu product order items
    for (const productId of newItem.menuProducts) {
      const product = await ctx.db.get(productId)
      if (product) {
        // Get category and size names for temporal snapshot
        const category = await ctx.db.get(product.menuProductCategoryId)
        const size = product.sizeId ? await ctx.db.get(product.sizeId) : null

        await ctx.db.insert("menuProductOrderItems", {
          menuProductId: productId,
          orderItemId,
          quantity: newItem.quantity || 1,
          unitPrice: product.price,
          totalPrice: product.price * (newItem.quantity || 1),
          // Temporal snapshot fields - immutable product data at time of order
          productName: product.name,
          productDescription: product.description,
          productCategoryName: category?.name || "Sin categoría",
          productSizeName: size?.name,
          organizationId: newItem.organizationId,
        })
      }
    }
  }

  return orderItemId
}

export async function deleteOrderItem(
  ctx: MutationCtx,
  orderItemId: Id<"orderItems">
) {
  // Delete related menu product order items first
  const menuProductOrderItems = await ctx.db
    .query("menuProductOrderItems")
    .withIndex("by_order_item_id", (q) => q.eq("orderItemId", orderItemId))
    .collect()

  for (const item of menuProductOrderItems) {
    await ctx.db.delete(item._id)
  }

  // Delete the order item
  await ctx.db.delete(orderItemId)
}

function calculateComboUnitPrice(
  comboBasePrice: number,
  comboSlotSelections: Array<{ upcharge: number; quantity?: number }>
) {
  const totalUpcharges = comboSlotSelections.reduce(
    (sum, selection) => sum + selection.upcharge * (selection.quantity ?? 1),
    0
  )
  return comboBasePrice + totalUpcharges
}

/**
 * Create a combo order item record with slot selections
 */
export async function createComboOrderItem(
  ctx: MutationCtx,
  args: {
    orderId: Id<"orders">
    organizationId: string
    quantity: number
    comboId: Id<"combos">
    comboBasePrice: number
    comboName?: string
    comboSlotSelections: Array<{
      slotId?: Id<"comboSlots"> | string
      slotName: string
      menuProductId: Id<"menuProducts">
      productName: string
      upcharge: number
      quantity?: number
    }>
    notes?: string
  }
): Promise<Id<"orderItems">> {
  // Keep this pricing formula aligned with apps/web/lib/order-pricing.ts.
  const unitPrice = calculateComboUnitPrice(
    args.comboBasePrice,
    args.comboSlotSelections
  )
  const totalPrice = unitPrice * args.quantity

  // Create the order item with combo fields
  const orderItemId = await ctx.db.insert("orderItems", {
    orderId: args.orderId,
    quantity: args.quantity,
    unitPrice,
    totalPrice,
    notes: args.notes,
    organizationId: args.organizationId,
    itemType: "combo",
    comboId: args.comboId,
    comboBasePrice: args.comboBasePrice,
    comboName: args.comboName,
  })

  // Create menuProductOrderItems snapshot for each slot selection
  for (const selection of args.comboSlotSelections) {
    const product = await ctx.db.get(selection.menuProductId)
    const selectionQuantity = selection.quantity ?? 1

    // Get category and size names for temporal snapshot
    const category = product
      ? await ctx.db.get(product.menuProductCategoryId)
      : null
    const size =
      product && product.sizeId ? await ctx.db.get(product.sizeId) : null

    await ctx.db.insert("menuProductOrderItems", {
      menuProductId: selection.menuProductId,
      orderItemId,
      quantity: selectionQuantity,
      unitPrice: selection.upcharge,
      totalPrice: selection.upcharge * selectionQuantity,
      productName: selection.productName,
      productDescription: product?.description ?? "",
      productCategoryName: category?.name ?? "Sin categoría",
      productSizeName: size?.name,
      comboSlotId:
        typeof selection.slotId === "string" ? selection.slotId : undefined,
      comboSlotName: selection.slotName,
      upcharge: selection.upcharge,
      organizationId: args.organizationId,
    })
  }

  return orderItemId
}

/**
 * Get order items with product details
 */
export async function getOrderItemsWithProducts(
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
        quantity: menuProductOrderItem.quantity,
        price: menuProductOrderItem.unitPrice, // Use the price at time of order
        categoryName: menuProductOrderItem.productCategoryName,
        sizeName: menuProductOrderItem.productSizeName,
        comboSlotId: menuProductOrderItem.comboSlotId,
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
