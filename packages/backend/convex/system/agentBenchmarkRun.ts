import { ConvexError, v } from "convex/values"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import { internalAction } from "../_generated/server"
import { BENCHMARK_BATCH_SIZE } from "./agentBenchmarkDefaults"

export const executeRun = internalAction({
  args: {
    runId: v.id("agentBenchmarkRuns"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean
    runId: Id<"agentBenchmarkRuns">
    totalCases: number
    totalBatches?: number
  }> => {
    const run: Doc<"agentBenchmarkRuns"> | null = await ctx.runQuery(
      internal.system.agentBenchmarkQueries.getRunInternal,
      {
        runId: args.runId,
      }
    )
    if (!run) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Benchmark run not found",
      })
    }

    await ctx.runMutation(
      internal.system.agentBenchmarkQueries.patchRunStatus,
      {
        runId: args.runId,
        status: "running",
        error: undefined,
      }
    )

    console.log(`[BENCHMARK] Run started`, {
      runId: args.runId,
      orgId: run.organizationId,
      trigger: run.trigger,
    })

    try {
      const globalSuite: Doc<"agentBenchmarkSuites"> | null =
        await ctx.runQuery(
          internal.system.agentBenchmarkQueries.getGlobalSuiteInternal,
          {}
        )
      const overlaySuite: Doc<"agentBenchmarkSuites"> | null =
        await ctx.runQuery(
          internal.system.agentBenchmarkQueries.getOverlaySuiteInternal,
          {
            organizationId: run.organizationId,
          }
        )

      if (!globalSuite) {
        throw new Error("Missing global benchmark suite")
      }

      const globalCases: Doc<"agentBenchmarkCases">[] = await ctx.runQuery(
        internal.system.agentBenchmarkQueries.getCasesBySuiteInternal,
        {
          suiteId: globalSuite._id,
        }
      )
      const overlayCases: Doc<"agentBenchmarkCases">[] = overlaySuite
        ? await ctx.runQuery(
            internal.system.agentBenchmarkQueries.getCasesBySuiteInternal,
            {
              suiteId: overlaySuite._id,
            }
          )
        : []

      const allCaseIds: Id<"agentBenchmarkCases">[] = [
        ...globalCases,
        ...overlayCases,
      ].map((c) => c._id)

      const { buildPromptForOrg } = await import("./agentBenchmarkTriggers")
      const systemPrompt = await buildPromptForOrg(ctx, run.organizationId)

      const batches: Id<"agentBenchmarkCases">[][] = []
      for (let i = 0; i < allCaseIds.length; i += BENCHMARK_BATCH_SIZE) {
        batches.push(allCaseIds.slice(i, i + BENCHMARK_BATCH_SIZE))
      }

      if (batches.length === 0) {
        await ctx.runMutation(
          internal.system.agentBenchmarkQueries.patchRunCompleted,
          {
            runId: run._id,
            totalCases: 0,
            passedCases: 0,
            criticalFailures: 0,
            scoreGlobal: 0,
            scoreByDimension: {
              deterministic: 0,
              judge: 0,
              flow: 0,
              safety: 0,
              toolUsage: 0,
              conversational: 0,
            },
            passDecision: false,
            decisionReason: "No hay casos para evaluar",
            totalDurationMs: 0,
          }
        )
        return { success: true, runId: run._id, totalCases: 0 }
      }

      console.log(
        `[BENCHMARK] Scheduling ${batches.length} batches for ${allCaseIds.length} cases`
      )

      await ctx.runMutation(
        internal.system.agentBenchmarkDispatch.scheduleExecuteBatch,
        {
          delay: 0,
          runId: run._id,
          batchIndex: 0,
          caseIds: batches[0]!,
          systemPrompt,
          configuredModel: run.modelConfigured,
          baselineModel: run.modelBaseline,
          totalBatches: batches.length,
          allBatches: batches,
          runStartTime: Date.now(),
        }
      )

      return {
        success: true,
        runId: run._id,
        totalCases: allCaseIds.length,
        totalBatches: batches.length,
      }
    } catch (error) {
      console.error(`[BENCHMARK] Run setup failed`, {
        runId: args.runId,
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.runMutation(
        internal.system.agentBenchmarkQueries.patchRunStatus,
        {
          runId: args.runId,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        }
      )
      throw error
    }
  },
})
