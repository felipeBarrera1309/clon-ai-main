import type { Doc } from "@workspace/backend/_generated/dataModel"
import dayjs from "dayjs"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"
import "dayjs/locale/es"

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale("es")

// Constants for day mapping (English Convex -> Spanish UI/Logic)
export const DAYS_SHORT = {
  monday: "Lun",
  tuesday: "Mar",
  wednesday: "Mié",
  thursday: "Jue",
  friday: "Vie",
  saturday: "Sáb",
  sunday: "Dom",
} as const

// Helper to map Dayjs day index (0-6) to our schema keys
// Dayjs: 0=Sunday, 1=Monday...
// Schema: monday, tuesday...
const DAYJS_DAY_TO_SCHEMA = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const

export const DAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const

interface OpenStatus {
  isOpen: boolean
  statusMessage: string
  isSpecialSchedule: boolean
}

export function isLocationOpen(
  location: Doc<"restaurantLocations">,
  date: Date = new Date()
): OpenStatus {
  // Current time in Bogota
  const nowBogota = dayjs(date).tz("America/Bogota")
  const currentDateStr = nowBogota.format("YYYY-MM-DD")

  // Dayjs .day() returns 0 (Sun) to 6 (Sat). Map to schema key.
  const currentDaySchemaKey = DAYJS_DAY_TO_SCHEMA[
    nowBogota.day()
  ] as keyof typeof DAYS_SHORT
  const currentDaySpanish = DAYS_SHORT[currentDaySchemaKey]

  const currentHour = nowBogota.hour()
  const currentMinute = nowBogota.minute()
  const currentTimeMinutes = currentHour * 60 + currentMinute

  // Check for special schedules first (they take priority)
  let isCurrentlyOpen = false
  let isSpecialScheduleActive = false

  if (location.specialSchedules && location.specialSchedules.length > 0) {
    const todaySpecialSchedules = location.specialSchedules.filter(
      (schedule) => schedule.date === currentDateStr
    )

    if (todaySpecialSchedules.length > 0) {
      isSpecialScheduleActive = true
      for (const todaySpecialSchedule of todaySpecialSchedules) {
        if (
          todaySpecialSchedule.ranges &&
          todaySpecialSchedule.ranges.length > 0
        ) {
          for (const range of todaySpecialSchedule.ranges) {
            if (checkRange(range.open, range.close, currentTimeMinutes)) {
              isCurrentlyOpen = true
              break
            }
          }
          if (isCurrentlyOpen) break
        }
      }
    }
  }

  // If no special schedule or special schedule not active, check regular hours
  if (!isSpecialScheduleActive) {
    const todayHours =
      location.openingHours?.filter(
        (hour) => DAYS_SHORT[hour.day] === currentDaySpanish
      ) || []

    isCurrentlyOpen =
      location.available &&
      todayHours.some((hour) => {
        return hour.ranges.some((range) =>
          checkRange(range.open, range.close, currentTimeMinutes)
        )
      })
  }

  let statusMessage = "Cerrado"
  if (isCurrentlyOpen) {
    statusMessage = isSpecialScheduleActive
      ? "Abierto (Especial)"
      : "Abierto ahora"
  }

  return {
    isOpen: isCurrentlyOpen,
    statusMessage,
    isSpecialSchedule: isSpecialScheduleActive,
  }
}

function checkRange(
  openStr: string,
  closeStr: string,
  currentMinutes: number
): boolean {
  const [openH, openM] = openStr.split(":").map(Number)
  const [closeH, closeM] = closeStr.split(":").map(Number)

  if (
    openH === undefined ||
    openM === undefined ||
    closeH === undefined ||
    closeM === undefined
  )
    return false

  const openTime = openH * 60 + openM
  const closeTime = closeH * 60 + closeM

  return currentMinutes >= openTime && currentMinutes <= closeTime
}

function formatTime12h(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number)
  if (h === undefined || m === undefined) return timeStr
  // Use an arbitrary date to format the time
  return dayjs().hour(h).minute(m).format("h:mm a")
}

export function getGroupedHours(location: Doc<"restaurantLocations">) {
  return (
    location.openingHours?.reduce(
      (acc, hour) => {
        const dayKey = hour.day
        if (!acc[dayKey]) {
          acc[dayKey] = []
        }
        if (hour.ranges[0]?.open && hour.ranges[0]?.close) {
          const open12 = formatTime12h(hour.ranges[0].open)
          const close12 = formatTime12h(hour.ranges[0].close)
          acc[dayKey].push(`${open12} - ${close12}`)
        }
        return acc
      },
      {} as Record<string, string[]>
    ) || {}
  )
}

export function getSpecialScheduleInfo(location: Doc<"restaurantLocations">) {
  const todayBogota = dayjs().tz("America/Bogota").format("YYYY-MM-DD")

  return location.specialSchedules &&
    location.specialSchedules.length > 0 &&
    todayBogota
    ? location.specialSchedules
        .filter((schedule) => schedule.date >= todayBogota)
        .map((schedule) => {
          // Parse date purely as YYYY-MM-DD to avoid TZ shifts
          const date = dayjs(schedule.date)
          const formattedDate = date.format("D [de] MMMM") // e.g. 16 de Diciembre

          const hours = schedule.ranges
            .map((range) => {
              const open12 = formatTime12h(range.open)
              const close12 = formatTime12h(range.close)
              return `${open12} - ${close12}`
            })
            .join(", ")
          return `${formattedDate}: ${hours} (Especial)`
        })
    : []
}

export function generateTimeSlots(
  location: Doc<"restaurantLocations">,
  dateStr: string
): string[] {
  // Current time in Bogota
  const nowBogota = dayjs().tz("America/Bogota")

  // Parse the requested date IN BOGOTA context
  // This assumes dateStr is "YYYY-MM-DD"
  const targetDate = dayjs.tz(dateStr, "YYYY-MM-DD", "America/Bogota")

  // Check if target date is today (in Bogota)
  const isToday = nowBogota.isSame(targetDate, "day")

  // Current minutes (Bogota)
  const nowMinutes = nowBogota.hour() * 60 + nowBogota.minute()
  // If today, start slots 30 mins from now
  const minStartMinutes = isToday ? nowMinutes + 30 : 0

  // Get Schedule for targetDate
  const availableRanges: { open: string; close: string }[] = []

  // 1. Special Schedules
  if (location.specialSchedules?.length) {
    const specials = location.specialSchedules.filter((s) => s.date === dateStr)
    if (specials.length > 0) {
      specials.forEach((s) => {
        availableRanges.push(...(s.ranges || []))
      })
    }
  }

  // 2. Regular Hours (Process only if no special schedule found)
  if (availableRanges.length === 0) {
    // Find day of week for the TARGET date
    const daySchemaKey = DAYJS_DAY_TO_SCHEMA[
      targetDate.day()
    ] as keyof typeof DAYS_SHORT
    const daySpanish = DAYS_SHORT[daySchemaKey]

    const regularForDay = location.openingHours?.filter(
      (h) => DAYS_SHORT[h.day] === daySpanish
    )
    regularForDay?.forEach((h) => {
      availableRanges.push(...(h.ranges || []))
    })
  }

  if (availableRanges.length === 0) return []

  const slots: string[] = []

  for (const range of availableRanges) {
    const { open, close } = range
    if (!open || !close) continue

    const [openH, openM] = open.split(":").map(Number)
    const [closeH, closeM] = close.split(":").map(Number)

    if (
      openH === undefined ||
      openM === undefined ||
      closeH === undefined ||
      closeM === undefined
    )
      continue

    let currentIterMinutes = openH * 60 + openM
    const closeIterMinutes = closeH * 60 + closeM

    while (currentIterMinutes <= closeIterMinutes) {
      // Only add slot if it's in the future (relative to buffer)
      if (currentIterMinutes >= minStartMinutes) {
        const h = Math.floor(currentIterMinutes / 60)
        const m = currentIterMinutes % 60

        // Format HH:mm
        const slotStr = `${h.toString().padStart(2, "0")}:${m
          .toString()
          .padStart(2, "0")}`
        if (!slots.includes(slotStr)) slots.push(slotStr)
      }
      currentIterMinutes += 15
    }
  }

  return slots.sort()
}
