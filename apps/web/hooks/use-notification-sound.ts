import { useEffect, useRef } from "react"

export type NotificationType = "order" | "escalation"

const SOUND_FILES: Record<NotificationType, string> = {
  order: "/notification.mp3",
  escalation: "/escalation.mp3",
}

export const useNotificationSound = () => {
  const audioRefs = useRef<Record<NotificationType, HTMLAudioElement>>({
    order: new Audio(SOUND_FILES.order),
    escalation: new Audio(SOUND_FILES.escalation),
  })

  useEffect(() => {
    const audios = audioRefs.current
    Object.values(audios).forEach((audio) => {
      audio.volume = 1.0
      audio.load()
    })

    return () => {
      Object.values(audios).forEach((audio) => {
        audio.pause()
        audio.currentTime = 0
      })
    }
  }, [])

  const playSound = (type: NotificationType) => {
    const audio = audioRefs.current[type]
    if (audio) {
      audio.currentTime = 0
      audio.play().catch(() => {
        // Silently fail if autoplay is blocked
      })
    }
  }

  return { playSound }
}
