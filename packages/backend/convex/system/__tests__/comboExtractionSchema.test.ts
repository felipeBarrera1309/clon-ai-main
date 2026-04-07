import { describe, expect, it } from "vitest"
import {
  extractedComboSchema,
  extractedCombosSchema,
  extractedOptionSchema,
  extractedSlotSchema,
} from "../comboExtractionSchema"

const validOption = {
  productName: "Pollo Asado",
  upcharge: 3000,
  isDefault: true,
}

const validSlot = {
  name: "Escoge tu proteína",
  minSelections: 1,
  maxSelections: 2,
  options: [validOption],
}

const validCombo = {
  name: "Combo Familiar",
  description: "Incluye entrada, plato principal y bebida",
  basePrice: 35000,
  slots: [validSlot],
}

describe("extractedOptionSchema", () => {
  it("accepts valid option with all fields", () => {
    const result = extractedOptionSchema.safeParse(validOption)
    expect(result.success).toBe(true)
  })

  it("applies defaults: upcharge=0 and isDefault=false", () => {
    const result = extractedOptionSchema.parse({ productName: "Arroz" })
    expect(result.upcharge).toBe(0)
    expect(result.isDefault).toBe(false)
  })

  it("rejects option without productName", () => {
    const result = extractedOptionSchema.safeParse({ upcharge: 0 })
    expect(result.success).toBe(false)
  })
})

describe("extractedSlotSchema", () => {
  it("accepts valid slot with all fields", () => {
    const result = extractedSlotSchema.safeParse(validSlot)
    expect(result.success).toBe(true)
  })

  it("applies defaults: minSelections=1 and maxSelections=1", () => {
    const result = extractedSlotSchema.parse({
      name: "Bebida",
      options: [{ productName: "Coca-Cola" }],
    })
    expect(result.minSelections).toBe(1)
    expect(result.maxSelections).toBe(1)
  })

  it("rejects slot with empty options array", () => {
    const result = extractedSlotSchema.safeParse({
      name: "Bebida",
      options: [],
    })
    expect(result.success).toBe(false)
  })

  it("rejects slot without name", () => {
    const result = extractedSlotSchema.safeParse({
      options: [{ productName: "Agua" }],
    })
    expect(result.success).toBe(false)
  })
})

describe("extractedComboSchema", () => {
  it("accepts valid combo with nested slots and options", () => {
    const result = extractedComboSchema.safeParse(validCombo)
    expect(result.success).toBe(true)
  })

  it("rejects combo without name", () => {
    const { name: _, ...noName } = validCombo
    const result = extractedComboSchema.safeParse(noName)
    expect(result.success).toBe(false)
  })

  it("rejects combo with empty slots array", () => {
    const result = extractedComboSchema.safeParse({
      ...validCombo,
      slots: [],
    })
    expect(result.success).toBe(false)
  })

  it("rejects combo without basePrice", () => {
    const { basePrice: _, ...noPrice } = validCombo
    const result = extractedComboSchema.safeParse(noPrice)
    expect(result.success).toBe(false)
  })
})

describe("extractedCombosSchema", () => {
  it("accepts wrapper with combo array", () => {
    const result = extractedCombosSchema.safeParse({ combos: [validCombo] })
    expect(result.success).toBe(true)
  })

  it("accepts empty combos array", () => {
    const result = extractedCombosSchema.safeParse({ combos: [] })
    expect(result.success).toBe(true)
  })

  it("propagates defaults through nested structure", () => {
    const minimal = {
      combos: [
        {
          name: "Combo Test",
          description: "Test",
          basePrice: 10000,
          slots: [
            {
              name: "Principal",
              options: [{ productName: "Arroz con Pollo" }],
            },
          ],
        },
      ],
    }
    const result = extractedCombosSchema.parse(minimal)
    const slot = result.combos[0]!.slots[0]!
    const option = slot.options[0]!
    expect(slot.minSelections).toBe(1)
    expect(slot.maxSelections).toBe(1)
    expect(option.upcharge).toBe(0)
    expect(option.isDefault).toBe(false)
  })
})
