"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

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

export interface PaginationControlsProps {
  paginationState: PaginationState
  paginationActions: PaginationActions
  paginationInfo: PaginationInfo
  pageSizeOptions?: number[]
  itemName: {
    singular: string
    plural: string
  }
  currentItemsCount: number
}

export function PaginationControls({
  paginationState,
  paginationActions,
  paginationInfo,
  pageSizeOptions = [10, 20, 30, 40, 50],
  itemName,
  currentItemsCount,
}: PaginationControlsProps) {
  const { pageSize, prevCursors } = paginationState
  const { setPageSize, handleNext, handlePrev } = paginationActions
  const { isDone, continueCursor } = paginationInfo

  return (
    <div className="flex flex-wrap items-center justify-between px-2 py-4">
      {/* <div className="flex-1 text-muted-foreground text-sm">
        Mostrando {currentItemsCount}{" "}
        {currentItemsCount === 1 ? itemName.singular : itemName.plural}
      </div> */}
      <div className="flex flex-1 place-content-end items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <Select
            value={pageSize.toString()}
            onValueChange={(value: string) => {
              setPageSize(Number(value))
              paginationActions.resetPagination()
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={handlePrev}
            disabled={prevCursors.length === 0}
          >
            <span className="sr-only">Ir a la página anterior</span>
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={handleNext}
            disabled={isDone || !continueCursor}
          >
            <span className="sr-only">Ir a la página siguiente</span>
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
