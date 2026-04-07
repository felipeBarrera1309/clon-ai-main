export type DebugMessageContentPart = {
  type: string
  text?: string
  [key: string]: unknown
}

export type DebugMessageDoc = {
  _id: string
  _creationTime: number
  order?: number
  stepOrder?: number
  text?: string
  message?: {
    role?: "user" | "assistant" | "tool" | "system"
    content?: string | DebugMessageContentPart[]
  }
}

const compareOptionalNumber = (
  aValue: number | undefined,
  bValue: number | undefined
) => {
  if (typeof aValue === "number" && typeof bValue === "number") {
    return aValue - bValue
  }
  return 0
}

export const normalizeDebugMessagesChronological = <T extends DebugMessageDoc>(
  messages: T[] | undefined
): T[] => {
  if (!messages || messages.length === 0) return []

  return [...messages].sort((a, b) => {
    const orderDiff = compareOptionalNumber(a.order, b.order)
    if (orderDiff !== 0) return orderDiff

    const stepOrderDiff = compareOptionalNumber(a.stepOrder, b.stepOrder)
    if (stepOrderDiff !== 0) return stepOrderDiff

    const creationDiff = a._creationTime - b._creationTime
    if (creationDiff !== 0) return creationDiff

    return a._id.localeCompare(b._id)
  })
}

export const extractDebugMessageText = (message: DebugMessageDoc): string => {
  if (message.text !== undefined && message.text !== null) {
    return message.text
  }

  if (typeof message.message?.content === "string") {
    return message.message.content
  }

  if (Array.isArray(message.message?.content)) {
    return message.message.content
      .filter(
        (part): part is DebugMessageContentPart & { text: string } =>
          part.type === "text" && typeof part.text === "string"
      )
      .map((part) => part.text)
      .join("\n")
  }

  return ""
}
