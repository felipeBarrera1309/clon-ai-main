import { v } from "convex/values"
import { aggregateDeliveryAreasByOrganization } from "../deliveryAreasAggregate"
import { authMutation } from "../lib/helpers"
import { areCoordinatesEqual, checkForConflicts } from "../lib/importUtils"
import { parseKML, validateKMLData } from "../lib/kmlParser"

export interface ImportPreview {
  folders: Array<{
    name: string
    placemarks: Array<{
      id: string
      name: string
      description: string
      coordinates: { lat: number; lng: number }[]
      deliveryFee?: number
      minimumOrder?: number
      estimatedDeliveryTime?: string
      conflicts: string[]
    }>
  }>
  totalAreas: number
  newAreas: number
  conflictingAreas: number
  errors: string[]
  warnings: string[]
}

export interface ImportResult {
  success: boolean
  importedAreas: number
  skippedAreas: number
  errors: string[]
  createdAreaIds: string[]
}

const areaValidator = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  coordinates: v.array(v.object({ lat: v.number(), lng: v.number() })),
  deliveryFee: v.optional(v.number()),
  minimumOrder: v.optional(v.number()),
  estimatedDeliveryTime: v.optional(v.string()),
  isActive: v.optional(v.boolean()),
})

/**
 * Preview coverage area import data (from CSV, Excel, ODS parsed on client)
 */
export const previewCoverageAreaImport = authMutation({
  args: {
    organizationId: v.string(),
    areas: v.array(areaValidator),
    restaurantLocationId: v.id("restaurantLocations"),
  },
  handler: async (ctx, args): Promise<ImportPreview> => {
    // Get existing delivery areas for conflict detection
    const existingAreas = await ctx.db
      .query("deliveryAreas")
      .withIndex("by_organization_and_restaurant_location", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("restaurantLocationId", args.restaurantLocationId)
      )
      .collect()

    const placemarks: ImportPreview["folders"][0]["placemarks"] = []
    let totalAreas = 0
    let newAreas = 0
    let conflictingAreas = 0

    // Track processed in this import to detect duplicates within same file
    const allProcessed: Array<{
      name: string
      coordinates: { lat: number; lng: number }[]
    }> = []

    for (const area of args.areas) {
      totalAreas++

      const existingConflicts = checkForConflicts(
        area,
        existingAreas,
        "existing"
      )
      const importConflicts = checkForConflicts(area, allProcessed, "import")
      const conflicts = [...existingConflicts, ...importConflicts]

      if (conflicts.length > 0) {
        conflictingAreas++
      } else {
        newAreas++
      }

      placemarks.push({
        id: `universal_${totalAreas}`,
        name: area.name,
        description: area.description || "",
        coordinates: area.coordinates,
        deliveryFee: area.deliveryFee,
        minimumOrder: area.minimumOrder,
        estimatedDeliveryTime: area.estimatedDeliveryTime,
        conflicts,
      })

      allProcessed.push({
        name: area.name,
        coordinates: area.coordinates,
      })
    }

    return {
      folders: [
        {
          name: "Archivo",
          placemarks,
        },
      ],
      totalAreas,
      newAreas,
      conflictingAreas,
      errors: [],
      warnings: [],
    }
  },
})

/**
 * Import standardized data into delivery areas
 */
export const importCoverageAreaData = authMutation({
  args: {
    organizationId: v.string(),
    areas: v.array(areaValidator),
    conflictResolution: v.union(v.literal("skip"), v.literal("overwrite")),
    restaurantLocationId: v.id("restaurantLocations"),
  },
  handler: async (ctx, args): Promise<ImportResult> => {
    const existingAreas = await ctx.db
      .query("deliveryAreas")
      .withIndex("by_organization_and_restaurant_location", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("restaurantLocationId", args.restaurantLocationId)
      )
      .collect()

    const createdAreaIds: string[] = []
    let importedAreas = 0
    let skippedAreas = 0
    const errors: string[] = []

    const allProcessed: Array<{
      name: string
      coordinates: { lat: number; lng: number }[]
    }> = []

    for (const area of args.areas) {
      try {
        const existingConflicts = checkForConflicts(
          area,
          existingAreas,
          "existing"
        )
        const importConflicts = checkForConflicts(area, allProcessed, "import")
        const hasConflicts =
          existingConflicts.length > 0 || importConflicts.length > 0

        if (hasConflicts) {
          if (
            importConflicts.length > 0 &&
            args.conflictResolution === "skip"
          ) {
            skippedAreas++
            continue
          }

          if (existingConflicts.length > 0) {
            const existingArea = existingAreas.find((ea) =>
              areCoordinatesEqual(area.coordinates, ea.coordinates)
            )

            if (args.conflictResolution === "skip") {
              skippedAreas++
              continue
            } else if (
              args.conflictResolution === "overwrite" &&
              existingArea
            ) {
              await ctx.db.patch(existingArea._id, {
                name: area.name,
                description: area.description,
                coordinates: area.coordinates,
                deliveryFee: area.deliveryFee,
                minimumOrder: area.minimumOrder || 0,
                estimatedDeliveryTime: area.estimatedDeliveryTime,
                isActive: area.isActive ?? true,
              })
              importedAreas++
              allProcessed.push({
                name: area.name,
                coordinates: area.coordinates,
              })
              continue
            }
          }
        }

        const areaId = await ctx.db.insert("deliveryAreas", {
          organizationId: args.organizationId,
          name: area.name,
          description: area.description,
          coordinates: area.coordinates,
          isActive: area.isActive ?? true,
          deliveryFee: area.deliveryFee,
          minimumOrder: area.minimumOrder || 0,
          estimatedDeliveryTime: area.estimatedDeliveryTime,
          restaurantLocationId: args.restaurantLocationId,
        })
        const createdArea = await ctx.db.get(areaId)
        if (createdArea) {
          await aggregateDeliveryAreasByOrganization.insertIfDoesNotExist(
            ctx,
            createdArea
          )
        }

        createdAreaIds.push(areaId)
        importedAreas++
        allProcessed.push({ name: area.name, coordinates: area.coordinates })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        errors.push(`Error al importar "${area.name}": ${errorMessage}`)
        skippedAreas++
      }
    }

    return {
      success: errors.length === 0,
      importedAreas,
      skippedAreas,
      errors,
      createdAreaIds,
    }
  },
})

/**
 * Parses and validates KML content for preview
 */
export const previewKMLImport = authMutation({
  args: {
    organizationId: v.string(),
    kmlContent: v.string(),
    restaurantLocationId: v.id("restaurantLocations"),
  },
  handler: async (ctx, args): Promise<ImportPreview> => {
    try {
      const parsedData = parseKML(args.kmlContent)
      const validation = validateKMLData(parsedData)
      const existingAreas = await ctx.db
        .query("deliveryAreas")
        .withIndex("by_organization_and_restaurant_location", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("restaurantLocationId", args.restaurantLocationId)
        )
        .collect()

      const folders: ImportPreview["folders"] = []
      let totalAreas = 0
      let newAreas = 0
      let conflictingAreas = 0
      const errors: string[] = [...validation.errors]
      const warnings: string[] = [...validation.warnings]

      const allProcessed: Array<{
        name: string
        coordinates: { lat: number; lng: number }[]
      }> = []

      for (const folder of parsedData.folders) {
        const placemarks: ImportPreview["folders"][0]["placemarks"] = []

        for (const placemark of folder.placemarks) {
          totalAreas++
          const existingConflicts = checkForConflicts(
            placemark,
            existingAreas,
            "existing"
          )
          const importConflicts = checkForConflicts(
            placemark,
            allProcessed,
            "import"
          )
          const conflicts = [...existingConflicts, ...importConflicts]

          if (conflicts.length > 0) {
            conflictingAreas++
          } else {
            newAreas++
          }

          placemarks.push({
            id: placemark.id,
            name: placemark.name,
            description: placemark.description,
            coordinates: placemark.coordinates,
            deliveryFee: placemark.deliveryFee,
            minimumOrder: placemark.minimumOrder,
            estimatedDeliveryTime: placemark.estimatedDeliveryTime,
            conflicts,
          })

          allProcessed.push({
            name: placemark.name,
            coordinates: placemark.coordinates,
          })
        }

        if (placemarks.length > 0) {
          folders.push({
            name: folder.name,
            placemarks,
          })
        }
      }

      return {
        folders,
        totalAreas,
        newAreas,
        conflictingAreas,
        errors,
        warnings,
      }
    } catch (error) {
      console.error("Error in previewKMLImport:", error)
      return {
        folders: [],
        totalAreas: 0,
        newAreas: 0,
        conflictingAreas: 0,
        errors: [
          `Error al procesar el archivo KML: ${error instanceof Error ? error.message : String(error)}`,
        ],
        warnings: [],
      }
    }
  },
})

/**
 * Imports KML data into delivery areas
 */
export const importKMLData = authMutation({
  args: {
    organizationId: v.string(),
    kmlContent: v.string(),
    conflictResolution: v.union(v.literal("skip"), v.literal("overwrite")),
    restaurantLocationId: v.id("restaurantLocations"),
  },
  handler: async (ctx, args): Promise<ImportResult> => {
    try {
      const parsedData = parseKML(args.kmlContent)
      const validation = validateKMLData(parsedData)

      if (validation.errors.length > 0) {
        return {
          success: false,
          importedAreas: 0,
          skippedAreas: 0,
          errors: validation.errors,
          createdAreaIds: [],
        }
      }

      const existingAreas = await ctx.db
        .query("deliveryAreas")
        .withIndex("by_organization_and_restaurant_location", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("restaurantLocationId", args.restaurantLocationId)
        )
        .collect()

      const createdAreaIds: string[] = []
      let importedAreas = 0
      let skippedAreas = 0
      const errors: string[] = []
      const allProcessed: Array<{
        name: string
        coordinates: { lat: number; lng: number }[]
      }> = []

      for (const folder of parsedData.folders) {
        for (const placemark of folder.placemarks) {
          try {
            const existingConflicts = checkForConflicts(
              placemark,
              existingAreas,
              "existing"
            )
            const importConflicts = checkForConflicts(
              placemark,
              allProcessed,
              "import"
            )
            const allConflicts = [...existingConflicts, ...importConflicts]

            if (allConflicts.length > 0) {
              if (
                importConflicts.length > 0 &&
                args.conflictResolution === "skip"
              ) {
                skippedAreas++
                continue
              } else if (
                importConflicts.length > 0 &&
                args.conflictResolution === "overwrite"
              ) {
                placemark.name = `${placemark.name} (Duplicado)`
              } else if (existingConflicts.length > 0) {
                const existingArea = existingAreas.find((area) =>
                  areCoordinatesEqual(placemark.coordinates, area.coordinates)
                )

                if (args.conflictResolution === "skip") {
                  skippedAreas++
                  continue
                } else if (
                  args.conflictResolution === "overwrite" &&
                  existingArea
                ) {
                  await ctx.db.patch(existingArea._id, {
                    name: placemark.name,
                    coordinates: placemark.coordinates,
                    description: placemark.description,
                    deliveryFee: placemark.deliveryFee,
                    minimumOrder: placemark.minimumOrder,
                    estimatedDeliveryTime: placemark.estimatedDeliveryTime,
                    isActive: true,
                  })
                  importedAreas++
                  allProcessed.push({
                    name: placemark.name,
                    coordinates: placemark.coordinates,
                  })
                  continue
                }
              }
            }

            const areaId = await ctx.db.insert("deliveryAreas", {
              organizationId: args.organizationId,
              name: placemark.name,
              description: placemark.description,
              coordinates: placemark.coordinates,
              isActive: true,
              deliveryFee: placemark.deliveryFee,
              minimumOrder: placemark.minimumOrder || 0,
              estimatedDeliveryTime: placemark.estimatedDeliveryTime,
              restaurantLocationId: args.restaurantLocationId,
            })
            const createdArea = await ctx.db.get(areaId)
            if (createdArea) {
              await aggregateDeliveryAreasByOrganization.insertIfDoesNotExist(
                ctx,
                createdArea
              )
            }

            createdAreaIds.push(areaId)
            importedAreas++
            allProcessed.push({
              name: placemark.name,
              coordinates: placemark.coordinates,
            })
          } catch (error) {
            errors.push(
              `Error al importar "${placemark.name}": ${error instanceof Error ? error.message : String(error)}`
            )
            skippedAreas++
          }
        }
      }

      return {
        success: errors.length === 0,
        importedAreas,
        skippedAreas,
        errors,
        createdAreaIds,
      }
    } catch (error) {
      return {
        success: false,
        importedAreas: 0,
        skippedAreas: 0,
        errors: [
          `Error durante la importación: ${error instanceof Error ? error.message : String(error)}`,
        ],
        createdAreaIds: [],
      }
    }
  },
})
