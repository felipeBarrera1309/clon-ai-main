import { createThread } from "@convex-dev/agent"
import { ConvexError, v } from "convex/values"
import { components } from "../_generated/api"
import { mutation, query } from "../_generated/server"
import { createConversation } from "../model/conversations"

export const getOne = query({
  args: {
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId)

    if (!contact) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Sesión inválida",
      })
    }

    const conversation = await ctx.db.get(args.conversationId)

    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversación no encontrada",
      })
    }

    return {
      _id: conversation._id,
      status: conversation.status,
      threadId: conversation.threadId,
    }
  },
})

export const getOrCreateByContactId = mutation({
  args: {
    contactId: v.id("contacts"),
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
    businessPhoneNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId)

    if (!contact) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Sesión inválida",
      })
    }

    let whatsappConfigurationId = args.whatsappConfigurationId

    // If no whatsappConfigurationId provided, find it by business phone number
    if (!whatsappConfigurationId && args.businessPhoneNumber) {
      const whatsappConfig = await ctx.db
        .query("whatsappConfigurations")
        .withIndex("by_phone_number", (q) =>
          q.eq("phoneNumber", args.businessPhoneNumber!)
        )
        .filter((q) => q.eq(q.field("isActive"), true))
        .first()

      if (!whatsappConfig) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message:
            "No se encontró la configuración de WhatsApp para este número de negocio",
        })
      }

      whatsappConfigurationId = whatsappConfig._id
    }

    if (!whatsappConfigurationId) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message:
          "ID de configuración de WhatsApp o número de negocio es requerido",
      })
    }

    // Check for existing unresolved conversation with this WhatsApp configuration
    const existingUnresolvedConversation = await ctx.db
      .query("conversations")
      .withIndex("by_contact_and_whatsapp_config", (q) =>
        q
          .eq("contactId", contact._id)
          .eq("whatsappConfigurationId", whatsappConfigurationId!)
      )
      .filter((q) => q.eq(q.field("status"), "unresolved"))
      .first()
    if (existingUnresolvedConversation) {
      return existingUnresolvedConversation._id
    }

    // Check for existing escalated conversation with this WhatsApp configuration
    const existingEscalatedConversation = await ctx.db
      .query("conversations")
      .withIndex("by_contact_and_whatsapp_config", (q) =>
        q
          .eq("contactId", contact._id)
          .eq("whatsappConfigurationId", whatsappConfigurationId!)
      )
      .filter((q) => q.eq(q.field("status"), "escalated"))
      .first()
    if (existingEscalatedConversation) {
      return existingEscalatedConversation._id
    }

    // Create new conversation with specific WhatsApp configuration
    const threadId = await createThread(ctx, components.agent, {
      userId: contact.organizationId,
    })

    const conversation = await createConversation(ctx, {
      contactId: contact._id,
      status: "unresolved",
      threadId: threadId,
      organizationId: contact.organizationId,
      whatsappConfigurationId: whatsappConfigurationId!,
    })

    return conversation._id
  },
})
