import { Doc } from "../_generated/dataModel"

/**
 * Compares two sets of coordinates to determine if they represent the same area
 */
export function areCoordinatesEqual(
  coords1: { lat: number; lng: number }[],
  coords2: { lat: number; lng: number }[]
): boolean {
  if (coords1.length !== coords2.length) return false

  // Compare each coordinate pair with small tolerance for floating point precision
  const tolerance = 0.000001 // ~10cm accuracy

  return coords1.every((coord1, index) => {
    const coord2 = coords2[index]
    if (!coord2) return false
    return (
      Math.abs(coord1.lat - coord2.lat) < tolerance &&
      Math.abs(coord1.lng - coord2.lng) < tolerance
    )
  })
}

/**
 * Checks for conflicts between a placemark and existing delivery areas
 * Only checks for coordinate conflicts (same geographic area)
 */
export function checkForConflicts(
  placemark: { name: string; coordinates: { lat: number; lng: number }[] },
  existingAreas: Array<{
    name: string
    coordinates: { lat: number; lng: number }[]
  }>,
  conflictType: "existing" | "import" = "existing"
): string[] {
  const conflicts: string[] = []

  for (const existingArea of existingAreas) {
    // Check for coordinate conflict (same geographic area)
    if (areCoordinatesEqual(placemark.coordinates, existingArea.coordinates)) {
      if (conflictType === "existing") {
        conflicts.push(
          `Ya existe un área con las mismas coordenadas (nombre existente: "${existingArea.name}")`
        )
      } else {
        conflicts.push(
          `Coordenadas duplicadas dentro de la importación (área previa: "${existingArea.name}")`
        )
      }
    }
  }

  return conflicts
}
