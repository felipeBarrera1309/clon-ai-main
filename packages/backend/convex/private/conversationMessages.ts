import { paginationOptsValidator } from "convex/server"
import { ConvexError, v } from "convex/values"
import { query } from "../_generated/server"

/**
 * Get messages for a conversation (paginated) - for dashboard display
 *
 * Note: We don't specify a `returns` validator for paginated queries because
 * Convex's pagination result includes internal fields (pageStatus, splitCursor)
 * that may change between versions. The return type is inferred automatically.
 */
export const listByConversation = query({
  args: {
    organizationId: v.string(),
    conversationId: v.id("conversations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "No autenticado",
      })
    }

    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Conversación no encontrada",
      })
    }

    if (args.organizationId !== conversation.organizationId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "No autorizado para ver esta conversación",
      })
    }

    return await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation_timestamp", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .paginate(args.paginationOpts)
  },
})
