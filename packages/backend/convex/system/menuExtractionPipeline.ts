import { v } from "convex/values"
import { internal } from "../_generated/api"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server"

// ============================================
// PUBLIC QUERY & MUTATIONS
// ============================================

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl()
  },
})

export const getExtractionJob = query({
  args: {
    jobId: v.id("menuExtractionJobs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId)
  },
})

export const createExtractionJob = mutation({
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

    const now = Date.now()
    const jobId = await ctx.db.insert("menuExtractionJobs", {
      organizationId: args.organizationId,
      status: "cleaning",
      fileStorageIds: args.fileStorageIds,
      createdAt: now,
      updatedAt: now,
      generation: 1,
    })
    await ctx.scheduler.runAfter(
      0,
      internal.system.menuExtractionActions.startExtraction,
      { jobId, generation: 1 }
    )
    return jobId
  },
})

export const retryExtraction = mutation({
  args: {
    jobId: v.id("menuExtractionJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId)
    if (!job) throw new Error("Job not found")

    const nextGeneration = (job.generation ?? 0) + 1

    await ctx.db.patch(args.jobId, {
      status: "cleaning",
      error: undefined,
      cleanedText: undefined,
      extractedCategories: undefined,
      extractedSubcategories: undefined,
      extractedSizes: undefined,
      extractedProducts: undefined,
      generation: nextGeneration,
      updatedAt: Date.now(),
    })

    await ctx.scheduler.runAfter(
      0,
      internal.system.menuExtractionActions.startExtraction,
      { jobId: args.jobId, generation: nextGeneration }
    )
  },
})

export const cancelExtraction = mutation({
  args: {
    jobId: v.id("menuExtractionJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId)
    if (!job) throw new Error("Job not found")

    await ctx.db.patch(args.jobId, {
      status: "failed",
      error: "Extraccion cancelada por el usuario",
      generation: (job.generation ?? 0) + 1,
      updatedAt: Date.now(),
    })
  },
})

// ============================================
// INTERNAL QUERY (for actions to read job data)
// ============================================

export const getExtractionJobInternal = internalQuery({
  args: { jobId: v.id("menuExtractionJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId)
  },
})

// ============================================
// INTERNAL MUTATIONS (for actions to update job)
// ============================================

const jobStatusValidator = v.union(
  v.literal("uploading"),
  v.literal("cleaning"),
  v.literal("extracting_categories"),
  v.literal("extracting_subcategories"),
  v.literal("extracting_sizes"),
  v.literal("extracting_products"),
  v.literal("completed"),
  v.literal("failed")
)

// Update job status (and optionally set error)
export const updateJobStatus = internalMutation({
  args: {
    jobId: v.id("menuExtractionJobs"),
    status: jobStatusValidator,
    error: v.optional(v.string()),
    failedAtStage: v.optional(v.string()),
    generation: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.generation !== undefined) {
      const job = await ctx.db.get(args.jobId)
      if (!job || job.generation !== args.generation) return
    }
    await ctx.db.patch(args.jobId, {
      status: args.status,
      error: args.error,
      failedAtStage: args.failedAtStage,
      updatedAt: Date.now(),
    })
  },
})

export const updateJobCleanedText = internalMutation({
  args: {
    jobId: v.id("menuExtractionJobs"),
    status: jobStatusValidator,
    cleanedText: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: args.status,
      cleanedText: args.cleanedText,
      updatedAt: Date.now(),
    })
  },
})

export const updateJobExtractedCategories = internalMutation({
  args: {
    jobId: v.id("menuExtractionJobs"),
    status: jobStatusValidator,
    extractedCategories: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: args.status,
      extractedCategories: args.extractedCategories,
      updatedAt: Date.now(),
    })
  },
})

export const updateJobExtractedSubcategories = internalMutation({
  args: {
    jobId: v.id("menuExtractionJobs"),
    status: jobStatusValidator,
    extractedSubcategories: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: args.status,
      extractedSubcategories: args.extractedSubcategories,
      updatedAt: Date.now(),
    })
  },
})

export const updateJobExtractedSizes = internalMutation({
  args: {
    jobId: v.id("menuExtractionJobs"),
    status: jobStatusValidator,
    extractedSizes: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: args.status,
      extractedSizes: args.extractedSizes,
      updatedAt: Date.now(),
    })
  },
})

export const updateJobExtractedProducts = internalMutation({
  args: {
    jobId: v.id("menuExtractionJobs"),
    status: jobStatusValidator,
    extractedProducts: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: args.status,
      extractedProducts: args.extractedProducts,
      updatedAt: Date.now(),
    })
  },
})
