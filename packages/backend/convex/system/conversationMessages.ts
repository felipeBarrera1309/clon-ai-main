import { v } from "convex/values"
import type { Id } from "../_generated/dataModel"
import { internalMutation, internalQuery } from "../_generated/server"

// Type validators for reuse
const messageTypeValidator = v.union(
  v.literal("text"),
  v.literal("image"),
  v.literal("document"),
  v.literal("audio"),
  v.literal("video"),
  v.literal("location"),
  v.literal("contacts"),
  v.literal("sticker"),
  v.literal("interactive"),
  v.literal("template"),
  v.literal("reaction"),
  v.literal("system")
)

const messageStatusValidator = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("read"),
  v.literal("failed")
)

const senderValidator = v.union(
  v.literal("user"), // Cliente/usuario
  v.literal("agent"), // Agente AI
  v.literal("operator"), // Operador humano del dashboard
  v.literal("system") // Mensajes automáticos del sistema
)

const contentValidator = v.object({
  text: v.optional(v.string()),
  media: v.optional(
    v.object({
      url: v.string(),
      mimeType: v.string(),
      filename: v.optional(v.string()),
      caption: v.optional(v.string()),
      storageId: v.optional(v.string()),
    })
  ),
  location: v.optional(
    v.object({
      latitude: v.number(),
      longitude: v.number(),
      name: v.optional(v.string()),
      address: v.optional(v.string()),
    })
  ),
  contacts: v.optional(
    v.array(
      v.object({
        name: v.string(),
        phones: v.array(v.string()),
      })
    )
  ),
  interactive: v.optional(
    v.object({
      type: v.string(),
      body: v.optional(v.string()),
      buttons: v.optional(
        v.array(
          v.object({
            id: v.string(),
            title: v.string(),
          })
        )
      ),
      buttonText: v.optional(v.string()), // For lists
      sections: v.optional(
        v.array(
          v.object({
            title: v.optional(v.string()),
            rows: v.array(
              v.object({
                id: v.string(),
                title: v.string(),
                description: v.optional(v.string()),
              })
            ),
          })
        )
      ),
      header: v.optional(
        v.object({
          type: v.string(),
          text: v.optional(v.string()),
          imageUrl: v.optional(v.string()),
          videoUrl: v.optional(v.string()),
          documentUrl: v.optional(v.string()),
          documentFilename: v.optional(v.string()),
        })
      ),
      footer: v.optional(
        v.object({
          text: v.string(),
        })
      ),
      ctaUrl: v.optional(v.string()),
      ctaButtonText: v.optional(v.string()),
    })
  ),
  reaction: v.optional(
    v.object({
      emoji: v.string(),
      messageId: v.string(),
    })
  ),
})

// Return validator for conversation message documents
const conversationMessageValidator = v.object({
  _id: v.id("conversationMessages"),
  _creationTime: v.number(),
  conversationId: v.id("conversations"),
  organizationId: v.string(),
  messageId: v.optional(v.string()), // Internal message ID
  whatsappMessageId: v.optional(v.string()),
  direction: v.union(v.literal("inbound"), v.literal("outbound")),
  sender: v.optional(senderValidator),
  type: messageTypeValidator,
  content: contentValidator,
  status: v.optional(messageStatusValidator),
  whatsappTimestamp: v.optional(v.number()),
  messageTimestamp: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
  isSilent: v.optional(v.boolean()),
})

// ============================================================================
// INTERNAL MUTATIONS (for use by other backend functions)
// ============================================================================

/**
 * Save an inbound message (from user to bot)
 */
export const saveInboundMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    organizationId: v.string(),
    whatsappMessageId: v.optional(v.string()),
    messageId: v.optional(v.string()),
    type: messageTypeValidator,
    content: contentValidator,
    whatsappTimestamp: v.optional(v.number()),
  },
  returns: v.id("conversationMessages"),
  handler: async (ctx, args): Promise<Id<"conversationMessages">> => {
    const messageId = await ctx.db.insert("conversationMessages", {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      whatsappMessageId: args.whatsappMessageId,
      messageId: args.messageId,
      direction: "inbound",
      sender: "user",
      type: args.type,
      content: args.content,
      whatsappTimestamp: args.whatsappTimestamp,
      messageTimestamp: args.whatsappTimestamp
        ? args.whatsappTimestamp * 1000
        : Date.now(),
    })

    console.log(
      `📥 [CONVERSATION_MESSAGES] Saved inbound ${args.type} message:`,
      messageId
    )

    return messageId
  },
})

/**
 * Save an outbound message (from bot/operator to user)
 */
export const saveOutboundMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    organizationId: v.string(),
    whatsappMessageId: v.optional(v.string()),
    messageId: v.optional(v.string()),
    type: messageTypeValidator,
    content: contentValidator,
    status: v.optional(messageStatusValidator),
    whatsappTimestamp: v.optional(v.number()),
    sender: v.optional(senderValidator),
  },
  returns: v.id("conversationMessages"),
  handler: async (ctx, args): Promise<Id<"conversationMessages">> => {
    const messageId = await ctx.db.insert("conversationMessages", {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      whatsappMessageId: args.whatsappMessageId,
      messageId: args.messageId,
      direction: "outbound",
      sender: args.sender ?? "agent", // Default to agent if not specified
      type: args.type,
      content: args.content,
      status: args.status ?? "sent",
      whatsappTimestamp: args.whatsappTimestamp,
      messageTimestamp: args.whatsappTimestamp
        ? args.whatsappTimestamp * 1000
        : Date.now(),
    })

    console.log(
      `📤 [CONVERSATION_MESSAGES] Saved outbound ${args.type} message from ${args.sender ?? "agent"}:`,
      messageId
    )

    return messageId
  },
})

/**
 * Update message status (for delivery receipts)
 */
export const updateMessageStatus = internalMutation({
  args: {
    whatsappMessageId: v.string(),
    status: messageStatusValidator,
    errorMessage: v.optional(v.string()),
  },
  returns: v.union(v.id("conversationMessages"), v.null()),
  handler: async (ctx, args): Promise<Id<"conversationMessages"> | null> => {
    const message = await ctx.db
      .query("conversationMessages")
      .withIndex("by_whatsapp_id", (q) =>
        q.eq("whatsappMessageId", args.whatsappMessageId)
      )
      .unique()

    if (!message) {
      console.log(
        `⚠️ [CONVERSATION_MESSAGES] Message not found for status update:`,
        args.whatsappMessageId
      )
      return null
    }

    await ctx.db.patch(message._id, {
      status: args.status,
      ...(args.errorMessage && { errorMessage: args.errorMessage }),
    })

    console.log(
      `📊 [CONVERSATION_MESSAGES] Updated status to ${args.status}:`,
      args.whatsappMessageId
    )

    return message._id
  },
})

/**
 * Get message by WhatsApp ID
 */
export const getByWhatsappId = internalQuery({
  args: {
    whatsappMessageId: v.string(),
  },
  returns: v.union(conversationMessageValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversationMessages")
      .withIndex("by_whatsapp_id", (q) =>
        q.eq("whatsappMessageId", args.whatsappMessageId)
      )
      .unique()
  },
})

/**
 * Get message by internal message ID (agent thread message ID)
 */
export const getByMessageId = internalQuery({
  args: {
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversationMessages")
      .withIndex("by_message_id", (q) => q.eq("messageId", args.messageId))
      .first()
  },
})

// ============================================================================
// INTERNAL QUERIES
// ============================================================================

/**
 * Internal query to get messages (no auth check)
 */
export const getByConversationInternal = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  returns: v.array(conversationMessageValidator),
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")

    if (args.limit) {
      return await query.take(args.limit)
    }

    return await query.collect()
  },
})
