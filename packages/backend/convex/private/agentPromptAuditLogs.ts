import { paginationOptsValidator } from "convex/server"
import { ConvexError, v } from "convex/values"
import { components } from "../_generated/api"
import { authQuery } from "../lib/helpers"

export const listByOrganization = authQuery({
  args: {
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const activeOrganizationId = await ctx.runQuery(
      components.betterAuth.organizations.getActiveOrganizationId,
      {}
    )
    if (!activeOrganizationId || activeOrganizationId !== args.organizationId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "No tienes permisos para ver este historial",
      })
    }

    return await ctx.db
      .query("agentPromptAuditLogs")
      .withIndex("by_organization_and_changed_at", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .paginate(args.paginationOpts)
  },
})
