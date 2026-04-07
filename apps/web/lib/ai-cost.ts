import { format } from "date-fns"
import { es } from "date-fns/locale"
import type { DateRange } from "react-day-picker"

type ConversationCostThreadPurpose =
  | "support-agent"
  | "menu-context"
  | "combination-enrichment"
  | "combination-validation"
  | "debug-agent"
  | "combo-builder"
  | "unknown"

export const AI_COST_REPORTING_TIMEZONE = "America/Bogota"
const AI_COST_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const bogotaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: AI_COST_REPORTING_TIMEZONE,
  year: "numeric",
})

function formatDateParts(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`
}

function parseDateString(date: string) {
  const [yearRaw, monthRaw, dayRaw] = date.split("-")
  const year = Number.parseInt(yearRaw ?? "", 10)
  const month = Number.parseInt(monthRaw ?? "", 10)
  const day = Number.parseInt(dayRaw ?? "", 10)

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new Error(`Invalid AI cost date: ${date}`)
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid AI cost date: ${date}`)
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day))
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() + 1 !== month ||
    utcDate.getUTCDate() !== day
  ) {
    throw new Error(`Invalid AI cost date: ${date}`)
  }

  return { day, month, year }
}

function isValidDatePart(date: string) {
  if (!AI_COST_DATE_REGEX.test(date)) {
    return false
  }

  try {
    const parsed = parseDateString(date)
    return formatDateParts(parsed.year, parsed.month, parsed.day) === date
  } catch {
    return false
  }
}

function addDaysToDateString(date: string, days: number) {
  const { day, month, year } = parseDateString(date)
  const utcDate = new Date(Date.UTC(year, month - 1, day))
  utcDate.setUTCDate(utcDate.getUTCDate() + days)

  return formatDateParts(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate()
  )
}

function createCalendarDate(date: string) {
  const { day, month, year } = parseDateString(date)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

function formatCalendarDate(date: Date) {
  return formatDateParts(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  )
}

export function getCurrentAiCostDateString(now: Date = new Date()) {
  const parts = bogotaDateFormatter.formatToParts(now)
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value

  if (!year || !month || !day) {
    throw new Error("Unable to derive current Bogota date")
  }

  return `${year}-${month}-${day}`
}

export function formatAiCost(amount: number) {
  if (!Number.isFinite(amount)) {
    return "US$0"
  }

  const absoluteAmount = Math.abs(amount)
  const fractionDigits =
    absoluteAmount === 0
      ? { maximumFractionDigits: 0, minimumFractionDigits: 0 }
      : absoluteAmount < 0.01
        ? { maximumFractionDigits: 6, minimumFractionDigits: 4 }
        : absoluteAmount < 1
          ? { maximumFractionDigits: 4, minimumFractionDigits: 2 }
          : { maximumFractionDigits: 2, minimumFractionDigits: 2 }

  const formatted = amount.toLocaleString("en-US", fractionDigits)

  return `US$${formatted}`
}

export function formatTokenCount(value?: number) {
  if (!value) {
    return "0"
  }

  return value.toLocaleString("en-US")
}

export function getConversationThreadPurposeLabel(
  purpose: ConversationCostThreadPurpose
) {
  switch (purpose) {
    case "support-agent":
      return "Agente principal"
    case "menu-context":
      return "Contexto de menu"
    case "combination-enrichment":
      return "Enriquecimiento"
    case "combination-validation":
      return "Validacion"
    case "debug-agent":
      return "Debug agent"
    case "combo-builder":
      return "Combo builder"
    case "unknown":
      return "Sin clasificar"
    default:
      return purpose
  }
}

export function getConversationRoleLabel(role: string) {
  switch (role) {
    case "assistant":
      return "Asistente"
    case "user":
      return "Usuario"
    case "tool":
      return "Tool"
    case "system":
      return "Sistema"
    default:
      return role
  }
}

export function createDefaultAiCostDateRange(): DateRange {
  const to = getCurrentAiCostDateString()
  return {
    from: createCalendarDate(addDaysToDateString(to, -29)),
    to: createCalendarDate(to),
  }
}

export function createAiCostDateRangeFromQuery(args: {
  from?: string | null
  to?: string | null
}) {
  const from = args.from
  const to = args.to

  if (!from && !to) {
    return undefined
  }

  if (from && to && isValidDatePart(from) && isValidDatePart(to)) {
    return {
      from: createCalendarDate(from),
      to: createCalendarDate(to),
    }
  }

  const fallback = createDefaultAiCostDateRange()
  return {
    from:
      from && isValidDatePart(from) ? createCalendarDate(from) : fallback.from,
    to: to && isValidDatePart(to) ? createCalendarDate(to) : fallback.to,
  }
}

export function getAiCostRangeParams(range: DateRange | undefined) {
  const effectiveRange = range ?? createDefaultAiCostDateRange()
  const fallbackDate = createCalendarDate(getCurrentAiCostDateString())
  const from = effectiveRange.from ?? effectiveRange.to ?? fallbackDate
  const to = effectiveRange.to ?? effectiveRange.from ?? fallbackDate

  return {
    from: formatCalendarDate(from),
    timezone: AI_COST_REPORTING_TIMEZONE,
    to: formatCalendarDate(to),
  }
}

export function createAiCostSearchParams(args: {
  extraParams?: Record<string, string | undefined>
  range: DateRange | undefined
  searchParams?: Pick<URLSearchParams, "forEach">
}) {
  const params = new URLSearchParams()

  args.searchParams?.forEach((value, key) => {
    params.set(key, value)
  })

  const range = getAiCostRangeParams(args.range)
  params.set("from", range.from)
  params.set("to", range.to)

  for (const [key, value] of Object.entries(args.extraParams ?? {})) {
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
  }

  return params
}

export function getDefaultAiCostBillingMonth() {
  return getCurrentAiCostDateString().slice(0, 7)
}

export function formatAiCostPeriodMonth(periodMonth: string) {
  const [yearRaw, monthRaw] = periodMonth.split("-")
  const year = Number.parseInt(yearRaw ?? "", 10)
  const month = Number.parseInt(monthRaw ?? "", 10)

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return periodMonth
  }

  const date = new Date(year, month - 1, 1, 12, 0, 0, 0)
  return format(date, "MMM yyyy", { locale: es })
}

export function getAiCostCoverageLabel(coverage?: "complete" | "estimated") {
  return coverage === "estimated" ? "Estimado" : "Completo"
}

export function getOrganizationAiCostCoverageStatusLabel(
  status?: "complete" | "not_started" | "partial" | "running"
) {
  switch (status) {
    case "running":
      return "En progreso"
    case "partial":
      return "Parcial"
    case "complete":
      return "Completo"
    default:
      return "Sin iniciar"
  }
}

export function getOrganizationAiCostCoverageStatusVariant(
  status?: "complete" | "not_started" | "partial" | "running"
) {
  switch (status) {
    case "running":
      return "default" as const
    case "complete":
      return "secondary" as const
    case "partial":
      return "outline" as const
    default:
      return "outline" as const
  }
}

export function getOrganizationAiCostCalculationPhaseLabel(
  phase: "conversation_refresh" | "cost_sync" | "inventory" | "resolution"
) {
  switch (phase) {
    case "inventory":
      return "Inventario"
    case "resolution":
      return "Resolución"
    case "cost_sync":
      return "Sync costo"
    case "conversation_refresh":
      return "Refresh conversación"
    default:
      return phase
  }
}

export function getOrganizationAiCostCalculationOutcomeLabel(
  outcome: "failed" | "ignored" | "skipped" | "updated"
) {
  switch (outcome) {
    case "updated":
      return "Actualizado"
    case "skipped":
      return "Omitido"
    case "failed":
      return "Fallido"
    case "ignored":
      return "Ignorado"
    default:
      return outcome
  }
}

export function getOrganizationAiCostReasonCodeLabel(
  reasonCode:
    | "already_synced"
    | "ambiguous_mapping"
    | "mapped_to_conversation"
    | "message_fetch_incomplete"
    | "standalone_combo_builder"
    | "standalone_debug_agent"
    | "synthetic_thread"
    | "thread_not_found"
    | "unassigned_legacy_orphan"
    | "unexpected_error"
) {
  switch (reasonCode) {
    case "already_synced":
      return "Ya sincronizado"
    case "mapped_to_conversation":
      return "Mapeado a conversación"
    case "unassigned_legacy_orphan":
      return "No asignado histórico"
    case "standalone_debug_agent":
      return "Thread debug agent"
    case "standalone_combo_builder":
      return "Thread combo builder"
    case "message_fetch_incomplete":
      return "Lectura incompleta"
    case "synthetic_thread":
      return "Thread sintético"
    case "thread_not_found":
      return "Thread no encontrado"
    case "ambiguous_mapping":
      return "Mapeo ambiguo"
    default:
      return "Error inesperado"
  }
}

export function formatAiCostCount(
  value: number,
  options?: { lowerBound?: boolean }
) {
  const formatted = value.toLocaleString("es-CO")
  return options?.lowerBound ? `>= ${formatted}` : formatted
}

export function downloadCsv(filename: string, lines: string[][]) {
  const csv = lines
    .map((line) =>
      line
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\n")

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.href = url
  link.setAttribute("download", filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
