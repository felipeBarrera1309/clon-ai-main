import z from "zod"
import { internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import { createTaggedTool } from "./toolWrapper"

function formatPrice(price: number): string {
  return `$${price.toLocaleString("es-CO")}`
}

function formatUpcharge(upcharge: number): string {
  if (upcharge === 0) return ""
  return `(+${formatPrice(upcharge)})`
}

type ComboSlot = {
  name: string
  minSelections: number
  maxSelections: number
  options: Array<{
    menuProductId: string
    menuProductName: string
    upcharge: number
    isDefault?: boolean
  }>
}

type ComboWithTree = {
  _id: string
  name: string
  description: string
  basePrice: number
  slots: ComboSlot[]
}

function formatComboForWhatsApp(combo: ComboWithTree): string {
  const lines: string[] = []

  lines.push(`🍽️ *${combo.name}* - ${formatPrice(combo.basePrice)}`)

  if (combo.description) {
    lines.push(`  ${combo.description}`)
  }

  for (const slot of combo.slots) {
    const isOptional = slot.minSelections === 0
    const label = isOptional ? `${slot.name} (opcional)` : slot.name

    const optionTexts = slot.options.map((o) => {
      const upchargeLabel = formatUpcharge(o.upcharge)
      return upchargeLabel
        ? `${o.menuProductName} ${upchargeLabel}`
        : o.menuProductName
    })

    lines.push(`• ${label}: ${optionTexts.join(" / ")}`)
  }

  return lines.join("\n")
}

export const searchCombos = createTaggedTool({
  description:
    "Busca y muestra los combos disponibles en la ubicación del cliente. Retorna la información formateada para WhatsApp con nombres de slots, opciones y recargos. Usar ANTES de comboSlotFillingTool para que el cliente elija un combo.",
  args: z.object({
    restaurantLocationId: z
      .string()
      .describe(
        "ID de la ubicación del restaurante. Obtenido tras usar validateAddressTool."
      ),
    query: z
      .string()
      .optional()
      .describe(
        "Búsqueda opcional del cliente (ej: 'combo de pollo', 'combos familiares'). Si no se proporciona, muestra todos los combos disponibles."
      ),
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

      const locationId = args.restaurantLocationId as Id<"restaurantLocations">

      const combos = await ctx.runQuery(
        internal.system.combos.getAvailableCombosForLocation,
        {
          organizationId: conversation.organizationId,
          restaurantLocationId: locationId,
        }
      )

      if (!combos || combos.length === 0) {
        return JSON.stringify({
          found: false,
          message:
            "No hay combos disponibles en esta ubicación. Puedes ofrecer productos individuales del menú.",
        })
      }

      let filteredCombos = combos as ComboWithTree[]

      if (args.query) {
        const queryLower = args.query.toLowerCase()
        const matched = filteredCombos.filter(
          (c) =>
            c.name.toLowerCase().includes(queryLower) ||
            c.description.toLowerCase().includes(queryLower)
        )
        if (matched.length > 0) {
          filteredCombos = matched
        }
      }

      const formatted = filteredCombos.map(formatComboForWhatsApp).join("\n\n")

      const comboSummary = filteredCombos.map((c) => ({
        comboId: c._id,
        name: c.name,
        basePrice: c.basePrice,
        slotCount: c.slots.length,
      }))

      return JSON.stringify({
        found: true,
        totalCombos: filteredCombos.length,
        combos: comboSummary,
        formattedMessage: formatted,
        instructions:
          "Muestra el formattedMessage al cliente. Cuando elija un combo, usa comboSlotFillingTool con el comboId correspondiente para guiar la selección de opciones.",
      })
    } catch (error) {
      return `Error al buscar combos: ${error instanceof Error ? error.message : "Error desconocido"}`
    }
  },
})
