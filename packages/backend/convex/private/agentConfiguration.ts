import { ConvexError, v } from "convex/values"
import { MAX_FIELD_LENGTH } from "../lib/constants"
import { authMutation, authQuery } from "../lib/helpers"
import { sanitizeConfiguredAgentModel } from "../lib/aiModels"
import { upsertAgentConfigurationWithPromptAudit } from "../lib/promptAudit"
import { allowedAgentModelValidator } from "../schema"

export const getAgentConfiguration = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    // Return default configuration if none exists
    if (!config) {
      return {
        brandVoice: "",
        restaurantContext: "",
        customGreeting: "",
        businessRules: "",
        specialInstructions: "",
        supportAgentModel: undefined,
        menuAgentModel: undefined,
        validationMenuAgentModel: undefined,
        menuValidationAgentPrompt: "",
        menuAgentPrompt: "",
        ragConfiguration: undefined,
        requireInitialLocationValidation: false,
        strictAddressValidation: false,
        lastModified: undefined,
      }
    }

    return {
      brandVoice: config.brandVoice || "",
      restaurantContext: config.restaurantContext || "",
      customGreeting: config.customGreeting || "",
      businessRules: config.businessRules || "",
      specialInstructions: config.specialInstructions || "",
      supportAgentModel: sanitizeConfiguredAgentModel(config.supportAgentModel),
      menuAgentModel: sanitizeConfiguredAgentModel(config.menuAgentModel),
      validationMenuAgentModel: sanitizeConfiguredAgentModel(
        config.validationMenuAgentModel
      ),
      menuValidationAgentPrompt: config.menuValidationAgentPrompt || "",
      menuAgentPrompt: config.menuAgentPrompt || "",
      ragConfiguration: config.ragConfiguration,
      requireInitialLocationValidation:
        config.requireInitialLocationValidation || false,
      strictAddressValidation: config.strictAddressValidation || false,
      lastModified: config.lastModified,
    }
  },
})

// Constants for validation
const FORBIDDEN_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /forget\s+everything/i,
  /system\s*:/i,
  /<\s*script/i,
  /javascript:/i,
]

function validateCustomField(value: string, fieldName: string): void {
  if (value.length > MAX_FIELD_LENGTH) {
    throw new ConvexError({
      code: "bad_request",
      message: `${fieldName} excede el límite de ${MAX_FIELD_LENGTH} caracteres`,
    })
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(value)) {
      throw new ConvexError({
        code: "bad_request",
        message: `${fieldName} contiene contenido no permitido`,
      })
    }
  }
}

export const upsertAgentConfiguration = authMutation({
  args: {
    organizationId: v.string(),
    brandVoice: v.optional(v.string()),
    restaurantContext: v.optional(v.string()),
    customGreeting: v.optional(v.string()),
    businessRules: v.optional(v.string()),
    specialInstructions: v.optional(v.string()),
    supportAgentModel: v.optional(allowedAgentModelValidator),
    menuAgentModel: v.optional(allowedAgentModelValidator),
    validationMenuAgentModel: v.optional(allowedAgentModelValidator),
    menuValidationAgentPrompt: v.optional(v.string()),
    menuAgentPrompt: v.optional(v.string()),
    ragConfiguration: v.optional(v.any()), // RAG configuration is complex, using any for now
    requireInitialLocationValidation: v.optional(v.boolean()),
    strictAddressValidation: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { organizationId, ...updates } = args

    if (args.brandVoice) {
      validateCustomField(args.brandVoice, "Personalidad y Estilo")
    }
    if (args.restaurantContext) {
      validateCustomField(args.restaurantContext, "Contexto del Restaurante")
    }
    if (args.customGreeting) {
      validateCustomField(args.customGreeting, "Saludo Personalizado")
    }
    if (args.businessRules) {
      validateCustomField(args.businessRules, "Reglas del Negocio")
    }
    if (args.specialInstructions) {
      validateCustomField(args.specialInstructions, "Instrucciones Especiales")
    }
    if (args.menuValidationAgentPrompt) {
      validateCustomField(
        args.menuValidationAgentPrompt,
        "Prompt de Validación de Menú"
      )
    }
    if (args.menuAgentPrompt) {
      validateCustomField(args.menuAgentPrompt, "Prompt del Agente de Menú")
    }

    return await upsertAgentConfigurationWithPromptAudit(ctx, {
      organizationId,
      updates: {
        ...updates,
        lastModified: Date.now(),
      },
      source: "private_customization",
      action: "upsert",
      changedByUserId: ctx.identity.subject,
      changedByEmail: ctx.identity.email,
    })
  },
})

export const resetAgentConfiguration = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await upsertAgentConfigurationWithPromptAudit(ctx, {
      organizationId: args.organizationId,
      updates: {
        brandVoice: undefined,
        restaurantContext: undefined,
        customGreeting: undefined,
        businessRules: undefined,
        specialInstructions: undefined,
        supportAgentModel: undefined,
        menuAgentModel: undefined,
        validationMenuAgentModel: undefined,
        menuValidationAgentPrompt: undefined,
        menuAgentPrompt: undefined,
        ragConfiguration: undefined,
        requireInitialLocationValidation: undefined,
        strictAddressValidation: undefined,
        lastModified: Date.now(),
      },
      source: "private_customization",
      action: "reset_customization_fields",
      changedByUserId: ctx.identity.subject,
      changedByEmail: ctx.identity.email,
    })
  },
})

export const resetBrandVoice = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await upsertAgentConfigurationWithPromptAudit(ctx, {
      organizationId: args.organizationId,
      updates: {
        brandVoice: undefined,
        lastModified: Date.now(),
      },
      source: "private_customization",
      action: "reset_field",
      changedByUserId: ctx.identity.subject,
      changedByEmail: ctx.identity.email,
    })
  },
})

export const resetRestaurantContext = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await upsertAgentConfigurationWithPromptAudit(ctx, {
      organizationId: args.organizationId,
      updates: {
        restaurantContext: undefined,
        lastModified: Date.now(),
      },
      source: "private_customization",
      action: "reset_field",
      changedByUserId: ctx.identity.subject,
      changedByEmail: ctx.identity.email,
    })
  },
})

export const resetCustomGreeting = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await upsertAgentConfigurationWithPromptAudit(ctx, {
      organizationId: args.organizationId,
      updates: {
        customGreeting: undefined,
        lastModified: Date.now(),
      },
      source: "private_customization",
      action: "reset_field",
      changedByUserId: ctx.identity.subject,
      changedByEmail: ctx.identity.email,
    })
  },
})

export const resetBusinessRules = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await upsertAgentConfigurationWithPromptAudit(ctx, {
      organizationId: args.organizationId,
      updates: {
        businessRules: undefined,
        lastModified: Date.now(),
      },
      source: "private_customization",
      action: "reset_field",
      changedByUserId: ctx.identity.subject,
      changedByEmail: ctx.identity.email,
    })
  },
})

export const resetSpecialInstructions = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await upsertAgentConfigurationWithPromptAudit(ctx, {
      organizationId: args.organizationId,
      updates: {
        specialInstructions: undefined,
        lastModified: Date.now(),
      },
      source: "private_customization",
      action: "reset_field",
      changedByUserId: ctx.identity.subject,
      changedByEmail: ctx.identity.email,
    })
  },
})

export const resetMenuValidationAgentPrompt = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await upsertAgentConfigurationWithPromptAudit(ctx, {
      organizationId: args.organizationId,
      updates: {
        menuValidationAgentPrompt: undefined,
        lastModified: Date.now(),
      },
      source: "private_customization",
      action: "reset_field",
      changedByUserId: ctx.identity.subject,
      changedByEmail: ctx.identity.email,
    })
  },
})

export const resetMenuAgentPrompt = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await upsertAgentConfigurationWithPromptAudit(ctx, {
      organizationId: args.organizationId,
      updates: {
        menuAgentPrompt: undefined,
        lastModified: Date.now(),
      },
      source: "private_customization",
      action: "reset_field",
      changedByUserId: ctx.identity.subject,
      changedByEmail: ctx.identity.email,
    })
  },
})

export type { FollowUpStep } from "../lib/followUpConstants"

import {
  DEFAULT_FOLLOW_UP_SEQUENCE,
  isValidFollowUpSequence,
} from "../lib/followUpConstants"

export const getFollowUpSequence = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    return config?.followUpSequence ?? DEFAULT_FOLLOW_UP_SEQUENCE
  },
})

const followUpStepValidator = v.object({
  delayMinutes: v.number(),
  messageTemplate: v.string(),
})

export const updateFollowUpSequence = authMutation({
  args: {
    organizationId: v.string(),
    followUpSequence: v.array(followUpStepValidator),
  },
  handler: async (ctx, args) => {
    const validation = isValidFollowUpSequence(args.followUpSequence)
    if (!validation.valid) {
      throw new ConvexError({
        code: "bad_request",
        message: validation.error!,
      })
    }

    const existingConfig = await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    const configData = {
      followUpSequence: args.followUpSequence,
      lastModified: Date.now(),
    }

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, configData)
      return existingConfig._id
    } else {
      const newConfigId = await ctx.db.insert("agentConfiguration", {
        organizationId: args.organizationId,
        ...configData,
      })
      return newConfigId
    }
  },
})

export const resetFollowUpSequence = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const existingConfig = await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    const resetData = {
      followUpSequence: undefined,
      lastModified: Date.now(),
    }

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, resetData)
      return existingConfig._id
    } else {
      const newConfigId = await ctx.db.insert("agentConfiguration", {
        organizationId: args.organizationId,
        ...resetData,
      })
      return newConfigId
    }
  },
})
