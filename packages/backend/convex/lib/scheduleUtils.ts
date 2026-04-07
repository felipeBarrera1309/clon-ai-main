import type { Doc } from "../_generated/dataModel"
import { BadRequestError } from "./errors"

/**
 * Get the current time in a specific timezone
 */
function getCurrentTimeInTimezone(timezone: string): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: timezone }))
}

export interface OpeningHour {
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
  id: string
}

export interface ScheduleValidationResult {
  isOpen: boolean
  nextOpenTime?: Date
  message: string
}

/**
 * Get the day of the week in English format
 */
function getDayOfWeek(date: Date): string {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] as const

  const dayIndex = date.getDay()
  const day = days[dayIndex]
  if (!day) {
    throw new BadRequestError(`Invalid day index: ${dayIndex}`)
  }
  return day
}

/**
 * Parse time string in HH:mm format to minutes since midnight
 */
function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":")
  if (parts.length !== 2) {
    throw new BadRequestError(
      `Formato de tiempo inválido: ${timeStr}. Formato esperado: HH:mm.`
    )
  }

  const hours = Number(parts[0])
  const minutes = Number(parts[1])

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    throw new BadRequestError(
      `Formato de tiempo inválido: ${timeStr}. Valores numéricos esperados.`
    )
  }

  return hours * 60 + minutes
}

/**
 * Check if a restaurant location is currently open
 */
export function isRestaurantOpen(
  location: Doc<"restaurantLocations">,
  checkTime: Date = getCurrentTimeInTimezone("America/Bogota")
): ScheduleValidationResult {
  // If isOpen is false, restaurant is closed
  if (!location.available) {
    return {
      isOpen: false,
      message: "Restaurante cerrado",
    }
  }

  const currentTime = checkTime
  const currentDateStr = currentTime.toISOString().split("T")[0]! // YYYY-MM-DD format

  // Check for special schedules first (they take priority)
  if (location.specialSchedules && location.specialSchedules.length > 0) {
    // Check ALL special schedules for today (there might be multiple entries for the same date)
    const todaySpecialSchedules = location.specialSchedules.filter(
      (schedule) => schedule.date === currentDateStr
    )

    if (todaySpecialSchedules.length > 0) {
      const currentMinutes = parseTimeToMinutes(
        currentTime.toTimeString().slice(0, 5)
      )

      // Check each special schedule entry for today
      for (const todaySpecialSchedule of todaySpecialSchedules) {
        if (
          todaySpecialSchedule.ranges &&
          todaySpecialSchedule.ranges.length > 0
        ) {
          // Check if current time falls within any range of this special schedule
          for (const range of todaySpecialSchedule.ranges) {
            const openMinutes = parseTimeToMinutes(range.open)
            const closeMinutes = parseTimeToMinutes(range.close)

            if (
              currentMinutes >= openMinutes &&
              currentMinutes <= closeMinutes
            ) {
              return {
                isOpen: true, // Special schedule overrides general availability
                message: `Abierto hasta ${range.close} (horario especial)`,
              }
            }
          }
        }
      }

      // If we have special schedules for today but current time is not within any range, restaurant is closed
      // But we should still show when the special schedule opens
      const nextSpecialTime = findNextSpecialScheduleTime(
        location,
        currentTime,
        currentDateStr
      )
      if (nextSpecialTime) {
        return {
          isOpen: false,
          nextOpenTime: nextSpecialTime,
          message: `Cerrado - horario especial abre ${formatNextOpenTime(nextSpecialTime, checkTime)}`,
        }
      }

      return {
        isOpen: false,
        message: "Cerrado - horario especial no activo",
      }
    }
  }

  // Fall back to regular opening hours
  if (!location.openingHours || location.openingHours.length === 0) {
    return {
      isOpen: false,
      message: "Restaurante cerrado",
    }
  }

  const dayOfWeek = getDayOfWeek(currentTime)

  // Find opening hours for today
  const todayHours = location.openingHours.filter(
    (hour) => hour.day === dayOfWeek
  )

  const currentMinutes = parseTimeToMinutes(
    currentTime.toTimeString().slice(0, 5)
  )

  // Check if current time falls within any open period
  for (const period of todayHours) {
    if (!period.ranges || period.ranges.length === 0) {
      continue
    }

    const firstRange = period.ranges[0]
    if (!firstRange) {
      continue
    }

    const openMinutes = parseTimeToMinutes(firstRange.open)
    const closeMinutes = parseTimeToMinutes(firstRange.close)

    if (currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
      return {
        isOpen: true,
        message: `Abierto hasta ${firstRange.close}`,
      }
    }
  }

  // Find next opening time
  const nextOpenTime = findNextOpeningTime(location, currentTime)
  const message = nextOpenTime
    ? `Cerrado - abre ${formatNextOpenTime(nextOpenTime, currentTime)}`
    : "Cerrado - sin horario disponible"

  return {
    isOpen: false,
    nextOpenTime: nextOpenTime || undefined,
    message,
  }
}

/**
 * Find the next special schedule opening time for today
 */
function findNextSpecialScheduleTime(
  location: Doc<"restaurantLocations">,
  fromTime: Date,
  dateStr: string
): Date | null {
  if (!location.specialSchedules || location.specialSchedules.length === 0) {
    return null
  }

  const todaySpecialSchedules = location.specialSchedules.filter(
    (schedule) => schedule.date === dateStr
  )

  if (todaySpecialSchedules.length === 0) {
    return null
  }

  const currentMinutes = parseTimeToMinutes(fromTime.toTimeString().slice(0, 5))
  let earliestFutureTime: number | null = null

  for (const specialSchedule of todaySpecialSchedules) {
    if (specialSchedule.ranges && specialSchedule.ranges.length > 0) {
      for (const range of specialSchedule.ranges) {
        const openMinutes = parseTimeToMinutes(range.open)
        if (
          openMinutes > currentMinutes &&
          (earliestFutureTime === null || openMinutes < earliestFutureTime)
        ) {
          earliestFutureTime = openMinutes
        }
      }
    }
  }

  if (earliestFutureTime !== null) {
    const nextTime = new Date(fromTime)
    nextTime.setHours(
      Math.floor(earliestFutureTime / 60),
      earliestFutureTime % 60,
      0,
      0
    )
    return nextTime
  }

  return null
}

/**
 * Find the next opening time from the current moment, considering special schedules
 */
function findNextOpeningTime(
  location: Doc<"restaurantLocations">,
  fromTime: Date
): Date | null {
  const days = [
    "sunday", // 0
    "monday", // 1
    "tuesday", // 2
    "wednesday", // 3
    "thursday", // 4
    "friday", // 5
    "saturday", // 6
  ] as const

  const currentDayIndex = fromTime.getDay()
  const currentMinutes = parseTimeToMinutes(fromTime.toTimeString().slice(0, 5))
  const currentDateStr = fromTime.toISOString().split("T")[0] // YYYY-MM-DD format

  // First, check for special schedules today that are later than current time
  if (location.specialSchedules && location.specialSchedules.length > 0) {
    const todaySpecialSchedules = location.specialSchedules.filter(
      (schedule) => schedule.date === currentDateStr
    )

    if (todaySpecialSchedules.length > 0) {
      // Collect all future opening times from special schedules today
      const futureSpecialTimes: number[] = []

      for (const specialSchedule of todaySpecialSchedules) {
        if (specialSchedule.ranges && specialSchedule.ranges.length > 0) {
          for (const range of specialSchedule.ranges) {
            const openMinutes = parseTimeToMinutes(range.open)
            if (openMinutes > currentMinutes) {
              futureSpecialTimes.push(openMinutes)
            }
          }
        }
      }

      // Return the earliest future special schedule time
      if (futureSpecialTimes.length > 0) {
        const earliestTime = Math.min(...futureSpecialTimes)
        const nextTime = new Date(fromTime)
        nextTime.setHours(
          Math.floor(earliestTime / 60),
          earliestTime % 60,
          0,
          0
        )
        return nextTime
      }
    }
  }

  // Check remaining regular hours today
  const currentDay = days[currentDayIndex]
  if (!currentDay) {
    throw new BadRequestError(`Índice de día inválido: ${currentDayIndex}`)
  }
  const todayHours =
    location.openingHours?.filter((hour) => hour.day === currentDay) || []

  if (todayHours.length > 0) {
    for (const period of todayHours) {
      if (!period.ranges || period.ranges.length === 0) {
        continue
      }

      const firstRange = period.ranges[0]
      if (!firstRange) {
        continue
      }

      const openMinutes = parseTimeToMinutes(firstRange.open)
      if (openMinutes > currentMinutes) {
        const nextTime = new Date(fromTime)
        nextTime.setHours(Math.floor(openMinutes / 60), openMinutes % 60, 0, 0)
        return nextTime
      }
    }
  }

  // Check next 7 days for opening times (regular or special schedules)
  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const checkDate = new Date(fromTime)
    checkDate.setDate(fromTime.getDate() + dayOffset)
    const checkDateStr = checkDate.toISOString().split("T")[0] // YYYY-MM-DD format
    const checkDayIndex = checkDate.getDay()
    const checkDay = days[checkDayIndex]
    if (!checkDay) {
      throw new BadRequestError(`Índice de día inválido: ${checkDayIndex}`)
    }

    // First check for special schedules on this future date
    if (location.specialSchedules && location.specialSchedules.length > 0) {
      const dateSpecialSchedules = location.specialSchedules.filter(
        (schedule) => schedule.date === checkDateStr
      )

      if (dateSpecialSchedules.length > 0) {
        // Find the earliest opening time from special schedules
        let earliestOpenMinutes: number | null = null

        for (const specialSchedule of dateSpecialSchedules) {
          if (specialSchedule.ranges && specialSchedule.ranges.length > 0) {
            for (const range of specialSchedule.ranges) {
              const openMinutes = parseTimeToMinutes(range.open)
              if (
                earliestOpenMinutes === null ||
                openMinutes < earliestOpenMinutes
              ) {
                earliestOpenMinutes = openMinutes
              }
            }
          }
        }

        if (earliestOpenMinutes !== null) {
          const nextTime = new Date(checkDate)
          nextTime.setHours(
            Math.floor(earliestOpenMinutes / 60),
            earliestOpenMinutes % 60,
            0,
            0
          )
          return nextTime
        }
      }
    }

    // Fall back to regular opening hours for this day
    const checkDayHours =
      location.openingHours?.filter((hour) => hour.day === checkDay) || []

    if (checkDayHours.length > 0) {
      const firstOpenPeriod = checkDayHours[0]
      if (
        !firstOpenPeriod ||
        !firstOpenPeriod.ranges ||
        firstOpenPeriod.ranges.length === 0
      ) {
        continue
      }

      const firstRange = firstOpenPeriod.ranges[0]
      if (!firstRange) {
        continue
      }

      const openMinutes = parseTimeToMinutes(firstRange.open)
      const nextTime = new Date(checkDate)
      nextTime.setHours(Math.floor(openMinutes / 60), openMinutes % 60, 0, 0)
      return nextTime
    }
  }

  return null
}

/**
 * Check if a restaurant is open at a specific timestamp, considering special schedules for that date
 */
export function isRestaurantOpenAtTime(
  location: Doc<"restaurantLocations">,
  checkTime: Date
): ScheduleValidationResult {
  // If isOpen is false, restaurant is closed
  if (!location.available) {
    return {
      isOpen: false,
      message: "Restaurante cerrado",
    }
  }

  const currentDateStr = checkTime.toISOString().split("T")[0]! // YYYY-MM-DD format

  // Check for special schedules first (they take priority)
  if (location.specialSchedules && location.specialSchedules.length > 0) {
    // Check ALL special schedules for the specific date (there might be multiple entries for the same date)
    const dateSpecialSchedules = location.specialSchedules.filter(
      (schedule) => schedule.date === currentDateStr
    )

    if (dateSpecialSchedules.length > 0) {
      const currentMinutes = parseTimeToMinutes(
        checkTime.toTimeString().slice(0, 5)
      )

      // Check each special schedule entry for this date
      for (const dateSpecialSchedule of dateSpecialSchedules) {
        if (
          dateSpecialSchedule.ranges &&
          dateSpecialSchedule.ranges.length > 0
        ) {
          // Check if current time falls within any range of this special schedule
          for (const range of dateSpecialSchedule.ranges) {
            const openMinutes = parseTimeToMinutes(range.open)
            const closeMinutes = parseTimeToMinutes(range.close)

            if (
              currentMinutes >= openMinutes &&
              currentMinutes <= closeMinutes
            ) {
              return {
                isOpen: true, // Special schedule overrides general availability
                message: `Abierto hasta ${range.close} (horario especial)`,
              }
            }
          }
        }
      }

      // If we have special schedules for this date but current time is not within any range, restaurant is closed
      // This means the scheduled time is outside the special schedule hours
      // But we should still show when the special schedule opens/closes
      const nextSpecialTime = findNextSpecialScheduleTime(
        location,
        checkTime,
        currentDateStr
      )
      if (nextSpecialTime) {
        return {
          isOpen: false,
          nextOpenTime: nextSpecialTime,
          message: `Cerrado - horario especial abre ${formatNextOpenTime(nextSpecialTime, checkTime)}`,
        }
      }

      return {
        isOpen: false,
        message: "Cerrado - horario especial no activo",
      }
    }
  }

  // Fall back to regular opening hours
  if (!location.openingHours || location.openingHours.length === 0) {
    return {
      isOpen: false,
      message: "Restaurante cerrado",
    }
  }

  const dayOfWeek = getDayOfWeek(checkTime)

  // Find opening hours for the specific day
  const dayHours = location.openingHours.filter(
    (hour) => hour.day === dayOfWeek
  )

  const currentMinutes = parseTimeToMinutes(
    checkTime.toTimeString().slice(0, 5)
  )

  // Check if current time falls within any open period
  for (const period of dayHours) {
    if (!period.ranges || period.ranges.length === 0) {
      continue
    }

    const firstRange = period.ranges[0]
    if (!firstRange) {
      continue
    }

    const openMinutes = parseTimeToMinutes(firstRange.open)
    const closeMinutes = parseTimeToMinutes(firstRange.close)

    if (currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
      return {
        isOpen: true,
        message: `Abierto hasta ${firstRange.close}`,
      }
    }
  }

  // If we reach here, the time is outside both special schedules (if any) and regular hours
  // Find next opening time
  const nextOpenTime = findNextOpeningTime(location, checkTime)
  const message = nextOpenTime
    ? `Cerrado - abre ${formatNextOpenTime(nextOpenTime, checkTime)}`
    : "Cerrado - sin horario disponible"

  return {
    isOpen: false,
    nextOpenTime: nextOpenTime || undefined,
    message,
  }
}

/**
 * Validate if an order can be placed at the scheduled time
 */
export function validateScheduledOrderTime(
  location: Doc<"restaurantLocations">,
  scheduledTime: number
): ScheduleValidationResult {
  // Convert UTC timestamp to Colombian time for validation
  // Colombia is UTC-5, so Colombian time = UTC time - 5 hours
  const colombianTime = new Date(scheduledTime - 5 * 60 * 60 * 1000)

  // First check if the restaurant is open at the scheduled time
  const availability = isRestaurantOpenAtTime(location, colombianTime)

  // If it's open, return the result
  if (availability.isOpen) {
    return availability
  }

  // If it's not open, we need to check if the scheduled time is within the maximum closing time for that date
  // This allows scheduling orders even if the restaurant is currently closed, as long as it's within the day's operating hours
  const scheduledDateStr = colombianTime.toISOString().split("T")[0]!
  const maxClosingTime = getMaxClosingTimeForDate(location, scheduledDateStr)

  if (maxClosingTime) {
    const scheduledMinutes = parseTimeToMinutes(
      colombianTime.toTimeString().slice(0, 5)
    )
    const maxCloseMinutes = parseTimeToMinutes(maxClosingTime)

    // If the scheduled time is before or at the maximum closing time, allow the order
    if (scheduledMinutes <= maxCloseMinutes) {
      return {
        isOpen: true,
        message: `Pedido programado válido - horario de cierre máximo: ${maxClosingTime}`,
      }
    }
  }

  // If we reach here, the scheduled time is outside all operating hours
  return availability
}

/**
 * Get today's opening hours for a location
 */
export function getTodaySchedule(location: Doc<"restaurantLocations">): {
  isOpen: boolean
  periods: Array<{
    open: string
    close: string
    isOpen: boolean
  }>
  message: string
  isSpecialSchedule?: boolean
} {
  const currentTime = getCurrentTimeInTimezone("America/Bogota")
  const currentDateStr = currentTime.toISOString().split("T")[0] // YYYY-MM-DD format
  const dayOfWeek = getDayOfWeek(currentTime)

  // Check for special schedules first
  if (location.specialSchedules && location.specialSchedules.length > 0) {
    // Check ALL special schedules for today (there might be multiple entries for the same date)
    const todaySpecialSchedules = location.specialSchedules.filter(
      (schedule) => schedule.date === currentDateStr
    )

    if (todaySpecialSchedules.length > 0) {
      // Combine all ranges from all special schedules for today
      const allRanges: Array<{ open: string; close: string }> = []
      todaySpecialSchedules.forEach((schedule) => {
        if (schedule.ranges && schedule.ranges.length > 0) {
          allRanges.push(...schedule.ranges)
        }
      })

      if (allRanges.length > 0) {
        return {
          isOpen: location.available,
          periods: allRanges.map((range) => ({
            open: range.open,
            close: range.close,
            isOpen: true,
          })),
          message: location.available
            ? "Horario especial activo"
            : "Restaurante cerrado",
          isSpecialSchedule: true,
        }
      }
    }
  }

  // Fall back to regular opening hours
  const todayHours =
    location.openingHours?.filter((hour) => hour.day === dayOfWeek) || []

  return {
    isOpen: location.available && todayHours.length > 0,
    periods: todayHours
      .filter((hour) => hour.ranges && hour.ranges.length > 0)
      .map((hour) => {
        const firstRange = hour.ranges[0]
        if (!firstRange) {
          throw new BadRequestError("Datos de rango inválidos")
        }
        return {
          open: firstRange.open,
          close: firstRange.close,
          isOpen: true,
        }
      }),
    message: location.available
      ? todayHours.length > 0
        ? "Horario configurado"
        : "Sin horario configurado"
      : "Restaurante cerrado",
    isSpecialSchedule: false,
  }
}

/**
 * Get the maximum closing time for a specific date, considering special schedules
 */
export function getMaxClosingTimeForDate(
  location: Doc<"restaurantLocations">,
  dateStr: string
): string | null {
  // Check for special schedules first
  if (location.specialSchedules && location.specialSchedules.length > 0) {
    const dateSpecialSchedules = location.specialSchedules.filter(
      (schedule) => schedule.date === dateStr
    )

    if (dateSpecialSchedules.length > 0) {
      let maxCloseTime: string | null = null
      let maxCloseMinutes = -1

      for (const specialSchedule of dateSpecialSchedules) {
        if (specialSchedule.ranges && specialSchedule.ranges.length > 0) {
          for (const range of specialSchedule.ranges) {
            const closeMinutes = parseTimeToMinutes(range.close)
            if (closeMinutes > maxCloseMinutes) {
              maxCloseMinutes = closeMinutes
              maxCloseTime = range.close
            }
          }
        }
      }

      if (maxCloseTime) {
        return maxCloseTime
      }
    }
  }

  // Fall back to regular opening hours
  if (!location.openingHours || location.openingHours.length === 0) {
    return null
  }

  const date = new Date(dateStr + "T00:00:00")
  const dayOfWeek = getDayOfWeek(date)

  const dayHours = location.openingHours.filter(
    (hour) => hour.day === dayOfWeek
  )

  if (dayHours.length === 0) {
    return null
  }

  let maxCloseTime: string | null = null
  let maxCloseMinutes = -1

  for (const period of dayHours) {
    if (!period.ranges || period.ranges.length === 0) {
      continue
    }

    for (const range of period.ranges) {
      const closeMinutes = parseTimeToMinutes(range.close)
      if (closeMinutes > maxCloseMinutes) {
        maxCloseMinutes = closeMinutes
        maxCloseTime = range.close
      }
    }
  }

  return maxCloseTime
}

/**
 * Helper to convert 24h time to 12h AM/PM format
 */
export function convertTo12Hour(time24: string): string {
  const [hoursStr, minutesStr] = time24.split(":")
  const hours = parseInt(hoursStr || "0", 10)
  const minutes = minutesStr || "00"

  if (hours === 0) {
    return `12:${minutes} AM`
  } else if (hours < 12) {
    return `${hours}:${minutes} AM`
  } else if (hours === 12) {
    return `12:${minutes} PM`
  } else {
    return `${hours - 12}:${minutes} PM`
  }
}

/**
 * Helper to format weekly schedule in a readable format
 */
export function formatWeeklySchedule(
  weeklySchedule: Array<{
    day: string
    ranges: Array<{ open: string; close: string }>
  }>
): string {
  if (!weeklySchedule || weeklySchedule.length === 0) {
    return "No hay horarios configurados"
  }

  const dayNames: Record<string, string> = {
    monday: "Lunes",
    tuesday: "Martes",
    wednesday: "Miércoles",
    thursday: "Jueves",
    friday: "Viernes",
    saturday: "Sábado",
    sunday: "Domingo",
  }

  const dayOrder = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]

  // Group ranges by day to avoid duplicates when a day has multiple schedule entries
  const groupedByDay = new Map<string, Array<{ open: string; close: string }>>()

  weeklySchedule.forEach((schedule) => {
    if (!groupedByDay.has(schedule.day)) {
      groupedByDay.set(schedule.day, [])
    }
    if (schedule.ranges && schedule.ranges.length > 0) {
      groupedByDay.get(schedule.day)!.push(...schedule.ranges)
    }
  })

  // Sort by day order and format
  return dayOrder
    .filter((day) => groupedByDay.has(day))
    .map((day) => {
      const dayName = dayNames[day] || day
      const ranges = groupedByDay.get(day)!

      if (ranges.length > 0) {
        const hours = ranges
          .map(
            (range) =>
              `${convertTo12Hour(range.open)} - ${convertTo12Hour(range.close)}`
          )
          .join(", ")
        return `${dayName}: ${hours}`
      }
      return `${dayName}: Cerrado`
    })
    .join("\n")
}

/**
 * Helper to build the standard closed branch schedule message
 */
export function buildClosedScheduleMessage(
  nextOpenTimeStr?: string,
  weeklySchedule?: Array<{
    day: string
    ranges: Array<{ open: string; close: string }>
  }>
): string {
  if (nextOpenTimeStr) {
    return `⏰ Abrimos ${nextOpenTimeStr}.\n\nPuedes hacer tu pedido programado y lo prepararemos cuando abramos (o indícanos cuando quieres que lo preparemos). 😊`
  } else {
    const weeklyScheduleText = formatWeeklySchedule(weeklySchedule || [])
    return `⏰ *Nuestros horarios:*\n${weeklyScheduleText}\n\nPuedes hacer tu pedido programado y lo prepararemos cuando abramos (o indícanos cuando quieres que lo preparemos). 😊`
  }
}

/**
 * Helper to format the next open time consistently using the Colombian locale.
 * Returns a conversational string like "hoy a las 05:00 p. m." or "lunes a las 05:00 p. m."
 */
export function formatNextOpenTime(nextOpen: Date, currentTime: Date): string {
  const isToday =
    nextOpen.toLocaleDateString("es-CO") ===
    currentTime.toLocaleDateString("es-CO")

  const timeStr = nextOpen.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  })

  if (isToday) {
    return `hoy a las ${timeStr}`
  }

  const tomorrow = new Date(currentTime)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow =
    nextOpen.toLocaleDateString("es-CO") ===
    tomorrow.toLocaleDateString("es-CO")

  if (isTomorrow) {
    return `mañana a las ${timeStr}`
  }

  const dayName = nextOpen.toLocaleDateString("es-CO", {
    weekday: "long",
  })
  return `el ${dayName} a las ${timeStr}`
}
