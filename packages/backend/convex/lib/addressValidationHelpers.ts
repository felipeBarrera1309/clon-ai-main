import { internal } from "../_generated/api"
import type { Doc } from "../_generated/dataModel"
import type { ActionCtx } from "../_generated/server"
import {
  autocompleteWithGooglePlaces,
  geocodePlaceId,
  smartGeocode,
} from "./geocoding"
import {
  isRestaurantOpen,
  type ScheduleValidationResult,
} from "./scheduleUtils"

export interface DeliveryAreaInfo {
  id: string
  name: string
  restaurantLocationId: string
  restaurantLocationName?: string
  restaurantLocationCode?: string
  deliveryFee?: number
  minimumOrder?: number
  estimatedDeliveryTime?: string
  priority?: number // Inherited from restaurant location
}

export interface ScheduleInfo {
  isOpen: boolean
  message: string
  nextOpenTime?: number
}

export interface AddressValidationResult {
  isValid: boolean
  coordinates?: {
    lat: number
    lng: number
  }
  formattedAddress?: string
  deliveryArea?: DeliveryAreaInfo
  scheduleInfo?: ScheduleInfo
  error?: string
  allAvailableAreas?: DeliveryAreaInfo[]
}

/**
 * Check if a delivery area is currently open
 * Both the restaurant location AND the delivery area (if it has openingHours) must be open
 */
export function isDeliveryAreaOpen(
  deliveryArea: Doc<"deliveryAreas">,
  restaurantLocation: Doc<"restaurantLocations">,
  checkTime?: Date
): ScheduleValidationResult {
  // First check if the restaurant location is open
  const restaurantResult = isRestaurantOpen(restaurantLocation, checkTime)

  // If restaurant is closed, delivery area is also closed
  if (!restaurantResult.isOpen) {
    return {
      isOpen: false,
      message: `Restaurante cerrado - ${restaurantResult.message}`,
      nextOpenTime: restaurantResult.nextOpenTime,
    }
  }

  // If delivery area has its own opening hours, check those too
  if (deliveryArea.openingHours && deliveryArea.openingHours.length > 0) {
    // Create a temporary restaurant location object with delivery area's opening hours
    const areaAsLocation: Doc<"restaurantLocations"> = {
      ...restaurantLocation,
      openingHours: deliveryArea.openingHours,
    }
    const areaResult = isRestaurantOpen(areaAsLocation, checkTime)

    // If delivery area is closed, return that result
    if (!areaResult.isOpen) {
      return {
        isOpen: false,
        message: `Zona de entrega cerrada - ${areaResult.message}`,
        nextOpenTime: areaResult.nextOpenTime,
      }
    }

    // Both are open - return the more restrictive closing time
    return {
      isOpen: true,
      message: restaurantResult.message, // Use restaurant message as it's the main reference
      nextOpenTime: restaurantResult.nextOpenTime,
    }
  }

  // Delivery area has no specific hours, so just return restaurant result
  return restaurantResult
}

/**
 * Validates if coordinates are within any active delivery area for an organization
 * This is the core validation function that works with coordinates directly
 */
export const validateDeliveryCoordinates = async (
  ctx: ActionCtx,
  args: {
    organizationId: string
    coordinates: { lat: number; lng: number }
    formattedAddress?: string
  }
): Promise<AddressValidationResult> => {
  try {
    const { coordinates, formattedAddress, organizationId } = args

    console.log(
      `[VALIDATE_DELIVERY_COORDS] 🔍 Validando coordenadas: (${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)})`
    )

    // Try to find delivery areas for these coordinates
    const deliveryAreas = await ctx.runQuery(
      internal.system.addressValidation.getActiveValidLocationsByCoordinates,
      {
        organizationId,
        coordinates,
      }
    )

    if (deliveryAreas.length === 0) {
      return {
        isValid: false,
        coordinates,
        formattedAddress,
        error: "Esta ubicación está fuera de nuestras zonas de entrega",
      }
    }

    console.log(
      `[VALIDATE_DELIVERY_COORDS] ✅ Encontradas ${deliveryAreas.length} áreas de cobertura`
    )

    // Sort areas by restaurant location priority (lower number = higher priority)
    const sortedAreas = deliveryAreas.sort((a, b) => {
      const priorityA = a.restaurantLocation.priority
      const priorityB = b.restaurantLocation.priority
      return priorityA - priorityB
    })

    // Find the first open restaurant, or fallback to highest priority closed one
    let selectedArea: (typeof sortedAreas)[0] | null = null
    let scheduleInfo: ScheduleInfo = {
      isOpen: false,
      message: "Restaurante cerrado",
    }

    for (const area of sortedAreas) {
      const restaurantLocation = area.restaurantLocation

      if (!restaurantLocation) {
        continue
      }

      const scheduleResult = isDeliveryAreaOpen(area, restaurantLocation)
      const currentScheduleInfo: ScheduleInfo = {
        isOpen: scheduleResult.isOpen,
        message: scheduleResult.message,
        nextOpenTime: scheduleResult.nextOpenTime?.getTime(),
      }

      if (scheduleResult.isOpen) {
        selectedArea = area
        scheduleInfo = currentScheduleInfo
        break
      }

      if (!selectedArea) {
        selectedArea = area
        scheduleInfo = currentScheduleInfo
      }
    }

    if (!selectedArea) {
      return {
        isValid: false,
        coordinates,
        formattedAddress,
        error: "No se encontraron restaurantes disponibles en esta zona",
      }
    }

    return {
      isValid: true,
      coordinates,
      formattedAddress,
      deliveryArea: {
        id: selectedArea._id,
        name: selectedArea.name,
        restaurantLocationId: selectedArea.restaurantLocationId,
        restaurantLocationName: selectedArea.restaurantLocation?.name,
        restaurantLocationCode: selectedArea.restaurantLocation?.code,
        deliveryFee: selectedArea.deliveryFee,
        minimumOrder: selectedArea.minimumOrder,
        estimatedDeliveryTime: selectedArea.estimatedDeliveryTime,
        priority: selectedArea.restaurantLocation?.priority,
      },
      scheduleInfo,
    }
  } catch (error) {
    console.error("Error al validar coordenadas:", error)
    return {
      isValid: false,
      error:
        "Hubo un problema validando la ubicación. Por favor intenta de nuevo o contacta a nuestro soporte.",
    }
  }
}

/**
 * Validates if an address is within any active delivery area for an organization
 * First geocodes the address, then checks if coordinates are within delivery polygons
 */
export const validateAddressCoordinates = async (
  ctx: ActionCtx,
  args: {
    organizationId: string
    address: string
  }
): Promise<AddressValidationResult> => {
  try {
    // 🔍 STEP 1: Smart Geocoding (core first)
    const geocodeResult = await smartGeocode(args.address)

    if (!geocodeResult.success || !geocodeResult.coordinates) {
      return {
        isValid: false,
        error:
          geocodeResult.error ||
          "No se pudieron encontrar las coordenadas de la dirección",
      }
    }

    console.log(
      `[VALIDATE_COORDINATES] 🔍 Validando coordenadas principales: (${geocodeResult.coordinates.lat.toFixed(6)}, ${geocodeResult.coordinates.lng.toFixed(6)})`
    )
    console.log(
      `[VALIDATE_COORDINATES] 📍 Dirección formateada: ${geocodeResult.formattedAddress}`
    )
    if (geocodeResult.alternatives?.length) {
      console.log(
        `[VALIDATE_COORDINATES] 📋 Alternativas disponibles: ${geocodeResult.alternatives.length}`
      )
    }

    // Step 2: Try main coordinates first
    let result = await validateDeliveryCoordinates(ctx, {
      organizationId: args.organizationId,
      coordinates: geocodeResult.coordinates,
      formattedAddress: geocodeResult.formattedAddress,
    })

    // 🔍 Smart Fallback: SOLO si las coordenadas principales NO encontraron cobertura,
    // probar alternativas (esto evita que se sobrescriba una coincidencia válida)
    if (
      !result.isValid &&
      geocodeResult.alternatives &&
      geocodeResult.alternatives.length > 0
    ) {
      console.log(
        "[VALIDATE_COORDINATES] 🔎 Coordenadas principales sin cobertura, aplicando Smart Fallback..."
      )

      for (const alt of geocodeResult.alternatives) {
        console.log(
          `[VALIDATE_COORDINATES] 🔄 Probando alternativa: ${alt.formattedAddress}`
        )

        const altResult = await validateDeliveryCoordinates(ctx, {
          organizationId: args.organizationId,
          coordinates: alt.coordinates,
          formattedAddress: alt.formattedAddress,
        })

        if (altResult.isValid) {
          console.log(
            `[VALIDATE_COORDINATES] 🎯 Alternativa válida encontrada: ${alt.formattedAddress}`
          )
          result = altResult
          // Update the geocode result to reflect the valid alternative
          geocodeResult.coordinates = alt.coordinates
          geocodeResult.formattedAddress = alt.formattedAddress
          break
        }
      }
    } else if (result.isValid) {
      console.log(
        `[VALIDATE_COORDINATES] ✅ Coordenadas principales encontraron cobertura, omitiendo Smart Fallback`
      )
    }

    // Si no se encontraron áreas con las coordenadas normales ni alternativas, intentar validación manual
    if (!result.isValid) {
      console.log(
        `[VALIDATE_COORDINATES] ⚠️ Intentando validación manual como último recurso...`
      )

      try {
        const manualResult = await ctx.runQuery(
          internal.system.addressValidation.validateAddressManually,
          {
            organizationId: args.organizationId,
            address: args.address,
            forceValidation: false, // Solo usar validación manual automática (cerca del borde)
          }
        )

        if (
          manualResult.isValid &&
          manualResult.manualOverride &&
          manualResult.deliveryArea
        ) {
          console.log(
            `[VALIDATE_COORDINATES] ✅ Validación manual exitosa: ${manualResult.reason}`
          )

          // Obtener información completa del restaurante
          const restaurantLocation = await ctx.runQuery(
            internal.system.addressValidation.getRestaurantLocationById,
            {
              restaurantLocationId: manualResult.deliveryArea
                .restaurantLocationId as any,
            }
          )

          return {
            isValid: true,
            coordinates: geocodeResult.coordinates,
            formattedAddress: geocodeResult.formattedAddress,
            deliveryArea: {
              id: manualResult.deliveryArea.id,
              name: manualResult.deliveryArea.name,
              restaurantLocationId:
                manualResult.deliveryArea.restaurantLocationId,
              restaurantLocationName:
                manualResult.deliveryArea.restaurantLocationName,
              restaurantLocationCode:
                manualResult.deliveryArea.restaurantLocationCode,
              deliveryFee: manualResult.deliveryArea.deliveryFee,
              minimumOrder: manualResult.deliveryArea.minimumOrder,
              estimatedDeliveryTime:
                manualResult.deliveryArea.estimatedDeliveryTime,
              priority: manualResult.deliveryArea.priority,
            },
            scheduleInfo: restaurantLocation
              ? {
                  isOpen: true, // Asumir abierto para validación manual
                  message:
                    "Validación manual - verificar horario del restaurante",
                }
              : undefined,
          }
        }
      } catch (error) {
        console.warn(
          `[VALIDATE_COORDINATES] ❌ Error en validación manual:`,
          error
        )
      }

      console.log(
        `[VALIDATE_COORDINATES] ❌ Ninguna validación (automática ni manual) encontró cobertura para la dirección`
      )
    }

    return result
  } catch (error) {
    console.error("Error al validar dirección:", error)
    return {
      isValid: false,
      error:
        "Hubo un problema validando la dirección. Por favor intenta de nuevo o contacta a nuestro soporte.",
    }
  }
}

export interface AddressCandidate {
  address: string
  coordinates: { lat: number; lng: number }
  deliveryArea: DeliveryAreaInfo
  scheduleInfo: ScheduleInfo
}

/**
 * Searches for valid address candidates with coverage
 * Returns a list of addresses that have active delivery coverage
 */
export const searchAddressCandidates = async (
  ctx: ActionCtx,
  args: {
    organizationId: string
    query: string
  }
): Promise<AddressCandidate[]> => {
  try {
    console.log(
      `[SEARCH_CANDIDATES] 🔎 Buscando candidatos para: "${args.query}"`
    )

    // 0. Obtener una ubicación de referencia para el "Biasing" (Bias Location)
    // Intentamos usar la ubicación del primer restaurante activo de la organización
    // Esto ayuda a que "Cra 3" priorice Bucaramanga si el restaurante está ahí.
    let biasCoordinates: { lat: number; lng: number } | undefined
    const activeLocations = await ctx.runQuery(
      internal.system.addressValidation.getActiveRestaurantLocations,
      {
        organizationId: args.organizationId,
      }
    )

    if (activeLocations && activeLocations.length > 0 && activeLocations[0]) {
      // Usar la primera ubicación activa como centro de bias
      biasCoordinates = {
        lat: activeLocations[0].coordinates.latitude,
        lng: activeLocations[0].coordinates.longitude,
      }
    }

    // 1. Obtener predicciones de autocomplete (lax search)
    // Esto devuelve cosas como "Cra 3, Bucaramanga", "Panamericana de la costa..."
    let predictions = await autocompleteWithGooglePlaces(
      args.query,
      biasCoordinates
    )

    // Si no hay predicciones (o input muy corto/ raro), intentar smartGeocode directo como fallback
    if (predictions.length === 0) {
      console.log(
        `[SEARCH_CANDIDATES] ⚠️ No hay predicciones de Autocomplete, usando fallback directo`
      )
      const geocodeResult = await smartGeocode(args.query)
      if (
        geocodeResult.success &&
        geocodeResult.coordinates &&
        geocodeResult.formattedAddress
      ) {
        predictions = [
          {
            description: geocodeResult.formattedAddress,
            placeId: "", // No placeID for direct geocode
          },
        ]
        // Agregar alternativas si existen
        if (geocodeResult.alternatives) {
          geocodeResult.alternatives.forEach((alt) => {
            predictions.push({
              description: alt.formattedAddress,
              placeId: "",
            })
          })
        }
      } else {
        return []
      }
    }

    console.log(
      `[SEARCH_CANDIDATES] 📋 ${predictions.length} predicciones encontradas. Geocodificando...`
    )

    // 2. Geocodificar cada predicción para obtener coordenadas
    // Usamos Promise.all para hacerlo en paralelo
    const geocodedCandidates = await Promise.all(
      predictions.map(async (p) => {
        let coords: { lat: number; lng: number } | undefined

        if (p.placeId) {
          const geo = await geocodePlaceId(p.placeId)
          if (geo.success) coords = geo.coordinates
        } else {
          // Fallback para predicciones sin placeId (ej: origen manual)
          const geo = await smartGeocode(p.description)
          if (geo.success) coords = geo.coordinates
        }

        if (!coords) return null

        return {
          address: p.description,
          coordinates: coords,
        }
      })
    )

    // Filtrar nulos
    const candidates = geocodedCandidates.filter(
      (c): c is NonNullable<typeof c> => c !== null
    )

    const validCandidates: AddressCandidate[] = []
    const servedAreaIds = new Set<string>() // Evitar duplicados de areas

    // 3. Evaluar cobertura para cada candidato geocodificado
    for (const candidate of candidates) {
      const deliveryAreas = await ctx.runQuery(
        internal.system.addressValidation.getActiveValidLocationsByCoordinates,
        {
          organizationId: args.organizationId,
          coordinates: candidate.coordinates,
        }
      )

      if (deliveryAreas.length > 0) {
        // Sort by priority
        const sortedAreas = deliveryAreas.sort((a, b) => {
          return a.restaurantLocation.priority - b.restaurantLocation.priority
        })

        // Find best area (preferably open)
        let selectedArea: (typeof sortedAreas)[0] | null = null
        let scheduleInfo: ScheduleInfo = {
          isOpen: false,
          message: "Restaurante cerrado",
        }

        for (const area of sortedAreas) {
          const restaurantLocation = area.restaurantLocation

          if (!restaurantLocation) continue

          const scheduleResult = isDeliveryAreaOpen(area, restaurantLocation)
          const currentScheduleInfo = {
            isOpen: scheduleResult.isOpen,
            message: scheduleResult.message,
            nextOpenTime: scheduleResult.nextOpenTime?.getTime(),
          }

          if (scheduleResult.isOpen) {
            selectedArea = area
            scheduleInfo = currentScheduleInfo
            break
          } else if (!selectedArea) {
            selectedArea = area
            scheduleInfo = currentScheduleInfo
          }
        }

        if (selectedArea) {
          // Unique check: don't show same area multiple times if addresses are super close/duplicates
          // Actually, we want to show different ADDRESSES even if they map to same area.
          // But maybe dedup if address string is identical?
          // predictions should be unique descriptions.

          validCandidates.push({
            address: candidate.address,
            coordinates: candidate.coordinates,
            deliveryArea: {
              id: selectedArea._id,
              name: selectedArea.name,
              restaurantLocationId: selectedArea.restaurantLocationId,
              restaurantLocationName: selectedArea.restaurantLocation?.name,
              restaurantLocationCode: selectedArea.restaurantLocation?.code,
              deliveryFee: selectedArea.deliveryFee,
              minimumOrder: selectedArea.minimumOrder,
              estimatedDeliveryTime: selectedArea.estimatedDeliveryTime,
              priority: selectedArea.restaurantLocation?.priority,
            },
            scheduleInfo,
          })
        }
      }
    }

    return validCandidates
  } catch (error) {
    console.error("Error searching addresses:", error)
    return []
  }
}
