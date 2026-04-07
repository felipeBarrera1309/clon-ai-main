import { v } from "convex/values"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import type { ActionCtx } from "../_generated/server"
import { internalMutation, internalQuery } from "../_generated/server"
import { authAction, authMutation, authQuery } from "../lib/helpers"
import {
  messageTemplateCategoryValidator,
  messageTemplateHeaderTypeValidator,
  messageTemplateStatusValidator,
} from "../schema"

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets the active Twilio configuration for the current organization.
 */
async function getActiveTwilioConfig(
  ctx: ActionCtx,
  organizationId: string,
  configId?: string
) {
  // Get all configurations for the organization
  const configs = await ctx.runQuery(
    internal.private.whatsappConfigurations.getConfigurationsInternal,
    { organizationId }
  )

  // Filter for Twilio configs
  const twilioConfigs = configs.filter((c) => c.provider === "twilio")

  // If configId provided, use that specific config
  const config = configId
    ? twilioConfigs.find((c) => c._id === configId)
    : twilioConfigs.find((c) => c.isActive)

  if (!config) {
    throw new Error("No hay configuración de Twilio activa")
  }

  // Validate Twilio credentials
  if (!config.twilioAccountSid) {
    throw new Error("No se ha configurado el Account SID de Twilio")
  }
  if (!config.twilioAuthToken) {
    throw new Error("No se ha configurado el Auth Token de Twilio")
  }
  if (!config.phoneNumber && !config.twilioPhoneNumber) {
    throw new Error("No se ha configurado el número de teléfono de Twilio")
  }

  return config
}

/**
 * Maps Twilio status to our internal status format.
 */
function mapTwilioStatus(
  twilioStatus: string
): "pending" | "approved" | "rejected" {
  if (!twilioStatus) return "pending"
  const status = twilioStatus.toLowerCase()
  // Twilio Content API often returns 'active' for templates that are ready to use
  // Approvals often return 'approved'
  if (status === "approved" || status === "active") return "approved"
  if (status === "rejected" || status === "end_user_rejected") return "rejected"
  return "pending"
}

// =============================================================================
// Queries
// =============================================================================

// Get all Twilio templates with status filter
export const listWithStatus = authQuery({
  args: {
    organizationId: v.string(),
    twilioConfigId: v.optional(v.id("whatsappConfigurations")),
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

    // Filter for Twilio templates only (wabaId starts with "twilio-")
    templates = templates.filter((t) => t.wabaId.startsWith("twilio-"))

    // Filter by specific Twilio config if provided
    if (args.twilioConfigId) {
      const config = await ctx.db.get(args.twilioConfigId)
      if (config && config.twilioAccountSid) {
        const twilioWabaId = `twilio-${config.twilioAccountSid}`
        templates = templates.filter((t) => t.wabaId === twilioWabaId)
      }
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

// Get approved Twilio templates only (for bulk messaging)
export const listApproved = authQuery({
  args: {
    organizationId: v.string(),
    twilioConfigId: v.optional(v.id("whatsappConfigurations")),
  },
  handler: async (ctx, args) => {
    const templates = await ctx.db
      .query("messageTemplates")
      .withIndex("by_organization_and_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "approved")
      )
      .collect()

    // Filter for Twilio templates only
    let filtered = templates.filter(
      (t) => t.isActive && t.wabaId.startsWith("twilio-")
    )

    // Filter by specific Twilio config if provided
    if (args.twilioConfigId) {
      const config = await ctx.db.get(args.twilioConfigId)
      if (config && config.twilioAccountSid) {
        const twilioWabaId = `twilio-${config.twilioAccountSid}`
        filtered = filtered.filter((t) => t.wabaId === twilioWabaId)
      }
    }

    return filtered
  },
})

// =============================================================================
// Actions - Twilio API Integration
// =============================================================================

// Create template in Twilio API and save to DB
export const createInTwilio = authAction({
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
    // Rich content args
    headerType: v.optional(
      v.union(
        v.literal("text"),
        v.literal("image"),
        v.literal("video"),
        v.literal("document")
      )
    ),
    headerContent: v.optional(v.string()),
    buttons: v.optional(
      v.array(
        v.object({
          type: v.union(
            v.literal("quick_reply"),
            v.literal("call_to_action"),
            v.literal("url"),
            v.literal("phone_number")
          ),
          text: v.string(),
          url: v.optional(v.string()),
          phoneNumber: v.optional(v.string()),
        })
      )
    ),
  },
  returns: v.id("messageTemplates"),
  handler: async (ctx, args): Promise<Id<"messageTemplates">> => {
    const config = await getActiveTwilioConfig(
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

    const language = args.language || "es"
    const variableExamples = args.variables?.map((v) => v.example)

    // Create template in Twilio Content API using action
    const apiResult = await ctx.runAction(
      internal.actions.twilioActions.createContentTemplate,
      {
        accountSid: config.twilioAccountSid!,
        authToken: config.twilioAuthToken!,
        name: args.name,
        language,
        category: args.category,
        content: args.content,
        variableExamples,
        headerType: args.headerType,
        headerContent: args.headerContent,
        buttons: args.buttons,
      }
    )

    const status = mapTwilioStatus(apiResult.status)

    // Extract variable names
    const variableNames = args.variables?.map((v) => v.name) || []

    // Create template in DB with Twilio-specific wabaId
    const twilioWabaId = `twilio-${config.twilioAccountSid}`

    // Map buttons to DB schema "links" format
    const links = args.buttons?.map((b) => ({
      type:
        b.type === "url" || b.type === "call_to_action"
          ? "url"
          : b.type === "phone_number"
            ? "phone"
            : ("quick_reply" as any), // Cast to match union
      nombre: b.text,
      url: b.url,
      phoneNumber: b.phoneNumber,
    }))

    // Map header type to schema validator
    const headerType =
      args.headerType === "image" ||
      args.headerType === "video" ||
      args.headerType === "document" ||
      args.headerType === "text"
        ? args.headerType
        : "none"

    const templateId = await ctx.runMutation(
      internal.private.twilioTemplates.createTemplateInternal,
      {
        organizationId: args.organizationId,
        wabaId: twilioWabaId,
        code: normalizedName,
        name: args.name, // Use the exact name provided by the user, ignoring Twilio's normalization
        description: args.description,
        content: args.content,
        status,
        whatsappTemplateId: apiResult.sid,
        category: args.category,
        language,
        variables: variableNames,
        headerType,
        headerImageUrl:
          args.headerType && args.headerType !== "text"
            ? args.headerContent
            : undefined,
        headerText: args.headerType === "text" ? args.headerContent : undefined,
        // ✅ CRITICAL FIX: hasDynamicMedia must ALWAYS be true when template has media,
        // because twilioActions.ts:createContentTemplate always creates media templates
        // with media: ["{{1}}"] (dynamic placeholder), regardless of whether a static URL
        // was provided. This means {{1}} is ALWAYS reserved for the media URL,
        // and body variables ALWAYS start at {{2}}.
        hasDynamicMedia:
          args.headerType === "image" ||
          args.headerType === "video" ||
          args.headerType === "document",
        links,
      }
    )

    return templateId
  },
})

// Import all templates from Twilio API
export const importFromTwilio = authAction({
  args: {
    organizationId: v.string(),
    twilioConfigId: v.optional(v.id("whatsappConfigurations")),
  },
  returns: v.object({
    imported: v.number(),
    updated: v.number(),
    total: v.number(),
    deactivated: v.optional(v.number()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    imported: number
    updated: number
    total: number
    deactivated?: number
  }> => {
    const config = await getActiveTwilioConfig(
      ctx,
      args.organizationId,
      args.twilioConfigId
    )
    const twilioWabaId = `twilio-${config.twilioAccountSid}`

    // Fetch templates from Twilio API using action
    const apiTemplates = await ctx.runAction(
      internal.actions.twilioActions.listContentTemplates,
      {
        accountSid: config.twilioAccountSid!,
        authToken: config.twilioAuthToken!,
      }
    )

    // Get all our Twilio templates for this account
    const ourTemplates = await ctx.runQuery(
      internal.private.twilioTemplates.listTwilioTemplatesInternal,
      { organizationId: args.organizationId, wabaId: twilioWabaId }
    )

    // Create a map of our templates by Twilio SID
    const ourTemplatesBySid = new Map()
    for (const template of ourTemplates) {
      if (template.whatsappTemplateId) {
        ourTemplatesBySid.set(template.whatsappTemplateId, template)
      }
    }

    let imported = 0
    let updated = 0
    let deactivated = 0

    // Create a set of SIDs from API for efficient lookup
    const apiTemplateSids = new Set(apiTemplates.map((t: any) => t.sid))

    // Process each API template (Import / Update)
    for (const apiTemplate of apiTemplates) {
      // Robust status mapping
      const rawStatus =
        apiTemplate.approval_requests?.status || apiTemplate.status
      const status = mapTwilioStatus(rawStatus)

      const existingTemplate = ourTemplatesBySid.get(apiTemplate.sid)

      if (existingTemplate) {
        // Update existing template status if changed
        if (existingTemplate.status !== status) {
          await ctx.runMutation(
            internal.private.twilioTemplates.updateTemplateStatus,
            {
              templateId: existingTemplate._id,
              status,
            }
          )
          updated++
        }

        // Ensure it is active if it was previously deactivated
        if (!existingTemplate.isActive) {
          // We would need a mutation to reactivate, assuming updateTemplateStatus or similar handles it,
          // or we let user reactivate manually. For now, we trust active status unless we explicitly hide it.
        }
      } else {
        // Import new template
        // ✅ FIX: Support all Twilio template types, not just "twilio/text"
        const types = apiTemplate.types || {}

        // Determine which template type this is
        const templateType = types["twilio/media"]
          ? "twilio/media"
          : types["twilio/quick-reply"]
            ? "twilio/quick-reply"
            : types["twilio/call-to-action"]
              ? "twilio/call-to-action"
              : types["twilio/text"]
                ? "twilio/text"
                : null

        if (!templateType) {
          console.warn(
            `⚠️ [TWILIO IMPORT] Skipping template ${apiTemplate.sid} - unknown type structure`
          )
          continue
        }

        const templateData = types[templateType]
        const body =
          templateData?.body || `[Plantilla "${apiTemplate.friendly_name}"]`

        // Extract variables from body
        const variables: string[] = []
        const variableMatches = body.match(/\{\{(\d+)\}\}/g)
        if (variableMatches) {
          // Extract unique variable numbers and create names
          const varNumbers: number[] = variableMatches.map((m: string) => {
            const match = m.match(/\{\{(\d+)\}\}/)
            return match && typeof match[1] === "string"
              ? parseInt(match[1])
              : 0
          })
          const uniqueVars: number[] = Array.from(new Set(varNumbers))
          uniqueVars.sort((a, b) => a - b)

          variables.push(...uniqueVars.map((num) => `var${num}`))
        }

        // ✅ FIX: Extract header type and dynamic media flag
        let headerType: "none" | "text" | "image" | "video" | "document" =
          "none"
        let hasDynamicMedia = false
        let headerImageUrl: string | undefined

        if (templateType === "twilio/media") {
          // Media templates have dynamic media as {{1}}
          const media = templateData?.media
          if (media && Array.isArray(media) && media.length > 0) {
            const mediaVar = media[0]
            if (typeof mediaVar === "string" && mediaVar.includes("{{1}}")) {
              hasDynamicMedia = true
              headerType = "image" // Default to image, could be video/document
            } else {
              // Static media URL
              headerImageUrl = mediaVar
              headerType = "image"
            }
          }
        }

        // Extract buttons from actions
        const actions = templateData?.actions
        const links: any[] = []
        if (actions && Array.isArray(actions)) {
          actions.forEach((action: any) => {
            if (action.type === "QUICK_REPLY") {
              links.push({
                type: "quick_reply",
                nombre: action.title,
              })
            } else if (action.type === "URL") {
              links.push({
                type: "url",
                nombre: action.title,
                url: action.url,
              })
            } else if (action.type === "PHONE_NUMBER") {
              links.push({
                type: "phone",
                nombre: action.title,
                phoneNumber: action.phone_number,
              })
            }
          })
        }

        await ctx.runMutation(
          internal.private.twilioTemplates.createTemplateInternal,
          {
            organizationId: args.organizationId,
            wabaId: twilioWabaId,
            code: apiTemplate.sid,
            name: apiTemplate.friendly_name || apiTemplate.sid,
            description: `Plantilla importada desde Twilio API (${templateType})`,
            content: body,
            status,
            whatsappTemplateId: apiTemplate.sid,
            category: "UTILITY",
            language: apiTemplate.language || "es",
            variables,
            headerType,
            hasDynamicMedia,
            headerImageUrl,
            links: links.length > 0 ? links : undefined,
          }
        )
        imported++
      }
    }

    // ✅ FIX: Soft Delete (Deactivate) local templates that are missing in Twilio
    // Instead of hard deleting, we mark them as inactive to prevent data loss
    // if the API returns partial results or experiences temporary issues
    for (const template of ourTemplates) {
      if (
        template.whatsappTemplateId &&
        !apiTemplateSids.has(template.whatsappTemplateId)
      ) {
        // Only deactivate if currently active
        if (template.isActive) {
          await ctx.runMutation(
            internal.private.twilioTemplates.deactivateTemplateInternal,
            {
              templateId: template._id,
            }
          )
          deactivated++
          console.log(
            `⚠️ [TWILIO SYNC] Deactivated template "${template.name}" (not found in Twilio API)`
          )
        }
      }
    }

    return {
      imported,
      updated,
      total: apiTemplates.length,
      deactivated,
    }
  },
})

export const deleteTemplateInternal = internalMutation({
  args: {
    templateId: v.id("messageTemplates"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.templateId)
  },
})

export const deactivateTemplateInternal = internalMutation({
  args: {
    templateId: v.id("messageTemplates"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.templateId, { isActive: false })
  },
})

// =============================================================================
// Internal Queries
// =============================================================================

export const listTwilioTemplatesInternal = internalQuery({
  args: {
    organizationId: v.string(),
    wabaId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messageTemplates")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("wabaId"), args.wabaId))
      .collect()
  },
})

// =============================================================================
// Mutations
// =============================================================================

// Internal mutation to create template in DB
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
    // New fields
    headerType: v.optional(messageTemplateHeaderTypeValidator),
    headerImageUrl: v.optional(v.string()),
    headerText: v.optional(v.string()),
    hasDynamicMedia: v.optional(v.boolean()),
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
      headerType: args.headerType || "none",
      headerImageUrl: args.headerImageUrl,
      headerText: args.headerText,
      hasDynamicMedia: args.hasDynamicMedia,
      links: args.links,
      isActive: true,
      usageCount: 0,
    })

    return templateId
  },
})

// Update template status
export const updateTemplateStatus = internalMutation({
  args: {
    templateId: v.id("messageTemplates"),
    status: messageTemplateStatusValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.templateId, {
      status: args.status,
    })
    return args.templateId
  },
})

// Public mutation to update template
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
