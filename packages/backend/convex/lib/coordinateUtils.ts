/**
 * Utility functions for handling coordinate normalization and validation in the backend
 */

/**
 * Normalizes a latitude value to the valid range [-90, 90]
 * When users drag the map multiple turns around the world, coordinates can go beyond valid ranges
 * This function brings them back to the equivalent valid coordinate
 * @param lat - The latitude value (can be outside valid range)
 * @returns Normalized latitude between -90 and 90
 */
export function normalizeLat(lat: number): number {
  // Handle NaN or undefined values
  if (!Number.isFinite(lat)) {
    return 0
  }

  // Normalize to [-180, 180] range first (treating lat like longitude temporarily)
  let normalized = ((lat % 360) + 360) % 360
  if (normalized > 180) {
    normalized -= 360
  }

  // For latitude, we need to handle the poles differently
  // If the normalized value is outside [-90, 90], we need to "flip" it
  if (normalized > 90) {
    normalized = 180 - normalized
  } else if (normalized < -90) {
    normalized = -180 - normalized
  }

  // Ensure we're still within bounds after flipping
  return Math.max(-90, Math.min(90, normalized))
}

/**
 * Normalizes a longitude value to the valid range [-180, 180]
 * When users drag the map multiple turns around the world, coordinates can go beyond valid ranges
 * This function brings them back to the equivalent valid coordinate
 * @param lng - The longitude value (can be outside valid range)
 * @returns Normalized longitude between -180 and 180
 */
export function normalizeLng(lng: number): number {
  // Handle NaN or undefined values
  if (!Number.isFinite(lng)) {
    return 0
  }

  // Normalize longitude to [-180, 180] range
  let normalized = ((lng % 360) + 360) % 360
  if (normalized > 180) {
    normalized -= 360
  }

  return normalized
}

/**
 * Normalizes an array of coordinates to ensure all lat/lng values are within valid ranges
 * @param coordinates - Array of coordinate objects with lat and lng properties
 * @returns Array of normalized coordinates
 */
export function normalizeCoordinates(
  coordinates: { lat: number; lng: number }[]
): { lat: number; lng: number }[] {
  return coordinates.map((coord) => ({
    lat: normalizeLat(coord.lat),
    lng: normalizeLng(coord.lng),
  }))
}

/**
 * Validates and normalizes coordinates, ensuring they are within realistic ranges
 * @param coordinates - Array of coordinate objects
 * @returns Object with validation result and normalized coordinates
 */
export function validateAndNormalizeCoordinates(
  coordinates: { lat: number; lng: number }[]
): {
  isValid: boolean
  normalizedCoordinates: { lat: number; lng: number }[]
  hasNormalization: boolean
} {
  let hasNormalization = false

  const normalizedCoordinates = coordinates.map((coord) => {
    const originalLat = coord.lat
    const originalLng = coord.lng

    const normalizedLat = normalizeLat(coord.lat)
    const normalizedLng = normalizeLng(coord.lng)

    // Check if normalization was needed
    if (
      Math.abs(originalLat - normalizedLat) > 0.000001 ||
      Math.abs(originalLng - normalizedLng) > 0.000001
    ) {
      hasNormalization = true
    }

    return {
      lat: normalizedLat,
      lng: normalizedLng,
    }
  })

  return {
    isValid: coordinates.length > 0,
    normalizedCoordinates,
    hasNormalization,
  }
}
