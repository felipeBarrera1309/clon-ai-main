import type { Doc } from "../_generated/dataModel"
import type {
  WhatsAppAudioMessage,
  WhatsAppDocumentMessage,
  WhatsAppImageMessage,
  WhatsAppInteractiveMessage,
  WhatsAppLocationMessage,
  WhatsAppMessageValue,
  WhatsAppStatusUpdate,
  WhatsAppStatusValue,
} from "./whatsappTypes"

type BaseMessageResult = {
  contactPhoneNumber: string
  contactDisplayName: string
  businessPhoneNumberId: string
  businessDisplayPhoneNumber: string
  messageId: string
  messageTimestamp: string
}

type TextMessageResult = BaseMessageResult & {
  type: "text"
  text: string
  image: null
  audio: null
  document: null
  location: null
  interactive: null
}

type ImageMessageResult = BaseMessageResult & {
  type: "image"
  image: WhatsAppImageMessage["image"]
  text: null
  audio: null
  document: null
  location: null
  interactive: null
}

type AudioMessageResult = BaseMessageResult & {
  type: "audio"
  audio: WhatsAppAudioMessage["audio"]
  text: null
  image: null
  document: null
  location: null
  interactive: null
}

type DocumentMessageResult = BaseMessageResult & {
  type: "document"
  document: WhatsAppDocumentMessage["document"]
  text: null
  image: null
  audio: null
  location: null
  interactive: null
}

type LocationMessageResult = BaseMessageResult & {
  type: "location"
  location: WhatsAppLocationMessage["location"]
  text: null
  image: null
  audio: null
  document: null
  interactive: null
}

type InteractiveMessageResult = BaseMessageResult & {
  type: "interactive"
  interactive: WhatsAppInteractiveMessage["interactive"]
  text: null
  image: null
  audio: null
  document: null
  location: null
}

type StatusUpdateResult = {
  type: "status_update"
  statusUpdate: WhatsAppStatusUpdate // Status update information
}

export async function processIncomingStatusUpdate(
  statusValue: WhatsAppStatusValue
): Promise<StatusUpdateResult | null> {
  if (!statusValue) {
    return null
  }
  const statusUpdate = statusValue.statuses?.[0]
  if (!statusUpdate) {
    return null
  }
  return {
    type: "status_update",
    statusUpdate,
  }
}

export async function processIncomingMessage(
  messageValue: WhatsAppMessageValue
): Promise<
  | TextMessageResult
  | ImageMessageResult
  | AudioMessageResult
  | DocumentMessageResult
  | LocationMessageResult
  | InteractiveMessageResult
  | null
> {
  const { contacts, messages } = messageValue

  // Check if contacts and messages arrays exist and have elements
  if (
    !contacts ||
    contacts.length === 0 ||
    !messages ||
    messages.length === 0
  ) {
    console.log(
      "[WhatsApp] No contact or message information found for message"
    )
    return null
  }

  const contact = contacts[0]
  const message = messages[0]

  // TypeScript safety check - we know these exist after the length check above
  if (!contact || !message) {
    console.log("[WhatsApp] Contact or message data is invalid")
    return null
  }

  const contactPhoneNumber = contact.wa_id
  const contactDisplayName = contact.profile?.name ?? contact.wa_id
  const businessPhoneNumberId = messageValue.metadata.phone_number_id
  const businessDisplayPhoneNumber = messageValue.metadata.display_phone_number

  if (message) {
    if (message.type === "text") {
      const textMessage = message
      const text = textMessage.text.body
      return {
        type: "text",
        contactPhoneNumber,
        contactDisplayName,
        businessPhoneNumberId,
        businessDisplayPhoneNumber,
        messageId: message.id,
        messageTimestamp: message.timestamp,
        text,
        image: null,
        audio: null,
        document: null,
        location: null,
        interactive: null,
      }
    }

    if (message.type === "image") {
      const imageMessage = message
      const image = imageMessage.image
      return {
        type: "image",
        contactPhoneNumber,
        contactDisplayName,
        businessPhoneNumberId,
        businessDisplayPhoneNumber,
        messageId: message.id,
        messageTimestamp: message.timestamp,
        image,
        text: null,
        audio: null,
        document: null,
        location: null,
        interactive: null,
      }
    }

    if (message.type === "audio") {
      const audioMessage = message
      const audio = audioMessage.audio
      return {
        type: "audio",
        contactPhoneNumber,
        contactDisplayName,
        businessPhoneNumberId,
        businessDisplayPhoneNumber,
        messageId: message.id,
        messageTimestamp: message.timestamp,
        audio,
        text: null,
        image: null,
        document: null,
        location: null,
        interactive: null,
      }
    }

    if (message.type === "document") {
      const documentMessage = message
      const document = documentMessage.document
      return {
        type: "document",
        contactPhoneNumber,
        contactDisplayName,
        businessPhoneNumberId,
        businessDisplayPhoneNumber,
        messageId: message.id,
        messageTimestamp: message.timestamp,
        document,
        text: null,
        image: null,
        audio: null,
        location: null,
        interactive: null,
      }
    }

    if (message.type === "location") {
      const locationMessage = message
      const location = locationMessage.location
      return {
        type: "location",
        contactPhoneNumber,
        contactDisplayName,
        businessPhoneNumberId,
        businessDisplayPhoneNumber,
        messageId: message.id,
        messageTimestamp: message.timestamp,
        location,
        text: null,
        image: null,
        audio: null,
        document: null,
        interactive: null,
      }
    }

    if (message.type === "interactive") {
      const interactiveMessage = message
      const interactive = interactiveMessage.interactive
      return {
        type: "interactive",
        contactPhoneNumber,
        contactDisplayName,
        businessPhoneNumberId,
        businessDisplayPhoneNumber,
        messageId: message.id,
        messageTimestamp: message.timestamp,
        interactive,
        text: null,
        image: null,
        audio: null,
        document: null,
        location: null,
      }
    }
  }
  return null
}

/**
 * Check if we can send WhatsApp messages based on 24-hour messaging window
 * WhatsApp Business API only allows sending messages within 24 hours of user's last message
 */
export function canSendWhatsAppMessage(contact: Doc<"contacts">): {
  canSend: boolean
  reason?: string
} {
  // Check if contact has lastMessageAt (when user last sent us a message)
  if (!contact.lastMessageAt) {
    return {
      canSend: false,
      reason: "No lastMessageAt found for contact",
    }
  }

  const now = Date.now()
  const twentyFourHoursInMs = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
  const timeSinceLastMessage = now - contact.lastMessageAt
  const canSend = timeSinceLastMessage <= twentyFourHoursInMs

  if (!canSend) {
    const hoursAgo = Math.round(timeSinceLastMessage / (60 * 60 * 1000))
    return {
      canSend: false,
      reason: `Last user message was ${hoursAgo} hours ago (24h window exceeded)`,
    }
  }

  return { canSend: true }
}
