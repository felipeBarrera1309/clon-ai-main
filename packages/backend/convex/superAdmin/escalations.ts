import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import {
  categorizeEscalationReason,
  escalationReasonCategoryLabels,
} from "../lib/escalationReason"
import { platformSuperAdminQuery } from "../lib/superAdmin"

type EscalationStatusFilter = "unresolved" | "escalated" | "resolved"

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

const resolveTimestamp = (value?: string, endOfDay = false) => {
  if (!value) return undefined
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return undefined
  if (endOfDay && DATE_ONLY_REGEX.test(value)) {
    return parsed + 24 * 60 * 60 * 1000 - 1
  }
  return parsed
}

const getEscalationReasonText = (value: unknown) =>
  typeof value === "string" ? value : ""

export const listEscalations = platformSuperAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    organizationId: v.optional(v.string()),
    reasonCategories: v.optional(v.array(v.string())),
    reasonText: v.optional(v.string()),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("unresolved"),
        v.literal("escalated"),
        v.literal("resolved")
      )
    ),
  },
  handler: async (ctx, args) => {
    const startTimestamp = resolveTimestamp(args.dateFrom)
    const endTimestamp = resolveTimestamp(args.dateTo, true)
    const reasonQuery = args.reasonText?.toLowerCase().trim()
    const selectedCategories = new Set(args.reasonCategories ?? [])
    const targetSize = args.paginationOpts.numItems
    const filteredRows = [] as Array<{
      _id: string
      conversationId: string
      threadId: string | null
      organizationId: string
      reason: string
      reasonCategory: string
      reasonCategoryLabel: string
      lastCustomerMessage?: string
      escalatedAt: number
      conversationStatus: EscalationStatusFilter | "unknown"
      contactDisplayName?: string
      contactPhone?: string
    }>

    const maxScan = Math.max(targetSize * 3, targetSize)
    const page = args.organizationId
      ? await ctx.db
          .query("conversationEscalations")
          .withIndex("by_organization_and_escalated_at", (q) => {
            const base = q.eq("organizationId", args.organizationId!)
            if (startTimestamp !== undefined) {
              return base.gte("escalatedAt", startTimestamp)
            }
            return base
          })
          .order("desc")
          .paginate({
            cursor: args.paginationOpts.cursor,
            numItems: maxScan,
          })
      : startTimestamp !== undefined
        ? await ctx.db
            .query("conversationEscalations")
            .withIndex("by_escalated_at", (q) => {
              return q.gte("escalatedAt", startTimestamp)
            })
            .order("desc")
            .paginate({
              cursor: args.paginationOpts.cursor,
              numItems: maxScan,
            })
        : await ctx.db.query("conversationEscalations").order("desc").paginate({
            cursor: args.paginationOpts.cursor,
            numItems: maxScan,
          })

    const scanned = page.page.length
    const scanLimitReached = scanned >= maxScan && !page.isDone

    for (const escalation of page.page) {
      const reasonText = getEscalationReasonText(escalation.reason)
      const reasonCategory = categorizeEscalationReason(reasonText)

      if (
        selectedCategories.size > 0 &&
        !selectedCategories.has(reasonCategory)
      ) {
        continue
      }

      if (reasonQuery && !reasonText.toLowerCase().includes(reasonQuery)) {
        continue
      }

      if (
        startTimestamp !== undefined &&
        escalation.escalatedAt < startTimestamp
      ) {
        continue
      }

      if (endTimestamp !== undefined && escalation.escalatedAt > endTimestamp) {
        continue
      }

      const conversation = await ctx.db.get(escalation.conversationId)
      const conversationStatus = conversation?.status ?? "unknown"

      if (args.status && conversationStatus !== args.status) {
        continue
      }

      const contact = conversation
        ? await ctx.db.get(conversation.contactId)
        : null

      filteredRows.push({
        _id: escalation._id,
        conversationId: escalation.conversationId,
        threadId: conversation?.threadId ?? null,
        organizationId: escalation.organizationId,
        reason: reasonText || "Sin motivo especificado",
        reasonCategory,
        reasonCategoryLabel:
          escalationReasonCategoryLabels[
            reasonCategory as keyof typeof escalationReasonCategoryLabels
          ] ?? reasonCategory,
        lastCustomerMessage: escalation.lastCustomerMessage,
        escalatedAt: escalation.escalatedAt,
        conversationStatus,
        contactDisplayName: contact?.displayName,
        contactPhone: contact?.phoneNumber,
      })

      if (filteredRows.length >= targetSize) {
        break
      }
    }

    return {
      page: filteredRows,
      isDone: page.isDone && !scanLimitReached,
      continueCursor: page.continueCursor,
      scanned,
      scanLimitReached,
    }
  },
})

export const getEscalationReasonFacets = platformSuperAdminQuery({
  args: {
    organizationId: v.optional(v.string()),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const startTimestamp = resolveTimestamp(args.dateFrom)
    const endTimestamp = resolveTimestamp(args.dateTo, true)

    const counts = new Map<string, number>()
    const maxScan = 5000
    const rows = args.organizationId
      ? await ctx.db
          .query("conversationEscalations")
          .withIndex("by_organization_and_escalated_at", (q) => {
            const base = q.eq("organizationId", args.organizationId!)
            if (startTimestamp !== undefined) {
              return base.gte("escalatedAt", startTimestamp)
            }
            return base
          })
          .order("desc")
          .take(maxScan)
      : startTimestamp !== undefined
        ? await ctx.db
            .query("conversationEscalations")
            .withIndex("by_escalated_at", (q) => {
              return q.gte("escalatedAt", startTimestamp)
            })
            .order("desc")
            .take(maxScan)
        : await ctx.db
            .query("conversationEscalations")
            .order("desc")
            .take(maxScan)

    for (const escalation of rows) {
      if (
        startTimestamp !== undefined &&
        escalation.escalatedAt < startTimestamp
      ) {
        continue
      }

      if (endTimestamp !== undefined && escalation.escalatedAt > endTimestamp) {
        continue
      }

      const category = categorizeEscalationReason(
        getEscalationReasonText(escalation.reason)
      )
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }

    return Array.from(counts.entries())
      .map(([category, count]) => ({
        category,
        label:
          escalationReasonCategoryLabels[
            category as keyof typeof escalationReasonCategoryLabels
          ] ?? category,
        count,
      }))
      .sort((a, b) => b.count - a.count)
  },
})
