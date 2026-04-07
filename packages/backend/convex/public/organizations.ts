import { v } from "convex/values"
import { components } from "../_generated/api"
import { query } from "../_generated/server"

/**
 * Validate if an organization exists
 * This is a public query that can be used to check organization validity
 */
export const validate = query({
  args: {
    organizationId: v.string(),
  },
  returns: v.object({
    valid: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Query the organization directly from the betterAuth component
    // We need to check if the organization exists in the database
    try {
      const organizations = await ctx.runQuery(
        components.betterAuth.organizations.getUserOrganizations,
        {}
      )

      // Check if any organization matches the provided ID
      const organization = organizations.find(
        (org) => org._id === args.organizationId
      )

      if (organization) {
        return { valid: true }
      } else {
        return { valid: false, reason: "Organization not found" }
      }
    } catch {
      // If user is not authenticated, we can't validate
      return { valid: false, reason: "Unable to validate organization" }
    }
  },
})
