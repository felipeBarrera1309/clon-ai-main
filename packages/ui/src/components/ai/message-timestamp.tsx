import { cn } from "@workspace/ui/lib/utils"

export type MessageTimestampProps = {
  timestamp: number // Unix timestamp in milliseconds
  className?: string
}

/**
 * Componente para mostrar la hora de un mensaje estilo WhatsApp
 * Formatea el timestamp como HH:MM (ej: "14:30")
 */
export const MessageTimestamp = ({
  timestamp,
  className,
}: MessageTimestampProps) => {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)

    // Formatear como HH:MM en zona horaria local con formato 12 horas
    const hours = date.getHours()
    const minutes = date.getMinutes().toString().padStart(2, "0")
    const ampm = hours >= 12 ? "PM" : "AM"
    const displayHours = hours % 12 || 12

    return `${displayHours}:${minutes} ${ampm}`
  }

  return (
    <div
      className={cn(
        "pb-1 text-[6px] leading-none",
        "opacity-60", // Siempre visible pero sutil como en WhatsApp
        className
      )}
    >
      {formatTime(timestamp)}
    </div>
  )
}
