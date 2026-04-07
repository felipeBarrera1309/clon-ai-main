import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import type {
  ConversationAiThreadKind,
  ConversationAiThreadPurpose,
} from "../lib/conversationCost"
import { registerOrganizationAiThread } from "./organizationAiThreads"

export function buildConversationChildThreadCreationArgs(
  conversation: Pick<Doc<"conversations">, "organizationId" | "threadId">,
  args?: {
    summary?: string
    title?: string
  }
) {
  return {
    parentThreadIds: [conversation.threadId],
    summary: args?.summary,
    title: args?.title,
    userId: conversation.organizationId,
  }
}

export async function registerConversationAiThread(
  ctx: MutationCtx,
  args: {
    conversationId: Id<"conversations">
    kind: ConversationAiThreadKind
    organizationId: string
    purpose: ConversationAiThreadPurpose
    threadId: string
  }
) {
  const existingThread = await ctx.db
    .query("conversationAiThreads")
    .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
    .unique()

  if (existingThread) {
    await registerOrganizationAiThread(ctx, {
      assignmentType: "conversation",
      conversationId: args.conversationId,
      kind: args.kind,
      organizationId: args.organizationId,
      purpose: args.purpose,
      resolutionReason: "Thread auxiliar registrado para una conversación",
      resolutionReasonCode: "mapped_to_conversation",
      resolutionStatus: "resolved",
      resolutionType: "conversation",
      threadId: args.threadId,
    })
    return existingThread
  }

  const threadDocId = await ctx.db.insert("conversationAiThreads", {
    conversationId: args.conversationId,
    createdAt: Date.now(),
    kind: args.kind,
    organizationId: args.organizationId,
    purpose: args.purpose,
    threadId: args.threadId,
  })

  await registerOrganizationAiThread(ctx, {
    assignmentType: "conversation",
    conversationId: args.conversationId,
    kind: args.kind,
    organizationId: args.organizationId,
    purpose: args.purpose,
    resolutionReason: "Thread auxiliar registrado para una conversación",
    resolutionReasonCode: "mapped_to_conversation",
    resolutionStatus: "resolved",
    resolutionType: "conversation",
    threadId: args.threadId,
  })

  return await ctx.db.get(threadDocId)
}

export async function listConversationAiThreads(
  ctx: QueryCtx | MutationCtx,
  args: {
    conversationId: Id<"conversations">
  }
) {
  return await ctx.db
    .query("conversationAiThreads")
    .withIndex("by_conversation_id", (q) =>
      q.eq("conversationId", args.conversationId)
    )
    .collect()
}
