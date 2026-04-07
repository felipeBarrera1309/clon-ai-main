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
import { CalendarIcon, PlusIcon, TrashIcon } from "lucide-react"
import { useState } from "react"

interface SpecialSchedule {
  id: string
  date: string // ISO date string (YYYY-MM-DD)
  ranges: Array<{
    open: string
    close: string
  }>
}

interface SpecialScheduleManagerProps {
  specialSchedules?: SpecialSchedule[]
  onScheduleChange: (specialSchedules: SpecialSchedule[]) => void
}

export const SpecialScheduleManager = ({
  specialSchedules,
  onScheduleChange,
}: SpecialScheduleManagerProps) => {
  const [schedules, setSchedules] = useState<SpecialSchedule[]>(
    specialSchedules || []
  )

  const addTimeSlot = (scheduleId: string) => {
    const newSchedules = schedules.map((schedule) =>
      schedule.id === scheduleId
        ? {
            ...schedule,
            ranges: [...schedule.ranges, { open: "08:00", close: "18:00" }],
          }
        : schedule
    )
    setSchedules(newSchedules)
    onScheduleChange(newSchedules)
  }

  const updateTimeSlot = (
    scheduleId: string,
    slotIndex: number,
    field: "open" | "close",
    value: string
  ) => {
    const newSchedules = schedules.map((schedule) =>
      schedule.id === scheduleId
        ? {
            ...schedule,
            ranges: schedule.ranges.map((range, index) =>
              index === slotIndex ? { ...range, [field]: value } : range
            ),
          }
        : schedule
    )
    setSchedules(newSchedules)
    onScheduleChange(newSchedules)
  }

  const removeTimeSlot = (scheduleId: string, slotIndex: number) => {
    const newSchedules = schedules.map((schedule) =>
      schedule.id === scheduleId
        ? {
            ...schedule,
            ranges: schedule.ranges.filter((_, index) => index !== slotIndex),
          }
        : schedule
    )
    setSchedules(newSchedules)
    onScheduleChange(newSchedules)
  }

  const addSpecialSchedule = () => {
    const newSchedule: SpecialSchedule = {
      id: `special-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: "",
      ranges: [{ open: "08:00", close: "18:00" }],
    }

    const newSchedules = [...schedules, newSchedule]
    setSchedules(newSchedules)
    onScheduleChange(newSchedules)
  }

  const updateSpecialSchedule = (
    scheduleId: string,
    _field: "date",
    value: string
  ) => {
    const newSchedules = schedules.map((schedule) =>
      schedule.id === scheduleId ? { ...schedule, date: value } : schedule
    )
    setSchedules(newSchedules)
    onScheduleChange(newSchedules)
  }

  const removeSpecialSchedule = (scheduleId: string) => {
    const newSchedules = schedules.filter(
      (schedule) => schedule.id !== scheduleId
    )
    setSchedules(newSchedules)
    onScheduleChange(newSchedules)
  }

  const clearSpecialSchedules = () => {
    setSchedules([])
    onScheduleChange([])
  }

  return (
    <Card className="border-2 border-orange-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          Horarios Especiales
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={clearSpecialSchedules}
          >
            Limpiar Horarios Especiales
          </Button>
        </div>

        <div className="space-y-4">
          {schedules.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">
              No hay horarios especiales configurados
            </p>
          ) : (
            schedules.map((schedule) => (
              <div key={schedule.id} className="rounded-lg border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <Label className="font-medium text-base">
                    Fecha Especial
                  </Label>
                  <Button
                    type="button"
                    onClick={() => removeSpecialSchedule(schedule.id)}
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 hover:text-destructive"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="font-medium text-sm">Fecha</Label>
                    <Input
                      type="date"
                      value={schedule.date}
                      onChange={(e) =>
                        updateSpecialSchedule(
                          schedule.id,
                          "date",
                          e.target.value
                        )
                      }
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="font-medium text-sm">Horarios</Label>
                    <div className="mt-2 space-y-2">
                      {schedule.ranges.map((range, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={range.open}
                            onChange={(e) =>
                              updateTimeSlot(
                                schedule.id,
                                index,
                                "open",
                                e.target.value
                              )
                            }
                            className="w-28"
                          />
                          <span className="text-gray-500 text-sm">-</span>
                          <Input
                            type="time"
                            value={range.close}
                            onChange={(e) =>
                              updateTimeSlot(
                                schedule.id,
                                index,
                                "close",
                                e.target.value
                              )
                            }
                            className="w-28"
                          />
                          {schedule.ranges.length > 1 && (
                            <Button
                              type="button"
                              onClick={() => removeTimeSlot(schedule.id, index)}
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 hover:text-destructive"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        onClick={() => addTimeSlot(schedule.id)}
                        size="sm"
                        variant="outline"
                        className="flex items-center gap-1"
                      >
                        <PlusIcon className="h-3 w-3" />
                        Añadir horario
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <Button
          type="button"
          onClick={addSpecialSchedule}
          variant="outline"
          className="flex w-full items-center gap-2"
        >
          <PlusIcon className="h-4 w-4" />
          Agregar Horario Especial
        </Button>
      </CardContent>
    </Card>
  )
}
