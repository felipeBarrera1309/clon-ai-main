import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery } from "../_generated/server"

export const create = internalMutation({
  args: {
    messageId: v.string(),
    organizationId: v.string(),
    fileStorageId: v.string(),
    fileType: v.union(v.literal("audio"), v.literal("image")),
    fileName: v.string(),
    fileSize: v.number(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messageAttachments", args)
  },
})

export const updateProcessedContent = internalMutation({
  args: {
    fileStorageId: v.string(),
    content: v.string(),
    fileType: v.union(v.literal("audio"), v.literal("image")),
  },
  handler: async (ctx, args) => {
    const attachment = await ctx.db
      .query("messageAttachments")
      .filter((q) => q.eq(q.field("fileStorageId"), args.fileStorageId))
      .first()

    if (!attachment) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Archivo no encontrado",
      })
    }

    const updateField =
      args.fileType === "audio" ? "transcription" : "description"

    return await ctx.db.patch(attachment._id, {
      [updateField]: args.content,
    })
  },
})

export const getByMessageId = internalQuery({
  args: {
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messageAttachments")
      .withIndex("by_message_id", (q) => q.eq("messageId", args.messageId))
      .collect()
  },
})
