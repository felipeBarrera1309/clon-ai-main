import { internal } from "../../../_generated/api"

/**
 * Sistema dinámico de mapeo de categorías para RAG multi-tenant
 * Analiza automáticamente las categorías y subcategorías de cada organización y genera mappings inteligentes
 */

/**
 * Normaliza nombres de categorías convirtiendo caracteres especiales a ASCII
 */
function normalizeCategoryName(name: string): string {
  return name
    .normalize("NFD") // Descompone caracteres con acentos
    .replace(/[\u0300-\u036f]/g, "") // Remueve diacríticos
    .replace(/ñ/g, "n") // ñ -> n
    .replace(/Ñ/g, "N") // Ñ -> N
    .replace(/[^a-zA-Z0-9\s\-_]/g, "") // Remueve otros caracteres especiales
    .trim()
    .replace(/\s+/g, "_") // Reemplaza espacios con guiones bajos para campos
    .toLowerCase()
}

export interface CategoryMapping {
  keyword: string
  categories: string[]
  synonyms: string[]
}

export interface DynamicCategorySystem {
  organizationId: string
  categories: Array<{
    _id: string
    name: string
    normalizedName: string
    type: "category" | "subcategory"
  }>
  keywordMappings: Map<string, string[]>
  categorySynonyms: Map<string, string[]>
  lastUpdated: number
}

// Cache global para sistemas de categorías dinámicas
const categorySystemsCache = new Map<string, DynamicCategorySystem>()
const CACHE_TTL = 1000 * 60 * 30 // 30 minutos

/**
 * Obtiene o crea el sistema de categorías dinámicas para una organización
 */
export async function getDynamicCategorySystem(
  ctx: any,
  organizationId: string
): Promise<DynamicCategorySystem> {
  // Verificar cache
  const cached = categorySystemsCache.get(organizationId)
  if (cached && Date.now() - cached.lastUpdated < CACHE_TTL) {
    return cached
  }

  // Obtener categorías y subcategorías reales de la organización
  const categories = (await ctx.runQuery(
    internal.system.menuProductCategories.getAll,
    {
      organizationId,
    }
  )) as Array<{ _id: string; name: string }>

  // Para subcategorías, necesitamos acceder directamente a la base de datos ya que no hay función system para esto
  const subcategories = await ctx.db
    .query("menuProductSubcategories")
    .withIndex("by_organization_id", (q: any) =>
      q.eq("organizationId", organizationId)
    )
    .collect()

  // Combinar categorías y subcategorías
  const allCategories = [
    ...categories.map((cat: any) => ({ ...cat, type: "category" as const })),
    ...subcategories.map((sub: any) => ({
      ...sub,
      type: "subcategory" as const,
    })),
  ]

  // Normalizar categorías
  const normalizedCategories = allCategories.map((cat) => ({
    ...cat,
    normalizedName: normalizeCategoryName(cat.name),
  }))

  // Crear sistema dinámico
  const system: DynamicCategorySystem = {
    organizationId,
    categories: normalizedCategories,
    keywordMappings: createKeywordMappings(normalizedCategories),
    categorySynonyms: createCategorySynonyms(normalizedCategories),
    lastUpdated: Date.now(),
  }

  // Guardar en cache
  categorySystemsCache.set(organizationId, system)

  return system
}

/**
 * Crea mappings de palabras clave a categorías basados en análisis dinámico
 */
function createKeywordMappings(
  categories: Array<{ name: string }>
): Map<string, string[]> {
  const mappings = new Map<string, string[]>()

  // Para cada categoría real, crear mappings basados en sus palabras
  categories.forEach((category) => {
    const categoryName = category.name.toLowerCase()

    // Análisis directo: usar palabras del nombre de categoría como keywords
    const words = categoryName.split(/\s+/).filter((word) => word.length > 2)
    words.forEach((word) => {
      if (!mappings.has(word)) {
        mappings.set(word, [])
      }
      if (!mappings.get(word)!.includes(category.name)) {
        mappings.get(word)!.push(category.name)
      }
    })

    // También mapear el nombre completo de la categoría
    if (!mappings.has(categoryName)) {
      mappings.set(categoryName, [])
    }
    if (!mappings.get(categoryName)!.includes(category.name)) {
      mappings.get(categoryName)!.push(category.name)
    }
  })

  return mappings
}

/**
 * Crea sinónimos contextuales basados en las categorías reales de la organización
 */
function createCategorySynonyms(
  categories: Array<{ name: string }>
): Map<string, string[]> {
  const synonyms = new Map<string, string[]>()

  // Generar sinónimos basados en categorías reales
  categories.forEach((category) => {
    const words = category.name.toLowerCase().split(/\s+/)

    words.forEach((word) => {
      if (word.length > 3) {
        // Solo palabras significativas
        const variations = generateWordVariations(word)
        if (variations.length > 1) {
          synonyms.set(word, variations.slice(1)) // Excluir la palabra original
        }
      }
    })
  })

  return synonyms
}

/**
 * Genera variaciones de una palabra para sinónimos
 */
function generateWordVariations(word: string): string[] {
  const variations = [word]

  // Plurales
  if (!word.endsWith("s") && !word.endsWith("es")) {
    if (
      word.endsWith("a") ||
      word.endsWith("e") ||
      word.endsWith("i") ||
      word.endsWith("o") ||
      word.endsWith("u")
    ) {
      variations.push(word + "s")
    } else {
      variations.push(word + "es")
    }
  }

  // Variaciones comunes por tipo de preparación
  const preparationVariations: Record<string, string[]> = {
    asado: ["rostizado", "al horno", "a la brasa", "grill"],
    frito: ["dorado", "crujiente", "rebozado"],
    artesanal: ["tradicional", "casero", "hecho a mano"],
    fresco: ["del día", "recién hecho", "natural"],
    especial: ["premium", "gourmet", "exclusivo"],
  }

  Object.entries(preparationVariations).forEach(([base, vars]) => {
    if (word.includes(base)) {
      variations.push(...vars)
    }
  })

  return [...new Set(variations)]
}

/**
 * Invalida el cache para una organización (útil cuando cambian categorías)
 */
export function invalidateCategoryCache(organizationId: string) {
  categorySystemsCache.delete(organizationId)
}

/**
 * Obtiene todas las categorías relevantes para una pregunta
 */
export function getRelevantCategories(
  question: string,
  system: DynamicCategorySystem
): string[] {
  const words = question.toLowerCase().split(/\s+/)
  const relevantCategories = new Set<string>()

  words.forEach((word) => {
    // Buscar en mappings directos
    if (system.keywordMappings.has(word)) {
      system.keywordMappings
        .get(word)!
        .forEach((cat) => relevantCategories.add(cat))
    }

    // Buscar en sinónimos
    system.categorySynonyms.forEach((synonyms, baseWord) => {
      if (synonyms.includes(word)) {
        if (system.keywordMappings.has(baseWord)) {
          system.keywordMappings
            .get(baseWord)!
            .forEach((cat) => relevantCategories.add(cat))
        }
      }
    })
  })

  return Array.from(relevantCategories)
}

/**
 * Obtiene el nombre normalizado de una categoría para uso en campos Convex
 */
export function getNormalizedCategoryName(
  categoryName: string,
  system: DynamicCategorySystem
): string {
  const category = system.categories.find((cat) => cat.name === categoryName)
  return category?.normalizedName || normalizeCategoryName(categoryName)
}
