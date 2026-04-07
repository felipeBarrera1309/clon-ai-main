"use client"

import { PaginationControls } from "@workspace/ui/components/pagination-controls"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"
import { useLayoutEffect, useRef, useState } from "react"

export interface Column<T> {
  key: string
  header: string | ReactNode
  render: (item: T) => ReactNode
  className?: string
}

export interface PaginationState {
  pageSize: number
  cursor: string | null
  prevCursors: string[]
}

export interface PaginationActions {
  setPageSize: (size: number) => void
  handleNext: () => void
  handlePrev: () => void
  resetPagination: () => void
}

export interface PaginationInfo {
  isDone: boolean
  continueCursor: string | null
  totalItems?: number
}

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  paginationState?: PaginationState
  paginationActions?: PaginationActions
  paginationInfo?: PaginationInfo
  isLoading?: boolean
  error?: Error | null
  emptyState?: {
    icon?: ReactNode
    title: string
    description: string
  }
  itemName: {
    singular: string
    plural: string
  }
  pageSizeOptions?: number[]
  /** Número de columnas a la izquierda que quedan fijas durante scroll horizontal */
  stickyColumns?: number
  /** Si el header debe quedar fijo durante scroll vertical */
  stickyHeader?: boolean
}

export function DataTable<T extends { _id: string }>({
  data,
  columns,
  paginationState,
  paginationActions,
  paginationInfo,
  isLoading = false,
  error = null,
  emptyState,
  itemName,
  pageSizeOptions = [10, 20, 30, 40, 50],
  stickyColumns = 0,
  stickyHeader = true,
}: DataTableProps<T>) {
  const stickyRefs = useRef<(HTMLTableCellElement | null)[]>([])
  const [stickyLefts, setStickyLefts] = useState<number[]>([])

  // Calculate sticky column left positions
  useLayoutEffect(() => {
    const lefts: number[] = []
    let cumulative = 0
    for (let i = 0; i < stickyColumns; i++) {
      const el = stickyRefs.current[i]
      if (el) {
        lefts.push(cumulative)
        cumulative += el.offsetWidth
      } else {
        lefts.push(0)
      }
    }
    setStickyLefts(lefts)
  }, [stickyColumns]) // Recalculate when stickyColumns changes

  const pagination =
    paginationState && paginationActions && paginationInfo
      ? {
          state: paginationState,
          actions: paginationActions,
          info: paginationInfo,
        }
      : null

  const { pageSize, cursor, prevCursors } = paginationState || {
    pageSize: 10,
    cursor: null,
    prevCursors: [],
  }
  const { setPageSize, handleNext, handlePrev } = paginationActions || {
    setPageSize: () => {},
    handleNext: () => {},
    handlePrev: () => {},
    resetPagination: () => {},
  }
  const { isDone, continueCursor } = paginationInfo || {
    isDone: true,
    continueCursor: null,
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader
            className={stickyHeader ? "sticky top-0 z-10 bg-background" : ""}
          >
            <TableRow>
              {columns.map((column, index) => (
                <TableHead
                  key={column.key}
                  ref={(el) => {
                    if (index < stickyColumns) stickyRefs.current[index] = el
                  }}
                  className={cn(
                    column.className,
                    index < stickyColumns ? "sticky z-10 bg-background" : ""
                  )}
                  style={
                    index < stickyColumns
                      ? { left: `${stickyLefts[index] || 0}px` }
                      : undefined
                  }
                >
                  {typeof column.header === "string"
                    ? column.header
                    : column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((column, index) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      column.className,
                      index < stickyColumns ? "sticky z-10 bg-background" : ""
                    )}
                    style={
                      index < stickyColumns
                        ? { left: `${stickyLefts[index] || 0}px` }
                        : undefined
                    }
                  >
                    <div className="h-4 animate-pulse rounded bg-muted" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-2 text-destructive">Error al cargar datos</div>
        <div className="text-muted-foreground text-sm">
          {error.message || "Ha ocurrido un error inesperado"}
        </div>
      </div>
    )
  }

  // Empty state
  if (data.length === 0) {
    if (emptyState) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          {emptyState.icon && (
            <div className="mb-4 text-muted-foreground">{emptyState.icon}</div>
          )}
          <h3 className="mb-2 font-medium text-lg">{emptyState.title}</h3>
          <p className="text-muted-foreground">{emptyState.description}</p>
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-2 text-muted-foreground">
          No hay {itemName.plural} para mostrar
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader
            className={stickyHeader ? "sticky top-0 z-10 bg-background" : ""}
          >
            <TableRow>
              {columns.map((column, index) => (
                <TableHead
                  key={column.key}
                  ref={(el) => {
                    if (index < stickyColumns) stickyRefs.current[index] = el
                  }}
                  className={cn(
                    column.className,
                    index < stickyColumns ? "sticky z-10 bg-background" : ""
                  )}
                  style={
                    index < stickyColumns
                      ? { left: `${stickyLefts[index] || 0}px` }
                      : undefined
                  }
                >
                  {typeof column.header === "string"
                    ? column.header
                    : column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item._id}>
                {columns.map((column, index) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      column.className,
                      index < stickyColumns ? "sticky z-10 bg-background" : ""
                    )}
                    style={
                      index < stickyColumns
                        ? { left: `${stickyLefts[index] || 0}px` }
                        : undefined
                    }
                  >
                    {column.render(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls - Only render if pagination is enabled */}
      {pagination && (
        <PaginationControls
          paginationState={pagination.state}
          paginationActions={pagination.actions}
          paginationInfo={pagination.info}
          pageSizeOptions={pageSizeOptions}
          itemName={itemName}
          currentItemsCount={data.length}
        />
      )}
    </>
  )
}
