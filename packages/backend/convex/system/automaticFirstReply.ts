import { v } from "convex/values"
import { internalQuery } from "../_generated/server"
import { formatNextOpenTime, isRestaurantOpen } from "../lib/scheduleUtils"

export const getRestaurantLocations = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
  },
})
/**
 * Check if automatic first reply should be sent for this conversation.
 * Returns the configuration if enabled and this is the first response.
 *
 * Uses the existing menu configuration (menuType, menuUrl, menuImages, menuPdf)
 * for media when sendMenu is enabled.
 *
 * Note: This is a query (V8 runtime), not an action.
 * The actual sending logic is in automaticFirstReplyAction.ts (Node.js runtime).
 */
export const checkAutomaticFirstReply = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    organizationId: v.string(),
  },
  returns: v.union(
    v.object({
      shouldSend: v.literal(true),
      message: v.string(),
      sendMenu: v.boolean(),
      // Menu configuration (from restaurantConfiguration)
      menuType: v.optional(
        v.union(v.literal("images"), v.literal("pdf"), v.literal("url"))
      ),
      menuUrl: v.optional(v.string()),
      menuImages: v.optional(v.array(v.string())),
      menuPdf: v.optional(v.string()),
      restaurantName: v.optional(v.string()),
      // Branch schedule information
      branchScheduleInfo: v.optional(
        v.object({
          hasMultipleBranches: v.boolean(),
          allBranchesClosed: v.boolean(),
          branches: v.array(
            v.object({
              id: v.string(),
              name: v.string(),
              isOpen: v.boolean(),
              message: v.string(),
              nextOpenTime: v.optional(v.string()),
              weeklySchedule: v.array(
                v.object({
                  day: v.string(),
                  ranges: v.array(
                    v.object({
                      open: v.string(),
                      close: v.string(),
                    })
                  ),
                })
              ),
            })
          ),
        })
      ),
    }),
    v.object({
      shouldSend: v.literal(false),
      isFirstTurn: v.boolean(),
    })
  ),
  handler: async (ctx, args) => {
    // 1. Check if there are any outbound messages in this conversation
    const outboundMessages = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation_and_direction", (q) =>
        q.eq("conversationId", args.conversationId).eq("direction", "outbound")
      )
      .first()

    // If there's already an outbound message, this is not the first response
    if (outboundMessages) {
      console.log(
        "📤 [AUTOMATIC FIRST REPLY] Outbound message already exists, skipping automatic reply"
      )
      return { shouldSend: false as const, isFirstTurn: false }
    }

    // 2. Get restaurant configuration to check if automatic first reply is enabled
    const restaurantConfig = await ctx.db
      .query("restaurantConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (!restaurantConfig?.automaticFirstReply?.enabled) {
      console.log(
        "📤 [AUTOMATIC FIRST REPLY] Automatic first reply not enabled"
      )
      return { shouldSend: false as const, isFirstTurn: true }
    }

    const config = restaurantConfig.automaticFirstReply

    // 3. Get restaurant branches/locations and check their schedules
    const restaurantLocations = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Get current Colombian time for checking status
    const currentTime = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Bogota" })
    )

    let branchScheduleInfo

    if (restaurantLocations && restaurantLocations.length > 0) {
      const branches = restaurantLocations.map((location) => {
        const availability = isRestaurantOpen(location, currentTime)

        console.log(
          `🕐 [BRANCH SCHEDULE] ${location.name}:`,
          `isOpen=${availability.isOpen},`,
          `nextOpenTime=${availability.nextOpenTime ? availability.nextOpenTime.toISOString() : "undefined"},`,
          `message="${availability.message}"`
        )

        let nextOpenTimeStr
        if (!availability.isOpen && availability.nextOpenTime) {
          nextOpenTimeStr = formatNextOpenTime(
            availability.nextOpenTime,
            currentTime
          )

          console.log(
            `🕐 [BRANCH SCHEDULE] ${location.name} formatted:`,
            `"${nextOpenTimeStr}"`
          )
        }

        // Get weekly schedule for display when closed
        const weeklySchedule = location.openingHours || []

        return {
          id: location._id,
          name: location.name,
          isOpen: availability.isOpen,
          message: availability.message,
          nextOpenTime: nextOpenTimeStr,
          weeklySchedule: weeklySchedule.map((schedule) => ({
            day: schedule.day,
            ranges: schedule.ranges,
          })),
        }
      })

      const allBranchesClosed = branches.every((b) => !b.isOpen)
      const hasMultipleBranches = branches.length > 1

      branchScheduleInfo = {
        hasMultipleBranches,
        allBranchesClosed,
        branches,
      }

      console.log(
        "📤 [AUTOMATIC FIRST REPLY] Branch schedule info:",
        JSON.stringify(branchScheduleInfo, null, 2)
      )
    }

    console.log(
      "📤 [AUTOMATIC FIRST REPLY] Will send automatic first reply for conversation:",
      args.conversationId,
      "sendMenu:",
      config.sendMenu
    )

    return {
      shouldSend: true as const,
      message: config.message,
      sendMenu: config.sendMenu ?? false,
      // Pass menu configuration from the same restaurantConfiguration
      menuType: restaurantConfig.menuType,
      menuUrl: restaurantConfig.menuUrl,
      menuImages: restaurantConfig.menuImages,
      menuPdf: restaurantConfig.menuPdf,
      restaurantName: restaurantConfig.restaurantName,
      branchScheduleInfo,
    }
  },
})
