import { listMessages, saveMessage } from "@convex-dev/agent"
import { ConvexError, v } from "convex/values"
import { components, internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import {
  type ActionCtx,
  internalAction,
  internalMutation,
} from "../_generated/server"
import { rescueThoughtTags, stripThoughtTags } from "../lib/textUtils"
import { createSupportAgent } from "./ai/agents/supportAgent"

interface BasicMessage {
  conversation: Doc<"conversations">
  contact: Doc<"contacts">
}

interface TextMessage extends BasicMessage {
  type: "text"
  prompt: string
}

interface ImageAttachment {
  mimeType: string
  caption?: string
  imageUrl: string
  storageId: string
}

interface FileAttachment {
  mimeType: string
  caption?: string
  dataUrl: string
  storageId: string
}

interface ImageMessage extends BasicMessage {
  type: "image"
  attachment: ImageAttachment
}

interface FileMessage extends BasicMessage {
  type: "file"
  attachment: FileAttachment
}

type Message = TextMessage | ImageMessage | FileMessage

function isTextMessage(msg: Message): msg is TextMessage {
  return msg.type === "text"
}

function isImageMessage(msg: Message): msg is ImageMessage {
  return msg.type === "image"
}

function isFileMessage(msg: Message): msg is FileMessage {
  return msg.type === "file"
}

/**
 * Saves a user message to the conversation thread and schedules AI response.
 *
 * This function saves the message and triggers the debounce scheduler.
 * AI responses are NOT generated immediately - they wait 3 seconds for more messages.
 *
 * Flow:
 * 1. Save user message to thread
 * 2. Return immediately (so caller can schedule response)
 *
 * The caller should then call scheduleAgentResponse() to trigger the 3s debounce.
 *
 * Used by:
 * - whatsappAsyncProcessor.ts (WhatsApp messages)
 * - webhooks.ts widgetIncoming (Widget messages)
 *
 * @param ctx - Action context
 * @param args - Message to save
 * @returns null (caller should schedule response separately)
 */
export async function saveUserMessage(
  ctx: ActionCtx,
  args: Message
): Promise<string> {
  const { conversation, contact } = args

  if (conversation.contactId !== contact._id) {
    console.error("🎤 [SAVE USER MESSAGE] Conversation/Contact mismatch:", {
      conversationId: conversation._id,
      conversationContactId: conversation.contactId,
      providedContactId: contact._id,
    })
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "La conversación no pertenece a este contacto",
    })
  }

  if (conversation.status === "resolved") {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Conversación resuelta",
    })
  }

  if (isTextMessage(args)) {
    const savedMessage = await saveMessage(ctx, components.agent, {
      threadId: conversation.threadId,
      prompt: args.prompt,
    })
    return savedMessage.messageId
  } else if (isImageMessage(args)) {
    const savedMessage = await saveMessage(ctx, components.agent, {
      threadId: conversation.threadId,
      message: {
        role: "user",
        content: [
          { type: "image", image: args.attachment.imageUrl },
          ...(args.attachment.caption
            ? [
                {
                  type: "text" as const,
                  text: args.attachment.caption,
                },
              ]
            : []),
        ],
      },
      metadata: {
        sources: [
          {
            type: "source",
            sourceType: "url",
            id: args.attachment.storageId,
            url: args.attachment.imageUrl,
            title: args.attachment.caption || "Imagen adjunta",
            providerMetadata: {
              attachment: {
                mimeType: args.attachment.mimeType,
                caption: args.attachment.caption || null,
              },
            },
          },
        ],
      },
    })
    return savedMessage.messageId
  } else if (isFileMessage(args)) {
    const savedMessage = await saveMessage(ctx, components.agent, {
      threadId: conversation.threadId,
      message: {
        role: "user",
        content: [
          ...(args.attachment.caption
            ? [
                {
                  type: "text" as const,
                  text: args.attachment.caption,
                },
              ]
            : []),
        ],
      },
      metadata: {
        sources: [
          {
            type: "source",
            sourceType: "url",
            id: args.attachment.storageId,
            url: args.attachment.dataUrl,
            title: args.attachment.caption || "Archivo adjunto",
            providerMetadata: {
              attachment: {
                mimeType: args.attachment.mimeType,
                caption: args.attachment.caption || null,
              },
            },
          },
        ],
      },
    })
    return savedMessage.messageId
  }

  // This should never be reached due to the type guard above, but adding for safety
  throw new ConvexError({
    code: "BAD_REQUEST",
    message: "Tipo de mensaje no soportado",
  })
}

/**
 * Extracts text content from an agent thread message.
 * Handles both string content and structured content arrays.
 */
function extractTextFromMessage(m: any): string[] {
  const texts: string[] = []
  if (m.text?.trim()) texts.push(m.text.trim())

  const content = m.message?.content
  if (typeof content === "string" && content.trim()) {
    texts.push(content.trim())
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === "text" && part.text?.trim()) {
        texts.push(part.text.trim())
      } else if (typeof part === "string" && part.trim()) {
        texts.push(part.trim())
      }
    }
  }
  return texts
}

/**
 * Checks if a message has text content (quick check without extracting).
 */
function hasTextContent(content: unknown): boolean {
  if (typeof content === "string" && content.trim()) return true
  if (Array.isArray(content)) {
    return content.some(
      (part: any) =>
        (part.type === "text" && part.text?.trim()) || part.text?.trim()
    )
  }
  return false
}

export async function generateAgentResponse(
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">
    threadId: string
    organizationId: string
    messageId: string
  }
): Promise<{ text: string; messageId: string }[]> {
  console.log(
    "🎤 [GENERATE AGENT RESPONSE] Generating response for conversation:",
    args.conversationId
  )

  // Clear stop signal at the beginning of the run to ensure fresh start
  await ctx.runMutation(internal.system.conversations.clearStopSignal, {
    threadId: args.threadId,
  })

  // Snapshot: capture the last message ID before the run
  // This allows us to isolate messages created DURING this run
  let lastMessageIdBeforeRun: string | null = null
  try {
    const preRunMessages = await listMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: { numItems: 1, cursor: null },
    })
    lastMessageIdBeforeRun = preRunMessages.page[0]?._id ?? null
  } catch (snapshotError) {
    console.warn(
      "⚠️ [GENERATE AGENT RESPONSE] Pre-run snapshot failed, partial recovery disabled for this run:",
      snapshotError
    )
  }

  let lastError: Error | null = null

  // Create primary agent once — only re-create on attempt 3 to switch to the fallback model
  let agent = await createSupportAgent(ctx, {
    conversationId: args.conversationId,
    useFallbackModel: false,
  })

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Switch to fallback model on final attempt
      if (attempt === 3) {
        agent = await createSupportAgent(ctx, {
          conversationId: args.conversationId,
          useFallbackModel: true,
        })
      }

      console.log(
        `🎤 [GENERATE AGENT RESPONSE] Attempt ${attempt}${attempt === 3 ? " (fallback model: openai-o4-mini)" : ""} for conversation:`,
        args.conversationId
      )

      // Generate the response — this saves all messages to the agent thread
      await agent.generateText(
        ctx,
        { threadId: args.threadId },
        {
          promptMessageId: args.messageId,
        }
      )

      // ── Thread-based extraction ─────────────────────────────────────
      // Instead of relying on result.content / result.text (which only
      // contain the LAST step), we read ALL messages from the thread and
      // pick up every assistant text message created during this run.
      // This ensures multi-step greetings are never lost when the agent
      // calls tools like sendMenuFiles mid-generation.
      const allMessages = await listMessages(ctx, components.agent, {
        threadId: args.threadId,
        paginationOpts: { numItems: 50, cursor: null },
      })

      // Find boundary indices — messages are returned newest-first
      const promptMessageIndex = allMessages.page.findIndex(
        (m) => m._id === args.messageId
      )
      const lastBeforeRunIndex = lastMessageIdBeforeRun
        ? allMessages.page.findIndex((m) => m._id === lastMessageIdBeforeRun)
        : allMessages.page.length

      // Only take messages created DURING this run (between index 0 and effectiveEndIndex)
      const effectiveEndIndex = Math.min(
        promptMessageIndex >= 0 ? promptMessageIndex : allMessages.page.length,
        lastBeforeRunIndex >= 0 ? lastBeforeRunIndex : allMessages.page.length
      )

      // Build a set of previously-seen texts for deduplication.
      // Only look at messages OLDER than the current run boundary (effectiveEndIndex).
      const oldMessages = allMessages.page.slice(effectiveEndIndex)
      const seenTexts = new Set<string>()
      for (const m of oldMessages) {
        if (m.message?.role === "assistant") {
          for (const t of extractTextFromMessage(m)) seenTexts.add(t)
        }
      }

      // Filter candidate messages — only new assistant messages with text
      const candidateMessages = allMessages.page.slice(0, effectiveEndIndex)

      // ── Phase 1: pre-fetch all isSilent flags in parallel ───────────
      // Collect only assistant messages with text so we avoid unnecessary queries.
      const assistantCandidates = candidateMessages.filter(
        (m) =>
          m.message?.role === "assistant" &&
          (hasTextContent(m.message?.content) || m.text?.trim())
      )

      // Fire all isSilent queries concurrently — one Promise per candidate.
      // Using Promise.allSettled so a single query failure doesn't abort the rest.
      const silentResults = await Promise.allSettled(
        assistantCandidates.map((m) =>
          ctx.runQuery(internal.system.conversationMessages.getByMessageId, {
            messageId: m._id as string,
          })
        )
      )

      // Build a Map<messageId, isSilent> from the settled results
      const silentMap = new Map<string, boolean>()
      for (let i = 0; i < assistantCandidates.length; i++) {
        const result = silentResults[i]
        const candidate = assistantCandidates[i]
        if (
          result &&
          result.status === "fulfilled" &&
          candidate &&
          candidate._id
        ) {
          silentMap.set(
            candidate._id as string,
            (result as any).value?.isSilent === true
          )
        }
        // On rejection: leave out of map → treated as NOT silent (safe default)
      }

      // ── Phase 2: filter in order using cached results ────────────────
      // Original relative order of candidateMessages is preserved because we
      // iterate the same assistantCandidates slice sequentially.
      const newAssistantMessages: any[] = []

      for (const m of assistantCandidates) {
        // Check silent flag using the pre-fetched map
        if (silentMap.get(m._id as string) === true) continue

        // Deduplication: skip if this text was already seen in prior messages
        const extracted = extractTextFromMessage(m)
        const isDuplicate = extracted.some((t) => seenTexts.has(t))
        if (isDuplicate) continue

        // Track seen texts to prevent internal duplicates within the same run
        for (const t of extracted) seenTexts.add(t)
        newAssistantMessages.push(m)
      }

      // Reverse to chronological order (oldest first)
      const chronologicalMessages = newAssistantMessages.reverse()

      // Extract and clean text from each message
      const textMessages: { text: string; messageId: string }[] = []
      for (const msg of chronologicalMessages) {
        let text = ""
        const content = msg.message?.content

        if (msg.text?.trim()) {
          text = msg.text.trim()
        } else if (typeof content === "string" && content.trim()) {
          text = content.trim()
        } else if (Array.isArray(content)) {
          const textParts: string[] = []
          for (const part of content) {
            if (part.type === "text" && part.text?.trim()) {
              textParts.push(part.text.trim())
            }
          }
          if (textParts.length > 0) text = textParts.join("\n")
        }

        if (text) {
          const cleanedText = stripThoughtTags(text)
          if (cleanedText) {
            textMessages.push({
              text: cleanedText,
              messageId: msg._id,
            })
          }
        }
      }

      // ── Thought tag retry logic ──────────────────────────────────────
      // If we had candidate messages with text but ALL were stripped by
      // stripThoughtTags (malformed/unclosed thought tags), retry with correction.
      const hadCandidatesWithText = chronologicalMessages.length > 0
      const allStripped = hadCandidatesWithText && textMessages.length === 0

      if (allStripped) {
        console.warn(
          `⚠️ [GENERATE AGENT RESPONSE] All text stripped on attempt ${attempt} due to malformed thought tags (e.g. unclosed tag).`
        )

        if (attempt <= 2) {
          // Collect original texts for the correction message
          const originalTexts = chronologicalMessages
            .map((msg: any) => {
              if (msg.text?.trim()) return msg.text.trim()
              const content = msg.message?.content
              if (typeof content === "string") return content.trim()
              if (Array.isArray(content)) {
                return content
                  .filter((p: any) => p.type === "text")
                  .map((p: any) => p.text || "")
                  .join("\n")
                  .trim()
              }
              return ""
            })
            .filter((t: string) => t)
            .join("\n---\n")

          console.log(
            `🔄 [GENERATE AGENT RESPONSE] Injecting correction message to agent thread and retrying...`
          )
          await saveMessage(ctx, components.agent, {
            threadId: args.threadId,
            message: {
              role: "user",
              content: `ERROR: Tu respuesta anterior falló de forma catastrófica en el sistema porque dejaste una etiqueta de pensamiento abierta (ej. "<think>" sin "</think>") o escribiste tu respuesta final DENTRO de ella, ocasionando que la respuesta útil se eliminara por completo.\n\nEl texto que emitiste y que fue rechazado por el sistema es:\n"${originalTexts}"\n\nPor favor, genera tu respuesta NUEVAMENTE. Es de suma importancia no generar ningún pensamiento en tu respuesta.`,
            },
          })
          throw new Error("MALFORMED_THOUGHT_TAG")
        } else {
          // Final attempt — use rescueThoughtTags as last resort (strips only tags, keeps content)
          console.warn(
            `⚠️ [GENERATE AGENT RESPONSE] Attempt ${attempt} failed again. Applying heuristic rescue fallback.`
          )
          for (const msg of chronologicalMessages) {
            let text = ""
            const content = msg.message?.content
            if (msg.text?.trim()) text = msg.text.trim()
            else if (typeof content === "string" && content.trim())
              text = content.trim()
            else if (Array.isArray(content)) {
              const parts: string[] = []
              for (const part of content) {
                if (part.type === "text" && part.text?.trim())
                  parts.push(part.text.trim())
              }
              if (parts.length > 0) text = parts.join("\n")
            }
            if (text) {
              const rescued = rescueThoughtTags(text)
              if (rescued) {
                textMessages.push({
                  text: rescued,
                  messageId: msg._id,
                })
              }
            }
          }
        }
      }

      if (textMessages.length > 0) {
        console.log(
          `✅ [GENERATE AGENT RESPONSE] Success on attempt ${attempt} — ${textMessages.length} text message(s) extracted from thread`
        )
        return textMessages
      }

      // No text messages — check if agent used tools (valid) or produced blank output (retry)
      const hadToolCalls = candidateMessages.some(
        (m: any) =>
          m.message?.role === "assistant" &&
          Array.isArray(m.message?.content) &&
          m.message.content.some(
            (p: any) => p.type === "tool-call" || p.type === "tool_use"
          )
      )

      if (hadToolCalls) {
        console.log(
          `⚠️ [GENERATE AGENT RESPONSE] Empty result on attempt ${attempt} — agent likely used tools without generating text`
        )
        return textMessages
      }

      // Blank response with no tools — retry
      console.warn(
        `⚠️ [GENERATE AGENT RESPONSE] Blank text response on attempt ${attempt} with NO tools used. Retrying...`
      )

      if (attempt <= 2) {
        console.log(
          `🔄 [GENERATE AGENT RESPONSE] Injecting correction message for blank response...`
        )
        await saveMessage(ctx, components.agent, {
          threadId: args.threadId,
          message: {
            role: "user",
            content: `ERROR: Tu respuesta anterior fue completamente en blanco (sin texto devuelto). Por favor, asegúrate de generar una respuesta de texto útil para el usuario y bajo ninguna circunstancia uses etiquetas vacías.`,
          },
        })
        throw new Error("BLANK_RESPONSE")
      } else {
        console.warn(
          `⚠️ [GENERATE AGENT RESPONSE] Blank response on final attempt. Returning fallback.`
        )
        return [
          {
            text: "🙏 Lo siento, estoy teniendo problemas para procesar tu solicitud en este momento.",
            messageId: "fallback",
          },
        ]
      }
    } catch (error) {
      console.error(
        `❌ [GENERATE AGENT RESPONSE] Attempt ${attempt} failed:`,
        error
      )
      // Check if error is related to undefined token metrics (expected when no message is returned)
      if (
        error instanceof TypeError &&
        error.message.includes("Cannot read properties of undefined")
      ) {
        console.log(
          "ℹ️ [GENERATE AGENT RESPONSE] No response generated (expected behavior - agent used tools)"
        )
        return []
      }
      // Store error to determine if escalation is needed
      lastError = error as Error
      console.warn(
        `⚠️ [GENERATE AGENT RESPONSE] Attempt ${attempt} failed — ` +
          (attempt === 1
            ? "retrying..."
            : attempt === 2
              ? "retrying with fallback model (openai-o4-mini) on next attempt..."
              : "all attempts exhausted")
      )
      // Continue to next attempt for real errors
    }
  }

  // All attempts failed — attempt to recover partial messages before escalating
  if (lastError) {
    const recoveredMessages: { text: string; messageId: string }[] = []

    // RECOVERY: Search for any assistant messages generated before the error
    if (lastMessageIdBeforeRun) {
      try {
        const currentMessages = await listMessages(ctx, components.agent, {
          threadId: args.threadId,
          paginationOpts: { numItems: 50, cursor: null },
        })

        const lastBeforeRunIndex = lastMessageIdBeforeRun
          ? currentMessages.page.findIndex(
              (m) => m._id === lastMessageIdBeforeRun
            )
          : currentMessages.page.length

        const effectiveRecoveryEndIndex =
          lastBeforeRunIndex >= 0
            ? lastBeforeRunIndex
            : currentMessages.page.length

        const newAssistantMessages = currentMessages.page
          .slice(0, effectiveRecoveryEndIndex)
          .filter(
            (m) =>
              m.message?.role === "assistant" &&
              (m.text?.trim() || hasTextContent(m.message?.content))
          )

        for (const msg of newAssistantMessages.reverse()) {
          let text = ""
          const content = msg.message?.content
          if (msg.text?.trim()) {
            text = msg.text.trim()
          } else if (typeof content === "string" && content.trim()) {
            text = content.trim()
          } else if (Array.isArray(content)) {
            const textParts = (
              content as Array<{ type: string; text?: string }>
            )
              .filter((p) => p.type === "text")
              .map((p) => p.text || "")
              .filter((t) => t.trim())
            if (textParts.length > 0) text = textParts.join("\n").trim()
          }
          if (text) {
            const cleanedText = stripThoughtTags(text)
            if (cleanedText) {
              recoveredMessages.push({
                text: cleanedText,
                messageId: msg._id,
              })
            }
          }
        }

        if (recoveredMessages.length > 0) {
          console.log(
            `🔄 [GENERATE AGENT RESPONSE] Recovered ${recoveredMessages.length} partial message(s) before error`
          )
        }
      } catch (recoveryError) {
        console.error(
          "⚠️ [GENERATE AGENT RESPONSE] Failed to recover partial messages:",
          recoveryError
        )
      }
    }

    // If we recovered messages, return them WITHOUT escalating
    if (recoveredMessages.length > 0) {
      console.log(
        `🔄 [GENERATE AGENT RESPONSE] Returning ${recoveredMessages.length} recovered message(s) — skipping escalation`
      )
      return recoveredMessages
    }

    // No recovered text — escalate to human
    console.log(
      "🚨 [GENERATE AGENT RESPONSE] All attempts failed with no recoverable text, escalating conversation"
    )

    const escalationMessage =
      "Por favor espera un momento mientras un superior continúa la conversación."
    await saveMessage(ctx, components.agent, {
      threadId: args.threadId,
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: escalationMessage,
          },
        ],
      },
    })

    await ctx.runMutation(internal.system.conversations.escalate, {
      threadId: args.threadId,
      reason:
        "Escalación automática: todos los intentos del agente IA fallaron con errores",
    })

    return [{ text: escalationMessage, messageId: "escalation" }]
  }

  // No errors occurred - agent successfully used tools without text response
  console.log(
    "ℹ️ [GENERATE AGENT RESPONSE] No errors occurred - agent successfully used tools without text response"
  )
  return []
}

export const generateAgentResponseAction = internalAction({
  args: {
    conversationId: v.id("conversations"),
    threadId: v.string(),
    organizationId: v.string(),
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    return await generateAgentResponse(ctx, args)
  },
})
/**
 * Marks the last assistant message in the thread as silent.
 * Used by tools to suppress "Announcing" messages.
 */
export const markLastAssistantMessageAsSilent = internalMutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const messages = await listMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: { numItems: 5, cursor: null },
    })

    // Find the most recent assistant message
    const lastAssistantMessage = messages.page.find(
      (m: any) => m.message?.role === "assistant"
    )

    if (lastAssistantMessage) {
      const messageId = lastAssistantMessage._id as string

      // Try to find it in conversationMessages (if synced)
      const existingMessage = await ctx.db
        .query("conversationMessages")
        .withIndex("by_message_id", (q) => q.eq("messageId", messageId))
        .first()

      if (existingMessage) {
        await ctx.db.patch(existingMessage._id, {
          isSilent: true,
        })
        console.log(
          `🤫 [SILENT MESSAGE] Marked conversationMessage ${existingMessage._id} (agent: ${messageId}) as silent`
        )
      } else {
        // If not found in conversationMessages, we can't mark it silent there.
        // This is expected if the message hasn't been synced yet or is purely internal.
        // However, since the User insisted on using conversationMessages, we strictly follow that path.
        // We log it for debugging.
        console.log(
          `ℹ️ [SILENT MESSAGE] Agent message ${messageId} not found in conversationMessages table yet. Skipping silent flag.`
        )
      }
    }
  },
})
