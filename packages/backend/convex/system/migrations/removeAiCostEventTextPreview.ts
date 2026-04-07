import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import { internalAction, internalMutation } from "../../_generated/server"

const DEFAULT_PAGE_SIZE = 200
const MAX_PAGE_SIZE = 500

const cleanupPageRef = makeFunctionReference<"mutation">(
  "system/migrations/removeAiCostEventTextPreview:cleanupPage"
)

function normalizePageSize(pageSize?: number) {
  return Math.max(1, Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))
}

function hasLegacyTextPreview(metadata: unknown) {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "textPreview" in metadata
  )
}

const paginatedArgs = {
  cursor: v.union(v.string(), v.null()),
  pageSize: v.optional(v.number()),
}

export const dryRun = internalMutation({
  args: paginatedArgs,
  handler: async (ctx, args) => {
    const page = await ctx.db.query("aiCostEvents").paginate({
      cursor: args.cursor,
      numItems: normalizePageSize(args.pageSize),
    })

    const affectedEventIds = page.page
      .filter((event) => hasLegacyTextPreview(event.metadata))
      .map((event) => event._id)

    return {
      affectedEventIds,
      affectedRows: affectedEventIds.length,
      isDone: page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
      scannedRows: page.page.length,
    }
  },
})

export const cleanupPage = internalMutation({
  args: paginatedArgs,
  handler: async (ctx, args) => {
    const page = await ctx.db.query("aiCostEvents").paginate({
      cursor: args.cursor,
      numItems: normalizePageSize(args.pageSize),
    })

    let patchedRows = 0

    for (const event of page.page) {
      if (!hasLegacyTextPreview(event.metadata)) {
        continue
      }

      await ctx.db.patch(event._id, {
        metadata: event.metadata
          ? {
              isCustomerVisible: event.metadata.isCustomerVisible,
              role: event.metadata.role,
              threadPurpose: event.metadata.threadPurpose,
            }
          : undefined,
      })
      patchedRows += 1
    }

    return {
      isDone: page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
      patchedRows,
      scannedRows: page.page.length,
    }
  },
})

export const cleanupAll = internalAction({
  args: {
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let cursor: string | null = null
    let pagesProcessed = 0
    let patchedRows = 0
    let scannedRows = 0

    while (true) {
      const result: {
        isDone: boolean
        nextCursor: string | null
        patchedRows: number
        scannedRows: number
      } = await ctx.runMutation(cleanupPageRef, {
        cursor,
        pageSize: args.pageSize,
      })

      pagesProcessed += 1
      patchedRows += result.patchedRows
      scannedRows += result.scannedRows

      if (result.isDone) {
        return {
          pagesProcessed,
          patchedRows,
          scannedRows,
        }
      }

      cursor = result.nextCursor
    }
  },
})
