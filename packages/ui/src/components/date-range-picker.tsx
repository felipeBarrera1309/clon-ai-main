"use client"

import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarIcon, XIcon } from "lucide-react"
import * as React from "react"
import type { DateRange } from "react-day-picker"

export interface DateRangePickerProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  placeholder?: string
  clearable?: boolean
  className?: string
  buttonClassName?: string
  numberOfMonths?: number
  disabled?: boolean
}

export const DateRangePicker = React.forwardRef<
  HTMLButtonElement,
  DateRangePickerProps
>(
  (
    {
      value,
      onChange,
      placeholder = "Selecciona un rango de fechas",
      clearable = false,
      className,
      buttonClassName,
      numberOfMonths = 2,
      disabled = false,
      ...props
    },
    ref
  ) => {
    const [tempDateRange, setTempDateRange] = React.useState<
      DateRange | undefined
    >(value)

    // Update temp range when value changes
    React.useEffect(() => {
      setTempDateRange(value)
    }, [value])

    // Validation for date range - allow same date
    const isValidDateRange =
      !tempDateRange?.from ||
      !tempDateRange?.to ||
      tempDateRange.from.getTime() <= tempDateRange.to.getTime()

    const handleApply = () => {
      // If no dates selected, use default range (last week)
      const rangeToApply =
        tempDateRange?.from && tempDateRange?.to
          ? tempDateRange
          : (() => {
              const date = new Date()
              date.setDate(date.getDate() - 7) // Última semana por defecto
              return {
                from: date,
                to: new Date(),
              }
            })()

      onChange(rangeToApply)
    }

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation()
      onChange(undefined)
      setTempDateRange(undefined)
    }

    const handleClearKeyboard = (e: React.KeyboardEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      onChange(undefined)
      setTempDateRange(undefined)
    }

    return (
      <div className={cn("flex items-center space-x-2", className)}>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              ref={ref}
              variant="outline"
              className={cn(
                "justify-start text-left font-normal",
                !value?.from && "text-muted-foreground",
                disabled && "cursor-not-allowed opacity-50",
                buttonClassName
              )}
              disabled={disabled}
              {...props}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              <span className="flex-1 truncate">
                {value?.from ? (
                  value.to ? (
                    <>
                      {format(value.from, "dd/MM/yyyy", {
                        locale: es,
                      })}{" "}
                      -{" "}
                      {format(value.to, "dd/MM/yyyy", {
                        locale: es,
                      })}
                    </>
                  ) : (
                    format(value.from, "dd/MM/yyyy", {
                      locale: es,
                    })
                  )
                ) : (
                  placeholder
                )}
              </span>
              {clearable && value?.from && (
                <div
                  className="ml-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded hover:bg-muted"
                  onClick={handleClear}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleClearKeyboard(e)
                    }
                  }}
                >
                  <XIcon className="h-3 w-3" />
                </div>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={tempDateRange}
              onSelect={setTempDateRange}
              numberOfMonths={numberOfMonths}
              locale={es}
            />
            <div className="border-t p-3">
              <Button
                onClick={handleApply}
                className="w-full"
                size="sm"
                disabled={!isValidDateRange}
              >
                Aplicar
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {tempDateRange?.from && tempDateRange?.to && !isValidDateRange && (
          <span className="ml-2 text-red-500 text-xs">
            Selecciona fechas válidas
          </span>
        )}
      </div>
    )
  }
)

DateRangePicker.displayName = "DateRangePicker"
