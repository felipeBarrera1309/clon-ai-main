import { v } from "convex/values"
import { internalQuery } from "../_generated/server"

export const getAll = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("menuProductCategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
  },
})
