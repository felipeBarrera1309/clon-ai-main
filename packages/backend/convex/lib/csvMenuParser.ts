import { BadRequestError } from "./errors"

export interface CSVCombinableWith {
  categoryName: string
  sizeName?: string
  productName?: string
}

export interface CSVComponent {
  productName: string
}

export interface CSVMenuProduct {
  id: string
  dbId?: string
  name: string
  description: string
  categoryName: string
  subcategoryName?: string
  sizeName?: string
  price: number
  standAlone: boolean
  combinableHalf: boolean
  minimumQuantity?: number
  maximumQuantity?: number
  externalCode?: string
  combinableWith: CSVCombinableWith[]
  instructions?: string
  imageUrl?: string
  componentsName?: CSVComponent[]
  deshabilitarEn?: string[] // Location codes where product should be disabled
  rowNumber: number
}

export interface ParsedCSVData {
  products: CSVMenuProduct[]
  totalProducts: number
  categories: string[]
  subcategories: string[]
  sizes: string[]
}

/**
 * Splits CSV content into rows, properly handling quoted fields with newlines
 */
function splitCSVRows(csvContent: string): string[] {
  const rows: string[] = []
  let currentRow = ""
  let inQuotes = false
  let i = 0

  while (i < csvContent.length) {
    const char = csvContent[i]
    const nextChar = csvContent[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentRow += '""'
        i += 2
        continue
      } else {
        currentRow += char
        inQuotes = !inQuotes
      }
    } else if (char === "\n" && !inQuotes) {
      rows.push(currentRow)
      currentRow = ""
    } else {
      currentRow += char
    }

    i++
  }

  if (currentRow.trim()) {
    rows.push(currentRow)
  }

  return rows
}

/**
 * Parses CSV content and extracts menu product information
 */
export function parseMenuCSV(csvContent: string): ParsedCSVData {
  const products: CSVMenuProduct[] = []
  const categories = new Set<string>()
  const subcategories = new Set<string>()
  const sizes = new Set<string>()
  let totalProducts = 0

  try {
    // Normalize line endings to handle \r\n and \r
    csvContent = csvContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n")

    // Split into lines and filter out empty lines
    const lines = splitCSVRows(csvContent).filter((line) => line.trim())
    if (lines.length < 2) {
      throw new BadRequestError(
        "El archivo CSV debe tener al menos una fila de encabezados y una fila de datos"
      )
    }

    // Parse header row
    const firstLine = lines[0]
    if (!firstLine) {
      throw new BadRequestError("El archivo CSV está vacío")
    }
    const headers = parseCSVRow(firstLine)
    const requiredHeaders = [
      "nombre_producto",
      "descripcion",
      "categoria",
      "individual",
      "combinable_mitad",
    ]

    const optionalHeaders = [
      "id_producto",
      "instrucciones",
      "subcategoria",
      "tamaño",
      "precio",
      "cantidad_minima",
      "cantidad_maxima",
      "codigo_externo",
      "combinable_con",
      "link_imagen",
      "componentes_nombre",
      "deshabilitar_en",
    ]

    const allHeaders = [...requiredHeaders, ...optionalHeaders]

    // Check if required headers are present (case insensitive)
    const normalizedHeaders = headers.map((h) => h.toLowerCase().trim())
    const headerMismatch = requiredHeaders.some(
      (required) => !normalizedHeaders.includes(required)
    )

    if (headerMismatch) {
      throw new BadRequestError(
        `Los encabezados del CSV no coinciden con el formato esperado. Encabezados requeridos: ${requiredHeaders.join(", ")}. Encabezados opcionales: ${optionalHeaders.join(", ")}`
      )
    }

    // Create header index mapping
    const headerIndex: Record<string, number> = {}
    normalizedHeaders.forEach((header, index) => {
      headerIndex[header] = index
    })

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line || !line.trim()) continue

      const row = parseCSVRow(line)
      if (row.length === 0) continue

      try {
        const product = parseMenuProductRow(row, headerIndex, i + 1)
        if (product) {
          products.push(product)
          totalProducts++

          // Collect unique categories, subcategories, and sizes
          categories.add(product.categoryName)
          if (product.subcategoryName) {
            subcategories.add(product.subcategoryName)
          }
          if (product.sizeName) {
            sizes.add(product.sizeName)
          }
        }
        // If product is null, it means the row was empty and we silently skip it
      } catch (error) {
        console.error(`Error parsing row ${i + 1}:`, error)
        // Continue with other rows, we'll validate later
      }
    }
  } catch (error) {
    throw new BadRequestError(
      `Error parsing CSV: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }

  return {
    products,
    totalProducts: products.length,
    categories: Array.from(categories).sort(),
    subcategories: Array.from(subcategories).sort(),
    sizes: Array.from(sizes).sort(),
  }
}

/**
 * Parses a single CSV row, handling quoted fields and commas within quotes
 */
function parseCSVRow(row: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  let i = 0

  while (i < row.length) {
    const char = row[i]

    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        // Escaped quote
        current += '"'
        i += 2
        continue
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      // Field separator
      result.push(current.trim())
      current = ""
    } else {
      current += char
    }

    i++
  }

  // Add the last field
  result.push(current.trim())

  return result
}

/**
 * Parses a single menu product row
 */
function parseMenuProductRow(
  row: string[],
  headerIndex: Record<string, number>,
  rowNumber: number
): CSVMenuProduct | null {
  // Extract values using header mapping
  const getValue = (fieldName: string): string => {
    const index = headerIndex[fieldName.toLowerCase()]
    return (index !== undefined && row[index]) || ""
  }

  const name = getValue("nombre_producto").trim()
  const description = getValue("descripcion").trim()
  const categoryName = getValue("categoria").trim()
  const subcategoryName = getValue("subcategoria").trim() || undefined
  const sizeName = getValue("tamaño").trim() || undefined
  const priceStr = getValue("precio").trim()
  const standAloneStr = getValue("individual").trim()
  const combinableHalfStr = getValue("combinable_mitad").trim()
  const minQuantityStr = getValue("cantidad_minima").trim()
  const maxQuantityStr = getValue("cantidad_maxima").trim()
  const externalCode = getValue("codigo_externo").trim() || undefined
  const combinableWithStr = getValue("combinable_con").trim()
  const instructions = getValue("instrucciones").trim() || undefined
  const imageUrl = getValue("link_imagen").trim() || undefined
  const componentsNameStr = getValue("componentes_nombre").trim()
  const deshabilitarEnStr = getValue("deshabilitar_en").trim()

  // Check if the row is essentially empty (only has empty fields)
  const hasAnyContent =
    name ||
    description ||
    categoryName ||
    priceStr ||
    standAloneStr ||
    combinableHalfStr
  if (!hasAnyContent) {
    // This is an empty row, silently skip it
    return null
  }

  // Validate required fields
  if (!name) {
    throw new BadRequestError(
      `Fila ${rowNumber}: El nombre del producto es obligatorio`
    )
  }

  if (!description) {
    throw new BadRequestError(
      `Fila ${rowNumber}: La descripción del producto es obligatoria`
    )
  }

  if (!categoryName) {
    throw new BadRequestError(
      `Fila ${rowNumber}: La categoría del producto es obligatoria`
    )
  }

  // Price is now optional - defaults to 0 if empty

  if (!standAloneStr) {
    throw new BadRequestError(
      `Fila ${rowNumber}: El campo 'individual' es obligatorio`
    )
  }

  if (!combinableHalfStr) {
    throw new BadRequestError(
      `Fila ${rowNumber}: El campo 'combinable_mitad' es obligatorio`
    )
  }

  // Parse price - optional, defaults to 0 if empty
  let price = 0
  if (priceStr) {
    price = Number.parseFloat(priceStr.replace(/[$,]/g, ""))
    if (Number.isNaN(price) || price < 0 || price > 1000000) {
      throw new BadRequestError(
        `Fila ${rowNumber}: El precio debe ser un número entre 0 y 1,000,000 (valor proporcionado: ${priceStr})`
      )
    }
  }

  // Parse boolean fields
  const standAlone = parseBooleanField(standAloneStr, rowNumber, "individual")
  const combinableHalf = parseBooleanField(
    combinableHalfStr,
    rowNumber,
    "combinable_mitad"
  )

  // Parse optional quantity fields
  let minimumQuantity: number | undefined
  let maximumQuantity: number | undefined

  if (minQuantityStr) {
    minimumQuantity = Number.parseInt(minQuantityStr, 10)
    if (
      Number.isNaN(minimumQuantity) ||
      minimumQuantity < 1 ||
      minimumQuantity > 100
    ) {
      throw new BadRequestError(
        `Fila ${rowNumber}: La cantidad mínima debe ser un número entre 1 y 100 (valor proporcionado: ${minQuantityStr})`
      )
    }
  }

  if (maxQuantityStr) {
    maximumQuantity = Number.parseInt(maxQuantityStr, 10)
    if (
      Number.isNaN(maximumQuantity) ||
      maximumQuantity < 1 ||
      maximumQuantity > 1000
    ) {
      throw new BadRequestError(
        `Fila ${rowNumber}: La cantidad máxima debe ser un número entre 1 y 1000 (valor proporcionado: ${maxQuantityStr})`
      )
    }
  }

  if (
    minimumQuantity !== undefined &&
    maximumQuantity !== undefined &&
    minimumQuantity > maximumQuantity
  ) {
    throw new BadRequestError(
      `Fila ${rowNumber}: La cantidad mínima (${minimumQuantity}) no puede ser mayor que la cantidad máxima (${maximumQuantity})`
    )
  }

  // Parse combinable categories and sizes
  const combinableWith: CSVCombinableWith[] = []
  if (combinableWithStr) {
    const combinations = combinableWithStr
      .split(";")
      .map((combo) => combo.trim())
      .filter((combo) => combo.length > 0)

    for (const combination of combinations) {
      // Parse format: Category[:Product][&Size] or variations
      // Handles: Category:Product&Size, Category&Size:Product, Category&Size, Category:Product, Category
      let categoryName = ""
      let sizeName: string | undefined
      let productName: string | undefined

      // First split by : to separate category from product
      const colonParts = combination.split(":")
      const categoryPart = (colonParts[0] ?? "").trim()

      // Check if category part has size (handles "Category&Size:Product")
      if (categoryPart.includes("&")) {
        const ampParts = categoryPart.split("&")
        categoryName = (ampParts[0] ?? "").trim()
        sizeName = ampParts[1]?.trim() || undefined
      } else {
        categoryName = categoryPart
      }

      // Process product part if colon exists
      if (colonParts.length > 1) {
        const productPart = colonParts.slice(1).join(":").trim()

        // Check if product part contains size (handles "Category:Product&Size")
        if (productPart.includes("&")) {
          const ampParts = productPart.split("&")
          productName = (ampParts[0] ?? "").trim() || undefined
          // Only override sizeName if not already set from category
          if (!sizeName) {
            sizeName = ampParts[1]?.trim() || undefined
          }
        } else {
          productName = productPart || undefined
        }
      }

      if (categoryName) {
        combinableWith.push({
          categoryName,
          sizeName,
          productName,
        })
      }
    }
  }

  // Parse componentes_nombre as array of CSVComponent (same structure as combinableWith)
  const componentsName: CSVComponent[] = []
  if (componentsNameStr) {
    const components = componentsNameStr
      .split(";")
      .map((comp) => comp.trim())
      .filter((comp) => comp.length > 0)

    for (const component of components) {
      // For components, we don't use the & syntax, just product names
      componentsName.push({ productName: component })
    }
  }

  // Parse deshabilitar_en as array of location codes
  const deshabilitarEn: string[] = []
  if (deshabilitarEnStr) {
    const locations = deshabilitarEnStr
      .split(";")
      .map((loc) => loc.trim())
      .filter((loc) => loc.length > 0)
    deshabilitarEn.push(...locations)
  }

  return {
    id: `${name}-${categoryName}-${subcategoryName || "no-subcat"}-${sizeName || "no-size"}-${rowNumber}`.replace(
      /[^a-zA-Z0-9-_]/g,
      "_"
    ),
    dbId: getValue("id_producto").trim() || undefined,
    name,
    description,
    categoryName,
    subcategoryName,
    sizeName,
    price,
    standAlone,
    combinableHalf,
    minimumQuantity,
    maximumQuantity,
    externalCode,
    combinableWith,
    instructions,
    imageUrl,
    componentsName,
    deshabilitarEn: deshabilitarEn.length > 0 ? deshabilitarEn : undefined,
    rowNumber,
  }
}

/**
 * Parses boolean fields that accept "si"/"no" with or without accents, case-insensitive
 */
function parseBooleanField(
  value: string,
  rowNumber: number,
  fieldName: string
): boolean {
  const normalized = value.toLowerCase().trim()

  // Accept various forms of "yes" including accented and non-accented versions
  if (
    normalized === "sí" ||
    normalized === "si" ||
    normalized === "yes" ||
    normalized === "true" ||
    normalized === "1"
  ) {
    return true
  }

  // Accept various forms of "no"
  if (normalized === "no" || normalized === "false" || normalized === "0") {
    return false
  }

  throw new BadRequestError(
    `Fila ${rowNumber}: El campo '${fieldName}' debe ser 'si' o 'no' (con o sin acentos, mayúsculas o minúsculas) (valor proporcionado: ${value})`
  )
}

/**
 * Validates CSV data before import
 */
export function validateMenuCSVData(data: ParsedCSVData): {
  isValid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (data.totalProducts === 0) {
    errors.push("No se encontraron productos válidos en el archivo CSV")
  }

  // Check for duplicate product names within same category and size
  const productKeys = new Set<string>()
  data.products.forEach((product) => {
    const key =
      `${product.name}-${product.categoryName}-${product.sizeName || ""}`.toLowerCase()
    if (productKeys.has(key)) {
      warnings.push(
        `Producto duplicado encontrado: "${product.name}" en categoria "${product.categoryName}"${product.sizeName ? ` (tamaño: ${product.sizeName})` : ""} (fila ${product.rowNumber})`
      )
    } else {
      productKeys.add(key)
    }
  })

  // Check for products with combinableHalf but not standAlone
  data.products.forEach((product) => {
    if (product.combinableHalf && !product.standAlone) {
      warnings.push(
        `Producto "${product.name}" está marcado como combinable por mitades pero no como independiente (fila ${product.rowNumber})`
      )
    }
  })

  // Check for products that are not standAlone but have no combinable categories
  data.products.forEach((product) => {
    if (!product.standAlone && product.combinableWith.length === 0) {
      warnings.push(
        `Producto "${product.name}" no es independiente pero no tiene categorías combinables especificadas (fila ${product.rowNumber})`
      )
    }
  })

  // Validate componentes_nombre format (should be valid menuProduct names)
  data.products.forEach((product) => {
    if (product.componentsName && product.componentsName.length > 0) {
      for (const component of product.componentsName) {
        if (
          !component.productName ||
          component.productName.trim().length === 0
        ) {
          errors.push(
            `Producto "${product.name}" tiene un nombre de componente vacío en componentes_nombre (fila ${product.rowNumber})`
          )
        }
        // Additional validation could be added here to check if the name exists in the database
        // but that would require database access, so we'll just check basic format for now
      }
    }
  })

  // Validate instrucciones length if present
  data.products.forEach((product) => {
    if (product.instructions && product.instructions.length > 2000) {
      warnings.push(
        `Producto "${product.name}" tiene instrucciones/reglas muy largas (${product.instructions.length} caracteres). Considere acortarlas para mejor usabilidad (fila ${product.rowNumber})`
      )
    }
  })

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}
