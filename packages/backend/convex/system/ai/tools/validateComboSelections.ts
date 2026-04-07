import z from "zod"
import { internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import { createTaggedTool } from "./toolWrapper"

export const validateComboSelections = createTaggedTool({
  description:
    "Validar las selecciones de un combo antes de confirmar el pedido. Verifica que todos los slots requeridos tengan selecciones válidas, que no se excedan los máximos, que los productos seleccionados sean opciones válidas del combo, y que el combo esté disponible en la ubicación del cliente. Calcula el precio final (precio base + recargos). USAR SOLO para pedidos de combos. Para productos regulares, usar validateMenuCombinationsTool.",
  args: z.object({
    comboId: z
      .string()
      .describe(
        "ID interno de Convex del combo a validar. Debe provenir de searchMenuProductsTool."
      ),
    restaurantLocationId: z
      .string()
      .describe(
        "ID del restaurante para verificar disponibilidad. Obtenido tras usar validateAddressTool."
      ),
    selections: z
      .array(
        z.object({
          slotId: z
            .string()
            .optional()
            .describe("ID del slot del combo (preferido)"),
          slotName: z
            .string()
            .describe("Nombre del slot del combo (ej: 'Principal', 'Bebida')"),
          menuProductId: z
            .string()
            .describe(
              "ID interno de Convex del producto seleccionado para este slot"
            ),
          quantity: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Cantidad de esta opción en el slot (default: 1)"),
        })
      )
      .describe(
        "Lista de selecciones del cliente por slot. Para repetir una opción, usar quantity > 1 o repetir entradas (compatibilidad legacy)."
      ),
    quantity: z
      .number()
      .optional()
      .describe("Cantidad de este combo (default: 1)"),
  }),
  handler: async (ctx, args): Promise<string> => {
    if (!ctx.threadId) {
      return "Error: Falta el ID del hilo"
    }

    try {
      const conversation = await ctx.runQuery(
        internal.system.conversations.getByThreadId,
        { threadId: ctx.threadId }
      )

      if (!conversation) {
        return "Error: Conversación no encontrada"
      }

      const comboId = args.comboId as Id<"combos">
      const locationId = args.restaurantLocationId as Id<"restaurantLocations">
      const comboQuantity = args.quantity ?? 1

      const isAvailable = await ctx.runQuery(
        internal.system.combos.isComboAvailableAtLocation,
        { comboId, restaurantLocationId: locationId }
      )

      if (!isAvailable) {
        return JSON.stringify({
          valid: false,
          errors: [
            "Este combo no está disponible en la ubicación seleccionada",
          ],
        })
      }

      const combo = await ctx.runQuery(
        internal.system.combos.getComboWithTree,
        {
          comboId,
        }
      )

      if (!combo) {
        return JSON.stringify({
          valid: false,
          errors: ["Combo no encontrado o no está activo"],
        })
      }

      if (combo.organizationId !== conversation.organizationId) {
        return JSON.stringify({
          valid: false,
          errors: ["Combo no pertenece a esta organización"],
        })
      }

      const errors: string[] = []
      const slotById = new Map(
        combo.slots.map((slot) => [String(slot._id), slot])
      )
      const slotByName = new Map(combo.slots.map((slot) => [slot.name, slot]))

      const selectionsBySlot = new Map<string, Map<string, number>>()
      for (const selection of args.selections) {
        const slot = selection.slotId
          ? slotById.get(selection.slotId)
          : slotByName.get(selection.slotName)

        if (!slot) {
          const slotRef = selection.slotId || selection.slotName
          errors.push(`El slot '${slotRef}' no existe en este combo`)
          continue
        }

        const slotSelections =
          selectionsBySlot.get(String(slot._id)) ?? new Map()
        const prevQty = slotSelections.get(selection.menuProductId) ?? 0
        slotSelections.set(
          selection.menuProductId,
          prevQty + (selection.quantity ?? 1)
        )
        selectionsBySlot.set(String(slot._id), slotSelections)
      }

      const validatedSlotSelections: Array<{
        slotId: string
        slotName: string
        menuProductId: string
        menuProductName: string
        upcharge: number
        quantity: number
      }> = []

      for (const slot of combo.slots) {
        const slotSelections =
          selectionsBySlot.get(String(slot._id)) ?? new Map()
        const selectionCount = Array.from(slotSelections.values()).reduce(
          (sum, qty) => sum + qty,
          0
        )

        if (selectionCount < slot.minSelections) {
          errors.push(
            `El slot '${slot.name}' requiere al menos ${slot.minSelections} selección${slot.minSelections > 1 ? "es" : ""}`
          )
          continue
        }

        if (selectionCount > slot.maxSelections) {
          errors.push(
            `El slot '${slot.name}' permite máximo ${slot.maxSelections} selección${slot.maxSelections > 1 ? "es" : ""}`
          )
          continue
        }

        for (const [menuProductId, selectionQty] of slotSelections.entries()) {
          const matchingOption = slot.options.find(
            (opt) => opt.menuProductId === menuProductId
          )

          if (!matchingOption) {
            errors.push(
              `El producto '${menuProductId}' no es una opción válida para el slot '${slot.name}'`
            )
            continue
          }

          validatedSlotSelections.push({
            slotId: String(slot._id),
            slotName: slot.name,
            menuProductId: matchingOption.menuProductId,
            menuProductName: matchingOption.menuProductName,
            upcharge: matchingOption.upcharge,
            quantity: selectionQty,
          })
        }
      }

      if (errors.length > 0) {
        return JSON.stringify({ valid: false, errors })
      }

      const totalUpcharges = validatedSlotSelections.reduce(
        (sum, s) => sum + s.upcharge * s.quantity,
        0
      )
      const resolvedPrice = combo.basePrice + totalUpcharges

      const allSelectedProductIds: string[] = []
      for (const sel of validatedSlotSelections) {
        for (let i = 0; i < sel.quantity; i += 1) {
          allSelectedProductIds.push(sel.menuProductId)
        }
      }

      return JSON.stringify({
        valid: true,
        comboId: combo._id,
        comboName: combo.name,
        items: [
          {
            menuProducts: allSelectedProductIds,
            quantity: comboQuantity,
            itemType: "combo",
            comboId: combo._id,
            comboName: combo.name,
            comboSlotSelections: validatedSlotSelections.map((s) => ({
              slotId: s.slotId,
              slotName: s.slotName,
              menuProductId: s.menuProductId,
              productName: s.menuProductName,
              upcharge: s.upcharge,
              quantity: s.quantity,
            })),
            comboBasePrice: combo.basePrice,
            totalUpcharges,
            resolvedPrice,
          },
        ],
      })
    } catch (error) {
      return `Error al validar selecciones del combo: ${error instanceof Error ? error.message : "Error desconocido"}`
    }
  },
})
