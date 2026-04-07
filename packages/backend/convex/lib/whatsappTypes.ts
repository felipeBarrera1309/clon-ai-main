// TypeScript types
export type WhatsAppTextMessage = {
  from: string
  id: string
  timestamp: string
  text: {
    body: string
  }
  type: "text"
}

export type WhatsAppImageMessage = {
  from: string
  id: string
  timestamp: string
  image: {
    caption?: string
    mime_type: string
    sha256: string
    id: string
  }
  type: "image"
}

export type WhatsAppLocationMessage = {
  from: string
  id: string
  timestamp: string
  location: {
    latitude: number
    longitude: number
    name?: string
    address?: string
  }
  type: "location"
}

export type WhatsAppAudioMessage = {
  from: string
  id: string
  timestamp: string
  audio: {
    mime_type: string
    sha256: string
    id: string
  }
  type: "audio"
}

export type WhatsAppDocumentMessage = {
  from: string
  id: string
  timestamp: string
  document: {
    caption?: string
    filename?: string
    mime_type: string
    sha256: string
    id: string
  }
  type: "document"
}

export type WhatsAppInteractiveMessage = {
  from: string
  id: string
  timestamp: string
  type: "interactive"
  interactive: {
    type: "button_reply" | "list_reply"
    button_reply?: {
      id: string
      title: string
    }
    list_reply?: {
      id: string
      title: string
      description?: string
    }
  }
}

export type WhatsAppContact = {
  profile: {
    name: string
  }
  wa_id: string
}

export type WhatsAppMetadata = {
  display_phone_number: string
  phone_number_id: string
}

export type WhatsAppStatusUpdate = {
  id: string
  status: "sent" | "delivered" | "read" | "failed"
  timestamp: string
  recipient_id: string
  errors?: Array<{
    code: number
    title: string
    message?: string
    error_data?: {
      details: string
    }
  }>
}

export type WhatsAppMessageValue = {
  messaging_product: "whatsapp"
  metadata: WhatsAppMetadata
  contacts: WhatsAppContact[]
  messages: (
    | WhatsAppTextMessage
    | WhatsAppImageMessage
    | WhatsAppAudioMessage
    | WhatsAppDocumentMessage
    | WhatsAppLocationMessage
    | WhatsAppInteractiveMessage
  )[]
}
export type WhatsAppStatusValue = {
  messaging_product: "whatsapp"
  metadata: WhatsAppMetadata
  statuses: WhatsAppStatusUpdate[]
}

export type WhatsappChange = {
  value: WhatsAppMessageValue | WhatsAppStatusValue
  field: "messages"
}

export type WhatsAppEntry = {
  id: string
  changes: WhatsappChange[]
}

export type WhatsAppWebhookPayload = {
  object: "whatsapp_business_account"
  entry: WhatsAppEntry[]
}

// Outgoing Message Types

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "document"
  | "template"
  | "interactive"

export interface OutgoingMessageBase {
  type: MessageType
  to: string // Phone number
}

export interface OutgoingTextMessage extends OutgoingMessageBase {
  type: "text"
  text: string
  previewUrl?: boolean
}

export interface OutgoingMediaMessage extends OutgoingMessageBase {
  type: "image" | "audio" | "document"
  mediaId?: string // If already uploaded to WhatsApp
  url?: string // If needs to be uploaded
  caption?: string
  filename?: string // For documents
  storageId?: string // Internal Convex storage ID for dashboard rendering
}

export interface OutgoingTemplateMessage extends OutgoingMessageBase {
  type: "template"
  name: string
  language: string
  components: any[]
}

// Interactive Message Types
// https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-messages

export interface InteractiveButton {
  type: "reply"
  reply: {
    id: string
    title: string
  }
}

export interface InteractiveListSection {
  title?: string
  rows: Array<{
    id: string
    title: string
    description?: string
  }>
}

export interface InteractiveHeader {
  type: "text" | "image" | "video" | "document"
  text?: string
  image?: { id?: string; link?: string }
  video?: { id?: string; link?: string }
  document?: { id?: string; link?: string; filename?: string }
}

export interface InteractiveFooter {
  text: string
}

export interface InteractiveBody {
  text: string
}

export interface OutgoingInteractiveButtonMessage extends OutgoingMessageBase {
  type: "interactive"
  interactiveType: "button"
  header?: InteractiveHeader
  body: InteractiveBody
  footer?: InteractiveFooter
  buttons: InteractiveButton[]
}

export interface OutgoingInteractiveListMessage extends OutgoingMessageBase {
  type: "interactive"
  interactiveType: "list"
  header?: InteractiveHeader
  body: InteractiveBody
  footer?: InteractiveFooter
  buttonText: string
  sections: InteractiveListSection[]
}

export interface OutgoingInteractiveCTAButtonMessage
  extends OutgoingMessageBase {
  type: "interactive"
  interactiveType: "cta_url"
  header?: InteractiveHeader
  body: InteractiveBody
  footer?: InteractiveFooter
  ctaButtonText: string
  ctaUrl: string
}

export interface OutgoingInteractiveLocationRequestMessage
  extends OutgoingMessageBase {
  type: "interactive"
  interactiveType: "location_request"
  body: InteractiveBody // Text shown above the "Send location" button
}

export type OutgoingInteractiveMessage =
  | OutgoingInteractiveButtonMessage
  | OutgoingInteractiveListMessage
  | OutgoingInteractiveCTAButtonMessage
  | OutgoingInteractiveLocationRequestMessage

export type OutgoingMessage =
  | OutgoingTextMessage
  | OutgoingMediaMessage
  | OutgoingTemplateMessage
  | OutgoingInteractiveMessage
