import { ConvexError, v } from "convex/values"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { ActionCtx } from "../_generated/server"
import { internalAction } from "../_generated/server"
import { DEFAULT_SUPPORT_AGENT_MODEL } from "../lib/aiModels"
import { buildOrgOverlayCases } from "./agentBenchmark"
import {
  BENCHMARK_BASELINE_MODEL,
  buildGlobalBenchmarkSuiteV1,
} from "./agentBenchmarkDefaults"
import { buildCompleteAgentSystemPrompt } from "./ai/constants"

export async function buildPromptForOrg(
  ctx: Pick<ActionCtx, "runQuery">,
  organizationId: string
): Promise<string> {
  const agentConfig = await ctx.runQuery(
    internal.system.agentBenchmarkQueries.getAgentConfigInternal,
    { organizationId }
  )

  const restaurantConfig = await ctx.runQuery(
    internal.system.agentBenchmarkQueries.getRestaurantConfigInternal,
    { organizationId }
  )

  const locations = await ctx.runQuery(
    internal.system.agentBenchmarkQueries.getActiveLocationsInternal,
    { organizationId }
  )

  const orgContext = await ctx.runQuery(
    internal.system.agentBenchmarkQueries.getOrgBenchmarkContext,
    { organizationId }
  )

  return buildCompleteAgentSystemPrompt({
    agentConfig,
    contact: {
      organizationId,
      phoneNumber: "+57000000000",
      displayName: "[Contacto benchmark]",
    },
    contactPreviousOrders: [],
    totalOrderCount: 0,
    restaurantConfig,
    restaurantLocations: locations,
    menuCategories: orgContext?.menuCategories ?? [],
    automaticFirstReplyEnabled:
      restaurantConfig?.automaticFirstReply?.enabled ?? false,
  })
}

async function ensureGlobalSuiteViaQueries(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  createdBy?: string
): Promise<Doc<"agentBenchmarkSuites"> | null> {
  const active: Doc<"agentBenchmarkSuites"> | null = await ctx.runQuery(
    internal.system.agentBenchmarkQueries.getGlobalSuiteInternal,
    {}
  )
  if (active) return active

  const baseCases = buildGlobalBenchmarkSuiteV1()
  const suiteKey = "global_base_v1"
  const suiteId: Id<"agentBenchmarkSuites"> = await ctx.runMutation(
    internal.system.agentBenchmarkQueries.createSuiteWithCasesInternal,
    {
      suiteKey,
      version: 1,
      scope: "global_base",
      source: "seed:v1",
      createdBy,
      cases: baseCases,
    }
  )

  return await ctx.runQuery(
    internal.system.agentBenchmarkQueries.getSuiteByIdInternal,
    { suiteId }
  )
}

async function ensureOverlaySuiteViaQueries(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  organizationId: string,
  createdBy?: string
): Promise<Doc<"agentBenchmarkSuites"> | null> {
  const active: Doc<"agentBenchmarkSuites"> | null = await ctx.runQuery(
    internal.system.agentBenchmarkQueries.getOverlaySuiteInternal,
    { organizationId }
  )
  if (active) return active

  const restaurantConfig = await ctx.runQuery(
    internal.system.agentBenchmarkQueries.getRestaurantConfigInternal,
    { organizationId }
  )

  const debugSignals = await ctx.runQuery(
    internal.system.agentBenchmarkQueries.getDebugSignalsInternal,
    { organizationId }
  )

  type DebugSignal = Doc<"adminDebugConversations">

  const cases = buildOrgOverlayCases({
    organizationId,
    restaurantConfig,
    debugSignals: debugSignals
      .filter(
        (item: DebugSignal): item is DebugSignal & { reason: string } =>
          !!item.reason?.trim()
      )
      .map((item: DebugSignal & { reason: string }) => ({
        reason: item.reason,
      })),
  })

  const suiteId: Id<"agentBenchmarkSuites"> = await ctx.runMutation(
    internal.system.agentBenchmarkQueries.createSuiteWithCasesInternal,
    {
      suiteKey: `org_overlay_${organizationId}`,
      version: 1,
      scope: "org_overlay",
      organizationId,
      source: "generated:config+debug",
      createdBy,
      cases,
    }
  )

  return await ctx.runQuery(
    internal.system.agentBenchmarkQueries.getSuiteByIdInternal,
    { suiteId }
  )
}

export const createRunFromTrigger = internalAction({
  args: {
    organizationId: v.string(),
    trigger: v.union(
      v.literal("onboarding"),
      v.literal("prompt_change"),
      v.literal("weekly"),
      v.literal("manual")
    ),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ runId: Id<"agentBenchmarkRuns"> | null; skipped?: boolean }> => {
    const createdBy = `trigger:${args.trigger}`
    const globalSuite: Doc<"agentBenchmarkSuites"> | null =
      await ensureGlobalSuiteViaQueries(ctx, createdBy)
    const overlaySuite: Doc<"agentBenchmarkSuites"> | null =
      await ensureOverlaySuiteViaQueries(ctx, args.organizationId, createdBy)

    if (!globalSuite) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "No se pudo inicializar suite global de benchmark",
      })
    }

    const agentConfig: Doc<"agentConfiguration"> | null = await ctx.runQuery(
      internal.system.agentBenchmarkQueries.getAgentConfigInternal,
      {
        organizationId: args.organizationId,
      }
    )

    const runId: Id<"agentBenchmarkRuns"> | null = await ctx.runMutation(
      internal.system.agentBenchmarkQueries.createRunRecord,
      {
        organizationId: args.organizationId,
        trigger: args.trigger,
        suiteVersionGlobal: globalSuite.version,
        suiteVersionOverlay: overlaySuite?.version,
        modelConfigured:
          agentConfig?.supportAgentModel ?? DEFAULT_SUPPORT_AGENT_MODEL,
        modelBaseline: BENCHMARK_BASELINE_MODEL,
      }
    )

    if (!runId) {
      return { runId: null, skipped: true }
    }

    await ctx.runMutation(
      internal.system.agentBenchmarkDispatch.scheduleExecuteRun,
      { runId }
    )
    return { runId }
  },
})
