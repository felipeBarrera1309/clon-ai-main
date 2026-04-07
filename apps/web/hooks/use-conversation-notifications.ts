import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import { useQuery } from "convex/react"
import { useEffect, useRef } from "react"
import { useNotificationSound } from "./use-notification-sound"
import { useOrganization } from "./use-organization"

export const useConversationNotifications = () => {
  const { activeOrganizationId } = useOrganization()
  const { playSound } = useNotificationSound()
  const conversations = useQuery(
    api.private.conversations.listForNotifications,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  const previousEscalatedIds = useRef<Set<Id<"conversations">>>(new Set())
  const isInitialLoad = useRef(true)

  useEffect(() => {
    if (!conversations) return

    const currentEscalatedIds = new Set(
      conversations
        .filter((conv) => conv.status === "escalated")
        .map((conv) => conv._id)
    )

    const newEscalations = [...currentEscalatedIds].filter(
      (id) => !previousEscalatedIds.current.has(id)
    )

    if (!isInitialLoad.current && newEscalations.length > 0) {
      playSound("escalation")
    }

    if (isInitialLoad.current) {
      isInitialLoad.current = false
    }

    previousEscalatedIds.current = currentEscalatedIds
  }, [conversations, playSound])
}
