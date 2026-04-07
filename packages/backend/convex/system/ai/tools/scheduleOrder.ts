import { ConvexError } from "convex/values"
import z from "zod"
import { internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import { parseColombianTime } from "../constants"
import { createTaggedTool } from "./toolWrapper"

export const scheduleOrder = createTaggedTool({
  description:
    "Programa un pedido para una fecha y hora futuras usando la confirmación pendiente del hilo actual. Retorna número de orden programada, fecha de activación y validaciones de disponibilidad aplicadas.",
  args: z.object({
    scheduledTime: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
      .describe(
        "Fecha y hora en formato ISO (ej: '2025-09-05T14:30' o '2025-09-05T14:30:00') - se interpreta automáticamente como hora colombiana (America/Bogota)"
      ),
  }),
  handler: async (ctx, args): Promise<string> => {
    if (!ctx.threadId) {
      return "Falta el ID del hilo de la conversación"
    }

    // =========================================================================
    // Retrieve pending order confirmation
    // =========================================================================
    const pendingConfirmation = await ctx.runQuery(
      internal.system.orders.getPendingOrderConfirmation,
      { threadId: ctx.threadId }
    )

    if (!pendingConfirmation) {
      return "Error: No se encontró una confirmación de pedido pendiente. Debes usar confirmOrderTool primero para mostrar el resumen al cliente y obtener su confirmación antes de programar el pedido."
    }

    // Check if the confirmation is too old (more than 30 minutes)
    const confirmationAge = Date.now() - pendingConfirmation.confirmedAt
    const maxAge = 30 * 60 * 1000 // 30 minutes
    if (confirmationAge > maxAge) {
      return "Error: La confirmación del pedido ha expirado (más de 30 minutos). Por favor, vuelve a mostrar el resumen con confirmOrderTool para que el cliente lo confirme nuevamente."
    }

    console.log(
      `✅ [SCHEDULE ORDER] Using confirmed order data from ${new Date(pendingConfirmation.confirmedAt).toISOString()}`
    )

    try {
      // Parse the Colombian time from ISO string
      const scheduledTimestamp = parseColombianTime(args.scheduledTime)

      // For backward compatibility, use the first payment method as the primary one
      const primaryPaymentMethod =
        pendingConfirmation.paymentMethods[0]?.method || "cash"

      // Use the unified createFromAiTool function with scheduledTime
      const result = await ctx.runMutation(
        internal.system.orders.createFromAiTool,
        {
          threadId: ctx.threadId,
          items: pendingConfirmation.items,
          orderType: pendingConfirmation.orderType as "delivery" | "pickup",
          deliveryAddress: pendingConfirmation.deliveryAddress,
          paymentMethod: primaryPaymentMethod,
          restaurantLocationId:
            pendingConfirmation.restaurantLocationId as Id<"restaurantLocations">,
          deliveryFee: pendingConfirmation.deliveryFee,
          scheduledTime: scheduledTimestamp,
          recipientName: pendingConfirmation.recipientName,
          recipientPhone: pendingConfirmation.recipientPhone,
          invoiceData: pendingConfirmation.invoiceData,
          paymentMethods: pendingConfirmation.paymentMethods,
        }
      )

      const { order, restaurantConfig, restaurantLocation } = result

      const paymentMethodLabels: Record<string, string> = {
        cash: "Efectivo",
        card: "Datafono/Tarjeta",
        payment_link: "Pago por link de pago",
        dynamic_payment_link: "Link de pago dinámico",
        bank_transfer: "Transferencia a cuenta bancaria",
        corporate_credit: "Crédito/Convenio Empresarial",
        gift_voucher: "Bono de Regalo",
        sodexo_voucher: "Bono Sodexo",
      }

      const orderTypeLabels: Record<string, string> = {
        delivery: "entrega a domicilio",
        pickup: "recogida en restaurante",
      }

      const scheduledDate = new Date(scheduledTimestamp).toLocaleString(
        "es-CO",
        {
          timeZone: "America/Bogota",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      )

      let response = `✅ Pedido programado exitosamente con número: ${order.orderNumber}. El pedido se activará automáticamente el ${scheduledDate}. Tipo: ${orderTypeLabels[pendingConfirmation.orderType] || pendingConfirmation.orderType}.`

      // Show payment methods
      response += "\n\n💰 Método(s) de pago:\n"
      if (
        pendingConfirmation.paymentMethods.length === 1 &&
        !pendingConfirmation.paymentMethods[0]?.amount
      ) {
        const payment = pendingConfirmation.paymentMethods[0]
        if (payment) {
          response += `• ${paymentMethodLabels[payment.method]}`
          if (payment.referenceCode) {
            response += ` (Código: ${payment.referenceCode})`
          }
        }
      } else {
        pendingConfirmation.paymentMethods.forEach((payment) => {
          response += `• ${paymentMethodLabels[payment.method]}`
          if (payment.amount) {
            response += `: $${Math.round(payment.amount).toLocaleString("es-CO")}`
          }
          if (payment.referenceCode) {
            response += ` (Código: ${payment.referenceCode})`
          }
          response += "\n"
        })
      }

      // Add location info for pickup orders
      if (
        pendingConfirmation.orderType === "pickup" &&
        restaurantLocation?.name
      ) {
        response += `\n📍 Sucursal: ${restaurantLocation.name}`
      }

      // Check if payment_link is in any of the payment methods
      const hasPaymentLink = pendingConfirmation.paymentMethods.some(
        (p) => p.method === "payment_link"
      )
      if (hasPaymentLink && restaurantConfig?.paymentLinkUrl) {
        response += `\n\n💳 Para realizar el pago por link, utiliza este enlace: ${restaurantConfig.paymentLinkUrl}`
      }

      // Check if bank_transfer is in any of the payment methods
      const hasBankTransfer = pendingConfirmation.paymentMethods.some(
        (p) => p.method === "bank_transfer"
      )
      if (
        hasBankTransfer &&
        restaurantConfig?.bankAccounts &&
        restaurantConfig.bankAccounts.length > 0
      ) {
        response += `\n\n🏦 Para realizar la transferencia bancaria:\n`
        restaurantConfig.bankAccounts.forEach((account, index) => {
          response += `${index + 1}. ${account}\n`
        })
      }

      response +=
        " La conversación permanecerá activa hasta que se procese el pedido."

      // Check if any special payment method requires escalation
      const requiresEscalation = pendingConfirmation.paymentMethods.some(
        (p) =>
          p.method === "sodexo_voucher" ||
          p.method === "corporate_credit" ||
          p.method === "gift_voucher" ||
          p.method === "bank_transfer" ||
          p.method === "payment_link"
      )

      const requiresPhoto = pendingConfirmation.paymentMethods.some(
        (p) => p.method === "sodexo_voucher" || p.method === "gift_voucher"
      )

      // Check if dynamic_payment_link requires automatic escalation
      const hasDynamicPaymentLink = pendingConfirmation.paymentMethods.some(
        (p) => p.method === "dynamic_payment_link"
      )

      if (requiresEscalation) {
        response += `\n\n👀 Por favor, envíanos ${requiresPhoto && "fotos legibles del bono con los datos de éste y"} el comprobante de tu pago (si aplica) con todos los datos visibles para poder procesar tu pedido.`
      }

      // Automatically escalate conversation for dynamic_payment_link
      if (hasDynamicPaymentLink) {
        await ctx.runMutation(internal.system.conversations.escalate, {
          threadId: ctx.threadId,
          reason:
            "Pedido programado con dynamic_payment_link requiere generación manual de link de pago",
        })
        response +=
          "\n\n🔄 En un momento generaremos el link de pago en base a tu pedido. ¡Gracias por tu paciencia!"
      }

      // NOTE: Keeping pendingOrderConfirmation for audit trail purposes
      // In the future, this will be moved to a dedicated audit table
      // await ctx.runMutation(
      //   internal.system.orders.clearPendingOrderConfirmation,
      //   { threadId: ctx.threadId }
      // )

      return response
    } catch (error) {
      if (error instanceof ConvexError) {
        const { code, message } = (error.data ?? {}) as {
          code?: string
          message?: string
        }
        return `Error al programar el pedido: ${message || error.message || "Error desconocido"}`
      }
      return `Error al programar el pedido: ${error instanceof Error ? error.message : "Error desconocido"}`
    }
  },
})
