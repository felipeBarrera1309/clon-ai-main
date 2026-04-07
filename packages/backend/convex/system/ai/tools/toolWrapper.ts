import { createTool } from "@convex-dev/agent"
import type { z } from "zod"
import { internal } from "../../../_generated/api"
import type { ActionCtx } from "../../../_generated/server"
import { containsThoughtTags, stripThoughtTags } from "../../../lib/textUtils"

/**
 * Recursively sanitizes all string values in an object, stripping thought tags.
 * Uses stripThoughtTags (same logic as messages.ts) which removes content INSIDE
 * thought blocks, not just the tag markers.
 * Tracks whether tags were found and whether any string became empty after stripping.
 */
function deepSanitizeArgs(obj: any): {
  sanitized: any
  hadTags: boolean
  hadEmptyAfterSanitize: boolean
} {
  let hadTags = false
  let hadEmptyAfterSanitize = false

  function walk(value: any): any {
    if (typeof value === "string") {
      if (containsThoughtTags(value)) {
        hadTags = true
        const cleaned = stripThoughtTags(value)
        if (!cleaned.trim() && value.trim()) {
          // The entire string was thought content — nothing useful remains
          hadEmptyAfterSanitize = true
        }
        return cleaned
      }
      return value
    }
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === "object") {
      const result: any = {}
      for (const [key, v] of Object.entries(value)) {
        result[key] = walk(v)
      }
      return result
    }
    return value
  }

  return { sanitized: walk(obj), hadTags, hadEmptyAfterSanitize }
}

/**
 * Configuration for a tagged tool.
 */
export interface TaggedToolConfig<T extends z.ZodObject<any>> {
  description: string
  args: T
  /**
   * If true, the tool will mark the invoking assistant message as silent
   * and set the stop signal on the conversation.
   * Can be a boolean or a function that takes the tool arguments.
   */
  silent?: boolean | ((args: z.infer<T>, result?: any) => boolean)
  /**
   * Set to true if this tool dispatches messages directly to WhatsApp.
   * When agentSoftAbort is active (a new user message arrived mid-run),
   * the wrapper will skip the handler entirely and return a deferred response.
   * This prevents zombie WA sends while still returning a valid response to the LLM.
   */
  dispatches?: boolean
  /**
   * The actual handler logic. Returns a message for the agent's "thoughts".
   */
  handler: (
    ctx: ActionCtx & { threadId: string },
    args: z.infer<T>
  ) => Promise<any>
}

/**
 * Creates a tool that automatically wraps its response in <thought/> tags.
 * This ensures the agent treats the tool output as internal information
 * and reduces the risk of leaking technical data to the user.
 *
 * Also sanitizes all string arguments to strip thought tags before execution.
 */
export function createTaggedTool<T extends z.ZodObject<any>>(
  config: TaggedToolConfig<T>
) {
  return createTool({
    description: config.description,
    args: config.args,
    handler: async (agentCtx, args) => {
      // We cast ctx as ActionCtx & { threadId: string } inside the wrapper
      // because createTool context is more generic but we know our agent
      // provides these properties.
      if (!agentCtx.threadId) {
        // Should technically not happen within standard agent execution
        console.warn(
          `⚠️ [TOOL WRAPPER] Missing threadId in tool context for ${config.description}`
        )
      }
      const ctx = agentCtx as ActionCtx & { threadId: string }

      // Sanitize all string arguments — strip thought tags
      const {
        sanitized: sanitizedArgs,
        hadTags,
        hadEmptyAfterSanitize,
      } = deepSanitizeArgs(args)

      // If any string became completely empty after stripping (i.e. it was ALL thought content),
      // abort the tool call and tell the agent to retry with clean arguments.
      if (hadEmptyAfterSanitize) {
        console.warn(
          `⚠️ [TOOL WRAPPER] REJECTED tool call — args became empty after stripping thought tags for: ${config.description.substring(0, 50)}`
        )
        return `<thought>\nERROR: Tu llamada a esta herramienta fue RECHAZADA por el sistema porque los argumentos contienen pensamientos tuyos (<think>, <reasoning>, etc.). La herramienta NO se ejecutó.\n\nDebes reintentar la llamada a esta herramienta con argumentos limpios, sin etiquetas de pensamiento. El texto en campos como "body", "footer", "header" debe ser texto plano dirigido al usuario, sin pensamientos internos ni etiquetas XML.\n</thought>`
      }

      if (hadTags) {
        console.warn(
          `⚠️ [TOOL WRAPPER] Cleaned thought tags from tool arguments for: ${config.description.substring(0, 50)}`
        )
      }

      // Parse through the zod schema to get properly typed args
      // This also serves as runtime validation after sanitization
      const typedArgs = config.args.parse(hadTags ? sanitizedArgs : args)

      // If this tool dispatches to WhatsApp, check agentSoftAbort before executing.
      // When a new message arrives mid-run, scheduleAgentResponse sets agentSoftAbort: true.
      // Tools with dispatches: true skip the handler entirely, returning a deferred response
      // so the LLM doesn't generate error text. The second job (with full context) will
      // call the tool again with the signal cleared and actually send the message.
      if (config.dispatches && ctx.threadId) {
        const conv = await ctx.runQuery(
          internal.system.conversations.getByThreadId,
          { threadId: ctx.threadId }
        )
        if (conv?.agentSoftAbort) {
          console.log(
            `🔕 [TOOL WRAPPER] Dispatch diferido por agentSoftAbort: ${config.description.substring(0, 60)}`
          )
          return `<thought>\n${JSON.stringify(
            {
              success: true,
              status: "deferred",
              internalInfo:
                "Envío diferido: nuevo mensaje en cola. El siguiente run lo procesará con contexto completo.",
            },
            null,
            2
          )}\n</thought>`
        }
      }

      const result = await config.handler(ctx, typedArgs)

      // If the tool is marked as silent, apply the silence/stop logic
      const isSilent =
        typeof config.silent === "function"
          ? config.silent(typedArgs, result)
          : config.silent

      if (isSilent && ctx.threadId) {
        const threadId = ctx.threadId
        await ctx.runMutation(
          internal.system.messages.markLastAssistantMessageAsSilent,
          {
            threadId,
          }
        )
        await ctx.runMutation(internal.system.conversations.setStopSignal, {
          threadId,
        })
      }

      // Wrap the result in <thought> tags
      // We use a clean format to make it easy for the agent to parse
      const stringResult =
        typeof result === "string" ? result : JSON.stringify(result, null, 2)

      return `<thought>\n${stringResult}\n</thought>`
    },
  })
}
