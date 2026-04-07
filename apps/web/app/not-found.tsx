"use client"

import { redirect, usePathname } from "next/navigation"

export default function NotFound() {
  const pathname = usePathname()

  const segments = pathname.split("/").filter(Boolean)

  if (segments.length === 0) {
    return null
  }

  if (segments.length > 1) {
    const parentPath = `/${segments.slice(0, -1).join("/")}`
    redirect(parentPath)
  }

  redirect("/")
}
