interface ComboSelectionWithUpcharge {
  upcharge: number
  quantity?: number
}

interface ComboPricedItem {
  comboBasePrice?: number
  comboSlotSelections?: ComboSelectionWithUpcharge[] | null
  quantity: number
}

export function calculateComboUnitPrice(
  item: Pick<ComboPricedItem, "comboBasePrice" | "comboSlotSelections">
) {
  const basePrice = item.comboBasePrice ?? 0
  const upcharges =
    item.comboSlotSelections?.reduce(
      (sum, sel) => sum + sel.upcharge * (sel.quantity ?? 1),
      0
    ) ?? 0
  return basePrice + upcharges
}

export function calculateComboSubtotal(item: ComboPricedItem) {
  return calculateComboUnitPrice(item) * item.quantity
}
