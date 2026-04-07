import { v } from "convex/values"
import { action } from "../_generated/server"
import {
  searchAddressCandidates,
  validateAddressCoordinates,
} from "../lib/addressValidationHelpers"

/**
 * Validates an address to check if it's within delivery coverage
 */
export const validateAddress = action({
  args: {
    address: v.string(),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await validateAddressCoordinates(ctx, args)
  },
})

/**
 * Searches for address candidates with delivery coverage
 */
export const searchAddress = action({
  args: {
    query: v.string(),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await searchAddressCandidates(ctx, args)
  },
})
