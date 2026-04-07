import { listMessages, saveMessage } from "@convex-dev/agent"
import type { PaginationOptions } from "convex/server"
import { components } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import {
  BadRequestError,
  ConversationNotFoundError,
  UnauthorizedError,
} from "../lib/errors"
import {
  checkContactHasUnresolvedConversations,
  escalateConversation,
} from "./conversations"

export const createMessage = async (
  ctx: MutationCtx & { identity: { name: string } },
  args: {
    organizationId: string
    prompt: string
    conversationId: Id<"conversations">
  }
) => {
  const conversation = await ctx.db.get(args.conversationId)

  if (!conversation) {
    throw new ConversationNotFoundError()
  }

  if (conversation.organizationId !== args.organizationId) {
    throw new UnauthorizedError("ID de organización inválido")
  }

  if (conversation.status === "resolved") {
    throw new BadRequestError("Conversación resuelta")
  }

  if (conversation.status === "unresolved") {
    // Check if contact has other unresolved conversations before escalating
    const hasUnresolvedConversations =
      await checkContactHasUnresolvedConversations(
        ctx,
        conversation.contactId,
        args.conversationId // Exclude current conversation
      )

    if (hasUnresolvedConversations) {
      throw new BadRequestError(
        "No se puede enviar el mensaje porque el contacto ya tiene otras conversaciones activas"
      )
    }

    await escalateConversation(ctx, conversation, {
      reason:
        "Operador respondió directamente al cliente en conversación no escalada",
    })
  }

  await saveMessage(ctx, components.agent, {
    threadId: conversation.threadId,
    agentName: ctx.identity.name,
    message: {
      role: "assistant",
      content: args.prompt,
    },
  })

  // Update conversation's last message time
  await ctx.db.patch(args.conversationId, {
    lastMessageAt: Date.now(),
  })
}

export const getMessages = async (
  ctx: QueryCtx,
  args: {
    organizationId: string
    threadId: string
    paginationOpts: PaginationOptions
  }
) => {
  const conversation = await ctx.db
    .query("conversations")
    .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
    .unique()

  if (!conversation) {
    throw new ConversationNotFoundError()
  }

  if (conversation.organizationId !== args.organizationId) {
    throw new UnauthorizedError("ID de organización inválido")
  }

  const paginated = await listMessages(ctx, components.agent, {
    threadId: args.threadId,
    paginationOpts: args.paginationOpts,
  })

  return paginated
}
