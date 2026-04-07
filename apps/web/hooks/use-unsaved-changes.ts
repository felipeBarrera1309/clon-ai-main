"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

export function useUnsavedChanges(hasChanges: boolean) {
  const router = useRouter()
  const pathname = usePathname()
  type NavigationOptions = Parameters<typeof router.push>[1]

  // Use ref to track if navigation has been confirmed by the user
  const isConfirmedRef = useRef(false)

  // Use ref for pending navigation to avoid closure staleness and re-render loops
  const pendingNavigationRef = useRef<{
    type: "push" | "replace" | "link"
    href: string
    options?: NavigationOptions
  } | null>(null)
  const executePendingNavigationRef = useRef<(() => void) | null>(null)

  const [navigationDialog, setNavigationDialog] = useState<{
    isOpen: boolean
    action: "navigate" | "reload"
    target?: string
  }>({
    isOpen: false,
    action: "navigate",
  })

  // Reset confirmation state when pathname changes to re-arm the protection for the new route
  useEffect(() => {
    if (pathname !== undefined) {
      isConfirmedRef.current = false
    }
  }, [pathname])

  // Handle page reload/navigation away (browser level)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges && !isConfirmedRef.current) {
        e.preventDefault()
        e.returnValue = ""
        return ""
      }
    }

    if (hasChanges) {
      window.addEventListener("beforeunload", handleBeforeUnload)
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [hasChanges])

  // Intercept navigation attempts (Next.js router & Links)
  useEffect(() => {
    const handleNavigation = (
      url: string,
      type: "push" | "replace" | "link" = "push",
      options?: NavigationOptions
    ) => {
      // Check if navigation is different from current path
      // Note: pathname contains path without query/hash. url might contain them.
      // We interpret "navigation" as any change in full URL.
      // However, usePathname() only gives us path.
      // Ideally we compare against window.location.pathname + search + hash but that's unstable during render.
      // We rely on simple string difference.

      // Allow if hasChanges is false or user confirmed navigation
      if (!hasChanges || isConfirmedRef.current) return true

      // Simply check against current pathname.
      // We interpret any attempt to change URL as navigation.
      if (url !== pathname) {
        pendingNavigationRef.current = { type, href: url, options }
        setNavigationDialog({
          isOpen: true,
          action: "navigate",
          target: url,
        })
        return false // Prevent navigation
      }
      return true
    }

    // Override Next.js router push
    const originalPush = router.push
    router.push = (href: string, options?: NavigationOptions) => {
      if (handleNavigation(href, "push", options)) {
        originalPush(href, options)
      }
    }

    // Override Next.js router replace
    const originalReplace = router.replace
    router.replace = (href: string, options?: NavigationOptions) => {
      if (handleNavigation(href, "replace", options)) {
        originalReplace(href, options)
      }
    }

    // Intercept link clicks
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest("a[href]") as HTMLAnchorElement

      if (link?.href) {
        const url = new URL(link.href, window.location.origin)
        const currentUrl = new URL(window.location.href)

        // Only intercept if it's a same-origin navigation
        if (url.origin === currentUrl.origin) {
          const targetHref = url.pathname + url.search + url.hash

          // Don't intercept if strictly identical to current full URL
          if (
            targetHref ===
            currentUrl.pathname + currentUrl.search + currentUrl.hash
          ) {
            return
          }

          if (!handleNavigation(targetHref, "link")) {
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
          }
        }
      }
    }

    // Function to execute pending navigation
    const executePendingNavigation = () => {
      const pending = pendingNavigationRef.current
      if (pending) {
        const { type, href, options } = pending
        pendingNavigationRef.current = null

        if (type === "push" || type === "link") {
          originalPush(href, options)
        } else if (type === "replace") {
          originalReplace(href, options)
        }
      }
    }

    executePendingNavigationRef.current = executePendingNavigation

    document.addEventListener("click", handleLinkClick, true)

    return () => {
      router.push = originalPush
      router.replace = originalReplace
      document.removeEventListener("click", handleLinkClick, true)
      executePendingNavigationRef.current = null
    }
  }, [hasChanges, pathname, router])

  const closeDialog = () => {
    setNavigationDialog((prev) => ({ ...prev, isOpen: false }))
  }

  const confirmNavigation = () => {
    isConfirmedRef.current = true
    closeDialog()
    if (navigationDialog.action === "navigate" && navigationDialog.target) {
      if (executePendingNavigationRef.current) {
        executePendingNavigationRef.current()
      } else {
        router.push(navigationDialog.target)
      }
    } else if (navigationDialog.action === "reload") {
      window.location.reload()
    }
  }

  return {
    navigationDialog,
    closeDialog,
    confirmNavigation,
  }
}
