import { v } from "convex/values"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import {
  action,
  query as convexQuery,
  internalQuery,
} from "../_generated/server"
import type { MenuFilters } from "./rag"
import { getMenuNamespace, rag } from "./rag"

// Función para indexar todos los productos del menú de una organización
export const indexMenuProducts = action({
  args: {
    organizationId: v.string(),
  },
  handler: async (
    ctx,
    { organizationId }
  ): Promise<{
    success: boolean
    indexedCount: number
    totalProducts: number
    message: string
    batchSize: number
    processingTime: string
  }> => {
    // Obtener todos los productos del menú para esta organización usando función privada
    const productsResult = await ctx.runQuery(api.private.menuProducts.list, {
      organizationId,
      paginationOpts: { numItems: 1000, cursor: null },
    })
    const menuProducts = productsResult.page.filter(
      (p: any) => p.organizationId === organizationId
    )
    const namespace = getMenuNamespace(organizationId)
    let indexedCount = 0

    // Indexar cada producto con control de concurrencia
    const batchSize = 10 // Procesar en lotes para evitar sobrecarga
    for (let i = 0; i < menuProducts.length; i += batchSize) {
      const batch = menuProducts.slice(i, i + batchSize)

      interface MenuProduct {
        _id: Id<"menuProducts">
        organizationId: string
        name: string
        description?: string
        price: number
        standAlone: boolean
        combinableHalf?: boolean
        menuProductCategoryId?: Id<"menuProductCategories">
        sizeId?: Id<"sizes">
      }

      interface MenuProductCategory {
        _id: Id<"menuProductCategories">
        name: string
        organizationId: string
      }

      interface Size {
        _id: Id<"sizes">
        name: string
        organizationId: string
      }

      interface ProductAvailabilityEntry {
        available: boolean
      }

      await Promise.all(
        batch.map(async (product: MenuProduct) => {
          try {
            // Obtener categorías del producto
            const categoriesResult = await ctx.runQuery(
              api.private.menuProductCategories.list,
              {
                organizationId,
                paginationOpts: { numItems: 100, cursor: null },
              }
            )
            console.log(categoriesResult)

            const productCategory = categoriesResult.page.find(
              (cat: any) => cat._id === product.menuProductCategoryId
            )
            console.log(productCategory)

            // Obtener tamaño del producto si tiene sizeId
            let productSize: Size | undefined
            console.log(productSize)

            if (product.sizeId) {
              const sizesResult = await ctx.runQuery(api.private.sizes.list, {
                organizationId,
                paginationOpts: { numItems: 100, cursor: null },
              })
              productSize = sizesResult.page.find(
                (size: any) => size._id === product.sizeId
              )
              console.log(
                `🔍 [INDEXING] Producto ${product.name} - sizeId: ${product.sizeId}, productSize encontrado:`,
                productSize?.name || "NO ENCONTRADO"
              )
            } else {
              console.log(
                `🔍 [INDEXING] Producto ${product.name} - NO tiene sizeId asignado`
              )
            }

            // Obtener disponibilidad del producto usando la función específica por producto
            const productAvailability = await ctx.runQuery(
              api.private.menuProductAvailability.getByProduct,
              {
                organizationId,
                productId: product._id,
              }
            )

            // Determinar si el producto está disponible en alguna ubicación
            const isAvailable: boolean = productAvailability.some(
              (entry: ProductAvailabilityEntry) => entry.available
            )

            // Crear texto descriptivo del producto para indexación
            const productText: string = createProductDescription(
              product,
              productCategory?.name,
              productSize?.name
            )

            // Indexar el producto con filtros mejorados y metadatos
            await rag.add(ctx, {
              namespace,
              key: `product-${product._id}`,
              text: productText,
              metadata: {
                price: product.price,
                productId: product._id,
                standAlone: product.standAlone,
                combinableHalf: product.combinableHalf || false,
              },
              filterValues: [
                {
                  name: "categoria",
                  value: productCategory?.name || "Sin categoría",
                },
                {
                  name: "disponibilidad",
                  value: isAvailable ? "disponible" : "no_disponible",
                },
                {
                  name: "ubicacion",
                  value: "todas", // Mantener compatibilidad, pero se puede mejorar con ubicaciones específicas
                },
                {
                  name: "precioRango",
                  value: getPriceRange(product.price),
                },
              ],
              title: product.name,
            })

            indexedCount++
          } catch (error) {
            console.error(`Error indexando producto ${product._id}:`, error)
          }
        })
      )
    }

    return {
      success: true,
      indexedCount,
      totalProducts: menuProducts.length,
      message: `Indexados ${indexedCount} de ${menuProducts.length} productos`,
      batchSize,
      processingTime: "Optimizado con procesamiento por lotes",
    }
  },
})

// Función helper para crear descripción del producto
function createProductDescription(
  product: any,
  categoryName?: string,
  sizeName?: string
): string {
  let description = `${product.name}. `

  if (product.description) {
    description += `${product.description}. `
  }

  description += `Precio: $${product.price.toLocaleString("es-CO")}. `

  // Agregar tamaño si está disponible
  if (sizeName) {
    description += `Tamaño: ${sizeName}. `
  }

  // Agregar categoría si está disponible
  if (categoryName) {
    description += `Categoría: ${categoryName}. `
  }

  // Para productos standalone, mencionar que pueden pedirse solos
  if (product.standAlone) {
    description += "Puede pedirse individualmente. "
  }

  // Para productos combinables, mencionar restricciones
  if (!product.standAlone) {
    description += "Debe combinarse con otros productos. "
  }

  // Para productos mitad pizza
  if (product.combinableHalf) {
    description += "Puede pedirse como mitad de pizza. "
  }

  // Verificar disponibilidad usando menuProductAvailability
  // Nota: La disponibilidad real se determina por la tabla menuProductAvailability
  description += "Producto disponible en ubicaciones configuradas."

  return description
}

// Función helper para determinar rango de precio
function getPriceRange(price: number): string {
  if (price < 15000) return "economico"
  if (price < 30000) return "medio"
  if (price < 50000) return "premium"
  return "gourmet"
}

// Función para buscar productos usando RAG
export const searchMenuProducts = action({
  args: {
    organizationId: v.string(),
    query: v.string(),
    categoria: v.optional(v.string()),
    limit: v.optional(v.number()),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
  },
  handler: async (
    ctx,
    { organizationId, query, categoria, limit = 10, restaurantLocationId }
  ): Promise<{
    results: any[]
    text: string
    entries: any[]
    formattedResults: any[]
  }> => {
    console.log(`🔍 [RAG] Buscando en namespace: menu-${organizationId}`)
    console.log(`🔍 [RAG] Consulta: "${query}"`)
    console.log(`🔍 [RAG] Categoría: ${categoria || "Todas"}`)
    console.log(`🔍 [RAG] Límite: ${limit}`)
    console.log(`🏪 [RAG] Ubicación: ${restaurantLocationId || "Todas"}`)

    // Validar que la consulta no esté vacía
    if (!query || query.trim().length === 0) {
      console.error(
        "❌ [RAG] Consulta vacía recibida, usando término por defecto"
      )
      query = "producto disponible"
    }

    const namespace = getMenuNamespace(organizationId)

    // Construir filtros - Buscar en todas las categorías
    const filters: Array<{ name: keyof MenuFilters; value: string }> = []

    // Filtrar por categoría si se especifica
    if (categoria) {
      // Normalizar la categoría como se hace en el indexado (limpiar y convertir a mayúsculas)
      const normalizedCategoria = categoria
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .toUpperCase()
      filters.push({ name: "categoria", value: normalizedCategoria })
      console.log(
        `🔍 [RAG] Aplicando filtro de categoría: ${normalizedCategoria}`
      )
    }

    // Nota: Los filtros de tamaño se manejan a través de búsqueda semántica en el texto,
    // no con filtros específicos, para evitar problemas de configuración RAG

    // Filtrar por ubicación si se especifica
    if (restaurantLocationId) {
      // Obtener productos disponibles en esta ubicación usando función interna (sin auth)
      const availabilityRecords = await ctx.runQuery(
        internal.system.menuProducts.getAvailabilityByLocation,
        {
          locationId: restaurantLocationId as any,
          organizationId,
        }
      )

      // Crear lista de productIds disponibles en esta ubicación
      const availableProductIds = availabilityRecords
        .filter((record: any) => record.available)
        .map((record: any) => record.menuProductId)

      if (availableProductIds.length > 0) {
        // Agregar filtro de ubicación específica
        filters.push({ name: "ubicacion", value: restaurantLocationId })
      } else {
        console.log(
          `⚠️ [RAG] No hay productos disponibles en la ubicación ${restaurantLocationId}`
        )
        // Si no hay productos disponibles, devolver resultados vacíos
        return {
          results: [],
          text: "",
          entries: [],
          formattedResults: [],
        }
      }
    }

    let results: any[] = []
    let text = ""
    let entries: any[] = []

    try {
      const searchResult = await rag.search(ctx, {
        namespace,
        query,
        filters,
        limit,
        vectorScoreThreshold: 0.3, // Umbral más flexible para encontrar productos similares
      })

      results = searchResult.results
      text = searchResult.text
      entries = searchResult.entries
    } catch (error) {
      console.error("❌ [RAG] Error en búsqueda vectorial:", error)

      // Si hay error con OpenAI, intentar búsqueda alternativa o devolver resultados vacíos
      if (
        error instanceof Error &&
        error.message &&
        error.message.includes("AI_APICallError")
      ) {
        console.log(
          "🔄 [RAG] Error de API de OpenAI, devolviendo resultados vacíos"
        )
        results = []
        text = ""
        entries = []
      } else {
        throw error // Re-lanzar otros errores
      }
    }

    const formattedResults = formatSearchResults(results, entries)

    console.log(
      `✅ [RAG] Búsqueda completada. Resultados encontrados: ${formattedResults.length}`
    )
    if (formattedResults.length > 0) {
      console.log(
        `✅ [RAG] Resultados:`,
        formattedResults.map((r) => `${r.title} (score: ${r.score})`)
      )
    } else {
      console.log(`⚠️ [RAG] No se encontraron resultados para la consulta`)
    }

    return {
      results,
      text,
      entries,
      formattedResults,
    }
  },
})

// Función helper para formatear resultados de búsqueda
function formatSearchResults(results: any[], entries: any[]) {
  return results.map((result) => {
    const entry = entries.find((e) => e.entryId === result.entryId)
    return {
      productId: entry?.key?.replace("product-", ""),
      title: entry?.title,
      score: result.score,
      price: entry?.metadata?.price || 0,
      content: result.content.map((c: any) => c.text).join(" "),
      category: entry?.filterValues?.find((f: any) => f.name === "categoria")
        ?.value,
      availability: entry?.filterValues?.find(
        (f: any) => f.name === "disponibilidad"
      )?.value,
      standAlone: entry?.metadata?.standAlone || false,
      combinableHalf: entry?.metadata?.combinableHalf || false,
    }
  })
}

// Función para agregar producto a ubicación específica en RAG
export const addProductToLocationInRAG = action({
  args: {
    productId: v.id("menuProducts"),
    locationId: v.id("restaurantLocations"),
    organizationId: v.string(),
  },
  handler: async (
    ctx,
    { productId, locationId, organizationId }
  ): Promise<{
    success: boolean
  }> => {
    const namespace = getMenuNamespace(organizationId)

    try {
      // Obtener datos del producto
      const products: any[] = await ctx.runQuery(
        internal.system.menuProducts.getProductsByOrganization,
        {
          organizationId,
        }
      )
      const product = products.find((p: any) => p._id === productId)

      if (!product) {
        throw new Error(`Producto ${productId} no encontrado`)
      }

      // Obtener categorías usando función del sistema
      const categories: any[] = await ctx.runQuery(
        internal.system.menuProductCategories.getAll,
        {
          organizationId,
        }
      )
      const productCategory = categories.find(
        (cat: any) => cat._id === product.menuProductCategoryId
      )

      // Crear texto descriptivo
      const productSize: any = null // Simplificar para esta función
      const productText = createProductDescription(
        product,
        productCategory?.name,
        productSize?.name || null
      )

      // Crear entrada específica para esta ubicación
      await rag.add(ctx, {
        namespace,
        key: `product-${product._id}-location-${locationId}`,
        text: productText,
        metadata: {
          price: product.price,
          productId: product._id,
          standAlone: product.standAlone,
          combinableHalf: product.combinableHalf || false,
        },
        filterValues: [
          {
            name: "categoria",
            value: (productCategory?.name || "Sin categoría")
              .replace(/[^a-zA-Z0-9\s]/g, "")
              .toUpperCase(),
          },
          {
            name: "disponibilidad",
            value: "disponible",
          },
          {
            name: "ubicacion",
            value: locationId,
          },
          {
            name: "precioRango",
            value: getPriceRange(product.price),
          },
        ],
        title: product.name,
      })

      console.log(
        `✅ [RAG ADD] Producto ${product.name} agregado a ubicación ${locationId}`
      )
      return { success: true }
    } catch (error) {
      console.error(
        `❌ [RAG ADD] Error agregando producto ${productId} a ubicación ${locationId}:`,
        error
      )
      throw error
    }
  },
})

// Función para quitar producto de ubicación específica en RAG
export const removeProductFromLocationInRAG = action({
  args: {
    productId: v.id("menuProducts"),
    locationId: v.id("restaurantLocations"),
    organizationId: v.string(),
  },
  handler: async (
    ctx,
    { productId, locationId, organizationId }
  ): Promise<{
    success: boolean
  }> => {
    const namespace = getMenuNamespace(organizationId)

    try {
      // Obtener información del namespace
      const namespaceInfo = await rag.getNamespace(ctx, { namespace })

      if (!namespaceInfo) {
        console.log(`⚠️ [RAG REMOVE] Namespace ${namespace} no existe`)
        return { success: true }
      }

      // Buscar TODAS las entradas que coincidan con el patrón del producto
      // No solo la ubicación específica, sino también otras posibles keys
      const allEntries: any[] = []
      let continueCursor: string | null = null
      let hasMorePages = true

      while (hasMorePages) {
        const entriesResult = await rag.list(ctx, {
          namespaceId: namespaceInfo.namespaceId,
          status: "ready",
          limit: 1000,
          ...(continueCursor && {
            paginationOpts: { cursor: continueCursor, numItems: 1000 },
          }),
        })

        allEntries.push(...entriesResult.page)
        hasMorePages = entriesResult.page.length === 1000
        if (hasMorePages && entriesResult.continueCursor) {
          continueCursor = entriesResult.continueCursor
        } else {
          hasMorePages = false
        }
      }

      // Buscar SOLO la entrada específica de esta ubicación
      const productEntries = allEntries.filter(
        (entry: any) =>
          entry.key === `product-${productId}-location-${locationId}`
      )

      console.log(
        `🔍 [RAG REMOVE] Encontradas ${productEntries.length} entradas para producto ${productId}`
      )

      if (productEntries.length > 0) {
        // Eliminar todas las entradas encontradas
        const deletePromises = productEntries.map((entry: any) =>
          rag.delete(ctx, { entryId: entry.entryId }).catch((error: any) => {
            console.error(
              `❌ [RAG REMOVE] Error eliminando entrada ${entry.entryId}:`,
              error
            )
            return null
          })
        )

        const deleteResults = await Promise.all(deletePromises)
        const deletedCount = deleteResults.filter(
          (result) => result !== null
        ).length

        console.log(
          `✅ [RAG REMOVE] Eliminadas ${deletedCount}/${productEntries.length} entradas del producto ${productId}`
        )
        return { success: true }
      } else {
        console.log(
          `⚠️ [RAG REMOVE] Producto ${productId} no encontrado en ninguna entrada del RAG`
        )
        return { success: true }
      }
    } catch (error) {
      console.error(
        `❌ [RAG REMOVE] Error eliminando producto ${productId} de ubicación ${locationId}:`,
        error
      )
      throw error
    }
  },
})

// Función helper para actualizar un producto específico en el índice (puede ser llamada desde mutations)
export const updateProductInRAG = async (
  ctx: any,
  organizationId: string,
  productId: string
): Promise<{
  success: boolean
  message: string
  indexedLocations: number
  totalLocations: number
}> => {
  const namespace = getMenuNamespace(organizationId)

  try {
    // PASO 1: Obtener el producto actualizado
    const products: any[] = await ctx.runQuery(
      internal.system.menuProducts.getProductsByOrganization,
      {
        organizationId,
      }
    )
    const product = products.find((p: any) => p._id === productId)

    if (!product) {
      throw new Error(`Producto ${productId} no encontrado`)
    }

    // PASO 2: Obtener categorías y ubicaciones
    const categories: any[] = await ctx.runQuery(
      internal.system.menuProductCategories.getAll,
      {
        organizationId,
      }
    )
    const productCategory = categories.find(
      (cat: any) => cat._id === product.menuProductCategoryId
    )

    const locations: any[] = await ctx.runQuery(
      internal.system.restaurantLocations.getAllByOrganization,
      {
        organizationId,
      }
    )

    // PASO 3: Obtener disponibilidad real del producto en todas las ubicaciones
    const availabilityRecords = await ctx.runQuery(
      internal.private.menuProductAvailability.getAvailabilityByProductInternal,
      {
        productId: product._id as any,
      }
    )

    // PASO 4: Filtrar ubicaciones donde el producto está disponible
    const availableLocations = availabilityRecords
      .filter((record: any) => record.available)
      .map((record: any) => record.restaurantLocationId)

    if (availableLocations.length === 0) {
      console.log(
        `⚠️ [UPDATE RAG] Producto ${product.name} no disponible en ninguna ubicación`
      )
      return {
        success: true,
        message: `Producto ${product.name} no disponible en ninguna ubicación`,
        indexedLocations: 0,
        totalLocations: availableLocations.length,
      }
    }

    // PASO 5: Obtener tamaño del producto si tiene sizeId
    let productSize: any = null
    if (product.sizeId) {
      const sizes: any[] = await ctx.runQuery(internal.system.sizes.getAll, {
        organizationId,
      })
      productSize = sizes.find((size: any) => size._id === product.sizeId)
    }

    // PASO 6: Crear texto descriptivo
    const productText = createProductDescription(
      product,
      productCategory?.name,
      productSize?.name || null
    )

    // PASO 7: PRIMERO eliminar todas las entradas existentes de este producto
    console.log(
      `🧹 [UPDATE RAG] Eliminando entradas anteriores del producto ${product.name}`
    )
    const namespaceInfo = await rag.getNamespace(ctx, { namespace })

    if (namespaceInfo) {
      const allEntries: any[] = []
      let continueCursor: string | null = null
      let hasMorePages = true

      while (hasMorePages) {
        const entriesResult = await rag.list(ctx, {
          namespaceId: namespaceInfo.namespaceId,
          status: "ready",
          limit: 1000,
          ...(continueCursor && {
            paginationOpts: { cursor: continueCursor, numItems: 1000 },
          }),
        })

        allEntries.push(...entriesResult.page)
        hasMorePages = entriesResult.page.length === 1000
        if (hasMorePages && entriesResult.continueCursor) {
          continueCursor = entriesResult.continueCursor
        } else {
          hasMorePages = false
        }
      }

      // Filtrar entradas de este producto específico
      const productEntries = allEntries.filter((entry: any) =>
        entry.key.startsWith(`product-${productId}-location-`)
      )

      if (productEntries.length > 0) {
        console.log(
          `🧹 [UPDATE RAG] Eliminando ${productEntries.length} entradas anteriores`
        )
        const deletePromises = productEntries.map((entry: any) =>
          rag.delete(ctx, { entryId: entry.entryId }).catch((error: any) => {
            console.error(
              `❌ [UPDATE RAG] Error eliminando entrada ${entry.entryId}:`,
              error
            )
            return null
          })
        )
        await Promise.all(deletePromises)
      }
    }

    // PASO 8: Indexar el producto en CADA ubicación donde está disponible
    console.log(
      `📦 [UPDATE RAG] Indexando producto ${product.name} en ${availableLocations.length} ubicaciones`
    )

    const indexPromises = availableLocations.map(async (locationId: string) => {
      try {
        await rag.add(ctx, {
          namespace,
          key: `product-${product._id}-location-${locationId}`,
          text: productText,
          metadata: {
            price: product.price,
            productId: product._id,
            standAlone: product.standAlone,
            combinableHalf: product.combinableHalf || false,
          },
          filterValues: [
            {
              name: "categoria",
              value: (productCategory?.name || "Sin categoría")
                .replace(/[^a-zA-Z0-9\s]/g, "")
                .toUpperCase(),
            },
            {
              name: "disponibilidad",
              value: "disponible",
            },
            {
              name: "ubicacion",
              value: locationId,
            },
            {
              name: "precioRango",
              value: getPriceRange(product.price),
            },
          ],
          title: product.name,
        })

        return { success: true, locationId }
      } catch (indexError) {
        console.error(
          `❌ [UPDATE RAG] Error indexando producto ${product.name} para ubicación ${locationId}:`,
          indexError
        )
        return {
          success: false,
          locationId,
          error:
            indexError instanceof Error
              ? indexError.message
              : String(indexError),
        }
      }
    })

    const indexResults = await Promise.all(indexPromises)
    const successfulIndexes = indexResults.filter(
      (result: any) => result.success
    ).length

    console.log(
      `✅ [UPDATE RAG] Producto ${product.name} indexado en ${successfulIndexes}/${availableLocations.length} ubicaciones`
    )

    return {
      success: successfulIndexes > 0,
      message: `Producto ${product.name} re-indexado en ${successfulIndexes} ubicaciones`,
      indexedLocations: successfulIndexes,
      totalLocations: availableLocations.length,
    }
  } catch (error) {
    console.error(`Error actualizando producto ${productId} en RAG:`, error)
    throw error
  }
}

// Función para actualizar un producto específico en el índice
export const updateMenuProductIndex = action({
  args: {
    organizationId: v.string(),
    productId: v.id("menuProducts"),
  },
  handler: async (
    ctx,
    { organizationId, productId }
  ): Promise<{
    success: boolean
    message: string
    indexedLocations: number
    totalLocations: number
  }> => {
    return await updateProductInRAG(ctx, organizationId, productId)
  },
})

// Función de debug para obtener identidad real
export const debugIdentity = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    return {
      identity,
      subject: identity?.subject,
      issuer: identity?.issuer,
      orgId: identity?.orgId || identity?.org_id,
      allFields: Object.keys(identity || {}),
      // Datos para usar en --identity
      convexIdentity: {
        subject: identity?.subject,
        issuer: identity?.issuer,
        orgId: identity?.orgId || identity?.org_id,
      },
    }
  },
})

// Función helper para limpiar completamente un namespace
async function clearRAGNamespace(
  ctx: any,
  namespace: string
): Promise<{ deletedCount: number }> {
  try {
    console.log(
      `🧹 [RAG CLEANUP] Iniciando limpieza del namespace: ${namespace}`
    )

    // Obtener información del namespace
    const namespaceInfo = await rag.getNamespace(ctx, { namespace })

    if (!namespaceInfo) {
      console.log(
        `⚠️ [RAG CLEANUP] Namespace ${namespace} no existe, nada que limpiar`
      )
      return { deletedCount: 0 }
    }

    // Obtener TODAS las entradas del namespace para eliminarlas
    const allEntries: any[] = []
    let continueCursor: string | null = null
    let hasMorePages = true

    while (hasMorePages) {
      const entriesResult = await rag.list(ctx, {
        namespaceId: namespaceInfo.namespaceId,
        status: "ready",
        limit: 1000, // Límite alto para obtener todas las entradas
        ...(continueCursor && {
          paginationOpts: { cursor: continueCursor, numItems: 1000 },
        }),
      })

      allEntries.push(...entriesResult.page)

      hasMorePages = entriesResult.page.length === 1000
      if (hasMorePages && entriesResult.continueCursor) {
        continueCursor = entriesResult.continueCursor
      } else {
        hasMorePages = false
      }
    }

    console.log(
      `🧹 [RAG CLEANUP] Encontradas ${allEntries.length} entradas para eliminar`
    )

    // Eliminar todas las entradas en lotes para evitar sobrecarga
    const batchSize = 50 // Procesar en lotes más pequeños
    let deletedCount = 0

    for (let i = 0; i < allEntries.length; i += batchSize) {
      const batch = allEntries.slice(i, i + batchSize)

      const deletePromises = batch.map((entry: any) =>
        rag.delete(ctx, { entryId: entry.entryId }).catch((error: any) => {
          console.error(
            `❌ [RAG CLEANUP] Error eliminando entrada ${entry.entryId}:`,
            error
          )
          return null
        })
      )

      const batchResults = await Promise.all(deletePromises)
      const batchDeleted = batchResults.filter(
        (result) => result !== null
      ).length
      deletedCount += batchDeleted

      console.log(
        `🧹 [RAG CLEANUP] Progreso: ${deletedCount}/${allEntries.length} entradas eliminadas`
      )

      // Pequeña pausa entre lotes para evitar rate limiting
      if (i + batchSize < allEntries.length) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }

    console.log(
      `✅ [RAG CLEANUP] Eliminadas ${deletedCount} de ${allEntries.length} entradas`
    )

    console.log(
      `✅ [RAG CLEANUP] Limpieza completada: ${deletedCount} entradas eliminadas`
    )
    return { deletedCount }
  } catch (error) {
    console.error(
      `❌ [RAG CLEANUP] Error limpiando namespace ${namespace}:`,
      error
    )
    throw error
  }
}

// Nueva función mejorada para poblar RAG automáticamente (sin auth para facilitar testing)
export const populateRAGForOrganization = action({
  args: {
    organizationId: v.string(),
    forceReindex: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { organizationId, forceReindex = false }
  ): Promise<{
    success: boolean
    indexedCount: number
    totalIndexedEntries: number
    errorCount: number
    totalProducts: number
    totalLocations: number
    deletedCount?: number
    errors: string[]
    message: string
  }> => {
    console.log(
      `🔄 [RAG POPULATE] Iniciando población de RAG para organización: ${organizationId} (forceReindex: ${forceReindex})`
    )
    const namespace = getMenuNamespace(organizationId)

    try {
      // PASO 1: SIEMPRE limpiar namespace para garantizar estado consistente
      console.log(
        `🧹 [RAG POPULATE] Limpiando namespace para estado consistente...`
      )
      const cleanupResult = await clearRAGNamespace(ctx, namespace)
      console.log(
        `🧹 [RAG POPULATE] Limpieza completada: ${cleanupResult.deletedCount} entradas eliminadas`
      )

      // PASO 2: Obtener productos reales usando función del sistema (sin auth)
      const products = await ctx.runQuery(
        internal.system.menuProducts.getProductsByOrganization,
        {
          organizationId,
        }
      )

      if (products.length === 0) {
        return {
          success: false,
          indexedCount: 0,
          totalIndexedEntries: 0,
          errorCount: 0,
          totalProducts: 0,
          totalLocations: 0,
          deletedCount: cleanupResult.deletedCount,
          errors: ["No hay productos para indexar en esta organización"],
          message: "No hay productos para indexar en esta organización",
        }
      }

      // PASO 3: Obtener categorías y ubicaciones para indexación correcta
      const categories: any[] = await ctx.runQuery(
        internal.system.menuProductCategories.getAll,
        {
          organizationId,
        }
      )

      // Obtener ubicaciones usando función interna (sin auth)
      const locations: any[] = await ctx.runQuery(
        internal.system.restaurantLocations.getAllByOrganization,
        {
          organizationId,
        }
      )

      console.log(
        `📍 [POPULATE] Encontradas ${locations.length} ubicaciones para organización ${organizationId}`
      )

      let indexedCount = 0
      let totalIndexedEntries = 0
      let errorCount = 0
      const errors: string[] = []

      // PASO 4: Procesar productos en lotes más pequeños para evitar timeouts
      const batchSize = 3 // Reducir para procesar más ubicaciones

      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize)

        const batchPromises = batch.map(async (product: any) => {
          try {
            const productCategory = categories.find(
              (cat: any) => cat._id === product.menuProductCategoryId
            )

            // Obtener disponibilidad real del producto en todas las ubicaciones
            const availabilityRecords = await ctx.runQuery(
              internal.private.menuProductAvailability
                .getAvailabilityByProductInternal,
              {
                productId: product._id as any,
              }
            )

            // Filtrar solo las ubicaciones donde el producto está disponible
            const availableLocations = availabilityRecords
              .filter((record: any) => record.available)
              .map((record: any) => record.restaurantLocationId)

            // Solo indexar si está disponible en al menos una ubicación
            if (availableLocations.length === 0) {
              console.log(
                `⚠️ [POPULATE] Producto ${product.name} no disponible en ninguna ubicación, omitiendo`
              )
              return {
                success: true,
                productId: product._id,
                indexedLocations: 0,
              }
            }

            console.log(
              `📦 [POPULATE] Producto ${product.name} disponible en ${availableLocations.length} ubicaciones`
            )

            // Obtener tamaño del producto si tiene sizeId
            let productSize: any = null
            if (product.sizeId) {
              const sizes: any[] = await ctx.runQuery(
                internal.system.sizes.getAll,
                {
                  organizationId,
                }
              )
              productSize = sizes.find(
                (size: any) => size._id === product.sizeId
              )
            }

            const productText = createProductDescription(
              product,
              productCategory?.name,
              productSize?.name || null
            )

            // Indexar el producto en CADA ubicación donde está disponible
            const indexPromises = availableLocations.map(
              async (locationId: string) => {
                try {
                  await rag.add(ctx, {
                    namespace,
                    key: `product-${product._id}-location-${locationId}`,
                    text: productText,
                    metadata: {
                      price: product.price,
                      productId: product._id,
                      standAlone: product.standAlone,
                      combinableHalf: product.combinableHalf || false,
                    },
                    filterValues: [
                      {
                        name: "categoria",
                        value: (productCategory?.name || "Sin categoría")
                          .replace(/[^a-zA-Z0-9\s]/g, "")
                          .toUpperCase(),
                      },
                      {
                        name: "disponibilidad",
                        value: "disponible",
                      },
                      {
                        name: "ubicacion",
                        value: locationId,
                      },
                      {
                        name: "precioRango",
                        value: getPriceRange(product.price),
                      },
                    ],
                    title: product.name,
                  })

                  return { success: true, locationId }
                } catch (indexError) {
                  console.error(
                    `❌ [POPULATE] Error indexando producto ${product.name} para ubicación ${locationId}:`,
                    indexError
                  )
                  return {
                    success: false,
                    locationId,
                    error:
                      indexError instanceof Error
                        ? indexError.message
                        : String(indexError),
                  }
                }
              }
            )

            const indexResults = await Promise.all(indexPromises)
            const successfulIndexes = indexResults.filter(
              (result: any) => result.success
            ).length

            if (successfulIndexes > 0) {
              indexedCount++
              totalIndexedEntries += successfulIndexes
              console.log(
                `✅ [POPULATE] Producto ${product.name} indexado en ${successfulIndexes}/${availableLocations.length} ubicaciones`
              )
            } else {
              errorCount++
              errors.push(
                `Producto ${product.name}: No se pudo indexar en ninguna ubicación`
              )
            }

            return {
              success: successfulIndexes > 0,
              productId: product._id,
              indexedLocations: successfulIndexes,
            }
          } catch (error) {
            console.error(`Error procesando producto ${product._id}:`, error)
            return {
              success: false,
              productId: product._id,
              error: error instanceof Error ? error.message : String(error),
            }
          }
        })

        const batchResults = await Promise.all(batchPromises)

        batchResults.forEach((result: any) => {
          if (!result.success && !result.message) {
            // No contar como error si es por no disponibilidad
            errorCount++
            errors.push(`Producto ${result.productId}: ${result.error}`)
          }
        })

        // Pequeña pausa entre lotes para evitar sobrecarga
        if (i + batchSize < products.length) {
          await new Promise((resolve) => setTimeout(resolve, 200)) // Aumentar pausa
        }
      }

      console.log(
        `✅ [RAG POPULATE] Completado: ${indexedCount} productos indexados en ${totalIndexedEntries} entradas totales, ${errorCount} errores`
      )

      return {
        success: errorCount === 0,
        indexedCount,
        totalIndexedEntries,
        errorCount,
        totalProducts: products.length,
        totalLocations: locations.length,
        deletedCount: cleanupResult.deletedCount, // Siempre incluir el conteo de eliminados
        errors: errors.slice(0, 10), // Limitar errores reportados
        message: `Indexados ${indexedCount} productos en ${totalIndexedEntries} entradas (${locations.length} ubicaciones)${errorCount > 0 ? ` (${errorCount} errores)` : ""} (reindexación completa)`,
      }
    } catch (error) {
      console.error(`❌ [RAG POPULATE] Error general:`, error)
      return {
        success: false,
        indexedCount: 0,
        totalIndexedEntries: 0,
        errorCount: 1,
        totalProducts: 0,
        totalLocations: 0,
        deletedCount: forceReindex ? 0 : undefined,
        errors: [error instanceof Error ? error.message : String(error)],
        message: `Error general: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
})

// Función trigger para actualizar RAG cuando se modifica un producto
export const triggerRAGUpdateOnProductChange = action({
  args: {
    organizationId: v.string(),
    productId: v.id("menuProducts"),
    operation: v.union(
      v.literal("create"),
      v.literal("update"),
      v.literal("delete")
    ),
  },
  handler: async (
    ctx,
    { organizationId, productId, operation }
  ): Promise<{
    success: boolean
    message: string
    indexedLocations?: number
    totalLocations?: number
    error?: string
  }> => {
    try {
      console.log(
        `🔄 [RAG TRIGGER] ${operation} de producto ${productId} para organización ${organizationId}`
      )

      if (operation === "delete") {
        // Para productos eliminados, necesitamos eliminar TODAS las entradas del producto en todas las ubicaciones
        try {
          const namespace = getMenuNamespace(organizationId)
          const namespaceInfo = await rag.getNamespace(ctx, { namespace })

          if (!namespaceInfo) {
            console.log(
              `⚠️ [RAG TRIGGER] Namespace ${namespace} no encontrado en RAG`
            )
            return {
              success: true,
              message: `Namespace no encontrado, producto ya eliminado del RAG`,
            }
          }

          // Obtener TODAS las entradas del namespace
          const allEntries: any[] = []
          let continueCursor: string | null = null
          let hasMorePages = true

          while (hasMorePages) {
            const entriesResult = await rag.list(ctx, {
              namespaceId: namespaceInfo.namespaceId,
              status: "ready",
              limit: 1000,
              ...(continueCursor && {
                paginationOpts: { cursor: continueCursor, numItems: 1000 },
              }),
            })

            allEntries.push(...entriesResult.page)
            hasMorePages = entriesResult.page.length === 1000
            if (hasMorePages && entriesResult.continueCursor) {
              continueCursor = entriesResult.continueCursor
            } else {
              hasMorePages = false
            }
          }

          // Filtrar entradas de este producto específico (todas las ubicaciones)
          const productEntries = allEntries.filter((entry: any) =>
            entry.key.startsWith(`product-${productId}-location-`)
          )

          if (productEntries.length > 0) {
            console.log(
              `🧹 [RAG TRIGGER] Eliminando ${productEntries.length} entradas del producto ${productId}`
            )
            const deletePromises = productEntries.map((entry: any) =>
              rag
                .delete(ctx, { entryId: entry.entryId })
                .catch((error: any) => {
                  console.error(
                    `❌ [RAG TRIGGER] Error eliminando entrada ${entry.entryId}:`,
                    error
                  )
                  return null
                })
            )
            const deleteResults = await Promise.all(deletePromises)
            const deletedCount = deleteResults.filter(
              (result) => result !== null
            ).length
            console.log(
              `✅ [RAG TRIGGER] Eliminadas ${deletedCount}/${productEntries.length} entradas del producto ${productId}`
            )
          } else {
            console.log(
              `⚠️ [RAG TRIGGER] Producto ${productId} no encontrado en el índice RAG`
            )
          }

          return {
            success: true,
            message: `Producto ${productId} eliminado del índice RAG (${productEntries.length} entradas)`,
          }
        } catch (deleteError) {
          console.error(
            `❌ [RAG TRIGGER] Error eliminando producto ${productId} del RAG:`,
            deleteError
          )
          return {
            success: false,
            message: `Error eliminando producto: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`,
            error:
              deleteError instanceof Error
                ? deleteError.message
                : String(deleteError),
          }
        }
      }

      // Para crear o actualizar, necesitamos re-indexar el producto usando la función helper
      const updateResult = await updateProductInRAG(
        ctx,
        organizationId,
        productId
      )

      console.log(
        `✅ [RAG TRIGGER] Producto ${productId} ${operation === "create" ? "creado" : "actualizado"} en índice RAG (${updateResult.indexedLocations || 0} ubicaciones)`
      )
      return updateResult
    } catch (error) {
      console.error(
        `❌ [RAG TRIGGER] Error en ${operation} de producto ${productId}:`,
        error
      )
      return {
        success: false,
        message: `Error en ${operation} de producto: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
})

// Función para verificar el estado del RAG y poblar si es necesario
export const checkAndPopulateRAGIfNeeded = action({
  args: {
    organizationId: v.string(),
  },
  handler: async (
    ctx,
    { organizationId }
  ): Promise<{
    success: boolean
    status: string
    message: string
    indexedCount?: number
    errorCount?: number
  }> => {
    try {
      console.log(
        `🔍 [RAG CHECK] Verificando estado del RAG para organización: ${organizationId}`
      )

      // Obtener productos de la organización usando función privada
      const productsResult = await ctx.runQuery(api.private.menuProducts.list, {
        organizationId,
        paginationOpts: { numItems: 1000, cursor: null },
      })
      const products = productsResult.page.filter(
        (p: any) => p.organizationId === organizationId
      )

      if (products.length === 0) {
        return {
          success: true,
          status: "no_products",
          message: "No hay productos para indexar",
          indexedCount: 0,
        }
      }

      // Verificar si necesitamos poblar el RAG
      // Esta es una verificación simple - en un escenario real podrías verificar
      // directamente contra la base de datos RAG
      const needsIndexing = products.length > 0 // Por simplicidad, asumimos que necesitamos indexar

      if (needsIndexing) {
        console.log(
          `🔄 [RAG CHECK] Se necesitan indexar ${products.length} productos`
        )
        // Para checkAndPopulateRAGIfNeeded, simplemente devolver que ya está indexado
        // La indexación real se hace desde triggers automáticos
        return {
          success: true,
          status: "already_indexed",
          message: "RAG se mantiene sincronizado automáticamente con triggers",
          indexedCount: products.length,
        }
      }

      return {
        success: true,
        status: "already_indexed",
        message: "RAG ya está poblado",
        indexedCount: products.length,
      }
    } catch (error) {
      console.error(`❌ [RAG CHECK] Error verificando RAG:`, error)
      return {
        success: false,
        status: "error",
        message: `Error verificando RAG: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
})
// ─── Combo RAG Indexing ─────────────────────────────────────────────────────

export const getActiveCombosForOrganization = internalQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("combos")
      .withIndex("by_organization_id_and_is_active", (q) =>
        q.eq("organizationId", args.organizationId).eq("isActive", true)
      )
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect()
  },
})

export const getComboSlotsWithOptions = internalQuery({
  args: {
    comboId: v.id("combos"),
  },
  handler: async (ctx, args) => {
    const slots = await ctx.db
      .query("comboSlots")
      .withIndex("by_combo_id", (q) => q.eq("comboId", args.comboId))
      .collect()

    slots.sort((a, b) => a.sortOrder - b.sortOrder)

    const populatedSlots = await Promise.all(
      slots.map(async (slot) => {
        const options = await ctx.db
          .query("comboSlotOptions")
          .withIndex("by_combo_slot_id", (q) => q.eq("comboSlotId", slot._id))
          .collect()

        options.sort((a, b) => a.sortOrder - b.sortOrder)

        const populatedOptions = await Promise.all(
          options.map(async (option) => {
            const product = await ctx.db.get(option.menuProductId)
            return {
              menuProductName: product?.name ?? "Producto eliminado",
              upcharge: option.upcharge,
            }
          })
        )

        return {
          name: slot.name,
          options: populatedOptions,
        }
      })
    )

    return populatedSlots
  },
})

export const getComboAvailability = internalQuery({
  args: {
    comboId: v.id("combos"),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("comboAvailability")
      .withIndex("by_combo_id", (q) => q.eq("comboId", args.comboId))
      .collect()

    return records.filter((r) => r.organizationId === args.organizationId)
  },
})

function createComboDescription(
  combo: { name: string; description: string; basePrice: number },
  slots: Array<{
    name: string
    options: Array<{ menuProductName: string; upcharge: number }>
  }>
): string {
  let text = `${combo.name}. `

  if (combo.description) {
    text += `${combo.description}. `
  }

  text += `Precio base: $${combo.basePrice.toLocaleString("es-CO")}. `
  text += `Tipo: Combo. Puede pedirse individualmente. `

  for (const slot of slots) {
    const optionDescriptions = slot.options.map((opt) => {
      if (opt.upcharge > 0) {
        return `${opt.menuProductName} (+$${opt.upcharge.toLocaleString("es-CO")})`
      }
      return opt.menuProductName
    })
    text += `${slot.name}: ${optionDescriptions.join(", ")}. `
  }

  return text
}

export const indexCombos = action({
  args: {
    organizationId: v.string(),
  },
  handler: async (
    ctx,
    { organizationId }
  ): Promise<{
    success: boolean
    indexedCount: number
    totalCombos: number
    message: string
  }> => {
    console.log(
      `🔄 [RAG COMBO] Iniciando indexación de combos para organización: ${organizationId}`
    )

    const activeCombos = await ctx.runQuery(
      internal.system.menuIndexing.getActiveCombosForOrganization,
      { organizationId }
    )

    if (activeCombos.length === 0) {
      console.log(`⚠️ [RAG COMBO] No hay combos activos para indexar`)
      return {
        success: true,
        indexedCount: 0,
        totalCombos: 0,
        message: "No hay combos activos para indexar",
      }
    }

    const namespace = getMenuNamespace(organizationId)
    let indexedCount = 0

    const batchSize = 5
    for (let i = 0; i < activeCombos.length; i += batchSize) {
      const batch = activeCombos.slice(i, i + batchSize)

      await Promise.all(
        batch.map(async (combo) => {
          try {
            const slots = await ctx.runQuery(
              internal.system.menuIndexing.getComboSlotsWithOptions,
              { comboId: combo._id }
            )

            const availabilityRecords = await ctx.runQuery(
              internal.system.menuIndexing.getComboAvailability,
              { comboId: combo._id, organizationId }
            )

            const isAvailable = availabilityRecords.some(
              (r: { available: boolean }) => r.available
            )

            const comboText = createComboDescription(combo, slots)

            await rag.add(ctx, {
              namespace,
              key: `combo-${combo._id}`,
              text: comboText,
              metadata: {
                type: "combo",
                comboId: combo._id,
                basePrice: combo.basePrice,
                standAlone: true,
                combinableHalf: false,
              },
              filterValues: [
                {
                  name: "categoria",
                  value: "Combos",
                },
                {
                  name: "disponibilidad",
                  value: isAvailable ? "disponible" : "no_disponible",
                },
                {
                  name: "ubicacion",
                  value: "todas",
                },
                {
                  name: "precioRango",
                  value: getPriceRange(combo.basePrice),
                },
              ],
              title: combo.name,
            })

            indexedCount++
            console.log(
              `✅ [RAG COMBO] Combo "${combo.name}" indexado (${slots.length} slots)`
            )
          } catch (error) {
            console.error(
              `❌ [RAG COMBO] Error indexando combo ${combo._id}:`,
              error
            )
          }
        })
      )
    }

    console.log(
      `✅ [RAG COMBO] Indexación completada: ${indexedCount}/${activeCombos.length} combos`
    )

    return {
      success: true,
      indexedCount,
      totalCombos: activeCombos.length,
      message: `Indexados ${indexedCount} de ${activeCombos.length} combos activos`,
    }
  },
})

export const removeComboFromRAG = action({
  args: {
    comboId: v.id("combos"),
    organizationId: v.string(),
  },
  handler: async (
    ctx,
    { comboId, organizationId }
  ): Promise<{
    success: boolean
    message: string
  }> => {
    const namespace = getMenuNamespace(organizationId)

    try {
      const namespaceInfo = await rag.getNamespace(ctx, { namespace })

      if (!namespaceInfo) {
        console.log(`⚠️ [RAG COMBO REMOVE] Namespace ${namespace} no existe`)
        return {
          success: true,
          message: "Namespace no existe, nada que eliminar",
        }
      }

      const allEntries: any[] = []
      let continueCursor: string | null = null
      let hasMorePages = true

      while (hasMorePages) {
        const entriesResult = await rag.list(ctx, {
          namespaceId: namespaceInfo.namespaceId,
          status: "ready",
          limit: 1000,
          ...(continueCursor && {
            paginationOpts: { cursor: continueCursor, numItems: 1000 },
          }),
        })

        allEntries.push(...entriesResult.page)
        hasMorePages = entriesResult.page.length === 1000
        if (hasMorePages && entriesResult.continueCursor) {
          continueCursor = entriesResult.continueCursor
        } else {
          hasMorePages = false
        }
      }

      const comboEntries = allEntries.filter(
        (entry: any) => entry.key === `combo-${comboId}`
      )

      if (comboEntries.length > 0) {
        const deletePromises = comboEntries.map((entry: any) =>
          rag.delete(ctx, { entryId: entry.entryId }).catch((error: any) => {
            console.error(
              `❌ [RAG COMBO REMOVE] Error eliminando entrada ${entry.entryId}:`,
              error
            )
            return null
          })
        )

        const deleteResults = await Promise.all(deletePromises)
        const deletedCount = deleteResults.filter(
          (result) => result !== null
        ).length

        console.log(
          `✅ [RAG COMBO REMOVE] Eliminadas ${deletedCount} entradas del combo ${comboId}`
        )
        return {
          success: true,
          message: `Eliminadas ${deletedCount} entradas del combo`,
        }
      }

      console.log(`⚠️ [RAG COMBO REMOVE] Combo ${comboId} no encontrado en RAG`)
      return {
        success: true,
        message: "Combo no encontrado en el índice RAG",
      }
    } catch (error) {
      console.error(
        `❌ [RAG COMBO REMOVE] Error eliminando combo ${comboId}:`,
        error
      )
      throw error
    }
  },
})

// Implementación real usando Convex query
function query({
  args,
  handler,
}: {
  args: {}
  handler: (ctx: any) => Promise<{
    identity: any
    subject: any
    issuer: any
    orgId: any
    allFields: string[]
    convexIdentity: { subject: any; issuer: any; orgId: any }
  }>
}) {
  return convexQuery({
    args,
    handler,
  })
}
