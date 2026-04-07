import { v } from "convex/values"
import { api, internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { ActionCtx } from "../_generated/server"
import { internalMutation, internalQuery } from "../_generated/server"
import { BadRequestError } from "../lib/errors"
import { authAction, authMutation, authQuery } from "../lib/helpers"
import {
  createDialog360Template,
  createMetaTemplate,
  deleteDialog360Template,
  getDialog360TemplatesWithContent,
  getMetaTemplatesWithContent,
} from "../model/whatsapp"
import {
  messageTemplateCategoryValidator,
  messageTemplateHeaderTypeValidator,
  messageTemplateStatusValidator,
} from "../schema"

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets the active WhatsApp configuration for the current organization.
 * If configId is provided, uses that specific config. Otherwise finds the first active one with wabaId.
 * Throws descriptive errors if configuration is missing or incomplete.
 * Supports both Meta and 360dialog providers.
 */
async function getActiveWhatsAppConfig(
  ctx: ActionCtx,
  organizationId: string,
  configId?: string
) {
  const configs = await ctx.runQuery(
    api.private.whatsappConfigurations.getConfigurations,
    { organizationId }
  )

  // If configId provided, use that specific config
  const config = configId
    ? configs.find((c: { _id: string }) => c._id === configId)
    : // Otherwise, prefer an active config that has wabaId set
      configs.find(
        (c: { isActive: boolean; wabaId?: string }) => c.isActive && c.wabaId
      ) || configs.find((c: { isActive: boolean }) => c.isActive)

  if (!config) {
    throw new Error("No hay configuración de WhatsApp activa")
  }

  const provider = config.provider || "meta"

  // Validate based on provider
  if (provider === "360dialog") {
    if (!config.dialog360ApiKey) {
      throw new Error("No se ha configurado el API Key de 360dialog")
    }
    if (!config.wabaId) {
      console.warn(
        "No se ha configurado el WhatsApp Business Account ID (WABA ID) para 360dialog. Usando ID temporal."
      )
    }
    return {
      ...config,
      wabaId: config.wabaId || "360dialog_account",
      dialog360ApiKey: config.dialog360ApiKey,
      provider: "360dialog",
    }
  } else {
    // Meta provider
    if (!config.accessToken) {
      throw new Error("No se ha configurado el token de acceso de WhatsApp")
    }
    if (!config.wabaId) {
      throw new Error(
        "No se ha configurado el WhatsApp Business Account ID (WABA ID). " +
          "Para encontrarlo: Meta Business Suite → Configuración → WhatsApp → " +
          "Configuración de la cuenta. El WABA ID es un número de ~15 dígitos. " +
          "Configúralo en la sección de configuración de WhatsApp de esta aplicación."
      )
    }
    return config as typeof config & {
      wabaId: string
      accessToken: string
      provider?: "meta"
    }
  }
}

/**
 * Gets WhatsApp configuration (specific or active) and validates WABA ID.
 * This helper consolidates configuration retrieval logic used across multiple actions.
 */
async function getWhatsAppConfigWithValidation(
  ctx: ActionCtx,
  organizationId: string,
  whatsappConfigId?: Id<"whatsappConfigurations">,
  providedWabaId?: string
): Promise<{
  config: any
  wabaId: string
  provider: string
}> {
  let config: any

  if (whatsappConfigId) {
    const specificConfig = await ctx.runQuery(
      internal.private.whatsappConfigurations.get,
      { configurationId: whatsappConfigId }
    )
    if (!specificConfig) {
      throw new BadRequestError("Configuración de WhatsApp no encontrada")
    }
    config = specificConfig
  } else {
    config = await getActiveWhatsAppConfig(ctx, organizationId)
  }

  const wabaId = providedWabaId || config.wabaId
  if (!wabaId) {
    throw new BadRequestError(
      "WABA ID es requerido. Configúralo en la configuración de WhatsApp."
    )
  }

  const provider = config.provider || "meta"

  return { config, wabaId, provider }
}

/**
 * Maps Meta API status to our internal status format.
 */
function mapMetaStatus(
  metaStatus: string
): "pending" | "approved" | "rejected" {
  const status = metaStatus.toUpperCase()
  if (status === "APPROVED") return "approved"
  if (status === "REJECTED") return "rejected"
  return "pending"
}

/**
 * Maps Meta category to our internal category format.
 */
function mapMetaCategory(
  category: string
): "MARKETING" | "UTILITY" | "AUTHENTICATION" | undefined {
  if (
    category === "MARKETING" ||
    category === "UTILITY" ||
    category === "AUTHENTICATION"
  ) {
    return category
  }
  return undefined
}

// =============================================================================
// Queries
// =============================================================================

// Get all templates with Meta status filter
export const listWithStatus = authQuery({
  args: {
    organizationId: v.string(),
    wabaId: v.optional(v.string()),
    status: v.optional(messageTemplateStatusValidator),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let templates = await ctx.db
      .query("messageTemplates")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Filter by wabaId if provided
    if (args.wabaId) {
      templates = templates.filter((t) => t.wabaId === args.wabaId)
    }

    // Filter by status if provided
    if (args.status) {
      templates = templates.filter((t) => t.status === args.status)
    }

    // Filter by active status if needed
    if (!args.includeInactive) {
      templates = templates.filter((t) => t.isActive)
    }

    // Sort by name
    return templates.sort((a, b) => a.name.localeCompare(b.name))
  },
})

// Get approved templates only (for bulk messaging)
export const listApproved = authQuery({
  args: {
    organizationId: v.string(),
    wabaId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const templates = await ctx.db
      .query("messageTemplates")
      .withIndex("by_organization_and_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "approved")
      )
      .collect()

    let filtered = templates.filter((t) => t.isActive)

    // Filter by wabaId if provided
    if (args.wabaId) {
      filtered = filtered.filter((t) => t.wabaId === args.wabaId)
    }

    return filtered
  },
})

// =============================================================================
// Actions - Meta API Integration
// =============================================================================

// Create template in Meta or 360dialog API and save to DB
export const createInMeta = authAction({
  args: {
    organizationId: v.string(),
    name: v.string(),
    description: v.string(),
    content: v.string(),
    category: messageTemplateCategoryValidator,
    language: v.optional(v.string()),
    configId: v.optional(v.id("whatsappConfigurations")),
    variables: v.optional(
      v.array(
        v.object({
          name: v.string(),
          example: v.string(),
        })
      )
    ),
    links: v.optional(
      v.array(
        v.object({
          type: v.union(v.literal("url"), v.literal("phone")),
          nombre: v.string(),
          url: v.optional(v.string()),
          phoneNumber: v.optional(v.string()),
        })
      )
    ),
    // Header configuration
    header: v.optional(
      v.object({
        type: messageTemplateHeaderTypeValidator,
        text: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
      })
    ),
  },
  returns: v.id("messageTemplates"),
  handler: async (ctx, args): Promise<Id<"messageTemplates">> => {
    const config = await getActiveWhatsAppConfig(
      ctx,
      args.organizationId,
      args.configId
    )

    // Validate template name format
    const normalizedName = args.name.toLowerCase().replace(/[^a-z0-9_]/g, "_")
    if (normalizedName.length > 512) {
      throw new Error(
        "El nombre de la plantilla no puede exceder 512 caracteres"
      )
    }

    // Validate content length
    if (args.content.length > 1024) {
      throw new Error(
        "El contenido de la plantilla no puede exceder 1024 caracteres"
      )
    }

    // Validate variables count
    if (args.variables && args.variables.length > 10) {
      throw new Error("No se pueden usar más de 10 variables en una plantilla")
    }

    // Validate buttons count
    if (args.links && args.links.length > 3) {
      throw new Error("No se pueden usar más de 3 botones en una plantilla")
    }

    // Validate header image URL if provided
    if (args.header?.type === "image" && !args.header.imageUrl) {
      throw new Error(
        "Se requiere una URL de imagen para plantillas con header de imagen"
      )
    }

    const language = args.language || "es"
    const variableExamples = args.variables?.map((v) => v.example)

    // Create template based on provider
    const provider = config.provider || "meta"
    let apiResult: { id: string; status: string; name: string }

    if (provider === "360dialog") {
      // 360dialog supports media headers, validation is handled by the API

      // Create template in 360dialog API
      apiResult = await createDialog360Template(
        ctx,
        config.wabaId,
        (config as { dialog360ApiKey: string }).dialog360ApiKey,
        args.name,
        language,
        args.category,
        args.content,
        variableExamples,
        args.links,
        args.header as any
      )
    } else {
      // Create template in Meta API
      // Get metaAppId for media uploads (required for image/video/document headers)
      const metaAppId = (config as { metaAppId?: string }).metaAppId

      apiResult = await createMetaTemplate(
        ctx,
        config.wabaId,
        (config as { accessToken: string }).accessToken,
        args.name,
        language,
        args.category,
        args.content,
        variableExamples,
        args.links,
        args.header,
        metaAppId
      )
    }

    const status = mapMetaStatus(apiResult.status)

    // Extract variable names
    const variableNames = args.variables?.map((v) => v.name) || []

    // Create template in DB
    const templateId: Id<"messageTemplates"> = await ctx.runMutation(
      internal.private.metaTemplates.createTemplateInternal,
      {
        organizationId: args.organizationId,
        wabaId: config.wabaId,
        code: normalizedName,
        name: apiResult.name,
        description: args.description,
        content: args.content,
        status,
        whatsappTemplateId: apiResult.id,
        category: args.category,
        language,
        variables: variableNames,
        links: args.links,
        headerType: args.header?.type || "none",
        headerText: args.header?.text,
        headerImageUrl: args.header?.imageUrl,
      }
    )

    return templateId
  },
})

// Sync template statuses from Meta or 360dialog API
export const syncStatuses = authAction({
  args: {
    organizationId: v.string(),
    wabaId: v.optional(v.string()),
    whatsappConfigId: v.optional(v.id("whatsappConfigurations")),
  },
  returns: v.object({
    synced: v.number(),
    total: v.number(),
  }),
  handler: async (ctx, args): Promise<{ synced: number; total: number }> => {
    // Get and validate WhatsApp configuration
    const { config, wabaId, provider } = await getWhatsAppConfigWithValidation(
      ctx,
      args.organizationId,
      args.whatsappConfigId,
      args.wabaId
    )

    // Fetch templates from API based on provider
    let apiTemplates: Array<{
      id: string
      name: string
      status: "APPROVED" | "PENDING" | "REJECTED" | "PENDING_DELETION"
      language: string
      category: string
      bodyText: string
      variables: string[]
    }>

    if (provider === "360dialog") {
      apiTemplates = await getDialog360TemplatesWithContent(
        ctx,
        (config as { dialog360ApiKey: string }).dialog360ApiKey,
        wabaId
      )
    } else {
      apiTemplates = await getMetaTemplatesWithContent(
        ctx,
        (config as { accessToken: string }).accessToken,
        wabaId
      )
    }

    const ourTemplates = await ctx.runQuery(
      api.private.metaTemplates.listWithStatus,
      {
        organizationId: args.organizationId,
        wabaId,
      }
    )

    const apiTemplatesMap = new Map(apiTemplates.map((t) => [t.name, t]))
    let synced = 0

    for (const ourTemplate of ourTemplates) {
      const apiTemplate = apiTemplatesMap.get(ourTemplate.name)

      if (apiTemplate) {
        const status = mapMetaStatus(apiTemplate.status)

        if (
          ourTemplate.status !== status ||
          ourTemplate.whatsappTemplateId !== apiTemplate.id
        ) {
          await ctx.runMutation(api.private.metaTemplates.updateStatus, {
            organizationId: args.organizationId,
            templateId: ourTemplate._id,
            status,
            whatsappTemplateId: apiTemplate.id,
          })
          synced++
        }
      }
    }

    console.log(
      `[syncStatuses] Updated ${synced}/${ourTemplates.length} templates`
    )

    return {
      synced,
      total: ourTemplates.length,
    }
  },
})

// Import all templates from Meta or 360dialog API
export const importFromMeta = authAction({
  args: {
    organizationId: v.string(),
    wabaId: v.optional(v.string()),
    whatsappConfigId: v.optional(v.id("whatsappConfigurations")),
  },
  returns: v.object({
    imported: v.number(),
    updated: v.number(),
    total: v.number(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ imported: number; updated: number; total: number }> => {
    // Get and validate WhatsApp configuration
    const { config, wabaId, provider } = await getWhatsAppConfigWithValidation(
      ctx,
      args.organizationId,
      args.whatsappConfigId,
      args.wabaId
    )

    // Fetch templates from API based on provider
    let apiTemplates: Array<{
      id: string
      name: string
      status: "APPROVED" | "PENDING" | "REJECTED" | "PENDING_DELETION"
      language: string
      category: string
      bodyText: string
      variables: string[]
      headerType?: "none" | "text" | "image" | "video" | "document"
      headerText?: string
      headerImageUrl?: string
      buttons?: Array<{
        type: "url" | "phone" | "quick_reply" | "flow"
        text: string
        url?: string

        phoneNumber?: string
        flowId?: string
        flowAction?: string
        navigateScreen?: string
      }>
    }>

    if (provider === "360dialog") {
      // 360dialog doesn't return buttons in the same format, so we cast and add empty buttons
      const dialog360Templates = await getDialog360TemplatesWithContent(
        ctx,
        (config as { dialog360ApiKey: string }).dialog360ApiKey,
        wabaId
      )
      apiTemplates = dialog360Templates.map((t) => ({ ...t, buttons: [] }))
    } else {
      apiTemplates = await getMetaTemplatesWithContent(
        ctx,
        (config as { accessToken: string }).accessToken,
        wabaId
      )
    }

    // Get all our templates for this WABA
    const ourTemplates = await ctx.runQuery(
      api.private.metaTemplates.listWithStatus,
      { organizationId: args.organizationId, wabaId, includeInactive: true }
    )

    // Create a map of our templates by name
    const ourTemplatesByName = new Map<string, Doc<"messageTemplates">>()
    for (const template of ourTemplates) {
      ourTemplatesByName.set(template.name, template)
    }

    let imported = 0
    let updated = 0

    // Process each API template
    for (const apiTemplate of apiTemplates) {
      const status = mapMetaStatus(apiTemplate.status)
      const existingTemplate = ourTemplatesByName.get(apiTemplate.name)

      if (existingTemplate) {
        // Update existing template
        const needsUpdate =
          existingTemplate.status !== status ||
          existingTemplate.whatsappTemplateId !== apiTemplate.id

        // Also check if header info needs updating (fixes templates imported before header extraction was added)
        const headerType = apiTemplate.headerType || "none"
        const needsHeaderUpdate =
          (existingTemplate.headerType || "none") !== headerType ||
          existingTemplate.headerImageUrl !== apiTemplate.headerImageUrl

        if (needsUpdate) {
          await ctx.runMutation(api.private.metaTemplates.updateStatus, {
            organizationId: args.organizationId,
            templateId: existingTemplate._id,
            status,
            whatsappTemplateId: apiTemplate.id,
          })
          updated++
        }

        // Update header info separately if needed
        if (needsHeaderUpdate) {
          await ctx.runMutation(
            internal.private.metaTemplates.updateTemplateHeaderInfo,
            {
              templateId: existingTemplate._id,
              headerType,
              headerText: apiTemplate.headerText,
              headerImageUrl: apiTemplate.headerImageUrl,
            }
          )
          if (!needsUpdate) updated++ // Count if not already counted
        }
      } else {
        // Import new template with actual content from API
        // Convert buttons to links format
        const links = apiTemplate.buttons?.map((button) => ({
          type: button.type as "url" | "phone" | "quick_reply" | "flow",
          nombre: button.text,
          url: button.url,
          phoneNumber: button.phoneNumber,
          flowId: button.flowId,
          flowAction: button.flowAction,
          navigateScreen: button.navigateScreen,
        }))

        await ctx.runMutation(
          internal.private.metaTemplates.createTemplateInternal,
          {
            organizationId: args.organizationId,
            wabaId,
            code: apiTemplate.name,
            name: apiTemplate.name,
            description: `Plantilla importada desde ${provider === "360dialog" ? "360dialog" : "Meta"} API - ${apiTemplate.category}`,
            content:
              apiTemplate.bodyText || `[Plantilla "${apiTemplate.name}"]`,
            status,
            whatsappTemplateId: apiTemplate.id,
            category: mapMetaCategory(apiTemplate.category),
            language: apiTemplate.language || "es",
            variables: apiTemplate.variables || [],
            links: links && links.length > 0 ? links : undefined,
            headerType: apiTemplate.headerType || "none",
            headerText: apiTemplate.headerText,
            headerImageUrl: apiTemplate.headerImageUrl,
          }
        )
        imported++
      }
    }

    // Delete templates that are in DB but not in API response
    // Only if total > 0 to assume a successful sync, otherwise might be an API error returning 0 templates
    if (apiTemplates.length > 0) {
      const apiTemplateNames = new Set(apiTemplates.map((t) => t.name))

      // Check for templates missing in API response
      // NOTE: We DO NOT delete these automatically because:
      // 1. API might be temporarily unavailable or returning partial results
      // 2. Pagination might not be complete
      // 3. Provider might have temporary issues
      // Instead, we just log them for manual review
      const missingTemplates = ourTemplates.filter(
        (t) => !apiTemplateNames.has(t.name)
      )

      if (missingTemplates.length > 0) {
        console.warn(
          `[importFromMeta] ${missingTemplates.length} templates not in API (not deleted): ${missingTemplates.map((t) => t.name).join(", ")}`
        )
      }
    }

    return {
      imported,
      updated,
      total: apiTemplates.length,
    }
  },
})

// =============================================================================
// Mutations
// =============================================================================

// Internal mutation to create template in DB
export const createTemplateInternal = internalMutation({
  args: {
    organizationId: v.string(),
    wabaId: v.string(),
    code: v.string(),
    name: v.string(),
    description: v.string(),
    content: v.string(),
    status: messageTemplateStatusValidator,
    whatsappTemplateId: v.optional(v.string()),
    category: v.optional(messageTemplateCategoryValidator),
    language: v.optional(v.string()),
    variables: v.optional(v.array(v.string())),
    links: v.optional(
      v.array(
        v.object({
          type: v.union(
            v.literal("url"),
            v.literal("phone"),
            v.literal("quick_reply"),
            v.literal("flow")
          ),
          nombre: v.string(),
          url: v.optional(v.string()),
          phoneNumber: v.optional(v.string()),
          flowId: v.optional(v.string()),
          flowAction: v.optional(v.string()),
          navigateScreen: v.optional(v.string()),
        })
      )
    ),
    // Header configuration
    headerType: v.optional(messageTemplateHeaderTypeValidator),
    headerText: v.optional(v.string()),
    headerImageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const templateId = await ctx.db.insert("messageTemplates", {
      organizationId: args.organizationId,
      wabaId: args.wabaId,
      code: args.code,
      name: args.name,
      description: args.description,
      content: args.content,
      status: args.status,
      whatsappTemplateId: args.whatsappTemplateId,
      category: args.category,
      language: args.language || "es",
      variables: args.variables || [],
      links: args.links,
      headerType: args.headerType || "none",
      headerText: args.headerText,
      headerImageUrl: args.headerImageUrl,
      isActive: true,
      usageCount: 0,
    })

    return templateId
  },
})

// Update template status
export const updateStatus = authMutation({
  args: {
    organizationId: v.string(),
    templateId: v.id("messageTemplates"),
    status: messageTemplateStatusValidator,
    whatsappTemplateId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId)
    if (!template || template.organizationId !== args.organizationId) {
      throw new Error("Plantilla no encontrada")
    }

    await ctx.db.patch(args.templateId, {
      status: args.status,
      whatsappTemplateId: args.whatsappTemplateId,
    })

    return args.templateId
  },
})

// Internal mutation to update template metadata
export const updateTemplateMetaData = internalMutation({
  args: {
    id: v.id("messageTemplates"),
    name: v.string(),
    language: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      name: args.name,
      language: args.language,
    })
  },
})

export const getTemplateInternal = internalQuery({
  args: { templateId: v.id("messageTemplates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.templateId)
  },
})

// Internal mutation to delete template from DB
export const deleteTemplateInternal = internalMutation({
  args: {
    templateId: v.id("messageTemplates"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.templateId)
  },
})

// Internal mutation to update template header info
export const updateTemplateHeaderInfo = internalMutation({
  args: {
    templateId: v.id("messageTemplates"),
    headerType: messageTemplateHeaderTypeValidator,
    headerText: v.optional(v.string()),
    headerImageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.templateId, {
      headerType: args.headerType,
      headerText: args.headerText,
      headerImageUrl: args.headerImageUrl,
    })
  },
})

// Delete template from API and DB
export const deleteTemplate = authAction({
  args: {
    organizationId: v.string(),
    templateId: v.id("messageTemplates"),
  },
  handler: async (ctx, args) => {
    const template = await ctx.runQuery(
      internal.private.metaTemplates.getTemplateInternal,
      {
        templateId: args.templateId,
      }
    )

    if (!template || template.organizationId !== args.organizationId) {
      throw new Error("Plantilla no encontrada")
    }

    const config = await getActiveWhatsAppConfig(ctx, args.organizationId)
    const provider = config.provider || "meta"

    // Delete from Provider API
    if (provider === "360dialog") {
      await deleteDialog360Template(
        ctx,
        (config as any).dialog360ApiKey,
        template.name
      )
    }
    // Note: Meta template deletion requires Business Manager API call (not implemented)
    // Note: Twilio Content templates can be deleted via Twilio console if needed

    // Delete from DB
    await ctx.runMutation(
      internal.private.metaTemplates.deleteTemplateInternal,
      {
        templateId: args.templateId,
      }
    )
  },
})
