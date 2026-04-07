import { saveMessage } from "@convex-dev/agent"
import { v } from "convex/values"
import { components, internal } from "../_generated/api"
import type { Doc } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { ContactNotFoundError } from "../lib/errors"

// Status messages in Spanish - differentiated by order type
import { DEFAULT_ORDER_STATUS_MESSAGES } from "../lib/orderStatusConstants"

export async function notifyOrderStatusChange(
  ctx: MutationCtx,
  args: {
    order: Doc<"orders">
    newStatus: Doc<"orders">["status"]
    bufferMinutes?: number
    agentName?: string
  }
) {
  const { order, newStatus, bufferMinutes = 30, agentName = "Sistema" } = args

  if (!order.conversationId) return

  try {
    const conversation = await ctx.db.get(order.conversationId)
    if (!conversation) return

    const contact = await ctx.db.get(conversation.contactId)
    if (!contact) throw new ContactNotFoundError()

    // Get restaurant configuration
    const config = await ctx.db
      .query("restaurantConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", order.organizationId)
      )
      .first()

    // Get default status messages
    const defaultMessages =
      order.orderType === "pickup"
        ? DEFAULT_ORDER_STATUS_MESSAGES.pickup
        : DEFAULT_ORDER_STATUS_MESSAGES.delivery

    // Get custom configured messages
    const customMessages =
      order.orderType === "pickup"
        ? config?.orderStatusMessages?.pickup
        : config?.orderStatusMessages?.delivery

    // Merge messages (custom takes precedence)
    const statusMessages = { ...defaultMessages, ...customMessages }

    let message =
      (statusMessages as any)[newStatus] ||
      `El estado de tu pedido ${order.orderNumber} ha cambiado a: ${newStatus}`

    // Add itemized order summary for relevant statuses
    const statusesWithItemDetails = [
      "pendiente",
      "preparando",
      "listo_para_recoger",
      "en_camino",
    ]
    if (statusesWithItemDetails.includes(newStatus)) {
      const orderItems = await ctx.db
        .query("orderItems")
        .withIndex("by_order_id", (q) => q.eq("orderId", order._id))
        .collect()

      if (orderItems.length > 0) {
        const itemSummaryLines: string[] = []

        for (const item of orderItems) {
          const menuProductOrderItems = await ctx.db
            .query("menuProductOrderItems")
            .withIndex("by_order_item_id", (q) => q.eq("orderItemId", item._id))
            .collect()

          if (item.itemType === "combo") {
            const comboName =
              (item as { comboName?: string }).comboName ?? "Combo"
            const slotDetails = menuProductOrderItems
              .map((p) => {
                const upchargePart =
                  p.upcharge && p.upcharge > 0
                    ? ` (+$${p.upcharge.toLocaleString("es-CO")}${p.quantity > 1 ? " c/u" : ""})`
                    : ""
                const quantityPart =
                  p.quantity > 1
                    ? ` x${p.quantity.toLocaleString("es-CO")}`
                    : ""
                return `${p.productName}${quantityPart}${upchargePart}`
              })
              .join(", ")
            itemSummaryLines.push(
              `- ${item.quantity}x 🎁 ${comboName}: ${slotDetails}`
            )
          } else {
            const productNames =
              menuProductOrderItems.length > 0
                ? menuProductOrderItems.map((p) => p.productName).join(" + ")
                : "Producto"
            itemSummaryLines.push(`- ${item.quantity}x ${productNames}`)
          }
        }

        if (itemSummaryLines.length > 0) {
          message += "\n\n📋 *Tu pedido:*\n" + itemSummaryLines.join("\n")
        }
      }
    }

    // Add buffer time information for delivered orders
    if (newStatus === "entregado" && conversation.status !== "resolved") {
      const actualBufferMinutes =
        config?.conversationResolutionBufferMinutes || bufferMinutes
      const bufferHours = Math.floor(actualBufferMinutes / 60)
      const remainingMinutes = actualBufferMinutes % 60

      let timeText = ""
      if (bufferHours > 0 && remainingMinutes > 0) {
        timeText = `${bufferHours} hora${bufferHours > 1 ? "s" : ""} y ${remainingMinutes} minuto${remainingMinutes > 1 ? "s" : ""}`
      } else if (bufferHours > 0) {
        timeText = `${bufferHours} hora${bufferHours > 1 ? "s" : ""}`
      } else {
        timeText = `${actualBufferMinutes} minuto${actualBufferMinutes > 1 ? "s" : ""}`
      }

      message += `\n\n💬 Tienes ${timeText} más para contarnos cualquier comentario, sugerencia o problema con tu pedido. Después de este tiempo, la conversación se cerrará automáticamente.`

      // Schedule the resolution directly
      const resolutionTime = Date.now() + actualBufferMinutes * 60 * 1000
      console.log(
        `📅 Programando resolución de conversación ${order.conversationId} en ${actualBufferMinutes} minutos para pedido ${order.orderNumber}`
      )

      await ctx.scheduler.runAt(
        resolutionTime,
        internal.system.conversations.resolveConversationDelayed,
        {
          conversationId: order.conversationId,
          organizationId: order.organizationId,
        }
      )
    }

    // Always save message to conversation thread
    await saveMessage(ctx, components.agent, {
      threadId: conversation.threadId,
      agentName: agentName,
      message: {
        role: "assistant",
        content: message,
      },
    })

    // Send WhatsApp notification
    const configId =
      conversation.whatsappConfigurationId || conversation.twilioConfigurationId

    if (configId) {
      const config = await ctx.db.get(configId)

      if (config && config.isActive) {
        // Determine provider - default to 'meta' if not specified but check for twilio specific fields or provider flag
        const isTwilio =
          config.provider === "twilio" || !!config.twilioAccountSid

        await ctx.scheduler.runAfter(
          0,
          internal.system.whatsappDispatcher.sendMessage,
          {
            [isTwilio ? "twilioConfigurationId" : "whatsappConfigurationId"]:
              config._id,
            to: contact.phoneNumber,
            message: message,
          }
        )
        console.log(
          `✅ Notificación WhatsApp enviada para pedido ${order.orderNumber} (${isTwilio ? "Twilio" : "Meta"})`
        )

        // Save to conversationMessages for dashboard display
        await ctx.db.insert("conversationMessages", {
          conversationId: conversation._id,
          organizationId: order.organizationId,
          direction: "outbound",
          sender: "system",
          type: "text",
          content: { text: message },
          status: "sent",
          messageTimestamp: Date.now(),
        })
      }
    } else {
      console.log(
        `[NOTIFY] No active WhatsApp/Twilio configuration found for conversation ${conversation._id}`
      )
    }
  } catch (error) {
    console.error("❌ Error en la notificación de estado del pedido:", error)
  }
}
