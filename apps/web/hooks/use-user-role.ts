import { api } from "@workspace/backend/_generated/api"
import { useQuery } from "convex/react"
import { authClient } from "@/lib/auth-client"
import type { OrganizationRole } from "@/lib/rbac"

export const useUserRole = (): OrganizationRole | undefined => {
  const session = authClient.useSession()
  const organizations = useQuery(api.auth.getUserOrganizations)

  const activeOrganizationId = session.data?.session?.activeOrganizationId

  if (!activeOrganizationId || !organizations) {
    return undefined
  }

  // Find the user's role in the active organization
  const activeOrg = organizations.find(
    (org) => org._id === activeOrganizationId
  )

  if (!activeOrg?.role) {
    return undefined
  }

  // Map Better Auth roles to our role system
  // Better Auth organization roles: "owner", "admin", "member" (default)
  // Our roles: "owner", "admin", "manager", "cashier", "kitchen", "viewer"
  const role = activeOrg.role as string

  // If it's one of our new roles, return it directly
  const validRoles: OrganizationRole[] = [
    "owner",
    "admin",
    "manager",
    "cashier",
    "kitchen",
    "viewer",
  ]
  if (validRoles.includes(role as OrganizationRole)) {
    return role as OrganizationRole
  }

  // Legacy "member" role maps to "cashier"
  if (role === "member") {
    return "cashier"
  }

  // Unknown role, default to viewer (most restrictive)
  return "viewer"
}
