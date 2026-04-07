export type EscalationReasonCategory =
  | "ai_failure"
  | "operator_manual"
  | "operator_media"
  | "manual_dashboard"
  | "dynamic_payment_link"
  | "scheduled_dynamic_payment_link"
  | "custom_other"

const normalize = (value: unknown) => {
  if (typeof value !== "string") return ""
  return value.toLowerCase().trim()
}

export const categorizeEscalationReason = (
  reason: unknown
): EscalationReasonCategory => {
  const normalizedReason = normalize(reason)

  if (
    normalizedReason.includes("todos los intentos del agente") ||
    normalizedReason.includes("fallaron con errores") ||
    normalizedReason.includes("escalación automática")
  ) {
    return "ai_failure"
  }

  if (normalizedReason.includes("operador envió imagen")) {
    return "operator_media"
  }

  if (
    normalizedReason.includes("operador envió mensaje") ||
    normalizedReason.includes("operador respondió directamente")
  ) {
    return "operator_manual"
  }

  if (normalizedReason.includes("escalado manualmente por operador")) {
    return "manual_dashboard"
  }

  if (normalizedReason.includes("pedido programado con dynamic_payment_link")) {
    return "scheduled_dynamic_payment_link"
  }

  if (normalizedReason.includes("pedido con dynamic_payment_link")) {
    return "dynamic_payment_link"
  }

  return "custom_other"
}

export const escalationReasonCategoryLabels: Record<
  EscalationReasonCategory,
  string
> = {
  ai_failure: "Fallo IA",
  operator_manual: "Operador manual",
  operator_media: "Operador media",
  manual_dashboard: "Escalado manual",
  dynamic_payment_link: "Pago dinámico",
  scheduled_dynamic_payment_link: "Pago dinámico programado",
  custom_other: "Otro",
}
