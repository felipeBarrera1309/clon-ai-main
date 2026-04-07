"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { useIsImplementor, usePlatformAdmin } from "@/hooks/use-platform-admin"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const isPlatformAdmin = usePlatformAdmin()
  const isImplementor = useIsImplementor()

  // Determine if user has any admin-level access
  const hasAccess = isPlatformAdmin === true || isImplementor === true
  const isLoaded = isPlatformAdmin !== undefined && isImplementor !== undefined

  useEffect(() => {
    if (!isLoaded) return

    // No access at all → redirect to home
    if (!hasAccess) {
      router.push("/")
      return
    }

    // Implementors cannot access the main admin dashboard, platform-permissions or escalations
    if (isImplementor && !isPlatformAdmin) {
      const blockedPrefixes = [
        "/admin/costs",
        "/admin/platform-permissions",
        "/admin/escalations",
        "/admin/conversations",
      ]
      const isBlocked =
        pathname === "/admin" ||
        blockedPrefixes.some(
          (b) => pathname === b || pathname.startsWith(`${b}/`)
        )
      if (isBlocked) {
        router.push("/admin/organizations")
      }
    }
  }, [isLoaded, hasAccess, isImplementor, isPlatformAdmin, pathname, router])

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Verificando permisos...</p>
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    return null
  }

  return <>{children}</>
}
