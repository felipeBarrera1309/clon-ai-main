import { internalMutation } from "../../_generated/server"

/**
 * Migration: Add ragConfiguration to agentConfiguration
 *
 * This migration adds the new ragConfiguration field to existing agentConfiguration records.
 * Since this is a new optional field, we initialize it with default values for organizations
 * that don't have it set yet.
 *
 * This is a one-time data migration needed after extending the agentConfiguration schema.
 *
 * Usage:
 * npx convex run system/migrations/addRagConfiguration:addRagConfiguration --prod
 */
export const addRagConfiguration = internalMutation({
  args: {},
  handler: async (ctx) => {
    console.log("Starting ragConfiguration migration...")

    // Get all agent configurations
    const configs = await ctx.db.query("agentConfiguration").collect()

    console.log(`Found ${configs.length} agent configurations to process`)

    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0

    // Default RAG configuration values
    const defaultRagConfig = {
      combinationRules: {
        noMixCompleteWithHalf: {
          prohibited: true,
          required: false,
          discountApplied: false,
          message:
            "No se pueden mezclar pizzas completas con medias pizzas en el mismo pedido.",
        },
        pizzaWithDrink: {
          prohibited: false,
          required: true,
          discountApplied: false,
          message: "Recomendamos acompañar tu pizza con una bebida.",
        },
      },
      searchBehavior: {
        defaultResponseFormat: "contextual",
        maxResultsPerCategory: 8,
        enableSmartGrouping: true,
        prioritizePopularProducts: true,
      },
    }

    for (const config of configs) {
      try {
        // Check if ragConfiguration already exists
        if (config.ragConfiguration) {
          console.log(
            `Skipping organization ${config.organizationId}: ragConfiguration already exists`
          )
          skippedCount++
          continue
        }

        // Add default ragConfiguration
        await ctx.db.patch(config._id, {
          ragConfiguration: defaultRagConfig,
        })

        console.log(
          `✅ Added ragConfiguration to organization ${config.organizationId}`
        )
        updatedCount++
      } catch (error) {
        console.error(
          `❌ Error updating organization ${config.organizationId}:`,
          error
        )
        errorCount++
      }
    }

    const result = {
      success: errorCount === 0,
      totalConfigurations: configs.length,
      updated: updatedCount,
      skipped: skippedCount,
      errors: errorCount,
      message:
        errorCount === 0
          ? `✅ Migration completed successfully! Updated ${updatedCount} configurations, skipped ${skippedCount}.`
          : `⚠️ Migration completed with errors. Updated ${updatedCount}, skipped ${skippedCount}, errors ${errorCount}.`,
    }

    console.log("\n" + "=".repeat(60))
    console.log("RAG Configuration Migration Summary:")
    console.log("=".repeat(60))
    console.log(`Total Configurations: ${result.totalConfigurations}`)
    console.log(`Updated: ${result.updated}`)
    console.log(`Skipped: ${result.skipped}`)
    console.log(`Errors: ${result.errors}`)
    console.log("=".repeat(60))
    console.log(result.message)

    return result
  },
})

/**
 * Dry run: Preview what would be migrated without making changes
 *
 * Usage:
 * npx convex run system/migrations/addRagConfiguration:dryRun --prod
 */
export const dryRun = internalMutation({
  args: {},
  handler: async (ctx) => {
    console.log("Starting dry run of RAG configuration migration...")

    const configs = await ctx.db.query("agentConfiguration").collect()
    console.log(`Found ${configs.length} agent configurations to process`)

    const preview = []

    for (const config of configs) {
      if (config.ragConfiguration) {
        preview.push({
          organizationId: config.organizationId,
          action: "SKIP",
          reason: "ragConfiguration already exists",
        })
      } else {
        preview.push({
          organizationId: config.organizationId,
          action: "ADD",
          details:
            "Will add default ragConfiguration with attribute rules, combination rules, and search behavior",
        })
      }
    }

    const toAdd = preview.filter((p) => p.action === "ADD")
    const toSkip = preview.filter((p) => p.action === "SKIP")

    console.log("\n" + "=".repeat(60))
    console.log("DRY RUN PREVIEW")
    console.log("=".repeat(60))
    console.log(`Total Configurations: ${configs.length}`)
    console.log(`Would Add: ${toAdd.length}`)
    console.log(`Would Skip: ${toSkip.length}`)
    console.log("=".repeat(60))

    if (toAdd.length > 0) {
      console.log("\nConfigurations that would be updated:")
      for (const item of toAdd) {
        console.log(`  ✅ ${item.organizationId}`)
        console.log(`     ${item.details}`)
      }
    }

    if (toSkip.length > 0) {
      console.log("\nConfigurations that would be skipped:")
      for (const item of toSkip) {
        console.log(`  ⏭️  ${item.organizationId}`)
        console.log(`     Reason: ${item.reason}`)
      }
    }

    return {
      totalConfigurations: configs.length,
      wouldAdd: toAdd.length,
      wouldSkip: toSkip.length,
      preview,
    }
  },
})
