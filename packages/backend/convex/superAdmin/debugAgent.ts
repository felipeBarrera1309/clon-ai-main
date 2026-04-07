import { listMessages } from "@convex-dev/agent"
import { paginationOptsValidator } from "convex/server"
import { ConvexError, v } from "convex/values"
import { components, internal } from "../_generated/api"
import { internalMutation, internalQuery } from "../_generated/server"
import {
  platformSuperAdminAction,
  platformSuperAdminQuery,
} from "../lib/superAdmin"
import { createDebugAgent } from "../system/ai/agents/debugAgent"

type DebugThreadMessage = {
  _id: string
  _creationTime: number
  order?: number
  stepOrder?: number
  message?: {
    role?: "user" | "assistant" | "tool" | "system"
    content?: string | Array<{ type?: string; text?: string }>
  }
  text?: string
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

const normalizeChronologicalMessages = (
  messages: DebugThreadMessage[]
): DebugThreadMessage[] => {
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

const extractAssistantText = (message: DebugThreadMessage): string => {
  if (message.message?.role !== "assistant") return ""
  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text.trim()
  }

  const content = message.message?.content
  if (typeof content === "string") {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .filter(
        (part): part is { type: string; text: string } =>
          part.type === "text" && typeof part.text === "string"
      )
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join("\n")
  }

  return ""
}

const getAssistantTextsAfterPrompt = async (
  ctx: Parameters<typeof listMessages>[0],
  threadId: string,
  promptMessageId: string
) => {
  const messages = await listMessages(ctx, components.agent, {
    threadId,
    paginationOpts: { numItems: 120, cursor: null },
    excludeToolMessages: false,
  })

  const chronological = normalizeChronologicalMessages(
    messages.page as DebugThreadMessage[]
  )
  const promptIndex = chronological.findIndex(
    (msg) => msg._id === promptMessageId
  )
  const messagesAfterPrompt =
    promptIndex >= 0 ? chronological.slice(promptIndex + 1) : chronological

  const uniqueTexts = new Set<string>()
  const assistantTexts: string[] = []

  for (const message of messagesAfterPrompt) {
    const text = extractAssistantText(message)
    if (!text || uniqueTexts.has(text)) continue
    uniqueTexts.add(text)
    assistantTexts.push(text)
  }

  return assistantTexts
}

// ============================================
// INTERNAL HELPERS
// ============================================

export const getExistingThread = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    const threads = await ctx.db
      .query("debugAgentConversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .take(500)

    if (threads.length === 0) return null

    return threads.reduce((latest, thread) =>
      thread.lastMessageAt > latest.lastMessageAt ? thread : latest
    )
  },
})

export const getThreadById = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("debugAgentConversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .first()
  },
})

export const storeThread = internalMutation({
  args: {
    organizationId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("debugAgentConversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .first()

    if (existing) {
      return existing.threadId
    }

    await ctx.db.insert("debugAgentConversations", {
      organizationId: args.organizationId,
      threadId: args.threadId,
      lastMessageAt: Date.now(),
    })
    return args.threadId
  },
})

export const updateLastMessageAt = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("debugAgentConversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .first()

    if (thread) {
      await ctx.db.patch(thread._id, { lastMessageAt: Date.now() })
    }
  },
})

export const deleteThreadRecord = internalMutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("debugAgentConversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .collect()

    for (const record of records) {
      await ctx.db.delete(record._id)
    }
  },
})

// ============================================
// PUBLIC SUPER ADMIN FUNCTIONS
// ============================================

export const getOrCreateThread = platformSuperAdminAction({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args): Promise<{ threadId: string; isNew: boolean }> => {
    const existing = await ctx.runQuery(
      internal.superAdmin.debugAgent.getExistingThread,
      { organizationId: args.organizationId }
    )

    if (existing) {
      return { threadId: existing.threadId, isNew: false }
    }

    const debugAgent = await createDebugAgent(ctx, {
      organizationId: args.organizationId,
    })

    const thread = await debugAgent.createThread(ctx, {
      userId: args.organizationId,
    })

    // Use the returned threadId from storeThread to handle race conditions
    // If another admin created a thread concurrently, storeThread returns the existing one
    const storedThreadId = await ctx.runMutation(
      internal.superAdmin.debugAgent.storeThread,
      {
        organizationId: args.organizationId,
        threadId: thread.threadId,
      }
    )

    await ctx.runMutation(
      internal.system.organizationAiThreads.registerStandaloneThread,
      {
        organizationId: args.organizationId,
        purpose: "debug-agent",
        threadId: storedThreadId,
      }
    )

    return {
      threadId: storedThreadId,
      isNew: storedThreadId === thread.threadId,
    }
  },
})

export const createNewThread = platformSuperAdminAction({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args): Promise<{ threadId: string }> => {
    const debugAgent = await createDebugAgent(ctx, {
      organizationId: args.organizationId,
    })

    const thread = await debugAgent.createThread(ctx, {
      userId: args.organizationId,
    })

    const storedThreadId = await ctx.runMutation(
      internal.superAdmin.debugAgent.storeThread,
      {
        organizationId: args.organizationId,
        threadId: thread.threadId,
      }
    )

    await ctx.runMutation(
      internal.system.organizationAiThreads.registerStandaloneThread,
      {
        organizationId: args.organizationId,
        purpose: "debug-agent",
        threadId: storedThreadId,
      }
    )

    return { threadId: storedThreadId }
  },
})

export const listThreads = platformSuperAdminQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const threads = await ctx.db
      .query("debugAgentConversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .take(300)

    return threads
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, 100)
  },
})

export const deleteThread = platformSuperAdminAction({
  args: {
    organizationId: v.string(),
    threadId: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; nextThreadId: string | null }> => {
    const threadRecord = await ctx.runQuery(
      internal.superAdmin.debugAgent.getThreadById,
      { threadId: args.threadId }
    )

    if (!threadRecord || threadRecord.organizationId !== args.organizationId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message:
          "La conversación seleccionada no pertenece a esta organización de debug",
      })
    }

    try {
      await ctx.runAction(components.agent.threads.deleteAllForThreadIdSync, {
        threadId: args.threadId,
      })
    } catch (error) {
      console.error(
        "[DEBUG AGENT] Error deleting thread from agent component:",
        error
      )
    }

    await ctx.runMutation(internal.superAdmin.debugAgent.deleteThreadRecord, {
      threadId: args.threadId,
    })

    const nextThread = await ctx.runQuery(
      internal.superAdmin.debugAgent.getExistingThread,
      { organizationId: args.organizationId }
    )

    return {
      success: true,
      nextThreadId: nextThread?.threadId ?? null,
    }
  },
})

export const sendMessage = platformSuperAdminAction({
  args: {
    organizationId: v.string(),
    threadId: v.string(),
    message: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean
    response: string
    retried: boolean
    fallbackUsed: boolean
    assistantTextCount: number
  }> => {
    if (!args.message.trim()) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "El mensaje no puede estar vacío",
      })
    }

    const threadRecord = await ctx.runQuery(
      internal.superAdmin.debugAgent.getThreadById,
      { threadId: args.threadId }
    )

    if (!threadRecord || threadRecord.organizationId !== args.organizationId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message:
          "La conversación seleccionada no pertenece a esta organización de debug",
      })
    }

    const debugAgent = await createDebugAgent(ctx, {
      organizationId: args.organizationId,
    })

    const { thread } = await debugAgent.continueThread(ctx, {
      threadId: args.threadId,
    })

    const { messageId } = await debugAgent.saveMessage(ctx, {
      threadId: args.threadId,
      prompt: args.message,
    })

    const maxAttempts = 2
    let lastError: unknown = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt === 1) {
          await thread.generateText({
            promptMessageId: messageId,
          })
        } else {
          // Continue the same thread to let the agent finish after tool calls.
          await thread.generateText({})
        }

        const assistantTexts = await getAssistantTextsAfterPrompt(
          ctx,
          args.threadId,
          messageId
        )

        if (assistantTexts.length > 0) {
          await ctx.runMutation(
            internal.system.organizationAiThreads.refreshThreadCost,
            {
              organizationId: args.organizationId,
              threadId: args.threadId,
            }
          )

          await ctx.runMutation(
            internal.superAdmin.debugAgent.updateLastMessageAt,
            {
              threadId: args.threadId,
            }
          )

          return {
            success: true,
            response: assistantTexts.join("\n\n"),
            retried: attempt > 1,
            fallbackUsed: false,
            assistantTextCount: assistantTexts.length,
          }
        }
      } catch (error) {
        lastError = error
        console.error(
          `[DEBUG AGENT] Error generating response (attempt ${attempt}/${maxAttempts}):`,
          error
        )
      }
    }

    await ctx.runMutation(
      internal.system.organizationAiThreads.refreshThreadCost,
      {
        organizationId: args.organizationId,
        threadId: args.threadId,
      }
    )

    await ctx.runMutation(internal.superAdmin.debugAgent.updateLastMessageAt, {
      threadId: args.threadId,
    })

    if (lastError) {
      console.error(
        "[DEBUG AGENT] Returning fallback after failed generation attempts:",
        lastError
      )
    }

    return {
      success: true,
      response:
        "Estoy teniendo problemas para completar el análisis automático en este momento. Si quieres, vuelve a intentar y analizaré el caso paso a paso.",
      retried: true,
      fallbackUsed: true,
      assistantTextCount: 0,
    }
  },
})

export const getMessages = platformSuperAdminQuery({
  args: {
    organizationId: v.string(),
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const threadRecord = await ctx.runQuery(
      internal.superAdmin.debugAgent.getThreadById,
      { threadId: args.threadId }
    )

    if (!threadRecord || threadRecord.organizationId !== args.organizationId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message:
          "No tienes acceso a esta conversación de debug para la organización actual",
      })
    }

    const messages = await listMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
      excludeToolMessages: false,
    })

    return messages
  },
})

export const getOrganizationInfo = platformSuperAdminQuery({
  args: {
    organizationId: v.string(),
  },
  returns: v.object({
    organizationId: v.string(),
    organizationName: v.string(),
    hasExistingThread: v.boolean(),
    threadId: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    organizationId: string
    organizationName: string
    hasExistingThread: boolean
    threadId?: string
    lastMessageAt?: number
  }> => {
    const [organization, debugThread] = await Promise.all([
      ctx.runQuery(components.betterAuth.organizations.getById, {
        organizationId: args.organizationId,
      }),
      ctx.runQuery(internal.superAdmin.debugAgent.getExistingThread, {
        organizationId: args.organizationId,
      }),
    ])

    return {
      organizationId: args.organizationId,
      organizationName: organization?.name ?? "Organización",
      hasExistingThread: !!debugThread,
      threadId: debugThread?.threadId,
      lastMessageAt: debugThread?.lastMessageAt,
    }
  },
})
