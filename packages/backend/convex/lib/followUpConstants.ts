export type FollowUpStep = {
  delayMinutes: number
  messageTemplate: string
}

export const FOLLOW_UP_LIMITS = {
  MAX_STEPS: 10,
  MIN_STEPS: 1,
  MIN_DELAY_MINUTES: 1,
  MAX_DELAY_MINUTES: 1440,
  MAX_MESSAGE_LENGTH: 1000,
} as const

export const DEFAULT_FOLLOW_UP_SEQUENCE: FollowUpStep[] = [
  {
    delayMinutes: 3,
    messageTemplate: "¿Sigues ahí? Estoy listo para tu pedido 😊",
  },
  { delayMinutes: 5, messageTemplate: "¡Sigo aquí! ¿Alguna duda?" },
  {
    delayMinutes: 10,
    messageTemplate:
      "Chat cerrado por ahora. Escríbeme de nuevo cuando quieras, ¡te atiendo enseguida! 😊",
  },
]

export function isValidFollowUpSequence(sequence: FollowUpStep[]): {
  valid: boolean
  error?: string
} {
  if (sequence.length < FOLLOW_UP_LIMITS.MIN_STEPS) {
    return {
      valid: false,
      error: `La secuencia debe tener al menos ${FOLLOW_UP_LIMITS.MIN_STEPS} paso`,
    }
  }

  if (sequence.length > FOLLOW_UP_LIMITS.MAX_STEPS) {
    return {
      valid: false,
      error: `La secuencia no puede tener más de ${FOLLOW_UP_LIMITS.MAX_STEPS} pasos`,
    }
  }

  for (let i = 0; i < sequence.length; i++) {
    const step = sequence[i]!

    if (step.delayMinutes < FOLLOW_UP_LIMITS.MIN_DELAY_MINUTES) {
      return {
        valid: false,
        error: `El paso ${i + 1} debe tener al menos ${FOLLOW_UP_LIMITS.MIN_DELAY_MINUTES} minuto de espera`,
      }
    }

    if (step.delayMinutes > FOLLOW_UP_LIMITS.MAX_DELAY_MINUTES) {
      return {
        valid: false,
        error: `El paso ${i + 1} no puede tener más de ${FOLLOW_UP_LIMITS.MAX_DELAY_MINUTES} minutos (24 horas) de espera`,
      }
    }

    if (i > 0) {
      const prevStep = sequence[i - 1]!
      if (step.delayMinutes <= prevStep.delayMinutes) {
        return {
          valid: false,
          error: `El paso ${i + 1} debe tener un tiempo de espera mayor que el paso anterior`,
        }
      }
    }

    if (!step.messageTemplate.trim()) {
      return { valid: false, error: `El paso ${i + 1} debe tener un mensaje` }
    }

    if (step.messageTemplate.length > FOLLOW_UP_LIMITS.MAX_MESSAGE_LENGTH) {
      return {
        valid: false,
        error: `El mensaje del paso ${i + 1} no puede exceder ${FOLLOW_UP_LIMITS.MAX_MESSAGE_LENGTH} caracteres`,
      }
    }
  }

  return { valid: true }
}
