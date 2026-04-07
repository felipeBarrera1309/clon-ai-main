import { z } from "zod"

export const extractedOptionSchema = z.object({
  productName: z
    .string()
    .describe(
      "Nombre del producto tal como aparece en el menú. Se emparejará con menuProducts después."
    ),
  upcharge: z
    .number()
    .default(0)
    .describe(
      "Recargo adicional al precio base del combo (en pesos colombianos, entero). 0 si no hay recargo."
    ),
  isDefault: z
    .boolean()
    .default(false)
    .describe("true si esta opción viene seleccionada por defecto en el combo"),
})

export const extractedSlotSchema = z.object({
  name: z
    .string()
    .describe(
      "Nombre del slot/categoría de selección (ej: 'Escoge tu proteína', 'Bebida', 'Acompañamiento')"
    ),
  minSelections: z
    .number()
    .int()
    .default(1)
    .describe(
      "Mínimo de opciones que el cliente debe seleccionar en este slot. Normalmente 1."
    ),
  maxSelections: z
    .number()
    .int()
    .default(1)
    .describe(
      "Máximo de opciones que el cliente puede seleccionar en este slot. Normalmente 1."
    ),
  options: z
    .array(extractedOptionSchema)
    .min(1)
    .describe("Lista de opciones disponibles dentro de este slot"),
})

export const extractedComboSchema = z.object({
  name: z
    .string()
    .describe("Nombre del combo (ej: 'Combo Familiar', 'Combo Personal')"),
  description: z
    .string()
    .describe(
      "Descripción breve y atractiva del combo. Si no existe en el menú, generar una basada en su contenido."
    ),
  basePrice: z
    .number()
    .int()
    .describe(
      "Precio base del combo en pesos colombianos (entero, sin decimales). " +
        "Si el menú muestra un precio único, ese es el basePrice y los upcharges de opciones son 0."
    ),
  slots: z
    .array(extractedSlotSchema)
    .min(1)
    .describe(
      "Slots de selección del combo. Cada slot agrupa opciones que el cliente puede elegir."
    ),
})

export const extractedCombosSchema = z.object({
  combos: z
    .array(extractedComboSchema)
    .describe("Lista de todos los combos extraídos del menú"),
})

export type ExtractedOption = z.infer<typeof extractedOptionSchema>
export type ExtractedSlot = z.infer<typeof extractedSlotSchema>
export type ExtractedCombo = z.infer<typeof extractedComboSchema>
export type ExtractedCombos = z.infer<typeof extractedCombosSchema>

export const COMBO_EXTRACTION_PROMPT = `Eres un experto en análisis de menús de restaurantes colombianos. Tu tarea es extraer TODOS los combos y promociones del menú.

DEFINICIÓN DE COMBO:
Un combo es un paquete que agrupa varios productos con un precio especial. Tiene:
- Un nombre (ej: "Combo Familiar", "Combo Personal", "Almuerzo Ejecutivo")
- Un precio base
- Uno o más "slots" (categorías de selección) donde el cliente elige opciones

CÓMO IDENTIFICAR SLOTS:
- Busca frases como "Escoge tu:", "Incluye:", "Selecciona:", "Elige entre:"
- Cada grupo de opciones forma un slot
- Ejemplo: "Escoge tu proteína: Pollo, Carne, Cerdo" → slot "Proteína" con 3 opciones
- Si un combo incluye un producto fijo (ej: "Incluye papas fritas"), créalo como un slot con una sola opción

CÓMO MANEJAR PRECIOS:
- basePrice: El precio principal del combo
- upcharge: Recargo adicional por opciones premium (ej: "Carne premium +$3.000" → upcharge: 3000)
- Si todas las opciones tienen el mismo precio, upcharge es 0 para todas
- Convierte formatos como "25.000" o "25,000" a número entero: 25000

CÓMO MANEJAR SELECCIONES:
- minSelections: Cuántas opciones DEBE elegir el cliente (normalmente 1)
- maxSelections: Cuántas opciones PUEDE elegir el cliente (normalmente 1)
- Si dice "escoge hasta 2 acompañamientos" → min: 1, max: 2
- Si dice "incluye" (obligatorio) → min: 1, max: 1

INSTRUCCIONES ADICIONALES:
1. Extrae TODOS los combos visibles en el menú
2. Si un combo no tiene descripción, genera una breve y atractiva en español colombiano
3. Los nombres de productos en las opciones deben coincidir lo más posible con los nombres del menú
4. NO incluyas productos individuales que no sean parte de un combo
5. Si no hay combos en el menú, devuelve un array vacío

REGLAS CRÍTICAS:
- Precios siempre como números enteros (pesos colombianos)
- Cada combo DEBE tener al menos 1 slot
- Cada slot DEBE tener al menos 1 opción
- isDefault: true solo para la opción que viene por defecto (máximo 1 por slot)
- productName debe ser el nombre del producto tal como aparece en el menú`
