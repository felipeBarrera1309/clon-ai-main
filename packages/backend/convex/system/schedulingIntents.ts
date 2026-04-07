import { v } from "convex/values"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../_generated/server"
import { DEFAULT_FOLLOW_UP_SEQUENCE } from "../lib/followUpConstants"
import { cancelInactivityTimers } from "../model/activityTimers"

// ============================================================================
// SCHEDULING INTENTS — Centralized deferred scheduling system
//
// Problem: ctx.scheduler.runAfter from within long-running Convex actions
// silently fails. Scheduled functions never execute.
//
// Solution: Actions create "intents" in a table. An independent process
// (status webhook + cron fallback) reads pending intents and schedules
// the actual functions from a clean context where the scheduler works.
// ============================================================================

/**
 * Create a scheduling intent. Any action or mutation can call this to
 * register deferred work. Automatically deduplicates by conversation+type.
 */
export const createSchedulingIntent = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    type: v.union(
      v.literal("followUpStep"),
      v.literal("firstTurnSchedule"),
      v.literal("menuSend"),
      v.literal("agentResponse")
    ),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    // Cancel any existing pending intent of same type+conversation (idempotent)
    const existing = await ctx.db
      .query("schedulingIntents")
      .withIndex("by_conversation_type_and_status", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("type", args.type)
          .eq("status", "pending")
      )
      .collect()
    for (const intent of existing) {
      await ctx.db.delete(intent._id)
    }

    const id = await ctx.db.insert("schedulingIntents", {
      conversationId: args.conversationId,
      type: args.type,
      status: "pending",
      payload: args.payload,
      createdAt: Date.now(),
    })

    console.log(
      `📋 [SCHEDULING] Created intent: ${args.type} for conversation:`,
      args.conversationId
    )
    return id
  },
})

/**
 * Process ALL pending scheduling intents. Called from:
 * 1. Status webhook handler (on "sent" status) — fast, ~1-2s latency
 * 2. Cron job (every 15s) — guaranteed fallback
 *
 * Since this runs from an independent context (webhook action or cron),
 * ctx.scheduler.runAfter works reliably.
 */
export const processSchedulingIntents = internalMutation({
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("schedulingIntents")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(20) // Batch limit to avoid timeout

    if (pending.length === 0) return

    console.log(
      `📋 [SCHEDULING] Processing ${pending.length} pending intent(s)`
    )

    for (const intent of pending) {
      try {
        switch (intent.type) {
          case "followUpStep":
            await processFollowUpIntent(ctx, intent)
            break

          case "firstTurnSchedule":
            await ctx.scheduler.runAfter(
              0,
              internal.system.scheduleAction.sendFirstTurnSchedule,
              intent.payload
            )
            console.log(
              `📋 [SCHEDULING] Scheduled firstTurnSchedule for conversation:`,
              intent.conversationId
            )
            break

          case "menuSend":
            await ctx.scheduler.runAfter(
              0,
              internal.system.ai.tools.sendMenuFiles.sendMenuFilesAction,
              intent.payload
            )
            console.log(
              `📋 [SCHEDULING] Scheduled menuSend for conversation:`,
              intent.conversationId
            )
            break

          case "agentResponse":
            await ctx.scheduler.runAfter(
              0,
              internal.system.responseDebounceScheduler.executeAgentResponse,
              intent.payload
            )
            console.log(
              `📋 [SCHEDULING] Scheduled 2nd job agentResponse for conversation:`,
              intent.conversationId
            )
            break
        }

        await ctx.db.patch(intent._id, {
          status: "completed",
          processedAt: Date.now(),
        })
      } catch (error) {
        console.error(
          `❌ [SCHEDULING] Failed to process intent ${intent.type}:`,
          error
        )
        await ctx.db.patch(intent._id, {
          status: "failed",
          processedAt: Date.now(),
          errorMessage: String(error),
        })
      }
    }
  },
})

/**
 * Process a followUpStep intent — cancels existing timers and schedules
 * the first inactivity follow-up step.
 */
async function processFollowUpIntent(
  ctx: MutationCtx,
  intent: {
    _id: Id<"schedulingIntents">
    conversationId: Id<"conversations">
    payload: any
  }
) {
  const { contactId, organizationId } = intent.payload

  // Cancel existing inactivity timers
  await cancelInactivityTimers(ctx, intent.conversationId)

  const orgConfig = await ctx.db
    .query("agentConfiguration")
    .withIndex("by_organization_id", (q) =>
      q.eq("organizationId", organizationId)
    )
    .first()

  const sequence = orgConfig?.followUpSequence ?? DEFAULT_FOLLOW_UP_SEQUENCE

  if (sequence.length === 0) {
    console.log(`📋 [SCHEDULING] No follow-up sequence configured, skipping`)
    return
  }

  const firstStep = sequence[0]!
  const delayMs = firstStep.delayMinutes * 60 * 1000

  const scheduledId = await ctx.scheduler.runAfter(
    delayMs,
    internal.system.inactivityScheduler.executeFollowUpStep,
    {
      conversationId: intent.conversationId,
      contactId,
      organizationId,
      stepIndex: 0,
    }
  )

  await ctx.db.insert("conversationScheduledFunctions", {
    name: "followUpStep_0",
    conversationId: intent.conversationId,
    scheduledFunctionId: scheduledId as Id<"_scheduled_functions">,
  })

  console.log(
    `📋 [SCHEDULING] Scheduled followUp step 0 in ${firstStep.delayMinutes}min for conversation:`,
    intent.conversationId
  )
}
