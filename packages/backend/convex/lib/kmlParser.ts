import { BadRequestError } from "./errors"

export interface KMLPlacemark {
  id: string
  name: string
  description: string
  coordinates: { lat: number; lng: number }[]
  folderName: string
  deliveryFee?: number
  minimumOrder?: number
  estimatedDeliveryTime?: string
  styleUrl?: string
}

export interface KMLFolder {
  name: string
  placemarks: KMLPlacemark[]
}

export interface ParsedKMLData {
  folders: KMLFolder[]
  totalPlacemarks: number
  coordinateSystem: string
}

/**
 * Parses KML content and extracts delivery area information
 */
export function parseKML(kmlContent: string): ParsedKMLData {
  const folders: KMLFolder[] = []
  let totalPlacemarks = 0

  try {
    // Extract folder sections
    const folderMatches = kmlContent.match(/<Folder>[\s\S]*?<\/Folder>/g) || []

    for (const folderMatch of folderMatches) {
      const folderName = extractTagContent(folderMatch, "name")

      if (!folderName) continue

      const folder: KMLFolder = {
        name: folderName,
        placemarks: [],
      }

      // Extract placemarks from this folder
      const placemarkMatches =
        folderMatch.match(/<Placemark>[\s\S]*?<\/Placemark>/g) || []

      for (const placemarkMatch of placemarkMatches) {
        const placemarks = parsePlacemarkString(placemarkMatch, folderName)

        if (placemarks) {
          // Handle both single placemark and array of placemarks (for MultiGeometry)
          const placemarkArray = Array.isArray(placemarks)
            ? placemarks
            : [placemarks]
          folder.placemarks.push(...placemarkArray)
          totalPlacemarks += placemarkArray.length
        }
      }

      if (folder.placemarks.length > 0) {
        folders.push(folder)
      }
    }

    // If no folders found, try to extract placemarks from root level
    if (folders.length === 0) {
      const placemarkMatches =
        kmlContent.match(/<Placemark>[\s\S]*?<\/Placemark>/g) || []

      if (placemarkMatches.length > 0) {
        const rootFolder: KMLFolder = {
          name: "Áreas de Entrega",
          placemarks: [],
        }

        for (const placemarkMatch of placemarkMatches) {
          const placemarks = parsePlacemarkString(
            placemarkMatch,
            rootFolder.name
          )
          if (placemarks) {
            // Handle both single placemark and array of placemarks (for MultiGeometry)
            const placemarkArray = Array.isArray(placemarks)
              ? placemarks
              : [placemarks]
            rootFolder.placemarks.push(...placemarkArray)
            totalPlacemarks += placemarkArray.length
          }
        }

        if (rootFolder.placemarks.length > 0) {
          folders.push(rootFolder)
        }
      }
    }
  } catch (error) {
    throw new BadRequestError(
      `Error parsing KML: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }

  return {
    folders,
    totalPlacemarks,
    coordinateSystem: "WGS84", // Standard for KML
  }
}

/**
 * Parses a single Placemark element from string
 * Returns single placemark or array of placemarks (for MultiGeometry)
 */
function parsePlacemarkString(
  placemarkString: string,
  folderName: string
): KMLPlacemark | KMLPlacemark[] | null {
  try {
    const name = extractTagContent(placemarkString, "name")
    const description = extractTagContent(placemarkString, "description")
    const styleUrl = extractTagContent(placemarkString, "styleUrl")

    if (!name) return null

    // Extract delivery cost and other info from ExtendedData or description
    const {
      deliveryFee,
      minimumOrder,
      estimatedDeliveryTime,
      cleanedDescription,
    } = extractAttributes(placemarkString, description)

    // Check for MultiGeometry first
    const multiGeometryMatch = placemarkString.match(
      /<MultiGeometry>[\s\S]*?<\/MultiGeometry>/
    )
    if (multiGeometryMatch) {
      // Extract all polygons from MultiGeometry
      const polygonMatches =
        multiGeometryMatch[0].match(/<Polygon>[\s\S]*?<\/Polygon>/g) || []
      const placemarks: KMLPlacemark[] = []

      for (let index = 0; index < polygonMatches.length; index++) {
        const polygonMatch = polygonMatches[index]
        if (!polygonMatch) continue
        const coordinates = parsePolygonCoordinatesString(polygonMatch)
        if (coordinates.length > 0) {
          placemarks.push({
            id: `${folderName}-${name}-${index + 1}`.replace(
              /[^a-zA-Z0-9-_]/g,
              "_"
            ),
            name,
            description: cleanedDescription,
            coordinates,
            folderName,
            deliveryFee,
            minimumOrder,
            estimatedDeliveryTime,
            styleUrl,
          })
        }
      }

      return placemarks.length > 0 ? placemarks : null
    }

    // Extract coordinates from single Polygon or Point
    let coordinates: { lat: number; lng: number }[] = []

    // Try to get coordinates from Polygon first (delivery areas)
    const polygonMatch = placemarkString.match(/<Polygon>[\s\S]*?<\/Polygon>/)
    if (polygonMatch) {
      coordinates = parsePolygonCoordinatesString(polygonMatch[0])
    } else {
      // Try to get coordinates from Point (restaurant locations)
      const pointMatch = placemarkString.match(/<Point>[\s\S]*?<\/Point>/)
      if (pointMatch) {
        const coordText = extractTagContent(pointMatch[0], "coordinates")
        if (coordText) {
          const coordParts = coordText.trim().split(",")
          if (coordParts.length === 2) {
            const lng = Number(coordParts[0])
            const lat = Number(coordParts[1])
            if (!Number.isNaN(lng) && !Number.isNaN(lat)) {
              coordinates = [{ lat, lng }]
            }
          }
        }
      }
    }

    if (coordinates.length === 0) return null

    return {
      id: `${folderName}-${name}`.replace(/[^a-zA-Z0-9-_]/g, "_"),
      name,
      description: cleanedDescription,
      coordinates,
      folderName,
      deliveryFee,
      minimumOrder,
      estimatedDeliveryTime,
      styleUrl,
    }
  } catch (error) {
    console.error("Error parsing placemark:", error)
    return null
  }
}

/**
 * Parses coordinates from a Polygon element string
 * Only extracts outer boundary coordinates (inner boundaries represent holes)
 */
function parsePolygonCoordinatesString(
  polygonString: string
): { lat: number; lng: number }[] {
  const coordinates: { lat: number; lng: number }[] = []

  try {
    // Get coordinates from outerBoundaryIs LinearRing only
    // Inner boundaries represent holes in the polygon, not additional areas
    const outerBoundaryMatch = polygonString.match(
      /<outerBoundaryIs>[\s\S]*?<\/outerBoundaryIs>/
    )

    if (outerBoundaryMatch) {
      const linearRingMatch = outerBoundaryMatch[0].match(
        /<LinearRing>[\s\S]*?<\/LinearRing>/
      )

      if (linearRingMatch) {
        const coordText = extractTagContent(linearRingMatch[0], "coordinates")
        if (coordText) {
          // Parse coordinate string (format: lng,lat,elevation lng,lat,elevation ...)
          const coordPairs = coordText.trim().split(/\s+/)

          for (const pair of coordPairs) {
            const parts = pair
              .split(",")
              .map((p: string) => Number.parseFloat(p.trim()))
            const lng = parts[0]
            const lat = parts[1]
            if (
              parts.length >= 2 &&
              typeof lng === "number" &&
              typeof lat === "number" &&
              !Number.isNaN(lng) &&
              !Number.isNaN(lat)
            ) {
              coordinates.push({
                lng, // KML uses lng,lat order
                lat,
              })
            }
          }
        }
      }
    } else {
      // Fallback: If no outerBoundaryIs found, try any LinearRing (for simple polygons)
      const linearRingMatch = polygonString.match(
        /<LinearRing>[\s\S]*?<\/LinearRing>/
      )
      if (linearRingMatch) {
        const coordText = extractTagContent(linearRingMatch[0], "coordinates")
        if (coordText) {
          const coordPairs = coordText.trim().split(/\s+/)

          for (const pair of coordPairs) {
            const parts = pair
              .split(",")
              .map((p: string) => Number.parseFloat(p.trim()))
            const lng = parts[0]
            const lat = parts[1]
            if (
              parts.length >= 2 &&
              typeof lng === "number" &&
              typeof lat === "number" &&
              !Number.isNaN(lng) &&
              !Number.isNaN(lat)
            ) {
              coordinates.push({
                lng, // KML uses lng,lat order
                lat,
              })
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error parsing polygon coordinates:", error)
  }

  return coordinates
}

/**
 * Extracts attributes from KML ExtendedData or description
 */
function extractAttributes(
  placemarkString: string,
  description: string
): {
  deliveryFee?: number
  minimumOrder?: number
  estimatedDeliveryTime?: string
  cleanedDescription: string
} {
  let deliveryFee: number | undefined
  let minimumOrder: number | undefined
  let estimatedDeliveryTime: string | undefined
  let cleanedDescription = description

  // 1. Try to extract from ExtendedData if present
  const extendedDataMatch = placemarkString.match(
    /<ExtendedData>([\s\S]*?)<\/ExtendedData>/i
  )
  if (extendedDataMatch) {
    const extendedData = extendedDataMatch[1] || ""

    const findDataValue = (names: string[]) => {
      for (const name of names) {
        const regex = new RegExp(
          `<Data name="${name}">[\\s\\S]*?<value>(.*?)<\\/value>`,
          "i"
        )
        const match = extendedData.match(regex)
        if (match?.[1]) return match[1].trim()
      }
      return undefined
    }

    const feeVal = findDataValue(["delivery_fee", "valor"])
    if (feeVal) deliveryFee = parseFloat(feeVal)

    const minOrderVal = findDataValue([
      "minimum_order",
      "minimo_pedido",
      "mínimo_pedido",
      "pedido_minimo",
    ])
    if (minOrderVal) minimumOrder = parseFloat(minOrderVal)

    const timeVal = findDataValue([
      "estimated_delivery_time",
      "tiempo_estimado",
    ])
    if (timeVal) estimatedDeliveryTime = timeVal
  }

  // 2. Identify and extract "real" description from MyMaps structured format
  // Format: Key: Value<br>Key2: Value2...
  // We check for both "descripción:" and "descripcion:" (accent-insensitive) case-insensitively.
  // We look for all occurrences and pick the first one that has actual content.
  const descRegex =
    /descripci[óo]n:\s*([\s\S]*?)(?=<br\s*\/?>\s*[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+:|$)/gi
  let match: RegExpExecArray | null
  let foundDescriptionContent = ""

  while ((match = descRegex.exec(description)) !== null) {
    let content = (match[1] || "").trim()
    if (content) {
      // Clean HTML from this specific match to see if it's truly empty
      content = content
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .trim()

      if (content) {
        foundDescriptionContent = content
        break // Take the first one that has real text
      }
    }
  }

  if (foundDescriptionContent) {
    cleanedDescription = foundDescriptionContent
  } else if (description.match(/descripci[óo]n:/i)) {
    // If keys were found but all were empty
    cleanedDescription = ""
  }

  // 3. Clear known auto-generated patterns from description if we are using the whole thing
  // or clean up HTML from the extracted part
  if (cleanedDescription) {
    // Convert <br> to \n and strip other HTML
    cleanedDescription = cleanedDescription
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim()

    // Strip legacy patterns if they are still present
    const patterns = [
      /^Área de entrega - .*$/im,
      /^Precio de entrega: .*$/im,
      /^valor:.*$/im,
      /^Tiempo estimado: .*$/im,
      /^Pedido mínimo: .*$/im,
      /^Horario: .*$/im,
    ]

    for (const pattern of patterns) {
      cleanedDescription = cleanedDescription.replace(pattern, "")
    }
    cleanedDescription = cleanedDescription.trim()
  }

  // 4. Fallback: If attributes were not in ExtendedData, try to extract from legacy description format
  if (deliveryFee === undefined && description) {
    // Also try to extract from MyMaps structured format if valor: exists there
    const legacyFeeMatch = description.match(/valor:\s*(\d+)/i)
    if (legacyFeeMatch?.[1]) {
      deliveryFee = parseInt(legacyFeeMatch[1], 10)
    }
  }

  return {
    deliveryFee,
    minimumOrder,
    estimatedDeliveryTime,
    cleanedDescription,
  }
}

/**
 * Helper function to extract text content from XML tag
 */
function extractTagContent(xmlString: string, tagName: string): string {
  try {
    // Match both self-closing and regular tags
    const regex = new RegExp(
      `<${tagName}[^>]*>([^<]*)</${tagName}>|<${tagName}[^>]*/>`,
      "i"
    )
    const match = xmlString.match(regex)

    if (match) {
      // Return content for regular tags, or empty string for self-closing tags
      return match[1] || ""
    }

    // Also try to match CDATA content
    const cdataRegex = new RegExp(
      `<${tagName}[^>]*><!\\[CDATA\\[(.*?)\\]\\]></${tagName}>`,
      "is"
    )
    const cdataMatch = xmlString.match(cdataRegex)
    if (cdataMatch?.[1]) {
      return cdataMatch[1]
    }
  } catch (error) {
    console.error(`Error extracting ${tagName} content:`, error)
  }
  return ""
}

/**
 * Validates KML data before import
 */
export function validateKMLData(data: ParsedKMLData): {
  isValid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (data.totalPlacemarks === 0) {
    errors.push("No se encontraron áreas de entrega válidas en el archivo KML")
  }

  // Check for folders with no placemarks
  data.folders.forEach((folder) => {
    if (folder.placemarks.length === 0) {
      warnings.push(`La carpeta "${folder.name}" no contiene áreas de entrega`)
    }
  })

  // Check for placemarks with invalid coordinates
  data.folders.forEach((folder) => {
    folder.placemarks.forEach((placemark) => {
      if (placemark.coordinates.length < 3) {
        warnings.push(
          `El área "${placemark.name}" tiene menos de 3 coordenadas (no forma un polígono válido)`
        )
      }

      // Check coordinate ranges (should be in Colombia)
      placemark.coordinates.forEach((coord, index) => {
        if (
          coord.lat < 0 ||
          coord.lat > 13 ||
          coord.lng < -82 ||
          coord.lng > -66
        ) {
          warnings.push(
            `Las coordenadas del área "${placemark.name}" (índice ${index}) parecen estar fuera de Colombia`
          )
        }
      })
    })
  })

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}
