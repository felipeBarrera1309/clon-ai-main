import { z } from "zod"

// Schema for Stage 0: Multimodal cleaning output
export const cleanedMenuTextSchema = z.object({
  cleanedText: z
    .string()
    .describe(
      "Texto limpio y estructurado del menú, con secciones claramente delimitadas. " +
        "Cada archivo fuente debe estar anotado con '=== ARCHIVO: nombre.ext ==='. " +
        "Corregir errores de OCR, normalizar formato, eliminar duplicados entre archivos."
    ),
  isMenu: z
    .boolean()
    .describe(
      "true si el contenido es un menú de restaurante, false si no lo es"
    ),
  rejectionReason: z
    .optional(z.string())
    .describe(
      "Si isMenu es false, explicar por qué el contenido no es un menú"
    ),
})

// Schema for Stage 1: Categories extraction
export const categoriesSchema = z.object({
  categories: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            "Nombre de la categoría principal del menú (ej: Pizzas, Bebidas, Entradas)"
          ),
      })
    )
    .describe("Lista de categorías principales del menú"),
})

// Schema for Stage 2: Subcategories extraction
export const subcategoriesSchema = z.object({
  subcategories: z
    .array(
      z.object({
        name: z.string().describe("Nombre de la subcategoría"),
        category: z
          .string()
          .describe(
            "Nombre EXACTO de la categoría padre (debe coincidir con una categoría extraída)"
          ),
      })
    )
    .describe("Lista de subcategorías del menú"),
})

// Schema for Stage 3: Sizes extraction
export const sizesSchema = z.object({
  sizes: z
    .array(
      z.object({
        name: z
          .string()
          .describe("Nombre del tamaño (ej: Personal, Mediana, Grande, 330ml)"),
      })
    )
    .describe("Lista de tamaños disponibles para productos"),
})

// Schema for Stage 4: Products extraction
export const productsSchema = z.object({
  products: z
    .array(
      z.object({
        name: z.string().describe("Nombre del producto"),
        description: z
          .string()
          .describe(
            "Descripción breve y atractiva del producto (NUNCA vacía, generar si no existe)"
          ),
        category: z
          .string()
          .describe(
            "Nombre EXACTO de la categoría (debe coincidir con una categoría extraída)"
          ),
        subcategory: z
          .string()
          .nullable()
          .describe("Nombre exacto de subcategoría o null"),
        size: z.string().nullable().describe("Nombre exacto de tamaño o null"),
        price: z
          .number()
          .describe("Precio en pesos colombianos (entero, sin decimales)"),
        standAlone: z
          .boolean()
          .describe(
            "true si se puede pedir solo (pizzas, hamburguesas, bebidas), false para extras/adiciones"
          ),
        combinableHalf: z
          .boolean()
          .describe(
            "true si se puede combinar como mitad (ej: mitad y mitad de pizza)"
          ),
        combinableWithCategories: z
          .array(z.string())
          .nullable()
          .describe(
            "Categorías con las que se puede combinar, o null si es independiente"
          ),
        instructions: z
          .string()
          .nullable()
          .describe("Instrucciones especiales de preparación, o null"),
      })
    )
    .describe("Lista completa de productos del menú"),
})

export type CleanedMenuText = z.infer<typeof cleanedMenuTextSchema>
export type CategoriesExtraction = z.infer<typeof categoriesSchema>
export type SubcategoriesExtraction = z.infer<typeof subcategoriesSchema>
export type SizesExtraction = z.infer<typeof sizesSchema>
export type ProductsExtraction = z.infer<typeof productsSchema>
