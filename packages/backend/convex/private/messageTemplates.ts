import { v } from "convex/values"
import { authMutation, authQuery } from "../lib/helpers"

// Extract variables from template content (e.g., {{nombre}}, {{ultimoPedido}})
function extractVariables(content: string): string[] {
  const regex = /\{\{(\w+)\}\}/g
  const variables: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const variable = match[1]
    if (variable && !variables.includes(variable)) {
      variables.push(variable)
    }
  }
  return variables
}

// Get all message templates for an organization
export const list = authQuery({
  args: {
    organizationId: v.string(),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("messageTemplates")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )

    const templates = await query.collect()

    // Filter by active status if needed
    const filtered = args.includeInactive
      ? templates
      : templates.filter((t) => t.isActive)

    // Sort by usage count (most used first), then by name
    return filtered.sort((a, b) => {
      if (a.usageCount !== b.usageCount) {
        return b.usageCount - a.usageCount
      }
      return a.name.localeCompare(b.name)
    })
  },
})

// Get a single template by ID
export const getOne = authQuery({
  args: {
    organizationId: v.string(),
    templateId: v.id("messageTemplates"),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId)
    if (!template || template.organizationId !== args.organizationId) {
      throw new Error("Plantilla no encontrada")
    }
    return template
  },
})

// Create a new message template
export const create = authMutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
    content: v.string(),
    wabaId: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate name uniqueness within organization
    const existing = await ctx.db
      .query("messageTemplates")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("name"), args.name))
      .first()

    if (existing) {
      throw new Error("Ya existe una plantilla con este nombre")
    }

    // Extract variables from content
    const variables = extractVariables(args.content)

    const templateId = await ctx.db.insert("messageTemplates", {
      organizationId: args.organizationId,
      wabaId: args.wabaId,
      name: args.name,
      content: args.content,
      variables,
      isActive: true,
      usageCount: 0,
    })

    return templateId
  },
})

// Update an existing template
export const update = authMutation({
  args: {
    organizationId: v.string(),
    templateId: v.id("messageTemplates"),
    name: v.optional(v.string()),
    content: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.templateId)
    if (!existing || existing.organizationId !== args.organizationId) {
      throw new Error("Plantilla no encontrada")
    }

    // Check if template is used in active campaigns
    if (args.content !== undefined && args.content !== existing.content) {
      const activeCampaigns = await ctx.db
        .query("messageCampaigns")
        .withIndex("by_template_id", (q) => q.eq("templateId", args.templateId))
        .filter((q) =>
          q.or(
            q.eq(q.field("status"), "scheduled"),
            q.eq(q.field("status"), "sending")
          )
        )
        .first()

      if (activeCampaigns) {
        throw new Error(
          "No se puede modificar una plantilla que está siendo usada en una campaña activa"
        )
      }
    }

    // If name is being updated, check for uniqueness
    if (args.name && args.name !== existing.name) {
      const duplicate = await ctx.db
        .query("messageTemplates")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .filter((q) => q.eq(q.field("name"), args.name))
        .first()

      if (duplicate) {
        throw new Error("Ya existe una plantilla con este nombre")
      }
    }

    // Extract variables if content is updated
    const variables =
      args.content !== undefined
        ? extractVariables(args.content)
        : existing.variables

    await ctx.db.patch(args.templateId, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.content !== undefined && { content: args.content }),
      ...(args.isActive !== undefined && { isActive: args.isActive }),
      variables,
    })

    return args.templateId
  },
})

// Delete a template
export const remove = authMutation({
  args: {
    organizationId: v.string(),
    templateId: v.id("messageTemplates"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.templateId)
    if (!existing || existing.organizationId !== args.organizationId) {
      throw new Error("Plantilla no encontrada")
    }

    // Check if template is used in any campaigns
    const usedInCampaign = await ctx.db
      .query("messageCampaigns")
      .withIndex("by_template_id", (q) => q.eq("templateId", args.templateId))
      .first()

    if (usedInCampaign) {
      throw new Error(
        "No se puede eliminar una plantilla que ha sido usada en campañas. Desactívala en su lugar."
      )
    }

    await ctx.db.delete(args.templateId)
    return args.templateId
  },
})

// Preview template with sample data
export const preview = authQuery({
  args: {
    organizationId: v.string(),
    templateId: v.id("messageTemplates"),
    sampleData: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId)
    if (!template || template.organizationId !== args.organizationId) {
      throw new Error("Plantilla no encontrada")
    }

    // Default sample data for common variables
    const defaultSampleData: Record<string, string> = {
      nombre: "Juan Pérez",
      ultimoPedido: "Pizza Hawaiana",
      telefono: "+57 300 123 4567",
      direccion: "Calle 123 #45-67",
      total: "$45.000",
      fecha: new Date().toLocaleDateString("es-CO"),
    }

    const sampleData = { ...defaultSampleData, ...args.sampleData }

    // Replace variables with sample data
    let previewContent = template.content
    for (const variable of template.variables) {
      const value = sampleData[variable] || `[${variable}]`
      previewContent = previewContent.replace(
        new RegExp(`\\{\\{${variable}\\}\\}`, "g"),
        value
      )
    }

    return {
      template,
      previewContent,
      variables: template.variables,
    }
  },
})

// Get available variables for templates
export const getAvailableVariables = authQuery({
  args: {},
  handler: async () => {
    // Return list of available variables that can be used in templates
    return [
      {
        name: "nombre",
        description: "Nombre del cliente",
        example: "Juan Pérez",
      },
      {
        name: "telefono",
        description: "Teléfono del cliente",
        example: "+57 300 123 4567",
      },
      {
        name: "ultimoPedido",
        description: "Último producto pedido",
        example: "Pizza Hawaiana",
      },
      {
        name: "ultimaFechaPedido",
        description: "Fecha del último pedido",
        example: "15/01/2026",
      },
      {
        name: "totalPedidos",
        description: "Total de pedidos del cliente",
        example: "5",
      },
      {
        name: "restaurante",
        description: "Nombre del restaurante",
        example: "Zirus Pizza",
      },
    ]
  },
})
