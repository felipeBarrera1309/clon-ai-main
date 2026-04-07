import z from "zod"
import { internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import { createTaggedTool } from "./toolWrapper"

// Type for combinableWith array items from schema
type CombinableWithRule = {
  menuProductCategoryId: Id<"menuProductCategories">
  sizeId?: Id<"sizes">
  menuProductId?: Id<"menuProducts">
}

export const validateMenuCombinations = createTaggedTool({
  description:
    "Validar ítems de pedido antes de crear una orden. Cada ítem representa una unidad lógica que el cliente ordenaría (ej: 1 plato completo, 1 bebida, 1 plato con extras). REGLAS CRÍTICAS: 1) Un producto independiente (standalone) por ítem, EXCEPTO cuando múltiples productos independientes están vinculados entre sí mediante reglas de combinación (combinableWith) - en ese caso pueden ir en el mismo ítem. 2) Dos productos de medio (combinableHalf) forman UN ítem completo. 3) Productos no independientes (extras/acompañamientos) se combinan con productos independientes en el mismo ítem. 4) La cantidad indica cuántas unidades de ese ítem completo quiere el cliente. RETORNA: Información detallada de todos los productos validados con sus propiedades, combinaciones realizadas, y resultado de validación para cada ítem. IMPORTANTE: El usuario NO VE la respuesta de esta herramienta - DEBES comunicarle SOLO la información relevante (resultado de validación, precios) de forma NATURAL, SIN enviar datos técnicos (JSON, secciones ===, ITEMS_JSON).",
  args: z.object({
    orderItems: z
      .array(
        z.object({
          menuProducts: z
            .array(z.string())
            .describe(
              "Array de IDs internos de Convex de productos del menú que forman este ítem de pedido. Deben venir de askCombinationValidationTool o searchMenuProductsTool (nunca nombres ni IDs inventados). REGLAS: Solo 1 producto standalone por ítem (excepto productos de medio que van en pares), más cualquier producto no-standalone que se combine con él"
            ),
          quantity: z
            .number()
            .describe(
              "Cantidad de este ítem de pedido completo que el cliente quiere"
            ),
          notes: z
            .string()
            .optional()
            .describe("Notas especiales para este ítem de pedido (opcional)"),
        })
      )
      .describe(
        "Lista de ítems de pedido a validar. Cada ítem es una unidad lógica completa que el cliente ordenaría"
      ),
    restaurantLocationId: z
      .string()
      .describe(
        "ID del restaurante para verificar disponibilidad. Restaurante seleccionado tras usar validateAddressTool. Obligatorio"
      ),
  }),
  handler: async (ctx, args): Promise<string> => {
    if (!ctx.threadId) {
      return "Error: Falta el ID del hilo"
    }

    // // Get conversation to get organization ID
    // const conversation = await ctx.runQuery(
    //   internal.system.conversations.getByThreadId,
    //   { threadId: ctx.threadId }
    // )

    // if (!conversation) {
    //   return "Error: Conversación no encontrada"
    // }

    // const organizationId = conversation.organizationId

    try {
      // Validate each combination
      const validationResults: string[] = []
      const detailedResults: {
        itemIndex: number
        isValid: boolean
        products: Array<{
          id: string
          name: string
          description: string | null | undefined
          category: string | null | undefined
          size: string | null | undefined
          price: number
          standAlone: boolean
          combinableHalf: boolean
          available: boolean
          instructions: string | null | undefined
        }>
        combination: {
          type:
            | "single_standalone"
            | "combinable_halves"
            | "standalone_with_extras"
            | "combinable_standalones"
            | "combinable_standalones_with_extras"
            | "mutual_non_standalone"
            | "mutual_non_standalone_with_extras"
            | "error"
          description: string
        }
        quantity: number
        errorMessage?: string
      }[] = []

      for (const [itemIndex, orderItem] of args.orderItems.entries()) {
        if (!orderItem) continue
        const itemNumber = itemIndex + 1

        // Get all products in this order item
        const productIds = orderItem.menuProducts.map(
          (id) => id as Id<"menuProducts">
        )
        const products = await ctx.runQuery(
          internal.system.menuProducts
            .getManyByIdsWithSizeAndCategoryAndAvailabilityForAI,
          {
            productIds,
            restaurantLocationId:
              args.restaurantLocationId as Id<"restaurantLocations">,
          }
        )

        // Check if all products exist and are available
        if (products.length !== productIds.length) {
          const foundProductIds = new Set(products.map((p) => p._id))
          const missingProductIds = productIds.filter(
            (id) => !foundProductIds.has(id)
          )
          const errorMessage = `Productos no encontrados o no pertenecen a la organización: ${missingProductIds.join(", ")}`
          validationResults.push(`❌ Ítem ${itemNumber}: ${errorMessage}`)

          detailedResults.push({
            itemIndex,
            isValid: false,
            products: products.map((p) => ({
              id: p._id,
              name: p.name,
              description: p.description,
              category: p.category,
              size: p.size,
              price: p.price,
              standAlone: p.standAlone,
              combinableHalf: p.combinableHalf,
              available: p.available,
              instructions: p.instructions,
            })),
            combination: {
              type: "error",
              description: "Productos no encontrados",
            },
            quantity: orderItem.quantity,
            errorMessage,
          })
          continue
        }

        // Check availability using the availability data returned by the products query
        const unavailableProducts = products.filter(
          (product) => !product.available
        )
        if (unavailableProducts.length > 0) {
          const unavailableNames = unavailableProducts
            .map((p) => `"${p.name}" (${p.category || "Sin categoría"})`)
            .join(", ")
          const errorMessage = `Productos no disponibles en esta sucursal: ${unavailableNames}`
          validationResults.push(`❌ Ítem ${itemNumber}: ${errorMessage}`)

          detailedResults.push({
            itemIndex,
            isValid: false,
            products: products.map((p) => ({
              id: p._id,
              name: p.name,
              description: p.description,
              category: p.category,
              size: p.size,
              price: p.price,
              standAlone: p.standAlone,
              combinableHalf: p.combinableHalf,
              available: p.available,
              instructions: p.instructions,
            })),
            combination: {
              type: "error",
              description: "Productos no disponibles",
            },
            quantity: orderItem.quantity,
            errorMessage,
          })
          continue
        }

        // Validate combination logic following exact business rules
        const validProducts = products as NonNullable<(typeof products)[0]>[]

        // Step 1: Look for standalone products
        const standaloneProducts = validProducts.filter((p) => p.standAlone)
        const nonStandaloneProducts = validProducts.filter((p) => !p.standAlone)

        // Step 2: If no standalone products and there are non-standalone products, check mutual combination with core and extras logic
        if (
          standaloneProducts.length === 0 &&
          nonStandaloneProducts.length > 0
        ) {
          // Log resumido: Número total de productos y estadísticas de combinaciones
          console.log(
            `[DEBUG] Validating ${nonStandaloneProducts.length} non-standalone products for mutual combinations`
          )

          // Paso 1: Construir grafo de conexiones mutuas
          const mutualConnections: Map<
            Id<"menuProducts">,
            Set<Id<"menuProducts">>
          > = new Map()
          for (const productA of nonStandaloneProducts) {
            const connections = new Set<Id<"menuProducts">>()
            for (const productB of nonStandaloneProducts) {
              if (productA._id === productB._id) continue
              const aCanCombineWithB =
                productA.combinableWith?.some((combo: CombinableWithRule) => {
                  // Product-level override: if menuProductId specified, check direct match
                  if (combo.menuProductId) {
                    return combo.menuProductId === productB._id
                  }
                  // Fallback to category matching
                  return (
                    combo.menuProductCategoryId ===
                    productB.menuProductCategoryId
                  )
                }) ?? false
              const bCanCombineWithA =
                productB.combinableWith?.some((combo: CombinableWithRule) => {
                  // Product-level override: if menuProductId specified, check direct match
                  if (combo.menuProductId) {
                    return combo.menuProductId === productA._id
                  }
                  // Fallback to category matching
                  return (
                    combo.menuProductCategoryId ===
                    productA.menuProductCategoryId
                  )
                }) ?? false
              if (aCanCombineWithB && bCanCombineWithA) {
                connections.add(productB._id)
              }
            }
            mutualConnections.set(productA._id, connections)
          }

          // Log solo productos con relaciones: Formato compacto
          const productsWithRelations = Array.from(mutualConnections.entries())
            .filter(([, connections]) => connections.size > 0)
            .map(([productId, connections]) => {
              const product = nonStandaloneProducts.find(
                (p) => p._id === productId
              )
              return `${product?.name}(${connections.size})`
            })
          if (productsWithRelations.length > 0) {
            console.log(
              `[DEBUG] Products with relations: ${productsWithRelations.join(", ")}`
            )
          }

          // Paso 2: Encontrar el núcleo (componente conectado más grande)
          const visited = new Set<Id<"menuProducts">>()
          let core: Id<"menuProducts">[] = []
          for (const productId of nonStandaloneProducts.map((p) => p._id)) {
            if (visited.has(productId)) continue
            // DFS para encontrar componente conectado
            const component: Id<"menuProducts">[] = []
            const stack = [productId]
            while (stack.length > 0) {
              const current = stack.pop()!
              if (visited.has(current)) continue
              visited.add(current)
              component.push(current)
              for (const neighbor of mutualConnections.get(current) || []) {
                if (!visited.has(neighbor)) {
                  stack.push(neighbor)
                }
              }
            }
            if (component.length > core.length) {
              core = component
            }
          }
          console.log(`[DEBUG] Core found: ${core.length} products`)

          // Paso 2.5: Verificar que el núcleo tenga al menos 2 productos
          if (core.length < 2) {
            const errorMessage = `Los productos no independientes requieren combinaciones mutuas válidas con al menos 2 productos conectados, o deben combinarse con productos independientes. Los productos seleccionados no pueden formar un núcleo válido.`
            console.log(
              `[DEBUG] Core validation FAILED: insufficient core size (${core.length})`
            )
            validationResults.push(`❌ Ítem ${itemNumber}: ${errorMessage}`)

            detailedResults.push({
              itemIndex,
              isValid: false,
              products: validProducts.map((p) => ({
                id: p._id,
                name: p.name,
                description: p.description,
                category: p.category,
                size: p.size,
                price: p.price,
                standAlone: p.standAlone,
                combinableHalf: p.combinableHalf,
                available: p.available,
                instructions: p.instructions,
              })),
              combination: {
                type: "error",
                description:
                  "Núcleo insuficiente para productos no independientes",
              },
              quantity: orderItem.quantity,
              errorMessage,
            })
            continue
          }

          // Paso 3: Verificar si el núcleo está completo
          let coreComplete = true
          let missingConnectionsCount = 0
          for (const memberA of core) {
            for (const memberB of core) {
              if (memberA === memberB) continue
              if (!mutualConnections.get(memberA)?.has(memberB)) {
                coreComplete = false
                missingConnectionsCount++
              }
            }
          }

          if (!coreComplete) {
            const errorMessage = `El núcleo de productos no independientes no está completo. Faltan ${missingConnectionsCount} conexiones mutuas entre los miembros del núcleo.`
            console.log(
              `[DEBUG] Core incomplete: ${missingConnectionsCount} missing connections`
            )
            validationResults.push(`❌ Ítem ${itemNumber}: ${errorMessage}`)

            detailedResults.push({
              itemIndex,
              isValid: false,
              products: validProducts.map((p) => ({
                id: p._id,
                name: p.name,
                description: p.description,
                category: p.category,
                size: p.size,
                price: p.price,
                standAlone: p.standAlone,
                combinableHalf: p.combinableHalf,
                available: p.available,
                instructions: p.instructions,
              })),
              combination: {
                type: "error",
                description: "Núcleo de productos no independientes incompleto",
              },
              quantity: orderItem.quantity,
              errorMessage,
            })
            continue
          }

          // Paso 4: Identificar extras
          const extras = nonStandaloneProducts.filter(
            (p) => !core.includes(p._id)
          )
          const directExtras: Id<"menuProducts">[] = []
          const remainingExtras: typeof extras = []

          // Paso 4.1: Validar extras directos al núcleo
          for (const extra of extras) {
            const canConnectToCore = core.some((coreId) => {
              const coreProduct = nonStandaloneProducts.find(
                (p) => p._id === coreId
              )
              if (!coreProduct) return false
              const extraCanCombineWithCore =
                extra.combinableWith?.some((combo: CombinableWithRule) => {
                  // Product-level override: if menuProductId specified, check direct match
                  if (combo.menuProductId) {
                    return combo.menuProductId === coreProduct._id
                  }
                  // Fallback to category+size matching
                  return (
                    combo.menuProductCategoryId ===
                      coreProduct.menuProductCategoryId &&
                    (!combo.sizeId ||
                      !coreProduct.sizeId ||
                      combo.sizeId === coreProduct.sizeId)
                  )
                }) ?? false
              const coreCanCombineWithExtra =
                coreProduct.combinableWith?.some(
                  (combo: CombinableWithRule) => {
                    // Product-level override: if menuProductId specified, check direct match
                    if (combo.menuProductId) {
                      return combo.menuProductId === extra._id
                    }
                    // Fallback to category+size matching
                    return (
                      combo.menuProductCategoryId ===
                        extra.menuProductCategoryId &&
                      (!combo.sizeId ||
                        !extra.sizeId ||
                        combo.sizeId === extra.sizeId)
                    )
                  }
                ) ?? false
              return extraCanCombineWithCore || coreCanCombineWithExtra
            })
            if (canConnectToCore) {
              directExtras.push(extra._id)
            } else {
              remainingExtras.push(extra)
            }
          }

          console.log(
            `[DEBUG] Extras: ${directExtras.length} direct, ${remainingExtras.length} remaining`
          )

          // Paso 4.2: Procesar extras restantes para formar sub-núcleos mutuos
          const acceptedChainedExtras: Id<"menuProducts">[] = []
          const rejectedExtras: string[] = []

          if (remainingExtras.length > 0) {
            // Construir grafo de conexiones mutuas entre extras restantes
            const chainedConnections: Map<
              Id<"menuProducts">,
              Set<Id<"menuProducts">>
            > = new Map()
            for (const extraA of remainingExtras) {
              const connections = new Set<Id<"menuProducts">>()
              for (const extraB of remainingExtras) {
                if (extraA._id === extraB._id) continue
                const aCanCombineWithB =
                  extraA.combinableWith?.some((combo: CombinableWithRule) => {
                    // Product-level override: if menuProductId specified, check direct match
                    if (combo.menuProductId) {
                      return combo.menuProductId === extraB._id
                    }
                    // Fallback to category matching
                    return (
                      combo.menuProductCategoryId ===
                      extraB.menuProductCategoryId
                    )
                  }) ?? false
                const bCanCombineWithA =
                  extraB.combinableWith?.some((combo: CombinableWithRule) => {
                    // Product-level override: if menuProductId specified, check direct match
                    if (combo.menuProductId) {
                      return combo.menuProductId === extraA._id
                    }
                    // Fallback to category matching
                    return (
                      combo.menuProductCategoryId ===
                      extraA.menuProductCategoryId
                    )
                  }) ?? false
                if (aCanCombineWithB && bCanCombineWithA) {
                  connections.add(extraB._id)
                }
              }
              chainedConnections.set(extraA._id, connections)
            }

            // Log del mapa inverso: Formato compacto
            const chainedRelations = Array.from(chainedConnections.entries())
              .filter(([, connections]) => connections.size > 0)
              .map(([productId, connections]) => {
                const product = remainingExtras.find((p) => p._id === productId)
                return `${product?.name}(${connections.size})`
              })
            if (chainedRelations.length > 0) {
              console.log(
                `[DEBUG] Chained relations: ${chainedRelations.join(", ")}`
              )
            }

            // Encontrar componentes conectados (sub-núcleos) entre extras restantes
            const visitedChained = new Set<Id<"menuProducts">>()
            const subNuclei: Id<"menuProducts">[][] = []

            for (const extraId of remainingExtras.map((p) => p._id)) {
              if (visitedChained.has(extraId)) continue

              // DFS para encontrar sub-núcleo
              const subNucleus: Id<"menuProducts">[] = []
              const stack = [extraId]
              while (stack.length > 0) {
                const current = stack.pop()!
                if (visitedChained.has(current)) continue
                visitedChained.add(current)
                subNucleus.push(current)
                for (const neighbor of chainedConnections.get(current) || []) {
                  if (!visitedChained.has(neighbor)) {
                    stack.push(neighbor)
                  }
                }
              }

              if (subNucleus.length > 0) {
                subNuclei.push(subNucleus)
              }
            }

            console.log(`[DEBUG] Found ${subNuclei.length} sub-nuclei`)

            // Para cada sub-núcleo, verificar si al menos un miembro puede conectarse al núcleo principal
            for (const subNucleus of subNuclei) {
              const canConnectToMainCore = subNucleus.some((subMemberId) => {
                const subMember = remainingExtras.find(
                  (p) => p._id === subMemberId
                )
                if (!subMember) return false

                return [...core, ...directExtras].some((validId) => {
                  const validProduct = nonStandaloneProducts.find(
                    (p) => p._id === validId
                  )
                  if (!validProduct) return false
                  const subMemberCanCombineWithValid =
                    subMember.combinableWith?.some(
                      (combo: CombinableWithRule) => {
                        // Product-level override: if menuProductId specified, check direct match
                        if (combo.menuProductId) {
                          return combo.menuProductId === validProduct._id
                        }
                        // Fallback to category+size matching
                        return (
                          combo.menuProductCategoryId ===
                            validProduct.menuProductCategoryId &&
                          (!combo.sizeId ||
                            !validProduct.sizeId ||
                            combo.sizeId === validProduct.sizeId)
                        )
                      }
                    ) ?? false
                  const validCanCombineWithSubMember =
                    validProduct.combinableWith?.some(
                      (combo: CombinableWithRule) => {
                        // Product-level override: if menuProductId specified, check direct match
                        if (combo.menuProductId) {
                          return combo.menuProductId === subMember._id
                        }
                        // Fallback to category+size matching
                        return (
                          combo.menuProductCategoryId ===
                            subMember.menuProductCategoryId &&
                          (!combo.sizeId ||
                            !subMember.sizeId ||
                            combo.sizeId === subMember.sizeId)
                        )
                      }
                    ) ?? false
                  return (
                    subMemberCanCombineWithValid || validCanCombineWithSubMember
                  )
                })
              })

              if (canConnectToMainCore) {
                // Aceptar todo el sub-núcleo
                acceptedChainedExtras.push(...subNucleus)
              } else {
                // Rechazar todo el sub-núcleo
                const rejectedNames = subNucleus
                  .map((id) => remainingExtras.find((p) => p._id === id)?.name)
                  .filter(Boolean) as string[]
                rejectedExtras.push(...rejectedNames)
              }
            }

            // Los extras restantes que no formaron parte de ningún sub-núcleo también se rechazan
            const processedExtras = new Set([
              ...acceptedChainedExtras,
              ...subNuclei.flat(),
            ])
            const unprocessedExtras = remainingExtras.filter(
              (p) => !processedExtras.has(p._id)
            )
            rejectedExtras.push(...unprocessedExtras.map((p) => p.name))
          }

          console.log(
            `[DEBUG] Extras processed: ${directExtras.length} direct + ${acceptedChainedExtras.length} chained = ${directExtras.length + acceptedChainedExtras.length} accepted, ${rejectedExtras.length} rejected`
          )

          // Paso 4.3: Verificar si hay extras rechazados
          if (rejectedExtras.length > 0) {
            const errorMessage = `Los extras ${rejectedExtras.join(", ")} no pueden conectarse al núcleo principal ni formar sub-núcleos válidos que se conecten al núcleo.`
            validationResults.push(`❌ Ítem ${itemNumber}: ${errorMessage}`)

            detailedResults.push({
              itemIndex,
              isValid: false,
              products: validProducts.map((p) => ({
                id: p._id,
                name: p.name,
                description: p.description,
                category: p.category,
                size: p.size,
                price: p.price,
                standAlone: p.standAlone,
                combinableHalf: p.combinableHalf,
                available: p.available,
                instructions: p.instructions,
              })),
              combination: {
                type: "error",
                description:
                  "Extras no pueden conectarse al núcleo ni formar sub-núcleos válidos",
              },
              quantity: orderItem.quantity,
              errorMessage,
            })
            continue
          }

          // Si todo válido, aceptar
          const coreNames = core
            .map((id) => nonStandaloneProducts.find((p) => p._id === id)?.name)
            .filter(Boolean)
            .join(" + ")
          const allExtras = [...directExtras, ...acceptedChainedExtras]
          const extrasNames =
            allExtras.length > 0
              ? allExtras
                  .map(
                    (id) =>
                      nonStandaloneProducts.find((p) => p._id === id)?.name
                  )
                  .filter(Boolean)
                  .join(" + ")
              : ""
          const combinationDescription =
            allExtras.length > 0
              ? `Núcleo mutuo (${coreNames}) con extras (${extrasNames})`
              : `Núcleo mutuo (${coreNames})`
          const combinationType =
            allExtras.length > 0
              ? "mutual_non_standalone_with_extras"
              : "mutual_non_standalone"

          validationResults.push(
            `✅ Ítem ${itemNumber}: Válido (${combinationDescription})`
          )

          detailedResults.push({
            itemIndex,
            isValid: true,
            products: validProducts.map((p) => ({
              id: p._id,
              name: p.name,
              description: p.description,
              category: p.category,
              size: p.size,
              price: p.price,
              standAlone: p.standAlone,
              combinableHalf: p.combinableHalf,
              available: p.available,
              instructions: p.instructions,
            })),
            combination: {
              type: combinationType,
              description: combinationDescription,
            },
            quantity: orderItem.quantity,
          })
          continue
        }

        // Step 3: Check how many standalone products we have
        if (
          standaloneProducts.length === 1 &&
          standaloneProducts[0] !== undefined
        ) {
          // Step 4: Only one standalone product
          const standaloneProduct = standaloneProducts[0]

          if (standaloneProduct.combinableHalf) {
            // If it's combinable half and only one, error
            const errorMessage = `El producto "${standaloneProduct.name}" es de medio producto y necesita emparejarse con otro producto de medio de la misma categoría y tamaño.`
            validationResults.push(`❌ Ítem ${itemNumber}: ${errorMessage}`)

            detailedResults.push({
              itemIndex,
              isValid: false,
              products: validProducts.map((p) => ({
                id: p._id,
                name: p.name,
                description: p.description,
                category: p.category,
                size: p.size,
                price: p.price,
                standAlone: p.standAlone,
                combinableHalf: p.combinableHalf,
                available: p.available,
                instructions: p.instructions,
              })),
              combination: {
                type: "error",
                description: "Producto de medio sin pareja",
              },
              quantity: orderItem.quantity,
              errorMessage,
            })
            continue
          }
          // If not combinable half, it's valid (will check non-standalone later)
        } else if (standaloneProducts.length >= 2) {
          // Step 5: Multiple standalone products
          // Separate into halves and non-halves
          const standaloneHalves = standaloneProducts.filter(
            (p) => p.combinableHalf
          )
          const standaloneNonHalves = standaloneProducts.filter(
            (p) => !p.combinableHalf
          )

          // Step 5a: Validate halves (must be exactly 2, same category, same size)
          if (standaloneHalves.length === 1) {
            const loneHalf = standaloneHalves[0]!
            const errorMessage = `El producto "${loneHalf.name}" es de medio producto y necesita emparejarse con otro producto de medio de la misma categoría y tamaño.`
            validationResults.push(`❌ Ítem ${itemNumber}: ${errorMessage}`)
            detailedResults.push({
              itemIndex,
              isValid: false,
              products: validProducts.map((p) => ({
                id: p._id,
                name: p.name,
                description: p.description,
                category: p.category,
                size: p.size,
                price: p.price,
                standAlone: p.standAlone,
                combinableHalf: p.combinableHalf,
                available: p.available,
                instructions: p.instructions,
              })),
              combination: {
                type: "error",
                description: "Producto de medio sin pareja",
              },
              quantity: orderItem.quantity,
              errorMessage,
            })
            continue
          }

          if (standaloneHalves.length > 2) {
            const halfNames = standaloneHalves
              .map((p) => `"${p.name}"`)
              .join(", ")
            const errorMessage = `Demasiados productos de medio: ${halfNames}. Solo se permiten máximo 2 productos de medio por ítem.`
            validationResults.push(`❌ Ítem ${itemNumber}: ${errorMessage}`)
            detailedResults.push({
              itemIndex,
              isValid: false,
              products: validProducts.map((p) => ({
                id: p._id,
                name: p.name,
                description: p.description,
                category: p.category,
                size: p.size,
                price: p.price,
                standAlone: p.standAlone,
                combinableHalf: p.combinableHalf,
                available: p.available,
                instructions: p.instructions,
              })),
              combination: {
                type: "error",
                description: "Demasiados productos de medio",
              },
              quantity: orderItem.quantity,
              errorMessage,
            })
            continue
          }

          if (
            standaloneHalves.length === 2 &&
            standaloneHalves[0] !== undefined &&
            standaloneHalves[1] !== undefined
          ) {
            const [half1, half2] = standaloneHalves
            // Check same category
            if (half1.menuProductCategoryId !== half2.menuProductCategoryId) {
              const errorMessage = `Los productos de medio "${half1.name}" (categoría: ${half1.category || "Sin categoría"}) y "${half2.name}" (categoría: ${half2.category || "Sin categoría"}) deben ser de la misma categoría.`
              validationResults.push(`❌ Ítem ${itemNumber}: ${errorMessage}`)
              detailedResults.push({
                itemIndex,
                isValid: false,
                products: validProducts.map((p) => ({
                  id: p._id,
                  name: p.name,
                  description: p.description,
                  category: p.category,
                  size: p.size,
                  price: p.price,
                  standAlone: p.standAlone,
                  combinableHalf: p.combinableHalf,
                  available: p.available,
                  instructions: p.instructions,
                })),
                combination: {
                  type: "error",
                  description: "Productos de medio de categorías diferentes",
                },
                quantity: orderItem.quantity,
                errorMessage,
              })
              continue
            }
            // Check same size
            if (half1.sizeId !== half2.sizeId) {
              const errorMessage = `Los productos de medio "${half1.name}" (tamaño: ${half1.size || "Sin tamaño"}) y "${half2.name}" (tamaño: ${half2.size || "Sin tamaño"}) deben ser del mismo tamaño.`
              validationResults.push(`❌ Ítem ${itemNumber}: ${errorMessage}`)
              detailedResults.push({
                itemIndex,
                isValid: false,
                products: validProducts.map((p) => ({
                  id: p._id,
                  name: p.name,
                  description: p.description,
                  category: p.category,
                  size: p.size,
                  price: p.price,
                  standAlone: p.standAlone,
                  combinableHalf: p.combinableHalf,
                  available: p.available,
                  instructions: p.instructions,
                })),
                combination: {
                  type: "error",
                  description: "Productos de medio de tamaños diferentes",
                },
                quantity: orderItem.quantity,
                errorMessage,
              })
              continue
            }
            // If halves are mixed with non-halves, the non-halves must be validated for combinableWith below
          }

          // Step 5b: Validate non-half standalone products via combinableWith connectivity
          // All non-half standalones (plus halves as anchors) must form a SINGLE weakly-connected
          // component via combinableWith (unidirectional OR: A→B or B→A is enough).
          // This prevents disconnected sub-groups (e.g. PizzaA+ExtraQueso | PizzaB+CocaCola)
          // from silently passing.
          if (
            standaloneNonHalves.length >= 2 ||
            (standaloneNonHalves.length >= 1 && standaloneHalves.length >= 2)
          ) {
            // Helper: does productA have a combinableWith link to productB (unidirectional OR)?
            const areLinked = (
              a: (typeof standaloneProducts)[number],
              b: (typeof standaloneProducts)[number]
            ): boolean => {
              // Valid combinable halves are implicitly connected to each other
              if (
                a.combinableHalf &&
                b.combinableHalf &&
                a.menuProductCategoryId === b.menuProductCategoryId &&
                a.sizeId === b.sizeId
              ) {
                return true
              }

              const aToB =
                a.combinableWith?.some((combo: CombinableWithRule) => {
                  if (combo.menuProductId) return combo.menuProductId === b._id
                  return (
                    combo.menuProductCategoryId === b.menuProductCategoryId &&
                    (!combo.sizeId || !b.sizeId || combo.sizeId === b.sizeId)
                  )
                }) ?? false

              const bToA =
                b.combinableWith?.some((combo: CombinableWithRule) => {
                  if (combo.menuProductId) return combo.menuProductId === a._id
                  return (
                    combo.menuProductCategoryId === a.menuProductCategoryId &&
                    (!combo.sizeId || !a.sizeId || combo.sizeId === a.sizeId)
                  )
                }) ?? false

              return aToB || bToA
            }

            // BFS from first product across ALL standalones (halves act as valid anchors)
            const allStandalones = standaloneProducts
            const visited = new Set<string>()
            const queue: string[] = [allStandalones[0]!._id]
            visited.add(allStandalones[0]!._id)

            while (queue.length > 0) {
              const currentId = queue.shift()!
              const current = allStandalones.find((p) => p._id === currentId)
              if (!current) continue

              for (const neighbor of allStandalones) {
                if (visited.has(neighbor._id)) continue
                if (areLinked(current, neighbor)) {
                  visited.add(neighbor._id)
                  queue.push(neighbor._id)
                }
              }
            }

            const unvisited = allStandalones.filter((p) => !visited.has(p._id))

            if (unvisited.length > 0) {
              const visitedNames = allStandalones
                .filter((p) => visited.has(p._id))
                .map((p) => `"${p.name}"`)
                .join(", ")
              const unvisitedNames = unvisited
                .map((p) => `"${p.name}"`)
                .join(", ")
              const errorMessage = `Los productos independientes ${unvisitedNames} no están conectados con el resto del ítem (${visitedNames}). Todos los productos independientes combinados deben formar un grupo conectado mediante reglas de combinación (combinableWith).`
              validationResults.push(`❌ Ítem ${itemNumber}: ${errorMessage}`)
              detailedResults.push({
                itemIndex,
                isValid: false,
                products: validProducts.map((p) => ({
                  id: p._id,
                  name: p.name,
                  description: p.description,
                  category: p.category,
                  size: p.size,
                  price: p.price,
                  standAlone: p.standAlone,
                  combinableHalf: p.combinableHalf,
                  available: p.available,
                  instructions: p.instructions,
                })),
                combination: {
                  type: "error",
                  description:
                    "Productos independientes sin componente conexo único",
                },
                quantity: orderItem.quantity,
                errorMessage,
              })
              continue
            }
            // All standalones form a single connected component — valid, proceed to Step 9
          }
        }

        // Step 9: Check non-standalone products compatibility
        if (nonStandaloneProducts.length > 0) {
          // Let's check if the non-standalone products can be combined with the standalone products
          for (const nonStandalone of nonStandaloneProducts) {
            const canCombine = standaloneProducts.some((standalone) => {
              // Check if standalone product can combine with this non-standalone product
              const standaloneCanCombine =
                standalone.combinableWith?.some((combo) => {
                  // Product-level override: if menuProductId specified, check direct match
                  if (combo.menuProductId) {
                    return combo.menuProductId === nonStandalone._id
                  }
                  // Fallback to category+size matching
                  return (
                    combo.menuProductCategoryId ===
                      nonStandalone.menuProductCategoryId &&
                    (!combo.sizeId ||
                      !nonStandalone.sizeId ||
                      combo.sizeId === nonStandalone.sizeId)
                  )
                }) ?? false

              // Check if non-standalone product can combine with this standalone product
              const nonStandaloneCanCombine =
                nonStandalone.combinableWith?.some((combo) => {
                  // Product-level override: if menuProductId specified, check direct match
                  if (combo.menuProductId) {
                    return combo.menuProductId === standalone._id
                  }
                  // Fallback to category+size matching
                  return (
                    combo.menuProductCategoryId ===
                      standalone.menuProductCategoryId &&
                    (!combo.sizeId ||
                      !standalone.sizeId ||
                      combo.sizeId === standalone.sizeId)
                  )
                }) ?? false

              return standaloneCanCombine || nonStandaloneCanCombine
            })

            if (!canCombine) {
              // If the non-standalone product can't be combined with the standalone products, error
              // Get combinableWith rules from the non-standalone product
              const nonStandaloneCombinableWith =
                nonStandalone.combinableWith || []

              // Helper to get category name from ID
              const getCategoryName = (categoryId: string) => {
                const product = validProducts.find(
                  (p) => p.menuProductCategoryId === categoryId
                )
                return product?.category || "Desconocida"
              }

              // Helper to get size name from ID
              const getSizeName = (sizeId: string | null | undefined) => {
                if (!sizeId) return null
                const product = validProducts.find((p) => p.sizeId === sizeId)
                return product?.size || null
              }

              let errorMessage = ""
              let errorDescription = ""

              if (nonStandaloneCombinableWith.length > 0) {
                // The extra has specific requirements
                // Get accepted categories
                const acceptedCategories = Array.from(
                  new Set(
                    nonStandaloneCombinableWith.map(
                      (combo) => combo.menuProductCategoryId
                    )
                  )
                ).map((catId) => getCategoryName(catId))

                // Check if category matches
                const categoryMatches = standaloneProducts.some((standalone) =>
                  nonStandaloneCombinableWith.some(
                    (combo) =>
                      combo.menuProductCategoryId ===
                      standalone.menuProductCategoryId
                  )
                )

                if (!categoryMatches) {
                  // Category incompatible
                  errorDescription = "Categoría incompatible"
                  errorMessage = `❌ CATEGORÍA INCOMPATIBLE

El extra "${nonStandalone.name}" acepta productos independientes de categorías: ${acceptedCategories.join(", ")}

Producto(s) independiente(s) en el pedido:
${standaloneProducts.map((p) => `  • "${p.name}": Categoría "${p.category || "Sin categoría"}"`).join("\n")}

❌ PROBLEMA: El producto independiente es de categoría "${standaloneProducts[0]?.category || "Sin categoría"}" pero el extra solo acepta: ${acceptedCategories.join(", ")}

💡 SOLUCIÓN:
- Buscar un producto independiente de categoría: ${acceptedCategories.join(" o ")}, O
- Buscar un extra que acepte productos de categoría "${standaloneProducts[0]?.category || "Sin categoría"}"`
                } else {
                  // Category matches but size doesn't
                  const matchingCategoryId =
                    standaloneProducts[0]?.menuProductCategoryId
                  const acceptedSizesForCategory = nonStandaloneCombinableWith
                    .filter(
                      (combo) =>
                        combo.menuProductCategoryId === matchingCategoryId &&
                        combo.sizeId
                    )
                    .map((combo) => getSizeName(combo.sizeId))
                    .filter(Boolean) as string[]

                  const acceptedSizesText =
                    acceptedSizesForCategory.length > 0
                      ? acceptedSizesForCategory.join(", ")
                      : "tamaños específicos"

                  errorDescription = "Tamaño incompatible"
                  errorMessage = `❌ TAMAÑO INCOMPATIBLE

El extra "${nonStandalone.name}" acepta productos independientes de categoría "${standaloneProducts[0]?.category || "Sin categoría"}" con tamaños: ${acceptedSizesText}

Producto(s) independiente(s) en el pedido:
${standaloneProducts.map((p) => `  • "${p.name}": Categoría "${p.category || "Sin categoría"}", Tamaño "${p.size || "Sin tamaño"}"`).join("\n")}

✓ Categoría: "${standaloneProducts[0]?.category || "Sin categoría"}" (correcta)
❌ PROBLEMA: Tamaño "${standaloneProducts[0]?.size || "Sin tamaño"}" incompatible. El extra acepta: ${acceptedSizesText}

💡 SOLUCIÓN:
- Buscar un producto independiente de categoría "${standaloneProducts[0]?.category || "Sin categoría"}" y tamaño: ${acceptedSizesText}, O
- Buscar un extra que acepte productos de categoría "${standaloneProducts[0]?.category || "Sin categoría"}" y tamaño "${standaloneProducts[0]?.size || "Sin tamaño"}"`
                }
              } else {
                // No rules configured
                errorDescription = "Sin reglas de combinación"
                errorMessage = `❌ SIN REGLAS DE COMBINACIÓN

El extra "${nonStandalone.name}" no tiene reglas de combinación configuradas con los productos independientes del pedido.

Producto(s) independiente(s) en el pedido:
${standaloneProducts.map((p) => `  • "${p.name}": Categoría "${p.category || "Sin categoría"}"`).join("\n")}

💡 SOLUCIÓN: Verificar la configuración del menú o elegir productos con reglas de combinación definidas.`
              }

              validationResults.push(`❌ Ítem ${itemNumber}: ${errorMessage}`)

              detailedResults.push({
                itemIndex,
                isValid: false,
                products: validProducts.map((p) => ({
                  id: p._id,
                  name: p.name,
                  description: p.description,
                  category: p.category,
                  size: p.size,
                  price: p.price,
                  standAlone: p.standAlone,
                  combinableHalf: p.combinableHalf,
                  available: p.available,
                  instructions: p.instructions,
                })),
                combination: {
                  type: "error",
                  description: errorDescription,
                },
                quantity: orderItem.quantity,
                errorMessage,
              })
              break
            }
          }

          if (validationResults[validationResults.length - 1]?.startsWith("❌"))
            continue
        }

        // If we reach here, the item is valid
        const standaloneHalvesForType = standaloneProducts.filter(
          (p) => p.combinableHalf
        )
        const standaloneNonHalvesForType = standaloneProducts.filter(
          (p) => !p.combinableHalf
        )
        const hasHalves = standaloneHalvesForType.length === 2
        const hasMultipleStandalones = standaloneNonHalvesForType.length >= 2
        const hasMixedStandalonesWithHalves =
          standaloneNonHalvesForType.length >= 1 &&
          standaloneHalvesForType.length >= 2
        const hasCombinableStandalones =
          hasMultipleStandalones || hasMixedStandalonesWithHalves
        const hasExtras = nonStandaloneProducts.length > 0

        let combinationType:
          | "single_standalone"
          | "combinable_halves"
          | "standalone_with_extras"
          | "combinable_standalones"
          | "combinable_standalones_with_extras"
          | "mutual_non_standalone"
          | "mutual_non_standalone_with_extras"
        let combinationDescription: string

        if (hasCombinableStandalones && hasExtras) {
          combinationType = "combinable_standalones_with_extras"
          combinationDescription = `Productos independientes combinados (${standaloneProducts.map((p) => `${p.name}`).join(" + ")}) con extras (${nonStandaloneProducts.map((p) => `${p.name}`).join(" + ")})`
        } else if (hasCombinableStandalones) {
          combinationType = "combinable_standalones"
          combinationDescription = `Productos independientes combinados (${standaloneProducts.map((p) => `${p.name}`).join(" + ")})`
        } else if (hasHalves && hasExtras) {
          combinationType = "standalone_with_extras"
          combinationDescription = `Dos productos de medio (${standaloneHalvesForType.map((p) => `${p.name}`).join(" + ")}) con extras (${nonStandaloneProducts.map((p) => `${p.name}`).join(" + ")})`
        } else if (hasHalves) {
          combinationType = "combinable_halves"
          combinationDescription = `Dos productos de medio de la misma categoría y tamaño (${standaloneHalvesForType.map((p) => `${p.name}`).join(" + ")})`
        } else if (hasExtras) {
          combinationType = "standalone_with_extras"
          combinationDescription = `Producto principal (${standaloneProducts[0]?.name}) con extras (${nonStandaloneProducts.map((p) => `${p.name}`).join(" + ")})`
        } else {
          combinationType = "single_standalone"
          combinationDescription = `Producto individual (${standaloneProducts[0]?.name})`
        }

        validationResults.push(
          `✅ Ítem ${itemNumber}: Válido (${validProducts.map((p) => `${p.name}`).join(" + ")})`
        )

        detailedResults.push({
          itemIndex,
          isValid: true,
          products: validProducts.map((p) => ({
            id: p._id,
            name: p.name,
            description: p.description,
            category: p.category,
            size: p.size,
            price: p.price,
            standAlone: p.standAlone,
            combinableHalf: p.combinableHalf,
            available: p.available,
            instructions: p.instructions,
          })),
          combination: {
            type: combinationType,
            description: combinationDescription,
          },
          quantity: orderItem.quantity,
        })
      }

      // Summary
      const validCount = validationResults.filter((r) =>
        r.startsWith("✅")
      ).length
      const invalidCount = validationResults.filter((r) =>
        r.startsWith("❌")
      ).length

      let summary = `\nRESUMEN DE VALIDACIÓN:\n`
      summary += `✅ Ítems válidos: ${validCount}\n`
      summary += `❌ Ítems inválidos: ${invalidCount}\n\n`

      if (invalidCount === 0) {
        summary += `🎉 TODOS LOS ÍTEMS SON VÁLIDOS - Puedes proceder a crear el pedido usando confirmOrderTool.`
      } else {
        summary += `⚠️ HAY ÍTEMS INVÁLIDOS - Corrige los problemas antes de crear el pedido.`
      }

      // Create ready-to-use orderItems structure for the agent
      const validatedOrderItems = detailedResults
        .filter((result) => result.isValid)
        .map((result) => {
          const originalItem = args.orderItems[result.itemIndex]
          if (!originalItem) {
            return {
              menuProducts: [],
              quantity: 1,
            }
          }
          const item: {
            menuProducts: string[]
            quantity: number
            notes?: string
          } = {
            menuProducts: originalItem.menuProducts,
            quantity: originalItem.quantity,
          }
          if (originalItem.notes) {
            item.notes = originalItem.notes
          }
          return item
        })

      // Create comprehensive response with both human-readable and structured data
      const response = {
        summary: {
          validCount,
          invalidCount,
          allValid: invalidCount === 0,
        },
        humanReadable: `${validationResults.join("\n")}\n${summary}`,
        detailedResults,
        validatedOrderItems,
      }

      // Create structured output optimized for agent consumption
      let agentInstructions = "\n\n=== ESTRUCTURA_PEDIDO_VALIDADA ===\n"
      agentInstructions +=
        "⚠️ IMPORTANTE: Esta sección NO es visible para el usuario - es información técnica INTERNA para usar en las siguientes herramientas.\n\n"

      if (invalidCount === 0) {
        agentInstructions += "ESTADO: TODOS_VALIDOS\n"
        agentInstructions += "ACCION: USAR_ESTRUCTURA_DIRECTAMENTE\n"
        agentInstructions +=
          "HERRAMIENTAS_SIGUIENTES: confirmOrderTool O makeOrderTool O scheduleOrderTool\n\n"
        agentInstructions += "ITEMS_JSON:\n"
        agentInstructions += `${JSON.stringify(validatedOrderItems, null, 2)}\n\n`

        agentInstructions += "DETALLE_ITEMS (para uso interno):\n"
        detailedResults.forEach((result) => {
          if (!result.isValid) return

          agentInstructions += `ITEM_${result.itemIndex + 1}:\n`
          agentInstructions += `  cantidad: ${result.quantity}\n`
          agentInstructions += `  tipo: ${result.combination.description}\n`
          agentInstructions += `  productos:\n`
          result.products.forEach((product) => {
            agentInstructions += `    - nombre: ${product.name}\n`
            agentInstructions += `    - instrucciones: ${product.instructions ? `|\n${product.instructions}\n` : "Sin instrucciones"}\n`
            if (product.description)
              agentInstructions += `    - descripcion: ${product.description}\n`
            agentInstructions += `      id: ${product.id}\n`
            agentInstructions += `      categoria: ${product.category || "Sin categoría"}\n`
            if (product.size)
              agentInstructions += `      tamano: ${product.size}\n`
            agentInstructions += `      precio: ${product.price}\n`
          })
          const itemTotal = result.products.reduce((sum, p) => sum + p.price, 0)
          agentInstructions += `  precio_unitario: ${itemTotal}\n`
          agentInstructions += `  subtotal: ${itemTotal * result.quantity}\n`
        })

        agentInstructions += "\n📋 INSTRUCCIONES PARA EL AGENTE:\n"
        agentInstructions +=
          "1. QUÉ COMUNICAR AL USUARIO: Confirma los productos y precios de forma natural y amigable (ej: 'Perfecto, tu pedido incluye: Pizza Pepperoni Grande ($20.000) x1...')\n"
        agentInstructions +=
          "2. QUÉ NO ENVIAR AL USUARIO: NUNCA envíes esta sección completa, el JSON de ITEMS_JSON, IDs de productos, ni ninguna información técnica\n"
        agentInstructions +=
          "3. USAR ITEMS_JSON: Guarda internamente el ITEMS_JSON para usar en confirmOrderTool/makeOrderTool/scheduleOrderTool\n"
        agentInstructions +=
          "4. NO MODIFICAR: No cambies ni reinterpretes la estructura ITEMS_JSON - úsala TAL CUAL en las siguientes herramientas\n"
      } else {
        agentInstructions += "ESTADO: ERRORES_VALIDACION\n"
        agentInstructions += "ACCION: CORREGIR_ERRORES_ANTES_DE_CONTINUAR\n\n"
        agentInstructions += "ERRORES:\n"
        detailedResults.forEach((result) => {
          if (result.isValid) return
          agentInstructions += `ITEM_${result.itemIndex + 1}: ${result.errorMessage}\n`
        })

        if (validCount > 0) {
          agentInstructions += "\nITEMS_VALIDOS_PARCIALES_JSON:\n"
          agentInstructions += `${JSON.stringify(validatedOrderItems, null, 2)}\n`
          agentInstructions +=
            "\nNOTA: Corrige los items inválidos, luego usa la estructura completa\n"
        }

        agentInstructions += "\n📋 INSTRUCCIONES PARA EL AGENTE:\n"
        agentInstructions +=
          "1. QUÉ COMUNICAR AL USUARIO: Explica CLARAMENTE qué está mal con el pedido y sugiere alternativas de forma amigable\n"
        agentInstructions +=
          "2. QUÉ NO ENVIAR AL USUARIO: NUNCA envíes mensajes de error técnicos completos, esta sección, ni información técnica detallada\n"
        agentInstructions +=
          "3. FORMATO AMIGABLE: Resume el problema en lenguaje conversacional (ej: 'Los productos de medio deben ser del mismo tamaño. ¿Prefieres ambos en tamaño grande?')\n"
      }

      agentInstructions += "=== FIN_ESTRUCTURA_PEDIDO_VALIDADA ===\n"

      return `RESULTADOS DE VALIDACIÓN:\n\n${response.humanReadable}${agentInstructions}\n\n--- DATOS_CRUDOS ---\n${JSON.stringify(response, null, 2)}`
    } catch (error) {
      console.error("Error al validar combinaciones:", error)

      // Check if it's an ArgumentValidationError (invalid ID format)
      if (
        error instanceof Error &&
        error.message.includes("ArgumentValidationError")
      ) {
        // Extract the invalid ID from the error message
        const idMatch = error.message.match(/Value: "([^"]+)"/)
        const pathMatch = error.message.match(/Path: \.productIds\[(\d+)\]/)

        if (idMatch && pathMatch) {
          const invalidId = idMatch[1]
          const itemIndex = pathMatch[1]

          return `❌ ERROR DE FORMATO DE ID:

El ID del producto en la posición ${itemIndex} no tiene el formato correcto.

ID recibido: "${invalidId}"

🔍 PROBLEMA: Este ID no es un ID válido de producto en el sistema. Los IDs de productos deben tener un formato específico generado por la base de datos.

💡 POSIBLES CAUSAS:
1. Se usó "NO_DISPONIBLE" u otro texto en lugar de un ID válido
2. Se copió mal el ID desde la identificación de productos
3. Se inventó un ID en lugar de usar los IDs exactos proporcionados

✅ SOLUCIÓN:
- Verifica que estés usando EXACTAMENTE los IDs que vienen de la identificación de productos
- Si el producto no está disponible, debe tener "ID: NO_DISPONIBLE" y NO debe incluirse en los orderItems
- NO inventes IDs ni uses texto personalizado como IDs
- Solo usa los IDs que están en el formato correcto (como "jh75h7q3s6w246yst8j2dv9nau7rgjlj" es válido, pero verifica que corresponda a un producto real)`
        }

        // Fallback if we can't parse the specific ID
        return `❌ ERROR DE FORMATO DE ID:

Uno o más IDs de productos no tienen el formato correcto.

🔍 PROBLEMA: Los IDs de productos deben tener un formato específico generado por la base de datos de Convex.

💡 SOLUCIÓN:
- Usa EXACTAMENTE los IDs que vienen de la identificación de productos
- NO inventes IDs ni uses texto como "NO_DISPONIBLE" en los orderItems
- Si un producto no está disponible (ID: NO_DISPONIBLE), NO lo incluyas en los orderItems para validación

Detalles técnicos: ${error.message}`
      }

      return `Error al validar los ítems del pedido: ${error instanceof Error ? error.message : "Error desconocido"}`
    }
  },
})
