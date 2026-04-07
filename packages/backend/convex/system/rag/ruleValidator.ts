import type { FormattedProduct } from "./responseFormatter"

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  appliedRules: string[]
}

export interface ProductValidationResult extends ValidationResult {
  product: FormattedProduct
}

export class RuleValidator {
  static validateProductRules(
    product: FormattedProduct,
    rules?: any
  ): ProductValidationResult {
    // Simplified validation - no complex rules, just basic product validation
    return {
      isValid: true,
      errors: [],
      warnings: [],
      appliedRules: [],
      product,
    }
  }

  static validateProductList(
    products: FormattedProduct[],
    rules?: any
  ): {
    validatedProducts: ProductValidationResult[]
    summary: ValidationResult
  } {
    const validatedProducts = products.map((product) =>
      RuleValidator.validateProductRules(product, rules)
    )

    const summary: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      appliedRules: [],
    }

    return {
      validatedProducts,
      summary,
    }
  }

  static validateCombination(
    items: Array<{
      products: FormattedProduct[]
      quantity: number
    }>,
    rules?: any
  ): ValidationResult {
    // Simplified validation - no complex combination rules
    return {
      isValid: true,
      errors: [],
      warnings: [],
      appliedRules: [],
    }
  }

  static validateOrderCombination(
    orderItems: Array<{
      products: FormattedProduct[]
      quantity: number
    }>,
    rules?: any
  ): ValidationResult {
    return RuleValidator.validateCombination(orderItems, rules)
  }

  /**
   * Simplified - always returns false since no rules are applied
   */
  static shouldApplyRules(
    query: string,
    products: FormattedProduct[]
  ): boolean {
    return false
  }

  /**
   * No help messages since no rules are applied
   */
  static generateHelpMessages(appliedRules: string[]): string[] {
    return []
  }
}
