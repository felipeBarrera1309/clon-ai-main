import { ConvexError, v } from "convex/values"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { aggregateDeliveryAreasByOrganization } from "../deliveryAreasAggregate"
import { normalizeCoordinates } from "../lib/coordinateUtils"
import { seedDeliveryAreaTemplatesIfEmpty } from "../lib/deliveryAreaTemplates"
import { authMutation, authQuery } from "../lib/helpers"
import {
  getSelectedZonesOrThrow,
  validateAuthorizedLocationsOrThrow,
  validateSelectedZoneOrThrow,
} from "../lib/onboardingStep3Validation"
import { aggregateMenuProductsByOrganization } from "../menuProductsAggregate"

const botCalibrationDataValidator = v.object({
  tone: v.string(),
  greetingStyle: v.string(),
  responseLength: v.string(),
  upselling: v.boolean(),
  promotionMentions: v.boolean(),
})

type BotCalibrationData = {
  tone: string
  greetingStyle: string
  responseLength: string
  upselling: boolean
  promotionMentions: boolean
}

const TONE_DESCRIPTIONS: Record<string, string> = {
  formal:
    "Usa un tono formal y profesional. Trata al cliente de 'usted'. Evita emojis y expresiones coloquiales.",
  casual:
    "Usa un tono casual y relajado. Trata al cliente de 'tú'. Puedes usar expresiones coloquiales moderadas.",
  friendly:
    "Usa un tono amigable y cercano. Trata al cliente de 'tú'. Puedes usar emojis ocasionalmente para dar calidez.",
  professional:
    "Usa un tono profesional pero cercano. Equilibra formalidad con amabilidad. Trata al cliente de 'usted' pero de forma cálida.",
}

const GREETING_TEMPLATES: Record<string, string> = {
  short: "¡Hola! ¿En qué te puedo ayudar?",
  medium:
    "¡Hola! Bienvenido a nuestro restaurante. ¿Qué te gustaría ordenar hoy?",
  detailed:
    "¡Hola! Bienvenido a nuestro restaurante. Soy tu asistente virtual y estoy aquí para ayudarte con tu pedido. ¿Te gustaría ver nuestro menú o ya sabes qué ordenar?",
}

const RESPONSE_LENGTH_INSTRUCTIONS: Record<string, string> = {
  brief:
    "Mantén las respuestas concisas y directas. Ve al punto sin rodeos innecesarios.",
  detailed:
    "Proporciona respuestas completas con información adicional útil cuando sea relevante.",
}

function generateBrandVoiceFromCalibration(data: BotCalibrationData): string {
  const toneDesc = TONE_DESCRIPTIONS[data.tone] || TONE_DESCRIPTIONS.friendly
  const lengthDesc =
    RESPONSE_LENGTH_INSTRUCTIONS[data.responseLength] ||
    RESPONSE_LENGTH_INSTRUCTIONS.brief

  return `${toneDesc}\n\n${lengthDesc}`
}

const DEFAULT_GREETING =
  "¡Hola! Bienvenido a nuestro restaurante. ¿Qué te gustaría ordenar hoy?"

function generateGreetingFromCalibration(data: BotCalibrationData): string {
  if (data.greetingStyle in GREETING_TEMPLATES) {
    return GREETING_TEMPLATES[data.greetingStyle] as string
  }
  return DEFAULT_GREETING
}

function generateSpecialInstructionsFromCalibration(
  data: BotCalibrationData
): string {
  const instructions: string[] = []

  if (data.upselling) {
    instructions.push(
      "- Sugiere productos complementarios cuando sea apropiado (bebidas, postres, acompañamientos)"
    )
  } else {
    instructions.push(
      "- No sugieras productos adicionales a menos que el cliente lo solicite"
    )
  }

  if (data.promotionMentions) {
    instructions.push(
      "- Menciona las promociones activas cuando sean relevantes para el pedido del cliente"
    )
  } else {
    instructions.push(
      "- No menciones promociones a menos que el cliente pregunte específicamente"
    )
  }

  return instructions.join("\n")
}

export const getOnboardingProgress = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (!progress) {
      return null
    }

    return progress
  },
})

export const checkAndAutoCompleteForExistingOrg = authMutation({
  args: {
    organizationId: v.string(),
    forceComplete: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existingProgress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (existingProgress?.isCompleted) {
      return { alreadyExists: true, isCompleted: true }
    }

    if (existingProgress && !existingProgress.isCompleted) {
      if (args.forceComplete) {
        const now = Date.now()
        await ctx.db.patch(existingProgress._id, {
          currentStep: 6,
          completedSteps: [1, 2, 3, 4, 5, 6],
          isCompleted: true,
          menuUploadCompleted: true,
          combosCompleted: true,
          locationsCompleted: true,
          deliveryZonesCompleted: true,
          botCalibrationCompleted: true,
          businessRulesCompleted: true,
          completedAt: now,
          lastUpdatedAt: now,
        })
        return { alreadyExists: true, isCompleted: true, skipped: true }
      }
      return { alreadyExists: true, isCompleted: false }
    }

    const menuProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    const locations = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    const hasExistingData = menuProducts !== null || locations !== null

    if (!hasExistingData && !args.forceComplete) {
      return { alreadyExists: false, isCompleted: false, needsOnboarding: true }
    }

    const now = Date.now()
    await ctx.db.insert("onboardingProgress", {
      organizationId: args.organizationId,
      currentStep: 6,
      completedSteps: [1, 2, 3, 4, 5, 6],
      isCompleted: true,
      menuUploadCompleted: true,
      combosCompleted: true,
      locationsCompleted: true,
      deliveryZonesCompleted: true,
      botCalibrationCompleted: true,
      businessRulesCompleted: true,
      startedAt: now,
      completedAt: now,
      lastUpdatedAt: now,
    })

    return {
      alreadyExists: false,
      isCompleted: true,
      autoCompleted: !args.forceComplete,
      skipped: args.forceComplete,
    }
  },
})

export const initializeOnboarding = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (existing) {
      return existing._id
    }

    await seedDeliveryAreaTemplatesIfEmpty(ctx)

    const now = Date.now()
    const progressId = await ctx.db.insert("onboardingProgress", {
      organizationId: args.organizationId,
      currentStep: 1,
      completedSteps: [],
      isCompleted: false,
      menuUploadCompleted: false,
      combosCompleted: false,
      locationsCompleted: false,
      deliveryZonesCompleted: false,
      botCalibrationCompleted: false,
      businessRulesCompleted: false,
      startedAt: now,
      lastUpdatedAt: now,
    })

    return progressId
  },
})

function normalizeEstimatedDeliveryTime(value: string | undefined): string {
  if (!value || value.trim().length === 0) return ""
  const trimmed = value.trim()
  return /min$/i.test(trimmed) ? trimmed : `${trimmed} min`
}

export const updateCurrentStep = authMutation({
  args: {
    organizationId: v.string(),
    step: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.step < 1 || args.step > 6) {
      throw new ConvexError({
        code: "bad_request",
        message: "El paso debe estar entre 1 y 6",
      })
    }

    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (!progress) {
      throw new ConvexError({
        code: "not_found",
        message: "No se encontró el progreso de onboarding",
      })
    }

    await ctx.db.patch(progress._id, {
      currentStep: args.step,
      lastUpdatedAt: Date.now(),
    })

    return progress._id
  },
})

export const completeStep1Menu = authMutation({
  args: {
    organizationId: v.string(),
    productsCount: v.number(),
  },
  handler: async (ctx, args) => {
    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (!progress) {
      throw new ConvexError({
        code: "not_found",
        message: "No se encontró el progreso de onboarding",
      })
    }

    const completedSteps = progress.completedSteps.includes(1)
      ? progress.completedSteps
      : [...progress.completedSteps, 1]

    await ctx.db.patch(progress._id, {
      menuUploadCompleted: true,
      menuProductsCount: args.productsCount,
      completedSteps,
      currentStep: 2,
      lastUpdatedAt: Date.now(),
    })

    return progress._id
  },
})

export const completeStep2Combos = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (!progress) {
      throw new ConvexError({
        code: "not_found",
        message: "No se encontró el progreso de onboarding",
      })
    }

    const combos = await ctx.db
      .query("combos")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect()

    const completedSteps = progress.completedSteps.includes(2)
      ? progress.completedSteps
      : [...progress.completedSteps, 2]

    await ctx.db.patch(progress._id, {
      combosCompleted: true,
      combosCount: combos.length,
      completedSteps,
      currentStep: 3,
      lastUpdatedAt: Date.now(),
    })

    return progress._id
  },
})

export const completeStep3Locations = authMutation({
  args: {
    organizationId: v.string(),
    locationsCount: v.number(),
  },
  handler: async (ctx, args) => {
    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (!progress) {
      throw new ConvexError({
        code: "not_found",
        message: "No se encontró el progreso de onboarding",
      })
    }

    const completedSteps = progress.completedSteps.includes(3)
      ? progress.completedSteps
      : [...progress.completedSteps, 3]

    await ctx.db.patch(progress._id, {
      locationsCompleted: true,
      locationsCount: args.locationsCount,
      completedSteps,
      currentStep: 4,
      lastUpdatedAt: Date.now(),
    })

    return progress._id
  },
})

export const completeStep4DeliveryZones = authMutation({
  args: {
    organizationId: v.string(),
    zonesCount: v.number(),
  },
  handler: async (ctx, args) => {
    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (!progress) {
      throw new ConvexError({
        code: "not_found",
        message: "No se encontró el progreso de onboarding",
      })
    }

    const completedSteps = progress.completedSteps.includes(4)
      ? progress.completedSteps
      : [...progress.completedSteps, 4]

    await ctx.db.patch(progress._id, {
      deliveryZonesCompleted: true,
      deliveryZonesCount: args.zonesCount,
      completedSteps,
      currentStep: 5,
      lastUpdatedAt: Date.now(),
    })

    return progress._id
  },
})

export const saveStep3DeliveryZonesFromTemplates = authMutation({
  args: {
    organizationId: v.string(),
    cityKey: v.union(v.literal("bucaramanga"), v.literal("bogota")),
    defaults: v.object({
      restaurantLocationId: v.optional(v.id("restaurantLocations")),
    }),
    zones: v.array(
      v.object({
        zoneKey: v.string(),
        name: v.string(),
        coordinates: v.array(
          v.object({
            lat: v.number(),
            lng: v.number(),
          })
        ),
        selected: v.boolean(),
        deliveryFee: v.optional(v.number()),
        minimumOrder: v.optional(v.number()),
        estimatedDeliveryTime: v.optional(v.string()),
        restaurantLocationId: v.optional(v.id("restaurantLocations")),
        isActive: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (!progress) {
      throw new ConvexError({
        code: "not_found",
        message: "No se encontró el progreso de onboarding",
      })
    }

    const selectedZones = getSelectedZonesOrThrow(args.zones)

    for (const zone of selectedZones) {
      validateSelectedZoneOrThrow(zone, args.defaults)
    }

    const validLocationIds = await validateAuthorizedLocationsOrThrow({
      selectedZones,
      defaults: args.defaults,
      isLocationAuthorized: async (locationId) => {
        const location = await ctx.db.get(locationId)
        return !!location && location.organizationId === args.organizationId
      },
    })

    let zonesCreated = 0
    for (const zone of selectedZones) {
      const locationId =
        zone.restaurantLocationId ?? args.defaults.restaurantLocationId
      if (!locationId || !validLocationIds.has(locationId)) {
        continue
      }

      const normalizedPolygon = normalizeCoordinates(zone.coordinates)
      const estimatedDeliveryTime = normalizeEstimatedDeliveryTime(
        zone.estimatedDeliveryTime
      )

      const areaId = await ctx.db.insert("deliveryAreas", {
        organizationId: args.organizationId,
        name: zone.name.trim(),
        restaurantLocationId: locationId as Id<"restaurantLocations">,
        coordinates: normalizedPolygon,
        isActive: zone.isActive ?? true,
        deliveryFee: zone.deliveryFee,
        minimumOrder: zone.minimumOrder,
        estimatedDeliveryTime:
          estimatedDeliveryTime.length > 0 ? estimatedDeliveryTime : undefined,
      })
      const createdArea = await ctx.db.get(areaId)
      if (createdArea) {
        await aggregateDeliveryAreasByOrganization.insertIfDoesNotExist(
          ctx,
          createdArea
        )
      }
      zonesCreated++
    }

    const completedSteps = progress.completedSteps.includes(4)
      ? progress.completedSteps
      : [...progress.completedSteps, 4]

    await ctx.db.patch(progress._id, {
      deliveryZonesCompleted: true,
      deliveryZonesCount: zonesCreated,
      completedSteps,
      currentStep: 5,
      lastUpdatedAt: Date.now(),
    })

    return {
      cityKey: args.cityKey,
      zonesCreated,
    }
  },
})

export const completeStep5BotCalibration = authMutation({
  args: {
    organizationId: v.string(),
    calibrationData: botCalibrationDataValidator,
  },
  handler: async (ctx, args) => {
    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (!progress) {
      throw new ConvexError({
        code: "not_found",
        message: "No se encontró el progreso de onboarding",
      })
    }

    const completedSteps = progress.completedSteps.includes(5)
      ? progress.completedSteps
      : [...progress.completedSteps, 5]

    await ctx.db.patch(progress._id, {
      botCalibrationCompleted: true,
      botCalibrationData: args.calibrationData,
      completedSteps,
      currentStep: 6,
      lastUpdatedAt: Date.now(),
    })

    const brandVoice = generateBrandVoiceFromCalibration(args.calibrationData)
    const customGreeting = generateGreetingFromCalibration(args.calibrationData)
    const specialInstructions = generateSpecialInstructionsFromCalibration(
      args.calibrationData
    )

    const existingConfig = await ctx.db
      .query("agentConfiguration")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    const configData = {
      brandVoice,
      customGreeting,
      specialInstructions,
      lastModified: Date.now(),
    }

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, configData)
    } else {
      await ctx.db.insert("agentConfiguration", {
        organizationId: args.organizationId,
        ...configData,
      })
    }

    return progress._id
  },
})

export const completeStep6BusinessRules = authMutation({
  args: {
    organizationId: v.string(),
    rulesText: v.optional(v.string()),
    audioStorageId: v.optional(v.string()),
    transcription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (!progress) {
      throw new ConvexError({
        code: "not_found",
        message: "No se encontró el progreso de onboarding",
      })
    }

    const completedSteps = progress.completedSteps.includes(6)
      ? progress.completedSteps
      : [...progress.completedSteps, 6]

    await ctx.db.patch(progress._id, {
      businessRulesCompleted: true,
      businessRulesText: args.rulesText,
      businessRulesAudioStorageId: args.audioStorageId,
      businessRulesTranscription: args.transcription,
      completedSteps,
      currentStep: 7,
      lastUpdatedAt: Date.now(),
    })

    const businessRulesContent = args.rulesText || args.transcription
    if (businessRulesContent) {
      const existingConfig = await ctx.db
        .query("agentConfiguration")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .first()

      const configData = {
        businessRules: businessRulesContent,
        lastModified: Date.now(),
      }

      if (existingConfig) {
        await ctx.db.patch(existingConfig._id, configData)
      } else {
        await ctx.db.insert("agentConfiguration", {
          organizationId: args.organizationId,
          ...configData,
        })
      }
    }

    return progress._id
  },
})

// Deprecated names kept for backward compatibility after onboarding step renumbering.
export const completeStep2Locations = completeStep3Locations
export const completeStep3DeliveryZones = completeStep4DeliveryZones
export const completeStep4BotCalibration = completeStep5BotCalibration
export const completeStep5BusinessRules = completeStep6BusinessRules

export const completeOnboarding = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (!progress) {
      throw new ConvexError({
        code: "not_found",
        message: "No se encontró el progreso de onboarding",
      })
    }

    const now = Date.now()
    await ctx.db.patch(progress._id, {
      isCompleted: true,
      completedAt: now,
      lastUpdatedAt: now,
    })

    const identity = await ctx.auth.getUserIdentity()
    const userEmail = identity?.email

    if (userEmail) {
      const menuProducts = await ctx.db
        .query("menuProducts")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      const locations = await ctx.db
        .query("restaurantLocations")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      const deliveryAreas = await ctx.db
        .query("deliveryAreas")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()

      const restaurantName = locations[0]?.name

      await ctx.scheduler.runAfter(0, internal.sendEmails.sendWelcomeEmail, {
        to: userEmail,
        restaurantName,
        dashboardUrl: "https://app.clonai.co/dashboard",
        productsCount: menuProducts.length,
        locationsCount: locations.length,
        deliveryAreasCount: deliveryAreas.length,
      })
    }

    return progress._id
  },
})

export const skipStep = authMutation({
  args: {
    organizationId: v.string(),
    step: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.step < 1 || args.step > 6) {
      throw new ConvexError({
        code: "bad_request",
        message: "El paso debe estar entre 1 y 6",
      })
    }

    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (!progress) {
      throw new ConvexError({
        code: "not_found",
        message: "No se encontró el progreso de onboarding",
      })
    }

    const nextStep = args.step + 1

    await ctx.db.patch(progress._id, {
      currentStep: nextStep,
      lastUpdatedAt: Date.now(),
    })

    return progress._id
  },
})

const normalizeProductName = (name: string): string => {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

export const importMenuData = authMutation({
  args: {
    organizationId: v.string(),
    categories: v.array(
      v.object({
        tempId: v.string(),
        name: v.string(),
      })
    ),
    subcategories: v.array(
      v.object({
        tempId: v.string(),
        name: v.string(),
        categoryTempId: v.string(),
      })
    ),
    sizes: v.array(
      v.object({
        tempId: v.string(),
        name: v.string(),
      })
    ),
    products: v.array(
      v.object({
        tempId: v.string(),
        name: v.string(),
        description: v.string(),
        price: v.number(),
        categoryTempId: v.string(),
        subcategoryTempId: v.optional(v.string()),
        sizeTempId: v.optional(v.string()),
        standAlone: v.boolean(),
        combinableHalf: v.boolean(),
        combinableWithCategoryTempIds: v.optional(v.array(v.string())),
        instructions: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const categoryIdMap = new Map<string, Id<"menuProductCategories">>()
    for (const cat of args.categories) {
      const id = await ctx.db.insert("menuProductCategories", {
        name: cat.name,
        organizationId: args.organizationId,
      })
      categoryIdMap.set(cat.tempId, id)
    }

    const subcategoryIdMap = new Map<string, Id<"menuProductSubcategories">>()
    for (const sub of args.subcategories) {
      const categoryId = categoryIdMap.get(sub.categoryTempId)
      if (!categoryId) continue

      const id = await ctx.db.insert("menuProductSubcategories", {
        name: sub.name,
        organizationId: args.organizationId,
        menuProductCategoryId: categoryId,
      })
      subcategoryIdMap.set(sub.tempId, id)
    }

    const sizeIdMap = new Map<string, Id<"sizes">>()
    for (const size of args.sizes) {
      const id = await ctx.db.insert("sizes", {
        name: size.name,
        organizationId: args.organizationId,
      })
      sizeIdMap.set(size.tempId, id)
    }

    let productsCreated = 0
    for (const prod of args.products) {
      const categoryId = categoryIdMap.get(prod.categoryTempId)
      if (!categoryId) continue

      const subcategoryId = prod.subcategoryTempId
        ? subcategoryIdMap.get(prod.subcategoryTempId)
        : undefined
      const sizeId = prod.sizeTempId
        ? sizeIdMap.get(prod.sizeTempId)
        : undefined

      const combinableWith = prod.combinableWithCategoryTempIds
        ?.map((tempId) => {
          const realCategoryId = categoryIdMap.get(tempId)
          if (!realCategoryId) return null
          return {
            menuProductCategoryId: realCategoryId,
          }
        })
        .filter(
          (
            item
          ): item is { menuProductCategoryId: Id<"menuProductCategories"> } =>
            item !== null
        )

      const productId = await ctx.db.insert("menuProducts", {
        name: prod.name,
        nameNormalized: normalizeProductName(prod.name),
        description: prod.description,
        price: prod.price,
        menuProductCategoryId: categoryId,
        menuProductSubcategoryId: subcategoryId,
        sizeId: sizeId,
        standAlone: prod.standAlone,
        combinableHalf: prod.combinableHalf,
        combinableWith:
          combinableWith && combinableWith.length > 0
            ? combinableWith
            : undefined,
        instructions: prod.instructions,
        organizationId: args.organizationId,
      })
      const createdProduct = await ctx.db.get(productId)
      if (createdProduct) {
        await aggregateMenuProductsByOrganization.insertIfDoesNotExist(
          ctx,
          createdProduct
        )
      }
      productsCreated++
    }

    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (progress) {
      const completedSteps = progress.completedSteps.includes(1)
        ? progress.completedSteps
        : [...progress.completedSteps, 1]

      await ctx.db.patch(progress._id, {
        menuUploadCompleted: true,
        menuProductsCount: productsCreated,
        completedSteps,
        currentStep: 2,
        lastUpdatedAt: Date.now(),
      })
    }

    return {
      categoriesCreated: categoryIdMap.size,
      subcategoriesCreated: subcategoryIdMap.size,
      sizesCreated: sizeIdMap.size,
      productsCreated,
    }
  },
})

export const getOnboardingSummary = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first()

    if (!progress) {
      return null
    }

    const menuProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const combos = await ctx.db
      .query("combos")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect()

    const locations = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const deliveryAreas = await ctx.db
      .query("deliveryAreas")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    return {
      progress,
      summary: {
        productsCount: menuProducts.length,
        combosCount: combos.length,
        locationsCount: locations.length,
        deliveryAreasCount: deliveryAreas.length,
        botCalibrationConfigured: progress.botCalibrationCompleted,
        businessRulesConfigured: progress.businessRulesCompleted,
      },
    }
  },
})
