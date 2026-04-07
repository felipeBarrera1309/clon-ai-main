/**
 * @deprecated Superseded by the 5-stage extraction pipeline
 * in packages/backend/convex/system/menuExtractionActions.ts
 * Kept for backward compatibility — will be removed in a future cleanup.
 */
"use node"

import { generateText } from "ai"
import { v } from "convex/values"
import { action } from "../_generated/server"
import { type AIModelType, createLanguageModel } from "../lib/aiModels"

const MENU_EXTRACTION_MODEL: AIModelType = "gemini-3.0-flash"

type ExtractionType = "categories" | "subcategories" | "sizes" | "products"

interface ExtractionContext {
  categories?: string[]
  subcategories?: Array<{ name: string; category: string }>
  sizes?: string[]
}

export interface CategoriesExtractionData {
  categories: Array<{ name: string }>
}

export interface SubcategoriesExtractionData {
  subcategories: Array<{ name: string; category: string }>
}

export interface SizesExtractionData {
  sizes: Array<{ name: string }>
}

export interface ProductsExtractionData {
  products: Array<{
    name: string
    description: string
    category: string
    subcategory: string | null
    size: string | null
    price: number
    standAlone: boolean
    combinableHalf: boolean
    combinableWithCategories: string[] | null
    instructions: string | null
  }>
}

export type ExtractionData =
  | CategoriesExtractionData
  | SubcategoriesExtractionData
  | SizesExtractionData
  | ProductsExtractionData

export type ExtractionResult =
  | {
      success: true
      data: ExtractionData
      extractionType: ExtractionType
    }
  | {
      success: false
      error: string
      extractionType: ExtractionType
    }

const CATEGORIES_EXTRACTION_PROMPT = `Eres un experto en análisis de menús de restaurantes. Tu tarea es extraer TODAS las categorías principales del menú.

INSTRUCCIONES:
1. Identifica todas las categorías principales (ej: Pizzas, Bebidas, Entradas, Postres, Hamburguesas, etc.)
2. NO incluyas subcategorías ni productos individuales
3. Normaliza los nombres (primera letra mayúscula, sin abreviaciones)
4. Si no encuentras categorías claras, infiere las más lógicas basándote en los productos

FORMATO DE RESPUESTA (JSON estricto):
{
  "categories": [
    { "name": "Nombre de Categoría 1" },
    { "name": "Nombre de Categoría 2" }
  ]
}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional ni markdown.`

const SUBCATEGORIES_EXTRACTION_PROMPT = (
  categories: string[]
) => `Eres un experto en análisis de menús de restaurantes. Tu tarea es extraer las subcategorías del menú.

CATEGORÍAS EXISTENTES:
${categories.map((c) => `- ${c}`).join("\n")}

INSTRUCCIONES:
1. Identifica subcategorías dentro de cada categoría principal
2. Cada subcategoría DEBE pertenecer a una de las categorías listadas arriba
3. Ejemplos: "Pizzas Clásicas", "Pizzas Especiales" dentro de "Pizzas"
4. Si no hay subcategorías claras, puedes devolver un array vacío
5. Normaliza los nombres (primera letra mayúscula)

FORMATO DE RESPUESTA (JSON estricto):
{
  "subcategories": [
    { "name": "Nombre Subcategoría", "category": "Categoría Padre" }
  ]
}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional ni markdown.`

const SIZES_EXTRACTION_PROMPT = `Eres un experto en análisis de menús de restaurantes. Tu tarea es extraer los tamaños disponibles para los productos.

INSTRUCCIONES:
1. Identifica todos los tamaños mencionados (ej: Personal, Mediana, Grande, Familiar, etc.)
2. También incluye tamaños en medidas (ej: 330ml, 500ml, 1L)
3. Normaliza los nombres de manera consistente
4. Si no hay tamaños claros, puedes devolver un array vacío

FORMATO DE RESPUESTA (JSON estricto):
{
  "sizes": [
    { "name": "Tamaño 1" },
    { "name": "Tamaño 2" }
  ]
}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional ni markdown.`

const PRODUCTS_EXTRACTION_PROMPT = (
  context: ExtractionContext
) => `Eres un experto en análisis de menús de restaurantes colombianos. Tu tarea es extraer TODOS los productos del menú con información completa y precisa.

═══════════════════════════════════════════════════════════════════
DATOS YA EXTRAÍDOS EN PASOS ANTERIORES (USA ESTOS NOMBRES EXACTOS):
═══════════════════════════════════════════════════════════════════

${
  context.categories?.length
    ? `📁 CATEGORÍAS DISPONIBLES:
${context.categories.map((c, i) => `   ${i + 1}. "${c}"`).join("\n")}`
    : "⚠️ Sin categorías definidas - deberás inferirlas"
}

${
  context.subcategories?.length
    ? `📂 SUBCATEGORÍAS:
${context.subcategories.map((s, i) => `   ${i + 1}. "${s.name}" → pertenece a "${s.category}"`).join("\n")}`
    : "Sin subcategorías definidas"
}

${
  context.sizes?.length
    ? `📏 TAMAÑOS DISPONIBLES:
${context.sizes.map((s, i) => `   ${i + 1}. "${s}"`).join("\n")}`
    : "Sin tamaños definidos"
}

═══════════════════════════════════════════════════════════════════
INSTRUCCIONES DETALLADAS:
═══════════════════════════════════════════════════════════════════

1. EXTRACCIÓN DE PRODUCTOS:
   - Extrae TODOS los productos visibles en el menú
   - Cada producto DEBE usar una categoría de la lista de arriba (NOMBRE EXACTO)
   - Si un producto tiene múltiples tamaños/precios, crea una entrada separada por cada combinación

2. DESCRIPCIÓN (MUY IMPORTANTE):
   - Si el producto tiene descripción en el menú, úsala
   - Si NO tiene descripción, GENERA una descripción breve y atractiva basándote en:
     * El nombre del producto
     * Los ingredientes si se mencionan
     * El tipo de plato (pizza, hamburguesa, bebida, etc.)
   - La descripción debe ser en español colombiano, máximo 100 caracteres
   - TODOS los productos DEBEN tener descripción, nunca vacía
   - Ejemplos: "Deliciosa pizza con pepperoni importado y queso mozzarella", "Refrescante limonada natural"

3. PRECIOS:
   - Extrae el precio como número entero (pesos colombianos, sin decimales)
   - Convierte formatos como "25.000" o "25,000" a número: 25000

4. CONFIGURACIÓN DE COMBINACIONES:

   standAlone (¿Se puede pedir solo?):
   - TRUE para: pizzas completas, hamburguesas, platos fuertes, bebidas, postres, entradas
   - FALSE para: adiciones, extras, ingredientes adicionales, complementos obligatorios
   
   combinableHalf (¿Combinable como mitad?):
   - TRUE para: pizzas (mitad y mitad), productos que se venden en porciones combinables
   - FALSE para: hamburguesas, bebidas, postres, la mayoría de productos
   
   combinableWithCategories (¿Con qué categorías se combina?):
   - IMPORTANTE: Usa los nombres EXACTOS de las categorías listadas arriba
   - Para adiciones/extras: lista las categorías a las que aplican
   - Ejemplo: si "Extra Queso" va con hamburguesas → ["Hamburguesas"]
   - Para productos independientes: null

5. INSTRUCCIONES ESPECIALES:
   - Si hay notas de preparación en el menú, inclúyelas
   - Ejemplo: "Nivel de picante ajustable", "Sin gluten disponible"
   - Si no hay instrucciones: null

═══════════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA (JSON estricto):
═══════════════════════════════════════════════════════════════════

{
  "products": [
    {
      "name": "Nombre del Producto",
      "description": "Descripción breve y atractiva (NUNCA vacía)",
      "category": "EXACTAMENTE uno de: ${context.categories?.join(", ") || "las categorías del menú"}",
      "subcategory": "Nombre exacto de subcategoría o null",
      "size": "Nombre exacto de tamaño o null",
      "price": 25000,
      "standAlone": true,
      "combinableHalf": false,
      "combinableWithCategories": null,
      "instructions": null
    }
  ]
}

═══════════════════════════════════════════════════════════════════
REGLAS CRÍTICAS:
═══════════════════════════════════════════════════════════════════

❌ NO respondas con texto adicional, solo el JSON
❌ NO uses categorías que no estén en la lista de arriba
❌ NO dejes descripción vacía o null
❌ NO uses markdown ni bloques de código

✅ USA los nombres EXACTOS de categorías/subcategorías/tamaños
✅ GENERA descripciones atractivas si no existen
✅ ASEGÚRATE que standAlone y combinableHalf sean booleanos (true/false)`

function stripMarkdownCodeBlocks(text: string): string {
  let cleaned = text.trim()

  // Handle various markdown code block formats
  // Match ```json, ```JSON, ``` at the start
  const codeBlockStartRegex = /^```(?:json|JSON)?\s*/i
  if (codeBlockStartRegex.test(cleaned)) {
    cleaned = cleaned.replace(codeBlockStartRegex, "")
  }

  // Remove trailing code block markers
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3)
  }

  // Handle case where there might be text before or after the JSON
  // Try to extract JSON object or array from the response
  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (jsonMatch) {
    cleaned = jsonMatch[1]!
  }

  return cleaned.trim()
}

function parseJsonResponse<T>(text: string, extractionType: string): T {
  const cleanedText = stripMarkdownCodeBlocks(text)

  try {
    return JSON.parse(cleanedText) as T
  } catch (error) {
    // Log the raw response for debugging (truncated for large responses)
    const truncatedResponse =
      cleanedText.length > 500
        ? `${cleanedText.substring(0, 500)}... [truncated]`
        : cleanedText
    console.error(
      `[Menu Extraction] Failed to parse JSON for ${extractionType}:`,
      truncatedResponse
    )
    console.error(`[Menu Extraction] Parse error:`, (error as Error).message)

    // Provide user-friendly error message in Spanish
    throw new Error(
      `Error al procesar la respuesta del modelo. El documento puede no contener información de menú válida o el formato no es reconocible. Por favor, intenta con una imagen más clara o un PDF con mejor calidad.`
    )
  }
}

function getExtractionLabel(extractionType: ExtractionType): string {
  const labels: Record<ExtractionType, string> = {
    categories: "las categorías",
    subcategories: "las subcategorías",
    sizes: "los tamaños",
    products: "los productos",
  }
  return labels[extractionType]
}

function buildSystemPrompt(
  extractionType: ExtractionType,
  context?: ExtractionContext
): string {
  switch (extractionType) {
    case "categories":
      return CATEGORIES_EXTRACTION_PROMPT
    case "subcategories":
      return SUBCATEGORIES_EXTRACTION_PROMPT(context?.categories || [])
    case "sizes":
      return SIZES_EXTRACTION_PROMPT
    case "products":
      return PRODUCTS_EXTRACTION_PROMPT(context || {})
  }
}

export const extractMenuFromDocument = action({
  args: {
    fileBase64: v.string(),
    mimeType: v.string(),
    extractionType: v.union(
      v.literal("categories"),
      v.literal("subcategories"),
      v.literal("sizes"),
      v.literal("products")
    ),
    context: v.optional(
      v.object({
        categories: v.optional(v.array(v.string())),
        subcategories: v.optional(
          v.array(
            v.object({
              name: v.string(),
              category: v.string(),
            })
          )
        ),
        sizes: v.optional(v.array(v.string())),
      })
    ),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
      data: v.union(
        v.object({ categories: v.array(v.object({ name: v.string() })) }),
        v.object({
          subcategories: v.array(
            v.object({ name: v.string(), category: v.string() })
          ),
        }),
        v.object({ sizes: v.array(v.object({ name: v.string() })) }),
        v.object({
          products: v.array(
            v.object({
              name: v.string(),
              description: v.string(),
              category: v.string(),
              subcategory: v.union(v.string(), v.null()),
              size: v.union(v.string(), v.null()),
              price: v.number(),
              standAlone: v.boolean(),
              combinableHalf: v.boolean(),
              combinableWithCategories: v.union(v.array(v.string()), v.null()),
              instructions: v.union(v.string(), v.null()),
            })
          ),
        })
      ),
      extractionType: v.union(
        v.literal("categories"),
        v.literal("subcategories"),
        v.literal("sizes"),
        v.literal("products")
      ),
    }),
    v.object({
      success: v.literal(false),
      error: v.string(),
      extractionType: v.union(
        v.literal("categories"),
        v.literal("subcategories"),
        v.literal("sizes"),
        v.literal("products")
      ),
    })
  ),
  handler: async (_ctx, args): Promise<ExtractionResult> => {
    const { fileBase64, mimeType, extractionType, context } = args
    const systemPrompt = buildSystemPrompt(extractionType, context)

    // Validate file type
    const supportedMimeTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ]

    if (!supportedMimeTypes.includes(mimeType.toLowerCase())) {
      console.error(
        `[Menu Extraction] Unsupported file type: ${mimeType}. Supported types: ${supportedMimeTypes.join(", ")}`
      )
      return {
        success: false,
        error: `Tipo de archivo no soportado: ${mimeType}. Por favor, sube un archivo PDF o una imagen (JPEG, PNG, WebP).`,
        extractionType,
      }
    }

    // Validate base64 data is not empty
    if (!fileBase64 || fileBase64.length === 0) {
      console.error(`[Menu Extraction] Empty file data received`)
      return {
        success: false,
        error:
          "El archivo está vacío o no se pudo leer correctamente. Por favor, intenta subir el archivo nuevamente.",
        extractionType,
      }
    }

    // Log file info for debugging
    const fileSizeKB = Math.round((fileBase64.length * 3) / 4 / 1024)
    console.log(
      `🔍 [Menu Extraction] Starting ${extractionType} extraction...`,
      {
        mimeType,
        fileSizeKB: `${fileSizeKB} KB`,
        hasContext: !!context,
      }
    )

    try {
      const response = await generateText({
        model: createLanguageModel(MENU_EXTRACTION_MODEL),
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analiza este documento de menú y extrae ${getExtractionLabel(extractionType)}:`,
              },
              {
                type: "file",
                data: fileBase64,
                mediaType: mimeType,
              },
            ],
          },
        ],
        maxOutputTokens: 8000,
      })

      console.log(`✅ [Menu Extraction] ${extractionType} extraction completed`)

      const data = parseJsonResponse<ExtractionData>(
        response.text,
        extractionType
      )

      return {
        success: true,
        data,
        extractionType,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Error desconocido"

      console.error(
        `❌ [Menu Extraction] Error during ${extractionType} extraction:`,
        {
          error: errorMessage,
          mimeType,
          fileSizeKB: `${fileSizeKB} KB`,
        }
      )

      // Provide more specific error messages based on error type
      let userFriendlyError: string

      if (
        errorMessage.includes("model") ||
        errorMessage.includes("gateway") ||
        errorMessage.includes("API")
      ) {
        userFriendlyError =
          "Error de conexión con el servicio de IA. Por favor, intenta nuevamente en unos momentos."
      } else if (
        errorMessage.includes("timeout") ||
        errorMessage.includes("ETIMEDOUT")
      ) {
        userFriendlyError =
          "El procesamiento del documento tardó demasiado. Intenta con un archivo más pequeño o una imagen de menor resolución."
      } else if (
        errorMessage.includes("rate limit") ||
        errorMessage.includes("quota")
      ) {
        userFriendlyError =
          "Se ha alcanzado el límite de solicitudes. Por favor, espera unos minutos e intenta nuevamente."
      } else if (errorMessage.includes("Error al procesar la respuesta")) {
        // This is our custom JSON parsing error, pass it through
        userFriendlyError = errorMessage
      } else {
        userFriendlyError = `Error al extraer ${getExtractionLabel(extractionType)} del documento. ${errorMessage}`
      }

      return {
        success: false,
        error: userFriendlyError,
        extractionType,
      }
    }
  },
})
