import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import { useQuery } from "convex/react"
import { useEffect, useRef } from "react"
import { useNotificationSound } from "./use-notification-sound"
import { useOrganization } from "./use-organization"

export const useOrderNotifications = () => {
  const { activeOrganizationId } = useOrganization()
  const { playSound } = useNotificationSound()
  const orders = useQuery(
    api.private.orders.listWithConversations,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  const previousOrderIds = useRef<Set<Id<"orders">>>(new Set())
  const isInitialLoad = useRef(true)

  useEffect(() => {
    if (!orders) return

    const currentOrderIds = new Set(orders.map((order) => order._id))

    const newOrders = orders.filter(
      (order) => !previousOrderIds.current.has(order._id)
    )

    if (!isInitialLoad.current && newOrders.length > 0) {
      playSound("order")
    }

    if (isInitialLoad.current) {
      isInitialLoad.current = false
    }

    previousOrderIds.current = currentOrderIds
  }, [orders, playSound])
}
