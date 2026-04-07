import { v } from "convex/values"
import { authQuery } from "../lib/helpers"

export const listByCity = authQuery({
  args: {
    cityKey: v.union(v.literal("bucaramanga"), v.literal("bogota")),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("deliveryAreaTemplates")
      .withIndex("by_city_key_and_active", (q) =>
        q.eq("cityKey", args.cityKey).eq("isActive", true)
      )
      .collect()
      .then((templates) =>
        templates.sort((a, b) => a.displayOrder - b.displayOrder)
      )
  },
})
