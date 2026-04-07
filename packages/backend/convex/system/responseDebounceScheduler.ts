import { v } from "convex/values"
import { doc } from "convex-helpers/validators"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server"
import { ContactNotFoundError, ConversationNotFoundError } from "../lib/errors"
import {
  sendTypingIndicator,
  sendTypingIndicatorToContact,
} from "../model/whatsapp"
import schema from "../schema"
import { generateAgentResponse } from "./messages"

const DEBOUNCE_DELAY_MS = 3000

export const scheduleAgentResponse = internalMutation({
  args: {
    conversation: doc(schema, "conversations"),
    contact: doc(schema, "contacts"),
    whatsappConfiguration: v.optional(doc(schema, "whatsappConfigurations")),
    twilioConfiguration: v.optional(doc(schema, "whatsappConfigurations")),
    dialog360Configuration: v.optional(doc(schema, "whatsappConfigurations")),
    gupshupConfiguration: v.optional(doc(schema, "whatsappConfigurations")),
    messageId: v.string(),
    whatsappMessageId: v.optional(v.string()), // WhatsApp message ID for typing indicator
  },
  handler: async (ctx, args): Promise<string | null> => {
    const {
      conversation,
      contact,
      whatsappConfiguration,
      twilioConfiguration,
      dialog360Configuration,
      gupshupConfiguration,
      messageId,
      whatsappMessageId,
    } = args

    // If agent is currently processing, queue instead of creating a new job
    if (conversation.agentLockActive) {
      await ctx.db.patch(conversation._id, {
        queuedUserMessageId: messageId,
        queuedWhatsappMessageId: whatsappMessageId, // Track so typing indicator targets the right message
        agentSoftAbort: true, // Signal the running job to discard its response
      })
      console.log(
        `🔒 [RESPONSE SCHEDULER] Agent locked for conversation ${conversation._id}, queuing message ${messageId} (agentSoftAbort set)`
      )
      return null
    }

    const scheduledFunctions = await ctx.db
      .query("conversationScheduledFunctions")
      .withIndex("by_conversation_id_and_name", (q) =>
        q
          .eq("conversationId", conversation._id)
          .eq("name", "scheduleAgentResponse")
      )
      .collect()
    for (const scheduledFunction of scheduledFunctions) {
      try {
        await ctx.scheduler.cancel(
          scheduledFunction.scheduledFunctionId as Id<"_scheduled_functions">
        )
      } catch {
        // Already executed or canceled
      }
      await ctx.db.delete(scheduledFunction._id)
    }

    const scheduledId = await ctx.scheduler.runAfter(
      DEBOUNCE_DELAY_MS,
      internal.system.responseDebounceScheduler.executeAgentResponse,
      {
        whatsappConfigurationId: whatsappConfiguration?._id,
        twilioConfigurationId: twilioConfiguration?._id,
        dialog360ConfigurationId: dialog360Configuration?._id,
        gupshupConfigurationId: gupshupConfiguration?._id,
        conversationId: conversation._id,
        contactId: contact._id,
        messageId: messageId,
        whatsappMessageId: whatsappMessageId,
      }
    )

    await ctx.db.insert("conversationScheduledFunctions", {
      name: "scheduleAgentResponse",
      conversationId: conversation._id,
      scheduledFunctionId: scheduledId as Id<"_scheduled_functions">,
    })

    console.log(
      `⏰ [RESPONSE SCHEDULER] Scheduled response in ${DEBOUNCE_DELAY_MS}ms for conversation:`,
      conversation._id
    )

    return scheduledId
  },
})

// ── Agent concurrency lock mutations ────────────────────────────────

export const acquireAgentLock = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) return

    // Guard: if locked by another concurrent job, don't overwrite — just log
    if (conversation.agentLockActive) {
      console.warn(
        `⚠️ [AGENT LOCK] acquireAgentLock called but lock already active for conversation ${args.conversationId} — skipping overwrite`
      )
      return
    }

    await ctx.db.patch(args.conversationId, {
      agentLockActive: true,
      processingUserMessageId: args.messageId,
      queuedUserMessageId: undefined, // Clear queued when starting new run
      queuedWhatsappMessageId: undefined,
      agentSoftAbort: undefined, // Clear explicit soft abort signal on atomic acquire
    })
  },
})

export const releaseAgentLock = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) return null

    const pendingId = conversation.queuedUserMessageId
    const pendingWhatsappId = conversation.queuedWhatsappMessageId

    await ctx.db.patch(args.conversationId, {
      agentLockActive: false,
      processingUserMessageId: undefined,
      queuedUserMessageId: undefined,
      queuedWhatsappMessageId: undefined, // Clear so the reschedule doesn't abort itself
      agentSoftAbort: undefined, // Clear explicit soft abort signal on release
    })

    return pendingId
      ? { messageId: pendingId, whatsappMessageId: pendingWhatsappId ?? null }
      : null
  },
})

export const deleteAgentJobTracking = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const scheduledFunctions = await ctx.db
      .query("conversationScheduledFunctions")
      .withIndex("by_conversation_id_and_name", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("name", "scheduleAgentResponse")
      )
      .collect()

    for (const scheduled of scheduledFunctions) {
      await ctx.db.delete(scheduled._id)
    }
  },
})

// Queues a message without touching the active lock — used when a job detects it lost the race
export const queueMessageIfLocked = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.string(),
    whatsappMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, {
      queuedUserMessageId: args.messageId,
      queuedWhatsappMessageId: args.whatsappMessageId,
    })
  },
})

export const executeAgentResponse = internalAction({
  args: {
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
    twilioConfigurationId: v.optional(v.id("whatsappConfigurations")),
    dialog360ConfigurationId: v.optional(v.id("whatsappConfigurations")),
    gupshupConfigurationId: v.optional(v.id("whatsappConfigurations")),
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
    messageId: v.string(),
    whatsappMessageId: v.optional(v.string()), // WhatsApp message ID for typing indicator
  },
  handler: async (ctx, args) => {
    const {
      whatsappConfigurationId,
      twilioConfigurationId,
      dialog360ConfigurationId,
      gupshupConfigurationId,
      conversationId,
      contactId,
      messageId,
      whatsappMessageId,
    } = args

    const {
      whatsappConfiguration,
      twilioConfiguration,
      dialog360Configuration,
      gupshupConfiguration,
      conversation,
      contact,
      needsAnswer,
    } = await ctx.runQuery(
      internal.system.responseDebounceScheduler.getExecutionData,
      {
        whatsappConfigurationId: whatsappConfigurationId,
        twilioConfigurationId: twilioConfigurationId,
        dialog360ConfigurationId: dialog360ConfigurationId,
        gupshupConfigurationId: gupshupConfigurationId,
        conversationId: conversationId,
        contactId: contactId,
      }
    )

    if (!needsAnswer) {
      console.log(
        "🚫 [RESPONSE SCHEDULER] Response no longer needed (conversation likely resolved or updated)"
      )
      return
    }

    // ── Stale-lock guard ────────────────────────────────────────────
    // Edge case: if another executeAgentResponse job acquired the lock between
    // our getExecutionData read and now, we queue and bail instead of competing.
    if (conversation.agentLockActive) {
      console.warn(
        `🔒 [RESPONSE SCHEDULER] Stale-lock detected on executeAgentResponse for conversation ${conversationId} — queuing message ${messageId}`
      )
      try {
        await ctx.runMutation(
          internal.system.responseDebounceScheduler.queueMessageIfLocked,
          { conversationId, messageId, whatsappMessageId }
        )
      } catch (patchError) {
        console.error(
          "❌ [RESPONSE SCHEDULER] Failed to queue message on stale lock:",
          patchError
        )
      }
      return
    }

    // ── Acquire agent lock & clear soft abort atomically ───────────────
    try {
      await ctx.runMutation(
        internal.system.responseDebounceScheduler.acquireAgentLock,
        { conversationId, messageId }
      )
    } catch (lockError) {
      console.error(
        "❌ [RESPONSE SCHEDULER] Failed to acquire agent lock:",
        lockError
      )
      throw lockError
    }

    try {
      // Send typing indicator before LLM processing
      // This shows "escribiendo..." to the user while we generate the response
      // We use the unified sendTypingIndicatorToContact which supports multiple providers
      if (
        whatsappConfiguration?.provider === "meta" &&
        whatsappConfiguration.phoneNumberId &&
        whatsappConfiguration.accessToken &&
        whatsappMessageId
      ) {
        await sendTypingIndicator(
          ctx,
          whatsappMessageId,
          whatsappConfiguration.phoneNumberId,
          whatsappConfiguration.accessToken
        )
      } else if (
        gupshupConfiguration?.provider === "gupshup" &&
        gupshupConfiguration.gupshupAppToken &&
        gupshupConfiguration.gupshupAppId
      ) {
        await sendTypingIndicatorToContact(
          ctx,
          "gupshup",
          contact.phoneNumber,
          undefined,
          undefined,
          undefined,
          gupshupConfiguration.gupshupAppToken,
          gupshupConfiguration.gupshupSourceNumber ||
            gupshupConfiguration.phoneNumber,
          gupshupConfiguration.gupshupAppId,
          whatsappMessageId // Required by Gupshup /v1/event to reference the incoming message
        )
      } else if (
        dialog360Configuration?.provider === "360dialog" &&
        dialog360Configuration.dialog360ApiKey
      ) {
        await sendTypingIndicatorToContact(
          ctx,
          "360dialog",
          contact.phoneNumber,
          undefined,
          undefined,
          dialog360Configuration.dialog360ApiKey
        )
      }

      console.log(
        `[DEBUG-FLOW] Checking automaticFirstReply for conversation: ${conversationId}`
      )

      // Check if automatic first reply should be sent
      const automaticReplyCheck = await ctx.runQuery(
        internal.system.automaticFirstReply.checkAutomaticFirstReply,
        {
          conversationId: conversationId,
          organizationId: conversation.organizationId,
        }
      )

      if (automaticReplyCheck.shouldSend) {
        // Send automatic first reply instead of generating agent response
        console.log("🤖 [RESPONSE SCHEDULER] Sending automatic first reply")
        console.log(
          `[DEBUG-FLOW] SENDING AUTOMATIC REPLY: ${automaticReplyCheck.message}`
        )

        await ctx.runAction(
          internal.system.automaticFirstReplyAction.sendAutomaticFirstReply,
          {
            conversationId: conversationId,
            organizationId: conversation.organizationId,
            threadId: conversation.threadId,
            contactPhoneNumber: contact.phoneNumber,
            whatsappConfigurationId: whatsappConfigurationId,
            twilioConfigurationId: twilioConfigurationId,
            dialog360ConfigurationId: dialog360ConfigurationId,
            gupshupConfigurationId: gupshupConfigurationId,
            messageId: messageId,
            message: automaticReplyCheck.message,
            sendMenu: automaticReplyCheck.sendMenu,
            menuType: automaticReplyCheck.menuType,
            menuUrl: automaticReplyCheck.menuUrl,
            menuImages: automaticReplyCheck.menuImages,
            menuPdf: automaticReplyCheck.menuPdf,
            restaurantName: automaticReplyCheck.restaurantName,
            branchScheduleInfo: automaticReplyCheck.branchScheduleInfo,
          }
        )

        // Schedule inactivity warning after automatic reply
        await ctx.runMutation(
          internal.system.inactivityScheduler.scheduleInitialInactivityWarning,
          {
            conversationId: conversationId,
            contactId: contactId,
            organizationId: conversation.organizationId,
          }
        )
        console.log(
          "⏰ [RESPONSE SCHEDULER] Inactivity timer scheduled after automatic first reply"
        )

        return
      }

      // Normal flow: Generate Agent Response
      console.log(`[DEBUG-FLOW] Generating standard AGENT response...`)
      const agentMessages = await generateAgentResponse(ctx, {
        conversationId,
        threadId: conversation.threadId,
        organizationId: conversation.organizationId,
        messageId,
      })
      const costRefresh = await ctx.runMutation(
        internal.system.conversations.refreshConversationCost,
        {
          conversationId,
        }
      )
      if (costRefresh.syncStatus !== "synced") {
        console.warn(
          "[RESPONSE SCHEDULER] Conversation cost refresh completed with non-blocking failure",
          {
            conversationId,
            failedThreads: costRefresh.failedThreads,
            organizationId: conversation.organizationId,
            syncStatus: costRefresh.syncStatus,
          }
        )
      }

      // ── Check if response was aborted (new message arrived mid-generation) ──
      const freshConv = await ctx.runQuery(
        internal.system.conversations.getOne,
        { conversationId }
      )
      const wasAborted = freshConv?.agentSoftAbort === true

      if (wasAborted) {
        // DISCARD: Don't send response, don't create firstTurn/menu intents.
        // The 2nd job will generate a coherent response with full context.
        console.log(
          `🔕 [RESPONSE SCHEDULER] agentSoftAbort detected — DISCARDING ${agentMessages.length} message(s), 2nd job will handle with full context`
        )
      } else {
        // Normal flow: send messages to WhatsApp
        if (agentMessages.length > 0) {
          console.log(
            `📱 [RESPONSE SCHEDULER] Sending ${agentMessages.length} AI message(s) to ${contact.phoneNumber}`
          )

          // Send to WhatsApp sequentially to preserve delivery order,
          // but fire all DB saves in parallel (order doesn't matter for dashboard).
          const dbSavePromises: Promise<unknown>[] = []

          for (const msg of agentMessages) {
            // ① Send to WhatsApp — await in sequence to maintain message order
            await ctx.runAction(
              internal.system.whatsappDispatcher.sendMessage,
              {
                whatsappConfigurationId: whatsappConfigurationId,
                twilioConfigurationId: twilioConfigurationId,
                dialog360ConfigurationId: dialog360ConfigurationId,
                gupshupConfigurationId: gupshupConfigurationId,
                to: contact.phoneNumber,
                message: msg.text,
              }
            )

            // ② Queue DB save — do NOT await yet; collect for parallel flush below
            dbSavePromises.push(
              ctx.runMutation(
                internal.system.conversationMessages.saveOutboundMessage,
                {
                  conversationId: conversationId,
                  organizationId: conversation.organizationId,
                  type: "text",
                  content: { text: msg.text },
                  status: "sent",
                }
              )
            )
          }

          // ③ Flush all DB saves concurrently once every message has been sent
          if (dbSavePromises.length > 0) {
            await Promise.all(dbSavePromises)
          }
        }

        if (
          !automaticReplyCheck.shouldSend &&
          automaticReplyCheck.isFirstTurn
        ) {
          console.log(
            "⏰ [RESPONSE SCHEDULER] First turn detected in normal flow, creating schedule intent"
          )
          await ctx.runMutation(
            internal.system.schedulingIntents.createSchedulingIntent,
            {
              conversationId,
              type: "firstTurnSchedule",
              payload: {
                conversationId,
                organizationId: conversation.organizationId,
                threadId: conversation.threadId,
                contactPhoneNumber: contact.phoneNumber,
                whatsappConfigurationId,
                twilioConfigurationId,
                dialog360ConfigurationId,
                gupshupConfigurationId,
              },
            }
          )
        }

        // Check if this is the first AI response (greeting) and schedule menu to be sent 2 seconds later
        // BUT only if automatic first reply was NOT used (to avoid duplicate menu sends)
        const messages = await ctx.runQuery(internal.private.messages.list, {
          threadId: conversation.threadId,
          paginationOpts: { numItems: 10, cursor: null },
        })
        const messageCount = messages.page.length

        // If this is one of the first messages (greeting), check if we should send menu
        if (messageCount <= 3) {
          console.log(
            `📋 [RESPONSE SCHEDULER] Checking if menu should be sent automatically (message count: ${messageCount})`
          )

          try {
            // Get restaurant config to check menu type and automatic first reply setting
            const restaurantConfig = await ctx.runQuery(
              internal.private.config.getRestaurantConfigForAgent,
              {
                organizationId: conversation.organizationId,
              }
            )

            if (restaurantConfig) {
              const menuType = restaurantConfig.menuType
              const hasMenuImages =
                (restaurantConfig.menuImages?.length || 0) > 0
              const hasMenuPdf = !!restaurantConfig.menuPdf

              // Type-safe check for automaticFirstReply
              const automaticFirstReplyEnabled =
                "automaticFirstReply" in restaurantConfig &&
                typeof restaurantConfig.automaticFirstReply === "object" &&
                restaurantConfig.automaticFirstReply !== null &&
                "enabled" in restaurantConfig.automaticFirstReply &&
                restaurantConfig.automaticFirstReply.enabled === true

              // Only send automatically for images or PDF (not URL, as that's included in the greeting)
              const shouldSendMenu =
                (menuType === "images" && hasMenuImages) ||
                (menuType === "pdf" && hasMenuPdf)

              if (shouldSendMenu) {
                let shouldScheduleMenu = false

                // If automatic first reply is enabled, check if it was already used
                if (automaticFirstReplyEnabled) {
                  const outboundMessages = await ctx.runQuery(
                    internal.system.conversationMessages
                      .getByConversationInternal,
                    { conversationId }
                  )
                  const hasOutboundMessages = outboundMessages.some(
                    (m: { direction: string }) => m.direction === "outbound"
                  )

                  if (hasOutboundMessages) {
                    console.log(
                      `📋 [RESPONSE SCHEDULER] Automatic first reply was used - menu already sent, skipping duplicate send`
                    )
                  } else {
                    // Automatic first reply is enabled but wasn't used - send menu
                    shouldScheduleMenu = true
                    console.log(
                      `📋 [RESPONSE SCHEDULER] Automatic first reply enabled but not used - scheduling menu for organization: ${conversation.organizationId}`
                    )
                  }
                } else {
                  // Automatic first reply is disabled - DO NOT send menu automatically
                  // Instead, we leave it entirely up to the agent whether to use the sendMenuFiles tool
                  shouldScheduleMenu = false
                  console.log(
                    `📋 [RESPONSE SCHEDULER] Automatic first reply disabled - skipping automatic menu send so agent can handle it: ${conversation.organizationId}`
                  )
                }

                // Schedule menu send if needed (single location for this logic)
                if (shouldScheduleMenu) {
                  await ctx.runMutation(
                    internal.system.schedulingIntents.createSchedulingIntent,
                    {
                      conversationId,
                      type: "menuSend",
                      payload: { conversationId },
                    }
                  )
                }
              }
            }
          } catch (error) {
            console.error(
              `📋 [RESPONSE SCHEDULER] Error checking menu send configuration:`,
              error
            )
            // Continue without sending menu - don't break the main flow
          }
        }

        // CRITICAL: Schedule inactivity warning ALWAYS after bot interaction
        // This includes both when bot sends text response AND when bot only uses tools
        await ctx.runMutation(
          internal.system.schedulingIntents.createSchedulingIntent,
          {
            conversationId,
            type: "followUpStep",
            payload: {
              contactId,
              organizationId: conversation.organizationId,
            },
          }
        )
        console.log(
          "⏰ [RESPONSE SCHEDULER] Inactivity intent created after bot interaction"
        )
      } // end if/else wasAborted
    } catch (error) {
      console.error(
        "❌ [RESPONSE SCHEDULER] Error executing agent response:",
        error
      )
      // PROPAGATE the error instead of swallowing it — Convex will record this as a failed action
      throw error
    } finally {
      // ── Release agent lock (ALWAYS, even on error) ─────────────────
      try {
        const queued = await ctx.runMutation(
          internal.system.responseDebounceScheduler.releaseAgentLock,
          { conversationId, messageId }
        )

        // Clean up the job tracking entry
        await ctx.runMutation(
          internal.system.responseDebounceScheduler.deleteAgentJobTracking,
          { conversationId }
        )

        // If a message arrived while we were processing, re-schedule immediately
        if (queued) {
          console.log(
            `🔄 [RESPONSE SCHEDULER] Queued message ${queued.messageId} found, re-scheduling agent response immediately`
          )
          const latestData = await ctx.runQuery(
            internal.system.responseDebounceScheduler.getExecutionData,
            {
              whatsappConfigurationId,
              twilioConfigurationId,
              dialog360ConfigurationId,
              gupshupConfigurationId,
              conversationId,
              contactId,
            }
          )
          if (latestData.needsAnswer) {
            // Use config IDs from the freshly re-fetched conversation to avoid stale credentials
            // Note: dialog360ConfigurationId and gupshupConfigurationId are not stored on the conversation doc, so we fall back to the original arg
            const freshWhatsappConfigId =
              latestData.conversation.whatsappConfigurationId
            const freshTwilioConfigId =
              latestData.conversation.twilioConfigurationId
            await ctx.runMutation(
              internal.system.schedulingIntents.createSchedulingIntent,
              {
                conversationId,
                type: "agentResponse",
                payload: {
                  whatsappConfigurationId: freshWhatsappConfigId,
                  twilioConfigurationId: freshTwilioConfigId,
                  dialog360ConfigurationId: dialog360ConfigurationId,
                  gupshupConfigurationId: gupshupConfigurationId,
                  conversationId,
                  contactId,
                  messageId: queued.messageId,
                  whatsappMessageId: queued.whatsappMessageId ?? undefined,
                },
              }
            )
          }
        }
      } catch (releaseError) {
        console.error(
          "❌ [RESPONSE SCHEDULER] Failed to release agent lock:",
          releaseError
        )
        // Last-resort: force-clear the lock directly to prevent deadlock
        try {
          await ctx.runMutation(
            internal.system.responseDebounceScheduler.releaseAgentLock,
            { conversationId }
          )
        } catch {
          // If even this fails, the lock will need manual intervention
          console.error(
            "🚨 [RESPONSE SCHEDULER] CRITICAL: Could not release agent lock for conversation",
            conversationId
          )
        }
      }
    }
  },
})

export const getExecutionData = internalQuery({
  args: {
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
    twilioConfigurationId: v.optional(v.id("whatsappConfigurations")),
    dialog360ConfigurationId: v.optional(v.id("whatsappConfigurations")),
    gupshupConfigurationId: v.optional(v.id("whatsappConfigurations")),
    conversationId: v.id("conversations"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    const contact = await ctx.db.get(args.contactId)

    if (!conversation) {
      throw new ConversationNotFoundError()
    }
    if (!contact) {
      throw new ContactNotFoundError()
    }

    const whatsappConfiguration = args.whatsappConfigurationId
      ? await ctx.db.get(args.whatsappConfigurationId)
      : null
    const twilioConfiguration = args.twilioConfigurationId
      ? await ctx.db.get(args.twilioConfigurationId)
      : null
    const dialog360Configuration = args.dialog360ConfigurationId
      ? await ctx.db.get(args.dialog360ConfigurationId)
      : null
    const gupshupConfiguration = args.gupshupConfigurationId
      ? await ctx.db.get(args.gupshupConfigurationId)
      : null

    // Check if we still need to answer
    const needsAnswer = conversation.status === "unresolved"

    return {
      whatsappConfiguration,
      twilioConfiguration,
      dialog360Configuration,
      gupshupConfiguration,
      conversation,
      contact,
      needsAnswer,
    }
  },
})

export const cancelAgentResponse = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const scheduledFunctions = await ctx.db
      .query("conversationScheduledFunctions")
      .withIndex("by_conversation_id_and_name", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("name", "scheduleAgentResponse")
      )
      .collect()

    if (scheduledFunctions.length > 0) {
      for (const scheduledFunction of scheduledFunctions) {
        try {
          await ctx.scheduler.cancel(
            scheduledFunction.scheduledFunctionId as Id<"_scheduled_functions">
          )
        } catch {
          // Already executed or canceled
        }
        await ctx.db.delete(scheduledFunction._id)
      }
      console.log("🧹 [RESPONSE SCHEDULER] Cancelled scheduled response")
    }
  },
})
