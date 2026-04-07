import { describe, expect, it } from "vitest"
import { buildOrgOverlayCases } from "./agentBenchmark"
import { buildGlobalBenchmarkSuiteV1 } from "./agentBenchmarkDefaults"
import type { OrgOverlayRestaurantConfig } from "./agentBenchmarkTypes"

describe("buildGlobalBenchmarkSuiteV1", () => {
  const suite = buildGlobalBenchmarkSuiteV1()

  it("returns at least 80 cases", () => {
    expect(suite.length).toBeGreaterThanOrEqual(80)
  })

  it("has all unique caseKeys", () => {
    const keys = suite.map((c) => c.caseKey)
    const uniqueKeys = new Set(keys)
    expect(uniqueKeys.size).toBe(keys.length)
  })

  it("covers all 9 categories", () => {
    const categories = new Set(suite.map((c) => c.category))
    expect(categories.size).toBe(9)
    expect(categories.has("flow")).toBe(true)
    expect(categories.has("tools")).toBe(true)
    expect(categories.has("security")).toBe(true)
    expect(categories.has("tone")).toBe(true)
    expect(categories.has("coverage")).toBe(true)
    expect(categories.has("combinations")).toBe(true)
    expect(categories.has("scheduling")).toBe(true)
    expect(categories.has("payment")).toBe(true)
    expect(categories.has("escalation")).toBe(true)
  })

  it("has at least 5 cases per category", () => {
    const categoryCounts = new Map<string, number>()
    for (const c of suite) {
      categoryCounts.set(c.category, (categoryCounts.get(c.category) ?? 0) + 1)
    }
    for (const [category, count] of categoryCounts) {
      expect(
        count,
        `Category ${category} has only ${count} cases`
      ).toBeGreaterThanOrEqual(5)
    }
  })

  it("has valid structure for all cases", () => {
    for (const c of suite) {
      expect(c.caseKey).toBeTruthy()
      expect(c.name).toBeTruthy()
      expect(c.inputScript.length).toBeGreaterThan(0)
      expect(c.judgeRubric.successDefinition).toBeTruthy()
      expect(typeof c.critical).toBe("boolean")
      expect(["low", "medium", "high"]).toContain(c.priority)
    }
  })

  it("has no duplicate inputScript arrays", () => {
    const scripts = suite.map((c) =>
      JSON.stringify(c.inputScript.map((s) => s.text))
    )
    const uniqueScripts = new Set(scripts)
    expect(uniqueScripts.size).toBe(scripts.length)
  })

  it("has judgeRubric weights that sum close to 1.0", () => {
    for (const c of suite) {
      const sum =
        c.judgeRubric.clarityWeight +
        c.judgeRubric.accuracyWeight +
        c.judgeRubric.contextWeight +
        c.judgeRubric.policyWeight +
        c.judgeRubric.toneWeight
      expect(
        Math.abs(sum - 1.0),
        `Case ${c.caseKey} weights sum to ${sum}`
      ).toBeLessThan(0.01)
    }
  })

  it("has no cases with identical inputScript text content", () => {
    const scriptTexts = suite.map((c) =>
      c.inputScript.map((s) => s.text).join("|")
    )
    const uniqueTexts = new Set(scriptTexts)
    expect(
      uniqueTexts.size,
      `Found ${scriptTexts.length - uniqueTexts.size} duplicate inputScript text(s)`
    ).toBe(scriptTexts.length)
  })

  it("has non-empty successDefinition in every judgeRubric", () => {
    for (const c of suite) {
      expect(
        c.judgeRubric.successDefinition.trim().length,
        `Case ${c.caseKey} has empty successDefinition`
      ).toBeGreaterThan(0)
    }
  })

  it("has all individual rubric weights between 0 and 1 exclusive", () => {
    for (const c of suite) {
      const weights = [
        c.judgeRubric.clarityWeight,
        c.judgeRubric.accuracyWeight,
        c.judgeRubric.contextWeight,
        c.judgeRubric.policyWeight,
        c.judgeRubric.toneWeight,
      ]
      for (const w of weights) {
        expect(
          w,
          `Case ${c.caseKey} has weight ${w} out of (0,1) range`
        ).toBeGreaterThan(0)
        expect(
          w,
          `Case ${c.caseKey} has weight ${w} out of (0,1) range`
        ).toBeLessThanOrEqual(1)
      }
    }
  })

  it("has at least one critical case per high-priority category", () => {
    const highPriorityCategories = ["flow", "security", "tools"]
    for (const category of highPriorityCategories) {
      const criticalCases = suite.filter(
        (c) => c.category === category && c.critical
      )
      expect(
        criticalCases.length,
        `Category ${category} has no critical cases`
      ).toBeGreaterThanOrEqual(1)
    }
  })
})

describe("buildOrgOverlayCases", () => {
  const baseArgs: Parameters<typeof buildOrgOverlayCases>[0] = {
    organizationId: "org-test-123",
    restaurantConfig: null,
    debugSignals: [],
  }

  it("generates at least 10 cases with null restaurantConfig and no debug signals", () => {
    const cases = buildOrgOverlayCases(baseArgs)
    expect(cases.length).toBeGreaterThanOrEqual(10)
  })

  it("produces all unique caseKeys", () => {
    const cases = buildOrgOverlayCases(baseArgs)
    const keys = cases.map((c) => c.caseKey)
    const uniqueKeys = new Set(keys)
    expect(uniqueKeys.size).toBe(keys.length)
  })

  it("generates debug replay cases with address-related inputScript for address signals", () => {
    const cases = buildOrgOverlayCases({
      ...baseArgs,
      debugSignals: [{ reason: "dirección fuera de cobertura" }],
    })
    const debugCases = cases.filter((c) => c.caseKey.includes("debug-replay"))
    expect(debugCases.length).toBe(1)
    const scriptText = debugCases[0]!.inputScript.map((s) => s.text).join(" ")
    expect(scriptText).toContain("domicilio")
  })

  it("generates debug replay cases with menu-related inputScript for price signals", () => {
    const cases = buildOrgOverlayCases({
      ...baseArgs,
      debugSignals: [{ reason: "precio incorrecto en el menú" }],
    })
    const debugCases = cases.filter((c) => c.caseKey.includes("debug-replay"))
    expect(debugCases.length).toBe(1)
    const scriptText = debugCases[0]!.inputScript.map((s) => s.text).join(" ")
    expect(scriptText).toContain("cuesta")
  })

  it("generates debug replay cases with payment-related inputScript for payment signals", () => {
    const cases = buildOrgOverlayCases({
      ...baseArgs,
      debugSignals: [{ reason: "método de pago rechazado" }],
    })
    const debugCases = cases.filter((c) => c.caseKey.includes("debug-replay"))
    expect(debugCases.length).toBe(1)
    const scriptText = debugCases[0]!.inputScript.map((s) => s.text).join(" ")
    expect(scriptText).toContain("pagar")
  })

  it("generates debug replay cases with order-related inputScript for order signals", () => {
    const cases = buildOrgOverlayCases({
      ...baseArgs,
      debugSignals: [{ reason: "pedido no se creó correctamente" }],
    })
    const debugCases = cases.filter((c) => c.caseKey.includes("debug-replay"))
    expect(debugCases.length).toBe(1)
    const scriptText = debugCases[0]!.inputScript.map((s) => s.text).join(" ")
    expect(scriptText).toContain("pizza")
  })

  it("uses fallback inputScript for unrecognized debug signal reasons", () => {
    const cases = buildOrgOverlayCases({
      ...baseArgs,
      debugSignals: [{ reason: "something completely different" }],
    })
    const debugCases = cases.filter((c) => c.caseKey.includes("debug-replay"))
    expect(debugCases.length).toBe(1)
    const scriptText = debugCases[0]!.inputScript.map((s) => s.text).join(" ")
    expect(scriptText).toContain("something completely different")
  })

  it("caps debug replay cases at 6 even with more signals", () => {
    const cases = buildOrgOverlayCases({
      ...baseArgs,
      debugSignals: Array.from({ length: 10 }, (_, i) => ({
        reason: `error ${i}`,
      })),
    })
    const debugCases = cases.filter((c) => c.caseKey.includes("debug-replay"))
    expect(debugCases.length).toBe(6)
  })

  it("produces varied padding templates (not all identical)", () => {
    const cases = buildOrgOverlayCases(baseArgs)
    const paddingCases = cases.filter((c) =>
      c.caseKey.includes("baseline-overlay")
    )
    if (paddingCases.length > 1) {
      const texts = paddingCases.map((c) => c.inputScript[0]!.text)
      const uniqueTexts = new Set(texts)
      expect(uniqueTexts.size).toBeGreaterThan(1)
    }
  })

  it("includes delivery address case when enableDelivery is true", () => {
    const mockConfig: OrgOverlayRestaurantConfig = {
      enableDelivery: true,
      enablePickup: false,
      enableElectronicInvoice: false,
      acceptSodexoVoucher: false,
    }

    const cases = buildOrgOverlayCases({
      ...baseArgs,
      restaurantConfig: mockConfig,
    })
    expect(
      cases.some((c) => c.caseKey.includes("delivery-address-validation"))
    ).toBe(true)
  })

  it("excludes delivery address case when enableDelivery is false", () => {
    const mockConfig: OrgOverlayRestaurantConfig = {
      enableDelivery: false,
      enablePickup: true,
      enableElectronicInvoice: false,
      acceptSodexoVoucher: false,
    }

    const cases = buildOrgOverlayCases({
      ...baseArgs,
      restaurantConfig: mockConfig,
    })
    expect(
      cases.some((c) => c.caseKey.includes("delivery-address-validation"))
    ).toBe(false)
  })

  it("includes invoice case when enableElectronicInvoice is true", () => {
    const mockConfig: OrgOverlayRestaurantConfig = {
      enableDelivery: true,
      enablePickup: true,
      enableElectronicInvoice: true,
      acceptSodexoVoucher: false,
    }

    const cases = buildOrgOverlayCases({
      ...baseArgs,
      restaurantConfig: mockConfig,
    })
    expect(cases.some((c) => c.caseKey.includes("invoice-flow"))).toBe(true)
  })

  it("includes sodexo rejection case when acceptSodexoVoucher is true", () => {
    const mockConfig: OrgOverlayRestaurantConfig = {
      enableDelivery: true,
      enablePickup: true,
      enableElectronicInvoice: false,
      acceptSodexoVoucher: true,
    }

    const cases = buildOrgOverlayCases({
      ...baseArgs,
      restaurantConfig: mockConfig,
    })
    expect(
      cases.some((c) => c.caseKey.includes("sodexo-delivery-rejection"))
    ).toBe(true)
  })

  it("has valid structure for all generated cases", () => {
    const cases = buildOrgOverlayCases({
      ...baseArgs,
      debugSignals: [
        { reason: "dirección inválida" },
        { reason: "precio raro" },
      ],
    })
    for (const c of cases) {
      expect(c.caseKey).toBeTruthy()
      expect(c.name).toBeTruthy()
      expect(c.inputScript.length).toBeGreaterThan(0)
      expect(c.judgeRubric.successDefinition).toBeTruthy()
      expect(typeof c.critical).toBe("boolean")
      expect(["low", "medium", "high"]).toContain(c.priority)
      const weightSum =
        c.judgeRubric.clarityWeight +
        c.judgeRubric.accuracyWeight +
        c.judgeRubric.contextWeight +
        c.judgeRubric.policyWeight +
        c.judgeRubric.toneWeight
      expect(
        Math.abs(weightSum - 1.0),
        `Case ${c.caseKey} weights sum to ${weightSum}`
      ).toBeLessThan(0.01)
    }
  })
})
