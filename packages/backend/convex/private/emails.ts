import { v } from "convex/values"
import { internal } from "../_generated/api"
import { authMutation } from "../lib/helpers"

/**
 * Send an email using the internal email system
 */
export const sendEmail = authMutation({
  args: {
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    text: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    // Call the internal action to send the email
    const emailId = await ctx.scheduler.runAfter(
      0,
      internal.sendEmails.sendManualEmail,
      {
        from: args.from,
        to: args.to,
        subject: args.subject,
        text: args.text,
      }
    )

    return "Email enviado exitosamente"
  },
})
