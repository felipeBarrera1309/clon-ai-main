"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { ClockIcon, PlusIcon, TrashIcon } from "lucide-react"
import { useState } from "react"

interface OpeningHour {
  id: string
  day:
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday"
  ranges: Array<{
    open: string
    close: string
  }>
}

interface ScheduleManagerProps {
  available: boolean
  openingHours?: OpeningHour[]
  onScheduleChange: (data: {
    available: boolean
    openingHours?: OpeningHour[]
  }) => void
}

const DAYS = [
  { key: "monday" as const, label: "Lunes" },
  { key: "tuesday" as const, label: "Martes" },
  { key: "wednesday" as const, label: "Miércoles" },
  { key: "thursday" as const, label: "Jueves" },
  { key: "friday" as const, label: "Viernes" },
  { key: "saturday" as const, label: "Sábado" },
  { key: "sunday" as const, label: "Domingo" },
]

export const ScheduleManager = ({
  available,
  openingHours,
  onScheduleChange,
}: ScheduleManagerProps) => {
  const [hours, setHours] = useState<OpeningHour[]>(openingHours || [])

  const addTimeSlot = (day: string) => {
    const newSlot: OpeningHour = {
      id: `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      day: day as OpeningHour["day"],
      ranges: [{ open: "08:00", close: "18:00" }],
    }

    const newHours = [...hours, newSlot]
    setHours(newHours)
    onScheduleChange({
      available: available,
      openingHours: newHours.length > 0 ? newHours : undefined,
    })
  }

  const updateTimeSlot = (
    slotId: string,
    field: "open" | "close",
    value: string
  ) => {
    const newHours = hours.map((hour) =>
      hour.id === slotId
        ? {
            ...hour,
            ranges: hour.ranges.map((range, index) =>
              index === 0 ? { ...range, [field]: value } : range
            ),
          }
        : hour
    )
    setHours(newHours)
    onScheduleChange({
      available: available,
      openingHours: newHours.length > 0 ? newHours : undefined,
    })
  }

  const removeTimeSlot = (day: string, slotIndex: number) => {
    // Find all slots for the given day
    const daySlots = hours.filter((hour) => hour.day === day)
    // Get the specific slot to remove
    const slotToRemove = daySlots[slotIndex]

    if (!slotToRemove) return // Safety check

    // Remove the specific slot by its unique ID
    const newHours = hours.filter((hour) => hour.id !== slotToRemove.id)

    setHours(newHours)
    onScheduleChange({
      available: available,
      openingHours: newHours.length > 0 ? newHours : undefined,
    })
  }

  const clearSchedule = () => {
    setHours([])
    onScheduleChange({
      available: available,
      openingHours: undefined,
    })
  }

  const getDaySlots = (day: string) => {
    return hours.filter((hour) => hour.day === day)
  }

  return (
    <Card className="border-2 border-blue-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClockIcon className="h-5 w-5" />
          Horario de Atención
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-end">
          <Button type="button" variant="outline" onClick={clearSchedule}>
            Limpiar Horario
          </Button>
        </div>

        <div className="space-y-6">
          {DAYS.map((day) => {
            const daySlots = getDaySlots(day.key)

            return (
              <div key={day.key} className="rounded-lg border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <Label className="font-medium text-base">{day.label}</Label>
                  <Button
                    type="button"
                    onClick={() => addTimeSlot(day.key)}
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-1"
                  >
                    <PlusIcon className="h-3 w-3" />
                    Añadir horario
                  </Button>
                </div>

                {daySlots.length === 0 ? (
                  <p className="text-muted-foreground text-sm italic">
                    Sin horarios configurados
                  </p>
                ) : (
                  <div className="space-y-2">
                    {daySlots.map((slot, index) => (
                      <div
                        key={`${slot.day}-${index}`}
                        className="flex items-center gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={slot.ranges[0]?.open || ""}
                            onChange={(e) =>
                              updateTimeSlot(slot.id, "open", e.target.value)
                            }
                            className="w-28"
                          />
                          <span className="text-gray-500 text-sm">-</span>
                          <Input
                            type="time"
                            value={slot.ranges[0]?.close || ""}
                            onChange={(e) =>
                              updateTimeSlot(slot.id, "close", e.target.value)
                            }
                            className="w-28"
                          />
                        </div>
                        <Button
                          type="button"
                          onClick={() => removeTimeSlot(slot.day, index)}
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 hover:text-destructive"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
