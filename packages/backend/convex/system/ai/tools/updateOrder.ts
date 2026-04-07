import z from "zod"
import { internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import { createTaggedTool } from "./toolWrapper"

/**
 * Tool: updateOrderTool
 * Description: Allows modification of pending orders within time window
 * Time Window: Configurable via orderModificationBufferMinutes (default 15min)
 * Status Requirements: Only works with "pendiente" status
 * Validation: Uses existing menu and address validation tools
 */
export const updateOrder = createTaggedTool({
  description:
    "Modifica un pedido en estado pendiente dentro de la ventana de edición permitida por configuración. Soporta tanto ítems regulares como combos. Retorna el pedido actualizado y los cambios aplicados.",
  args: z.object({
    orderId: z
      .string()
      .describe(
        "ID interno de Convex del pedido (formato similar a 'jh7...'). NO usar el código visible del pedido (ej: BRA-000109). Obtén este ID de herramientas previas como makeOrderTool, confirmOrderTool o listados internos."
      ),
    items: z
      .array(
        z.object({
          menuProducts: z
            .array(z.string())
            .describe(
              "Array de IDs internos de Convex de productos del menú que forman este ítem de pedido. Deben provenir de askCombinationValidationTool o searchMenuProductsTool, no de nombres ni IDs inventados. Para combos, este array puede estar vacío."
            ),
          quantity: z
            .number()
            .int()
            .positive()
            .describe("Cantidad de este ítem de pedido"),
          notes: z
            .string()
            .trim()
            .max(200)
            .optional()
            .describe("Notas especiales para este ítem de pedido (opcional)"),
          itemType: z
            .enum(["regular", "combo"])
            .optional()
            .describe(
              "Tipo de ítem: 'regular' para productos normales, 'combo' para combos. Si no se especifica, se asume 'regular'."
            ),
          comboId: z
            .string()
            .optional()
            .describe("ID del combo (solo para ítems tipo combo)"),
          comboName: z
            .string()
            .optional()
            .describe("Nombre del combo para mostrar en el resumen"),
          comboBasePrice: z
            .number()
            .optional()
            .describe("Precio base del combo (solo para ítems tipo combo)"),
          comboSlotSelections: z
            .array(
              z.object({
                slotId: z.string().optional().describe("ID del slot del combo"),
                slotName: z.string().describe("Nombre del slot del combo"),
                menuProductId: z
                  .string()
                  .describe("ID del producto seleccionado para este slot"),
                productName: z
                  .string()
                  .describe("Nombre del producto seleccionado"),
                upcharge: z
                  .number()
                  .describe("Recargo adicional por esta selección"),
                quantity: z
                  .number()
                  .int()
                  .positive()
                  .optional()
                  .describe("Cantidad de esta opción dentro del slot"),
              })
            )
            .optional()
            .describe(
              "Selecciones de slots del combo con productos elegidos y recargos (solo para ítems tipo combo)"
            ),
        })
      )
      .min(1)
      .optional()
      .describe("Nueva lista de combinaciones de productos (opcional)"),
    orderType: z
      .enum(["delivery", "pickup"])
      .optional()
      .describe(
        "Nuevo tipo de pedido (delivery para entrega a domicilio, pickup para recoger en restaurante) según lo especificado en el Protocolo de Conversación. Usa SOLO los tipos que el protocolo indica como disponibles."
      ),
    deliveryAddress: z
      .string()
      .optional()
      .describe(
        "Nueva dirección de entrega (OBLIGATORIA solo para pedidos de delivery - debe estar previamente validada)"
      ),
    restaurantLocationId: z
      .string()
      .optional()
      .describe(
        "Nuevo ID de la localización del restaurante. Obtenido con la herramienta validateAddressTool."
      ),
    paymentMethod: z
      .enum(["cash", "card", "payment_link", "bank_transfer"])
      .optional()
      .describe(
        "Nuevo método de pago seleccionado por el cliente (efectivo (cash), datafono (card), pago por link de pago (payment_link), transferencia a cuenta bancaria (bank_transfer))"
      ),
    deliveryFee: z
      .number()
      .optional()
      .describe(
        "Nueva tarifa de domicilio (OBLIGATORIA si cambia la dirección de entrega - debe obtenerse de validateAddressTool)"
      ),
  }),
  handler: async (ctx, args): Promise<string> => {
    if (!ctx.threadId) {
      return "Falta el ID del hilo"
    }

    // Get conversation to get organization ID
    const conversation = await ctx.runQuery(
      internal.system.conversations.getByThreadId,
      { threadId: ctx.threadId }
    )

    if (!conversation) {
      return "Error: Conversación no encontrada"
    }

    const organizationId = conversation.organizationId

    try {
      // Convert string productIds to proper Id types if items are provided
      const processedItems = args.items?.map((item) => ({
        menuProducts: item.menuProducts.map(
          (productId) => productId as Id<"menuProducts">
        ),
        quantity: item.quantity,
        notes: item.notes,
        ...(item.itemType === "combo"
          ? {
              itemType: "combo" as const,
              comboId: item.comboId,
              comboName: item.comboName,
              comboBasePrice: item.comboBasePrice,
              comboSlotSelections: item.comboSlotSelections,
            }
          : {}),
      }))

      // Use the new updatePendingOrder mutation
      const result = await ctx.runMutation(
        internal.system.orders.updatePendingOrder,
        {
          orderId: args.orderId as Id<"orders">,
          organizationId: organizationId,
          items: processedItems,
          orderType: args.orderType,
          deliveryAddress: args.deliveryAddress,
          restaurantLocationId: args.restaurantLocationId
            ? (args.restaurantLocationId as Id<"restaurantLocations">)
            : undefined,
          paymentMethod: args.paymentMethod,
          deliveryFee: args.deliveryFee,
        }
      )

      return result.message
    } catch (error) {
      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes("MODIFICATION_TIME_EXPIRED")) {
          return `Error al modificar el pedido: ${error.message}. El pedido ya no puede ser modificado porque ha pasado el tiempo límite permitido.`
        }
        if (error.message.includes("INVALID_ORDER_STATUS")) {
          return `Error al modificar el pedido: ${error.message}. Solo se pueden modificar pedidos que están en estado 'pendiente'.`
        }
        return `Error al modificar el pedido: ${error.message}`
      }
      return `Error al modificar el pedido: Error desconocido`
    }
  },
})
