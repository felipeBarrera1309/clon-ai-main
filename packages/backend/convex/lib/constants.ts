import { env } from "./env"

export const WHATSAPP_MESSAGING_PRODUCT = "whatsapp"
export const WHATSAPP_VERIFY_TOKEN = env.WHATSAPP_VERIFY_TOKEN
export const WHATSAPP_API_VERSION = env.WHATSAPP_API_VERSION
export const R2_PUBLIC_URL = env.R2_PUBLIC_URL

// File size limits in bytes for WhatsApp media processing
// Business limits: 5MB for images, 10MB for videos and documents
export const FILE_SIZE_LIMITS = {
  // 5MB for images (WhatsApp API limit)
  IMAGE: 5 * 1024 * 1024,
  // 2MB for audio files (for conversation processing)
  AUDIO: 2 * 1024 * 1024,
  // 10MB for videos (business limit, WhatsApp allows up to 16MB)
  VIDEO: 10 * 1024 * 1024,
  // 10MB for documents (business limit, WhatsApp allows up to 100MB)
  DOCUMENT: 10 * 1024 * 1024,
} as const

export const MAX_FIELD_LENGTH = 10000

// Document MIME types that AI can directly process
export const AI_PROCESSABLE_DOCUMENT_TYPES = [
  "application/pdf",
  "text/plain",
] as const

// Helper function to format file size for error messages
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes"

  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

// Helper function to get file size limit based on MIME type
export function getFileSizeLimit(mimeType: string): number {
  if (mimeType.startsWith("image/")) {
    return FILE_SIZE_LIMITS.IMAGE
  }
  if (mimeType.startsWith("audio/")) {
    return FILE_SIZE_LIMITS.AUDIO
  }
  if (mimeType.startsWith("video/")) {
    return FILE_SIZE_LIMITS.VIDEO
  }
  if (mimeType.startsWith("application/")) {
    return FILE_SIZE_LIMITS.DOCUMENT
  }
  // Default to audio limit for unknown types (most restrictive)
  return FILE_SIZE_LIMITS.AUDIO
}

// Default restaurant configuration values
export const DEFAULT_RESTAURANT_CONFIG = {
  // Scheduling Configuration
  minAdvanceMinutes: 30, // Minimum advance time in minutes for scheduled orders
  maxAdvanceDays: 7, // Maximum advance time in days for scheduled orders
  // Order Management
  orderModificationBufferMinutes: 15, // Buffer time in minutes to modify orders after creation
  // Conversation Management
  conversationResolutionBufferMinutes: 30, // Buffer time in minutes before auto-resolving conversations after order delivery
  // Payment Configuration
  paymentLinkUrl: "", // Default empty payment link URL
  bankAccounts: [] as string[], // Default empty bank accounts array
  acceptCash: true, // Default accept cash payments
  acceptCard: true, // Default accept card payments
  acceptPaymentLink: false, // Default accept payment link payments
  acceptBankTransfer: false, // Default disabled bank transfer payments (requires bankAccounts)
  acceptCorporateCredit: false, // Default disabled corporate credit/convenios empresariales
  acceptDynamicPaymentLink: false, // Default disabled dynamic payment link
  acceptGiftVoucher: false, // Default disabled gift vouchers/bonos de regalo
  acceptSodexoVoucher: false, // Default disabled Sodexo vouchers - conversation will be escalated
  // Order Type Configuration
  enableDelivery: true, // Default enable delivery
  enablePickup: true, // Default enable pickup
  // Invoice Configuration
  enableElectronicInvoice: false, // Default disabled electronic invoice
  // Custom Order Instructions
  deliveryInstructions: "", // Default empty custom instructions for delivery
  pickupInstructions: "", // Default empty custom instructions for pickup
  // Menu Configuration
  menuType: undefined as "images" | "pdf" | "url" | undefined, // Default no menu type selected
  menuUrl: "", // Default empty menu URL
  menuImages: [] as never[], // Default empty menu images array
  menuPdf: undefined as undefined, // Default no menu PDF
  orderStatusMessages: undefined, // Default no custom status messages
} as const
