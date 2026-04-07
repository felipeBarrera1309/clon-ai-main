"use node"

import { type FilePart, generateObject, type TextPart } from "ai"
import { v } from "convex/values"
import { internal } from "../_generated/api"
import { internalAction } from "../_generated/server"
import { type AIModelType, createLanguageModel } from "../lib/aiModels"
import {
  COMBO_EXTRACTION_PROMPT,
  extractedCombosSchema,
} from "./comboExtractionSchema"

export {
  matchProductNames,
  type ProductMatchResult,
} from "../lib/fuzzyProductMatching"

const EXTRACTION_MODEL: AIModelType = "gemini-3.0-flash"

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "application/pdf",
]

export const processComboExtraction = internalAction({
  args: {
    jobId: v.id("comboExtractionJobs"),
  },
  handler: async (ctx, args) => {
    try {
      const job = await ctx.runQuery(
        internal.system.comboExtractionPipeline.getComboExtractionJobInternal,
        { jobId: args.jobId }
      )
      if (!job) throw new Error("Job not found")
      if (job.status === "failed") return

      const fileData: Array<{ base64: string; mediaType: string }> = []
      for (const storageId of job.fileStorageIds) {
        const blob = await ctx.storage.get(storageId)
        if (!blob) {
          throw new Error(`File not found in storage: ${storageId}`)
        }
        const mimeType = blob.type || "application/octet-stream"
        if (
          !ALLOWED_MIME_TYPES.includes(mimeType) &&
          !mimeType.startsWith("image/")
        ) {
          throw new Error(
            `Tipo de archivo no soportado: ${mimeType}. Solo se aceptan imagenes y PDF.`
          )
        }
        const arrayBuffer = await blob.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString("base64")
        fileData.push({
          base64,
          mediaType: blob.type || "application/octet-stream",
        })
      }

      const model = createLanguageModel(EXTRACTION_MODEL)

      const fileParts: FilePart[] = fileData.map(({ base64, mediaType }) => ({
        type: "file" as const,
        data: base64,
        mediaType,
      }))

      const textPart: TextPart = {
        type: "text",
        text: COMBO_EXTRACTION_PROMPT,
      }

      const { object } = await generateObject({
        model,
        schema: extractedCombosSchema,
        messages: [
          {
            role: "user",
            content: [...fileParts, textPart],
          },
        ],
      })

      await ctx.runMutation(
        internal.system.comboExtractionPipeline.updateComboJobExtractedCombos,
        {
          jobId: args.jobId,
          status: "completed",
          extractedCombos: JSON.stringify(object),
        }
      )
    } catch (error) {
      await ctx.runMutation(
        internal.system.comboExtractionPipeline.updateComboJobStatus,
        {
          jobId: args.jobId,
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "Error desconocido en extraccion de combos",
          failedAtStage: "extraction",
        }
      )
    }
  },
})
