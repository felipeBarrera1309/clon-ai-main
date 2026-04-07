import { format, isToday, isYesterday } from "date-fns"
import { es } from "date-fns/locale"

/**
 * Date and time utilities for Colombian locale formatting
 */

/**
 * Formats a timestamp as a Colombian date string for orders
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date string (e.g., "6 OCT. 2025")
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const day = date.getDate()
  const month = date
    .toLocaleDateString("es-CO", { month: "short" })
    .toLowerCase()
  const year = date.getFullYear()

  return `${day} ${month} ${year}`
}

/**
 * Formats a timestamp as a Colombian time string for orders
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted time string (e.g., "8:54a.m")
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "p.m" : "a.m"
  const displayHours = hours % 12 || 12

  return `${displayHours}:${minutes}${ampm}`
}

/**
 * Formats a timestamp as Colombian date and time in the expected format
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date and time string (e.g., "6 OCT 2025 8:54a.m")
 */
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  const day = date.getDate()
  const month = date
    .toLocaleDateString("es-CO", { month: "short" })
    .toUpperCase()
  const year = date.getFullYear()
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "p.m" : "a.m"
  const displayHours = hours % 12 || 12

  return `${day} ${month} ${year} ${displayHours}:${minutes}${ampm}`
}

/**
 * Formats a timestamp as a relative time string in Spanish
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Relative time string (e.g., "hace 2 horas", "ayer", "hoy")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (minutes < 1) return "ahora mismo"
  if (minutes < 60)
    return `hace ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`
  if (hours < 24) return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`
  if (days === 1) return "ayer"
  if (days < 7) return `hace ${days} días`
  if (days < 30) return `hace ${Math.floor(days / 7)} semanas`
  if (days < 365) return `hace ${Math.floor(days / 30)} meses`
  return `hace ${Math.floor(days / 365)} años`
}

export function formatExactTime(date: number): string {
  if (isToday(date))
    return format(date, "h:mm a", {
      locale: es,
    })
  if (isYesterday(date)) return "Ayer"
  return format(date, "dd/MM/yyyy", {
    locale: es,
  })
}
