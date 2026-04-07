import z from "zod"
import { internal } from "../../../_generated/api"
import { IntentAnalyzer } from "../../rag/intentAnalyzer"
import {
  type FormattedProduct,
  ResponseFormatter,
} from "../../rag/responseFormatter"
import { RuleValidator } from "../../rag/ruleValidator"
import {
  getDynamicCategorySystem,
  getNormalizedCategoryName,
  getRelevantCategories,
  invalidateCategoryCache,
} from "./dynamicCategoryMappings"
import { createTaggedTool } from "./toolWrapper"

/**
 * Detecta si la consulta del usuario menciona intención de combinación
 */
function detectCombinationIntent(question: string): boolean {
  const combinationKeywords = [
    // Palabras clave directas de combinación
    "mitad",
    "y mitad",
    "combinación",
    "combinado",
    "combinada",
    "mezcla",
    "mixta",
    "mixto",
    "junto",
    "juntos",
    "junta",
    "juntas",
    "acompañado",
    "acompañada",
    "acompañados",
    "acompañadas",

    // Frases comunes
    "con otro",
    "con otra",
    "y también",
    "más otro",
    "más otra",
    "dos sabores",
    "dos tipos",
    "medio y medio",
    "parte y parte",
    "una mitad",
    "la otra mitad",

    // Sinónimos de pizza
    "mitad pizza",
    "media pizza",
    "pizza mitad",
    "pizza media",
    "medio pizza",
    "pizza medio",

    // Otras combinaciones
    "mix",
    "mixtura",
    "surprise",
    "sorpresa",
    "especial",
    "personalizada",
    "personalizado",
  ]

  const lowerQuestion = question.toLowerCase()

  return combinationKeywords.some((keyword) =>
    lowerQuestion.includes(keyword.toLowerCase())
  )
}

/**
 * @deprecated Esta función ya no se utiliza. El estado combinableHalf se maneja directamente en el RAG.
 * Obtiene el estado combinableHalf de un producto desde la base de datos
 */
async function getProductCombinableHalfStatus(
  ctx: any,
  productId: string
): Promise<boolean> {
  try {
    const product = await ctx.db.get(productId)
    return product?.combinableHalf || false
  } catch (error) {
    console.error(
      `Error obteniendo combinableHalf para producto ${productId}:`,
      error
    )
    return false // Por defecto, asumir no combinable si hay error
  }
}

/**
 * Extrae el restaurantLocationId del contexto de la conversación
 * Busca en el historial de mensajes por patrones [INTERNAL_INFO: restaurantLocationId=X]
 *
 * NOTA: Esta función está preparada para futura implementación cuando tengamos
 * acceso directo a los mensajes del thread del agente.
 */
async function extractRestaurantLocationFromContext(
  ctx: any
): Promise<string | undefined> {
  try {
    if (!ctx.threadId) return undefined

    // TODO: Implementar cuando tengamos acceso a mensajes del thread
    // Por ahora, esta función siempre devuelve undefined
    // El filtrado por ubicación debe hacerse pasando restaurantLocationId como parámetro

    console.log(
      "ℹ️ [CONTEXT EXTRACTION] Extracción automática de ubicación no implementada aún"
    )
    return undefined
  } catch (error) {
    console.error("Error extrayendo restaurantLocationId del contexto:", error)
    return undefined
  }
}

export const searchMenuProductsTool = createTaggedTool({
  description:
    "Busca productos en el menú usando búsqueda semántica inteligente. Funciona igual que el dashboard - búsqueda directa y simple sin complejidades innecesarias. Automáticamente filtra por ubicación si el cliente validó su dirección previamente.",
  args: z.object({
    question: z
      .string()
      .describe(
        "Pregunta del cliente sobre el menú en lenguaje natural (ej: '¿qué pizzas tienen?', '¿hay ensaladas?', 'muéstrame las bebidas')"
      ),
    organizationId: z
      .string()
      .optional()
      .describe(
        "ID de la organización (opcional, se usa como fallback si no se puede obtener del contexto)."
      ),
    restaurantLocationId: z
      .string()
      .optional()
      .describe(
        "ID de la ubicación del restaurante para filtrar productos disponibles solo en esa tienda (opcional - se extrae automáticamente del contexto si no se proporciona)."
      ),
    categoria: z
      .string()
      .optional()
      .describe("Categoría específica para filtrar los productos del menú."),
  }),
  handler: async (ctx, args): Promise<any> => {
    let organizationId: string | undefined
    let restaurantLocationId: string | undefined

    try {
      if (!ctx.threadId) {
        return {
          error: "No se pudo determinar el contexto de la conversación",
          sugerencia: "Verifica que estés en una conversación activa",
        }
      }

      // Obtener el organizationId del contexto de la conversación o del parámetro
      if (args.organizationId) {
        organizationId = args.organizationId
        console.log("Usando organizationId proporcionado:", organizationId)
      } else {
        try {
          const conversation = await ctx.runQuery(
            internal.system.conversations.getByThreadId,
            { threadId: ctx.threadId }
          )

          if (!conversation) {
            console.error(
              "No se encontró conversación para threadId:",
              ctx.threadId
            )
            return {
              error: "No se pudo determinar la organización de la conversación",
              sugerencia:
                "Verifica que la conversación esté correctamente configurada",
              debugInfo: { threadId: ctx.threadId },
            }
          }

          organizationId = conversation.organizationId

          if (!organizationId) {
            console.error(
              "La conversación no tiene organizationId:",
              conversation._id
            )
            return {
              error: "La conversación no está asociada a una organización",
              sugerencia: "Contacta al administrador del sistema",
              debugInfo: {
                conversationId: conversation._id,
                threadId: ctx.threadId,
              },
            }
          }
        } catch (error) {
          console.error("Error al obtener conversación:", error)
          return {
            error: "Error interno al acceder a la conversación",
            sugerencia: "Intenta de nuevo o contacta al soporte técnico",
            debugInfo: { threadId: ctx.threadId, error: String(error) },
          }
        }
      }

      // EXTRAER AUTOMÁTICAMENTE EL restaurantLocationId DEL CONTEXTO
      if (args.restaurantLocationId) {
        restaurantLocationId = args.restaurantLocationId
        console.log(
          "🏪 Usando restaurantLocationId proporcionado:",
          restaurantLocationId
        )
      } else {
        // Intentar extraer del contexto de conversación
        restaurantLocationId = await extractRestaurantLocationFromContext(ctx)
        if (restaurantLocationId) {
          console.log(
            "🏪 Extraído restaurantLocationId del contexto:",
            restaurantLocationId
          )
        } else {
          console.log(
            "🏪 No se encontró restaurantLocationId en el contexto - búsqueda sin filtro de ubicación"
          )
        }
      }

      // HACER LA BÚSQUEDA CON FILTRADO AUTOMÁTICO POR UBICACIÓN
      console.log(
        `🔍 [RAG SEARCH BOT] Buscando con filtrado inteligente: "${args.question}"`
      )
      console.log(
        `🏪 [RAG SEARCH BOT] Ubicación detectada: ${restaurantLocationId || "Sin filtro"}`
      )

      const searchParams: any = {
        organizationId,
        query: args.question, // Usar la pregunta del usuario directamente
        limit: 10,
        categoria: args.categoria, // Incluir la categoría como parámetro si se proporciona
      }

      // INCLUIR restaurantLocationId SI SE EXTRAJO DEL CONTEXTO
      // Esto permite filtrar productos disponibles solo en la ubicación validada
      if (restaurantLocationId) {
        searchParams.restaurantLocationId = restaurantLocationId
        console.log(
          `🏪 [RAG SEARCH BOT] Aplicando filtro de ubicación: ${restaurantLocationId}`
        )
      } else {
        console.log(
          `🏪 [RAG SEARCH BOT] Sin filtro de ubicación - mostrando productos de todas las sucursales`
        )
      }

      const searchResult = await ctx.runAction(
        (internal as any).system.menuIndexing.searchMenuProducts,
        searchParams
      )
      console.log(
        `✅ [RAG SEARCH BOT] Resultados encontrados: ${searchResult.formattedResults.length}`
      )

      // 1. Obtener configuración RAG de la organización
      const ragConfig = await ctx.runQuery(
        internal.system.agentConfiguration.getRAGConfiguration,
        { organizationId }
      )

      // 2. Convertir resultados RAG a FormattedProduct (con datos básicos primero)
      const formattedProducts: FormattedProduct[] =
        searchResult.formattedResults.map((result: any) => ({
          id: result.productId || result.title,
          name: result.title,
          price: result.price || 0,
          description: result.content || "",
          category: result.category || "Sin categoría",
          standAlone: true, // Valor temporal, se actualizará después
          combinableHalf:
            result.title.toLowerCase().includes("media") ||
            result.title.toLowerCase().includes("mitad"),
          appliedRules: [],
        }))

      // 3. No se filtra por combinación - el RAG maneja todo
      console.log(
        `🔄 [RAG SEARCH] Mostrando todos los productos encontrados (sin filtrar por combinación)`
      )

      // 5. Simplified - no complex rules applied
      const appliedRulesSummary: string[] = []

      // 6. Analizar intención de la consulta
      const intent = IntentAnalyzer.analyze(args.question)
      console.log(`🎯 [RAG SEARCH BOT] Intención detectada: ${intent}`)

      // 7. Determinar si es una consulta específica o general
      // Si menciona un producto específico o pide detalles, usar formato específico
      const isSpecificQuery =
        intent === "specific" ||
        args.question.toLowerCase().includes("detalle") ||
        args.question.toLowerCase().includes("información") ||
        args.question.toLowerCase().includes("qué lleva") ||
        args.question.toLowerCase().includes("qué tiene") ||
        formattedProducts.length === 1

      // 8. Formatear respuesta según intención y reglas aplicadas
      const formattingResult = ResponseFormatter.formatContextual(
        formattedProducts,
        args.question,
        isSpecificQuery ? "specific" : intent,
        appliedRulesSummary
      )

      // 6. Preparar respuesta final
      const finalResults = formattedProducts.map((p) => ({
        nombre: p.name,
        descripcion: p.description,
        categoria: p.category,
        precio: p.price,
        standAlone: p.standAlone,
        combinableHalf: p.combinableHalf,
        reglas_aplicadas: p.appliedRules,
        puntuacion_similitud: 0, // Mantener compatibilidad
      }))

      // Función para limpiar caracteres especiales
      const cleanCategoryName = (category: string) =>
        category.replace(/[^a-zA-Z0-9\s]/g, "").toUpperCase()

      // Agrupar por categoría para mejor presentación
      const resultsByCategory = finalResults.reduce(
        (acc: Record<string, any[]>, result: any) => {
          const categoryName = cleanCategoryName(
            result.categoria || "Sin categoría"
          )
          if (!acc[categoryName]) {
            acc[categoryName] = []
          }
          acc[categoryName].push(result)
          return acc
        },
        {} as Record<string, any[]>
      )

      console.log(
        `📊 [RAG SEARCH BOT] Resumen: ${finalResults.length} productos encontrados en ${Object.keys(resultsByCategory).length} categorías`
      )

      return {
        resultados: finalResults,
        resultados_por_categoria: resultsByCategory,
        total_encontrados: finalResults.length,
        pregunta_original: args.question,
        intencion_detectada: intent,
        reglas_aplicadas: [],
        ubicacion_filtrada: restaurantLocationId || null,
        respuesta_formateada: formattingResult.formattedResponse,
        mensaje:
          formattingResult.formattedResponse ||
          (finalResults.length > 0
            ? `Encontré ${finalResults.length} producto(s) relacionados con "${args.question}"${restaurantLocationId ? " en tu ubicación" : ""}`
            : `No encontré productos disponibles relacionados con "${args.question}". ¿Podrías ser más específico o preguntarme sobre otras opciones del menú?`),
      }
    } catch (error) {
      console.error("❌ [RAG SEARCH BOT] Error:", error)

      // Si hay error, intentar con búsqueda de fallback simple
      try {
        console.log("🔄 [RAG SEARCH BOT] Intentando búsqueda de fallback...")
        const fallbackParams: any = {
          organizationId,
          query: "disponible", // Consulta muy básica como fallback
          limit: 5,
        }

        // Agregar filtro de ubicación al fallback también (usar la ubicación extraída del contexto)
        if (restaurantLocationId) {
          fallbackParams.restaurantLocationId = restaurantLocationId
          console.log(
            `🏪 [RAG SEARCH BOT] Fallback también filtra por ubicación: ${restaurantLocationId}`
          )
        }

        const fallbackResult = await ctx.runAction(
          (internal as any).system.menuIndexing.searchMenuProducts,
          fallbackParams
        )

        if (fallbackResult.formattedResults.length > 0) {
          const fallbackFormatted = fallbackResult.formattedResults.map(
            (result: any) => ({
              nombre: result.title,
              descripcion:
                result.content.substring(0, 200) +
                (result.content.length > 200 ? "..." : ""),
              categoria: result.category,
              disponibilidad: result.availability,
              puntuacion_similitud: Math.round(result.score * 100) / 100,
            })
          )

          console.log(
            `✅ [RAG SEARCH BOT] Fallback exitoso: ${fallbackFormatted.length} resultados`
          )

          return {
            resultados: fallbackFormatted,
            resultados_por_categoria: {},
            total_encontrados: fallbackFormatted.length,
            pregunta_original: args.question,
            mensaje: `Encontré ${fallbackFormatted.length} productos disponibles en el menú`,
            es_fallback: true,
          }
        }
      } catch (fallbackError) {
        console.error("❌ [RAG SEARCH BOT] Error en fallback:", fallbackError)
      }

      const isOpenAIError =
        error instanceof Error &&
        error.message &&
        error.message.includes("AI_APICallError")

      return {
        error: isOpenAIError
          ? "Error temporal con el servicio de búsqueda. Los productos pueden estar disponibles pero no puedo acceder al catálogo en este momento."
          : "Ocurrió un error al buscar productos en el menú",
        pregunta_original: args.question,
        sugerencia: isOpenAIError
          ? "Intenta de nuevo en unos momentos o contacta al restaurante directamente"
          : "Intenta con términos más generales o verifica la ortografía",
        debugInfo: {
          error: String(error),
          question: args.question,
          hasOrganizationId: !!args.organizationId,
          isOpenAIError,
        },
      }
    }
  },
})
