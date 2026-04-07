"use client"

import { api } from "@workspace/backend/_generated/api"
import { useQuery } from "convex/react"
import { useMemo } from "react"
import { authClient } from "@/lib/auth-client"

/**
 * Hook to access organization data from Better Auth session
 * Provides the active organization and list of user's organizations
 */
export function useOrganization() {
  const session = authClient.useSession()
  const isSessionReady = !session.isPending
  const hasValidSession =
    isSessionReady && !!session.data?.session?.id && !!session.data?.user?.id
  const organizations = useQuery(
    api.auth.getUserOrganizations,
    hasValidSession ? {} : "skip"
  )

  // Get activeOrganizationId from the client session (this is the source of truth)
  const activeOrganizationId = hasValidSession
    ? (session.data?.session?.activeOrganizationId ?? null)
    : null

  // Find the active organization from the organizations list using the session's activeOrganizationId
  const activeOrganization = useMemo(() => {
    if (!activeOrganizationId || !organizations?.length) return null

    const activeIdStr = String(activeOrganizationId)
    const found = organizations.find((org) => String(org._id) === activeIdStr)

    return found || null
  }, [activeOrganizationId, organizations])

  return {
    activeOrganizationId,
    activeOrganization,
    organizations: organizations || [],
    isLoading:
      session.isPending || (hasValidSession && organizations === undefined),
  }
}
