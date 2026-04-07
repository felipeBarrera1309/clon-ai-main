export interface ProductMatchResult {
  productId: string
  productName: string
  price: number
  score: number
}

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function stringSimilarity(a: string, b: string): number {
  const normA = normalizeName(a)
  const normB = normalizeName(b)

  if (normA === normB) return 1.0

  if (normA.includes(normB) || normB.includes(normA)) {
    const shorter = Math.min(normA.length, normB.length)
    const longer = Math.max(normA.length, normB.length)
    return 0.7 + 0.2 * (shorter / longer)
  }

  const wordsA = normA.split(/\s+/)
  const wordsB = normB.split(/\s+/)
  const commonWords = wordsA.filter((w) =>
    wordsB.some((wb) => wb.includes(w) || w.includes(wb))
  )
  if (commonWords.length > 0) {
    const maxWords = Math.max(wordsA.length, wordsB.length)
    return 0.3 + 0.4 * (commonWords.length / maxWords)
  }

  const maxLen = Math.max(normA.length, normB.length)
  if (maxLen === 0) return 1.0
  const distance = levenshteinDistance(normA, normB)
  const similarity = 1 - distance / maxLen
  return Math.max(0, similarity)
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  )

  for (let i = 0; i <= m; i++) dp[i]![0] = i
  for (let j = 0; j <= n; j++) dp[0]![j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      )
    }
  }

  return dp[m]![n]!
}

export function matchProductNames(
  extractedNames: string[],
  menuProducts: Array<{ _id: string; name: string; price: number }>
): Map<string, ProductMatchResult[]> {
  const results = new Map<string, ProductMatchResult[]>()

  for (const extractedName of extractedNames) {
    const scored = menuProducts.map((product) => ({
      productId: product._id,
      productName: product.name,
      price: product.price,
      score: stringSimilarity(extractedName, product.name),
    }))

    scored.sort((a, b) => b.score - a.score)

    results.set(extractedName, scored.slice(0, 3))
  }

  return results
}
