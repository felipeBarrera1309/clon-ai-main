import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import { internalMutation } from "../_generated/server"
import { aiModelValidator } from "../schema"

const executeBatchRef = makeFunctionReference<"action">(
  "system/agentBenchmarkBatch:executeBatch"
)

const finalizeBenchmarkRunRef = makeFunctionReference<"action">(
  "system/agentBenchmarkFinalize:finalizeBenchmarkRun"
)

const executeRunRef = makeFunctionReference<"action">(
  "system/agentBenchmarkRun:executeRun"
)

const createRunFromTriggerRef = makeFunctionReference<"action">(
  "system/agentBenchmarkTriggers:createRunFromTrigger"
)

export const scheduleExecuteBatch = internalMutation({
  args: {
    delay: v.number(),
    runId: v.id("agentBenchmarkRuns"),
    batchIndex: v.number(),
    caseIds: v.array(v.id("agentBenchmarkCases")),
    systemPrompt: v.string(),
    configuredModel: aiModelValidator,
    baselineModel: aiModelValidator,
    totalBatches: v.number(),
    allBatches: v.array(v.array(v.id("agentBenchmarkCases"))),
    runStartTime: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(args.delay, executeBatchRef, {
      runId: args.runId,
      batchIndex: args.batchIndex,
      caseIds: args.caseIds,
      systemPrompt: args.systemPrompt,
      configuredModel: args.configuredModel,
      baselineModel: args.baselineModel,
      totalBatches: args.totalBatches,
      allBatches: args.allBatches,
      runStartTime: args.runStartTime,
    })
  },
})

export const scheduleFinalize = internalMutation({
  args: {
    runId: v.id("agentBenchmarkRuns"),
    runStartTime: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, finalizeBenchmarkRunRef, {
      runId: args.runId,
      runStartTime: args.runStartTime,
    })
  },
})

export const scheduleExecuteRun = internalMutation({
  args: {
    runId: v.id("agentBenchmarkRuns"),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, executeRunRef, {
      runId: args.runId,
    })
  },
})

export const scheduleCreateRunFromTrigger = internalMutation({
  args: {
    delay: v.number(),
    organizationId: v.string(),
    trigger: v.union(
      v.literal("onboarding"),
      v.literal("prompt_change"),
      v.literal("weekly"),
      v.literal("manual")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(args.delay, createRunFromTriggerRef, {
      organizationId: args.organizationId,
      trigger: args.trigger,
    })
  },
})
