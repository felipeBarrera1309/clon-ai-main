import { describe, expect, it } from "vitest"
import type { Id } from "../_generated/dataModel"
import {
  getSelectedZonesOrThrow,
  type Step3ZoneInput,
  validateAuthorizedLocationsOrThrow,
  validateSelectedZoneOrThrow,
} from "./onboardingStep3Validation"

function asLocationId(id: string): Id<"restaurantLocations"> {
  return id as Id<"restaurantLocations">
}

const baseZone = (overrides?: Partial<Step3ZoneInput>): Step3ZoneInput => ({
  zoneKey: "zone-1",
  name: "Zona 1",
  selected: true,
  coordinates: [
    { lat: 7.12, lng: -73.12 },
    { lat: 7.13, lng: -73.1 },
    { lat: 7.11, lng: -73.09 },
  ],
  restaurantLocationId: asLocationId("location-1"),
  ...overrides,
})

describe("onboardingStep3Validation", () => {
  it("rejects when no zones are selected", () => {
    expect(() =>
      getSelectedZonesOrThrow([
        baseZone({ selected: false }),
        baseZone({ zoneKey: "zone-2", selected: false }),
      ])
    ).toThrow("Debes seleccionar al menos una zona de entrega")
  })

  it("rejects selected zone with polygon under 3 points", () => {
    expect(() =>
      validateSelectedZoneOrThrow(
        baseZone({
          coordinates: [
            { lat: 7.12, lng: -73.12 },
            { lat: 7.13, lng: -73.1 },
          ],
        }),
        {}
      )
    ).toThrow("Cada zona debe tener al menos 3 puntos en el polígono")
  })

  it("rejects unauthorized location assignment", async () => {
    await expect(
      validateAuthorizedLocationsOrThrow({
        selectedZones: [baseZone()],
        defaults: {},
        isLocationAuthorized: async () => false,
      })
    ).rejects.toThrow(
      "No estás autorizado para usar una o más sucursales seleccionadas"
    )
  })
})
