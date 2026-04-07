/**
 * Currency utilities for Colombian Peso (COP) formatting and calculations
 * Colombian pesos don't use decimal values
 */

/**
 * Formats a number as Colombian Pesos without decimals
 * @param amount - The amount in pesos (should be a whole number)
 * @returns Formatted peso string (e.g., "$52.000")
 */
export function formatPesos(amount: number): string {
  // Round to ensure whole peso amounts
  const wholeAmount = Math.round(amount)

  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(wholeAmount)
}

/**
 * Alias for formatPesos to match existing function names in components
 * @param price - The price amount in pesos
 * @returns Formatted peso string (e.g., "$52.000") or "Sin Precio" if price is 0
 */
export function formatPrice(price: number): string {
  if (price === 0) {
    return "Sin Precio"
  }
  return formatPesos(price)
}

/**
 * Formats a number as Colombian currency for display purposes
 * @param amount - The amount in pesos
 * @returns Formatted peso string (e.g., "$52.000")
 */
export function formatCurrency(amount: number): string {
  return formatPesos(amount)
}

/**
 * Ensures an amount is a whole peso value
 * @param amount - The amount to round
 * @returns Whole peso amount
 */
export function toPesos(amount: number): number {
  return Math.round(amount)
}
