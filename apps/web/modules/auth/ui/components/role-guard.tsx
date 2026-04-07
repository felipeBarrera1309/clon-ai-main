"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { usePermissions } from "@/hooks/use-permissions"
import { getDefaultRoute, ORGANIZATION_ROLES } from "@/lib/rbac"

export const RoleGuard = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname()
  const router = useRouter()
  const {
    allowedPages,
    role,
    isLoading,
    isPlatformAdmin,
    isPlatformSuperAdmin,
  } = usePermissions()

  useEffect(() => {
    if (isLoading) return

    // Check if user has access to this page
    const hasAccess = checkAccess(
      pathname,
      allowedPages,
      isPlatformAdmin,
      isPlatformSuperAdmin,
      role
    )

    if (!hasAccess) {
      // Redirect to first allowed page or default
      const defaultRoute =
        allowedPages[0] ||
        getDefaultRoute(
          role === "admin"
            ? ORGANIZATION_ROLES.ADMIN
            : ORGANIZATION_ROLES.VIEWER,
          isPlatformAdmin || isPlatformSuperAdmin
        )
      router.replace(defaultRoute)
    }
  }, [
    allowedPages,
    role,
    isLoading,
    isPlatformAdmin,
    isPlatformSuperAdmin,
    pathname,
    router,
  ])

  if (isLoading) {
    return null
  }

  const hasAccess = checkAccess(
    pathname,
    allowedPages,
    isPlatformAdmin,
    isPlatformSuperAdmin,
    role
  )

  if (!hasAccess) {
    return null
  }

  return <>{children}</>
}

/**
 * Check if user has access to a specific path
 */
function checkAccess(
  pathname: string,
  allowedPages: readonly string[],
  isPlatformAdmin: boolean,
  isPlatformSuperAdmin: boolean,
  role: string
): boolean {
  // Platform admin or superadmin has access to everything
  if (isPlatformAdmin || isPlatformSuperAdmin) {
    return true
  }

  // Allow normal admins to access customization for reading (read-only)
  if (role === "admin" && pathname.startsWith("/customization")) {
    return true
  }

  // Check if the page is in the allowed list
  return allowedPages.some((page) => {
    if (pathname === page) return true
    if (pathname.startsWith(`${page}/`)) return true
    return false
  })
}
