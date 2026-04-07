import z from "zod"
import { internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import { createTaggedTool } from "./toolWrapper"

export const comboSlotFilling = createTaggedTool({
  description:
    "Herramienta de llenado guiado de slots para combos. Dado un comboId y las selecciones actuales del cliente, determina el siguiente slot requerido por llenar y presenta las opciones disponibles. Soporta selección múltiple y repetición con quantity por opción. Cuando todos los slots están completos o no hay más opciones, retorna resumen con precio total. NO persiste datos.",
  args: z.object({
    comboId: z.string().describe("ID interno de Convex del combo seleccionado"),
    selections: z
      .array(
        z.object({
          slotId: z.string().optional().describe("ID del slot (preferido)"),
          slotName: z.string().describe("Nombre del slot que se ha llenado"),
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
        "Array de selecciones actuales del cliente. Vacío al inicio, se va llenando conforme el cliente elige opciones."
      ),
  }),
  handler: async (ctx, args): Promise<string> => {
    const combo = await ctx.runQuery(internal.system.combos.getComboWithTree, {
      comboId: args.comboId as Id<"combos">,
    })

    if (!combo) {
      return "Error: Combo no encontrado o no está activo."
    }

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
        continue
      }

      const slotSelections = selectionsBySlot.get(String(slot._id)) ?? new Map()
      const prevQty = slotSelections.get(selection.menuProductId) ?? 0
      slotSelections.set(
        selection.menuProductId,
        prevQty + (selection.quantity ?? 1)
      )
      selectionsBySlot.set(String(slot._id), slotSelections)
    }

    const filledSlots: Array<{
      slotId: string
      slotName: string
      selectedOption: string
      menuProductId: string
      upcharge: number
      quantity: number
    }> = []

    const slotCounters = new Map<string, number>()

    for (const slot of combo.slots) {
      const slotSelections = selectionsBySlot.get(String(slot._id)) ?? new Map()
      let validSelectionCount = 0

      for (const [menuProductId, selectionQty] of slotSelections.entries()) {
        const matchedOption = slot.options.find(
          (o) => o.menuProductId === menuProductId
        )
        if (!matchedOption) {
          continue
        }
        validSelectionCount += selectionQty

        filledSlots.push({
          slotId: String(slot._id),
          slotName: slot.name,
          selectedOption: matchedOption.menuProductName,
          menuProductId,
          upcharge: matchedOption.upcharge,
          quantity: selectionQty,
        })
      }

      slotCounters.set(String(slot._id), validSelectionCount)
    }

    const invalidSlot = combo.slots.find((slot) => {
      const count = slotCounters.get(String(slot._id)) ?? 0
      return count > slot.maxSelections
    })

    if (invalidSlot) {
      const count = slotCounters.get(String(invalidSlot._id)) ?? 0
      return JSON.stringify(
        {
          status: "invalid_selection",
          comboName: combo.name,
          message: `El slot '${invalidSlot.name}' permite máximo ${invalidSlot.maxSelections} selección${invalidSlot.maxSelections > 1 ? "es" : ""}. Actualmente tiene ${count}.`,
          currentSlot: {
            slotId: invalidSlot._id,
            name: invalidSlot.name,
            minSelections: invalidSlot.minSelections,
            maxSelections: invalidSlot.maxSelections,
            selectedCount: count,
            options: invalidSlot.options.map((o) => ({
              name: o.menuProductName,
              upcharge: o.upcharge,
              menuProductId: o.menuProductId,
              selectedQuantity:
                selectionsBySlot
                  .get(String(invalidSlot._id))
                  ?.get(o.menuProductId) ?? 0,
            })),
          },
        },
        null,
        2
      )
    }

    const nextRequiredSlot = combo.slots.find((slot) => {
      const count = slotCounters.get(String(slot._id)) ?? 0
      return count < slot.minSelections
    })

    if (nextRequiredSlot) {
      const selectedCount = slotCounters.get(String(nextRequiredSlot._id)) ?? 0
      const slotSelections = selectionsBySlot.get(String(nextRequiredSlot._id))

      return JSON.stringify(
        {
          status: "pending_selection",
          comboName: combo.name,
          currentSlot: {
            slotId: nextRequiredSlot._id,
            name: nextRequiredSlot.name,
            minSelections: nextRequiredSlot.minSelections,
            maxSelections: nextRequiredSlot.maxSelections,
            selectedCount,
            remainingToMin: Math.max(
              0,
              nextRequiredSlot.minSelections - selectedCount
            ),
            options: nextRequiredSlot.options.map((o) => ({
              name: o.menuProductName,
              upcharge: o.upcharge,
              menuProductId: o.menuProductId,
              selectedQuantity: slotSelections?.get(o.menuProductId) ?? 0,
            })),
          },
          filledSlots: filledSlots.map((f) => ({
            slotId: f.slotId,
            slotName: f.slotName,
            selectedOption: f.selectedOption,
            upcharge: f.upcharge,
            quantity: f.quantity,
          })),
        },
        null,
        2
      )
    }

    const nextOptionalSlot = combo.slots.find((slot) => {
      const count = slotCounters.get(String(slot._id)) ?? 0
      return count >= slot.minSelections && count < slot.maxSelections
    })

    if (nextOptionalSlot) {
      const selectedCount = slotCounters.get(String(nextOptionalSlot._id)) ?? 0
      const slotSelections = selectionsBySlot.get(String(nextOptionalSlot._id))

      return JSON.stringify(
        {
          status: "pending_optional",
          comboName: combo.name,
          currentSlot: {
            slotId: nextOptionalSlot._id,
            name: nextOptionalSlot.name,
            minSelections: nextOptionalSlot.minSelections,
            maxSelections: nextOptionalSlot.maxSelections,
            selectedCount,
            remainingToMax: Math.max(
              0,
              nextOptionalSlot.maxSelections - selectedCount
            ),
            options: nextOptionalSlot.options.map((o) => ({
              name: o.menuProductName,
              upcharge: o.upcharge,
              menuProductId: o.menuProductId,
              selectedQuantity: slotSelections?.get(o.menuProductId) ?? 0,
            })),
          },
          filledSlots: filledSlots.map((f) => ({
            slotId: f.slotId,
            slotName: f.slotName,
            selectedOption: f.selectedOption,
            upcharge: f.upcharge,
            quantity: f.quantity,
          })),
          message:
            "Todos los slots requeridos están llenos. Puedes ofrecer selecciones opcionales adicionales o finalizar el combo.",
        },
        null,
        2
      )
    }

    const totalUpcharges = filledSlots.reduce(
      (sum, f) => sum + f.upcharge * f.quantity,
      0
    )

    return JSON.stringify(
      {
        status: "complete",
        comboName: combo.name,
        selections: filledSlots.map((f) => ({
          slotId: f.slotId,
          slotName: f.slotName,
          selectedOption: f.selectedOption,
          menuProductId: f.menuProductId,
          upcharge: f.upcharge,
          quantity: f.quantity,
        })),
        basePrice: combo.basePrice,
        totalUpcharges,
        totalPrice: combo.basePrice + totalUpcharges,
      },
      null,
      2
    )
  },
})
