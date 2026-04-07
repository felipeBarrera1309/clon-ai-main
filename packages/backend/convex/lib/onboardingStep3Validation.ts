import { ConvexError } from "convex/values"
import type { Id } from "../_generated/dataModel"

export type Step3Defaults = {
  restaurantLocationId?: Id<"restaurantLocations">
}

export type Step3ZoneInput = {
  zoneKey: string
  name: string
  selected: boolean
  coordinates: Array<{ lat: number; lng: number }>
  restaurantLocationId?: Id<"restaurantLocations">
  deliveryFee?: number
  minimumOrder?: number
  estimatedDeliveryTime?: string
  isActive?: boolean
}

export function getSelectedZonesOrThrow(
  zones: Step3ZoneInput[]
): Step3ZoneInput[] {
  const selectedZones = zones.filter((zone) => zone.selected)
  if (selectedZones.length === 0) {
    throw new ConvexError({
      code: "bad_request",
      message: "Debes seleccionar al menos una zona de entrega",
    })
  }
  return selectedZones
}

export function validateSelectedZoneOrThrow(
  zone: Step3ZoneInput,
  defaults: Step3Defaults
) {
  if (!zone.name.trim()) {
    throw new ConvexError({
      code: "bad_request",
      message: "Todas las zonas seleccionadas deben tener nombre",
    })
  }

  if (!zone.coordinates || zone.coordinates.length < 3) {
    throw new ConvexError({
      code: "bad_request",
      message: "Cada zona debe tener al menos 3 puntos en el polígono",
    })
  }

  const locationId = zone.restaurantLocationId ?? defaults.restaurantLocationId
  if (!locationId) {
    throw new ConvexError({
      code: "bad_request",
      message: "Cada zona seleccionada debe estar asignada a una sucursal",
    })
  }
}

export async function validateAuthorizedLocationsOrThrow(args: {
  selectedZones: Step3ZoneInput[]
  defaults: Step3Defaults
  isLocationAuthorized: (
    locationId: Id<"restaurantLocations">
  ) => Promise<boolean>
}): Promise<Set<Id<"restaurantLocations">>> {
  const { selectedZones, defaults, isLocationAuthorized } = args
  const locationIds = new Set<Id<"restaurantLocations">>()

  for (const zone of selectedZones) {
    const locationId =
      zone.restaurantLocationId ?? defaults.restaurantLocationId
    if (locationId) {
      locationIds.add(locationId)
    }
  }

  const validLocationIds = new Set<Id<"restaurantLocations">>()
  for (const locationId of locationIds) {
    const authorized = await isLocationAuthorized(locationId)
    if (!authorized) {
      throw new ConvexError({
        code: "unauthorized",
        message:
          "No estás autorizado para usar una o más sucursales seleccionadas",
      })
    }
    validLocationIds.add(locationId)
  }

  return validLocationIds
}
