"use node"

import { saveMessage } from "@convex-dev/agent"
import { v } from "convex/values"
import { components, internal } from "../_generated/api"
import { internalAction } from "../_generated/server"
import {
  buildClosedScheduleMessage,
  formatNextOpenTime,
  isRestaurantOpen,
} from "../lib/scheduleUtils"

/**
 * Evaluates the schedule and sends a schedule message if the single branch is closed.
 * It is meant to be run right after the first conversational turn (either automatic or AI).
 */
export const sendFirstTurnSchedule = internalAction({
  args: {
    conversationId: v.id("conversations"),
    organizationId: v.string(),
    threadId: v.string(),
    contactPhoneNumber: v.string(),
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
    twilioConfigurationId: v.optional(v.id("whatsappConfigurations")),
    dialog360ConfigurationId: v.optional(v.id("whatsappConfigurations")),
    gupshupConfigurationId: v.optional(v.id("whatsappConfigurations")),
  },
  handler: async (ctx, args) => {
    const {
      conversationId,
      organizationId,
      threadId,
      contactPhoneNumber,
      whatsappConfigurationId,
      twilioConfigurationId,
      dialog360ConfigurationId,
      gupshupConfigurationId,
    } = args

    // 1. Fetch the restaurant locations (using runQuery wrapper for Convex DB access in an action)
    const restaurantLocations = await ctx.runQuery(
      internal.system.automaticFirstReply.getRestaurantLocations,
      { organizationId }
    )

    // Only process for single-branch restaurants. For multiple branches,
    // schedule info will be shown AFTER the customer validates their address
    // or selects a specific branch.
    if (!restaurantLocations || restaurantLocations.length !== 1) {
      return { success: true, reason: "NOT_SINGLE_BRANCH" }
    }

    const location = restaurantLocations[0]!

    // Get current Colombian time for checking status
    const currentTime = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Bogota" })
    )

    const availability = isRestaurantOpen(location, currentTime)

    // Only send the schedule info message if the restaurant is closed.
    if (availability.isOpen) {
      return { success: true, reason: "RESTAURANT_OPEN" }
    }

    // Format the next open time
    let nextOpenTimeStr
    if (availability.nextOpenTime) {
      nextOpenTimeStr = formatNextOpenTime(
        availability.nextOpenTime,
        currentTime
      )
    }

    const weeklySchedule = location.openingHours || []
    const formattedWeeklySchedule = weeklySchedule.map(
      (s: { day: string; ranges: Array<{ open: string; close: string }> }) => ({
        day: s.day,
        ranges: s.ranges,
      })
    )
    const scheduleMessage = buildClosedScheduleMessage(
      nextOpenTimeStr,
      formattedWeeklySchedule
    )

    if (scheduleMessage) {
      console.log(
        "📤 [SCHEDULE NOTIFICATION] Sending schedule message for closed branch"
      )

      // Send via dispatch
      await ctx.runAction(internal.system.whatsappDispatcher.sendMessage, {
        whatsappConfigurationId,
        twilioConfigurationId,
        dialog360ConfigurationId,
        gupshupConfigurationId,
        to: contactPhoneNumber,
        message: scheduleMessage,
      })

      // Save schedule message to conversationMessages
      await ctx.runMutation(
        internal.system.conversationMessages.saveOutboundMessage,
        {
          conversationId,
          organizationId,
          type: "text",
          content: { text: scheduleMessage },
          status: "sent",
          sender: "agent",
        }
      )

      // Save schedule message to thread
      await saveMessage(ctx, components.agent, {
        threadId,
        message: {
          role: "assistant",
          content: scheduleMessage,
        },
      })

      return { success: true, sent: true }
    }

    return { success: true, sent: false }
  },
})
