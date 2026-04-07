"use node"

import { type FilePart, generateObject, type TextPart } from "ai"
import { v } from "convex/values"
import { internal } from "../_generated/api"
import { internalAction } from "../_generated/server"
import { type AIModelType, createLanguageModel } from "../lib/aiModels"
import {
  categoriesSchema,
  cleanedMenuTextSchema,
  productsSchema,
  sizesSchema,
  subcategoriesSchema,
} from "../lib/menuExtractionSchemas"

const EXTRACTION_MODEL: AIModelType = "gemini-3.0-flash"

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "application/pdf",
]

function safeJsonParse<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

async function validateJobForStage(
  ctx: { runQuery: Function },
  jobId: any,
  expectedGeneration: number
): Promise<{ valid: boolean; job: any }> {
  const job = await ctx.runQuery(
    internal.system.menuExtractionPipeline.getExtractionJobInternal,
    { jobId }
  )
  if (!job) return { valid: false, job: null }
  if (job.status === "failed") return { valid: false, job }
  if ((job.generation ?? 1) !== expectedGeneration) return { valid: false, job }
  return { valid: true, job }
}

const CATEGORIES_PROMPT = `Eres un experto en analisis de menus de restaurantes. Tu tarea es extraer TODAS las categorias principales del menu.

INSTRUCCIONES:
1. Identifica todas las categorias principales (ej: Pizzas, Bebidas, Entradas, Postres, Hamburguesas, etc.)
2. NO incluyas subcategorias ni productos individuales
3. Normaliza los nombres (primera letra mayuscula, sin abreviaciones)
4. Si no encuentras categorias claras, infiere las mas logicas basandote en los productos`

const SUBCATEGORIES_PROMPT = (
  categories: string[]
) => `Eres un experto en analisis de menus de restaurantes. Tu tarea es extraer las subcategorias del menu.

CATEGORIAS EXISTENTES:
${categories.map((c) => `- ${c}`).join("\n")}

INSTRUCCIONES:
1. Identifica subcategorias dentro de cada categoria principal
2. Cada subcategoria DEBE pertenecer a una de las categorias listadas arriba
3. Ejemplos: "Pizzas Clasicas", "Pizzas Especiales" dentro de "Pizzas"
4. Si no hay subcategorias claras, puedes devolver un array vacio
5. Normaliza los nombres (primera letra mayuscula)`

const SIZES_PROMPT = `Eres un experto en analisis de menus de restaurantes. Tu tarea es extraer los tamanos disponibles para los productos.

INSTRUCCIONES:
1. Identifica todos los tamanos mencionados (ej: Personal, Mediana, Grande, Familiar, etc.)
2. Tambien incluye tamanos en medidas (ej: 330ml, 500ml, 1L)
3. Normaliza los nombres de manera consistente
4. Si no hay tamanos claros, puedes devolver un array vacio`

const PRODUCTS_PROMPT = (context: {
  categories: string[]
  subcategories: Array<{ name: string; category: string }>
  sizes: string[]
}) => `Eres un experto en analisis de menus de restaurantes colombianos. Tu tarea es extraer TODOS los productos del menu con informacion completa y precisa.

DATOS YA EXTRAIDOS EN PASOS ANTERIORES (USA ESTOS NOMBRES EXACTOS):

${
  context.categories.length
    ? `CATEGORIAS DISPONIBLES:
${context.categories.map((c, i) => `   ${i + 1}. "${c}"`).join("\n")}`
    : "Sin categorias definidas - deberas inferirlas"
}

${
  context.subcategories.length
    ? `SUBCATEGORIAS:
${context.subcategories.map((s, i) => `   ${i + 1}. "${s.name}" -> pertenece a "${s.category}"`).join("\n")}`
    : "Sin subcategorias definidas"
}

${
  context.sizes.length
    ? `TAMANOS DISPONIBLES:
${context.sizes.map((s, i) => `   ${i + 1}. "${s}"`).join("\n")}`
    : "Sin tamanos definidos"
}

INSTRUCCIONES DETALLADAS:

1. EXTRACCION DE PRODUCTOS:
   - Extrae TODOS los productos visibles en el menu
   - Cada producto DEBE usar una categoria de la lista de arriba (NOMBRE EXACTO)
   - Si un producto tiene multiples tamanos/precios, crea una entrada separada por cada combinacion

2. DESCRIPCION (MUY IMPORTANTE):
   - Si el producto tiene descripcion en el menu, usala
   - Si NO tiene descripcion, GENERA una descripcion breve y atractiva basandote en:
     * El nombre del producto
     * Los ingredientes si se mencionan
     * El tipo de plato (pizza, hamburguesa, bebida, etc.)
   - La descripcion debe ser en espanol colombiano, maximo 100 caracteres
   - TODOS los productos DEBEN tener descripcion, nunca vacia
   - Ejemplos: "Deliciosa pizza con pepperoni importado y queso mozzarella", "Refrescante limonada natural"

3. PRECIOS:
   - Extrae el precio como numero entero (pesos colombianos, sin decimales)
   - Convierte formatos como "25.000" o "25,000" a numero: 25000

4. CONFIGURACION DE COMBINACIONES:

   standAlone (Se puede pedir solo?):
   - TRUE para: pizzas completas, hamburguesas, platos fuertes, bebidas, postres, entradas
   - FALSE para: adiciones, extras, ingredientes adicionales, complementos obligatorios

   combinableHalf (Combinable como mitad?):
   - TRUE para: pizzas (mitad y mitad), productos que se venden en porciones combinables
   - FALSE para: hamburguesas, bebidas, postres, la mayoria de productos

   combinableWithCategories (Con que categorias se combina?):
   - IMPORTANTE: Usa los nombres EXACTOS de las categorias listadas arriba
   - Para adiciones/extras: lista las categorias a las que aplican
   - Ejemplo: si "Extra Queso" va con hamburguesas -> ["Hamburguesas"]
   - Para productos independientes: null

5. INSTRUCCIONES ESPECIALES:
   - Si hay notas de preparacion en el menu, incluyelas
   - Ejemplo: "Nivel de picante ajustable", "Sin gluten disponible"
   - Si no hay instrucciones: null

REGLAS CRITICAS:
- NO uses categorias que no esten en la lista de arriba
- NO dejes descripcion vacia o null
- USA los nombres EXACTOS de categorias/subcategorias/tamanos
- GENERA descripciones atractivas si no existen
- ASEGURATE que standAlone y combinableHalf sean booleanos (true/false)`

export const startExtraction = internalAction({
  args: {
    jobId: v.id("menuExtractionJobs"),
    generation: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      const { valid, job } = await validateJobForStage(
        ctx,
        args.jobId,
        args.generation
      )
      if (!valid) return // Job was cancelled, failed, or a newer generation is running

      await ctx.runMutation(
        internal.system.menuExtractionPipeline.updateJobStatus,
        { jobId: args.jobId, status: "cleaning" }
      )

      const fileData: Array<{ base64: string; mediaType: string }> = []
      for (const storageId of job.fileStorageIds) {
        const blob = await ctx.storage.get(storageId)
        if (!blob) {
          throw new Error(`File not found in storage: ${storageId}`)
        }
        const mimeType = blob.type || "application/octet-stream"
        if (
          !ALLOWED_MIME_TYPES.includes(mimeType) &&
          !mimeType.startsWith("image/")
        ) {
          throw new Error(
            `Tipo de archivo no soportado: ${mimeType}. Solo se aceptan imagenes y PDF.`
          )
        }
        const arrayBuffer = await blob.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString("base64")
        fileData.push({
          base64,
          mediaType: blob.type || "application/octet-stream",
        })
      }

      const model = createLanguageModel(EXTRACTION_MODEL)

      const fileParts: FilePart[] = fileData.map(({ base64, mediaType }) => ({
        type: "file" as const,
        data: base64,
        mediaType,
      }))

      const textPart: TextPart = {
        type: "text",
        text: `Eres un experto en analisis de menus de restaurantes. Analiza los archivos adjuntos y extrae el contenido del menu como texto limpio y estructurado.

INSTRUCCIONES:
1. Si hay multiples archivos, anota cada uno con "=== ARCHIVO: archivo_N ==="
2. Corrige errores de OCR y normaliza el formato
3. Elimina contenido duplicado entre archivos
4. Organiza el texto por secciones logicas del menu
5. Si el contenido NO es un menu de restaurante, marca isMenu como false

IMPORTANTE: Produce texto limpio y bien estructurado que pueda ser procesado por etapas posteriores de extraccion.`,
      }

      const { object: cleanResult } = await generateObject({
        model,
        schema: cleanedMenuTextSchema,
        messages: [
          {
            role: "user",
            content: [...fileParts, textPart],
          },
        ],
      })

      if (!cleanResult.isMenu) {
        await ctx.runMutation(
          internal.system.menuExtractionPipeline.updateJobStatus,
          {
            jobId: args.jobId,
            status: "failed",
            error:
              cleanResult.rejectionReason ||
              "El contenido no parece ser un menu de restaurante",
            failedAtStage: "cleaning",
          }
        )
        return
      }

      await ctx.runMutation(
        internal.system.menuExtractionPipeline.updateJobCleanedText,
        {
          jobId: args.jobId,
          status: "extracting_categories",
          cleanedText: cleanResult.cleanedText,
        }
      )

      await ctx.scheduler.runAfter(
        0,
        internal.system.menuExtractionActions.stageCategories,
        { jobId: args.jobId, generation: args.generation }
      )
    } catch (error) {
      await ctx.runMutation(
        internal.system.menuExtractionPipeline.updateJobStatus,
        {
          jobId: args.jobId,
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "Error desconocido en limpieza",
          failedAtStage: "cleaning",
          generation: args.generation,
        }
      )
    }
  },
})

export const stageCategories = internalAction({
  args: { jobId: v.id("menuExtractionJobs"), generation: v.number() },
  handler: async (ctx, args) => {
    try {
      const { valid, job } = await validateJobForStage(
        ctx,
        args.jobId,
        args.generation
      )
      if (!valid) return
      if (!job.cleanedText) throw new Error("Job or cleaned text not found")

      const model = createLanguageModel(EXTRACTION_MODEL)
      const { object } = await generateObject({
        model,
        schema: categoriesSchema,
        prompt: `${CATEGORIES_PROMPT}\n\nMENU:\n${job.cleanedText}`,
      })

      await ctx.runMutation(
        internal.system.menuExtractionPipeline.updateJobExtractedCategories,
        {
          jobId: args.jobId,
          status: "extracting_subcategories",
          extractedCategories: JSON.stringify(object),
        }
      )

      await ctx.scheduler.runAfter(
        0,
        internal.system.menuExtractionActions.stageSubcategories,
        { jobId: args.jobId, generation: args.generation }
      )
    } catch (error) {
      await ctx.runMutation(
        internal.system.menuExtractionPipeline.updateJobStatus,
        {
          jobId: args.jobId,
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "Error extrayendo categorias",
          failedAtStage: "extracting_categories",
          generation: args.generation,
        }
      )
    }
  },
})

export const stageSubcategories = internalAction({
  args: { jobId: v.id("menuExtractionJobs"), generation: v.number() },
  handler: async (ctx, args) => {
    try {
      const { valid, job } = await validateJobForStage(
        ctx,
        args.jobId,
        args.generation
      )
      if (!valid) return
      if (!job.cleanedText) throw new Error("Job not found")

      const categories = safeJsonParse<{ categories: Array<{ name: string }> }>(
        job.extractedCategories,
        { categories: [] }
      )
      const categoryNames = categories.categories.map((c) => c.name)

      const model = createLanguageModel(EXTRACTION_MODEL)
      const { object } = await generateObject({
        model,
        schema: subcategoriesSchema,
        prompt: `${SUBCATEGORIES_PROMPT(categoryNames)}\n\nMENU:\n${job.cleanedText}`,
      })

      await ctx.runMutation(
        internal.system.menuExtractionPipeline.updateJobExtractedSubcategories,
        {
          jobId: args.jobId,
          status: "extracting_sizes",
          extractedSubcategories: JSON.stringify(object),
        }
      )

      await ctx.scheduler.runAfter(
        0,
        internal.system.menuExtractionActions.stageSizes,
        { jobId: args.jobId, generation: args.generation }
      )
    } catch (error) {
      await ctx.runMutation(
        internal.system.menuExtractionPipeline.updateJobStatus,
        {
          jobId: args.jobId,
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "Error extrayendo subcategorias",
          failedAtStage: "extracting_subcategories",
          generation: args.generation,
        }
      )
    }
  },
})

export const stageSizes = internalAction({
  args: { jobId: v.id("menuExtractionJobs"), generation: v.number() },
  handler: async (ctx, args) => {
    try {
      const { valid, job } = await validateJobForStage(
        ctx,
        args.jobId,
        args.generation
      )
      if (!valid) return
      if (!job.cleanedText) throw new Error("Job not found")

      const model = createLanguageModel(EXTRACTION_MODEL)
      const { object } = await generateObject({
        model,
        schema: sizesSchema,
        prompt: `${SIZES_PROMPT}\n\nMENU:\n${job.cleanedText}`,
      })

      await ctx.runMutation(
        internal.system.menuExtractionPipeline.updateJobExtractedSizes,
        {
          jobId: args.jobId,
          status: "extracting_products",
          extractedSizes: JSON.stringify(object),
        }
      )

      await ctx.scheduler.runAfter(
        0,
        internal.system.menuExtractionActions.stageProducts,
        { jobId: args.jobId, generation: args.generation }
      )
    } catch (error) {
      await ctx.runMutation(
        internal.system.menuExtractionPipeline.updateJobStatus,
        {
          jobId: args.jobId,
          status: "failed",
          error:
            error instanceof Error ? error.message : "Error extrayendo tamanos",
          failedAtStage: "extracting_sizes",
          generation: args.generation,
        }
      )
    }
  },
})

export const stageProducts = internalAction({
  args: { jobId: v.id("menuExtractionJobs"), generation: v.number() },
  handler: async (ctx, args) => {
    try {
      const { valid, job } = await validateJobForStage(
        ctx,
        args.jobId,
        args.generation
      )
      if (!valid) return
      if (!job.cleanedText) throw new Error("Job not found")

      const categories = safeJsonParse<{ categories: Array<{ name: string }> }>(
        job.extractedCategories,
        { categories: [] }
      )
      const subcategories = safeJsonParse<{
        subcategories: Array<{ name: string; category: string }>
      }>(job.extractedSubcategories, { subcategories: [] })
      const sizes = safeJsonParse<{ sizes: Array<{ name: string }> }>(
        job.extractedSizes,
        { sizes: [] }
      )

      const context = {
        categories: categories.categories.map((c) => c.name),
        subcategories: subcategories.subcategories,
        sizes: sizes.sizes.map((s) => s.name),
      }

      const model = createLanguageModel(EXTRACTION_MODEL)
      const { object } = await generateObject({
        model,
        schema: productsSchema,
        prompt: `${PRODUCTS_PROMPT(context)}\n\nMENU:\n${job.cleanedText}`,
        maxOutputTokens: 16000,
      })

      await ctx.runMutation(
        internal.system.menuExtractionPipeline.updateJobExtractedProducts,
        {
          jobId: args.jobId,
          status: "completed",
          extractedProducts: JSON.stringify(object),
        }
      )
    } catch (error) {
      await ctx.runMutation(
        internal.system.menuExtractionPipeline.updateJobStatus,
        {
          jobId: args.jobId,
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "Error extrayendo productos",
          failedAtStage: "extracting_products",
          generation: args.generation,
        }
      )
    }
  },
})
