"use client"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { type Column, DataTable } from "@workspace/ui/components/data-table"
import { PaginationControls } from "@workspace/ui/components/pagination-controls"
import SearchInput from "@workspace/ui/components/search-input"
import { SmartHorizontalScrollArea } from "@workspace/ui/components/smart-horizontal-scroll-area"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { cn } from "@workspace/ui/lib/utils"
import { LayoutGrid, TableIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo } from "react"

export interface DataViewerLayoutProps<T> {
  /** Título del layout */
  title?: string
  /** Descripción opcional */
  description?: string
  /** Estado controlado para table/cards */
  viewMode: "table" | "cards"
  /** Callback para cambiar vista */
  onViewModeChange: (mode: "table" | "cards") => void
  /** Desactivar cambio manual de vista, dejando que sea automático por mobile */
  disableViewSwitch?: boolean
  /** Props para el input de búsqueda */
  searchProps?: {
    value: string
    onChange: (value: string) => void
    placeholder?: string
  }
  /** Slot para componentes de filtros */
  filters?: ReactNode
  /** Slot para botones/acciones adicionales */
  actions?: ReactNode
  /** Slot para header en vista de cards */
  cardHeader?: ReactNode
  /** Array de items */
  data: T[]
  /** Definición de columnas para DataTable */
  tableColumns?: Column<T>[]
  /** Función para renderizar cada card */
  renderCard?: (item: T) => ReactNode
  /** Props para pagination (opcional) */
  paginationProps?: {
    state: {
      pageSize: number
      cursor: string | null
      prevCursors: string[]
    }
    actions: {
      setPageSize: (size: number) => void
      handleNext: () => void
      handlePrev: () => void
      resetPagination: () => void
    }
    info: {
      isDone: boolean
      continueCursor: string | null
      totalItems?: number
    }
    pageSizeOptions?: number[]
  } | null
  /** Estados */
  loading?: boolean
  error?: Error | null
  emptyState?: {
    icon?: ReactNode
    title: string
    description: string
  }
  /** Nombre del item para mensajes */
  itemName: {
    singular: string
    plural: string
  }
  /** Número de columnas a la izquierda que quedan fijas durante scroll horizontal */
  stickyColumns?: number
  /** Si el header debe quedar fijo durante scroll vertical */
  stickyHeader?: boolean
  /** Clase CSS adicional */
  className?: string
}

export function DataViewerLayout<T extends { _id: string }>({
  title,
  description,
  viewMode,
  onViewModeChange,
  disableViewSwitch = false,
  searchProps,
  filters,
  actions,
  cardHeader,
  data,
  tableColumns,
  renderCard,
  paginationProps,
  loading = false,
  error = null,
  emptyState,
  itemName,
  stickyColumns = 0,
  stickyHeader = true,
  className,
}: DataViewerLayoutProps<T>) {
  const isMobile = useIsMobile()

  // Determinar vistas disponibles basado en props proporcionadas
  const hasTableView = tableColumns && tableColumns.length > 0
  const hasCardsView = !!renderCard
  const availableViews = useMemo(
    () => [
      ...(hasTableView ? (["table"] as const) : []),
      ...(hasCardsView ? (["cards"] as const) : []),
    ],
    [hasTableView, hasCardsView]
  )

  // Determinar si mostrar botones de cambio de vista
  const showViewSwitchButtons = availableViews.length > 1 && !disableViewSwitch

  // Determinar vista por defecto inteligente
  const getDefaultView = useCallback((): "table" | "cards" => {
    if (availableViews.length === 1) {
      return availableViews[0] ?? "table"
    }

    if (isMobile && availableViews.includes("cards")) {
      return "cards"
    }

    if (!isMobile && availableViews.includes("table")) {
      return "table"
    }

    return availableViews[0] ?? "table"
  }, [availableViews, isMobile])

  // Cambiar vista por defecto en mobile (solo si no está deshabilitado manualmente)
  const handleViewModeChange = (mode: "table" | "cards") => {
    if (availableViews.includes(mode)) {
      onViewModeChange(mode)
    }
  }

  // Efecto para ajustar automáticamente la vista cuando cambian las props disponibles
  useEffect(() => {
    const defaultView = getDefaultView()
    if (availableViews.length > 0 && !availableViews.includes(viewMode)) {
      onViewModeChange(defaultView)
    }
  }, [availableViews, getDefaultView, onViewModeChange, viewMode])

  // Estados de UI
  const isLoading = loading
  const hasError = error !== null
  const isEmpty = !isLoading && !hasError && data.length === 0

  return (
    <div className={cn("flex h-full flex-1 flex-col gap-y-4", className)}>
      <div className="flex flex-col gap-1">
        {(title || description) && (
          <div className="flex items-center justify-between">
            {title && (
              <h1 className="flex items-center gap-2 font-semibold text-2xl">
                {title}
              </h1>
            )}
            {description && (
              <p className="text-muted-foreground">{description}</p>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          {(searchProps || (filters && !isMobile)) && (
            <div className="flex w-full flex-col gap-1 lg:min-w-98 lg:max-w-98">
              {searchProps && (
                <SearchInput
                  inputProps={{
                    placeholder: searchProps.placeholder || "Buscar...",
                    value: searchProps.value,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                      searchProps.onChange(e.target.value),
                  }}
                  clearButtonProps={{
                    onClick: () => searchProps.onChange(""),
                  }}
                />
              )}
              {!isMobile && (
                <div className="flex flex-wrap gap-1.5">{filters}</div>
              )}
            </div>
          )}
          <div
            className={cn(
              "flex gap-1",
              !searchProps && actions && filters
                ? "justify-between"
                : "justify-end",
              !(searchProps || filters) && "w-full",
              filters && isMobile && !searchProps && "w-full"
            )}
          >
            {!isMobile && searchProps && (
              <div className="flex flex-wrap place-content-end gap-1.5">
                {actions}
              </div>
            )}
            {(showViewSwitchButtons || (!searchProps && actions)) && (
              <>
                {!searchProps && actions && (
                  <div className="flex flex-wrap items-center gap-1 self-start px-2">
                    {actions}
                  </div>
                )}
                <ButtonGroup className="items-center self-stretch">
                  {showViewSwitchButtons &&
                    availableViews.includes("table") && (
                      <Button
                        variant={viewMode === "table" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleViewModeChange("table")}
                      >
                        <TableIcon className="size-4" />
                      </Button>
                    )}
                  {showViewSwitchButtons &&
                    availableViews.includes("cards") && (
                      <Button
                        variant={viewMode === "cards" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleViewModeChange("cards")}
                      >
                        <LayoutGrid className="size-4" />
                      </Button>
                    )}
                </ButtonGroup>
              </>
            )}
          </div>
        </div>
        {isMobile && (
          <>
            <SmartHorizontalScrollArea className="w-full">
              <div className="flex items-center gap-1.5">{filters}</div>
            </SmartHorizontalScrollArea>
            {searchProps && (
              <SmartHorizontalScrollArea className="w-full">
                <div className="flex items-center gap-1.5">{actions}</div>
              </SmartHorizontalScrollArea>
            )}
          </>
        )}
      </div>
      <div>
        {availableViews.length === 0 ? (
          <div className="col-span-full py-12 text-center">
            <div className="flex flex-col items-center gap-2">
              <p className="font-medium text-lg">Configuración incompleta</p>
              <p className="text-muted-foreground text-sm">
                No se han proporcionado vistas disponibles (tableColumns o
                renderCard)
              </p>
            </div>
          </div>
        ) : viewMode === "table" ? (
          hasTableView ? (
            <DataTable
              data={data}
              columns={tableColumns ?? []}
              paginationState={paginationProps?.state}
              paginationActions={paginationProps?.actions}
              paginationInfo={paginationProps?.info}
              isLoading={isLoading}
              error={error}
              emptyState={emptyState}
              itemName={itemName}
              pageSizeOptions={paginationProps?.pageSizeOptions}
              stickyColumns={stickyColumns}
              stickyHeader={stickyHeader}
            />
          ) : (
            <div className="col-span-full py-12 text-center">
              <div className="flex flex-col items-center gap-2">
                <p className="font-medium text-lg">
                  Vista de tabla no disponible
                </p>
                <p className="text-muted-foreground text-sm">
                  No se han proporcionado columnas para la tabla
                </p>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-4">
            {cardHeader && (
              <div className="flex items-center justify-between rounded-lg border bg-card p-4">
                {cardHeader}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {isLoading ? (
                Array.from({ length: 6 }).map((_: unknown, i: number) => (
                  <div
                    key={`skeleton-card-${i}`}
                    className="rounded-lg border bg-card p-6"
                  >
                    <div className="space-y-4">
                      <div className="h-4 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                ))
              ) : hasError ? (
                <div className="col-span-full py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-destructive">
                      Error al cargar datos
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {error.message || "Ha ocurrido un error inesperado"}
                    </div>
                  </div>
                </div>
              ) : isEmpty ? (
                <div className="col-span-full py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    {emptyState?.icon && (
                      <div className="text-muted-foreground">
                        {emptyState.icon}
                      </div>
                    )}
                    <p className="font-medium text-lg">
                      {emptyState?.title || `No hay ${itemName.plural}`}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {emptyState?.description ||
                        `No hay ${itemName.plural} para mostrar`}
                    </p>
                  </div>
                </div>
              ) : hasCardsView ? (
                data.map((item) => (
                  <div key={item._id}>{renderCard?.(item)}</div>
                ))
              ) : (
                <div className="col-span-full py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="font-medium text-lg">
                      Vista de tarjetas no disponible
                    </p>
                    <p className="text-muted-foreground text-sm">
                      No se ha proporcionado una función para renderizar
                      tarjetas
                    </p>
                  </div>
                </div>
              )}
            </div>
            {/* Pagination Controls for Cards View */}
            {paginationProps && viewMode === "cards" && (
              <PaginationControls
                paginationState={paginationProps.state}
                paginationActions={paginationProps.actions}
                paginationInfo={paginationProps.info}
                pageSizeOptions={paginationProps.pageSizeOptions}
                itemName={itemName}
                currentItemsCount={data.length}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
