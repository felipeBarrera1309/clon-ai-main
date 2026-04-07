import { v } from "convex/values"
import { internal } from "../_generated/api"
import type { Doc } from "../_generated/dataModel"
import { internalAction } from "../_generated/server"
import { BENCHMARK_PASS_THRESHOLD } from "./agentBenchmarkDefaults"

export const finalizeBenchmarkRun = internalAction({
  args: {
    runId: v.id("agentBenchmarkRuns"),
    runStartTime: v.number(),
  },
  handler: async (ctx, args) => {
    const { computeRunScoreBreakdown, buildRecommendationsFromResults } =
      await import("./agentBenchmarkRunner")

    const run = await ctx.runQuery(
      internal.system.agentBenchmarkQueries.getRunInternal,
      { runId: args.runId }
    )
    if (!run || run.status === "failed") return

    type CaseResult = Doc<"agentBenchmarkCaseResults">
    type BenchmarkCase = Doc<"agentBenchmarkCases">

    const allCaseResults: CaseResult[] = await ctx.runQuery(
      internal.system.agentBenchmarkQueries.getCaseResultsByRun,
      { runId: args.runId }
    )

    const caseIds = [
      ...new Set(allCaseResults.map((r: CaseResult) => r.caseId)),
    ]
    const caseDocs = await Promise.all(
      caseIds.map((id) =>
        ctx.runQuery(
          internal.system.agentBenchmarkQueries.getCaseByIdInternal,
          {
            caseId: id,
          }
        )
      )
    )
    const caseMap = new Map<string, BenchmarkCase>(
      caseDocs
        .filter(
          (
            caseDoc: Doc<"agentBenchmarkCases"> | null
          ): caseDoc is Doc<"agentBenchmarkCases"> => !!caseDoc
        )
        .map(
          (caseDoc: Doc<"agentBenchmarkCases">) =>
            [caseDoc._id, caseDoc as BenchmarkCase] as const
        )
    )

    const configuredResults = allCaseResults.filter(
      (r: CaseResult) => r.modelProfile === "configured"
    )
    const totalCases = configuredResults.length
    const passedCases = configuredResults.filter(
      (r: CaseResult) => r.pass
    ).length
    const criticalFailures = configuredResults.filter(
      (r: CaseResult) => r.criticalFailure
    ).length
    const scoreGlobal =
      totalCases > 0
        ? Math.round(
            configuredResults.reduce(
              (sum: number, r: CaseResult) => sum + r.finalScore,
              0
            ) / totalCases
          )
        : 0

    const resultsForScoring = configuredResults.map((r: CaseResult) => {
      const caseDoc = caseMap.get(r.caseId)
      return {
        modelProfile: r.modelProfile,
        caseId: r.caseId,
        category: caseDoc?.category ?? "flow",
        critical: caseDoc?.critical ?? r.criticalFailure,
        deterministic: r.deterministicChecks,
        judge: {
          score: r.judgeScore,
          rationale: r.judgeRationale,
          dimensions: r.judgeDimensions,
        },
        finalScore: r.finalScore,
        pass: r.pass,
        criticalFailure: r.criticalFailure,
        failureType: r.failureType,
        toolCalls: r.toolCalls,
        assistantTranscript: r.assistantTranscript,
        traceRef: r.traceRef ?? "",
        durationMs: r.durationMs ?? 0,
      }
    })

    const scoreByDimension = computeRunScoreBreakdown(resultsForScoring)
    const passDecision =
      scoreGlobal >= BENCHMARK_PASS_THRESHOLD && criticalFailures === 0
    const decisionReason = passDecision
      ? "Benchmark aprobado: score y criticos dentro de umbral"
      : `Benchmark reprobado: score=${scoreGlobal}, criticalFailures=${criticalFailures}`

    const totalDurationMs = Date.now() - args.runStartTime

    await ctx.runMutation(
      internal.system.agentBenchmarkQueries.patchRunCompleted,
      {
        runId: run._id,
        totalCases,
        passedCases,
        criticalFailures,
        scoreGlobal,
        scoreByDimension,
        passDecision,
        decisionReason,
        totalDurationMs,
      }
    )

    const agentConfig = await ctx.runQuery(
      internal.system.agentBenchmarkQueries.getAgentConfigInternal,
      {
        organizationId: run.organizationId,
      }
    )
    const recommendations = buildRecommendationsFromResults({
      runResults: resultsForScoring,
      agentConfig,
    })

    for (const recommendation of recommendations) {
      await ctx.runMutation(
        internal.system.agentBenchmarkQueries.insertRecommendation,
        {
          runId: run._id,
          organizationId: run.organizationId,
          section: recommendation.section,
          problemPattern: recommendation.problemPattern,
          beforeText: recommendation.beforeText,
          afterText: recommendation.afterText,
          expectedImpact: recommendation.expectedImpact,
          confidence: recommendation.confidence,
          affectedCases: recommendation.affectedCases,
          status: "proposed",
        }
      )
    }

    console.log(`[BENCHMARK] Run completed`, {
      runId: run._id,
      scoreGlobal,
      passDecision,
      totalCases,
      criticalFailures,
      totalDurationMs,
    })
  },
})
