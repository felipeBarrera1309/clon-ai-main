import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { components } from "../_generated/api"
import { query } from "../_generated/server"

export const getMany = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    // TODO: Add check for the contact

    const paginated = await ctx.runQuery(
      components.agent.messages.listMessagesByThreadId,
      {
        threadId: args.threadId,
        order: args.order || "asc",
        ...(args.paginationOpts && { paginationOpts: args.paginationOpts }),
      }
    )

    return paginated
  },
})
