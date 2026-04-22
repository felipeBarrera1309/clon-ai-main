import type { Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

export const cancelInactivityTimers = async (
	ctx: MutationCtx,
	conversationId: Id<"conversations">
) => {
	console.log("⏰ [INACTIVIDAD] Cancelando temporizadores de inactividad")

	let cancelledCount = 0

	try {
		const timerNames = [
			"sendInactivityWarning3Min",
			"sendInactivityWarning5Min",
			"closeConversationForInactivity",
			"followUpStep_0",
			"followUpStep_1",
			"followUpStep_2",
			"followUpStep_3",
			"followUpStep_4",
			"followUpStep_5",
			"followUpStep_6",
			"followUpStep_7",
			"followUpStep_8",
			"followUpStep_9",
		] as const

		for (const timerName of timerNames) {
			const timers = await ctx.db
				.query("conversationScheduledFunctions")
				.withIndex("by_conversation_id_and_name", (q) =>
					q.eq("conversationId", conversationId).eq("name", timerName)
				)
				.collect()

			for (const timer of timers) {
				try {
					await ctx.scheduler.cancel(
						timer.scheduledFunctionId as Id<"_scheduled_functions">
					)
					await ctx.db.delete(timer._id)
					cancelledCount++
					console.log(
						`⏰ [INACTIVIDAD] Cancelled and deleted timer: ${timerName}`
					)
				} catch (error) {
					console.error(
						`⏰ [INACTIVIDAD] Error cancelling timer ${timerName}:`,
						error
					)
				}
			}
		}

		console.log(
			`⏰ [INACTIVIDAD] Canceladas ${cancelledCount} funciones programadas`
		)
	} catch (error) {
		console.error("⏰ [INACTIVIDAD] Error cancelando temporizadores:", error)
	}
}
