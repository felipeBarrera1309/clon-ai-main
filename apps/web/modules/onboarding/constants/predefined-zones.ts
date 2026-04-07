/**
 * Predefined delivery zone templates for major Colombian cities.
 * Each zone includes realistic polygon coordinates, suggested delivery fee, and estimated time.
 */

export interface PredefinedZone {
  id: string
  name: string
  polygon: Array<{ lat: number; lng: number }>
  suggestedPrice: number
  estimatedTime: string
}

export interface CityZones {
  cityName: string
  zones: PredefinedZone[]
}

/**
 * Predefined zones organized by city.
 * Coordinates are realistic approximations of major delivery areas.
 */
export const PREDEFINED_ZONES: Record<string, CityZones> = {
  bogota: {
    cityName: "Bogotá",
    zones: [
      {
        id: "bogota-norte",
        name: "Norte (Usaquén, Chapinero Alto)",
        polygon: [
          { lat: 4.711, lng: -74.0721 },
          { lat: 4.711, lng: -74.0321 },
          { lat: 4.671, lng: -74.0321 },
          { lat: 4.671, lng: -74.0721 },
        ],
        suggestedPrice: 5000,
        estimatedTime: "30-45 min",
      },
      {
        id: "bogota-centro",
        name: "Centro (La Candelaria, Teusaquillo)",
        polygon: [
          { lat: 4.635, lng: -74.09 },
          { lat: 4.635, lng: -74.055 },
          { lat: 4.595, lng: -74.055 },
          { lat: 4.595, lng: -74.09 },
        ],
        suggestedPrice: 4000,
        estimatedTime: "20-30 min",
      },
      {
        id: "bogota-sur",
        name: "Sur (Kennedy, Bosa)",
        polygon: [
          { lat: 4.63, lng: -74.15 },
          { lat: 4.63, lng: -74.1 },
          { lat: 4.58, lng: -74.1 },
          { lat: 4.58, lng: -74.15 },
        ],
        suggestedPrice: 6000,
        estimatedTime: "40-60 min",
      },
    ],
  },
  medellin: {
    cityName: "Medellín",
    zones: [
      {
        id: "medellin-poblado",
        name: "El Poblado",
        polygon: [
          { lat: 6.215, lng: -75.58 },
          { lat: 6.215, lng: -75.55 },
          { lat: 6.185, lng: -75.55 },
          { lat: 6.185, lng: -75.58 },
        ],
        suggestedPrice: 5000,
        estimatedTime: "25-35 min",
      },
      {
        id: "medellin-laureles",
        name: "Laureles - Estadio",
        polygon: [
          { lat: 6.255, lng: -75.6 },
          { lat: 6.255, lng: -75.57 },
          { lat: 6.225, lng: -75.57 },
          { lat: 6.225, lng: -75.6 },
        ],
        suggestedPrice: 4500,
        estimatedTime: "20-30 min",
      },
      {
        id: "medellin-centro",
        name: "Centro - La Candelaria",
        polygon: [
          { lat: 6.255, lng: -75.575 },
          { lat: 6.255, lng: -75.555 },
          { lat: 6.235, lng: -75.555 },
          { lat: 6.235, lng: -75.575 },
        ],
        suggestedPrice: 4000,
        estimatedTime: "15-25 min",
      },
    ],
  },
  cali: {
    cityName: "Cali",
    zones: [
      {
        id: "cali-norte",
        name: "Norte (Granada, Versalles)",
        polygon: [
          { lat: 3.47, lng: -76.54 },
          { lat: 3.47, lng: -76.51 },
          { lat: 3.44, lng: -76.51 },
          { lat: 3.44, lng: -76.54 },
        ],
        suggestedPrice: 5000,
        estimatedTime: "25-35 min",
      },
      {
        id: "cali-sur",
        name: "Sur (Ciudad Jardín, Valle del Lili)",
        polygon: [
          { lat: 3.39, lng: -76.55 },
          { lat: 3.39, lng: -76.52 },
          { lat: 3.36, lng: -76.52 },
          { lat: 3.36, lng: -76.55 },
        ],
        suggestedPrice: 5500,
        estimatedTime: "30-40 min",
      },
      {
        id: "cali-oeste",
        name: "Oeste (San Antonio, Centenario)",
        polygon: [
          { lat: 3.455, lng: -76.56 },
          { lat: 3.455, lng: -76.535 },
          { lat: 3.43, lng: -76.535 },
          { lat: 3.43, lng: -76.56 },
        ],
        suggestedPrice: 4500,
        estimatedTime: "20-30 min",
      },
    ],
  },
}

/**
 * Cities that have predefined zones available.
 * Used to filter the city selector to only show cities with templates.
 */
export const CITIES_WITH_PREDEFINED_ZONES = [
  "bogota",
  "medellin",
  "cali",
] as const

export type CityWithPredefinedZones =
  (typeof CITIES_WITH_PREDEFINED_ZONES)[number]

/**
 * Check if a city has predefined zones available.
 */
export function hasPredefinedZones(
  cityValue: string
): cityValue is CityWithPredefinedZones {
  return CITIES_WITH_PREDEFINED_ZONES.includes(
    cityValue as CityWithPredefinedZones
  )
}

/**
 * Get predefined zones for a city.
 * Returns undefined if the city doesn't have predefined zones.
 */
export function getPredefinedZonesForCity(
  cityValue: string
): PredefinedZone[] | undefined {
  if (!hasPredefinedZones(cityValue)) {
    return undefined
  }
  return PREDEFINED_ZONES[cityValue]?.zones
}
