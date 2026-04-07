"use client"

import type { Doc } from "@workspace/backend/_generated/dataModel"
import { Badge } from "@workspace/ui/components/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { ClockIcon } from "lucide-react"
import {
  DAY_ORDER,
  DAYS_SHORT,
  getGroupedHours,
  getSpecialScheduleInfo,
  isLocationOpen,
} from "@/lib/schedule-helpers"

interface SchedulePreviewProps {
  location: Doc<"restaurantLocations">
  compact?: boolean
}

export const SchedulePreview = ({
  location,
  compact = false,
}: SchedulePreviewProps) => {
  const { isOpen, statusMessage, isSpecialSchedule } = isLocationOpen(location)
  const groupedHours = getGroupedHours(location)
  const specialScheduleInfo = getSpecialScheduleInfo(location)

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <Badge
                variant={isOpen ? "default" : "secondary"}
                className="text-xs"
              >
                {isOpen ? "Abierto" : "Cerrado"}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="left"
            className="max-w-xs border border-gray-200 bg-white shadow-lg"
            showArrow={false}
          >
            <div className="space-y-2">
              <div>
                <span className="font-medium text-gray-900">
                  {statusMessage}
                </span>
              </div>
              <div className="space-y-1">
                {DAY_ORDER.filter((day) => {
                  const timeRanges = groupedHours[day] || []
                  return timeRanges.length > 0
                }).map((day) => {
                  const timeRanges = groupedHours[day] || []
                  return (
                    <div key={day} className="text-sm">
                      <span className="font-medium text-gray-900">
                        {DAYS_SHORT[day]}
                      </span>
                      <div className="text-gray-600 text-xs">
                        {timeRanges.join(", ")}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className="space-y-3">
      {/* Current Status */}
      <div className="flex items-center gap-2">
        <div
          className={`h-3 w-3 rounded-full ${isOpen ? "bg-primary" : "bg-red-500"}`}
        />
        <span
          className={`font-medium text-sm ${isOpen ? "text-green-700" : "text-red-700"}`}
        >
          {statusMessage}
        </span>
      </div>

      {/* Special Schedules */}
      {specialScheduleInfo.length > 0 && (
        <div className="space-y-1">
          <div className="font-medium text-orange-700 text-sm">
            Horarios Especiales:
          </div>
          {specialScheduleInfo.map((info, index) => (
            <div key={`special-${index}`} className="text-sm">
              <div className="flex items-center gap-2">
                <ClockIcon className="h-4 w-4 text-orange-500" />
                <span className="text-orange-700">{info}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Regular Schedule Details */}
      <div className="space-y-1">
        <div className="font-medium text-muted-foreground text-sm">
          Horario Regular:
        </div>
        {location.openingHours && location.openingHours.length > 0 ? (
          DAY_ORDER.filter((day) => {
            const timeRanges = groupedHours[day] || []
            return timeRanges.length > 0
          }).map((day) => {
            const timeRanges = groupedHours[day] || []
            return (
              <div key={day} className="text-sm">
                <div className="flex items-center gap-2">
                  <ClockIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{DAYS_SHORT[day]}</span>
                </div>
                <div className="ml-6 text-muted-foreground text-xs">
                  {timeRanges.join(", ")}
                </div>
              </div>
            )
          })
        ) : (
          <div className="text-muted-foreground text-sm italic">
            Sin horario configurado
          </div>
        )}
      </div>
    </div>
  )
}
