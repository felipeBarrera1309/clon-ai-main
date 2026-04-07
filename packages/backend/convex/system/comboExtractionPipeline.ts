import { v } from "convex/values"
import { internal } from "../_generated/api"
import { internalMutation, internalQuery } from "../_generated/server"
import {
  matchProductNames,
  type ProductMatchResult,
} from "../lib/fuzzyProductMatching"
import { authMutation, authQuery } from "../lib/helpers"

// ============================================
// PUBLIC QUERY & MUTATIONS
// ============================================

export const generateUploadUrl = authMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl()
  },
})

export const getComboExtractionJob = authQuery({
  args: {
    jobId: v.id("comboExtractionJobs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId)
  },
})

export const createComboExtractionJob = authMutation({
  args: {
    organizationId: v.string(),
    fileStorageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    if (args.fileStorageIds.length === 0) {
      throw new Error("Se requiere al menos un archivo")
    }
    if (args.fileStorageIds.length > 5) {
      throw new Error("Maximo 5 archivos permitidos")
    }

    const jobId = await ctx.db.insert("comboExtractionJobs", {
      organizationId: args.organizationId,
      status: "processing",
      fileStorageIds: args.fileStorageIds,
    })

    await ctx.scheduler.runAfter(
      0,
      internal.system.comboExtractionActions.processComboExtraction,
      { jobId }
    )

    return jobId
  },
})

export const retryComboExtraction = authMutation({
  args: {
    jobId: v.id("comboExtractionJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId)
    if (!job) throw new Error("Job not found")
    if (job.status === "processing") {
      throw new Error("El job ya está en procesamiento")
    }

    await ctx.db.patch(args.jobId, {
      status: "processing",
      error: undefined,
      failedAtStage: undefined,
      extractedCombos: undefined,
    })

    await ctx.scheduler.runAfter(
      0,
      internal.system.comboExtractionActions.processComboExtraction,
      { jobId: args.jobId }
    )
  },
})

// ============================================
// INTERNAL QUERY (for actions to read job data)
// ============================================

export const getComboExtractionJobInternal = internalQuery({
  args: { jobId: v.id("comboExtractionJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId)
  },
})

// ============================================
// INTERNAL MUTATIONS (for actions to update job)
// ============================================

const comboJobStatusValidator = v.union(
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed")
)

export const updateComboJobStatus = internalMutation({
  args: {
    jobId: v.id("comboExtractionJobs"),
    status: comboJobStatusValidator,
    error: v.optional(v.string()),
    failedAtStage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: args.status,
      error: args.error,
      failedAtStage: args.failedAtStage,
    })
  },
})

export const updateComboJobExtractedCombos = internalMutation({
  args: {
    jobId: v.id("comboExtractionJobs"),
    status: comboJobStatusValidator,
    extractedCombos: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: args.status,
      extractedCombos: args.extractedCombos,
    })
  },
})

export const getProductMatches = authQuery({
  args: {
    organizationId: v.string(),
    productNames: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const menuProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const productsForMatching = menuProducts.map((p) => ({
      _id: p._id as string,
      name: p.name,
      price: p.price,
    }))

    const matchesMap = matchProductNames(args.productNames, productsForMatching)

    const result: Record<string, ProductMatchResult[]> = {}
    for (const [name, matches] of matchesMap) {
      result[name] = matches
    }

    return result
  },
})
