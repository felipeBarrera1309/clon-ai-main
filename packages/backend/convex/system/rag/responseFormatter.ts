export type QueryIntent =
  | "general"
  | "specific"
  | "ordering"
  | "browsing"
  | "price"
  | "combination"

export interface FormattedProduct {
  id: string
  name: string
  price: number
  description: string
  category: string
  standAlone: boolean
  combinableHalf: boolean
  appliedRules?: string[]
}

export interface FormattingResult {
  formattedResponse: string
  intent: QueryIntent
  appliedRules: string[]
  totalProducts: number
}

export class ResponseFormatter {
  static formatConciseList(products: FormattedProduct[], maxItems = 8): string {
    if (products.length === 0) {
      return "No encontré productos que coincidan con tu búsqueda."
    }

    const limitedProducts = products.slice(0, maxItems)
    const productLines = limitedProducts.map(
      (p) => `🍕 ${p.name} - $${p.price.toLocaleString("es-CO")}`
    )

    let response = productLines.join("\n")

    if (products.length > maxItems) {
      response += `\n\n...y ${products.length - maxItems} productos más.`
    }

    return response
  }

  static formatDetailedSingle(product: FormattedProduct): string {
    return `🍕 ${product.name}
💰 Precio: $${product.price.toLocaleString("es-CO")}
📝 ${product.description}
⏱️ Tiempo aproximado: 15-20 minutos`
  }

  static formatContextual(
    products: FormattedProduct[],
    query: string,
    intent: QueryIntent,
    appliedRules: string[] = []
  ): FormattingResult {
    let formattedResponse: string

    switch (intent) {
      case "ordering":
        formattedResponse = ResponseFormatter.formatForOrdering(products)
        break
      case "browsing":
        formattedResponse = ResponseFormatter.formatForBrowsing(products)
        break
      case "specific":
        formattedResponse = ResponseFormatter.formatForSpecific(
          products[0] || null
        )
        break
      case "price":
        formattedResponse = ResponseFormatter.formatForPrice(products)
        break
      default:
        formattedResponse = ResponseFormatter.formatConciseList(products)
    }

    return {
      formattedResponse,
      intent,
      appliedRules,
      totalProducts: products.length,
    }
  }

  private static formatForOrdering(products: FormattedProduct[]): string {
    if (products.length === 0) {
      return "No encontré productos disponibles para ordenar en este momento."
    }

    // Agrupar por categoría para mejor presentación
    const cleanCategoryName = (category: string) =>
      category.replace(/[^a-zA-Z0-9\s]/g, "").toUpperCase()

    const byCategory = products.reduce(
      (acc, product) => {
        const cleanCategory = cleanCategoryName(product.category)
        if (!acc[cleanCategory]) {
          acc[cleanCategory] = []
        }
        acc[cleanCategory]!.push(product)
        return acc
      },
      {} as Record<string, FormattedProduct[]>
    )

    let response =
      "¡Claro que sí! Con jamón también tenemos varias opciones deliciosas para que escojas:\n\n"

    for (const [category, categoryProducts] of Object.entries(byCategory)) {
      // Mapear nombres de categorías a emojis apropiados
      const categoryEmoji = ResponseFormatter.getCategoryEmoji(category)

      response += `${categoryEmoji} En ${ResponseFormatter.cleanCategoryDisplayName(category)}:\n`

      // Mostrar productos con tamaños y precios - SIN descripciones
      const productLines = categoryProducts.slice(0, 5).map((p) => {
        const sizeInfo = ResponseFormatter.extractSizeFromName(p.name)
        const cleanName = p.name
          .replace(/\s*\([^)]*\)/g, "")
          .replace(/\s+/g, " ")
          .trim()
        return `* ${cleanName} ${sizeInfo} ($${p.price.toLocaleString("es-CO")})`
      })

      response += productLines.join("\n")

      if (categoryProducts.length > 5) {
        response += `\n...y ${categoryProducts.length - 5} más`
      }
      response += "\n\n"
    }

    response += "¿Qué te parece? ¡Cuéntame cuál te antoja más! 🤤"

    return response.trim()
  }

  private static cleanCategoryDisplayName(category: string): string {
    // Convertir nombres técnicos a nombres amigables
    const categoryMappings: Record<string, string> = {
      PIZZAS: "Pizzas",
      PANZAROTTIS: "Panzarottis",
      "PIZZAS DE JAMÓN Y QUESO": "Pizzas de Jamón y Queso",
      "MEDIAS PIZZAS ARTESANALES": "Medias Pizzas Artesanales",
      ADICIONALES: "Adicionales",
    }

    const cleanCategory = category.replace(/[^a-zA-Z0-9\s]/g, "")
    return categoryMappings[cleanCategory] || cleanCategory
  }

  private static getCategoryEmoji(category: string): string {
    const categoryLower = category.toLowerCase()
    if (categoryLower.includes("PIZZA")) return "🍕"
    if (categoryLower.includes("PANZAROTTI")) return "🥟"
    if (categoryLower.includes("CAMARON") || categoryLower.includes("MARISCOS"))
      return "🍤"
    if (categoryLower.includes("POLLO")) return "🍗"
    if (categoryLower.includes("BEBIDA") || categoryLower.includes("GASEOSA"))
      return "🥤"
    if (categoryLower.includes("ENSALADA")) return "🥗"
    return "🍽️"
  }

  private static extractSizeFromName(name: string): string {
    const sizeMatch = name.match(
      /\b(PEQUEÑA|MEDIANA|GRANDE|NORMAL|SÚPER|EXTRA)\b/i
    )
    if (sizeMatch && sizeMatch[1]) {
      return `en tamaño ${sizeMatch[1].toUpperCase()}`
    }
    return ""
  }

  private static formatForBrowsing(products: FormattedProduct[]): string {
    if (products.length === 0) {
      return "No encontré productos en el menú."
    }

    let response = "Aquí tienes nuestro menú disponible:\n\n"

    const cleanCategoryName = (category: string) =>
      category.replace(/[^a-zA-Z0-9\s]/g, "").toUpperCase()

    const byCategory = products.reduce(
      (acc, product) => {
        const cleanCategory = cleanCategoryName(product.category)
        if (!acc[cleanCategory]) {
          acc[cleanCategory] = []
        }
        acc[cleanCategory]!.push(product)
        return acc
      },
      {} as Record<string, FormattedProduct[]>
    )

    for (const [category, categoryProducts] of Object.entries(byCategory)) {
      const categoryEmoji = ResponseFormatter.getCategoryEmoji(category)
      response += `${categoryEmoji} ${ResponseFormatter.cleanCategoryDisplayName(category)}:\n`

      const productLines = categoryProducts.slice(0, 3).map((p) => {
        const sizeInfo = ResponseFormatter.extractSizeFromName(p.name)
        const cleanName = p.name
          .replace(/\s*\([^)]*\)/g, "")
          .replace(/\s+/g, " ")
          .trim()
        return `  • ${cleanName} ${sizeInfo ? `(${sizeInfo})` : ""} - $${p.price.toLocaleString("es-CO")}`
      })
      response += productLines.join("\n")

      if (categoryProducts.length > 3) {
        response += `\n  ...y ${categoryProducts.length - 3} más`
      }
      response += "\n\n"
    }

    return response.trim()
  }

  private static formatForSpecific(product: FormattedProduct | null): string {
    if (!product) {
      return "No encontré información detallada sobre ese producto."
    }

    // Para consultas específicas, dar información completa con descripción
    return `🍕 ${product.name}
💰 Precio: $${product.price.toLocaleString("es-CO")}
📝 ${product.description}
🏷️ Categoría: ${product.category}
${product.standAlone ? "✅ Producto individual" : "⚠️ Requiere combinación"}
${product.combinableHalf ? "✂️ Puede ser mitad de pizza" : ""}`
  }

  private static formatForPrice(products: FormattedProduct[]): string {
    if (products.length === 0) {
      return "No encontré productos con precios disponibles."
    }

    const prices = products.map((p) => p.price).sort((a, b) => a - b)
    const minPrice = prices[0]!
    const maxPrice = prices[prices.length - 1]!

    if (products.length === 1) {
      return `El precio de ${products[0]!.name} es $${products[0]!.price.toLocaleString("es-CO")}.`
    }

    let response = `Los precios van desde $${minPrice.toLocaleString("es-CO")} hasta $${maxPrice.toLocaleString("es-CO")}.\n\n`

    const examples = products
      .slice(0, 3)
      .map((p) => `• ${p.name}: $${p.price.toLocaleString("es-CO")}`)
    response += "Algunos ejemplos:\n" + examples.join("\n")

    if (products.length > 3) {
      response += `\n\n...y ${products.length - 3} productos más.`
    }

    return response
  }
}
