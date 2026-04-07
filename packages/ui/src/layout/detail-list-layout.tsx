"use client"

import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import {
  dashboardScrollAreaChildPropsAtom,
  dashboardScrollAreaDivPropsAtom,
} from "@workspace/ui/lib/atoms"
import { cn } from "@workspace/ui/lib/utils"
import { getDefaultStore, useSetAtom } from "jotai"
import { SquareMousePointer } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export interface DetailsListLayoutProps<T = unknown> {
  /** Contenido del panel maestro (lista) */
  sidebarContent: (props: {
    onSelectItem: (item: T) => void
    selectedItem: T | null
  }) => React.ReactNode

  /** Contenido del panel de detalles */
  detailContent: (props: {
    selectedItem: T | null
    onBack?: () => void
    isMobile?: boolean
  }) => React.ReactNode

  /** Elemento seleccionado actualmente */
  selectedItem?: T | null

  /** Callback cuando cambia el elemento seleccionado */
  onSelectedItemChange?: (item: T | null) => void

  /** Clase CSS adicional */
  className?: string

  /** Configuración del layout */
  config?: {
    /** Ancho mínimo del sidebar en desktop */
    sidebarMinWidth?: string
    /** Ancho máximo del sidebar en desktop */
    sidebarMaxWidth?: string
    /** Mostrar sidebar en mobile por defecto */
    showSidebarOnMobile?: boolean
    /** Ocultar completamente el sidebar */
    hideSidebar?: boolean
  }
}

export function DetailsListLayout<T = unknown>({
  sidebarContent,
  detailContent,
  selectedItem: externalSelectedItem,
  onSelectedItemChange,
  className,
  config = {},
}: DetailsListLayoutProps<T>) {
  const {
    sidebarMinWidth = "320px",
    sidebarMaxWidth = "480px",
    showSidebarOnMobile = false,
    hideSidebar = false,
  } = config

  const isMobile = useIsMobile()
  const setScrollAreaChildProps = useSetAtom(dashboardScrollAreaChildPropsAtom)
  const setScrollAreaDivProps = useSetAtom(dashboardScrollAreaDivPropsAtom)

  // Capturar valores originales de los átomos al montar
  const originalChildPropsRef = useRef(
    getDefaultStore().get(dashboardScrollAreaChildPropsAtom)
  )
  const originalDivPropsRef = useRef(
    getDefaultStore().get(dashboardScrollAreaDivPropsAtom)
  )

  useEffect(() => {
    setScrollAreaChildProps({
      style: {
        display: "block",
        height: "100%",
        overflow: "hidden",
      },
    })
    setScrollAreaDivProps({
      className: "h-full",
    })
    return () => {
      setScrollAreaChildProps(originalChildPropsRef.current)
      setScrollAreaDivProps(originalDivPropsRef.current)
    }
  }, [setScrollAreaChildProps, setScrollAreaDivProps])

  // Estado interno para el elemento seleccionado
  const [internalSelectedItem, setInternalSelectedItem] = useState<T | null>(
    null
  )

  // Usar estado externo si se proporciona, sino el interno
  const selectedItem =
    externalSelectedItem !== undefined
      ? externalSelectedItem
      : internalSelectedItem
  const setSelectedItem = onSelectedItemChange || setInternalSelectedItem

  // Determinar si mostrar detalles
  const showDetails = selectedItem !== null
  const showSidebar =
    !hideSidebar && (!isMobile || !showDetails || showSidebarOnMobile)

  const handleSelectItem = (item: T) => {
    setSelectedItem(item)
  }

  const handleBack = () => {
    setSelectedItem(null)
  }

  return (
    <div
      className={cn(
        "flex h-full justify-between overflow-hidden print:h-auto print:flex-col",
        className
      )}
    >
      {/* Panel Maestro (Sidebar) */}
      <div
        className={cn(
          "flex-shrink-0 bg-background print:hidden",
          isMobile ? "w-full" : "flex-[0.3] border-r",
          !showSidebar && "hidden"
        )}
        style={
          !isMobile
            ? {
                minWidth: sidebarMinWidth,
                maxWidth: sidebarMaxWidth,
              }
            : undefined
        }
      >
        {sidebarContent({
          onSelectItem: handleSelectItem,
          selectedItem,
        })}
      </div>
      {/* Panel de Detalles */}
      {showDetails && (
        <div className="h-full min-w-0 flex-1 bg-muted print:w-full print:min-w-0">
          {detailContent({
            selectedItem,
            onBack: isMobile ? handleBack : undefined,
            isMobile,
          })}
        </div>
      )}

      {/* Placeholder cuando no hay elemento seleccionado */}
      {!showDetails && !isMobile && (
        <div className="flex flex-1 items-center justify-center bg-muted p-8 text-center print:hidden">
          <div className="flex max-w-md flex-col items-center justify-center gap-3">
            <SquareMousePointer className="size-36 stroke-[1.5] text-primary" />
            <h3 className="mb-2 font-medium text-lg text-muted-foreground">
              Selecciona un item para ver sus detalles aquí
            </h3>
          </div>
        </div>
      )}
    </div>
  )
}
