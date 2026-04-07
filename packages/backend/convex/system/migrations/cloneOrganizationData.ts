import { v } from "convex/values"
import type { Id } from "../../_generated/dataModel"
import { internalMutation } from "../../_generated/server"
import { aggregateContactsByOrganization } from "../../contactsAggregate"
import { aggregateDeliveryAreasByOrganization } from "../../deliveryAreasAggregate"
import { aggregateMenuProductsByOrganization } from "../../menuProductsAggregate"
import { aggregateRestaurantLocationsByOrganization } from "../../restaurantLocationsAggregate"

/**
 * Clone all data from one organization to another.
 * This is an internal mutation that can only be executed via Convex CLI.
 *
 * Usage:
 * npx convex run system/migrations/cloneOrganizationData:cloneOrganization \
 *   '{"sourceOrgId":"org_SOURCE","targetOrgId":"org_TARGET"}' --prod
 *
 * This will copy all data from sourceOrgId to targetOrgId in the following tables:
 * - agentConfiguration
 * - restaurantLocations
 * - contacts
 * - menuProductCategories
 * - menuProductSubcategories
 * - sizes
 * - menuProducts
 * - menuProductAvailability
 * - deliveryAreas
 * - restaurantConfiguration
 * - whatsappConfigurations
 *
 * NOTE: This does NOT copy:
 * - conversations (user-specific)
 * - orders (user-specific)
 * - orderItems (user-specific)
 * - menuProductOrderItems (user-specific)
 * - messageAttachments (user-specific)
 * - electronicInvoices (user-specific)
 * - conversationScheduledFunctions (user-specific)
 */
export const cloneOrganization = internalMutation({
  args: {
    sourceOrgId: v.string(),
    targetOrgId: v.string(),
  },
  handler: async (ctx, args) => {
    const { sourceOrgId, targetOrgId } = args

    console.log(
      `Starting organization cloning from ${sourceOrgId} to ${targetOrgId}`
    )

    // Track ID mappings for foreign key references
    const idMappings = {
      restaurantLocations: new Map<
        Id<"restaurantLocations">,
        Id<"restaurantLocations">
      >(),
      menuProductCategories: new Map<
        Id<"menuProductCategories">,
        Id<"menuProductCategories">
      >(),
      menuProductSubcategories: new Map<
        Id<"menuProductSubcategories">,
        Id<"menuProductSubcategories">
      >(),
      sizes: new Map<Id<"sizes">, Id<"sizes">>(),
      menuProducts: new Map<Id<"menuProducts">, Id<"menuProducts">>(),
      whatsappConfigurations: new Map<
        Id<"whatsappConfigurations">,
        Id<"whatsappConfigurations">
      >(),
    }

    let totalCloned = 0

    // 1. Clone agentConfiguration
    console.log("Cloning agentConfiguration...")
    const agentConfigs = await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", sourceOrgId)
      )
      .collect()

    for (const config of agentConfigs) {
      const { _id, _creationTime, ...configData } = config
      await ctx.db.insert("agentConfiguration", {
        ...configData,
        organizationId: targetOrgId,
      })
      totalCloned++
    }
    console.log(`Cloned ${agentConfigs.length} agentConfiguration records`)

    // 2. Clone restaurantConfiguration
    console.log("Cloning restaurantConfiguration...")
    const restaurantConfigs = await ctx.db
      .query("restaurantConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", sourceOrgId)
      )
      .collect()

    for (const config of restaurantConfigs) {
      const { _id, _creationTime, ...configData } = config
      await ctx.db.insert("restaurantConfiguration", {
        ...configData,
        organizationId: targetOrgId,
      })
      totalCloned++
    }
    console.log(
      `Cloned ${restaurantConfigs.length} restaurantConfiguration records`
    )

    // 3. Clone restaurantLocations (needed for foreign keys)
    console.log("Cloning restaurantLocations...")
    const locations = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", sourceOrgId)
      )
      .collect()

    for (const location of locations) {
      const { _id, _creationTime, ...locationData } = location
      const newId = await ctx.db.insert("restaurantLocations", {
        ...locationData,
        organizationId: targetOrgId,
      })
      const createdLocation = await ctx.db.get(newId)
      if (createdLocation) {
        await aggregateRestaurantLocationsByOrganization.insertIfDoesNotExist(
          ctx,
          createdLocation
        )
      }
      idMappings.restaurantLocations.set(_id, newId)
      totalCloned++
    }
    console.log(`Cloned ${locations.length} restaurantLocations records`)

    // 4. Clone whatsappConfigurations
    console.log("Cloning whatsappConfigurations...")
    const whatsappConfigs = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", sourceOrgId)
      )
      .collect()

    for (const config of whatsappConfigs) {
      const { _id, _creationTime, ...configData } = config
      const newId = await ctx.db.insert("whatsappConfigurations", {
        ...configData,
        organizationId: targetOrgId,
        restaurantLocationId: config.restaurantLocationId
          ? idMappings.restaurantLocations.get(config.restaurantLocationId)
          : undefined,
      })
      idMappings.whatsappConfigurations.set(_id, newId)
      totalCloned++
    }
    console.log(
      `Cloned ${whatsappConfigs.length} whatsappConfigurations records`
    )

    // 5. Clone deliveryAreas (depends on restaurantLocations)
    console.log("Cloning deliveryAreas...")
    const deliveryAreas = await ctx.db
      .query("deliveryAreas")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", sourceOrgId)
      )
      .collect()

    for (const area of deliveryAreas) {
      const { _id, _creationTime, restaurantLocationId, ...areaData } = area
      const newLocationId =
        idMappings.restaurantLocations.get(restaurantLocationId)
      if (newLocationId) {
        const newId = await ctx.db.insert("deliveryAreas", {
          ...areaData,
          organizationId: targetOrgId,
          restaurantLocationId: newLocationId,
        })
        const createdArea = await ctx.db.get(newId)
        if (createdArea) {
          await aggregateDeliveryAreasByOrganization.insertIfDoesNotExist(
            ctx,
            createdArea
          )
        }
        totalCloned++
      }
    }
    console.log(`Cloned ${deliveryAreas.length} deliveryAreas records`)

    // 6. Clone contacts
    console.log("Cloning contacts...")
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", sourceOrgId)
      )
      .collect()

    for (const contact of contacts) {
      const { _id, _creationTime, ...contactData } = contact
      const newId = await ctx.db.insert("contacts", {
        ...contactData,
        organizationId: targetOrgId,
      })
      const createdContact = await ctx.db.get(newId)
      if (createdContact) {
        await aggregateContactsByOrganization.insertIfDoesNotExist(
          ctx,
          createdContact
        )
      }
      totalCloned++
    }
    console.log(`Cloned ${contacts.length} contacts records`)

    // 7. Clone menuProductCategories
    console.log("Cloning menuProductCategories...")
    const categories = await ctx.db
      .query("menuProductCategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", sourceOrgId)
      )
      .collect()

    for (const category of categories) {
      const { _id, _creationTime, ...categoryData } = category
      const newId = await ctx.db.insert("menuProductCategories", {
        ...categoryData,
        organizationId: targetOrgId,
      })
      idMappings.menuProductCategories.set(_id, newId)
      totalCloned++
    }
    console.log(`Cloned ${categories.length} menuProductCategories records`)

    // 8. Clone menuProductSubcategories
    console.log("Cloning menuProductSubcategories...")
    const subcategories = await ctx.db
      .query("menuProductSubcategories")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", sourceOrgId)
      )
      .collect()

    for (const subcategory of subcategories) {
      const { _id, _creationTime, menuProductCategoryId, ...subcategoryData } =
        subcategory
      const newCategoryId = idMappings.menuProductCategories.get(
        menuProductCategoryId
      )
      if (newCategoryId) {
        const newId = await ctx.db.insert("menuProductSubcategories", {
          ...subcategoryData,
          organizationId: targetOrgId,
          menuProductCategoryId: newCategoryId,
        })
        idMappings.menuProductSubcategories.set(_id, newId)
        totalCloned++
      }
    }
    console.log(
      `Cloned ${subcategories.length} menuProductSubcategories records`
    )

    // 9. Clone sizes
    console.log("Cloning sizes...")
    const sizes = await ctx.db
      .query("sizes")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", sourceOrgId)
      )
      .collect()

    for (const size of sizes) {
      const { _id, _creationTime, ...sizeData } = size
      const newId = await ctx.db.insert("sizes", {
        ...sizeData,
        organizationId: targetOrgId,
      })
      idMappings.sizes.set(_id, newId)
      totalCloned++
    }
    console.log(`Cloned ${sizes.length} sizes records`)

    // 10. Clone menuProducts (depends on categories, subcategories, sizes)
    console.log("Cloning menuProducts...")
    const products = await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", sourceOrgId)
      )
      .collect()

    for (const product of products) {
      const {
        _id,
        _creationTime,
        menuProductCategoryId,
        menuProductSubcategoryId,
        sizeId,
        combinableWith,
        ...productData
      } = product

      const newCategoryId = idMappings.menuProductCategories.get(
        menuProductCategoryId
      )
      if (!newCategoryId) continue

      const newSubcategoryId = menuProductSubcategoryId
        ? idMappings.menuProductSubcategories.get(menuProductSubcategoryId)
        : undefined

      const newSizeId = sizeId ? idMappings.sizes.get(sizeId) : undefined

      // Handle combinableWith array with new IDs
      const newCombinableWith = combinableWith?.map((combo) => ({
        menuProductCategoryId: idMappings.menuProductCategories.get(
          combo.menuProductCategoryId
        )!,
        sizeId: combo.sizeId ? idMappings.sizes.get(combo.sizeId) : undefined,
      }))

      const newId = await ctx.db.insert("menuProducts", {
        ...productData,
        organizationId: targetOrgId,
        menuProductCategoryId: newCategoryId,
        menuProductSubcategoryId: newSubcategoryId,
        sizeId: newSizeId,
        combinableWith: newCombinableWith,
      })
      const createdProduct = await ctx.db.get(newId)
      if (createdProduct) {
        await aggregateMenuProductsByOrganization.insertIfDoesNotExist(
          ctx,
          createdProduct
        )
      }
      idMappings.menuProducts.set(_id, newId)
      totalCloned++
    }
    console.log(`Cloned ${products.length} menuProducts records`)

    // 11. Clone menuProductAvailability
    console.log("Cloning menuProductAvailability...")
    const availabilities = await ctx.db
      .query("menuProductAvailability")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", sourceOrgId)
      )
      .collect()

    for (const availability of availabilities) {
      const {
        _id,
        _creationTime,
        menuProductId,
        restaurantLocationId,
        ...availabilityData
      } = availability

      const newProductId = idMappings.menuProducts.get(menuProductId)
      const newLocationId =
        idMappings.restaurantLocations.get(restaurantLocationId)

      if (newProductId && newLocationId) {
        await ctx.db.insert("menuProductAvailability", {
          ...availabilityData,
          organizationId: targetOrgId,
          menuProductId: newProductId,
          restaurantLocationId: newLocationId,
        })
        totalCloned++
      }
    }
    console.log(
      `Cloned ${availabilities.length} menuProductAvailability records`
    )

    console.log(`\n✅ Successfully cloned organization data!`)
    console.log(`Total records cloned: ${totalCloned}`)
    console.log(`From: ${sourceOrgId}`)
    console.log(`To: ${targetOrgId}`)

    return {
      success: true,
      sourceOrgId,
      targetOrgId,
      totalCloned,
      idMappings: {
        restaurantLocations: idMappings.restaurantLocations.size,
        menuProductCategories: idMappings.menuProductCategories.size,
        menuProductSubcategories: idMappings.menuProductSubcategories.size,
        sizes: idMappings.sizes.size,
        menuProducts: idMappings.menuProducts.size,
        whatsappConfigurations: idMappings.whatsappConfigurations.size,
      },
    }
  },
})
