import { paginationOptsValidator } from "convex/server"
import { ConvexError, v } from "convex/values"
import {
  type DatabaseReader,
  type DatabaseWriter,
  internalMutation,
  internalQuery,
} from "../_generated/server"
import {
  aiModelValidator,
  benchmarkCaseCategoryValidator,
  benchmarkCasePriorityValidator,
} from "../schema"
import type { BenchmarkCase, OrgBenchmarkContext } from "./agentBenchmarkTypes"

const benchmarkCaseValidator = v.object({
  caseKey: v.string(),
  name: v.string(),
  priority: benchmarkCasePriorityValidator,
  category: benchmarkCaseCategoryValidator,
  inputScript: v.array(
    v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      text: v.string(),
    })
  ),
  mockContext: v.object({
    includeAddressValidation: v.optional(v.boolean()),
    includeMenuLookup: v.optional(v.boolean()),
    includeCombinationValidation: v.optional(v.boolean()),
    includeOrderCreation: v.optional(v.boolean()),
    includeEscalation: v.optional(v.boolean()),
    includeScheduling: v.optional(v.boolean()),
    includePayment: v.optional(v.boolean()),
    locationId: v.optional(v.string()),
    mockErrorScenario: v.optional(v.string()),
    customData: v.optional(
      v.union(v.string(), v.number(), v.boolean(), v.null())
    ),
  }),
  expectedDeterministic: v.object({
    requiredTools: v.optional(v.array(v.string())),
    prohibitedTools: v.optional(v.array(v.string())),
    requiredToolOrder: v.optional(v.array(v.string())),
    forbiddenPhrases: v.optional(v.array(v.string())),
    requiredPhrases: v.optional(v.array(v.string())),
    maxToolCalls: v.optional(v.number()),
    disallowInternalLeakage: v.optional(v.boolean()),
  }),
  judgeRubric: v.object({
    clarityWeight: v.number(),
    accuracyWeight: v.number(),
    contextWeight: v.number(),
    policyWeight: v.number(),
    toneWeight: v.number(),
    expectedTone: v.optional(v.string()),
    successDefinition: v.string(),
  }),
  critical: v.boolean(),
})

async function getActiveSuite(
  ctx: { db: DatabaseReader },
  args: { scope: "global_base" | "org_overlay"; organizationId?: string }
) {
  if (args.scope === "global_base") {
    return await ctx.db
      .query("agentBenchmarkSuites")
      .withIndex("by_scope_and_status", (q) =>
        q.eq("scope", "global_base").eq("status", "active")
      )
      .order("desc")
      .first()
  }

  return await ctx.db
    .query("agentBenchmarkSuites")
    .withIndex("by_org_scope_status", (q) =>
      q
        .eq("organizationId", args.organizationId)
        .eq("scope", "org_overlay")
        .eq("status", "active")
    )
    .order("desc")
    .first()
}

async function createSuiteWithCases(
  ctx: { db: DatabaseReader & DatabaseWriter },
  args: {
    suiteKey: string
    version: number
    scope: "global_base" | "org_overlay"
    source: string
    organizationId?: string
    createdBy?: string
    cases: BenchmarkCase[]
  }
) {
  // Archive previous active suites of the same scope/org
  if (args.scope === "global_base") {
    const existingActive = await ctx.db
      .query("agentBenchmarkSuites")
      .withIndex("by_scope_and_status", (q) =>
        q.eq("scope", "global_base").eq("status", "active")
      )
      .collect()
    for (const suite of existingActive) {
      await ctx.db.patch(suite._id, { status: "archived" })
    }
  } else if (args.scope === "org_overlay" && args.organizationId) {
    const existingActive = await ctx.db
      .query("agentBenchmarkSuites")
      .withIndex("by_org_scope_status", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("scope", "org_overlay")
          .eq("status", "active")
      )
      .collect()
    for (const suite of existingActive) {
      await ctx.db.patch(suite._id, { status: "archived" })
    }
  }

  const suiteId = await ctx.db.insert("agentBenchmarkSuites", {
    suiteKey: args.suiteKey,
    version: args.version,
    status: "active",
    scope: args.scope,
    organizationId: args.organizationId,
    casesCount: args.cases.length,
    source: args.source,
    createdAt: Date.now(),
    createdBy: args.createdBy,
  })

  for (const caseData of args.cases) {
    await ctx.db.insert("agentBenchmarkCases", {
      suiteId,
      caseKey: caseData.caseKey,
      name: caseData.name,
      priority: caseData.priority,
      category: caseData.category,
      inputScript: caseData.inputScript,
      mockContext: caseData.mockContext,
      expectedDeterministic: caseData.expectedDeterministic,
      judgeRubric: caseData.judgeRubric,
      critical: caseData.critical,
      enabled: true,
      createdAt: Date.now(),
    })
  }

  return suiteId
}

export const createRunRecord = internalMutation({
  args: {
    organizationId: v.string(),
    trigger: v.union(
      v.literal("onboarding"),
      v.literal("prompt_change"),
      v.literal("weekly"),
      v.literal("manual")
    ),
    suiteVersionGlobal: v.number(),
    suiteVersionOverlay: v.optional(v.number()),
    modelConfigured: aiModelValidator,
    modelBaseline: aiModelValidator,
  },
  handler: async (ctx, args) => {
    // Atomic check-and-create: prevents TOCTOU race condition.
    // Since this runs inside a mutation (transaction), no other mutation
    // can interleave between the check and the insert.
    const recentRuns = await ctx.db
      .query("agentBenchmarkRuns")
      .withIndex("by_organization_and_started_at", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(5)

    const activeRun =
      recentRuns.find(
        (run) => run.status === "queued" || run.status === "running"
      ) ?? null

    if (activeRun) {
      if (args.trigger === "manual") {
        throw new ConvexError({
          code: "CONFLICT",
          message:
            "Ya existe un benchmark activo para esta organización. Espera a que termine antes de iniciar otro.",
        })
      }
      return null // Non-manual triggers silently skip
    }

    return await ctx.db.insert("agentBenchmarkRuns", {
      organizationId: args.organizationId,
      trigger: args.trigger,
      suiteVersionGlobal: args.suiteVersionGlobal,
      suiteVersionOverlay: args.suiteVersionOverlay,
      modelConfigured: args.modelConfigured,
      modelBaseline: args.modelBaseline,
      status: "queued",
      startedAt: Date.now(),
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
      decisionReason: "Pendiente",
    })
  },
})

export const getRunInternal = internalQuery({
  args: {
    runId: v.id("agentBenchmarkRuns"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId)
  },
})

export const getGlobalSuiteInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await getActiveSuite(ctx, { scope: "global_base" })
  },
})

export const getOverlaySuiteInternal = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await getActiveSuite(ctx, {
      scope: "org_overlay",
      organizationId: args.organizationId,
    })
  },
})

export const getCasesBySuiteInternal = internalQuery({
  args: {
    suiteId: v.id("agentBenchmarkSuites"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentBenchmarkCases")
      .withIndex("by_suite_and_enabled", (q) =>
        q.eq("suiteId", args.suiteId).eq("enabled", true)
      )
      .collect()
  },
})

export const getAgentConfigInternal = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()
  },
})

export const getRestaurantConfigInternal = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("restaurantConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()
  },
})

export const getActiveLocationsInternal = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("available"), true))
      .collect()
  },
})

export const getDebugSignalsInternal = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("adminDebugConversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(10)
  },
})

export const getActiveRunForOrg = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("agentBenchmarkRuns")
      .withIndex("by_organization_and_started_at", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(5)

    return (
      runs.find((run) => run.status === "queued" || run.status === "running") ??
      null
    )
  },
})

export const getSuiteByIdInternal = internalQuery({
  args: {
    suiteId: v.id("agentBenchmarkSuites"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.suiteId)
  },
})

export const createSuiteWithCasesInternal = internalMutation({
  args: {
    suiteKey: v.string(),
    version: v.number(),
    scope: v.union(v.literal("global_base"), v.literal("org_overlay")),
    organizationId: v.optional(v.string()),
    source: v.string(),
    createdBy: v.optional(v.string()),
    cases: v.array(benchmarkCaseValidator),
  },
  handler: async (ctx, args) => {
    const suiteId = await createSuiteWithCases(ctx, {
      suiteKey: args.suiteKey,
      version: args.version,
      scope: args.scope,
      organizationId: args.organizationId,
      source: args.source,
      createdBy: args.createdBy,
      cases: args.cases,
    })
    return suiteId
  },
})

export const patchRunStatus = internalMutation({
  args: {
    runId: v.id("agentBenchmarkRuns"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: args.status,
      error: args.error,
    })
  },
})

export const patchRunCompleted = internalMutation({
  args: {
    runId: v.id("agentBenchmarkRuns"),
    totalCases: v.number(),
    passedCases: v.number(),
    criticalFailures: v.number(),
    scoreGlobal: v.number(),
    scoreByDimension: v.object({
      deterministic: v.number(),
      judge: v.number(),
      flow: v.number(),
      safety: v.number(),
      toolUsage: v.number(),
      conversational: v.number(),
    }),
    passDecision: v.boolean(),
    decisionReason: v.string(),
    totalDurationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "completed",
      finishedAt: Date.now(),
      totalCases: args.totalCases,
      passedCases: args.passedCases,
      criticalFailures: args.criticalFailures,
      scoreGlobal: args.scoreGlobal,
      scoreByDimension: args.scoreByDimension,
      passDecision: args.passDecision,
      decisionReason: args.decisionReason,
      totalDurationMs: args.totalDurationMs,
      error: undefined,
    })
  },
})

export const insertCaseResult = internalMutation({
  args: {
    runId: v.id("agentBenchmarkRuns"),
    caseId: v.id("agentBenchmarkCases"),
    modelProfile: v.union(v.literal("configured"), v.literal("baseline")),
    deterministicChecks: v.object({
      passed: v.boolean(),
      score: v.number(),
      checks: v.array(
        v.object({
          name: v.string(),
          passed: v.boolean(),
          critical: v.boolean(),
          details: v.optional(v.string()),
        })
      ),
    }),
    judgeScore: v.number(),
    judgeRationale: v.string(),
    judgeDimensions: v.optional(
      v.object({
        clarity: v.number(),
        accuracy: v.number(),
        context: v.number(),
        policy: v.number(),
        tone: v.number(),
      })
    ),
    finalScore: v.number(),
    pass: v.boolean(),
    criticalFailure: v.boolean(),
    failureType: v.optional(v.string()),
    traceRef: v.optional(v.string()),
    toolCalls: v.array(v.string()),
    assistantTranscript: v.array(v.string()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("agentBenchmarkCaseResults", {
      runId: args.runId,
      caseId: args.caseId,
      modelProfile: args.modelProfile,
      deterministicChecks: args.deterministicChecks,
      judgeScore: args.judgeScore,
      judgeRationale: args.judgeRationale,
      judgeDimensions: args.judgeDimensions,
      finalScore: args.finalScore,
      pass: args.pass,
      criticalFailure: args.criticalFailure,
      failureType: args.failureType,
      traceRef: args.traceRef,
      toolCalls: args.toolCalls,
      assistantTranscript: args.assistantTranscript,
      durationMs: args.durationMs,
      createdAt: Date.now(),
    })
  },
})

export const insertRecommendation = internalMutation({
  args: {
    runId: v.id("agentBenchmarkRuns"),
    organizationId: v.string(),
    section: v.union(
      v.literal("brandVoice"),
      v.literal("businessRules"),
      v.literal("specialInstructions"),
      v.literal("coreIdentityOverride"),
      v.literal("coreToolsOverride"),
      v.literal("coreConversationOverride"),
      v.literal("coreOperationsOverride")
    ),
    problemPattern: v.string(),
    beforeText: v.string(),
    afterText: v.string(),
    expectedImpact: v.string(),
    confidence: v.number(),
    affectedCases: v.optional(v.array(v.string())),
    status: v.union(
      v.literal("proposed"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("applied")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("agentBenchmarkRecommendations", {
      ...args,
      createdAt: Date.now(),
    })
  },
})

export const listRunsByOrganization = internalQuery({
  args: {
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentBenchmarkRuns")
      .withIndex("by_organization_and_started_at", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .paginate(args.paginationOpts)
  },
})

export const getRunReportInternal = internalQuery({
  args: {
    runId: v.id("agentBenchmarkRuns"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return null

    const results = await ctx.db
      .query("agentBenchmarkCaseResults")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .collect()

    const recommendations = await ctx.db
      .query("agentBenchmarkRecommendations")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .collect()

    const caseIds = [...new Set(results.map((result) => result.caseId))]
    const cases = await Promise.all(caseIds.map((caseId) => ctx.db.get(caseId)))
    const caseMap = new Map(
      cases
        .filter((caseDoc): caseDoc is NonNullable<typeof caseDoc> => !!caseDoc)
        .map((caseDoc) => [caseDoc._id, caseDoc] as const)
    )

    return {
      run,
      summary: {
        totalCases: run.totalCases,
        passedCases: run.passedCases,
        criticalFailures: run.criticalFailures,
        scoreGlobal: run.scoreGlobal,
        passDecision: run.passDecision,
        scoreByDimension: run.scoreByDimension,
      },
      caseResults: results.map((result) => ({
        ...result,
        case: caseMap.get(result.caseId) || null,
      })),
      recommendations,
    }
  },
})

export const listRecommendationsByRun = internalQuery({
  args: {
    runId: v.id("agentBenchmarkRuns"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentBenchmarkRecommendations")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .collect()
  },
})

export const getCaseByIdInternal = internalQuery({
  args: {
    caseId: v.id("agentBenchmarkCases"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.caseId)
  },
})

export const getCaseResultsByRun = internalQuery({
  args: {
    runId: v.id("agentBenchmarkRuns"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentBenchmarkCaseResults")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .collect()
  },
})

export const getOrgBenchmarkContext = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args): Promise<OrgBenchmarkContext> => {
    const menuProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const menuCategories = await ctx.db
      .query("menuProductCategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const sizes = await ctx.db
      .query("sizes")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const restaurantLocations = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const restaurantConfig = await ctx.db
      .query("restaurantConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    const menuProductAvailability = await ctx.db
      .query("menuProductAvailability")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const deliveryAreas = await ctx.db
      .query("deliveryAreas")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    return {
      menuProducts,
      menuCategories,
      sizes,
      restaurantLocations,
      restaurantConfig,
      deliveryAreas,
      menuProductAvailability,
    }
  },
})
