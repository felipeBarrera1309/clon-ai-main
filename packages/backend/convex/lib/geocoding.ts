// lib/geocoding.ts

import { ConvexError } from "convex/values"
import { env } from "./env"

export interface Coordinates {
  lat: number
  lng: number
}

export interface GeocodeResult {
  success: boolean
  coordinates?: Coordinates
  formattedAddress?: string
  error?: string
  alternatives?: Array<{
    coordinates: Coordinates
    formattedAddress: string
  }>
}

interface GoogleMapsGeocodeResponse {
  results: Array<{
    geometry: {
      location: {
        lat: number
        lng: number
      }
    }
    formatted_address: string
  }>
  status: string
}

interface OpenStreetMapResponse {
  lat: string
  lon: string
  display_name: string
}

/**
 * Normaliza una dirección para mejorar la geocodificación
 * (remueve caracteres raros, normaliza abreviaturas comunes, etc.)
 */
export function normalizeAddress(address: string): string {
  return address
    .replace(/#/g, " ")
    .replace(/\s+/g, " ")
    .replace(/cra/gi, "carrera")
    .replace(/cll/gi, "calle")
    .replace(/diag/gi, "diagonal")
    .replace(/transv/gi, "transversal")
    .trim()
}

/**
 * Construye un viewbox dinámico alrededor de un punto
 * para búsquedas acotadas (multi-ciudad, sin hardcodear municipios)
 */
function dynamicViewbox(
  center: Coordinates,
  latDelta = 0.08,
  lngDelta = 0.08
): string {
  const { lat, lng } = center

  const left = (lng - lngDelta).toFixed(6)
  const top = (lat + latDelta).toFixed(6)
  const right = (lng + lngDelta).toFixed(6)
  const bottom = (lat - latDelta).toFixed(6)

  return `${left},${top},${right},${bottom}`
}

/**
 * Geocodes an address using Google Maps API with fallback to OpenStreetMap
 * @param address The address to geocode
 * @returns Promise<GeocodeResult>
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  if (!address || address.trim().length === 0) {
    return {
      success: false,
      error: "La dirección no puede estar vacía",
    }
  }

  const normalizedAddress = normalizeAddress(address)

  console.log(
    `[GEOCODING] 🔍 Iniciando geocodificación para: "${normalizedAddress}"`
  )

  // 1) Google Maps (principal)
  try {
    const googleResult = await geocodeWithGoogleMaps(normalizedAddress)
    if (googleResult.success) {
      console.log(
        `[GEOCODING] ✅ Google Maps - Coordenadas: (${googleResult.coordinates?.lat.toFixed(
          6
        )}, ${googleResult.coordinates?.lng.toFixed(6)})`
      )
      console.log(
        `[GEOCODING] 📍 Dirección formateada: ${googleResult.formattedAddress}`
      )
      if (googleResult.alternatives?.length) {
        console.log(
          `[GEOCODING] 📋 Alternativas Google: ${googleResult.alternatives.length}`
        )
      }
      return googleResult
    } else {
      console.log(
        `[GEOCODING] ❌ Google Maps no encontró resultados para: "${normalizedAddress}" - ${googleResult.error}`
      )
    }
  } catch (error) {
    console.warn("[GEOCODING] ❌ Google Maps falló:", error)
  }

  // 2) OpenStreetMap (búsqueda global en Colombia)
  let osmBaseResult: GeocodeResult | null = null
  try {
    osmBaseResult = await geocodeWithOpenStreetMap(normalizedAddress, {
      bounded: false,
    })

    if (osmBaseResult.success) {
      console.log(
        `[GEOCODING] ✅ OpenStreetMap - Coordenadas: (${osmBaseResult.coordinates?.lat.toFixed(
          6
        )}, ${osmBaseResult.coordinates?.lng.toFixed(6)})`
      )
      console.log(
        `[GEOCODING] 📍 Dirección formateada (OSM): ${osmBaseResult.formattedAddress}`
      )
      if (osmBaseResult.alternatives?.length) {
        console.log(
          `[GEOCODING] 📋 Alternativas OSM: ${osmBaseResult.alternatives.length}`
        )
      }
      return osmBaseResult
    } else {
      console.log(
        `[GEOCODING] ❌ OpenStreetMap no encontró resultados para: "${normalizedAddress}" - ${osmBaseResult.error}`
      )
    }
  } catch (error) {
    console.error("[GEOCODING] ❌ OpenStreetMap falló:", error)
  }

  // 3) Si OSM al menos devolvió algún candidato sin marcar success (caso raro),
  // intentar una búsqueda acotada alrededor del primer resultado
  if (osmBaseResult?.alternatives && osmBaseResult.alternatives.length > 0) {
    const firstAlternative = osmBaseResult.alternatives[0]
    if (!firstAlternative) {
      console.log(
        `[GEOCODING] ❌ Todas las geocodificaciones fallaron para: "${address}"`
      )
      return {
        success: false,
        error:
          "No se pudo geocodificar la dirección. Por favor, verifica que la dirección esté correcta.",
      }
    }
    const center = firstAlternative.coordinates
    try {
      const boundedResult = await geocodeWithOpenStreetMap(normalizedAddress, {
        bounded: true,
        center,
      })
      if (boundedResult.success) {
        console.log(
          `[GEOCODING] ✅ OpenStreetMap (bounded) - Coordenadas: (${boundedResult.coordinates?.lat.toFixed(
            6
          )}, ${boundedResult.coordinates?.lng.toFixed(6)})`
        )
        return boundedResult
      }
    } catch (error) {
      console.error("[GEOCODING] ❌ OpenStreetMap (bounded) falló:", error)
    }
  }

  console.log(
    `[GEOCODING] ❌ Todas las geocodificaciones fallaron para: "${address}"`
  )
  return {
    success: false,
    error:
      "No se pudo geocodificar la dirección. Por favor, verifica que la dirección esté correcta.",
  }
}

/**
 * Geocodificación con Google Maps
 */
async function geocodeWithGoogleMaps(address: string): Promise<GeocodeResult> {
  try {
    const apiKey = env.GOOGLE_MAPS_API_KEY

    if (!apiKey) {
      throw new ConvexError({
        code: "MISSING_API_KEY",
        message: "No se encontró la API key de Google Maps",
      })
    }

    const encodedAddress = encodeURIComponent(`${address}, Colombia`)
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}&region=co&components=country:CO`

    const response = await fetch(url)
    const data: GoogleMapsGeocodeResponse = await response.json()

    if (data.status === "OK" && data.results.length > 0) {
      const [primary, ...others] = data.results
      if (!primary) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "No se encontró el resultado de geocodificación",
        })
      }

      const coordinates: Coordinates = {
        lat: primary.geometry.location.lat,
        lng: primary.geometry.location.lng,
      }

      const alternatives =
        others.length > 0
          ? others.slice(0, 3).map((r) => ({
              coordinates: {
                lat: r.geometry.location.lat,
                lng: r.geometry.location.lng,
              },
              formattedAddress: r.formatted_address,
            }))
          : undefined

      return {
        success: true,
        coordinates,
        formattedAddress: primary.formatted_address,
        alternatives,
      }
    }

    if (data.status === "ZERO_RESULTS") {
      return {
        success: false,
        error:
          "No se encontró la dirección. Por favor, verifica que la dirección esté correcta.",
      }
    }

    throw new ConvexError({
      code: "API_ERROR",
      message: `Google Maps API error: ${data.status}`,
    })
  } catch (error) {
    throw new ConvexError({
      code: "API_ERROR",
      message: `Error al geocodificar la dirección con Google Maps: ${error}`,
    })
  }
}

/**
 * Geocodificación con OpenStreetMap Nominatim (multi-ciudad, sin hardcodear municipios)
 */
async function geocodeWithOpenStreetMap(
  address: string,
  options?: {
    bounded?: boolean
    center?: Coordinates
  }
): Promise<GeocodeResult> {
  try {
    const encodedAddress = encodeURIComponent(`${address}, Colombia`)

    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=5&addressdetails=1&countrycodes=co`

    if (options?.bounded && options.center) {
      const viewbox = dynamicViewbox(options.center)
      url += `&bounded=1&viewbox=${viewbox}`
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "DeliveryApp/1.0", // Requerido por Nominatim
      },
    })

    const data: OpenStreetMapResponse[] = await response.json()

    if (data.length > 0) {
      const [primary, ...others] = data
      if (!primary) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "No se encontró el resultado de geocodificación",
        })
      }

      const coordinates: Coordinates = {
        lat: Number.parseFloat(primary.lat),
        lng: Number.parseFloat(primary.lon),
      }

      const alternatives =
        others.length > 0
          ? others.slice(0, 3).map((r) => ({
              coordinates: {
                lat: Number.parseFloat(r.lat),
                lng: Number.parseFloat(r.lon),
              },
              formattedAddress: r.display_name,
            }))
          : undefined

      return {
        success: true,
        coordinates,
        formattedAddress: primary.display_name,
        alternatives,
      }
    }

    return {
      success: false,
      error:
        "No se encontró la dirección. Por favor, verifica que la dirección esté correcta.",
    }
  } catch (error) {
    throw new ConvexError({
      code: "API_ERROR",
      message: `Error al geocodificar la dirección con OpenStreetMap: ${error}`,
    })
  }
}

/**
 * Geocodificación inteligente con doble intento
 * Corrige direcciones complejas donde Google/OSM devuelve centroides
 */
export async function smartGeocode(address: string): Promise<GeocodeResult> {
  const normalized = normalizeAddress(address)

  console.log(
    `[SMART_GEOCODE] 🧠 Iniciando geocodificación inteligente para: "${normalized}"`
  )

  // Detectar si la dirección contiene lugares conocidos
  const lowerAddress = normalized.toLowerCase()
  const hasKnownLandmark =
    lowerAddress.includes("zona franca") ||
    lowerAddress.includes("alkosto") ||
    lowerAddress.includes("pricesmart") ||
    lowerAddress.includes("makro") ||
    lowerAddress.includes("tierra santa")

  // Limpieza profunda: elimina torre, piso, apto, edificio, sector, al lado de, etc.
  // PERO: si contiene un lugar conocido, solo eliminar detalles de piso/apartamento
  let coreAddress: string
  if (hasKnownLandmark) {
    // Para lugares conocidos, solo eliminar piso/apartamento pero mantener edificio/torre
    coreAddress = normalized
      .replace(/\b(piso|apartamento|apto|int|interior)\\b.*$/gi, "")
      .trim()
    console.log(
      `[SMART_GEOCODE] 🏢 Lugar conocido detectado, preservando edificio/torre`
    )
  } else {
    // Para direcciones normales, limpieza completa
    coreAddress = normalized
      .replace(
        /\b(torre|edificio|piso|apartamento|apto|int|interior|bloque|mz|manzana|anillo|via|sector|al lado de|cerca de|frente a|diagonal a)\b.*$/gi,
        ""
      )
      .trim()
  }

  console.log(`[SMART_GEOCODE] 🔍 Dirección CORE extraída: "${coreAddress}"`)

  // Intento 1: Dirección completa
  const full = await geocodeAddress(normalized)

  // Intento 2: Dirección core (mucho más precisa para geocercas amplias)
  const core = await geocodeAddress(coreAddress)

  // Si full o core fallan, devolver el que funcione
  if (!full.success && core.success) {
    console.log(`[SMART_GEOCODE] ✅ Solo CORE exitoso, usando coordenadas CORE`)
    return core
  }
  if (!core.success && full.success) {
    console.log(`[SMART_GEOCODE] ✅ Solo FULL exitoso, usando coordenadas FULL`)
    return full
  }
  if (!core.success && !full.success) {
    console.log(`[SMART_GEOCODE] ❌ Ambos intentos fallaron`)
    return full
  }

  // Ambos funcionan → calcular distancia entre coordenadas
  const distanceInDegrees = Math.sqrt(
    (full.coordinates!.lat - core.coordinates!.lat) ** 2 +
      (full.coordinates!.lng - core.coordinates!.lng) ** 2
  )
  const distanceInMeters = distanceInDegrees * 111000 // Aproximación: 1 grado ≈ 111km

  console.log(
    `[SMART_GEOCODE] 📏 Distancia entre FULL y CORE: ${distanceInMeters.toFixed(0)}m`
  )
  console.log(
    `[SMART_GEOCODE] 📍 FULL: (${full.coordinates!.lat.toFixed(6)}, ${full.coordinates!.lng.toFixed(6)})`
  )
  console.log(
    `[SMART_GEOCODE] 📍 CORE: (${core.coordinates!.lat.toFixed(6)}, ${core.coordinates!.lng.toFixed(6)})`
  )

  // Detectar si CORE geocodificó a una ciudad completamente diferente
  const fullCity = (full.formattedAddress || "").toLowerCase()
  const coreCity = (core.formattedAddress || "").toLowerCase()

  // Ciudades conocidas en el área
  const knownCities = [
    "floridablanca",
    "bucaramanga",
    "girón",
    "piedecuesta",
    "san gil",
    "barrancabermeja",
  ]
  let fullCityName = ""
  let coreCityName = ""

  for (const city of knownCities) {
    if (fullCity.includes(city)) fullCityName = city
    if (coreCity.includes(city)) coreCityName = city
  }

  // Si CORE geocodificó a una ciudad diferente (ej: Bogotá en lugar de San Gil), usar FULL
  if (fullCityName && coreCityName && fullCityName !== coreCityName) {
    console.log(
      `[SMART_GEOCODE] ⚠️ CORE geocodificó a ciudad diferente (${coreCityName} vs ${fullCityName}), usando FULL`
    )
    return {
      success: true,
      coordinates: full.coordinates,
      formattedAddress: full.formattedAddress,
      alternatives: [
        {
          coordinates: core.coordinates!,
          formattedAddress: core.formattedAddress || coreAddress,
        },
        ...(full.alternatives || []),
      ],
    }
  }

  // Si CORE geocodificó a una ciudad desconocida (ej: Bogotá) pero FULL a una conocida, usar FULL
  if (fullCityName && !coreCityName && distanceInMeters > 10000) {
    console.log(
      `[SMART_GEOCODE] ⚠️ CORE geocodificó fuera del área (${coreCity}), usando FULL (${fullCityName})`
    )
    return {
      success: true,
      coordinates: full.coordinates,
      formattedAddress: full.formattedAddress,
      alternatives: [
        {
          coordinates: core.coordinates!,
          formattedAddress: core.formattedAddress || coreAddress,
        },
        ...(full.alternatives || []),
      ],
    }
  }

  // Si la distancia es significativa (>50m) pero ambos en la misma ciudad, priorizar CORE
  if (distanceInMeters > 50 && distanceInMeters <= 10000) {
    console.log(
      `[SMART_GEOCODE] ⚡ Distancia significativa detectada, priorizando CORE como principal`
    )
    return {
      success: true,
      coordinates: core.coordinates,
      formattedAddress: core.formattedAddress || coreAddress,
      alternatives: [
        {
          coordinates: full.coordinates!,
          formattedAddress: full.formattedAddress || normalized,
        },
        ...(core.alternatives || []),
        ...(full.alternatives || []),
      ],
    }
  }

  // Si están muy cerca, usar FULL como principal
  console.log(
    `[SMART_GEOCODE] ✅ Coordenadas cercanas, usando FULL como principal`
  )
  return {
    success: true,
    coordinates: full.coordinates,
    formattedAddress: full.formattedAddress,
    alternatives: [
      {
        coordinates: core.coordinates!,
        formattedAddress: core.formattedAddress || coreAddress,
      },
      ...(full.alternatives || []),
    ],
  }
}

// ---------- UTILIDADES GEOMÉTRICAS / GEO-FENCING COMPARTIDAS ----------

const roundCoord = (v: number) => Number(v.toFixed(6))

/**
 * Comprueba si un punto está dentro de un polígono (ray casting robusto)
 * con soporte para ignorar los bordes (ignoreBoundary = true)
 */
function pointInPolygonTurfStyle(
  point: Coordinates,
  polygon: Coordinates[],
  name: string,
  ignoreBoundary = true
): boolean {
  if (!polygon?.length) return false

  const x = roundCoord(point.lng)
  const y = roundCoord(point.lat)

  const first = polygon[0]
  const last = polygon[polygon.length - 1]

  const isClosed =
    polygon.length > 1 &&
    first !== undefined &&
    last !== undefined &&
    roundCoord(first.lat) === roundCoord(last.lat) &&
    roundCoord(first.lng) === roundCoord(last.lng)

  const closed = isClosed ? polygon : [...polygon, first!]

  // Bounding box rápido
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity
  for (const p of closed) {
    if (!p) continue
    const lat = roundCoord(p.lat)
    const lng = roundCoord(p.lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
  }
  if (y < minLat || y > maxLat || x < minLng || x > maxLng) return false

  // Verificación de borde
  if (!ignoreBoundary) {
    for (let i = 0, j = closed.length - 1; i < closed.length; j = i++) {
      const a = closed[i]
      const b = closed[j]
      if (a && b && onSegment(point, a, b)) {
        console.log(`[GEOCERCAS] 🎯 Punto en el borde del área: ${name}`)
        return true
      }
    }
  }

  // Ray casting
  let inside = false
  for (let i = 0, j = closed.length - 1; i < closed.length; j = i++) {
    const nodeI = closed[i]
    const nodeJ = closed[j]
    if (!nodeI || !nodeJ) continue

    const xi = roundCoord(nodeI.lng)
    const yi = roundCoord(nodeI.lat)
    const xj = roundCoord(nodeJ.lng)
    const yj = roundCoord(nodeJ.lat)

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }

  console.log(
    `[GEOCERCAS] ${inside ? "✅ DENTRO" : "❌ FUERA"} del área ${name} (${y.toFixed(
      6
    )}, ${x.toFixed(6)})`
  )
  return inside
}

/** Retorna true si el punto p está sobre el segmento AB */
function onSegment(p: Coordinates, a: Coordinates, b: Coordinates, eps = 1e-9) {
  const px = p.lng,
    py = p.lat,
    ax = a.lng,
    ay = a.lat,
    bx = b.lng,
    by = b.lat
  const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
  if (Math.abs(cross) > eps) return false
  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay)
  if (dot < -eps) return false
  const len2 = (bx - ax) ** 2 + (by - ay) ** 2
  return dot - len2 <= eps
}

/** Calcula el área aproximada de un polígono (coordenadas en grados, solo para orden relativo) */
function polygonArea(coords: Coordinates[]): number {
  let area = 0
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const nodeI = coords[i]
    const nodeJ = coords[j]
    if (!nodeI || !nodeJ) continue

    const xi = nodeI.lng
    const yi = nodeI.lat
    const xj = nodeJ.lng
    const yj = nodeJ.lat
    area += (xj + xi) * (yj - yi)
  }
  return Math.abs(area / 2)
}

/** Distancia mínima (en grados) de un punto al borde de un polígono */
function calculateDistanceToPolygon(
  point: Coordinates,
  polygon: Coordinates[]
): number {
  if (!polygon?.length) return Infinity

  const firstPoint = polygon[0]
  const lastPoint = polygon[polygon.length - 1]
  if (!firstPoint || !lastPoint) return Infinity

  const closed =
    polygon.length > 1 &&
    roundCoord(firstPoint.lat) === roundCoord(lastPoint.lat) &&
    roundCoord(firstPoint.lng) === roundCoord(lastPoint.lng)
      ? polygon
      : [...polygon, firstPoint]

  let minDistance = Infinity

  for (let i = 0; i < closed.length - 1; i++) {
    const segmentStart = closed[i]
    const segmentEnd = closed[i + 1]
    if (!segmentStart || !segmentEnd) continue

    const distance = pointToSegmentDistance(point, segmentStart, segmentEnd)
    minDistance = Math.min(minDistance, distance)
  }

  return minDistance
}

/** Distancia punto-segmento (en grados) */
function pointToSegmentDistance(
  point: Coordinates,
  segmentStart: Coordinates,
  segmentEnd: Coordinates
): number {
  const A = point.lng - segmentStart.lng
  const B = point.lat - segmentStart.lat
  const C = segmentEnd.lng - segmentStart.lng
  const D = segmentEnd.lat - segmentStart.lat

  const dot = A * C + B * D
  const lenSq = C * C + D * D

  if (lenSq === 0) {
    return Math.sqrt(A * A + B * B)
  }

  const param = dot / lenSq

  let xx: number, yy: number

  if (param < 0) {
    xx = segmentStart.lng
    yy = segmentStart.lat
  } else if (param > 1) {
    xx = segmentEnd.lng
    yy = segmentEnd.lat
  } else {
    xx = segmentStart.lng + param * C
    yy = segmentStart.lat + param * D
  }

  const dx = point.lng - xx
  const dy = point.lat - yy

  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Servicio de geocercas reutilizable
 */
export class GeofencingService {
  /**
   * Valida si un punto está dentro de un polígono
   */
  static isPointInPolygon(
    point: Coordinates,
    polygon: Coordinates[],
    name: string,
    ignoreBoundary = true
  ): boolean {
    return pointInPolygonTurfStyle(point, polygon, name, ignoreBoundary)
  }

  /**
   * Distancia mínima (en grados) al borde de un polígono
   */
  static distanceToPolygonBorder(
    point: Coordinates,
    polygon: Coordinates[]
  ): number {
    return calculateDistanceToPolygon(point, polygon)
  }

  /**
   * Área aproximada del polígono (para comparar qué área es más pequeña/precisa)
   */
  static polygonArea(polygon: Coordinates[]): number {
    return polygonArea(polygon)
  }
}

/**
 * Función de compatibilidad para código existente
 * @deprecated Usar GeofencingService.isPointInPolygon en su lugar
 */
export function pointInPolygon(
  point: Coordinates,
  polygon: Coordinates[],
  name: string
): boolean {
  return GeofencingService.isPointInPolygon(point, polygon, name)
}

// ---------- GOOGLE PLACES AUTOCOMPLETE ----------

interface GooglePlacesAutocompleteResponse {
  predictions: Array<{
    description: string
    place_id: string
    structured_formatting: {
      main_text: string
      secondary_text: string
    }
  }>
  status: string
}

/**
 * Searches for address predictions using Google Places Autocomplete API
 * @param input The text input to search for
 * @param biasCoordinates Optional coordinates to bias results towards
 * @returns Promise with list of predictions
 */
export async function autocompleteWithGooglePlaces(
  input: string,
  biasCoordinates?: Coordinates
): Promise<Array<{ description: string; placeId: string }>> {
  try {
    // Only search if input is meaningful
    if (!input || input.trim().length < 1) return []

    const apiKey = env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      console.warn("Missing Google Maps API Key for Autocomplete")
      return []
    }

    const encodedInput = encodeURIComponent(input)
    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodedInput}&key=${apiKey}&components=country:co`

    // Add location bias if provided
    // Using circular bias with 10km radius (approximate city size)
    if (biasCoordinates) {
      url += `&locationbias=circle:10000@${biasCoordinates.lat},${biasCoordinates.lng}`
    }

    const response = await fetch(url)
    const data: GooglePlacesAutocompleteResponse = await response.json()

    if (data.status === "OK") {
      return data.predictions.map((p) => ({
        description: p.description,
        placeId: p.place_id,
      }))
    }

    return []
  } catch (error) {
    console.error("Error in Google Places Autocomplete:", error)
    return []
  }
}

/**
 * Geocodes a Place ID directly (more accurate than text search)
 */
export async function geocodePlaceId(placeId: string): Promise<GeocodeResult> {
  try {
    const apiKey = env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      throw new ConvexError("Missing API Key")
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?place_id=${placeId}&key=${apiKey}`
    const response = await fetch(url)
    const data = await response.json()

    if (data.status === "OK" && data.results.length > 0) {
      const result = data.results[0]
      return {
        success: true,
        coordinates: {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
        },
        formattedAddress: result.formatted_address,
      }
    }

    return {
      success: false,
      error: "Place ID lookup failed",
    }
  } catch (error) {
    console.error("Error geocoding Place ID:", error)
    return { success: false, error: "System error" }
  }
}
