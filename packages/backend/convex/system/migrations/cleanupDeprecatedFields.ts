// import { internalMutation } from "../../_generated/server"

// /**
//  * CLEANUP MIGRATION: Remove deprecated payment fields
//  *
//  * This migration removes the old deprecated fields from restaurantConfiguration:
//  * - paymentUrl (replaced by paymentLinkUrl)
//  * - acceptTransfer (replaced by acceptPaymentLink)
//  *
//  * IMPORTANT: Only run this AFTER:
//  * 1. migratePaymentFields has been run
//  * 2. All data has been verified to be in the new fields
//  *
//  * Usage:
//  * npx convex run system/migrations/cleanupDeprecatedFields:dryRun --prod
//  * npx convex run system/migrations/cleanupDeprecatedFields:cleanup --prod
//  */

// /**
//  * Dry run: Show what fields would be removed
//  */
// export const dryRun = internalMutation({
//   args: {},
//   handler: async (ctx) => {
//     console.log("Starting dry run of deprecated fields cleanup...")

//     const configs = await ctx.db.query("restaurantConfiguration").collect()
//     console.log(`Found ${configs.length} restaurant configurations to process`)

//     const preview = []

//     for (const config of configs) {
//       const fieldsToRemove = []

//       if (config.paymentUrl !== undefined) {
//         fieldsToRemove.push(
//           `paymentUrl: "${config.paymentUrl}" (new value: ${config.paymentLinkUrl || "NOT SET"})`
//         )
//       }

//       if (config.acceptTransfer !== undefined) {
//         fieldsToRemove.push(
//           `acceptTransfer: ${config.acceptTransfer} (new value: ${config.acceptPaymentLink ?? "NOT SET"})`
//         )
//       }

//       if (fieldsToRemove.length > 0) {
//         preview.push({
//           organizationId: config.organizationId,
//           action: "CLEANUP",
//           fieldsToRemove,
//         })
//       } else {
//         preview.push({
//           organizationId: config.organizationId,
//           action: "SKIP",
//           reason: "No deprecated fields found",
//         })
//       }
//     }

//     const toCleanup = preview.filter((p) => p.action === "CLEANUP")
//     const toSkip = preview.filter((p) => p.action === "SKIP")

//     console.log("\n" + "=".repeat(60))
//     console.log("DRY RUN PREVIEW - DEPRECATED FIELDS CLEANUP")
//     console.log("=".repeat(60))
//     console.log(`Total Configurations: ${configs.length}`)
//     console.log(`Would Cleanup: ${toCleanup.length}`)
//     console.log(`Would Skip: ${toSkip.length}`)
//     console.log("=".repeat(60))

//     if (toCleanup.length > 0) {
//       console.log("\nConfigurations that would be cleaned up:")
//       for (const item of toCleanup) {
//         console.log(`  🧹 ${item.organizationId}`)
//         if (item.fieldsToRemove) {
//           for (const field of item.fieldsToRemove) {
//             console.log(`     Remove: ${field}`)
//           }
//         }
//       }
//     }

//     if (toSkip.length > 0) {
//       console.log("\nConfigurations that would be skipped:")
//       for (const item of toSkip) {
//         console.log(`  ⏭️  ${item.organizationId} - ${item.reason}`)
//       }
//     }

//     console.log("\n" + "=".repeat(60))
//     console.log("⚠️  WARNING")
//     console.log("=".repeat(60))
//     console.log(
//       "This is a DESTRUCTIVE operation. Old fields will be permanently deleted."
//     )
//     console.log("Make sure:")
//     console.log("1. Migration has been run (paymentUrl → paymentLinkUrl)")
//     console.log(
//       "2. Migration has been run (acceptTransfer → acceptPaymentLink)"
//     )
//     console.log("3. New fields have values where needed")

//     return {
//       totalConfigurations: configs.length,
//       wouldCleanup: toCleanup.length,
//       wouldSkip: toSkip.length,
//       preview,
//     }
//   },
// })

// /**
//  * Cleanup: Remove deprecated fields
//  *
//  * This permanently deletes paymentUrl and acceptTransfer fields
//  */
// export const cleanup = internalMutation({
//   args: {},
//   handler: async (ctx) => {
//     console.log("Starting cleanup of deprecated payment fields...")
//     console.log("=" + "=".repeat(60))

//     const configs = await ctx.db.query("restaurantConfiguration").collect()
//     console.log(`Found ${configs.length} restaurant configurations to process`)

//     let cleanedCount = 0
//     let skippedCount = 0
//     let errorCount = 0

//     for (const config of configs) {
//       try {
//         const hasPaymentUrl = config.paymentUrl !== undefined
//         const hasAcceptTransfer = config.acceptTransfer !== undefined

//         if (!hasPaymentUrl && !hasAcceptTransfer) {
//           skippedCount++
//           continue
//         }

//         // Build the patch object to unset fields
//         const patch: Record<string, undefined> = {}

//         if (hasPaymentUrl) {
//           patch.paymentUrl = undefined
//           console.log(
//             `  Removing paymentUrl from ${config.organizationId}: "${config.paymentUrl}"`
//           )
//         }

//         if (hasAcceptTransfer) {
//           patch.acceptTransfer = undefined
//           console.log(
//             `  Removing acceptTransfer from ${config.organizationId}: ${config.acceptTransfer}`
//           )
//         }

//         await ctx.db.patch(config._id, patch)

//         console.log(`✅ Cleaned up ${config.organizationId}`)
//         cleanedCount++
//       } catch (error) {
//         console.error(`❌ Error cleaning up ${config.organizationId}:`, error)
//         errorCount++
//       }
//     }

//     const result = {
//       success: errorCount === 0,
//       totalConfigurations: configs.length,
//       cleaned: cleanedCount,
//       skipped: skippedCount,
//       errors: errorCount,
//       message:
//         errorCount === 0
//           ? `✅ Cleanup completed successfully! Cleaned ${cleanedCount} configurations.`
//           : `⚠️ Cleanup completed with errors. Cleaned ${cleanedCount}, skipped ${skippedCount}, errors ${errorCount}.`,
//     }

//     console.log("\n" + "=".repeat(60))
//     console.log("CLEANUP SUMMARY")
//     console.log("=".repeat(60))
//     console.log(`Total Configurations: ${result.totalConfigurations}`)
//     console.log(`Cleaned: ${result.cleaned}`)
//     console.log(`Skipped: ${result.skipped}`)
//     console.log(`Errors: ${result.errors}`)
//     console.log("=".repeat(60))
//     console.log(result.message)
//     console.log("\n⚠️  Next step: Remove deprecated fields from schema.ts")

//     return result
//   },
// })

// /**
//  * Verify: Check that deprecated fields are gone
//  */
// export const verify = internalMutation({
//   args: {},
//   handler: async (ctx) => {
//     console.log("Verifying deprecated fields cleanup...")

//     const configs = await ctx.db.query("restaurantConfiguration").collect()

//     const withPaymentUrl = configs.filter(
//       (c) => c.paymentUrl !== undefined
//     ).length
//     const withAcceptTransfer = configs.filter(
//       (c) => c.acceptTransfer !== undefined
//     ).length

//     const allClean = withPaymentUrl === 0 && withAcceptTransfer === 0

//     console.log("\n" + "=".repeat(60))
//     console.log("VERIFICATION RESULTS")
//     console.log("=".repeat(60))
//     console.log(`Total configurations: ${configs.length}`)
//     console.log(`Still with paymentUrl: ${withPaymentUrl}`)
//     console.log(`Still with acceptTransfer: ${withAcceptTransfer}`)
//     console.log("=".repeat(60))

//     if (allClean) {
//       console.log("✅ VERIFICATION PASSED")
//       console.log("All deprecated fields removed!")
//       console.log("\nSafe to remove from schema:")
//       console.log("  - paymentUrl: v.optional(v.string())")
//       console.log("  - acceptTransfer: v.optional(v.boolean())")
//     } else {
//       console.log("❌ VERIFICATION FAILED")
//       console.log("Some configurations still have deprecated fields.")
//       console.log("Run cleanup again or investigate errors.")
//     }

//     return {
//       success: allClean,
//       totalConfigurations: configs.length,
//       withPaymentUrl,
//       withAcceptTransfer,
//       message: allClean
//         ? "✅ All deprecated fields removed"
//         : `❌ ${withPaymentUrl + withAcceptTransfer} fields still present`,
//     }
//   },
// })
