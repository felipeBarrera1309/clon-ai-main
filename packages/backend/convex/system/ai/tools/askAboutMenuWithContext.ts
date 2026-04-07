import z from "zod"
import { internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import { createMenuQuestionAgentWithContext } from "../agents/menuQuestionAgentWithContext"
import { createTaggedTool } from "./toolWrapper"

export const askAboutMenuWithContext = createTaggedTool({
  description:
    "Responde preguntas de menú con búsqueda contextual de productos disponibles por organización y, opcionalmente, por sucursal. Retorna información legible de productos, precios y disponibilidad sin exponer IDs internos al cliente. Si validateAddressTool ya se ejecutó, usa el restaurantLocationId de su respuesta como locationId.",
  args: z.object({
    question: z
      .string()
      .describe(
        "Cualquier pregunta sobre el menú en lenguaje natural (ej: 'muéstrame el menú completo', '¿qué productos vegetarianos tienen?', '¿cuál es el precio de las pizzas grandes?', '¿qué postres tienen?')"
      ),
    locationId: z
      .string()
      .optional()
      .describe(
        "ID de la ubicación del restaurante (opcional) - limita la consulta a productos disponibles en esa sucursal. IMPORTANTE: Si el cliente validó su dirección con validateAddressTool, usa el restaurantLocationId del [INTERNAL_INFO] que apareció en la respuesta."
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

    let locationId: Id<"restaurantLocations"> | undefined
    if (args.locationId) {
      const maybeId = await ctx.runQuery(
        internal.system.restaurantLocations.validateId,
        { id: args.locationId }
      )
      if (!maybeId) {
        return "Error: Id de la sucursal no tiene el formato de Id válido"
      }
      locationId = maybeId
    }

    try {
      // Get ALL products with OPTIMIZED fields using getManyWithSizeAndCategoryAndAvailabilityForAI
      // This query gets all products (not limited by category) and returns only essential fields
      const productsData = await ctx.runQuery(
        internal.system.menuProducts
          .getManyWithSizeAndCategoryAndAvailabilityForAI,
        {
          organizationId: conversation.organizationId,
          restaurantLocationId: locationId,
        }
      )

      // Build inverse relationships map
      const incomingMap = new Map<string, Set<string>>()
      for (const p of productsData) {
        if (p.combinableWith) {
          for (const combo of p.combinableWith) {
            if (!incomingMap.has(combo.categoryName)) {
              incomingMap.set(combo.categoryName, new Set())
            }
            incomingMap
              .get(combo.categoryName)!
              .add(p.category || "Sin categoría")
          }
        }
      }

      // Estadísticas del mapa inverso
      const incomingCategoriesCount = incomingMap.size
      const totalIncomingCombinations = Array.from(incomingMap.values()).reduce(
        (sum, set) => sum + set.size,
        0
      )

      // Debug logging: Resumen compacto del mapa inverso
      console.log(
        `🔍 [DEBUG] Mapa inverso: ${incomingCategoriesCount} categorías con relaciones entrantes, ${totalIncomingCombinations} combinaciones totales`
      )

      // Format products for the menu question agent (only essential fields)
      const formattedProducts = productsData.map((p) => {
        const outgoing = p.combinableWith || []
        const incoming = Array.from(
          incomingMap.get(p.category || "Sin categoría") || []
        ).map((cat) => ({
          categoryName: cat,
          sizeName: null,
        }))

        return {
          name: p.name,
          description: p.description || undefined, // Only include if not empty
          price: p.price === 0 ? "SIN COSTO" : p.price,
          category: p.category || "Sin categoría", // Already converted from ID to name by query
          size: p.size || null, // Already converted from ID to name by query
          standAlone: p.standAlone,
          combinableHalf: p.combinableHalf,
          combinableWith: { outgoing, incoming },
          instructions: p.instructions || undefined,
        }
      })

      // Estadísticas de productos
      const totalProducts = formattedProducts.length
      const productsWithRelations = formattedProducts.filter(
        (p) =>
          p.combinableWith.outgoing.length > 0 ||
          p.combinableWith.incoming.length > 0
      ).length

      // Debug logging: Resumen general y productos con relaciones en formato compacto
      console.log(
        `🔍 [DEBUG] Total productos: ${totalProducts}, con relaciones: ${productsWithRelations}`
      )
      console.log("🔍 [DEBUG] Productos con relaciones:")
      formattedProducts
        .filter(
          (p) =>
            p.combinableWith.outgoing.length > 0 ||
            p.combinableWith.incoming.length > 0
        )
        .forEach((product) => {
          const outgoingNames = product.combinableWith.outgoing
            .map((c) => c.categoryName)
            .join(", ")
          const incomingNames = product.combinableWith.incoming
            .map((c) => c.categoryName)
            .join(", ")
          console.log(
            `Producto: ${product.name} (${product.category}) | Out: [${outgoingNames}] | In: [${incomingNames}]`
          )
        })

      // Create menu question agent with products in context
      const menuQuestionAgent = await createMenuQuestionAgentWithContext(ctx, {
        conversationId: conversation._id,
        availableProducts: formattedProducts,
      })

      // Create and register a conversation child thread with parent linkage.
      const menuThread = await ctx.runMutation(
        internal.system.conversations.createConversationChildThread,
        {
          conversationId: conversation._id,
          purpose: "menu-context",
        }
      )

      // Prepare the question message
      const questionMessage = `
PREGUNTA DEL CLIENTE:
"${args.question}"

${locationId ? `UBICACIÓN: ${locationId}` : ""}

INSTRUCCIONES:
Usa la información del menú disponible en tu contexto para responder la pregunta del cliente.
Sé específico, amigable y útil en tu respuesta.
`

      // Use the menu question agent with the thread
      const { thread: menuQuestionAgentThread } =
        await menuQuestionAgent.continueThread(ctx, {
          threadId: menuThread.threadId,
        })

      // Generate response using the menu question agent
      const { messageId } = await menuQuestionAgent.saveMessage(ctx, {
        threadId: menuThread.threadId,
        prompt: questionMessage,
      })

      const menuResponse = await menuQuestionAgentThread.generateText({
        promptMessageId: messageId,
      })

      console.log(
        "🎤 [PREGUNTA MENÚ CON CONTEXTO] Respuesta del agente de preguntas sobre menú:",
        menuResponse.text
      )

      // Add instruction for the agent to communicate this information to the user
      return `${menuResponse.text}

---
⚠️ RECORDATORIO IMPORTANTE: Esta información del menú NO es visible para el usuario. Debes comunicarle esta información en tu siguiente respuesta de forma clara y amigable.`
    } catch (error) {
      console.error("Error al procesar pregunta sobre menú:", error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      return `Error al procesar tu consulta sobre el menú: ${errorMessage}. Por favor, inténtalo de nuevo o contacta con el restaurante para más información.`
    }
  },
})
