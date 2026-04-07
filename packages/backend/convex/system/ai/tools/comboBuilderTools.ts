import { createTool } from "@convex-dev/agent"
import { z } from "zod"
import { api, internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import type { ActionCtx } from "../../../_generated/server"

export function createComboBuilderTools(organizationId: string) {
  const getValidMenuProductIds = async (actionCtx: ActionCtx) => {
    const products = await actionCtx.runQuery(
      internal.system.ai.comboBuilderQueries.listMenuProducts,
      { organizationId }
    )
    return new Set(products.map((product) => String(product.id)))
  }

  const getValidComboIds = async (actionCtx: ActionCtx) => {
    const combos = await actionCtx.runQuery(
      internal.system.ai.comboBuilderQueries.listCombos,
      { organizationId }
    )
    return new Set(combos.map((combo) => String(combo.id)))
  }

  const listMenuProductsTool = createTool({
    description:
      "Lista todos los productos del menú de la organización. Retorna id, nombre, precio y categoría de cada producto. Úsala para conocer los productos disponibles antes de crear o editar combos.",
    args: z.object({}),
    handler: async (toolCtx) => {
      const actionCtx = toolCtx as unknown as ActionCtx
      const result = await actionCtx.runQuery(
        internal.system.ai.comboBuilderQueries.listMenuProducts,
        { organizationId }
      )

      if (result.length === 0) {
        return JSON.stringify({
          success: true,
          message:
            "No hay productos en el menú. El restaurante debe agregar productos primero.",
          products: [],
        })
      }

      return JSON.stringify({
        success: true,
        totalProducts: result.length,
        products: result,
      })
    },
  })

  const listCombosTool = createTool({
    description:
      "Lista todos los combos existentes de la organización. Retorna id, nombre, precio base y cantidad de slots de cada combo. Útil para ver qué combos ya existen antes de crear nuevos o para editar/eliminar.",
    args: z.object({}),
    handler: async (toolCtx) => {
      const actionCtx = toolCtx as unknown as ActionCtx
      const result = await actionCtx.runQuery(
        internal.system.ai.comboBuilderQueries.listCombos,
        { organizationId }
      )

      if (result.length === 0) {
        return JSON.stringify({
          success: true,
          message: "No hay combos creados aún. ¡Vamos a crear el primero!",
          combos: [],
        })
      }

      return JSON.stringify({
        success: true,
        totalCombos: result.length,
        combos: result,
      })
    },
  })

  const createComboTool = createTool({
    description:
      "Crea un nuevo combo con nombre, descripción, precio base y slots. Cada slot tiene un nombre, selecciones mínimas/máximas, y opciones (productos del menú con recargo opcional). Los menuProductId deben ser IDs válidos obtenidos de listMenuProductsTool.",
    args: z.object({
      name: z.string().describe("Nombre del combo (ej: 'Combo Familiar')"),
      description: z
        .string()
        .describe(
          "Descripción del combo (ej: 'Incluye pizza, bebida y postre')"
        ),
      basePrice: z
        .number()
        .describe("Precio base del combo en pesos colombianos"),
      slots: z
        .array(
          z.object({
            name: z
              .string()
              .describe("Nombre del slot (ej: 'Plato principal', 'Bebida')"),
            minSelections: z
              .number()
              .describe("Mínimo de opciones que el cliente debe elegir"),
            maxSelections: z
              .number()
              .describe("Máximo de opciones que el cliente puede elegir"),
            options: z
              .array(
                z.object({
                  menuProductId: z
                    .string()
                    .describe(
                      "ID del producto del menú (obtenido de listMenuProductsTool)"
                    ),
                  upcharge: z
                    .number()
                    .describe(
                      "Recargo adicional por elegir esta opción (0 si no tiene recargo)"
                    ),
                })
              )
              .describe("Opciones disponibles en este slot"),
          })
        )
        .describe("Slots del combo (categorías de opciones)"),
    }),
    handler: async (toolCtx, args) => {
      const actionCtx = toolCtx as unknown as ActionCtx
      try {
        const validProductIds = await getValidMenuProductIds(actionCtx)
        const invalidProductIds = args.slots.flatMap((slot) =>
          slot.options
            .map((option) => option.menuProductId)
            .filter((menuProductId) => !validProductIds.has(menuProductId))
        )

        if (invalidProductIds.length > 0) {
          return JSON.stringify({
            success: false,
            error:
              "Algunos menuProductId no son válidos o no pertenecen a esta organización.",
            invalidMenuProductIds: Array.from(new Set(invalidProductIds)),
            hint: "Usa listMenuProductsTool y vuelve a intentar con IDs exactos.",
          })
        }

        const comboId = await actionCtx.runMutation(api.private.combos.create, {
          organizationId,
          name: args.name,
          description: args.description,
          basePrice: args.basePrice,
          isActive: true,
          slots: args.slots.map((slot, index) => ({
            name: slot.name,
            minSelections: slot.minSelections,
            maxSelections: slot.maxSelections,
            sortOrder: index,
            options: slot.options.map((option, optIndex) => ({
              menuProductId: option.menuProductId as Id<"menuProducts">,
              upcharge: option.upcharge,
              sortOrder: optIndex,
            })),
          })),
        })

        return JSON.stringify({
          success: true,
          message: `¡Combo "${args.name}" creado exitosamente!`,
          comboId,
        })
      } catch (error) {
        return JSON.stringify({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Error desconocido al crear el combo",
        })
      }
    },
  })

  const updateComboTool = createTool({
    description:
      "Actualiza un combo existente. Puedes cambiar nombre, descripción, precio base y/o los slots completos. Solo envía los campos que quieras cambiar. Si envías slots, se reemplazarán TODOS los slots existentes.",
    args: z.object({
      comboId: z
        .string()
        .describe("ID del combo a actualizar (obtenido de listCombosTool)"),
      name: z.string().optional().describe("Nuevo nombre del combo"),
      description: z
        .string()
        .optional()
        .describe("Nueva descripción del combo"),
      basePrice: z.number().optional().describe("Nuevo precio base"),
      slots: z
        .array(
          z.object({
            name: z.string().describe("Nombre del slot"),
            minSelections: z.number().describe("Mínimo de selecciones"),
            maxSelections: z.number().describe("Máximo de selecciones"),
            options: z
              .array(
                z.object({
                  menuProductId: z
                    .string()
                    .describe("ID del producto del menú"),
                  upcharge: z.number().describe("Recargo adicional"),
                })
              )
              .describe("Opciones del slot"),
          })
        )
        .optional()
        .describe(
          "Nuevos slots (reemplaza todos los slots existentes si se envía)"
        ),
    }),
    handler: async (toolCtx, args) => {
      const actionCtx = toolCtx as unknown as ActionCtx
      try {
        const validComboIds = await getValidComboIds(actionCtx)
        if (!validComboIds.has(args.comboId)) {
          return JSON.stringify({
            success: false,
            error: "comboId no es válido o no pertenece a esta organización.",
            invalidComboId: args.comboId,
            hint: "Usa listCombosTool para obtener IDs válidos.",
          })
        }

        if (args.slots) {
          const validProductIds = await getValidMenuProductIds(actionCtx)
          const invalidProductIds = args.slots.flatMap((slot) =>
            slot.options
              .map((option) => option.menuProductId)
              .filter((menuProductId) => !validProductIds.has(menuProductId))
          )

          if (invalidProductIds.length > 0) {
            return JSON.stringify({
              success: false,
              error:
                "Algunos menuProductId no son válidos o no pertenecen a esta organización.",
              invalidMenuProductIds: Array.from(new Set(invalidProductIds)),
              hint: "Usa listMenuProductsTool y vuelve a intentar con IDs exactos.",
            })
          }
        }

        await actionCtx.runMutation(api.private.combos.update, {
          organizationId,
          comboId: args.comboId as Id<"combos">,
          ...(args.name !== undefined && { name: args.name }),
          ...(args.description !== undefined && {
            description: args.description,
          }),
          ...(args.basePrice !== undefined && { basePrice: args.basePrice }),
          ...(args.slots && {
            slots: args.slots.map((slot, index) => ({
              name: slot.name,
              minSelections: slot.minSelections,
              maxSelections: slot.maxSelections,
              sortOrder: index,
              options: slot.options.map((option, optIndex) => ({
                menuProductId: option.menuProductId as Id<"menuProducts">,
                upcharge: option.upcharge,
                sortOrder: optIndex,
              })),
            })),
          }),
        })

        return JSON.stringify({
          success: true,
          message: "Combo actualizado exitosamente.",
        })
      } catch (error) {
        return JSON.stringify({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Error desconocido al actualizar el combo",
        })
      }
    },
  })

  const deleteComboTool = createTool({
    description:
      "Elimina un combo existente (marcado como eliminado). Confirma con el usuario antes de eliminar.",
    args: z.object({
      comboId: z
        .string()
        .describe("ID del combo a eliminar (obtenido de listCombosTool)"),
    }),
    handler: async (toolCtx, args) => {
      const actionCtx = toolCtx as unknown as ActionCtx
      try {
        const validComboIds = await getValidComboIds(actionCtx)
        if (!validComboIds.has(args.comboId)) {
          return JSON.stringify({
            success: false,
            error: "comboId no es válido o no pertenece a esta organización.",
            invalidComboId: args.comboId,
            hint: "Usa listCombosTool para obtener IDs válidos.",
          })
        }

        await actionCtx.runMutation(api.private.combos.remove, {
          organizationId,
          comboId: args.comboId as Id<"combos">,
        })

        return JSON.stringify({
          success: true,
          message: "Combo eliminado exitosamente.",
        })
      } catch (error) {
        return JSON.stringify({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Error desconocido al eliminar el combo",
        })
      }
    },
  })

  return {
    listMenuProductsTool,
    listCombosTool,
    createComboTool,
    updateComboTool,
    deleteComboTool,
  }
}
