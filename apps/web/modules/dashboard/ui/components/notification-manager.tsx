"use client"

import { api } from "@workspace/backend/_generated/api"
import { useMutation } from "convex/react"
import { useEffect, useRef } from "react"
import { useConversationNotifications } from "@/hooks/use-conversation-notifications"
import { useOrderNotifications } from "@/hooks/use-order-notifications"

export const NotificationManager = () => {
  useOrderNotifications()
  useConversationNotifications()

  // Auto-migrate legacy permission data
  const autoMigrate = useMutation(
    api.private.organizationPermissions.autoMigratePermissions
  )
  const hasMigrated = useRef(false)

  useEffect(() => {
    if (hasMigrated.current) return
    hasMigrated.current = true

    // Run migration in background (fire and forget)
    autoMigrate({}).catch(() => {
      // Silently ignore errors - migration is best-effort
    })
  }, [autoMigrate])

  return null
}
