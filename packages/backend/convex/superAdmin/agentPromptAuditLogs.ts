import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import {
  assertOrganizationAccess,
  platformAdminOrImplementorQuery,
} from "../lib/superAdmin"

export const listByOrganization = platformAdminOrImplementorQuery({
  args: {
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await assertOrganizationAccess(ctx, args.organizationId)

    return await ctx.db
      .query("agentPromptAuditLogs")
      .withIndex("by_organization_and_changed_at", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .paginate(args.paginationOpts)
  },
})
