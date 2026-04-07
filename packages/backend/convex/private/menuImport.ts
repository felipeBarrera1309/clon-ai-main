import { v } from "convex/values"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { parseMenuCSV, validateMenuCSVData } from "../lib/csvMenuParser"
import { authMutation } from "../lib/helpers"
import { normalizeSearchText } from "../lib/textUtils"
import { aggregateMenuProductsByOrganization } from "../menuProductsAggregate"

export interface MenuImportPreview {
  products: Array<{
    id: string
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
    combinableWith: Array<{
      categoryName: string
      sizeName?: string
      productName?: string
    }>
    instructions?: string
    imageUrl?: string
    componentsNames?: Array<{
      productName: string
    }>
    deshabilitarEn?: string[]
    rowNumber: number
    conflicts: string[]
    willOverwrite: boolean
    categoryExists: boolean
    subcategoryExists: boolean
    sizeExists: boolean
    combinableCategoriesExist: boolean
    componentsExist: boolean
    deshabilitarEnLocationsExist: boolean
    internalDuplicateOf?: number
    dbDuplicate?: boolean
    hasChanges?: boolean
  }>
  totalProducts: number
  newProducts: number
  conflictingProducts: number
  categories: string[]
  subcategories: string[]
  sizes: string[]
  errors: string[]
  warnings: string[]
}

export interface MenuImportResult {
  success: boolean
  importedProducts: number
  skippedProducts: number
  deletedProducts: number
  errors: string[]
  createdProductIds: string[]
  createdCategories: string[]
  createdSubcategories: string[]
  createdSizes: string[]
}

interface CombinableWith {
  menuProductCategoryId: Id<"menuProductCategories">
  sizeId?: Id<"sizes">
  menuProductId?: Id<"menuProducts">
}

/**
 * Detects if a product has genuine changes compared to its database version
 */
function hasGenuineChanges(
  dbProduct: any,
  csvProduct: any,
  existingSubcategories: any[],
  existingSizes: any[],
  resolvedCombinableWith?: CombinableWith[]
): boolean {
  // 1. Basic Fields
  const normalizeValues = (a: any, b: any) => (a ?? null) !== (b ?? null)

  if (dbProduct.name !== csvProduct.name) return true
  if (dbProduct.description !== csvProduct.description) return true
  if (Math.abs(dbProduct.price - csvProduct.price) > 0.01) return true
  if (dbProduct.standAlone !== csvProduct.standAlone) return true
  if (dbProduct.combinableHalf !== csvProduct.combinableHalf) return true

  // 2. Optional Fields
  if (normalizeValues(dbProduct.minimumQuantity, csvProduct.minimumQuantity))
    return true
  if (normalizeValues(dbProduct.maximumQuantity, csvProduct.maximumQuantity))
    return true
  if (normalizeValues(dbProduct.externalCode, csvProduct.externalCode))
    return true
  if (normalizeValues(dbProduct.instructions, csvProduct.instructions))
    return true
  if (normalizeValues(dbProduct.imageUrl, csvProduct.imageUrl)) return true

  // 3. Subcategory
  const dbSubcat = dbProduct.menuProductSubcategoryId
    ? existingSubcategories.find(
        (s) => s._id === dbProduct.menuProductSubcategoryId
      )?.name
    : undefined
  if (
    (dbSubcat?.toLowerCase().trim() || null) !==
    (csvProduct.subcategoryName?.toLowerCase().trim() || null)
  )
    return true

  // 4. Size
  const dbSize = dbProduct.sizeId
    ? existingSizes.find((s) => s._id === dbProduct.sizeId)?.name
    : undefined
  if (
    (dbSize?.toLowerCase().trim() || null) !==
    (csvProduct.sizeName?.toLowerCase().trim() || null)
  )
    return true

  // 5. CombinableWith (resolved)
  if (resolvedCombinableWith) {
    const dbLinks = dbProduct.combinableWith || []
    if (dbLinks.length !== resolvedCombinableWith.length) return true

    for (let i = 0; i < resolvedCombinableWith.length; i++) {
      const dbLink = dbLinks[i]
      const csvLink = resolvedCombinableWith[i]
      if (!dbLink || !csvLink) return true
      if (dbLink.menuProductCategoryId !== csvLink.menuProductCategoryId)
        return true
      if (dbLink.sizeId !== csvLink.sizeId) return true
      if (dbLink.menuProductId !== csvLink.menuProductId) return true
    }
  }

  return false
}

/**
 * Parses and validates CSV content for menu import preview
 */
export const previewMenuImport = authMutation({
  args: {
    organizationId: v.string(),
    csvContent: v.string(),
    conflictResolution: v.optional(
      v.union(
        v.literal("skip"),
        v.literal("overwrite"),
        v.literal("create_new"),
        v.literal("substitute")
      )
    ),
  },
  handler: async (ctx, args): Promise<MenuImportPreview> => {
    try {
      // Parse CSV content
      const parsedData = parseMenuCSV(args.csvContent)

      // Validate parsed data
      const validation = validateMenuCSVData(parsedData)

      // Get existing data for conflict detection

      const existingProducts = await ctx.db
        .query("menuProducts")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      const existingCategories = await ctx.db
        .query("menuProductCategories")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      const existingSizes = await ctx.db
        .query("sizes")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      const existingSubcategories = await ctx.db
        .query("menuProductSubcategories")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      const existingLocations = await ctx.db
        .query("restaurantLocations")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      // Process products and check for conflicts
      const products: MenuImportPreview["products"] = []
      let totalProducts = 0
      let newProducts = 0
      let conflictingProducts = 0
      const errors: string[] = []
      const warnings: string[] = []

      // Add validation errors
      errors.push(...validation.errors)
      warnings.push(...validation.warnings)

      // Map to track products seen within this CSV file for internal duplicate detection
      const seenByProductKey = new Map<
        string,
        { rowNumber: number; product: any }
      >()
      const seenByID = new Map<string, { rowNumber: number; product: any }>()

      // Pre-calculation: Check which row legitimately owns an ID (if multiple rows share it)
      const idOwnershipMap = new Map<string, number>()
      for (const product of parsedData.products) {
        if (!product.dbId) continue
        const dbProduct = existingProducts.find((p) => p._id === product.dbId)
        if (!dbProduct) continue

        const isMatch =
          dbProduct.name.toLowerCase().trim() ===
            product.name.toLowerCase().trim() &&
          existingCategories
            .find((c) => c._id === dbProduct.menuProductCategoryId)
            ?.name.toLowerCase()
            .trim() === product.categoryName.toLowerCase().trim()

        if (isMatch) {
          idOwnershipMap.set(product.dbId, product.rowNumber)
        }
      }
      for (const product of parsedData.products) {
        // Construct unique key for duplicate detection
        const productKey = `${product.name.toLowerCase().trim()}|${product.categoryName.toLowerCase().trim()}|${product.sizeName?.toLowerCase().trim() || ""}`

        totalProducts++

        // Check for conflicts with existing products
        const conflicts: string[] = []
        let willOverwrite = false
        let internalDuplicateOf: number | undefined
        let dbDuplicate = false
        const differences: string[] = []

        const matchedByID = product.dbId
          ? existingProducts.find((p) => p._id === product.dbId)
          : undefined
        const dbIdKey = matchedByID ? `ID:${product.dbId}` : null

        // 1. Check for Internal Duplicates
        const matchedByNameInRange = seenByProductKey.get(productKey)
        const matchedByIDInRange = dbIdKey ? seenByID.get(dbIdKey) : undefined

        const idOwnerRow = product.dbId
          ? idOwnershipMap.get(product.dbId)
          : undefined
        const isLegitOwner = idOwnerRow === product.rowNumber
        const hasLegitOwnerInFile = product.dbId
          ? idOwnershipMap.has(product.dbId)
          : false

        if (matchedByNameInRange) {
          internalDuplicateOf = matchedByNameInRange.rowNumber
          const originalProduct = matchedByNameInRange.product
          if (product.description !== originalProduct.description)
            differences.push("descripción")
          if (product.price !== originalProduct.price)
            differences.push("precio")
          conflicts.push(
            `Fila duplicada: Coincide en Nombre/Categoría/Tamaño con la fila ${internalDuplicateOf}.`
          )
        } else if (product.dbId && hasLegitOwnerInFile && !isLegitOwner) {
          // Si hay un dueño legítimo de este ID en el archivo y no es esta fila, apuntamos a ese dueño
          internalDuplicateOf = idOwnerRow
          conflicts.push(
            `Conflicto de ID: Este ID le pertenece legítimamente a la fila ${idOwnerRow} (${existingProducts.find((p) => p._id === product.dbId)?.name}).`
          )
        } else if (matchedByIDInRange && !isLegitOwner) {
          // Si no hay dueño legítimo en el archivo, pero el ID ya se usó antes
          internalDuplicateOf = matchedByIDInRange.rowNumber
          conflicts.push(
            `ID Duplicado: Este ID ya fue usado en la fila ${internalDuplicateOf}.`
          )
        }

        if (!internalDuplicateOf) {
          seenByProductKey.set(productKey, {
            rowNumber: product.rowNumber,
            product,
          })
          if (dbIdKey)
            seenByID.set(dbIdKey, { rowNumber: product.rowNumber, product })
        }

        const isSkipMode =
          !args.conflictResolution || args.conflictResolution === "skip"

        // 1. Find by Name/Cat/Size (Key)
        const matchedByKey = existingProducts.find(
          (p) =>
            p.name.toLowerCase().trim() === product.name.toLowerCase().trim() &&
            existingCategories.find(
              (cat) =>
                cat.name.toLowerCase().trim() ===
                product.categoryName.toLowerCase().trim()
            )?._id === p.menuProductCategoryId &&
            ((!p.sizeId && !product.sizeName) ||
              (p.sizeId &&
                product.sizeName &&
                existingSizes
                  .find((size) => size._id === p.sizeId)
                  ?.name.toLowerCase()
                  .trim() === product.sizeName.toLowerCase().trim()))
        )

        // 2. Find by ID if provided (reusing matchedByID from duplicate check)

        let existingProduct

        if (matchedByID) {
          existingProduct = matchedByID
          // Check for collision: ID points to X, but Key points to Y
          if (matchedByKey && matchedByKey._id !== matchedByID._id) {
            conflicts.push(
              `Advertencia de Correlación: El ID indica "${matchedByID.name}" pero el Nombre coincide con "${matchedByKey.name}". Se usará el ID para actualizar.`
            )
          }
        } else if (matchedByKey) {
          existingProduct = matchedByKey
          // Healing: Key matched but ID was invalid/mismatched
          if (product.dbId) {
            conflicts.push(
              `Actualización por Coincidencia: El ID proporcionado no se encontró, pero se ha vinculado por Nombre, Categoría y Tamaño.`
            )
          }
        }

        // Rule for New Products: If not found by either, it's New.
        // We don't complain about IDs here as requested.

        if (existingProduct) {
          dbDuplicate = true
          willOverwrite =
            !isSkipMode &&
            (args.conflictResolution === "overwrite" ||
              args.conflictResolution === "substitute")
        }

        if (existingProduct && !product.dbId) {
          if (!internalDuplicateOf) {
            // No extra messages needed, the UI badges handle the status.
          }
        }
        // Check if category exists
        const catNormalized = product.categoryName.toLowerCase().trim()
        const categoryMatch = existingCategories.find(
          (cat) => cat.name.toLowerCase().trim() === catNormalized
        )
        const categoryExists =
          !!categoryMatch ||
          parsedData.categories.some(
            (c) => c.toLowerCase().trim() === catNormalized
          )

        // Check if subcategory exists
        // It's okay if it's in the DB linked to the correct category OR if it's in the CSV
        const subcategoryExists =
          !product.subcategoryName ||
          existingSubcategories.some(
            (subcat) =>
              subcat.name.toLowerCase().trim() ===
                product.subcategoryName!.toLowerCase().trim() &&
              (!categoryMatch ||
                subcat.menuProductCategoryId === categoryMatch._id)
          ) ||
          parsedData.products.some(
            (p) =>
              p.subcategoryName?.toLowerCase().trim() ===
                product.subcategoryName?.toLowerCase().trim() &&
              p.categoryName.toLowerCase().trim() ===
                product.categoryName.toLowerCase().trim()
          )

        // Check if size exists
        const sizeExists =
          !product.sizeName ||
          existingSizes.some(
            (size) =>
              size.name.toLowerCase().trim() ===
              product.sizeName!.toLowerCase().trim()
          ) ||
          parsedData.sizes.some(
            (s) =>
              s.toLowerCase().trim() === product.sizeName?.toLowerCase().trim()
          )

        // Check if components exist
        const componentsExist = true // Ignorado por refactorización actual

        // Check if deshabilitar_en locations exist
        const deshabilitarEnLocationsExist =
          !product.deshabilitarEn ||
          product.deshabilitarEn.length === 0 ||
          product.deshabilitarEn.every((locationCode) =>
            existingLocations.some(
              (loc) =>
                loc.code.toLowerCase().trim() ===
                locationCode.toLowerCase().trim()
            )
          )

        // Initial push with null combinableWith, we'll fill it in second pass
        products.push({
          id: product.id,
          name: product.name,
          description: product.description,
          categoryName: product.categoryName,
          subcategoryName: product.subcategoryName,
          sizeName: product.sizeName,
          price: product.price,
          standAlone: product.standAlone,
          combinableHalf: product.combinableHalf,
          minimumQuantity: product.minimumQuantity,
          maximumQuantity: product.maximumQuantity,
          externalCode: product.externalCode,
          combinableWith: [], // Pass 2
          instructions: product.instructions,
          imageUrl: product.imageUrl,
          componentsNames: product.componentsName,
          deshabilitarEn: product.deshabilitarEn,
          rowNumber: product.rowNumber,
          conflicts,
          willOverwrite,
          categoryExists,
          subcategoryExists,
          sizeExists,
          combinableCategoriesExist: true, // Pass 2
          componentsExist,
          deshabilitarEnLocationsExist,
          internalDuplicateOf,
          dbDuplicate,
        })

        if (conflicts.length === 0 && !internalDuplicateOf && !dbDuplicate) {
          newProducts++
        } else if (dbDuplicate || internalDuplicateOf) {
          conflictingProducts++
        }
      }

      // PASS 2: Resolve combinableWith
      for (const productPreview of products) {
        const originalProductData = parsedData.products.find(
          (p) => p.rowNumber === productPreview.rowNumber
        )
        if (!originalProductData) continue

        let allCombinablesFound = true
        productPreview.combinableWith = originalProductData.combinableWith.map(
          (combo) => {
            const catNameKey = combo.categoryName.toLowerCase().trim()
            const catMatch = existingCategories.find(
              (c) => c.name.toLowerCase().trim() === catNameKey
            )
            const catInFile = parsedData.categories.some(
              (c) => c.toLowerCase().trim() === catNameKey
            )

            let productName = combo.productName
            if (productName && (catMatch || catInFile)) {
              const searchName = productName.toLowerCase().trim()
              // Search in existing (DB)
              const dbMatch = catMatch
                ? existingProducts.find(
                    (p) =>
                      p.name.toLowerCase().trim() === searchName &&
                      p.menuProductCategoryId === catMatch._id
                  )
                : null

              // Search in CSV
              const csvMatch = parsedData.products.find(
                (p) =>
                  p.name.toLowerCase().trim() === searchName &&
                  p.categoryName.toLowerCase().trim() === catNameKey
              )
              productName = dbMatch?.name || csvMatch?.name || productName
            }

            if (
              !(catMatch || catInFile) ||
              (combo.productName && !productName)
            ) {
              allCombinablesFound = false
            }

            return { ...combo, productName }
          }
        )
        productPreview.combinableCategoriesExist = allCombinablesFound

        // Check for genuine changes if it's an existing product update
        const catNormalized = originalProductData.categoryName
          .toLowerCase()
          .trim()
        const categoryMatch = existingCategories.find(
          (c) => c.name.toLowerCase().trim() === catNormalized
        )

        const existingProduct = originalProductData.dbId
          ? existingProducts.find((p) => p._id === originalProductData.dbId)
          : categoryMatch
            ? existingProducts.find(
                (p) =>
                  p.name.toLowerCase().trim() ===
                    originalProductData.name.toLowerCase().trim() &&
                  p.menuProductCategoryId === categoryMatch._id &&
                  ((!p.sizeId && !originalProductData.sizeName) ||
                    (p.sizeId &&
                      originalProductData.sizeName &&
                      existingSizes
                        .find((s) => s._id === p.sizeId)
                        ?.name.toLowerCase()
                        .trim() ===
                        originalProductData.sizeName.toLowerCase().trim()))
              )
            : undefined

        if (existingProduct) {
          productPreview.hasChanges = hasGenuineChanges(
            existingProduct,
            originalProductData,
            existingSubcategories,
            existingSizes
          )
        } else {
          productPreview.hasChanges = true // New products always have changes
        }
      }

      // Filter products based on resolution mode
      const filteredProducts = products.filter((p) => {
        if (p.conflicts.length > 0 || p.internalDuplicateOf !== undefined)
          return true

        const isSkipMode = args.conflictResolution === "skip"
        const isOverwriteMode = args.conflictResolution === "overwrite"

        if (isSkipMode && p.dbDuplicate) return false
        if (isOverwriteMode && p.dbDuplicate && !p.hasChanges) return false

        return true
      })

      return {
        products: filteredProducts,
        totalProducts,
        newProducts,
        conflictingProducts,
        categories: parsedData.categories,
        subcategories: parsedData.subcategories,
        sizes: parsedData.sizes,
        errors,
        warnings,
      }
    } catch (error) {
      console.error("Error in previewMenuImport:", error)

      let userFriendlyMessage =
        "Error al procesar el archivo. Verifica el formato."

      if (error instanceof Error) {
        if (
          error.message.includes("encabezados") ||
          error.message.includes("headers")
        ) {
          userFriendlyMessage =
            "El archivo no tiene el formato correcto. Asegúrate de usar la plantilla con los encabezados requeridos: nombre_producto, descripcion, categoria, tamaño, precio, individual, combinable_mitad, cantidad_minima, cantidad_maxima, combinable_con, codigo_externo"
        } else if (error.message.includes("vacío")) {
          userFriendlyMessage = "El archivo está vacío o no se pudo leer"
        } else if (
          error.message.includes("UTF-8") ||
          error.message.includes("encoding")
        ) {
          userFriendlyMessage =
            "El archivo debe estar codificado en UTF-8. Guarda el archivo como CSV con codificación UTF-8"
        } else {
          userFriendlyMessage = `Error al procesar el archivo: ${error.message}`
        }
      }

      return {
        products: [],
        totalProducts: 0,
        newProducts: 0,
        conflictingProducts: 0,
        categories: [],
        subcategories: [],
        sizes: [],
        errors: [userFriendlyMessage],
        warnings: [],
      }
    }
  },
})

/**
 * Imports CSV menu data into the database
 */
export const importMenuData = authMutation({
  args: {
    organizationId: v.string(),
    csvContent: v.string(),
    conflictResolution: v.union(
      v.literal("skip"),
      v.literal("overwrite"),
      v.literal("create_new"),
      v.literal("substitute")
    ),
  },
  handler: async (ctx, args): Promise<MenuImportResult> => {
    try {
      const parsedData = parseMenuCSV(args.csvContent)
      const validation = validateMenuCSVData(parsedData)

      if (validation.errors.length > 0) {
        return {
          success: false,
          importedProducts: 0,
          skippedProducts: 0,
          deletedProducts: 0,
          errors: validation.errors,
          createdProductIds: [],
          createdCategories: [],
          createdSubcategories: [],
          createdSizes: [],
        }
      }

      const existingProducts = await ctx.db
        .query("menuProducts")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      const existingCategories = await ctx.db
        .query("menuProductCategories")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      const existingSizes = await ctx.db
        .query("sizes")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      const existingSubcategories = await ctx.db
        .query("menuProductSubcategories")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      const existingLocations = await ctx.db
        .query("restaurantLocations")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      const createdProductIds: string[] = []
      const createdCategories: string[] = []
      const createdSubcategories: string[] = []
      const createdSizes: string[] = []
      let importedProducts = 0
      let skippedProducts = 0
      let deletedProducts = 0
      const errors: string[] = []
      const processedProductIds = new Set<string>()
      const importedRowToIdMap = new Map<number, Id<"menuProducts">>()

      const categoryMap = new Map<string, string>()
      for (const existingCategory of existingCategories) {
        categoryMap.set(
          existingCategory.name.toLowerCase().trim(),
          existingCategory._id
        )
      }

      for (const categoryName of parsedData.categories) {
        const categoryKey = categoryName.toLowerCase().trim()
        if (!categoryMap.has(categoryKey)) {
          const categoryId = await ctx.db.insert("menuProductCategories", {
            name: categoryName.trim(),
            organizationId: args.organizationId,
          })
          categoryMap.set(categoryKey, categoryId)
          createdCategories.push(categoryName.trim())
        }
      }

      const subcategoryMap = new Map<string, string>()
      for (const existingSubcategory of existingSubcategories) {
        subcategoryMap.set(
          `${existingSubcategory.menuProductCategoryId}|${existingSubcategory.name.toLowerCase().trim()}`,
          existingSubcategory._id
        )
      }

      for (const product of parsedData.products) {
        const subcategoryName = product.subcategoryName
        if (subcategoryName) {
          const categoryId = categoryMap.get(
            product.categoryName.toLowerCase().trim()
          )
          if (categoryId) {
            const subcategoryKey = `${categoryId}|${subcategoryName.toLowerCase().trim()}`
            if (!subcategoryMap.has(subcategoryKey)) {
              const subcategoryId = await ctx.db.insert(
                "menuProductSubcategories",
                {
                  name: subcategoryName,
                  menuProductCategoryId:
                    categoryId as Id<"menuProductCategories">,
                  organizationId: args.organizationId,
                }
              )
              subcategoryMap.set(subcategoryKey, subcategoryId)
              createdSubcategories.push(subcategoryName)
            }
          }
        }
      }

      const sizeMap = new Map<string, string>()
      for (const existingSize of existingSizes) {
        sizeMap.set(existingSize.name.toLowerCase().trim(), existingSize._id)
      }

      for (const sizeName of parsedData.sizes) {
        const sizeKey = sizeName.toLowerCase().trim()
        if (!sizeMap.has(sizeKey)) {
          const sizeId = await ctx.db.insert("sizes", {
            name: sizeName.trim(),
            organizationId: args.organizationId,
          })
          sizeMap.set(sizeKey, sizeId)
          createdSizes.push(sizeName.trim())
        }
      }

      const restaurantLocations = await ctx.db
        .query("restaurantLocations")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      // Pre-calculation: Check which row legitimately owns an ID (if multiple rows share it)
      const idOwnershipMap = new Map<string, number>()
      for (const product of parsedData.products) {
        if (!product.dbId) continue
        const dbProduct = existingProducts.find((p) => p._id === product.dbId)
        if (!dbProduct) continue

        const isMatch =
          dbProduct.name.toLowerCase().trim() ===
            product.name.toLowerCase().trim() &&
          categoryMap.get(product.categoryName.toLowerCase().trim()) ===
            dbProduct.menuProductCategoryId

        if (isMatch) {
          idOwnershipMap.set(product.dbId, product.rowNumber)
        }
      }

      const seenProductsInFile = new Set<string>()
      const seenIdsInFile = new Set<string>()

      for (const product of parsedData.products) {
        try {
          const productKey = `${product.name.toLowerCase().trim()}|${product.categoryName.toLowerCase().trim()}|${product.sizeName?.toLowerCase().trim() || ""}`
          const matchedByInternalID = product.dbId
            ? existingProducts.find((p) => p._id === product.dbId)
            : undefined
          const dbIdKey = matchedByInternalID ? `ID:${product.dbId}` : null

          const idOwnerRow = product.dbId
            ? idOwnershipMap.get(product.dbId)
            : undefined
          const isLegitOwner = idOwnerRow === product.rowNumber
          const hasLegitOwnerInFile = product.dbId
            ? idOwnershipMap.has(product.dbId)
            : false

          const categoryId = categoryMap.get(
            product.categoryName.toLowerCase().trim()
          )
          if (!categoryId)
            throw new Error(`Category "${product.categoryName}" not found`)
          const sizeId = product.sizeName
            ? sizeMap.get(product.sizeName.toLowerCase().trim()) || null
            : null

          // 1. Find by Name/Cat/Size (Key)
          const matchedByKey = existingProducts.find(
            (p) =>
              p.name.toLowerCase().trim() ===
                product.name.toLowerCase().trim() &&
              p.menuProductCategoryId === categoryId &&
              ((!p.sizeId && !sizeId) || p.sizeId === sizeId)
          )

          // 2. Find by ID if provided (reusing matchedByInternalID)
          const matchedByID = matchedByInternalID

          // SI estamos en modo "Sustituir", debemos marcar cualquier producto que coincida (por clave o ID)
          // como "procesado" para que NO sea eliminado después, incluso si esta fila específica se salta por duplicidad interna.
          if (args.conflictResolution === "substitute") {
            if (matchedByID) processedProductIds.add(matchedByID._id.toString())
            if (matchedByKey)
              processedProductIds.add(matchedByKey._id.toString())
          }

          // Si hay un dueño legítimo de este ID en el archivo, cualquier otra fila con ese ID es un duplicado/intruso
          const isDuplicateByID =
            dbIdKey &&
            ((hasLegitOwnerInFile && !isLegitOwner) ||
              (!hasLegitOwnerInFile && seenIdsInFile.has(dbIdKey)))

          if (seenProductsInFile.has(productKey) || isDuplicateByID) {
            skippedProducts++
            continue
          }
          seenProductsInFile.add(productKey)
          if (dbIdKey) seenIdsInFile.add(dbIdKey)

          const subcategoryId =
            product.subcategoryName && categoryId
              ? subcategoryMap.get(
                  `${categoryId}|${product.subcategoryName.toLowerCase().trim()}`
                ) || null
              : null

          // combinableWith: se procesará exclusivamente en la Fase 2 para garantizar integridad referencial total

          // 1. Find by Name/Cat/Size (Key) - (Ya buscado arriba)

          // 2. Find by ID if provided - (Ya buscado arriba)

          let existingProduct

          if (matchedByID) {
            existingProduct = matchedByID
          } else if (matchedByKey) {
            existingProduct = matchedByKey
          }

          const isSkipMode =
            !args.conflictResolution || args.conflictResolution === "skip"
          const shouldOverwrite =
            args.conflictResolution === "overwrite" ||
            args.conflictResolution === "substitute"

          if (existingProduct) {
            if (isSkipMode) {
              processedProductIds.add(existingProduct._id.toString())
              importedRowToIdMap.set(product.rowNumber, existingProduct._id)
              skippedProducts++
              continue
            }

            if (shouldOverwrite) {
              const hasChanges = hasGenuineChanges(
                existingProduct,
                product,
                existingSubcategories,
                existingSizes
              )

              if (hasChanges) {
                await ctx.db.patch(existingProduct._id, {
                  name: product.name,
                  nameNormalized: normalizeSearchText(product.name),
                  description: product.description,
                  price: product.price,
                  standAlone: product.standAlone,
                  combinableHalf: product.combinableHalf,
                  minimumQuantity: product.minimumQuantity,
                  maximumQuantity: product.maximumQuantity,
                  externalCode: product.externalCode || undefined,
                  instructions: product.instructions || undefined,
                  imageUrl: product.imageUrl || undefined,
                  menuProductSubcategoryId:
                    (subcategoryId as Id<"menuProductSubcategories">) ||
                    undefined,
                })
              }

              // Optimize availability updates - only patch records that need changes
              const availabilityRecords = await ctx.db
                .query("menuProductAvailability")
                .withIndex("by_menu_product", (q) =>
                  q.eq("menuProductId", existingProduct!._id)
                )
                .collect()

              // Build set of locations that should be disabled
              const disabledLocationIds = new Set<string>()
              if (product.deshabilitarEn && product.deshabilitarEn.length > 0) {
                for (const locationCode of product.deshabilitarEn) {
                  const location = restaurantLocations.find(
                    (loc) =>
                      loc.code.toLowerCase().trim() ===
                      locationCode.toLowerCase().trim()
                  )
                  if (location) {
                    disabledLocationIds.add(location._id)
                  }
                }
              }

              // Patch only records that differ from target state
              for (const record of availabilityRecords) {
                const shouldBeDisabled = disabledLocationIds.has(
                  record.restaurantLocationId
                )
                const targetAvailability = !shouldBeDisabled

                if (record.available !== targetAvailability) {
                  await ctx.db.patch(record._id, {
                    available: targetAvailability,
                  })
                }
              }

              processedProductIds.add(existingProduct._id.toString())
              importedRowToIdMap.set(product.rowNumber, existingProduct._id)

              // In substitute mode, count all as "imported" for UX (avoid false alarms about skipped items)
              if (args.conflictResolution === "substitute") {
                importedProducts++
              } else if (hasChanges) {
                importedProducts++
              } else {
                skippedProducts++
              }
              continue
            }
          }

          const finalName = product.name

          const productId = await ctx.db.insert("menuProducts", {
            name: finalName,
            nameNormalized: normalizeSearchText(finalName),
            description: product.description,
            price: product.price,
            menuProductCategoryId: categoryId as Id<"menuProductCategories">,
            menuProductSubcategoryId:
              (subcategoryId as Id<"menuProductSubcategories">) || undefined,
            standAlone: product.standAlone,
            // combinableWith: se procesará en una segunda pasada para soportar referencias mutuas
            sizeId: (sizeId as Id<"sizes">) || undefined,
            combinableHalf: product.combinableHalf,
            minimumQuantity: product.minimumQuantity,
            maximumQuantity: product.maximumQuantity,
            externalCode: product.externalCode || undefined,
            instructions: product.instructions || undefined,
            imageUrl: product.imageUrl || undefined,
            // Componentes: ignorados por refactorización actual
            organizationId: args.organizationId,
          })
          const createdProduct = await ctx.db.get(productId)
          if (createdProduct) {
            await aggregateMenuProductsByOrganization.insertIfDoesNotExist(
              ctx,
              createdProduct
            )
          }

          processedProductIds.add(productId.toString())
          importedRowToIdMap.set(product.rowNumber, productId)
          await Promise.all(
            restaurantLocations.map((location) =>
              ctx.db.insert("menuProductAvailability", {
                menuProductId: productId,
                restaurantLocationId: location._id,
                available: true,
                organizationId: args.organizationId,
              })
            )
          )

          if (product.deshabilitarEn && product.deshabilitarEn.length > 0) {
            for (const locationCode of product.deshabilitarEn) {
              const location = restaurantLocations.find(
                (loc) =>
                  loc.code.toLowerCase().trim() ===
                  locationCode.toLowerCase().trim()
              )
              if (location) {
                const record = await ctx.db
                  .query("menuProductAvailability")
                  .withIndex("by_menu_and_location", (q) =>
                    q
                      .eq("menuProductId", productId)
                      .eq("restaurantLocationId", location._id)
                  )
                  .first()
                if (record) await ctx.db.patch(record._id, { available: false })
              }
            }
          }

          createdProductIds.push(productId)
          importedProducts++
        } catch (error) {
          errors.push(
            `Error al importar "${product.name}" (fila ${product.rowNumber}): ${error instanceof Error ? error.message : String(error)}`
          )
          skippedProducts++
        }
      }

      // PHASE: Deletion and global referential cleanup (only in substitute mode)
      if (args.conflictResolution === "substitute") {
        const productsToDelete = existingProducts.filter(
          (p) => !processedProductIds.has(p._id.toString())
        )
        const deletedIds = new Set(productsToDelete.map((p) => p._id))
        deletedProducts = productsToDelete.length

        if (productsToDelete.length > 0) {
          for (const p of productsToDelete) {
            const records = await ctx.db
              .query("menuProductAvailability")
              .withIndex("by_menu_product", (q) => q.eq("menuProductId", p._id))
              .collect()
            for (const r of records) await ctx.db.delete(r._id)
            await ctx.db.delete(p._id)
            await aggregateMenuProductsByOrganization.deleteIfExists(ctx, p)
          }

          // Global cleanup: remove references to deleted products in ALL remaining products of the organization
          const remainingProducts = await ctx.db
            .query("menuProducts")
            .withIndex("by_organization_id", (q) =>
              q.eq("organizationId", args.organizationId)
            )
            .collect()

          for (const p of remainingProducts) {
            if (!p.combinableWith) continue
            const cleaned = p.combinableWith.filter(
              (c) => !c.menuProductId || !deletedIds.has(c.menuProductId)
            )
            if (cleaned.length !== p.combinableWith.length) {
              await ctx.db.patch(p._id, { combinableWith: cleaned })
            }
          }
        }
      }

      // PHASE 2: Resolve and update relationships (combinableWith)
      // Now that all products exist (either patched or inserted), we can link them properly.
      const allProducts = await ctx.db
        .query("menuProducts")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      const seenInPhase2 = new Set<string>()
      for (const product of parsedData.products) {
        const productKey = `${product.name.toLowerCase().trim()}|${product.categoryName.toLowerCase().trim()}|${product.sizeName?.toLowerCase().trim() || ""}`

        // Use same deduplication logic as Phase 1
        const matchedByInternalID = product.dbId
          ? existingProducts.find((p) => p._id === product.dbId)
          : undefined
        const dbIdKey = matchedByInternalID ? `ID:${product.dbId}` : null

        const idOwnerRow = product.dbId
          ? idOwnershipMap.get(product.dbId)
          : undefined
        const isLegitOwner = idOwnerRow === product.rowNumber
        const hasLegitOwnerInFile = product.dbId
          ? idOwnershipMap.has(product.dbId)
          : false
        const isDuplicateByID =
          dbIdKey &&
          ((hasLegitOwnerInFile && !isLegitOwner) ||
            (!hasLegitOwnerInFile && seenInPhase2.has(dbIdKey)))

        if (seenInPhase2.has(productKey) || isDuplicateByID) continue
        seenInPhase2.add(productKey)
        if (dbIdKey) seenInPhase2.add(dbIdKey)

        const currentProductDbId = importedRowToIdMap.get(product.rowNumber)

        if (currentProductDbId) {
          const combinableWith: Array<CombinableWith> = []
          for (const combo of product.combinableWith) {
            const catId = categoryMap.get(
              combo.categoryName.toLowerCase().trim()
            )
            if (catId) {
              const combineWithEntry: CombinableWith = {
                menuProductCategoryId: catId as Id<"menuProductCategories">,
              }
              if (combo.productName) {
                const searchName = combo.productName.toLowerCase().trim()
                // Search in CSV first to handle renames accurately
                const csvMatch = parsedData.products.find(
                  (p) =>
                    p.name.toLowerCase().trim() === searchName &&
                    p.categoryName.toLowerCase().trim() ===
                      combo.categoryName.toLowerCase().trim()
                )
                const matchedId = csvMatch
                  ? importedRowToIdMap.get(csvMatch.rowNumber)
                  : null

                if (matchedId) {
                  combineWithEntry.menuProductId = matchedId
                } else {
                  // Fallback to DB search
                  const productMatch = allProducts.find(
                    (p) =>
                      p.name.toLowerCase().trim() === searchName &&
                      p.menuProductCategoryId === catId
                  )
                  if (productMatch) {
                    combineWithEntry.menuProductId = productMatch._id
                  }
                }
              }

              if (combo.sizeName) {
                const validSizeId = sizeMap.get(
                  combo.sizeName.toLowerCase().trim()
                )
                if (validSizeId)
                  combineWithEntry.sizeId = validSizeId as Id<"sizes">
              }
              combinableWith.push(combineWithEntry)
            }
          }

          // Phase 2 always updates combinableWith to match CSV state
          await ctx.db.patch(currentProductDbId, { combinableWith })
        }
      }

      return {
        success: errors.length === 0,
        importedProducts,
        skippedProducts,
        deletedProducts,
        errors,
        createdProductIds,
        createdCategories,
        createdSubcategories,
        createdSizes,
      }
    } catch (error) {
      console.error("Error in importMenuData:", error)
      return {
        success: false,
        importedProducts: 0,
        skippedProducts: 0,
        deletedProducts: 0,
        errors: [error instanceof Error ? error.message : "Error desconocido"],
        createdProductIds: [],
        createdCategories: [],
        createdSubcategories: [],
        createdSizes: [],
      }
    }
  },
})
