// system/addressValidation.ts

import { v } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import { internalQuery } from "../_generated/server"
import {
  type Coordinates,
  GeofencingService,
  geocodeAddress,
} from "../lib/geocoding"
import {
  isRestaurantOpen,
  type ScheduleValidationResult,
} from "../lib/scheduleUtils"

const roundCoord = (v: number) => Number(v.toFixed(6))

/**
 * Check if a delivery area is currently open
 * Both the restaurant location AND the delivery area (if it has openingHours) must be open
 */
function isDeliveryAreaOpen(
  deliveryArea: Doc<"deliveryAreas">,
  restaurantLocation: Doc<"restaurantLocations">,
  checkTime?: Date
): ScheduleValidationResult {
  const restaurantResult = isRestaurantOpen(restaurantLocation, checkTime)

  if (!restaurantResult.isOpen) {
    return {
      isOpen: false,
      message: `Restaurante cerrado - ${restaurantResult.message}`,
      nextOpenTime: restaurantResult.nextOpenTime,
    }
  }

  if (deliveryArea.openingHours && deliveryArea.openingHours.length > 0) {
    const areaAsLocation: Doc<"restaurantLocations"> = {
      ...restaurantLocation,
      openingHours: deliveryArea.openingHours,
    }
    const areaResult = isRestaurantOpen(areaAsLocation, checkTime)

    if (!areaResult.isOpen) {
      return {
        isOpen: false,
        message: `Zona de entrega cerrada - ${areaResult.message}`,
        nextOpenTime: areaResult.nextOpenTime,
      }
    }

    return {
      isOpen: true,
      message: restaurantResult.message,
      nextOpenTime: restaurantResult.nextOpenTime,
    }
  }

  return restaurantResult
}

// ---------- QUERIES ----------

export const getRestaurantLocationById = internalQuery({
  args: {
    restaurantLocationId: v.id("restaurantLocations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.restaurantLocationId)
  },
})

export const getActiveRestaurantLocations = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("available"), true))
      .take(1) // Just need one for centering the map/bias
  },
})

export const getActiveValidLocationsByCoordinates = internalQuery({
  args: {
    organizationId: v.string(),
    coordinates: v.object({ lat: v.number(), lng: v.number() }),
  },
  handler: async (ctx, args) => {
    const deliveryAreas = await ctx.db
      .query("deliveryAreas")
      .withIndex("by_organization_and_active", (q) =>
        q.eq("organizationId", args.organizationId).eq("isActive", true)
      )
      .collect()

    const point: Coordinates = {
      lat: roundCoord(args.coordinates.lat),
      lng: roundCoord(args.coordinates.lng),
    }

    console.log(
      `[VALIDACIÓN] 🔍 Buscando áreas de entrega válidas para coordenadas: (${point.lat}, ${point.lng})`
    )
    console.log(
      `[VALIDACIÓN] 📊 Total de áreas activas encontradas: ${deliveryAreas.length}`
    )

    const matchingAreas: Doc<"deliveryAreas">[] = []
    const nearBorderAreas: Doc<"deliveryAreas">[] = []

    for (const area of deliveryAreas) {
      if (!area.coordinates?.length) continue

      const coords = area.coordinates as unknown as Coordinates[]

      // Primero: buscar si el punto está dentro del polígono
      if (GeofencingService.isPointInPolygon(point, coords, area.name, true)) {
        matchingAreas.push(area)
      } else {
        // Punto cerca del borde (hasta 2km) para casos de geocodificación imprecisa
        const distanceToBorder = GeofencingService.distanceToPolygonBorder(
          point,
          coords
        )
        if (distanceToBorder <= 0.018) {
          // ~2000m (aumentado de 100m)
          console.log(
            `[VALIDACIÓN] 🎯 Punto cerca del borde del área ${area.name} (distancia: ${(
              distanceToBorder * 111000
            ).toFixed(0)}m)`
          )
          nearBorderAreas.push(area)
        }
      }
    }

    const validAreas: Array<{
      area: Doc<"deliveryAreas">
      distanceToBorder: number
      isInside: boolean
      restaurantLocation: Doc<"restaurantLocations">
      scheduleResult: ReturnType<typeof isDeliveryAreaOpen>
      calculatedArea: number
      score: number
    }> = []

    const candidateAreas = [...matchingAreas, ...nearBorderAreas]

    console.log(
      `[VALIDACIÓN] 📊 Evaluando ${candidateAreas.length} áreas candidatas...`
    )

    // Si no hay áreas candidatas, buscar las más cercanas por proximidad
    if (candidateAreas.length === 0) {
      console.log(
        `[VALIDACIÓN] 🔍 No hay áreas dentro/cerca del borde. Buscando por proximidad...`
      )

      const allAreasWithDistance = deliveryAreas
        .map((area) => {
          if (!area.coordinates?.length || !area.restaurantLocationId)
            return null
          const coords = area.coordinates as unknown as Coordinates[]
          const distanceToBorder = GeofencingService.distanceToPolygonBorder(
            point,
            coords
          )
          return { area, distanceToBorder }
        })
        .filter(
          (
            item
          ): item is { area: Doc<"deliveryAreas">; distanceToBorder: number } =>
            item !== null
        )
        .filter((item) => item.distanceToBorder * 111000 <= 3000) // Solo áreas dentro de 3km
        .sort((a, b) => a.distanceToBorder - b.distanceToBorder)
        .slice(0, 10) // Top 10 más cercanas (aumentado de 3)

      console.log(
        `[VALIDACIÓN] 📍 Áreas más cercanas encontradas: ${allAreasWithDistance.length}`
      )
      allAreasWithDistance.forEach(({ area, distanceToBorder }) => {
        console.log(
          `  - ${area.name}: ${(distanceToBorder * 111000).toFixed(0)}m de distancia`
        )
      })

      candidateAreas.push(...allAreasWithDistance.map((item) => item.area))
    }

    if (candidateAreas.length === 0) {
      console.log(`[VALIDACIÓN] ❌ No se encontraron áreas candidatas válidas`)
      return []
    }

    for (const area of candidateAreas) {
      if (!area.restaurantLocationId) continue

      const restaurantLocation = await ctx.db.get(area.restaurantLocationId)
      if (!restaurantLocation) continue

      const coords = area.coordinates as unknown as Coordinates[]
      const isInside = matchingAreas.includes(area)
      const distanceToBorder = isInside
        ? 0
        : GeofencingService.distanceToPolygonBorder(point, coords)
      const scheduleResult = isDeliveryAreaOpen(area, restaurantLocation)
      const calculatedArea = GeofencingService.polygonArea(coords)

      // Sistema de scoring mejorado
      let score = 0

      // Factor 1: Estar dentro vale mucho (1000 puntos)
      if (isInside) {
        score += 1000
      }

      // Factor 2: Estar abierto vale mucho (500 puntos)
      if (scheduleResult.isOpen) {
        score += 500
      }

      // Factor 3: Coincidencia de nombre de área con lugares conocidos (800 puntos)
      // Esto ayuda cuando la geocodificación es imprecisa
      // Buscar en nombre Y descripción
      const areaNameLower = area.name.toLowerCase()
      const areaDescriptionLower = (area.description || "").toLowerCase()
      const areaFullText = `${areaNameLower} ${areaDescriptionLower}`
      let nameMatchBonus = 0

      // Dar bonus a áreas con nombres de lugares conocidos/específicos
      if (
        areaFullText.includes("zona franca") ||
        areaFullText.includes("tierra santa")
      ) {
        nameMatchBonus = 800 // Gran bonus para ZONA FRANCA y TIERRA SANTA
        console.log(
          `[VALIDACIÓN] 🎯 Área "${area.name}" contiene lugar conocido (ZONA FRANCA/TIERRA SANTA): +${nameMatchBonus} puntos`
        )
      } else if (
        areaFullText.includes("alkosto") ||
        areaFullText.includes("pricesmart") ||
        areaFullText.includes("makro")
      ) {
        nameMatchBonus = 800 // Gran bonus para centros comerciales conocidos
        console.log(
          `[VALIDACIÓN] 🎯 Área "${area.name}" contiene centro comercial conocido: +${nameMatchBonus} puntos`
        )
      }
      score += nameMatchBonus

      // Factor 4: Distancia al borde (más cerca = mejor) - hasta 300 puntos
      // Usar escala logarítmica para penalizar menos las distancias grandes
      const distanceInMeters = distanceToBorder * 111000
      if (distanceInMeters <= 5000) {
        // Considerar hasta 5km
        const proximityScore = Math.max(0, 300 * (1 - distanceInMeters / 5000))
        score += proximityScore
      }

      // Factor 5: Prioridad del restaurante (menor número = mayor prioridad)
      // Invertir para que prioridad 1 tenga más puntos que prioridad 10
      score += Math.max(0, 100 - restaurantLocation.priority * 10)

      // Factor 6: Área del polígono (más pequeña = más específica = mejor)
      // Normalizar área para que no domine el score
      const areaNormalized = Math.min(calculatedArea * 100, 50)
      score += Math.max(0, 50 - areaNormalized)

      // Factor 7: Validar que tenga tarifa de domicilio configurada
      if (area.deliveryFee !== undefined && area.deliveryFee > 0) {
        score += 50 // Bonus por tener tarifa configurada
      } else if (area.deliveryFee === 0 || area.deliveryFee === undefined) {
        // Si el área está muy cerca (<50m), reducir la penalización
        // porque probablemente es el área correcta con tarifa mal configurada
        if (distanceInMeters < 50) {
          score -= 20 // Penalización leve para áreas muy cercanas
        } else {
          score -= 100 // Penalización fuerte para áreas lejanas sin tarifa
        }
      }

      console.log(
        `[VALIDACIÓN] 📊 Área "${area.name}": score=${score.toFixed(0)} ` +
        `(dentro=${isInside}, abierto=${scheduleResult.isOpen}, ` +
        `distancia=${distanceInMeters.toFixed(0)}m, prioridad=${restaurantLocation.priority}, ` +
        `área=${calculatedArea.toFixed(6)}, tarifa=$${area.deliveryFee || 0})`
      )

      validAreas.push({
        area,
        distanceToBorder,
        isInside,
        restaurantLocation,
        scheduleResult,
        calculatedArea,
        score,
      })
    }

    if (validAreas.length === 0) {
      console.log(`[VALIDACIÓN] ❌ No se pudieron enriquecer las áreas válidas`)
      return []
    }

    // Ordenar por score (mayor score = mejor)
    validAreas.sort((a, b) => b.score - a.score)

    const bestArea = validAreas[0]
    if (!bestArea) {
      console.log(
        `[VALIDACIÓN] ❌ No se encontró un área válida después del ordenamiento`
      )
      return []
    }
    console.log(
      `[VALIDACIÓN] 🏆 Mejor área seleccionada: "${bestArea.area.name}" ` +
      `(score=${bestArea.score.toFixed(0)}, ${bestArea.isInside ? "dentro" : `${(bestArea.distanceToBorder * 111000).toFixed(0)}m de distancia`}, ` +
      `tarifa=$${bestArea.area.deliveryFee || 0}, restaurante="${bestArea.restaurantLocation.name}")`
    )

    // Validación de tarifa de domicilio
    if (
      bestArea.area.deliveryFee === undefined ||
      bestArea.area.deliveryFee === null
    ) {
      console.warn(
        `[VALIDACIÓN] ⚠️ ADVERTENCIA: Área "${bestArea.area.name}" no tiene tarifa de domicilio configurada`
      )
    } else if (bestArea.area.deliveryFee === 0) {
      console.warn(
        `[VALIDACIÓN] ⚠️ ADVERTENCIA: Área "${bestArea.area.name}" tiene tarifa de domicilio $0 - verificar configuración`
      )
    } else if (bestArea.area.deliveryFee > 50000) {
      console.warn(
        `[VALIDACIÓN] ⚠️ ADVERTENCIA: Área "${bestArea.area.name}" tiene tarifa muy alta: $${bestArea.area.deliveryFee}`
      )
    }

    return [
      {
        ...bestArea.area,
        restaurantLocation: bestArea.restaurantLocation,
        calculatedArea: bestArea.calculatedArea,
      },
    ]
  },
})

/**
 * Herramienta de diagnóstico para validar direcciones específicas
 * Útil para debugging de problemas de cobertura
 */
export const diagnoseAddress = internalQuery({
  args: {
    organizationId: v.string(),
    address: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(
      `[DIAGNOSTIC] 🔍 Iniciando diagnóstico para dirección: "${args.address}"`
    )

    const diagnostic: any = {
      address: args.address,
      organizationId: args.organizationId,
      timestamp: new Date().toISOString(),
      steps: [],
    }

    try {
      // Paso 1: Geocodificación
      diagnostic.steps.push({ step: "geocoding", status: "in_progress" })
      const geocodeResult = await geocodeAddress(args.address)

      diagnostic.geocoding = {
        success: geocodeResult.success,
        coordinates: geocodeResult.coordinates,
        formattedAddress: geocodeResult.formattedAddress,
        alternativesCount: geocodeResult.alternatives?.length || 0,
        error: geocodeResult.error,
      }

      if (!geocodeResult.success || !geocodeResult.coordinates) {
        diagnostic.steps.push({
          step: "geocoding",
          status: "failed",
          error: geocodeResult.error,
        })
        return diagnostic
      }

      diagnostic.steps.push({ step: "geocoding", status: "completed" })

      // Paso 2: Búsqueda de áreas activas
      diagnostic.steps.push({ step: "area_search", status: "in_progress" })
      const deliveryAreas = await ctx.db
        .query("deliveryAreas")
        .withIndex("by_organization_and_active", (q) =>
          q.eq("organizationId", args.organizationId).eq("isActive", true)
        )
        .collect()

      diagnostic.activeAreasCount = deliveryAreas.length
      diagnostic.activeAreas = deliveryAreas.map((area) => ({
        id: area._id,
        name: area.name,
        coordinatesCount: area.coordinates?.length || 0,
      }))

      diagnostic.steps.push({ step: "area_search", status: "completed" })

      // Paso 3: Validación de coordenadas
      diagnostic.steps.push({ step: "validation", status: "in_progress" })
      const point: Coordinates = {
        lat: roundCoord(geocodeResult.coordinates.lat),
        lng: roundCoord(geocodeResult.coordinates.lng),
      }

      diagnostic.validationPoint = point

      const validationResults: any[] = []

      for (const area of deliveryAreas) {
        if (!area.coordinates?.length) continue
        const coords = area.coordinates as unknown as Coordinates[]

        const isInside = GeofencingService.isPointInPolygon(
          point,
          coords,
          area.name,
          true
        )
        let distanceToBorder: number | null = null

        if (!isInside) {
          distanceToBorder = GeofencingService.distanceToPolygonBorder(
            point,
            coords
          )
        }

        validationResults.push({
          areaId: area._id,
          areaName: area.name,
          isInside,
          distanceToBorder: distanceToBorder ? distanceToBorder * 111000 : null,
          coordinatesCount: coords.length,
        })
      }

      diagnostic.validationResults = validationResults
      diagnostic.insideAreasCount = validationResults.filter(
        (r) => r.isInside
      ).length
      diagnostic.nearBorderAreasCount = validationResults.filter(
        (r) => !r.isInside && r.distanceToBorder && r.distanceToBorder <= 100
      ).length

      const validAreas = validationResults.filter(
        (r) => r.isInside || (r.distanceToBorder && r.distanceToBorder <= 100)
      )

      diagnostic.finalResult = {
        isValid: validAreas.length > 0,
        validAreasCount: validAreas.length,
        validAreas: validAreas.map((r: any) => ({
          id: r.areaId,
          name: r.areaName,
          reason: r.isInside ? "inside" : "near_border",
        })),
      }

      diagnostic.steps.push({ step: "validation", status: "completed" })
    } catch (error) {
      console.error("[DIAGNOSTIC] ❌ Error en diagnóstico:", error)
      diagnostic.error = error instanceof Error ? error.message : String(error)
      diagnostic.steps.push({
        step: "error",
        status: "failed",
        error: diagnostic.error,
      })
    }

    console.log(
      `[DIAGNOSTIC] 📊 Diagnóstico completado para: "${args.address}"`
    )
    return diagnostic
  },
})

/**
 * Validación manual para direcciones edge case
 * Permite validar direcciones que fallan en el proceso automático
 */
export const validateAddressManually = internalQuery({
  args: {
    organizationId: v.string(),
    address: v.string(),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
    forceValidation: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    console.log(
      `[MANUAL_VALIDATION] 🔍 Validación manual para: "${args.address}"`
    )

    // 1) Validación forzada explícita
    if (args.forceValidation && args.restaurantLocationId) {
      console.log(
        `[MANUAL_VALIDATION] 🔄 Validación forzada activada para restaurante específico`
      )

      const restaurantLocation = await ctx.db.get(args.restaurantLocationId)
      if (restaurantLocation) {
        console.log(
          `[MANUAL_VALIDATION] ✅ Validación forzada exitosa para: ${restaurantLocation.name}`
        )

        return {
          isValid: true,
          manualOverride: true,
          reason: "forced_validation",
          deliveryArea: {
            id: `forced_${args.restaurantLocationId}_${Date.now()}`,
            name: `Validación Manual - ${restaurantLocation.name}`,
            restaurantLocationId: args.restaurantLocationId,
            restaurantLocationName: restaurantLocation.name,
            restaurantLocationCode: restaurantLocation.code,
            deliveryFee: 0,
            minimumOrder: null,
            estimatedDeliveryTime: "30-45 minutos",
            priority: restaurantLocation.priority || 1,
          },
        }
      }
    }

    // 2) Validación automática para puntos cerca del borde
    console.log(`[MANUAL_VALIDATION] 🔍 Verificando zonas cercanas al borde...`)

    const geocodeResult = await geocodeAddress(args.address)

    if (geocodeResult.success && geocodeResult.coordinates) {
      const deliveryAreas = await ctx.db
        .query("deliveryAreas")
        .withIndex("by_organization_and_active", (q) =>
          q.eq("organizationId", args.organizationId).eq("isActive", true)
        )
        .collect()

      const point: Coordinates = {
        lat: roundCoord(geocodeResult.coordinates.lat),
        lng: roundCoord(geocodeResult.coordinates.lng),
      }

      const nearBorderAreas: any[] = []

      for (const area of deliveryAreas) {
        if (!area.coordinates?.length) continue
        const coords = area.coordinates as unknown as Coordinates[]

        const distanceToBorder = GeofencingService.distanceToPolygonBorder(
          point,
          coords
        )
        if (distanceToBorder <= 0.002) {
          const restaurantLocation = await ctx.db.get(area.restaurantLocationId)
          nearBorderAreas.push({
            area,
            restaurantLocation,
            distance: distanceToBorder * 111000, // a metros
          })
        }
      }

      if (nearBorderAreas.length > 0) {
        nearBorderAreas.sort((a, b) => a.distance - b.distance)
        const closest = nearBorderAreas[0]

        console.log(
          `[MANUAL_VALIDATION] 🎯 Dirección encontrada cerca del borde (${closest.distance.toFixed(
            0
          )}m) de: ${closest.area.name}`
        )

        return {
          isValid: true,
          manualOverride: true,
          reason: "near_border",
          deliveryArea: {
            id: closest.area._id,
            name: `${closest.area.name} (cerca del borde)`,
            restaurantLocationId: closest.area.restaurantLocationId,
            restaurantLocationName: closest.restaurantLocation?.name,
            restaurantLocationCode: closest.restaurantLocation?.code,
            deliveryFee: closest.area.deliveryFee,
            minimumOrder: closest.area.minimumOrder,
            estimatedDeliveryTime: closest.area.estimatedDeliveryTime,
            priority: closest.restaurantLocation?.priority,
          },
        }
      }
    }

    console.log(
      `[MANUAL_VALIDATION] ❌ No se encontró validación manual para: "${args.address}"`
    )
    return {
      isValid: false,
      manualOverride: false,
      reason: "no_manual_validation_available",
    }
  },
})
