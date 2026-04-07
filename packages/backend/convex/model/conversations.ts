import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { aggregateConversationsByOrganization } from "../conversationsAggregate"
import { ConversationNotFoundError, CreationFailedError } from "../lib/errors"
import { cancelInactivityTimers } from "./activityTimers"
import { registerConversationAiThread } from "./conversationAiThreads"

export const getConversationById = async (
  ctx: QueryCtx | MutationCtx,
  args: { conversationId: Id<"conversations"> }
) => {
  const conversation = await ctx.db.get(args.conversationId)
  if (!conversation) throw new ConversationNotFoundError()
  return conversation
}

export const getConversationByThreadId = async (
  ctx: QueryCtx | MutationCtx,
  args: { threadId: string }
) => {
  const conversation = await ctx.db
    .query("conversations")
    .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
    .unique()
  if (!conversation) throw new ConversationNotFoundError()
  return conversation
}

export const getConversationNotInResolvedStatusByContactIdAndTwilioConfig =
  async (
    ctx: QueryCtx | MutationCtx,
    args: {
      contactId: Id<"contacts">
      twilioConfigurationId: Id<"whatsappConfigurations">
    }
  ) => {
    // First try to find an unresolved conversation with the specific Twilio configuration
    const unresolvedConversation = await ctx.db
      .query("conversations")
      .withIndex("by_contact_twilio_status", (q) =>
        q
          .eq("contactId", args.contactId)
          .eq("twilioConfigurationId", args.twilioConfigurationId)
          .eq("status", "unresolved")
      )
      .first()

    if (unresolvedConversation) {
      return unresolvedConversation
    }

    // Then try to find an escalated conversation with the specific Twilio configuration
    const escalatedConversation = await ctx.db
      .query("conversations")
      .withIndex("by_contact_twilio_status", (q) =>
        q
          .eq("contactId", args.contactId)
          .eq("twilioConfigurationId", args.twilioConfigurationId)
          .eq("status", "escalated")
      )
      .first()

    return escalatedConversation || null
  }

export const getConversationNotInResolvedStatusByContactIdAndWhatsappConfig =
  async (
    ctx: QueryCtx | MutationCtx,
    args: {
      contactId: Id<"contacts">
      whatsappConfigurationId: Id<"whatsappConfigurations">
    }
  ) => {
    // First try to find an unresolved conversation with the specific WhatsApp configuration
    const unresolvedConversation = await ctx.db
      .query("conversations")
      .withIndex("by_contact_whatsapp_status", (q) =>
        q
          .eq("contactId", args.contactId)
          .eq("whatsappConfigurationId", args.whatsappConfigurationId)
          .eq("status", "unresolved")
      )
      .first()

    if (unresolvedConversation) {
      return unresolvedConversation
    }

    // Then try to find an escalated conversation with the specific WhatsApp configuration
    const escalatedConversation = await ctx.db
      .query("conversations")
      .withIndex("by_contact_whatsapp_status", (q) =>
        q
          .eq("contactId", args.contactId)
          .eq("whatsappConfigurationId", args.whatsappConfigurationId)
          .eq("status", "escalated")
      )
      .first()

    return escalatedConversation || null
  }

export const getConversationNotInResolvedStatusByContactIdAndDialog360Config =
  async (
    ctx: QueryCtx | MutationCtx,
    args: {
      contactId: Id<"contacts">
      dialog360ConfigurationId: Id<"whatsappConfigurations">
    }
  ) => {
    // 360dialog uses the same whatsappConfigurationId field for storage
    // First try to find an unresolved conversation with the specific 360dialog configuration
    const unresolvedConversation = await ctx.db
      .query("conversations")
      .withIndex("by_contact_whatsapp_status", (q) =>
        q
          .eq("contactId", args.contactId)
          .eq("whatsappConfigurationId", args.dialog360ConfigurationId)
          .eq("status", "unresolved")
      )
      .first()

    if (unresolvedConversation) {
      return unresolvedConversation
    }

    // Then try to find an escalated conversation with the specific 360dialog configuration
    const escalatedConversation = await ctx.db
      .query("conversations")
      .withIndex("by_contact_whatsapp_status", (q) =>
        q
          .eq("contactId", args.contactId)
          .eq("whatsappConfigurationId", args.dialog360ConfigurationId)
          .eq("status", "escalated")
      )
      .first()

    return escalatedConversation || null
  }

export const getConversationNotInResolvedStatusByContactIdAndGupshupConfig =
  async (
    ctx: QueryCtx | MutationCtx,
    args: {
      contactId: Id<"contacts">
      gupshupConfigurationId: Id<"whatsappConfigurations">
    }
  ) => {
    // Gupshup uses the same whatsappConfigurationId field for storage
    // First try to find an unresolved conversation with the specific Gupshup configuration
    const unresolvedConversation = await ctx.db
      .query("conversations")
      .withIndex("by_contact_whatsapp_status", (q) =>
        q
          .eq("contactId", args.contactId)
          .eq("whatsappConfigurationId", args.gupshupConfigurationId)
          .eq("status", "unresolved")
      )
      .first()

    if (unresolvedConversation) {
      return unresolvedConversation
    }

    // Then try to find an escalated conversation with the specific Gupshup configuration
    const escalatedConversation = await ctx.db
      .query("conversations")
      .withIndex("by_contact_whatsapp_status", (q) =>
        q
          .eq("contactId", args.contactId)
          .eq("whatsappConfigurationId", args.gupshupConfigurationId)
          .eq("status", "escalated")
      )
      .first()

    return escalatedConversation || null
  }

export const createConversation = async (
  ctx: MutationCtx,
  args: {
    contactId: Id<"contacts">
    threadId: string
    organizationId: string
    status: "unresolved" | "escalated" | "resolved"
    whatsappConfigurationId?: Id<"whatsappConfigurations">
    twilioConfigurationId?: Id<"whatsappConfigurations">
    dialog360ConfigurationId?: Id<"whatsappConfigurations">
    gupshupConfigurationId?: Id<"whatsappConfigurations">
    lastMessageAt?: number
  }
) => {
  // 360dialog and Gupshup use the whatsappConfigurationId field for storage
  const whatsappConfigId =
    args.gupshupConfigurationId ||
    args.dialog360ConfigurationId ||
    args.whatsappConfigurationId

  const conversationId = await ctx.db.insert("conversations", {
    contactId: args.contactId,
    status: args.status,
    threadId: args.threadId,
    organizationId: args.organizationId,
    whatsappConfigurationId: whatsappConfigId,
    twilioConfigurationId: args.twilioConfigurationId,
    lastMessageAt: args.lastMessageAt,
  })
  const conversation = await ctx.db.get(conversationId)
  if (!conversation) {
    throw new CreationFailedError("No se pudo crear la conversación")
  }
  await aggregateConversationsByOrganization.insertIfDoesNotExist(
    ctx,
    conversation
  )
  await registerConversationAiThread(ctx, {
    conversationId: conversation._id,
    kind: "primary",
    organizationId: conversation.organizationId,
    purpose: "support-agent",
    threadId: conversation.threadId,
  })
  return conversation
}

type ConversationPatch = Partial<Omit<Doc<"conversations">, "_creationTime" | "_id">>

export const patchConversationAndSyncAggregate = async (
  ctx: MutationCtx,
  args: {
    conversationId: Id<"conversations">
    patch: ConversationPatch
  }
) => {
  const previousConversation = await ctx.db.get(args.conversationId)

  if (!previousConversation) {
    throw new ConversationNotFoundError()
  }

  await ctx.db.patch(args.conversationId, args.patch)

  const updatedConversation = await ctx.db.get(args.conversationId)

  if (!updatedConversation) {
    throw new ConversationNotFoundError()
  }

  await aggregateConversationsByOrganization.replaceOrInsert(
    ctx,
    previousConversation,
    updatedConversation
  )

  return updatedConversation
}

// Helper function to check if contact has unresolved conversations (excluding current conversation)
export const checkContactHasUnresolvedConversations = async (
  ctx: QueryCtx | MutationCtx,
  contactId: Id<"contacts">,
  excludeConversationId?: Id<"conversations">
) => {
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_contact_id", (q) => q.eq("contactId", contactId))
    .filter((q) => q.neq(q.field("status"), "resolved"))
    .collect()

  const filtered = excludeConversationId
    ? conversations.filter((conv) => conv._id !== excludeConversationId)
    : conversations

  return filtered.length > 0
}

// Helper function to check if contact has unresolved conversations for a specific WhatsApp configuration
export const checkContactHasUnresolvedConversationsForWhatsappConfig = async (
  ctx: QueryCtx | MutationCtx,
  contactId: Id<"contacts">,
  whatsappConfigurationId: Id<"whatsappConfigurations">,
  excludeConversationId?: Id<"conversations">
) => {
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_contact_and_whatsapp_config", (q) =>
      q
        .eq("contactId", contactId)
        .eq("whatsappConfigurationId", whatsappConfigurationId)
    )
    .filter((q) => q.neq(q.field("status"), "resolved"))
    .collect()

  const filtered = excludeConversationId
    ? conversations.filter((conv) => conv._id !== excludeConversationId)
    : conversations

  return filtered.length > 0
}

// Helper function to escalate a conversation
export const escalateConversation = async (
  ctx: MutationCtx,
  conversation: Doc<"conversations">,
  metadata?: {
    reason?: string
    lastCustomerMessage?: string
  }
) => {
  const hasUnresolvedConversations =
    await checkContactHasUnresolvedConversations(
      ctx,
      conversation.contactId,
      conversation._id
    )

  if (hasUnresolvedConversations) {
    console.warn(
      "⚠️ [ESCALATION] Contact already has other active conversations, but proceeding with escalation."
    )
  }

  await cancelInactivityTimers(ctx, conversation._id)

  if (
    conversation.orderCreatedBeforeEscalation !== true &&
    !conversation.orderId
  ) {
    await ctx.db.patch(conversation._id, {
      status: "escalated",
      orderCreatedBeforeEscalation: false,
    })
  } else {
    await ctx.db.patch(conversation._id, { status: "escalated" })
  }

  await ctx.db.insert("conversationEscalations", {
    conversationId: conversation._id,
    organizationId: conversation.organizationId,
    reason: metadata?.reason ?? "Sin motivo especificado",
    lastCustomerMessage: metadata?.lastCustomerMessage,
    escalatedAt: Date.now(),
  })

  return conversation
}
