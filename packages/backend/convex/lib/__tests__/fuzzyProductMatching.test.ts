import { describe, expect, it } from "vitest"
import { matchProductNames } from "../fuzzyProductMatching"

const menu = [
  { _id: "p1", name: "Pizza Margherita", price: 25000 },
  { _id: "p2", name: "Pizza Hawaiana", price: 28000 },
  { _id: "p3", name: "Coca-Cola", price: 5000 },
  { _id: "p4", name: "Café Colombiano", price: 4000 },
  { _id: "p5", name: "Hamburguesa Clásica", price: 18000 },
]

describe("matchProductNames", () => {
  it("returns score 1.0 for exact match", () => {
    const results = matchProductNames(["Pizza Margherita"], menu)
    const matches = results.get("Pizza Margherita")!
    expect(matches[0]!.productName).toBe("Pizza Margherita")
    expect(matches[0]!.score).toBe(1.0)
  })

  it("returns high score for close misspelling (Levenshtein fallback)", () => {
    const singleWordMenu = [{ _id: "p1", name: "Margherita", price: 25000 }]
    const results = matchProductNames(["Margarita"], singleWordMenu)
    const matches = results.get("Margarita")!
    expect(matches[0]!.productName).toBe("Margherita")
    expect(matches[0]!.score).toBeGreaterThanOrEqual(0.7)
  })

  it("returns reasonable score for partial match (substring inclusion)", () => {
    const results = matchProductNames(["Pizza"], menu)
    const matches = results.get("Pizza")!
    const pizzaNames = matches.map((m) => m.productName)
    expect(pizzaNames).toContain("Pizza Margherita")
    expect(pizzaNames).toContain("Pizza Hawaiana")
    expect(matches[0]!.score).toBeGreaterThanOrEqual(0.7)
  })

  it("returns low score for completely different name", () => {
    const results = matchProductNames(["Sushi Roll"], menu)
    const matches = results.get("Sushi Roll")!
    expect(matches[0]!.score).toBeLessThan(0.5)
  })

  it("returns empty matches for empty product list", () => {
    const results = matchProductNames(["Pizza Margherita"], [])
    const matches = results.get("Pizza Margherita")!
    expect(matches).toHaveLength(0)
  })

  it("matches accented vs non-accented names (Café vs Cafe)", () => {
    const results = matchProductNames(["Cafe Colombiano"], menu)
    const matches = results.get("Cafe Colombiano")!
    expect(matches[0]!.productName).toBe("Café Colombiano")
    expect(matches[0]!.score).toBe(1.0)
  })

  it("returns at most 3 matches per extracted name", () => {
    const results = matchProductNames(["Pizza"], menu)
    const matches = results.get("Pizza")!
    expect(matches.length).toBeLessThanOrEqual(3)
  })

  it("handles multiple extracted names independently", () => {
    const results = matchProductNames(["Pizza Margherita", "Coca-Cola"], menu)
    expect(results.size).toBe(2)
    expect(results.get("Pizza Margherita")![0]!.productName).toBe(
      "Pizza Margherita"
    )
    expect(results.get("Coca-Cola")![0]!.productName).toBe("Coca-Cola")
    expect(results.get("Coca-Cola")![0]!.score).toBe(1.0)
  })

  it("matches case-insensitively", () => {
    const results = matchProductNames(["PIZZA MARGHERITA"], menu)
    const matches = results.get("PIZZA MARGHERITA")!
    expect(matches[0]!.productName).toBe("Pizza Margherita")
    expect(matches[0]!.score).toBe(1.0)
  })

  it("includes productId and price in results", () => {
    const results = matchProductNames(["Coca-Cola"], menu)
    const match = results.get("Coca-Cola")![0]!
    expect(match.productId).toBe("p3")
    expect(match.price).toBe(5000)
  })
})
