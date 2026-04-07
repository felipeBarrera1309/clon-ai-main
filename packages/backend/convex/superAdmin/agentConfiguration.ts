import { ConvexError, v } from "convex/values"
import { MAX_FIELD_LENGTH } from "../lib/constants"
import { sanitizeConfiguredAgentModel } from "../lib/aiModels"
import { upsertAgentConfigurationWithPromptAudit } from "../lib/promptAudit"
import {
  assertOrganizationAccess,
  platformAdminOrImplementorMutation,
  platformAdminOrImplementorQuery,
} from "../lib/superAdmin"
import { allowedAgentModelValidator } from "../schema"

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

export const getAgentConfiguration = platformAdminOrImplementorQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { organizationId } = args
    await assertOrganizationAccess(ctx, organizationId)

    const config = await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .first()

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
      lastModified: config.lastModified,
    }
  },
})

export const upsertAgentConfiguration = platformAdminOrImplementorMutation({
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
  },
  handler: async (ctx, args) => {
    const { organizationId, ...configData } = args
    await assertOrganizationAccess(ctx, organizationId)

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

    return await upsertAgentConfigurationWithPromptAudit(ctx, {
      organizationId,
      updates: {
        ...configData,
        lastModified: Date.now(),
      },
      source: "superadmin_customization",
      action: "upsert",
      changedByUserId: ctx.identity.subject,
      changedByEmail: ctx.identity.email,
    })
  },
})

export const resetAgentConfiguration = platformAdminOrImplementorMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { organizationId } = args
    await assertOrganizationAccess(ctx, organizationId)

    return await upsertAgentConfigurationWithPromptAudit(ctx, {
      organizationId,
      updates: {
        brandVoice: undefined,
        restaurantContext: undefined,
        customGreeting: undefined,
        businessRules: undefined,
        specialInstructions: undefined,
        supportAgentModel: undefined,
        menuAgentModel: undefined,
        validationMenuAgentModel: undefined,
        lastModified: Date.now(),
      },
      source: "superadmin_customization",
      action: "reset_customization_fields",
      changedByUserId: ctx.identity.subject,
      changedByEmail: ctx.identity.email,
    })
  },
})
