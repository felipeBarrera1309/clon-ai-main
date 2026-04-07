import { format } from "date-fns"
import { es } from "date-fns/locale"

export type ContactForExport = {
  _id: string
  displayName?: string
  phoneNumber: string
  lastKnownAddress?: string
  isBlocked?: boolean
  lastMessageAt?: number
  _creationTime: number
  orderCount: number
  conversationCount: number
}

// UTF-8 BOM for Excel compatibility
const UTF8_BOM = "\uFEFF"

// Spanish headers
const CSV_HEADERS = [
  "Nombre",
  "Teléfono",
  "Dirección",
  "Estado",
  "Fecha Registro",
  "Última Actividad",
  "Pedidos",
  "Conversaciones",
]

function escapeCSVField(value: string): string {
  // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return ""
  return format(new Date(timestamp), "dd/MM/yyyy", { locale: es })
}

export function generateContactsCSV(contacts: ContactForExport[]): string {
  const header = CSV_HEADERS.join(",")

  const rows = contacts.map((contact) => {
    const row = [
      escapeCSVField(contact.displayName || ""),
      escapeCSVField(contact.phoneNumber),
      escapeCSVField(contact.lastKnownAddress || ""),
      contact.isBlocked ? "Bloqueado" : "Activo",
      formatDate(contact._creationTime),
      formatDate(contact.lastMessageAt),
      contact.orderCount.toString(),
      contact.conversationCount.toString(),
    ]
    return row.join(",")
  })

  return UTF8_BOM + [header, ...rows].join("\n")
}

export function downloadContactsCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
