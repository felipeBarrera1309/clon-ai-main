import type { QueryIntent } from "./responseFormatter"

export type { QueryIntent }

export class IntentAnalyzer {
  static analyze(query: string): QueryIntent {
    const lowerQuery = query.toLowerCase().trim()

    // Simplified intent analysis - focus on basic browsing and ordering
    if (
      lowerQuery.includes("ordenar") ||
      lowerQuery.includes("pedir") ||
      lowerQuery.includes("quiero")
    ) {
      return "ordering"
    }

    if (
      lowerQuery.includes("cuánto") ||
      lowerQuery.includes("precio") ||
      lowerQuery.includes("cuesta")
    ) {
      return "price"
    }

    if (
      lowerQuery.includes("qué") ||
      lowerQuery.includes("tienen") ||
      lowerQuery.includes("hay")
    ) {
      return "browsing"
    }

    // Default to general for simple search
    return "general"
  }

  /**
   * Simplified - no special formatting needed
   */
  static requiresSpecialFormatting(query: string): boolean {
    return false
  }

  /**
   * Basic context extraction
   */
  static extractContext(query: string): {
    hasQuantity: boolean
    hasPrice: boolean
    hasCategory: boolean
    categories: string[]
  } {
    const lowerQuery = query.toLowerCase()

    const categories = []
    if (lowerQuery.includes("pizza")) categories.push("Pizzas")
    if (lowerQuery.includes("bebida")) categories.push("Bebidas")
    if (lowerQuery.includes("complemento")) categories.push("Complementos")

    return {
      hasQuantity: /\b(una?|un|dos|tres|\d+)\b/.test(lowerQuery),
      hasPrice: /\b(precio|cuánto|cuesta)\b/.test(lowerQuery),
      hasCategory: categories.length > 0,
      categories,
    }
  }
}
