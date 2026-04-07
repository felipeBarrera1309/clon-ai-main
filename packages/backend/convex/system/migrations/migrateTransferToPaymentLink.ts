// import { internalMutation } from "../../_generated/server"

// /**
//  * PHASE 1 DATA MIGRATION: Migrate "transfer" to "payment_link"
//  *
//  * This migration updates existing data that uses the old "transfer" payment method
//  * to use the new "payment_link" payment method.
//  *
//  * IMPORTANT: This must be run BEFORE removing "transfer" from the schema.
//  *
//  * Migration Plan:
//  * 1. Deploy schema WITH both "transfer" and "payment_link" (backward compatible)
//  * 2. Run this migration to update all data
//  * 3. Verify all data has been migrated
//  * 4. Deploy schema WITHOUT "transfer" (breaking change, but safe because data is migrated)
//  *
//  * Usage:
//  * npx convex run system/migrations/migrateTransferToPaymentLink:migrateAll --prod
//  */

// /**
//  * Dry run: Preview what would be migrated without making changes
//  */
// export const dryRun = internalMutation({
//   args: {},
//   handler: async (ctx) => {
//     console.log("Starting dry run of transfer → payment_link migration...")
//     console.log("=" + "=".repeat(60))

//     // Check orders with "transfer" payment method
//     const allOrders = await ctx.db.query("orders").collect()
//     const ordersWithTransfer = allOrders.filter(
//       (order) => order.paymentMethod === "transfer"
//     )

//     console.log("\n[ORDERS]")
//     console.log(`Total orders: ${allOrders.length}`)
//     console.log(`Orders with "transfer": ${ordersWithTransfer.length}`)
//     console.log(
//       `Orders with other payment methods: ${allOrders.length - ordersWithTransfer.length}`
//     )

//     const result = {
//       orders: {
//         total: allOrders.length,
//         withTransfer: ordersWithTransfer.length,
//         wouldMigrate: ordersWithTransfer.length,
//         sampleOrganizations: ordersWithTransfer
//           .slice(0, 5)
//           .map((o) => o.organizationId),
//       },
//     }

//     console.log("\n" + "=".repeat(60))
//     console.log("DRY RUN SUMMARY")
//     console.log("=".repeat(60))
//     console.log(`Would migrate ${result.orders.wouldMigrate} orders`)
//     console.log("=".repeat(60))

//     if (ordersWithTransfer.length > 0) {
//       console.log("\nSample organizations with 'transfer' orders:")
//       for (const orgId of result.orders.sampleOrganizations) {
//         console.log(`  - ${orgId}`)
//       }
//     }

//     return result
//   },
// })

// /**
//  * Migrate orders from "transfer" to "payment_link"
//  */
// export const migrateOrders = internalMutation({
//   args: {},
//   handler: async (ctx) => {
//     console.log("Starting orders migration: transfer → payment_link...")

//     const allOrders = await ctx.db.query("orders").collect()
//     const ordersWithTransfer = allOrders.filter(
//       (order) => order.paymentMethod === "transfer"
//     )

//     console.log(`Found ${ordersWithTransfer.length} orders to migrate`)

//     let migratedCount = 0
//     let errorCount = 0

//     for (const order of ordersWithTransfer) {
//       try {
//         await ctx.db.patch(order._id, {
//           paymentMethod: "payment_link",
//         })
//         migratedCount++

//         if (migratedCount % 100 === 0) {
//           console.log(`  Migrated ${migratedCount} orders...`)
//         }
//       } catch (error) {
//         console.error(
//           `❌ Error migrating order ${order._id} (${order.orderNumber}):`,
//           error
//         )
//         errorCount++
//       }
//     }

//     const result = {
//       success: errorCount === 0,
//       totalOrders: allOrders.length,
//       migrated: migratedCount,
//       errors: errorCount,
//       message:
//         errorCount === 0
//           ? `✅ Successfully migrated ${migratedCount} orders`
//           : `⚠️ Migrated ${migratedCount} orders with ${errorCount} errors`,
//     }

//     console.log("\n" + "=".repeat(60))
//     console.log("Orders Migration Summary:")
//     console.log("=".repeat(60))
//     console.log(`Total Orders: ${result.totalOrders}`)
//     console.log(`Migrated: ${result.migrated}`)
//     console.log(`Errors: ${result.errors}`)
//     console.log("=".repeat(60))
//     console.log(result.message)

//     return result
//   },
// })

// /**
//  * Migrate all data from "transfer" to "payment_link"
//  *
//  * This runs all migrations in sequence and provides a complete summary.
//  */
// export const migrateAll = internalMutation({
//   args: {},
//   handler: async (ctx) => {
//     console.log("=" + "=".repeat(60))
//     console.log("COMPLETE TRANSFER → PAYMENT_LINK MIGRATION")
//     console.log("=" + "=".repeat(60))

//     // Migrate orders - inline the logic
//     console.log("\n[1/1] Migrating orders...")
//     console.log("Starting orders migration: transfer → payment_link...")

//     const allOrders = await ctx.db.query("orders").collect()
//     const ordersWithTransfer = allOrders.filter(
//       (order) => order.paymentMethod === "transfer"
//     )

//     console.log(`Found ${ordersWithTransfer.length} orders to migrate`)

//     let migratedCount = 0
//     let errorCount = 0

//     for (const order of ordersWithTransfer) {
//       try {
//         await ctx.db.patch(order._id, {
//           paymentMethod: "payment_link",
//         })
//         migratedCount++

//         if (migratedCount % 100 === 0) {
//           console.log(`  Migrated ${migratedCount} orders...`)
//         }
//       } catch (error) {
//         console.error(
//           `❌ Error migrating order ${order._id} (${order.orderNumber}):`,
//           error
//         )
//         errorCount++
//       }
//     }

//     const ordersResult = {
//       success: errorCount === 0,
//       totalOrders: allOrders.length,
//       migrated: migratedCount,
//       errors: errorCount,
//       message:
//         errorCount === 0
//           ? `✅ Successfully migrated ${migratedCount} orders`
//           : `⚠️ Migrated ${migratedCount} orders with ${errorCount} errors`,
//     }

//     console.log("\n" + "=".repeat(60))
//     console.log("Orders Migration Summary:")
//     console.log("=".repeat(60))
//     console.log(`Total Orders: ${ordersResult.totalOrders}`)
//     console.log(`Migrated: ${ordersResult.migrated}`)
//     console.log(`Errors: ${ordersResult.errors}`)
//     console.log("=".repeat(60))
//     console.log(ordersResult.message)

//     const totalResult = {
//       success: ordersResult.success,
//       orders: ordersResult,
//       totalMigrated: ordersResult.migrated,
//       totalErrors: ordersResult.errors,
//     }

//     console.log("\n" + "=".repeat(60))
//     console.log("COMPLETE MIGRATION SUMMARY")
//     console.log("=".repeat(60))
//     console.log(`Total Records Migrated: ${totalResult.totalMigrated}`)
//     console.log(`Total Errors: ${totalResult.totalErrors}`)
//     console.log("=".repeat(60))
//     console.log(
//       totalResult.success
//         ? "✅ All migrations completed successfully!"
//         : "⚠️ Some migrations completed with errors. Check logs above."
//     )
//     console.log("=".repeat(60))
//     console.log("\nNext Steps:")
//     console.log("1. Verify all data has been migrated")
//     console.log(
//       "2. Run verification query to check for any remaining 'transfer' values"
//     )
//     console.log("3. Deploy schema WITHOUT 'transfer' in paymentMethodValidator")

//     return totalResult
//   },
// })

// /**
//  * Verification: Check if any "transfer" values remain
//  *
//  * Run this AFTER migration to ensure all data has been migrated.
//  */
// export const verify = internalMutation({
//   args: {},
//   handler: async (ctx) => {
//     console.log(
//       "Verifying migration: checking for remaining 'transfer' values..."
//     )
//     console.log("=" + "=".repeat(60))

//     const allOrders = await ctx.db.query("orders").collect()
//     const ordersWithTransfer = allOrders.filter(
//       (order) => order.paymentMethod === "transfer"
//     )

//     const allClean = ordersWithTransfer.length === 0

//     console.log("\n[VERIFICATION RESULTS]")
//     console.log(`Total orders: ${allOrders.length}`)
//     console.log(`Orders still with "transfer": ${ordersWithTransfer.length}`)

//     if (ordersWithTransfer.length > 0) {
//       console.log("\n⚠️ WARNING: Found orders still using 'transfer':")
//       for (const order of ordersWithTransfer.slice(0, 10)) {
//         console.log(
//           `  - Order ${order.orderNumber} (${order._id}): ${order.organizationId}`
//         )
//       }
//       if (ordersWithTransfer.length > 10) {
//         console.log(`  ... and ${ordersWithTransfer.length - 10} more`)
//       }
//     }

//     console.log("\n" + "=".repeat(60))
//     if (allClean) {
//       console.log("✅ VERIFICATION PASSED")
//       console.log("=".repeat(60))
//       console.log("No 'transfer' values found. Safe to remove from schema.")
//     } else {
//       console.log("❌ VERIFICATION FAILED")
//       console.log("=".repeat(60))
//       console.log(
//         `Found ${ordersWithTransfer.length} records still using 'transfer'.`
//       )
//       console.log("DO NOT remove 'transfer' from schema yet.")
//       console.log("Run migration again or investigate errors.")
//     }

//     return {
//       success: allClean,
//       ordersWithTransfer: ordersWithTransfer.length,
//       totalOrders: allOrders.length,
//       message: allClean
//         ? "✅ All data migrated successfully"
//         : `❌ ${ordersWithTransfer.length} records still use 'transfer'`,
//     }
//   },
// })
