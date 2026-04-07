import z from "zod"
import { internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import { createValidationMenuAgent } from "../agents/validationMenuAgent"
import { createTaggedTool } from "./toolWrapper"

// Definición de tipos para la estructura compleja de salida
export interface ValidationResult {
  valid: boolean
  message: string
  items?: Array<{
    menuProducts: string[]
    quantity: number
    notes?: string
    unitPrice?: number
    totalPrice?: number
    productName?: string
    productDescription?: string
    productCategoryName?: string
  }>
  orderSummary?: {
    subtotal: number
    total: number
  }
}

export const askCombinationValidation = createTaggedTool({
  description:
    "Valida combinaciones de productos a partir de una descripción en lenguaje natural y reglas de negocio del menú. Retorna validez, explicación para el flujo y la estructura técnica validada con IDs internos reales.",
  args: z.object({
    orderDescription: z
      .string()
      .describe(
        "Descripción del pedido con nombres de productos. Ejemplo: 'El cliente quiere un plato con porción dividida pepperoni y porción dividida hawaiana grande, con extra de queso, y dos bebidas'"
      ),
    locationId: z
      .string()
      .describe(
        "ID de la ubicación del restaurante para verificar disponibilidad de productos"
      ),
  }),
  handler: async (ctx, args): Promise<string> => {
    if (!ctx.threadId) {
      return "Error: Falta el ID del hilo"
    }

    // Get conversation to get organization ID
    const conversation = await ctx.runQuery(
      internal.system.conversations.getByThreadId,
      { threadId: ctx.threadId }
    )
    if (!conversation) {
      return "Error: Conversación no encontrada"
    }
    const organizationId = conversation.organizationId

    // Validate location ID
    const locationId = await ctx.runQuery(
      internal.system.restaurantLocations.validateId,
      { id: args.locationId }
    )
    if (!locationId) {
      return "Error: ID de la sucursal no tiene el formato válido. Por favor, elige una sucursal usando validateAddressTool"
    }

    try {
      // Get all available products for this organization and location
      const allProducts = await ctx.runQuery(
        internal.system.menuProducts.getMany,
        {
          organizationId,
          locationId: locationId as Id<"restaurantLocations">,
        }
      )

      if (allProducts.length === 0) {
        return "❌ Error: No hay productos disponibles en esta sucursal"
      }

      // Get categories for context
      const categories = await ctx.runQuery(
        internal.system.menuProductCategories.getAll,
        { organizationId }
      )

      const categoryMap: Record<string, string> = {}
      categories.forEach((category) => {
        categoryMap[category._id] = category.name
      })

      // Prepare product data for AI analysis
      const productData = allProducts.map((product) => ({
        id: product._id,
        name: product.name,
        description: product.description,
        price: product.price === 0 ? "SIN COSTO" : product.price,
        category: categoryMap[product.menuProductCategoryId] || "Sin categoría",
        categoryId: product.menuProductCategoryId,
        sizeId: product.sizeId,
        standAlone: product.standAlone,
        combinableHalf: product.combinableHalf,
        combinableWith: product.combinableWith,
        componentsId: product.componentsId,
        available: true, // Since we're filtering by location, all returned products are available
        instructions: product.instructions,
      }))

      // // Get agent configuration
      // const agentConfig = await ctx.runQuery(
      //   internal.system.agentConfiguration.getAgentConfiguration,
      //   {
      //     conversationId: conversation._id,
      //   }
      // )

      // Create validation menu agent
      const validationAgent = await createValidationMenuAgent(ctx, {
        conversationId: conversation._id,
      })

      const enrichmentThread = await ctx.runMutation(
        internal.system.conversations.createConversationChildThread,
        {
          conversationId: conversation._id,
          purpose: "combination-enrichment",
        }
      )

      // Separate divided portion products and full products for clearer identification
      const halfProducts = productData.filter((p) => p.combinableHalf === true)
      const fullProducts = productData.filter((p) => p.combinableHalf === false)

      const findIdsMessage = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAREA ESPECIAL: IDENTIFICACIÓN DE PRODUCTOS EN EL MENÚ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Para esta tarea específica, actúa como un experto en identificación de productos de un menú de restaurante.

Tu trabajo es analizar el pedido del cliente (en lenguaje natural) y encontrar los IDs exactos de cada producto, componente y elección usando el menú disponible y las descripciones de los productos, ademas de distinguir correctamente entre productos de PORCIÓN DIVIDIDA y productos COMPLETOS.

PRODUCTOS DISPONIBLES EN EL MENÚ:
Cada producto tiene un atributo "standAlone".
- standAlone: true -> Es un producto principal (ej: Pizza, Hamburguesa).
- standAlone: false -> Es un acompañamiento o extra que DEBE ir asociado a un principal (ej: Papas, Gaseosa, Extra Queso).

PRODUCTOS DE PORCIÓN DIVIDIDA (combinableHalf: true):
${JSON.stringify(halfProducts, null, 2)}

PRODUCTOS COMPLETOS (combinableHalf: false, algunos pueden tener 'componentsId'):
${JSON.stringify(fullProducts, null, 2)}

PEDIDO ORIGINAL DEL CLIENTE:
"${args.orderDescription}"

SUCURSAL SELECCIONADA:
ID: ${args.locationId}

TU TAREA:
Analiza el pedido del cliente e identifica TODOS los productos, componentes y elecciones encontrando sus IDs o menciones exactas en el menú disponible.

     REGLAS CRÍTICAS PARA IDENTIFICACIÓN:

     1. PRODUCTOS DE PORCIÓN DIVIDIDA:
        - Si el cliente dice "media porción X", "mitad X", "medio X" o "producto mitad X y mitad Y"
        - OBLIGATORIO: Buscar en "PRODUCTOS DE PORCIÓN DIVIDIDA (combinableHalf: true)"
        - Usar SOLO IDs de productos que tengan "combinableHalf: true"
        - NUNCA usar IDs de productos completos para representar porciones divididas
        - Ejemplo: "media porción pepperoni" → Buscar producto llamado "Producto Mitad Pepperoni" con "combinableHalf: true"

     2. PRODUCTOS COMPLETOS:
        - Si el cliente dice "producto X" (sin mencionar "mitad" o "media")
        - Buscar en "PRODUCTOS COMPLETOS (combinableHalf: false)"
        - Usar IDs de productos que tengan "combinableHalf: false"
        - Ejemplo: "producto pepperoni" → Buscar "Producto Pepperoni" con "combinableHalf: false"

     3. COMBINACIONES DE DOS MITADES:
        - REGLA FUNDAMENTAL: Cuando el cliente pida "producto mitad X mitad Y", necesitas identificar DOS productos de porción dividida
        - AMBOS productos deben tener "combinableHalf: true"
        - NUNCA usar un producto completo como base
        - Ejemplo CORRECTO: "producto mitad pepperoni mitad hawaiana"
          → Identificar: "Producto Mitad Pepperoni" (combinableHalf: true) + "Producto Mitad Hawaiana" (combinableHalf: true)
        - Ejemplo INCORRECTO: Usar "Producto Pepperoni Completo" + "Producto Mitad Hawaiana"

     4. MANEJO DE ADICIONES (EXTRAS vs. COMPONENTES vs. ELECCIONES INCLUIDAS):
        Cuando un cliente pide "Producto A con Elemento B":
     
        PASO A: BÚSQUEDA ESTRUCTURADA (componentsId) - MÁXIMA PRIORIDAD
        - Revisa si el ID de "Elemento B" existe en el array \`componentsId\` de "Producto A".
        - SI EXISTE: "Elemento B" es un COMPONENTE. Clasifícalo como \`TIPO: COMPONENTE\`.
     
        PASO B: BÚSQUEDA SEMÁNTICA (Descripción del producto) - SEGUNDA PRIORIDAD
        - SI "Elemento B" NO está en \`componentsId\`, lee atentamente la \`description\` de "Producto A".
        - Busca frases como "incluye", "compuesto por", "a elegir entre", "acompañado de".
        - Si la descripción menciona "Elemento B" (o sinónimos) como una opción configurable (ej: "2 presas (PA, PP o AA)", "1 bebida (limonada o postobón)"), entonces "Elemento B" es una ELECCIÓN INCLUIDA.
        - Clasifícalo como \`TIPO: ELECCION_INCLUIDA\`. Estas no tienen un ID de producto propio, son una configuración.
     
        PASO C: TRATAMIENTO COMO EXTRA O PRODUCTO DEPENDIENTE (standAlone: false)
        - Si "Elemento B" NO es un componente (Paso A) NI una elección incluida (Paso B), búscalo en la lista general.
        - Si encuentras el producto y tiene \`standAlone: false\`:
          - DEBES identificar a qué producto principal ("standAlone: true") pertenece.
          - Usa el campo \`ASOCIADO_A\` con el ID del producto principal.
          - Ejemplo: "Hamburguesa con tocineta". Si Tocineta es standAlone: false, ASOCIADO_A: [ID_Hamburguesa].

     5. CANTIDADES:
        - Si el cliente menciona cantidades ("dos productos", "tres bebidas"), anótalo claramente
        - Identifica el ID del producto y especifica cuántas unidades

     6. COMBINACIÓN DE PRODUCTOS INDEPENDIENTES (standAlone: true + standAlone: true):
        - Un producto independiente (standAlone: true) puede combinarse con otro producto independiente
          si ALGUNO de los dos lo declara en su atributo \`combinableWith\` (vínculo unidireccional - basta con que UNA parte declare la relación).
        - Ejemplo: Si "Pizza" tiene en su combinableWith una referencia a la categoría de "Extra Queso", y "Extra Queso" es standAlone: true,
          entonces ambos pueden ir en el mismo orderItem.
        - Esto permite que productos que pueden venderse solos (como un adicional) también actúen como acompañamiento de otro producto principal.
        - Si NO existe vinculación combinableWith entre dos productos independientes, DEBEN ir en orderItems separados.
        - Para determinar vinculación, revisa el campo \`combinableWith\` de AMBOS productos: si alguno apunta al otro (por ID directo o por categoría), están vinculados.

      ESTRATEGIA DE IDENTIFICACIÓN FLEXIBLE:
      - Primero intenta encontrar coincidencias EXACTAS por nombre
      - Si no hay coincidencia exacta, busca productos SIMILARES considerando:
        - Sinónimos comunes (ej: "pollo" = "chicken", "champiñones" = "hongos", "jamón" = "jamon")
        - Variaciones de nombres (ej: "pollo queso" podría ser "pollo queso champiñones")
        - Ingredientes principales (ej: si pide "plato de pollo", busca platos que contengan "pollo" en nombre o descripción)
        - Productos que contengan los términos clave mencionados por el cliente
      - Si encuentras múltiples candidatos similares, elige el más probable basado en:
        - Mayor cantidad de ingredientes coincidentes
        - Popularidad/común en el menú
        - Similitud semántica
      - Para candidatos similares, incluye una sugerencia de CONFIRMACIÓN para el cliente
      - Solo marca como "NO_DISPONIBLE" si realmente no hay productos relacionados o similares

      EJEMPLOS DE IDENTIFICACIÓN FLEXIBLE:
      - Cliente pide "plato pollo queso" → Encuentra "Pollo Queso Champiñones" → CONFIRMACIÓN: "¿Te refieres al plato de pollo con queso y champiñones?"
      - Cliente pide "plato margarita" → Encuentra "Plato Margherita" → Sin confirmación necesaria
      - Cliente pide "plato de carne" → No encuentra exacto → Busca productos con "carne" → Encuentra "Pollo BBQ" → CONFIRMACIÓN: "¿Te refieres al plato de pollo BBQ?"

      FORMATO DE RESPUESTA REQUERIDO:
      Para cada ítem, proporciona:
      
      PRODUCTO: [Nombre del producto/elección]
      ID: [ID exacto del producto, "NO_DISPONIBLE", o "NO_APLICA" para elecciones]
      TIPO: [PORCIÓN DIVIDIDA | COMPLETO | COMPONENTE | ELECCION_INCLUIDA | NO_ENCONTRADO]
      STANDALONE: [TRUE | FALSE] (Solo si tiene ID)
      ASOCIADO_A: [ID del producto padre si es COMPONENTE, ELECCION_INCLUIDA, o si es un producto standAlone: false (extra/side)]
      CANTIDAD: [Número de unidades, por defecto 1]
      RAZÓN: [Breve explicación de por qué lo clasificaste así]
      CONFIRMACIÓN: [OPCIONAL]
      
      EJEMPLO CON COMPONENTE: "hamburguesa especial con papas"
      (Asumiendo que 'Hamburguesa Especial' (ID: ham001) tiene \`componentsId: ["pap001"]\`)
      
      PRODUCTO 1: Hamburguesa Especial
      ID: ham001
      TIPO: COMPLETO
      STANDALONE: TRUE
      CANTIDAD: 1
      RAZÓN: Producto principal.
      
      PRODUCTO 2: Papas
      ID: pap001
      TIPO: COMPONENTE
      STANDALONE: FALSE
      ASOCIADO_A: ham001
      CANTIDAD: 1
      RAZÓN: Acompañamiento válido encontrado en 'componentsId' del producto padre.
      
      EJEMPLO CON EXTRA (standAlone: false): "Pizza con extra queso"
      
      PRODUCTO 1: Pizza
      ID: piz001
      TIPO: COMPLETO
      STANDALONE: TRUE
      CANTIDAD: 1
      
      PRODUCTO 2: Extra Queso
      ID: ext001
      TIPO: COMPLETO
      STANDALONE: FALSE
      ASOCIADO_A: piz001
      CANTIDAD: 1
      RAZÓN: Es un producto extra que no se vende solo, asociado a la pizza.

      EJEMPLO CON ELECCIÓN INCLUIDA: "Quiero el Combo Familiar con 2 presas PP y la limonada"
      (Asumiendo que Combo Familiar (ID: com001) tiene en su descripción: "Compuesto por 8 presas (PA, PP o AA)... y 2 bebidas pequeñas (limonada o postobón)")
      
      PRODUCTO 1: Combo Familiar
      ID: com001
      TIPO: COMPLETO
      STANDALONE: TRUE
      CANTIDAD: 1
      RAZÓN: Producto principal solicitado.
      
      PRODUCTO 2: 2 presas PP
      ID: NO_APLICA
      TIPO: ELECCION_INCLUIDA
      ASOCIADO_A: com001
      CANTIDAD: 1
      RAZÓN: Es una elección de configuración para las presas, mencionada en la descripción del combo.
      
      PRODUCTO 3: Limonada
      ID: NO_APLICA
      TIPO: ELECCION_INCLUIDA
      ASOCIADO_A: com001
      CANTIDAD: 1
      RAZÓN: Es la elección de bebida, permitida según la descripción del combo.
      
      EJEMPLO DE RESPUESTA CON EXTRA: "plato pepperoni con extra queso"
      (Asumiendo que 'Plato Pepperoni' no tiene 'Extra Queso' en sus componentsId)
      
      PRODUCTO 1: Plato Pepperoni
      ID: piz123
      TIPO: COMPLETO (combinableHalf: false)
      STANDALONE: TRUE
      CANTIDAD: 1
      RAZÓN: Producto principal solicitado.
      
      PRODUCTO 2: Extra Queso
      ID: ext789
      TIPO: COMPLETO (combinableHalf: false)
      STANDALONE: FALSE
      ASOCIADO_A: piz123
      CANTIDAD: 1
      RAZÓN: Adición solicitada que no es un componente predefinido, se trata como un producto extra asociado al plato.

      EJEMPLO CON IDENTIFICACIÓN FLEXIBLE PARA "plato de pollo queso":

      PRODUCTO 1: Pollo Queso Champiñones
      ID: xyz789
      TIPO: COMPLETO (combinableHalf: false)
      STANDALONE: TRUE
      CANTIDAD: 1
      RAZÓN: Producto similar encontrado - contiene pollo y queso como solicitado
      CONFIRMACIÓN: "¿Te refieres al plato de pollo con queso y champiñones?"

     EJEMPLO DE RESPUESTA CUANDO UN PRODUCTO NO ESTÁ DISPONIBLE:

     PRODUCTO 5: Plato de Anchoas
     ID: NO_DISPONIBLE
     TIPO: NO_ENCONTRADO
     CANTIDAD: 1
     RAZÓN: El cliente solicitó "plato de anchoas" pero no existe ningún producto con ese nombre o sabor en el menú disponible

     CRÍTICO - MANEJO DE PRODUCTOS NO DISPONIBLES:
     - Si el cliente menciona un producto que NO existe en el menú, debes incluirlo en tu respuesta
     - Usa "ID: NO_DISPONIBLE" para indicar que no se encontró
     - Usa "TIPO: NO_ENCONTRADO" para productos que no existen
     - En RAZÓN explica claramente que el producto no está en el menú y qué buscaste
     - Esto permite informar al cliente qué productos específicamente no están disponibles

     VERIFICACIÓN FINAL:
     - Revisa que todos los IDs de productos encontrados existan en el menú disponible
     - Confirma que los productos de porción dividida tengan "combinableHalf: true"
     - Confirma que los productos completos tengan "combinableHalf: false"
     - Asegúrate de haber identificado TODOS los productos mencionados en el pedido (incluidos los no disponibles)
     - Para productos no encontrados, indica claramente "NO_DISPONIBLE" como ID
     - VERIFICA que todo producto con STANDALONE: FALSE tenga un ASOCIADO_A válido.
     - Para productos con STANDALONE: TRUE que van juntos, verifica que exista vinculación combinableWith entre ellos.

     EJEMPLO DE COMBINACIÓN DE PRODUCTOS INDEPENDIENTES:
     (Asumiendo que 'Pizza Pepperoni' (ID: piz001, standAlone: true) tiene en su combinableWith la categoría de 'Extras',
      y 'Extra Queso' (ID: ext001, standAlone: true) pertenece a la categoría 'Extras')
     
     PRODUCTO 1: Pizza Pepperoni
     ID: piz001
     TIPO: COMPLETO
     STANDALONE: TRUE
     CANTIDAD: 1
     RAZÓN: Producto principal solicitado.
     
     PRODUCTO 2: Extra Queso
     ID: ext001
     TIPO: COMPLETO
     STANDALONE: TRUE
     VINCULADO_A: piz001 (Pizza lo declara en combinableWith → categoría Extras)
     CANTIDAD: 1
     RAZÓN: Producto independiente que se combina con la pizza por vinculación combinableWith.

     Ahora identifica todos los productos del pedido del cliente, distinguiendo claramente entre productos completos, componentes (de componentsId) y elecciones incluidas (de la descripción).
     `

      // Use the enrichment agent with the thread to capture metadata
      const { thread: enrichmentAgentThread } =
        await validationAgent.continueThread(ctx, {
          threadId: enrichmentThread.threadId,
        })

      const { messageId: enrichmentMessageId } =
        await validationAgent.saveMessage(ctx, {
          threadId: enrichmentThread.threadId,
          prompt: findIdsMessage,
        })

      const enrichmentResponse = await enrichmentAgentThread.generateText({
        promptMessageId: enrichmentMessageId,
      })

      const findIdsPrompt = enrichmentResponse.text

      console.log(
        "🎤 [VALIDAR COMBINACIÓN] Prompt de identificación de productos:",
        findIdsPrompt
      )

      // Log de productos de porción dividida para debug
      console.log(
        "🔍 [DEBUG] Productos de porción dividida disponibles:",
        halfProducts
          .map(
            (p) =>
              `${p.name} (ID: ${p.id}, combinableHalf: ${p.combinableHalf})`
          )
          .join(", ")
      )
      const validationThread = await ctx.runMutation(
        internal.system.conversations.createConversationChildThread,
        {
          conversationId: conversation._id,
          purpose: "combination-validation",
        }
      )

      // Prepare the validation message with both original order and enriched IDs
      const validationMessage = `
PEDIDO ORIGINAL DEL CLIENTE:
"${args.orderDescription}"

PRODUCTOS IDENTIFICADOS CON SUS IDS Y TIPOS:
${findIdsPrompt}

SUCURSAL SELECCIONADA:
ID: ${args.locationId}

TU TAREA:
1. Revisar si hay productos NO DISPONIBLES (ID: NO_DISPONIBLE) e informarlos.
2. Para productos disponibles: estructurar los orderItems agrupando inteligentemente y validar con validateMenuCombinationsTool.
3. Proporcionar una respuesta completa (no disponibles + validación + confirmaciones).

INSTRUCCIONES PARA ESTRUCTURACIÓN:
1. Usa EXACTAMENTE los IDs proporcionados.
2. EXCLUYE productos con "ID: NO_DISPONIBLE".
3. REGLA CLAVE PARA COMPONENTES Y ELECCIONES:
   - Si un producto tiene \`TIPO: COMPONENTE\` o \`TIPO: ELECCION_INCLUIDA\`:
     - NO incluyas su ID en el array \`menuProducts\`.
     - En su lugar, añade o concatena su descripción en la propiedad \`note\` del \`orderItem\` de su producto padre (identificado por \`ASOCIADO_A\`).
     - Esto anula la validación de combinación para ese ítem, tratándolo como una configuración.
4. REGLA CLAVE PARA PRODUCTOS DEPENDIENTES (EXTRAS/SIDES con standAlone: false):
   - Si un producto tiene \`STANDALONE: FALSE\` y tiene un ID válido:
     - DEBE ser incluido en el mismo \`orderItem\` que su producto padre (\`ASOCIADO_A\`).
     - Añade su ID al array \`menuProducts\` del \`orderItem\` que contiene al padre.
     - NO crees un \`orderItem\` separado para él.
5. Para todos los demás productos (Productos principales standAlone: true), crea \`orderItems\` separados o agrúpalos según corresponda:
  - Porciones divididas que van juntas → mismo orderItem.
  - Productos independientes (standAlone: true) vinculados por combinableWith → mismo orderItem. Incluye sus IDs en el mismo array \`menuProducts\`.
  - Productos independientes SIN vinculación combinableWith → orderItems separados.

CONFIRMACIONES PENDIENTES:
- Si hay productos con campo CONFIRMACIÓN, incluye al final una sección:
  ❓ CONFIRMACIONES PENDIENTES:
  - Para [Producto]: [Pregunta de confirmación]

EJEMPLO DE ESTRUCTURACIÓN:
Si los productos identificados son:
- Producto Mitad Pepperoni (ID: abc123, TIPO: PORCIÓN DIVIDIDA)
- Producto Mitad Hawaiana (ID: def456, TIPO: PORCIÓN DIVIDIDA)
- Extra Queso (ID: ghi789, STANDALONE: FALSE, ASOCIADO_A: abc123)
- Hamburguesa Especial (ID: ham001, TIPO: COMPLETO, STANDALONE: TRUE)
- Papas (ID: pap001, TIPO: COMPONENTE, ASOCIADO_A: ham001)
- Limonada (ID: NO_APLICA, TIPO: ELECCION_INCLUIDA, ASOCIADO_A: ham001)

Debes estructurar como:
orderItems: [
  { menuProducts: ["abc123", "def456", "ghi789"], quantity: 1 },  // Producto combinado con extra asociado a una de las mitades
  { menuProducts: ["ham001"], quantity: 1, note: "Con Papas; Con Limonada" },
]

EJEMPLO 2 - PRODUCTOS INDEPENDIENTES VINCULADOS POR COMBINABLEWITH:
Si los productos identificados son:
- Pizza Pepperoni (ID: piz001, TIPO: COMPLETO, STANDALONE: TRUE)
- Extra Queso (ID: ext001, TIPO: COMPLETO, STANDALONE: TRUE, VINCULADO_A: piz001)
- Extra Tocineta (ID: ext002, TIPO: COMPLETO, STANDALONE: TRUE, VINCULADO_A: piz001)
- Coca Cola (ID: beb001, TIPO: COMPLETO, STANDALONE: TRUE, SIN vinculación)

Debes estructurar como:
orderItems: [
  { menuProducts: ["piz001", "ext001", "ext002"], quantity: 1 },  // Pizza con extras vinculados por combinableWith
  { menuProducts: ["beb001"], quantity: 1 },  // Bebida aparte, sin vinculación
]

PASO FINAL:
Envía la estructura completa a validateMenuCombinationsTool para que valide las combinaciones según las reglas de negocio.
`
      const { thread: validationAgentThread } =
        await validationAgent.continueThread(ctx, {
          threadId: validationThread.threadId,
        })
      // Generate response using the validation agent
      const { messageId } = await validationAgent.saveMessage(ctx, {
        threadId: validationThread.threadId,
        prompt: validationMessage,
      })
      const validationResponse = await validationAgentThread.generateText({
        promptMessageId: messageId,
      })
      console.log(
        "🎤 [VALIDAR COMBINACIÓN] Respuesta del agente de validación:",
        validationResponse.text
      )

      return validationResponse.text
    } catch (error) {
      console.error("Error al validar combinación de productos:", error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      return `Error al validar la combinación: ${errorMessage}. Por favor, inténtalo de nuevo.`
    }
  },
})
