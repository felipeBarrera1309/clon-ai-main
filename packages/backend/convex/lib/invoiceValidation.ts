/**
 * Invoice Data Validation Utilities
 *
 * Validates Colombian tax identification numbers (Cédula and NIT)
 * with flexible but reasonable format rules.
 */

/**
 * Validates a Colombian Cédula (Natural Person ID)
 *
 * Format: 6-10 digits only
 * Examples: "12345678", "1234567890"
 *
 * @param cedula - The cedula string to validate
 * @returns true if valid, false otherwise
 */
export function isValidCedula(cedula: string | undefined): boolean {
  if (!cedula) return false

  // Remove any whitespace
  const cleaned = cedula.trim()

  // Must be 6-10 digits only
  const cedulaRegex = /^[0-9]{6,10}$/

  return cedulaRegex.test(cleaned)
}

/**
 * Validates a Colombian NIT (Legal Entity Tax ID)
 *
 * Format: 9 digits + optional dash + 1 verification digit (10 total)
 * Examples: "901234567-8", "9012345678", "901234567 8"
 *
 * @param nit - The NIT string to validate
 * @returns true if valid, false otherwise
 */
export function isValidNIT(nit: string | undefined): boolean {
  if (!nit) return false

  // Remove any whitespace
  const cleaned = nit.trim()

  // Accept format: 9 digits + optional dash/space + 1 verification digit
  const nitRegex = /^[0-9]{9}[-\s]?[0-9]$/

  return nitRegex.test(cleaned)
}

/**
 * Validates invoice data based on type
 *
 * @param invoiceData - The invoice data object to validate
 * @returns Object with isValid boolean and optional error message
 */
export function validateInvoiceData(invoiceData: {
  requiresInvoice: boolean
  invoiceType?: "natural" | "juridica"
  email?: string
  fullName?: string
  cedula?: string
  nit?: string
}): { isValid: boolean; error?: string } {
  // If no invoice required, it's valid
  if (!invoiceData.requiresInvoice) {
    return { isValid: true }
  }

  // Invoice required but no type specified
  if (!invoiceData.invoiceType) {
    return {
      isValid: false,
      error: "Debe especificar el tipo de factura (natural o juridica)",
    }
  }

  // Validate email
  if (!invoiceData.email || invoiceData.email.trim() === "") {
    return {
      isValid: false,
      error: "El correo electrónico es obligatorio para la factura",
    }
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(invoiceData.email)) {
    return {
      isValid: false,
      error:
        "El formato del correo electrónico no es válido. Ejemplo: usuario@ejemplo.com",
    }
  }

  // Validate fullName
  if (!invoiceData.fullName || invoiceData.fullName.trim() === "") {
    return {
      isValid: false,
      error:
        invoiceData.invoiceType === "natural"
          ? "El nombre completo es obligatorio para la factura"
          : "La razón social es obligatoria para la factura",
    }
  }

  // Validate based on invoice type
  if (invoiceData.invoiceType === "natural") {
    // Natural person: validate cedula
    if (!invoiceData.cedula || invoiceData.cedula.trim() === "") {
      return {
        isValid: false,
        error:
          "El número de cédula es obligatorio para factura de persona natural",
      }
    }

    if (!isValidCedula(invoiceData.cedula)) {
      return {
        isValid: false,
        error:
          "Formato de cédula inválido. Debe contener solo números (6-10 dígitos). Ejemplo: 12345678",
      }
    }
  } else if (invoiceData.invoiceType === "juridica") {
    // Legal entity: validate NIT
    if (!invoiceData.nit || invoiceData.nit.trim() === "") {
      return {
        isValid: false,
        error: "El NIT es obligatorio para factura de empresa/jurídica",
      }
    }

    if (!isValidNIT(invoiceData.nit)) {
      return {
        isValid: false,
        error:
          "Formato de NIT inválido. Debe ser 9 dígitos + dígito de verificación. Ejemplo: 901234567-8",
      }
    }
  }

  return { isValid: true }
}

/**
 * Sanitizes and normalizes a cedula by removing whitespace
 *
 * @param cedula - The cedula string to sanitize
 * @returns Sanitized cedula or undefined
 */
export function sanitizeCedula(cedula: string | undefined): string | undefined {
  if (!cedula) return undefined
  return cedula.trim()
}

/**
 * Sanitizes and normalizes a NIT by removing whitespace and standardizing format
 *
 * @param nit - The NIT string to sanitize
 * @returns Sanitized NIT with standard dash format or undefined
 */
export function sanitizeNIT(nit: string | undefined): string | undefined {
  if (!nit) return undefined

  const cleaned = nit.trim()

  // If it has a space, replace with dash
  const normalized = cleaned.replace(/\s/g, "-")

  // If it doesn't have a dash and is 10 digits, add dash before last digit
  if (normalized.length === 10 && !normalized.includes("-")) {
    return normalized.slice(0, 9) + "-" + normalized.slice(9)
  }

  return normalized
}
