import { api } from "@workspace/backend/_generated/api"
import { useQuery } from "convex/react"

/**
 * Hook to check if the current user is a platform admin
 * Platform admin = user with role="admin" OR role="superadmin" in Better Auth
 * This is different from organization admin (owner/admin role within an org)
 */
export const usePlatformAdmin = (): boolean | undefined => {
  const isPlatformAdmin = useQuery(api.auth.isPlatformAdmin)
  return isPlatformAdmin
}

/**
 * Hook to check if the current user is a platform superadmin
 * Superadmin = user with role="superadmin" in Better Auth
 * This is the highest privilege level, with access to destructive operations
 */
export const usePlatformSuperAdmin = (): boolean | undefined => {
  const isPlatformSuperAdmin = useQuery(api.auth.isPlatformSuperAdmin)
  return isPlatformSuperAdmin
}

/**
 * Hook to check if the current user is an implementor
 * Implementor = user with role="implementor" in Better Auth
 */
export const useIsImplementor = (): boolean | undefined => {
  const isImplementor = useQuery(api.auth.isImplementor)
  return isImplementor
}
