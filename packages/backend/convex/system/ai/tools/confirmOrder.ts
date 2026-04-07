import { ConvexError } from "convex/values"
import z from "zod"
import { internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import { validateInvoiceData } from "../../../lib/invoiceValidation"
import { createTaggedTool } from "./toolWrapper"

export const confirmOrder = createTaggedTool({
  description:
    "Genera el resumen final del pedido para validación del cliente antes de crear la orden. Retorna el detalle completo de ítems, totales, modalidad, datos de entrega/recogida y factura cuando aplique. IMPORTANTE: Solo incluye invoiceData si el Protocolo de Conversación indica que factura electrónica está disponible.",
  args: z.object({
    items: z
      .array(
        z.object({
          menuProducts: z
            .array(z.string())
            .describe(
              "Array de IDs internos de Convex de productos del menú que forman este ítem de pedido. Deben provenir de askCombinationValidationTool o searchMenuProductsTool, no de nombres ni IDs inventados. Para combos, este array puede estar vacío."
            ),
          quantity: z.number().describe("Cantidad de este ítem de pedido"),
          notes: z
            .string()
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
      .describe(
        "Lista de ítems del pedido (cada ítem representa una unidad lógica que el cliente ordena)"
      ),
    orderType: z
      .enum(["delivery", "pickup"])
      .describe(
        "Tipo de pedido (delivery para entrega a domicilio, pickup para recoger en restaurante) según lo especificado en el Protocolo de Conversación. Usa SOLO el seleccionado por el usuario basado en los tipos que el protocolo indica como disponibles."
      ),
    deliveryAddress: z
      .string()
      .optional()
      .describe(
        "Dirección de entrega (requerida solo para entrega a domicilio)"
      ),
    restaurantLocationId: z
      .string()
      .describe("ID del restaurante (requerido siempre)"),
    paymentMethods: z
      .array(
        z.object({
          method: z.enum([
            "cash",
            "card",
            "payment_link",
            "dynamic_payment_link",
            "bank_transfer",
            "corporate_credit",
            "gift_voucher",
            "sodexo_voucher",
          ]),
          amount: z.number().optional(),
          referenceCode: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .describe(
        "Array de métodos de pago seleccionados por el cliente (confirmados según los métodos disponibles en contexto por el usuario). Si usa un solo medio, el array tiene un elemento. Si combina medios, debe especificar el monto para cada uno (amount) que sume el total del pedido. Para bonos/vouchers, incluir código de referencia si el cliente lo proporciona."
      ),
    deliveryFee: z
      .number()
      .optional()
      .describe(
        "Tarifa de domicilio obtenida de validateAddressTool (solo para entrega a domicilio)"
      ),
    recipientName: z
      .string()
      .optional()
      .describe(
        "Nombre de la persona que recibirá el pedido. Si no se proporciona, se usa el nombre del contacto que hace el pedido"
      ),
    recipientPhone: z
      .string()
      .optional()
      .describe(
        "Teléfono de la persona que recibirá el pedido. Si no se proporciona, se usa el teléfono del contacto que hace el pedido"
      ),
    invoiceData: z
      .object({
        requiresInvoice: z.boolean(),
        invoiceType: z.enum(["natural", "juridica"]).optional(),
        email: z.string().optional(),
        fullName: z.string().optional(),
        cedula: z.string().optional(),
        nit: z.string().optional(),
      })
      .optional()
      .describe(
        "Datos de factura electrónica obtenidos de requestInvoiceDataTool. SOLO incluir si el Protocolo de Conversación indica que factura electrónica está disponible Y el cliente requiere factura."
      ),
    coordinates: z
      .object({
        lat: z.number(),
        lng: z.number(),
      })
      .optional()
      .describe(
        "Coordenadas de la dirección de entrega (si disponibles en INTERNAL_INFO de validateAddressTool)"
      ),
  }),
  handler: async (ctx, args): Promise<string> => {
    if (!ctx.threadId) {
      return "Error: No se pudo obtener el ID del hilo"
    }
    // Validate order type requirements
    if (args.orderType === "delivery" && !args.deliveryAddress) {
      return "Error: Para pedidos de entrega a domicilio es requerida una dirección de entrega."
    }

    // Validate delivery fee for delivery orders
    if (
      args.orderType === "delivery" &&
      (args.deliveryFee === undefined || args.deliveryFee === null)
    ) {
      return "Error: Para pedidos de entrega a domicilio es requerida una tarifa de domicilio. Primero usa validateAddressTool para validar la dirección y obtener el deliveryFee del INTERNAL_INFO."
    }

    // Validate invoice data if provided
    if (args.invoiceData) {
      const validation = validateInvoiceData(args.invoiceData)
      if (!validation.isValid) {
        return `Error de factura: ${validation.error}\n\nPor favor, solicita al cliente que proporcione la información correcta.`
      }
    }

    try {
      const { contact, restaurantLocation, conversation } = await ctx.runQuery(
        internal.system.orders.verifyOrderQuery,
        {
          deliveryAddress: args.deliveryAddress,
          threadId: ctx.threadId,
          restaurantLocationId: args.restaurantLocationId,
        }
      )

      const restaurantLocations = await ctx.runQuery(
        internal.system.restaurantLocations.getAllByOrganization,
        { organizationId: conversation.organizationId }
      )
      const hasMultipleLocations = restaurantLocations.length > 1

      // Calculate prices for each item by getting product prices
      let subtotal = 0
      const itemsWithPrices = []

      for (const item of args.items) {
        const isCombo =
          item.itemType === "combo" &&
          item.comboSlotSelections &&
          item.comboBasePrice !== undefined

        if (isCombo) {
          const totalUpcharges = item.comboSlotSelections!.reduce(
            (sum: number, sel) => sum + sel.upcharge * (sel.quantity ?? 1),
            0
          )
          const unitPrice = item.comboBasePrice! + totalUpcharges
          const slotNames = item.comboSlotSelections!.map(
            (sel) =>
              `${sel.slotName}: ${sel.productName}${(sel.quantity ?? 1) > 1 ? ` x${sel.quantity}` : ""}`
          )

          const itemWithPrice = {
            ...item,
            unitPrice,
            productNames: [item.comboName || "Combo", ...slotNames],
          }
          itemsWithPrices.push(itemWithPrice)
          subtotal += unitPrice * item.quantity
        } else {
          const productIds = item.menuProducts.map(
            (id) => id as Id<"menuProducts">
          )
          const products = await ctx.runQuery(
            internal.system.menuProducts
              .getManyByIdsWithSizeAndCategoryAndAvailability,
            {
              productIds,
              organizationId: conversation.organizationId,
              restaurantLocationId:
                args.restaurantLocationId as Id<"restaurantLocations">,
            }
          )

          if (products.length !== productIds.length) {
            throw new ConvexError({
              code: "PRODUCT_NOT_FOUND",
              message: `Algunos productos no fueron encontrados`,
            })
          }

          const unitPrice = products.reduce(
            (sum: number, product) => sum + product.price,
            0
          )
          const productNames = products.map((product) => product.name)

          const itemWithPrice = {
            ...item,
            unitPrice,
            productNames,
          }
          itemsWithPrices.push(itemWithPrice)
          subtotal += unitPrice * item.quantity
        }
      }

      // Get delivery fee - use provided fee or default to 0
      const deliveryFee = args.deliveryFee || 0

      const total = subtotal + deliveryFee

      // Determine recipient information (use provided or fall back to contact)
      const recipientName =
        args.recipientName || contact.displayName || "Cliente"
      const recipientPhone = args.recipientPhone || contact.phoneNumber || ""

      // Save the confirmed order data for validation in makeOrderTool
      // This prevents LLM caching/hallucination from causing data contamination
      const savedConfirmation = await ctx.runMutation(
        internal.system.orders.savePendingOrderConfirmation,
        {
          threadId: ctx.threadId,
          items: args.items.map((item) => ({
            menuProducts: item.menuProducts,
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
          })),
          orderType: args.orderType,
          deliveryAddress: args.deliveryAddress,
          paymentMethods: args.paymentMethods.map((pm) => ({
            ...pm,
            amount: pm.amount ?? Math.round(total), // Default to total if no amount specified
          })),
          restaurantLocationId: args.restaurantLocationId,
          deliveryFee: args.deliveryFee,
          recipientName,
          recipientPhone,
          invoiceData: args.invoiceData || {
            requiresInvoice: false,
          },
          subtotal: Math.round(subtotal),
          total: Math.round(total),
          coordinates: args.coordinates,
        }
      )

      // Schedule order confirmation reminders (2 minutes and 4 minutes)
      await ctx.runMutation(
        internal.system.orderConfirmationScheduler
          .scheduleOrderConfirmationReminder2Min,
        {
          conversationId: conversation._id,
          contactId: conversation.contactId,
          organizationId: conversation.organizationId,
        }
      )

      // Format order summary using the SAVED confirmation data to ensure consistency
      let response = "📋 RESUMEN DEL PEDIDO\n\n"

      response += "👤 Información del Destinatario:\n"
      response += `- Nombre: ${savedConfirmation.recipientName}\n`
      response += `- Teléfono: ${savedConfirmation.recipientPhone}\n`

      // If recipient is different from contact, show who made the order
      if (savedConfirmation.recipientName !== contact.displayName) {
        response += `- Pedido realizado por: ${contact.displayName}\n`
      }

      if (savedConfirmation.orderType === "delivery") {
        response += `- Dirección de entrega: ${savedConfirmation.deliveryAddress}\n\n`
      } else {
        if (hasMultipleLocations) {
          response += `- Recoger en: ${restaurantLocation.name}\n\n`
        } else {
          response += `- Para recoger 🏪\n\n`
        }
      }

      response += "🍴 Productos:\n"
      itemsWithPrices.forEach((item) => {
        const isCombo = item.itemType === "combo"

        if (isCombo && item.comboSlotSelections) {
          const comboLabel = item.comboName || "Combo"
          response += `- ${item.quantity} 🎁 ${comboLabel} ${item.quantity > 1 ? "x" : "="} $${Math.round(item.unitPrice).toLocaleString("es-CO")} ${item.quantity > 1 ? `c/u = $${Math.round(item.unitPrice * item.quantity).toLocaleString("es-CO")}` : ""}\n`
          for (const sel of item.comboSlotSelections) {
            const selectionQty = sel.quantity ?? 1
            const upchargeLabel =
              sel.upcharge > 0
                ? ` (+$${Math.round(sel.upcharge).toLocaleString("es-CO")}${selectionQty > 1 ? ` c/u x${selectionQty}` : ""})`
                : ""
            response += `      └ ${sel.slotName}: ${sel.productName}${selectionQty > 1 ? ` x${selectionQty}` : ""}${upchargeLabel}\n`
          }
        } else {
          const productCombination = item.productNames.join(" + ")
          response += `- ${item.quantity} ${productCombination} ${item.quantity > 1 ? "x" : "="} $${Math.round(item.unitPrice).toLocaleString("es-CO")} ${item.quantity > 1 ? `c/u = $${Math.round(item.unitPrice * item.quantity).toLocaleString("es-CO")}` : ""}\n`
        }

        if (item.notes) {
          response += `      └ 📝 ${item.notes}\n`
        }
      })
      response += "\n"

      if ((savedConfirmation.deliveryFee || 0) > 0) {
        response += "💰 Totales:\n"
        response += `- Subtotal: $${Math.round(savedConfirmation.subtotal).toLocaleString("es-CO")}\n`
        response += `- Domicilio: $${Math.round(savedConfirmation.deliveryFee || 0).toLocaleString("es-CO")}\n`
        response += `- Total: $${Math.round(savedConfirmation.total).toLocaleString("es-CO")}\n\n`
      } else {
        response += `💰 Total: $${Math.round(savedConfirmation.total).toLocaleString("es-CO")}\n\n`
      }

      const paymentMethodLabels: Record<string, string> = {
        cash: "Efectivo",
        card: "Datafono/Tarjeta",
        payment_link: "Pago por link de pago",
        dynamic_payment_link: "Enlace de pago dinámico",
        bank_transfer: "Transferencia a cuenta bancaria",
        corporate_credit: "Crédito/Convenio Empresarial",
        gift_voucher: "Bono de Regalo",
        sodexo_voucher: "Bono Sodexo",
      }

      response += `💲 Método${savedConfirmation.paymentMethods.length === 1 ? "" : "s"} de Pago: `

      if (savedConfirmation.paymentMethods.length === 1) {
        // Single payment method without amount split
        const payment = savedConfirmation.paymentMethods[0]
        if (payment) {
          response += `${paymentMethodLabels[payment.method]}\n`
          if (payment.referenceCode) {
            response += `  📝 Código: ${payment.referenceCode}\n`
          }
          if (payment.notes) {
            response += `  💬 Notas: ${payment.notes}\n`
          }
        }
      } else {
        // Multiple payment methods or split amounts
        response += "\n"
        let totalPaymentAmount = 0
        savedConfirmation.paymentMethods.forEach((payment) => {
          const amount = payment.amount || 0
          totalPaymentAmount += amount
          response += `- ${paymentMethodLabels[payment.method]}: $${Math.round(amount).toLocaleString("es-CO")}\n`
          if (payment.referenceCode) {
            response += `  📝 Código: ${payment.referenceCode}\n`
          }
          if (payment.notes) {
            response += `  💬 Notas: ${payment.notes}\n`
          }
        })

        // Validate that sum equals total (using saved total)
        if (Math.abs(totalPaymentAmount - savedConfirmation.total) > 1) {
          let errorMessage = `⚠️ ERROR: La suma de los pagos ($${Math.round(totalPaymentAmount).toLocaleString("es-CO")}) NO coincide con el total del pedido.\n\n`
          errorMessage += `📊 DESGLOSE DEL PEDIDO:\n`
          errorMessage += `- Subtotal productos: $${Math.round(savedConfirmation.subtotal).toLocaleString("es-CO")}\n`
          if ((savedConfirmation.deliveryFee || 0) > 0) {
            errorMessage += `- Domicilio: $${Math.round(savedConfirmation.deliveryFee || 0).toLocaleString("es-CO")}\n`
          }
          errorMessage += `- TOTAL A PAGAR: $${Math.round(savedConfirmation.total).toLocaleString("es-CO")}\n\n`
          errorMessage += `Por favor, corrige los montos de pago para que sumen exactamente $${Math.round(savedConfirmation.total).toLocaleString("es-CO")} antes de confirmar el pedido.`
          return errorMessage
        }
      }

      response += "\n"

      if (
        savedConfirmation.invoiceData?.requiresInvoice &&
        savedConfirmation.invoiceData.invoiceType
      ) {
        response += "🧾 Factura Electrónica:\n"
        response += `- Tipo: ${savedConfirmation.invoiceData.invoiceType === "natural" ? "Persona Natural" : "Empresa/Jurídica"}\n`
        if (savedConfirmation.invoiceData.fullName) {
          response += `- Nombre: ${savedConfirmation.invoiceData.fullName}\n`
        }
        if (savedConfirmation.invoiceData.email) {
          response += `- Correo: ${savedConfirmation.invoiceData.email}\n`
        }
        if (
          savedConfirmation.invoiceData.invoiceType === "natural" &&
          savedConfirmation.invoiceData.cedula
        ) {
          response += `- Cédula: ${savedConfirmation.invoiceData.cedula}\n`
        }
        if (
          savedConfirmation.invoiceData.invoiceType === "juridica" &&
          savedConfirmation.invoiceData.nit
        ) {
          response += `- NIT: ${savedConfirmation.invoiceData.nit}\n`
        }
        response += "\n"
      }

      // Check if bank_transfer is among the payment methods
      const hasBankTransfer = savedConfirmation.paymentMethods.some(
        (pm) => pm.method === "bank_transfer"
      )

      response += "¿Confirmas que la información es correcta?\n"
      response += `✅ 'Sí' para proceder ${hasBankTransfer ? "(o envía un comprobante de pago)" : ""}\n`
      response += "❌ 'No' para corregir\n\n"

      response +=
        "IMPORTANTE PARA EL AGENTE: Excluyendo esta última nota, Sin Interpretacion o intervención directa alguna copia EXACTAMENTE TODO este resumen en tu respuesta al cliente - el cliente NO ve esta información de la herramienta directamente.\n\n"

      response +=
        "⚡ INSTRUCCIÓN DE EJECUCIÓN INMEDIATA: Si el cliente responde POSITIVAMENTE a este resumen (ej: 'Sí', 'Confirmado', 'Todo bien'), TU SIGUIENTE ACCIÓN OBLIGATORIA ES EJECUTAR LA HERRAMIENTA `makeOrderTool` (para pedidos inmediatos) O `scheduleOrderTool` (para pedidos programados). NO PIDAS MÁS DATOS NI RECONFIRMACIONES. ¡EJECUTA LA HERRAMIENTA DE CREACIÓN DE PEDIDO INMEDIATAMENTE!. Si el cliente NO responde POSITIVAMENTE a este resumen (ej: 'No', 'Cancelar', '¿Tienen ${Nombre de Producto}?', '¿Venden ${Nombre de Producto}?') queda pendiente la ejecución obligatoria de `makeOrderTool` o `scheduleOrderTool` hasta que el cliente responda POSITIVAMENTE, siempre redirigirlo hacia el cierre del pedido cuando se respondido sus consultas o ajustado el pedido."

      // Add special instructions if bank transfer is a payment method
      if (hasBankTransfer) {
        response +=
          "\n\n🚨 INSTRUCCIÓN CRÍTICA - TRANSFERENCIA BANCARIA DETECTADA:\n"
        response +=
          "Dado que el método de pago incluye TRANSFERENCIA BANCARIA, debes estar atento a lo siguiente:\n"
        response +=
          "- Si el cliente ENVÍA UN COMPROBANTE DE PAGO (imagen, archivo, voucher, referencia, código de transacción, captura de pantalla, etc.) → Interpreta esto como CONFIRMACIÓN EXPLÍCITA del pedido.\n"
        response +=
          "- El envío del comprobante es equivalente a decir 'Sí, confirmo el pedido'.\n"
        response +=
          "- Cuando recibas el comprobante, procede INMEDIATAMENTE a crear el pedido con makeOrderTool o scheduleOrderTool según corresponda.\n"
        response +=
          "- Primero crea el pedido. Despues recuerda que según las reglas de escalación, cuando el cliente envía comprobante de pago debes ESCALAR la conversación INMEDIATAMENTE después de crear el pedido para que un operador humano valide el comprobante. No esperes una confirmación del cliente para escalar, hazlo inmediatamente."
      }

      return response
    } catch (error) {
      if (error instanceof ConvexError) {
        const { code, message } = (error.data ?? {}) as {
          code?: string
          message?: string
        }
        return `Error al generar confirmación del pedido: ${message || error.message || "Error desconocido"}`
      }
      return `Error al generar confirmación del pedido: ${error instanceof Error ? error.message : "Error desconocido"}`
    }
  },
})
