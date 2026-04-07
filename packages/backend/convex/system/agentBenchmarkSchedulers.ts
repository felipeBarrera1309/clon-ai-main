import { v } from "convex/values"
import { internal } from "../_generated/api"
import { internalMutation } from "../_generated/server"

export const enqueueOnPromptChange = internalMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(
      0,
      internal.system.agentBenchmarkTriggers.createRunFromTrigger,
      {
        organizationId: args.organizationId,
        trigger: "prompt_change",
      }
    )
    return { scheduled: true }
  },
})

export const enqueueOnOnboardingComplete = internalMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(
      0,
      internal.system.agentBenchmarkTriggers.createRunFromTrigger,
      {
        organizationId: args.organizationId,
        trigger: "onboarding",
      }
    )
    return { scheduled: true }
  },
})
