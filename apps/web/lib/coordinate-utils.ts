/**
 * Utility functions for handling coordinate input validation and sanitization
 */

export interface CoordinateValidationResult {
  isValid: boolean
  value?: number
  error?: string
}

/**
 * Sanitizes and validates a coordinate string input
 * Accepts formats like: "4.6097", "-74.0817", "4,6097", "-74,0817"
 * @param input - The string input from the user
 * @param type - Whether this is a latitude or longitude coordinate
 * @returns Validation result with parsed number or error message
 */
export function validateCoordinate(
  input: string,
  type: "latitude" | "longitude"
): CoordinateValidationResult {
  if (!input || input.trim() === "") {
    return {
      isValid: false,
      error: `${type === "latitude" ? "La latitud" : "La longitud"} es obligatoria`,
    }
  }

  // Clean the input: remove spaces, replace comma with dot
  const cleanedInput = input.trim().replace(",", ".")

  // Check if it's a valid number format
  const numberRegex = /^-?\d+(\.\d+)?$/
  if (!numberRegex.test(cleanedInput)) {
    return {
      isValid: false,
      error: `Formato inválido. Use números como: ${
        type === "latitude" ? "4.6097" : "-74.0817"
      }`,
    }
  }

  const parsedValue = Number.parseFloat(cleanedInput)

  // Check if parsing was successful
  if (Number.isNaN(parsedValue)) {
    return {
      isValid: false,
      error: "No se pudo convertir a número válido",
    }
  }

  // Validate coordinate ranges
  if (type === "latitude") {
    if (parsedValue < -90 || parsedValue > 90) {
      return {
        isValid: false,
        error: "La latitud debe estar entre -90 y 90",
      }
    }
  } else {
    if (parsedValue < -180 || parsedValue > 180) {
      return {
        isValid: false,
        error: "La longitud debe estar entre -180 y 180",
      }
    }
  }

  return {
    isValid: true,
    value: parsedValue,
  }
}

/**
 * Formats a coordinate number for display in input fields
 * @param value - The coordinate number
 * @returns Formatted string with appropriate decimal places
 */
export function formatCoordinateForDisplay(value: number): string {
  if (value === 0) return ""
  return value.toFixed(6)
}

/**
 * Sanitizes coordinate string input for form processing
 * @param input - Raw string input
 * @returns Cleaned string ready for validation
 */
export function sanitizeCoordinateInput(input: string): string {
  return input.trim().replace(",", ".")
}

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
  warnings: string[]
} {
  const warnings: string[] = []
  const normalizedCoordinates = coordinates.map((coord, index) => {
    const originalLat = coord.lat
    const originalLng = coord.lng

    const normalizedLat = normalizeLat(coord.lat)
    const normalizedLng = normalizeLng(coord.lng)

    // Check if normalization was needed
    if (Math.abs(originalLat - normalizedLat) > 0.000001) {
      warnings.push(
        `Punto ${index + 1}: Latitud ${originalLat.toFixed(6)} normalizada a ${normalizedLat.toFixed(6)}`
      )
    }

    if (Math.abs(originalLng - normalizedLng) > 0.000001) {
      warnings.push(
        `Punto ${index + 1}: Longitud ${originalLng.toFixed(6)} normalizada a ${normalizedLng.toFixed(6)}`
      )
    }

    return {
      lat: normalizedLat,
      lng: normalizedLng,
    }
  })

  return {
    isValid: coordinates.length > 0,
    normalizedCoordinates,
    warnings,
  }
}
