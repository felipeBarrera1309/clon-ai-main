// import { internalMutation } from "../../_generated/server"

// /**
//  * Migration: Migrate paymentUrl to paymentLinkUrl
//  *
//  * This migration copies data from the old `paymentUrl` field to the new
//  * `paymentLinkUrl` field in the restaurantConfiguration table.
//  *
//  * This is a one-time data migration needed after renaming the payment fields.
//  *
//  * Usage:
//  * npx convex run system/migrations/migratePaymentFields:migratePaymentUrl --prod
//  */
// export const migratePaymentUrl = internalMutation({
//   args: {},
//   handler: async (ctx) => {
//     console.log("Starting paymentUrl → paymentLinkUrl migration...")

//     // Get all restaurant configurations
//     const configs = await ctx.db.query("restaurantConfiguration").collect()

//     console.log(`Found ${configs.length} restaurant configurations to process`)

//     let migratedCount = 0
//     let skippedCount = 0
//     let errorCount = 0
//     //
//     for (const config of configs) {
//       try {
//         // Check if paymentUrl exists and has a value
//         if (config.paymentUrl && config.paymentUrl.trim() !== "") {
//           // Check if paymentLinkUrl already has a value
//           if (config.paymentLinkUrl && config.paymentLinkUrl.trim() !== "") {
//             console.log(
//               `Skipping organization ${config.organizationId}: paymentLinkUrl already has a value: "${config.paymentLinkUrl}"`
//             )
//             skippedCount++
//             continue
//           }

//           // Migrate the data
//           await ctx.db.patch(config._id, {
//             paymentLinkUrl: config.paymentUrl,
//           })

//           console.log(
//             `✅ Migrated organization ${config.organizationId}: "${config.paymentUrl}" → paymentLinkUrl`
//           )
//           migratedCount++
//         } else {
//           console.log(
//             `Skipping organization ${config.organizationId}: no paymentUrl to migrate`
//           )
//           skippedCount++
//         }
//       } catch (error) {
//         console.error(
//           `❌ Error migrating organization ${config.organizationId}:`,
//           error
//         )
//         errorCount++
//       }
//     }

//     const result = {
//       success: errorCount === 0,
//       totalConfigurations: configs.length,
//       migrated: migratedCount,
//       skipped: skippedCount,
//       errors: errorCount,
//       message:
//         errorCount === 0
//           ? `✅ Migration completed successfully! Migrated ${migratedCount} configurations, skipped ${skippedCount}.`
//           : `⚠️ Migration completed with errors. Migrated ${migratedCount}, skipped ${skippedCount}, errors ${errorCount}.`,
//     }

//     console.log("\n" + "=".repeat(60))
//     console.log("paymentUrl Migration Summary:")
//     console.log("=".repeat(60))
//     console.log(`Total Configurations: ${result.totalConfigurations}`)
//     console.log(`Migrated: ${result.migrated}`)
//     console.log(`Skipped: ${result.skipped}`)
//     console.log(`Errors: ${result.errors}`)
//     console.log("=".repeat(60))
//     console.log(result.message)

//     return result
//   },
// })

// /**
//  * Migration: Migrate acceptTransfer to acceptPaymentLink
//  *
//  * This migration copies data from the old `acceptTransfer` field to the new
//  * `acceptPaymentLink` field in the restaurantConfiguration table.
//  *
//  * Usage:
//  * npx convex run system/migrations/migratePaymentFields:migrateAcceptTransfer --prod
//  */
// export const migrateAcceptTransfer = internalMutation({
//   args: {},
//   handler: async (ctx) => {
//     console.log("Starting acceptTransfer → acceptPaymentLink migration...")

//     const configs = await ctx.db.query("restaurantConfiguration").collect()
//     console.log(`Found ${configs.length} restaurant configurations to process`)

//     let migratedCount = 0
//     let skippedCount = 0
//     let errorCount = 0

//     for (const config of configs) {
//       try {
//         // Check if acceptTransfer exists
//         if (config.acceptTransfer !== undefined) {
//           // Check if acceptPaymentLink already has a value
//           if (config.acceptPaymentLink !== undefined) {
//             console.log(
//               `Skipping organization ${config.organizationId}: acceptPaymentLink already set`
//             )
//             skippedCount++
//             continue
//           }

//           // Migrate the data
//           await ctx.db.patch(config._id, {
//             acceptPaymentLink: config.acceptTransfer,
//           })

//           console.log(
//             `✅ Migrated organization ${config.organizationId}: acceptTransfer (${config.acceptTransfer}) → acceptPaymentLink`
//           )
//           migratedCount++
//         } else {
//           skippedCount++
//         }
//       } catch (error) {
//         console.error(
//           `❌ Error migrating organization ${config.organizationId}:`,
//           error
//         )
//         errorCount++
//       }
//     }

//     const result = {
//       success: errorCount === 0,
//       totalConfigurations: configs.length,
//       migrated: migratedCount,
//       skipped: skippedCount,
//       errors: errorCount,
//       message:
//         errorCount === 0
//           ? `✅ Migration completed successfully! Migrated ${migratedCount} configurations, skipped ${skippedCount}.`
//           : `⚠️ Migration completed with errors. Migrated ${migratedCount}, skipped ${skippedCount}, errors ${errorCount}.`,
//     }

//     console.log("\n" + "=".repeat(60))
//     console.log("acceptTransfer Migration Summary:")
//     console.log("=".repeat(60))
//     console.log(`Total Configurations: ${result.totalConfigurations}`)
//     console.log(`Migrated: ${result.migrated}`)
//     console.log(`Skipped: ${result.skipped}`)
//     console.log(`Errors: ${result.errors}`)
//     console.log("=".repeat(60))
//     console.log(result.message)

//     return result
//   },
// })

// /**
//  * Dry run: Preview what would be migrated without making changes
//  *
//  * Usage:
//  * npx convex run system/migrations/migratePaymentFields:dryRun --prod
//  */
// export const dryRun = internalMutation({
//   args: {},
//   handler: async (ctx) => {
//     console.log("Starting dry run of payment field migration...")

//     const configs = await ctx.db.query("restaurantConfiguration").collect()
//     console.log(`Found ${configs.length} restaurant configurations to process`)

//     const preview = []

//     for (const config of configs) {
//       const actions = []

//       // Check paymentUrl migration
//       if (config.paymentUrl && config.paymentUrl.trim() !== "") {
//         if (config.paymentLinkUrl && config.paymentLinkUrl.trim() !== "") {
//           actions.push("paymentUrl: SKIP (already has paymentLinkUrl)")
//         } else {
//           actions.push(
//             `paymentUrl: MIGRATE "${config.paymentUrl}" → paymentLinkUrl`
//           )
//         }
//       }

//       // Check acceptTransfer migration
//       if (config.acceptTransfer !== undefined) {
//         if (config.acceptPaymentLink !== undefined) {
//           actions.push("acceptTransfer: SKIP (already has acceptPaymentLink)")
//         } else {
//           actions.push(
//             `acceptTransfer: MIGRATE ${config.acceptTransfer} → acceptPaymentLink`
//           )
//         }
//       }

//       if (actions.length > 0) {
//         preview.push({
//           organizationId: config.organizationId,
//           action: "MIGRATE",
//           actions,
//         })
//       } else {
//         preview.push({
//           organizationId: config.organizationId,
//           action: "SKIP",
//           reason: "No fields to migrate",
//         })
//       }
//     }

//     const toMigrate = preview.filter((p) => p.action === "MIGRATE")
//     const toSkip = preview.filter((p) => p.action === "SKIP")

//     console.log("\n" + "=".repeat(60))
//     console.log("DRY RUN PREVIEW")
//     console.log("=".repeat(60))
//     console.log(`Total Configurations: ${configs.length}`)
//     console.log(`Would Migrate: ${toMigrate.length}`)
//     console.log(`Would Skip: ${toSkip.length}`)
//     console.log("=".repeat(60))

//     if (toMigrate.length > 0) {
//       console.log("\nConfigurations that would be migrated:")
//       for (const item of toMigrate) {
//         console.log(`  ✅ ${item.organizationId}`)
//         for (const action of item.actions || []) {
//           console.log(`     ${action}`)
//         }
//       }
//     }

//     if (toSkip.length > 0) {
//       console.log("\nConfigurations that would be skipped:")
//       for (const item of toSkip) {
//         console.log(`  ⏭️  ${item.organizationId}`)
//         console.log(`     Reason: ${item.reason}`)
//       }
//     }

//     return {
//       totalConfigurations: configs.length,
//       wouldMigrate: toMigrate.length,
//       wouldSkip: toSkip.length,
//       preview,
//     }
//   },
// })

// /**
//  * Run all payment field migrations
//  *
//  * Usage:
//  * npx convex run system/migrations/migratePaymentFields:migrateAll --prod
//  */
// export const migrateAll = internalMutation({
//   args: {},
//   handler: async (ctx) => {
//     console.log("Starting complete payment fields migration...")
//     console.log("=" + "=".repeat(60))

//     // Migrate paymentUrl - inline the logic
//     console.log("\n[1/2] Migrating paymentUrl to paymentLinkUrl...")
//     const urlConfigs = await ctx.db.query("restaurantConfiguration").collect()
//     let urlMigrated = 0
//     let urlSkipped = 0
//     let urlErrors = 0

//     for (const config of urlConfigs) {
//       try {
//         if (config.paymentUrl && config.paymentUrl.trim() !== "") {
//           if (config.paymentLinkUrl && config.paymentLinkUrl.trim() !== "") {
//             urlSkipped++
//             continue
//           }
//           await ctx.db.patch(config._id, {
//             paymentLinkUrl: config.paymentUrl,
//           })
//           console.log(
//             `✅ Migrated paymentUrl for ${config.organizationId}: "${config.paymentUrl}"`
//           )
//           urlMigrated++
//         } else {
//           urlSkipped++
//         }
//       } catch (error) {
//         console.error(
//           `❌ Error migrating paymentUrl for ${config.organizationId}:`,
//           error
//         )
//         urlErrors++
//       }
//     }

//     // Migrate acceptTransfer - inline the logic
//     console.log("\n[2/2] Migrating acceptTransfer to acceptPaymentLink...")
//     const acceptConfigs = await ctx.db
//       .query("restaurantConfiguration")
//       .collect()
//     let acceptMigrated = 0
//     let acceptSkipped = 0
//     let acceptErrors = 0

//     for (const config of acceptConfigs) {
//       try {
//         if (config.acceptTransfer !== undefined) {
//           if (config.acceptPaymentLink !== undefined) {
//             acceptSkipped++
//             continue
//           }
//           await ctx.db.patch(config._id, {
//             acceptPaymentLink: config.acceptTransfer,
//           })
//           console.log(
//             `✅ Migrated acceptTransfer for ${config.organizationId}: ${config.acceptTransfer}`
//           )
//           acceptMigrated++
//         } else {
//           acceptSkipped++
//         }
//       } catch (error) {
//         console.error(
//           `❌ Error migrating acceptTransfer for ${config.organizationId}:`,
//           error
//         )
//         acceptErrors++
//       }
//     }

//     const totalResult = {
//       success: urlErrors === 0 && acceptErrors === 0,
//       paymentUrlMigrated: urlMigrated,
//       paymentUrlSkipped: urlSkipped,
//       paymentUrlErrors: urlErrors,
//       acceptTransferMigrated: acceptMigrated,
//       acceptTransferSkipped: acceptSkipped,
//       acceptTransferErrors: acceptErrors,
//       totalMigrated: urlMigrated + acceptMigrated,
//       totalSkipped: urlSkipped + acceptSkipped,
//       totalErrors: urlErrors + acceptErrors,
//     }

//     console.log("\n" + "=".repeat(60))
//     console.log("COMPLETE MIGRATION SUMMARY")
//     console.log("=".repeat(60))
//     console.log(`paymentUrl: ${urlMigrated} migrated, ${urlSkipped} skipped`)
//     console.log(
//       `acceptTransfer: ${acceptMigrated} migrated, ${acceptSkipped} skipped`
//     )
//     console.log(`Total Migrated: ${totalResult.totalMigrated}`)
//     console.log(`Total Skipped: ${totalResult.totalSkipped}`)
//     console.log(`Total Errors: ${totalResult.totalErrors}`)
//     console.log("=".repeat(60))
//     console.log(
//       totalResult.success
//         ? "✅ All migrations completed successfully!"
//         : "⚠️ Some migrations completed with errors. Check logs above."
//     )

//     return totalResult
//   },
// })
