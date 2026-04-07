/**
 * Environment variables helper for Convex backend
 *
 * Uses lazy evaluation to avoid validation errors during Convex push analysis.
 * Variables are only validated when accessed at runtime.
 */

/**
 * Get a required environment variable
 * @throws Error if the variable is not set or is empty
 */
function getRequired(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

/**
 * Get an optional environment variable
 * @returns The value or undefined if not set
 */
function getOptional(name: string): string | undefined {
  const value = process.env[name]
  if (!value || value.trim() === "") {
    return undefined
  }
  return value
}

/**
 * Environment variables object with lazy getters
 * Variables are only validated when accessed, not at module load time
 */
export const env = {
  // WhatsApp Business API configuration
  get WHATSAPP_VERIFY_TOKEN(): string {
    return getRequired("WHATSAPP_VERIFY_TOKEN")
  },
  get WHATSAPP_API_VERSION(): string {
    return getOptional("WHATSAPP_API_VERSION") ?? "v22.0"
  },

  // R2 (Cloudflare) storage configuration
  get R2_PUBLIC_URL(): string {
    return getRequired("R2_PUBLIC_URL")
  },

  // Email service configuration
  get RESEND_API_KEY(): string {
    return getRequired("RESEND_API_KEY")
  },

  // Google Maps API for geocoding
  get GOOGLE_MAPS_API_KEY(): string {
    return getRequired("GOOGLE_MAPS_API_KEY")
  },

  // Better Auth configuration
  get SITE_URL(): string {
    return getRequired("SITE_URL")
  },
  get BETTER_AUTH_SECRET(): string {
    return getRequired("BETTER_AUTH_SECRET")
  },

  // OpenAI API for fallback (optional)
  get OPENAI_API_KEY(): string | undefined {
    return getOptional("OPENAI_API_KEY")
  },
}
