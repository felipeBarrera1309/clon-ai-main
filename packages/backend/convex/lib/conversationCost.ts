import { listMessages } from "@convex-dev/agent"
import { components } from "../_generated/api"
import type { Doc } from "../_generated/dataModel"
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server"

export type ConversationAiThreadKind = "primary" | "auxiliary"

export type ConversationAiThreadPurpose =
  | "support-agent"
  | "menu-context"
  | "combination-enrichment"
  | "combination-validation"

export type AiCostThreadKind = ConversationAiThreadKind | "standalone"

export type AiCostThreadPurpose =
  | ConversationAiThreadPurpose
  | "debug-agent"
  | "combo-builder"
  | "unknown"

export type ConversationCostCoverage = "complete" | "estimated"

export type ConversationCostUsage = {
  cachedInputTokens?: number
  completionTokens?: number
  promptTokens?: number
  reasoningTokens?: number
  totalTokens?: number
}

type AgentMessageRole = "user" | "assistant" | "tool" | "system" | "unknown"

type AgentMessageContentPart = {
  type?: string
  text?: string
  [key: string]: unknown
}

export type AgentMessageDoc = {
  _creationTime: number
  _id: string
  message?: {
    content?: string | AgentMessageContentPart[]
    role?: AgentMessageRole | string
  }
  model?: string
  provider?: string
  providerMetadata?: Record<string, Record<string, unknown>>
  text?: string
  threadId: string
  tool?: boolean
  usage?: ConversationCostUsage
}

export type ConversationCostThreadRef = {
  createdAt?: number
  kind: AiCostThreadKind
  purpose: AiCostThreadPurpose
  threadId: string
}

export type ConversationCostBreakdownMessage = {
  cost: number
  isCustomerVisible: boolean
  messageId: string
  model?: string
  provider?: string
  role: AgentMessageRole
  textPreview?: string
  threadId: string
  threadPurpose: AiCostThreadPurpose
  timestamp: number
  usage?: ConversationCostUsage
}

export type ConversationCostBreakdown = {
  messages: ConversationCostBreakdownMessage[]
  messagesWithCost: number
  threadsCount: number
  totalCost: number
}

export type ConversationCostThreadFailure = {
  purpose: AiCostThreadPurpose
  reason: string
  threadId: string
}

export type ConversationCostBreakdownFetchResult = {
  breakdown: ConversationCostBreakdown
  failedThreads: ConversationCostThreadFailure[]
}

type AgentRuntimeCtx = QueryCtx | MutationCtx | ActionCtx

const THREAD_MESSAGE_PAGE_SIZE = 1000

const TOOL_CONTENT_TYPES = new Set([
  "tool-call",
  "tool_use",
  "tool-result",
  "tool_result",
])

export function isSyntheticThreadId(threadId: string) {
  return threadId.startsWith("manual-order-")
}

export function parseGatewayCost(rawCost: unknown): number | undefined {
  if (typeof rawCost === "number") {
    return Number.isFinite(rawCost) ? rawCost : undefined
  }

  if (typeof rawCost !== "string") {
    return undefined
  }

  const trimmed = rawCost.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = Number.parseFloat(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function roundCost(value: number) {
  return Number(value.toFixed(4))
}

function hasToolContent(content: unknown) {
  return (
    Array.isArray(content) &&
    content.some((part) =>
      TOOL_CONTENT_TYPES.has((part as AgentMessageContentPart)?.type ?? "")
    )
  )
}

function extractTextPreview(message: AgentMessageDoc) {
  if (message.text?.trim()) {
    return message.text.trim()
  }

  const content = message.message?.content
  if (typeof content === "string") {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ""
  }

  return content
    .filter(
      (part): part is AgentMessageContentPart & { text: string } =>
        part?.type === "text" && typeof part.text === "string"
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n")
}

function getMessageRole(message: AgentMessageDoc): AgentMessageRole {
  const role = message.message?.role
  if (
    role === "user" ||
    role === "assistant" ||
    role === "tool" ||
    role === "system"
  ) {
    return role
  }
  return "unknown"
}

export function getConversationCostMessagePreview(
  message: AgentMessageDoc,
  threadPurpose: AiCostThreadPurpose
) {
  if (threadPurpose !== "support-agent") {
    return undefined
  }

  const role = getMessageRole(message)
  if (role !== "user" && role !== "assistant") {
    return undefined
  }

  if (message.tool || hasToolContent(message.message?.content)) {
    return undefined
  }

  const preview = extractTextPreview(message)
  if (!preview) {
    return undefined
  }

  return preview.length > 180 ? `${preview.slice(0, 177)}...` : preview
}

function normalizeCostMessage(
  thread: ConversationCostThreadRef,
  message: AgentMessageDoc
): ConversationCostBreakdownMessage | null {
  const cost = parseGatewayCost(message.providerMetadata?.gateway?.cost)
  if (cost === undefined) {
    return null
  }

  const textPreview = getConversationCostMessagePreview(message, thread.purpose)

  return {
    cost: roundCost(cost),
    isCustomerVisible: textPreview !== undefined,
    messageId: message._id,
    model: message.model,
    provider: message.provider,
    role: getMessageRole(message),
    textPreview,
    threadId: thread.threadId,
    threadPurpose: thread.purpose,
    timestamp: message._creationTime,
    usage: message.usage,
  }
}

export function getConversationCostThreadsWithFallback(
  conversation: Pick<Doc<"conversations">, "_creationTime" | "threadId">,
  registeredThreads: ConversationCostThreadRef[]
) {
  const mergedThreads = [...registeredThreads]

  if (
    conversation.threadId &&
    !isSyntheticThreadId(conversation.threadId) &&
    !mergedThreads.some((thread) => thread.threadId === conversation.threadId)
  ) {
    mergedThreads.unshift({
      createdAt: conversation._creationTime,
      kind: "primary",
      purpose: "support-agent",
      threadId: conversation.threadId,
    })
  }

  return mergedThreads
}

export function buildConversationCostBreakdown(
  threads: ConversationCostThreadRef[],
  messagesByThread: Map<string, AgentMessageDoc[]>
): ConversationCostBreakdown {
  const messages = threads
    .flatMap((thread) =>
      (messagesByThread.get(thread.threadId) ?? [])
        .map((message) => normalizeCostMessage(thread, message))
        .filter(
          (message): message is ConversationCostBreakdownMessage =>
            message !== null
        )
    )
    .sort((a, b) => {
      if (b.timestamp !== a.timestamp) {
        return b.timestamp - a.timestamp
      }
      return a.messageId.localeCompare(b.messageId)
    })

  const totalCost = messages.reduce((sum, message) => sum + message.cost, 0)

  return {
    messages,
    messagesWithCost: messages.length,
    threadsCount: threads.length,
    totalCost: roundCost(totalCost),
  }
}

export function getHistoricalConversationCostCoverage(
  threads: ConversationCostThreadRef[]
): ConversationCostCoverage {
  return threads.some((thread) => thread.kind === "auxiliary")
    ? "complete"
    : "estimated"
}

export async function listAllThreadMessages(
  ctx: AgentRuntimeCtx,
  threadId: string
) {
  const messages: AgentMessageDoc[] = []
  let cursor: string | null = null

  while (true) {
    const result = await listMessages(ctx, components.agent, {
      threadId,
      paginationOpts: {
        cursor,
        numItems: THREAD_MESSAGE_PAGE_SIZE,
      },
    })

    messages.push(...(result.page as AgentMessageDoc[]))

    if (result.isDone || !result.continueCursor) {
      break
    }

    cursor = result.continueCursor
  }

  return messages
}

export async function fetchAiThreadCostBreakdown(
  ctx: AgentRuntimeCtx,
  args: {
    thread: ConversationCostThreadRef
  }
): Promise<ConversationCostBreakdownFetchResult> {
  const messagesByThread = new Map<string, AgentMessageDoc[]>()
  const failedThreads: ConversationCostThreadFailure[] = []

  try {
    const messages = await listAllThreadMessages(ctx, args.thread.threadId)
    messagesByThread.set(args.thread.threadId, messages)
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : "Error desconocido al listar mensajes"

    console.warn(
      `[CONVERSATION COST] Failed to list messages for thread ${args.thread.threadId}`,
      error
    )
    failedThreads.push({
      purpose: args.thread.purpose,
      reason,
      threadId: args.thread.threadId,
    })
  }

  return {
    breakdown: buildConversationCostBreakdown([args.thread], messagesByThread),
    failedThreads,
  }
}

export async function fetchConversationCostBreakdown(
  ctx: AgentRuntimeCtx,
  args: {
    conversation: Pick<Doc<"conversations">, "_creationTime" | "threadId">
    registeredThreads: ConversationCostThreadRef[]
  }
): Promise<ConversationCostBreakdownFetchResult> {
  const threads = getConversationCostThreadsWithFallback(
    args.conversation,
    args.registeredThreads
  )

  const messagesByThread = new Map<string, AgentMessageDoc[]>()
  const failedThreads: ConversationCostThreadFailure[] = []

  await Promise.all(
    threads.map(async (thread) => {
      try {
        const messages = await listAllThreadMessages(ctx, thread.threadId)
        messagesByThread.set(thread.threadId, messages)
      } catch (error) {
        const reason =
          error instanceof Error
            ? error.message
            : "Error desconocido al listar mensajes"

        console.warn(
          `[CONVERSATION COST] Failed to list messages for thread ${thread.threadId}`,
          error
        )
        failedThreads.push({
          purpose: thread.purpose,
          reason,
          threadId: thread.threadId,
        })
      }
    })
  )

  return {
    breakdown: buildConversationCostBreakdown(threads, messagesByThread),
    failedThreads,
  }
}
