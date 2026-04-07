"use client"

import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { cn } from "@workspace/ui/lib/utils"
import { useAtom } from "jotai"
import React, { useEffect, useState } from "react"

import { currentViewAtom } from "../../atoms"
import { useCurrentView } from "../../hooks/use-current-view"

export const DashboardHeader = ({ className }: { className?: string }) => {
  const isMobile = useIsMobile()
  const [currentView] = useAtom(currentViewAtom)
  const [isHydrated, setIsHydrated] = useState(false)

  // Usar el hook para actualizar la vista actual basada en la ruta
  useCurrentView()

  // Marcar como hidratado después del primer render en el cliente
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // Actualizar el título del documento de manera segura
  useEffect(() => {
    if (isHydrated && typeof window !== "undefined") {
      const title =
        currentView?.title && typeof currentView.title === "string"
          ? currentView.title
          : "Dashboard"

      if (window.location.hostname !== "localhost") {
        document.title = title
      } else {
        document.title = `[Dev] ${title}`
      }
    }
  }, [currentView.title, isHydrated])

  // Verificaciones robustas para el título
  const safeTitle =
    isHydrated && currentView?.title && typeof currentView.title === "string"
      ? currentView.title
      : "Dashboard"

  // Verificaciones robustas para el ícono
  const safeIcon = isHydrated && currentView?.icon ? currentView.icon : null

  // Renderizar solo después de la hidratación para evitar discrepancias
  if (!isHydrated) {
    return (
      <header
        className={cn(
          "no-print flex items-center gap-4 border-b bg-background p-3",
          className
        )}
      >
        {isMobile && <SidebarTrigger />}
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-xl">Dashboard</h1>
        </div>
      </header>
    )
  }

  return (
    <header
      className={cn(
        "no-print flex items-center gap-4 border-b bg-background p-3",
        className
      )}
    >
      {isMobile && <SidebarTrigger />}

      <div className="flex items-center gap-3">
        {!isMobile &&
          safeIcon &&
          React.createElement(safeIcon, {
            className: "size-4 text-muted-foreground",
          })}
        <h1 className="font-bold text-xl">{safeTitle}</h1>
      </div>
    </header>
  )
}
