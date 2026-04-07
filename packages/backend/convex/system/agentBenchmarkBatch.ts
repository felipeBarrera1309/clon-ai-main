import { v } from "convex/values"
import { internal } from "../_generated/api"
import { internalAction } from "../_generated/server"
import { aiModelValidator } from "../schema"
import type { BenchmarkCase } from "./agentBenchmarkTypes"

export const executeBatch = internalAction({
  args: {
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
    const { runCaseWithRetries } = await import("./agentBenchmarkRunner")

    const run = await ctx.runQuery(
      internal.system.agentBenchmarkQueries.getRunInternal,
      { runId: args.runId }
    )
    if (!run || run.status === "failed") {
      console.log(
        `[BENCHMARK] Batch ${args.batchIndex} skipped — run cancelled or failed`
      )
      return
    }

    const orgContext = await ctx.runQuery(
      internal.system.agentBenchmarkQueries.getOrgBenchmarkContext,
      { organizationId: run.organizationId }
    )

    console.log(
      `[BENCHMARK] Batch ${args.batchIndex + 1}/${args.totalBatches} started (${args.caseIds.length} cases)`
    )

    try {
      for (const caseId of args.caseIds) {
        const caseDoc = await ctx.runQuery(
          internal.system.agentBenchmarkQueries.getCaseByIdInternal,
          { caseId }
        )
        if (!caseDoc) continue

        const caseData: BenchmarkCase = {
          caseKey: caseDoc.caseKey,
          name: caseDoc.name,
          priority: caseDoc.priority,
          category: caseDoc.category,
          inputScript: caseDoc.inputScript,
          mockContext: caseDoc.mockContext,
          expectedDeterministic: caseDoc.expectedDeterministic,
          judgeRubric: caseDoc.judgeRubric,
          critical: caseDoc.critical,
        }

        const configuredResult = await runCaseWithRetries(ctx, {
          organizationId: run.organizationId,
          caseId: caseDoc._id,
          caseData,
          model: args.configuredModel,
          modelProfile: "configured",
          systemPrompt: args.systemPrompt,
          orgContext: orgContext ?? undefined,
        })
        await ctx.runMutation(
          internal.system.agentBenchmarkQueries.insertCaseResult,
          {
            runId: run._id,
            caseId: caseDoc._id,
            modelProfile: "configured",
            deterministicChecks: configuredResult.deterministic,
            judgeScore: configuredResult.judge.score,
            judgeRationale: configuredResult.judge.rationale,
            judgeDimensions: configuredResult.judge.dimensions,
            finalScore: configuredResult.finalScore,
            pass: configuredResult.pass,
            criticalFailure: configuredResult.criticalFailure,
            failureType: configuredResult.failureType,
            traceRef: configuredResult.traceRef,
            toolCalls: configuredResult.toolCalls,
            assistantTranscript: configuredResult.assistantTranscript,
            durationMs: configuredResult.durationMs,
          }
        )

        const baselineResult = await runCaseWithRetries(ctx, {
          organizationId: run.organizationId,
          caseId: caseDoc._id,
          caseData,
          model: args.baselineModel,
          modelProfile: "baseline",
          systemPrompt: args.systemPrompt,
          orgContext: orgContext ?? undefined,
        })
        await ctx.runMutation(
          internal.system.agentBenchmarkQueries.insertCaseResult,
          {
            runId: run._id,
            caseId: caseDoc._id,
            modelProfile: "baseline",
            deterministicChecks: baselineResult.deterministic,
            judgeScore: baselineResult.judge.score,
            judgeRationale: baselineResult.judge.rationale,
            judgeDimensions: baselineResult.judge.dimensions,
            finalScore: baselineResult.finalScore,
            pass: baselineResult.pass,
            criticalFailure: baselineResult.criticalFailure,
            failureType: baselineResult.failureType,
            traceRef: baselineResult.traceRef,
            toolCalls: baselineResult.toolCalls,
            assistantTranscript: baselineResult.assistantTranscript,
            durationMs: baselineResult.durationMs,
          }
        )

        console.log(`[BENCHMARK] Case completed`, {
          caseKey: caseDoc.caseKey,
          configuredScore: configuredResult.finalScore,
          baselineScore: baselineResult.finalScore,
          durationMs: configuredResult.durationMs + baselineResult.durationMs,
        })
      }

      console.log(
        `[BENCHMARK] Batch ${args.batchIndex + 1}/${args.totalBatches} completed`
      )

      const nextBatchIndex = args.batchIndex + 1
      if (nextBatchIndex < args.totalBatches) {
        await ctx.runMutation(
          internal.system.agentBenchmarkDispatch.scheduleExecuteBatch,
          {
            delay: 0,
            runId: args.runId,
            batchIndex: nextBatchIndex,
            caseIds: args.allBatches[nextBatchIndex]!,
            systemPrompt: args.systemPrompt,
            configuredModel: args.configuredModel,
            baselineModel: args.baselineModel,
            totalBatches: args.totalBatches,
            allBatches: args.allBatches,
            runStartTime: args.runStartTime,
          }
        )
      } else {
        await ctx.runMutation(
          internal.system.agentBenchmarkDispatch.scheduleFinalize,
          {
            runId: args.runId,
            runStartTime: args.runStartTime,
          }
        )
      }
    } catch (error) {
      console.error(`[BENCHMARK] Batch ${args.batchIndex} failed`, {
        runId: args.runId,
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.runMutation(
        internal.system.agentBenchmarkQueries.patchRunStatus,
        {
          runId: args.runId,
          status: "failed",
          error: `Batch ${args.batchIndex} failed: ${error instanceof Error ? error.message : String(error)}`,
        }
      )
    }
  },
})
