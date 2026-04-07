import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import {
  type PROMPT_AUDIT_ACTIONS,
  type PROMPT_AUDIT_SOURCES,
  PROMPT_TEXT_FIELDS,
} from "./promptAuditConstants"

type PromptAuditSource = (typeof PROMPT_AUDIT_SOURCES)[number]
type PromptAuditAction = (typeof PROMPT_AUDIT_ACTIONS)[number]
type PromptTextField = (typeof PROMPT_TEXT_FIELDS)[number]
type PromptTextSnapshot = Record<PromptTextField, string>

const buildPromptTextSnapshot = (
  config: Doc<"agentConfiguration"> | null | undefined
): PromptTextSnapshot => {
  if (!config) {
    return Object.fromEntries(
      PROMPT_TEXT_FIELDS.map((f) => [f, ""])
    ) as PromptTextSnapshot
  }

  return Object.fromEntries(
    PROMPT_TEXT_FIELDS.map((f) => [f, config[f] ?? ""])
  ) as PromptTextSnapshot
}

export async function upsertAgentConfigurationWithPromptAudit(
  ctx: MutationCtx,
  args: {
    organizationId: string
    updates: Partial<Doc<"agentConfiguration">>
    source: PromptAuditSource
    action: PromptAuditAction
    existingConfig?: Doc<"agentConfiguration"> | null
    changedByUserId: string
    changedByEmail?: string
  }
): Promise<Id<"agentConfiguration">> {
  const existing =
    args.existingConfig !== undefined
      ? args.existingConfig
      : await ctx.db
          .query("agentConfiguration")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .first()

  const before = buildPromptTextSnapshot(existing)

  let configId: Id<"agentConfiguration">
  if (existing) {
    await ctx.db.patch(existing._id, args.updates)
    configId = existing._id
  } else {
    configId = await ctx.db.insert("agentConfiguration", {
      organizationId: args.organizationId,
      ...args.updates,
    })
  }

  const after = buildPromptTextSnapshot(await ctx.db.get(configId))
  const changedFields = PROMPT_TEXT_FIELDS.filter((f) => before[f] !== after[f])

  if (changedFields.length > 0) {
    await ctx.db.insert("agentPromptAuditLogs", {
      organizationId: args.organizationId,
      changedAt: Date.now(),
      changedByUserId: args.changedByUserId,
      changedByEmail: args.changedByEmail,
      source: args.source,
      action: args.action,
      changedFields,
      beforeSnapshot: before,
      afterSnapshot: after,
    })
  }

  return configId
}
