import { R2 } from "@convex-dev/r2"
import { v } from "convex/values"
import { components, internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { env } from "../lib/env"
import { authAction, authMutation, authQuery } from "../lib/helpers"
import { campaignStatusValidator } from "../schema"

const r2 = new R2(components.r2)

// Get all campaigns for an organization
export const list = authQuery({
  args: {
    organizationId: v.string(),
    status: v.optional(campaignStatusValidator),
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
  },
  handler: async (ctx, args) => {
    let campaigns: Doc<"messageCampaigns">[]

    if (args.status) {
      campaigns = await ctx.db
        .query("messageCampaigns")
        .withIndex("by_organization_and_status", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", args.status!)
        )
        .order("desc")
        .collect()
    } else {
      campaigns = await ctx.db
        .query("messageCampaigns")
        .withIndex("by_organization_id", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .order("desc")
        .collect()
    }

    // Filter by whatsappConfigurationId if provided
    if (args.whatsappConfigurationId) {
      campaigns = campaigns.filter(
        (c) => c.whatsappConfigurationId === args.whatsappConfigurationId
      )
    }

    // Enrich with template names
    const enrichedCampaigns = await Promise.all(
      campaigns.map(async (campaign) => {
        const template = await ctx.db.get(campaign.templateId)
        return {
          ...campaign,
          templateName: template?.name || "Plantilla eliminada",
        }
      })
    )

    return enrichedCampaigns
  },
})

// Get a single campaign with full details
export const getOne = authQuery({
  args: {
    organizationId: v.string(),
    campaignId: v.id("messageCampaigns"),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign || campaign.organizationId !== args.organizationId) {
      throw new Error("Campaña no encontrada")
    }

    const template = await ctx.db.get(campaign.templateId)

    return {
      ...campaign,
      template,
    }
  },
})

// Get campaign recipients with pagination
export const getRecipients = authQuery({
  args: {
    organizationId: v.string(),
    campaignId: v.id("messageCampaigns"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("sent"),
        v.literal("delivered"),
        v.literal("read"),
        v.literal("failed")
      )
    ),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign || campaign.organizationId !== args.organizationId) {
      throw new Error("Campaña no encontrada")
    }

    const limit = args.limit || 50

    const query = ctx.db
      .query("campaignRecipients")
      .withIndex("by_campaign_id", (q) => q.eq("campaignId", args.campaignId))

    const recipients = await query.take(limit + 1)

    // Filter by status if provided
    const filtered = args.status
      ? recipients.filter((r) => r.status === args.status)
      : recipients

    // Enrich with contact info
    const enrichedRecipients = await Promise.all(
      filtered.slice(0, limit).map(async (recipient) => {
        const contact = await ctx.db.get(recipient.contactId)
        return {
          ...recipient,
          contactName: contact?.displayName || "Sin nombre",
          contactPhone: contact?.phoneNumber || "Sin teléfono",
        }
      })
    )

    return {
      recipients: enrichedRecipients,
      hasMore: filtered.length > limit,
    }
  },
})

// Create a new campaign (draft)
export const create = authMutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
    templateId: v.id("messageTemplates"),
    whatsappConfigurationId: v.id("whatsappConfigurations"),
    // Recipient selection mode
    recipientSelectionMode: v.optional(
      v.union(v.literal("filters"), v.literal("manual"))
    ),
    // Filter-based selection
    recipientFilters: v.optional(
      v.object({
        allContacts: v.optional(v.boolean()),
        lastOrderAfter: v.optional(v.number()),
        lastOrderBefore: v.optional(v.number()),
        restaurantLocationIds: v.optional(v.array(v.id("restaurantLocations"))),
        minOrderCount: v.optional(v.number()),
        maxOrderCount: v.optional(v.number()),
        hasNoOrders: v.optional(v.boolean()),
        createdAfter: v.optional(v.number()),
        createdBefore: v.optional(v.number()),
      })
    ),
    // Manual contact selection
    selectedContactIds: v.optional(v.array(v.id("contacts"))),
    scheduledAt: v.optional(v.number()),
    // Header image URL for templates with image headers
    headerImageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate template exists and belongs to org
    const template = await ctx.db.get(args.templateId)
    if (!template || template.organizationId !== args.organizationId) {
      throw new Error("Plantilla no encontrada")
    }

    if (!template.isActive) {
      throw new Error("La plantilla está desactivada")
    }

    // Validate header media URL if provided
    if (args.headerImageUrl) {
      if (!args.headerImageUrl.startsWith("https://")) {
        throw new Error("La URL del media debe comenzar con https://")
      }
      // Validate that template has a media header type (image, video, or document)
      const hasMediaHeader =
        template.headerType === "image" ||
        template.headerType === "video" ||
        template.headerType === "document"
      if (!hasMediaHeader) {
        throw new Error(
          "La plantilla seleccionada no tiene un header de media (imagen, video o documento)"
        )
      }
    }

    // Validate WhatsApp configuration
    const whatsappConfig = await ctx.db.get(args.whatsappConfigurationId)
    if (
      !whatsappConfig ||
      whatsappConfig.organizationId !== args.organizationId
    ) {
      throw new Error("Configuración de WhatsApp no encontrada")
    }
    if (!whatsappConfig.isActive) {
      throw new Error("La configuración de WhatsApp está desactivada")
    }

    const selectionMode = args.recipientSelectionMode || "filters"
    let recipientCount: number

    if (selectionMode === "manual") {
      // Manual selection: validate and count selected contacts
      if (!args.selectedContactIds || args.selectedContactIds.length === 0) {
        throw new Error("Debes seleccionar al menos un contacto")
      }

      // Validate all contacts exist and belong to org
      const validContactIds: Id<"contacts">[] = []
      for (const contactId of args.selectedContactIds) {
        const contact = await ctx.db.get(contactId)
        if (
          contact &&
          contact.organizationId === args.organizationId &&
          !contact.isBlocked
        ) {
          validContactIds.push(contactId)
        }
      }

      if (validContactIds.length === 0) {
        throw new Error("Ninguno de los contactos seleccionados es válido")
      }

      recipientCount = validContactIds.length
    } else {
      // Filter-based selection
      recipientCount = await getFilteredContactCount(
        ctx,
        args.organizationId,
        args.recipientFilters
      )

      if (recipientCount === 0) {
        throw new Error(
          "No hay contactos que coincidan con los filtros seleccionados"
        )
      }
    }

    const campaignId = await ctx.db.insert("messageCampaigns", {
      organizationId: args.organizationId,
      name: args.name,
      templateId: args.templateId,
      status: args.scheduledAt ? "scheduled" : "draft",
      scheduledAt: args.scheduledAt,
      recipientSelectionMode: selectionMode,
      recipientFilters:
        selectionMode === "filters" ? args.recipientFilters : undefined,
      selectedContactIds:
        selectionMode === "manual" ? args.selectedContactIds : undefined,
      totalRecipients: recipientCount,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
      whatsappConfigurationId: args.whatsappConfigurationId,
      headerImageUrl: args.headerImageUrl,
    })

    return campaignId
  },
})

// Update a draft campaign
export const update = authMutation({
  args: {
    organizationId: v.string(),
    campaignId: v.id("messageCampaigns"),
    name: v.optional(v.string()),
    templateId: v.optional(v.id("messageTemplates")),
    recipientSelectionMode: v.optional(
      v.union(v.literal("filters"), v.literal("manual"))
    ),
    recipientFilters: v.optional(
      v.object({
        allContacts: v.optional(v.boolean()),
        lastOrderAfter: v.optional(v.number()),
        lastOrderBefore: v.optional(v.number()),
        restaurantLocationIds: v.optional(v.array(v.id("restaurantLocations"))),
        minOrderCount: v.optional(v.number()),
        maxOrderCount: v.optional(v.number()),
        hasNoOrders: v.optional(v.boolean()),
        createdAfter: v.optional(v.number()),
        createdBefore: v.optional(v.number()),
      })
    ),
    selectedContactIds: v.optional(v.array(v.id("contacts"))),
    scheduledAt: v.optional(v.number()),
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
    // Header image URL for templates with image headers
    headerImageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign || campaign.organizationId !== args.organizationId) {
      throw new Error("Campaña no encontrada")
    }

    if (campaign.status !== "draft" && campaign.status !== "scheduled") {
      throw new Error(
        "Solo se pueden editar campañas en borrador o programadas"
      )
    }

    // Validate template if being updated
    if (args.templateId) {
      const template = await ctx.db.get(args.templateId)
      if (!template || template.organizationId !== args.organizationId) {
        throw new Error("Plantilla no encontrada")
      }
      if (!template.isActive) {
        throw new Error("La plantilla está desactivada")
      }
    }

    // Validate header media URL if provided
    if (args.headerImageUrl !== undefined) {
      if (args.headerImageUrl && !args.headerImageUrl.startsWith("https://")) {
        throw new Error("La URL del media debe comenzar con https://")
      }
      // Get the template to validate header type
      const templateId = args.templateId || campaign.templateId
      const template = await ctx.db.get(templateId)
      if (args.headerImageUrl) {
        const hasMediaHeader =
          template?.headerType === "image" ||
          template?.headerType === "video" ||
          template?.headerType === "document"
        if (!hasMediaHeader) {
          throw new Error(
            "La plantilla seleccionada no tiene un header de media (imagen, video o documento)"
          )
        }
      }
    }

    // Determine selection mode
    const selectionMode =
      args.recipientSelectionMode ??
      campaign.recipientSelectionMode ??
      "filters"

    // Recalculate recipient count if selection changed
    let totalRecipients = campaign.totalRecipients

    if (selectionMode === "manual") {
      // Manual selection
      const contactIds = args.selectedContactIds ?? campaign.selectedContactIds
      if (!contactIds || contactIds.length === 0) {
        throw new Error("Debes seleccionar al menos un contacto")
      }

      // Validate contacts if new selection provided
      if (args.selectedContactIds) {
        const validContactIds: Id<"contacts">[] = []
        for (const contactId of args.selectedContactIds) {
          const contact = await ctx.db.get(contactId)
          if (
            contact &&
            contact.organizationId === args.organizationId &&
            !contact.isBlocked
          ) {
            validContactIds.push(contactId)
          }
        }

        if (validContactIds.length === 0) {
          throw new Error("Ninguno de los contactos seleccionados es válido")
        }

        totalRecipients = validContactIds.length
      }
    } else if (args.recipientFilters) {
      // Filter-based selection with new filters
      totalRecipients = await getFilteredContactCount(
        ctx,
        args.organizationId,
        args.recipientFilters
      )
      if (totalRecipients === 0) {
        throw new Error(
          "No hay contactos que coincidan con los filtros seleccionados"
        )
      }
    }

    // Determine new status
    let newStatus = campaign.status
    if (args.scheduledAt !== undefined) {
      newStatus = args.scheduledAt ? "scheduled" : "draft"
    }

    await ctx.db.patch(args.campaignId, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.templateId !== undefined && { templateId: args.templateId }),
      ...(args.recipientSelectionMode !== undefined && {
        recipientSelectionMode: args.recipientSelectionMode,
      }),
      ...(selectionMode === "filters" && {
        recipientFilters: args.recipientFilters ?? campaign.recipientFilters,
        selectedContactIds: undefined,
      }),
      ...(selectionMode === "manual" &&
        args.selectedContactIds !== undefined && {
          selectedContactIds: args.selectedContactIds,
          recipientFilters: undefined,
        }),
      ...(args.scheduledAt !== undefined && { scheduledAt: args.scheduledAt }),
      ...(args.whatsappConfigurationId !== undefined && {
        whatsappConfigurationId: args.whatsappConfigurationId,
      }),
      ...(args.headerImageUrl !== undefined && {
        headerImageUrl: args.headerImageUrl,
      }),
      totalRecipients,
      status: newStatus,
    })

    return args.campaignId
  },
})

// Cancel a campaign
export const cancel = authMutation({
  args: {
    organizationId: v.string(),
    campaignId: v.id("messageCampaigns"),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign || campaign.organizationId !== args.organizationId) {
      throw new Error("Campaña no encontrada")
    }

    if (campaign.status === "completed" || campaign.status === "cancelled") {
      throw new Error(
        "No se puede cancelar una campaña completada o ya cancelada"
      )
    }

    await ctx.db.patch(args.campaignId, {
      status: "cancelled",
    })

    return args.campaignId
  },
})

// Delete a draft campaign
export const remove = authMutation({
  args: {
    organizationId: v.string(),
    campaignId: v.id("messageCampaigns"),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign || campaign.organizationId !== args.organizationId) {
      throw new Error("Campaña no encontrada")
    }

    if (campaign.status !== "draft") {
      throw new Error("Solo se pueden eliminar campañas en borrador")
    }

    // Delete any recipients (shouldn't exist for drafts, but just in case)
    const recipients = await ctx.db
      .query("campaignRecipients")
      .withIndex("by_campaign_id", (q) => q.eq("campaignId", args.campaignId))
      .collect()

    for (const recipient of recipients) {
      await ctx.db.delete(recipient._id)
    }

    await ctx.db.delete(args.campaignId)
    return args.campaignId
  },
})

// Get filtered contact count (preview before creating campaign)
export const previewRecipientCount = authQuery({
  args: {
    organizationId: v.string(),
    recipientFilters: v.optional(
      v.object({
        allContacts: v.optional(v.boolean()),
        lastOrderAfter: v.optional(v.number()),
        lastOrderBefore: v.optional(v.number()),
        restaurantLocationIds: v.optional(v.array(v.id("restaurantLocations"))),
        minOrderCount: v.optional(v.number()),
        maxOrderCount: v.optional(v.number()),
        hasNoOrders: v.optional(v.boolean()),
        createdAfter: v.optional(v.number()),
        createdBefore: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    return await getFilteredContactCount(
      ctx,
      args.organizationId,
      args.recipientFilters
    )
  },
})

// Helper function to get filtered contact count
async function getFilteredContactCount(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  filters?: {
    allContacts?: boolean
    lastOrderAfter?: number
    lastOrderBefore?: number
    restaurantLocationIds?: Id<"restaurantLocations">[]
    minOrderCount?: number
    maxOrderCount?: number
    hasNoOrders?: boolean
    createdAfter?: number
    createdBefore?: number
  }
): Promise<number> {
  // If no filters or allContacts is true, return all contacts
  if (!filters || filters.allContacts) {
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect()
    return contacts.filter((c) => !c.isBlocked).length
  }

  // Get all contacts first
  const allContacts = await ctx.db
    .query("contacts")
    .withIndex("by_organization_id", (q) =>
      q.eq("organizationId", organizationId)
    )
    .collect()

  // Filter out blocked contacts
  let filteredContacts = allContacts.filter((c) => !c.isBlocked)

  // Filter by creation date
  if (filters.createdAfter || filters.createdBefore) {
    filteredContacts = filteredContacts.filter((contact) => {
      // _creationTime is in milliseconds in Convex
      if (
        filters.createdAfter &&
        contact._creationTime < filters.createdAfter
      ) {
        return false
      }
      if (
        filters.createdBefore &&
        contact._creationTime > filters.createdBefore
      ) {
        return false
      }
      return true
    })
  } else {
    // console.log("No creation date filters applied", filters)
  }

  // Optimization: If no contacts left after basic filtering, return 0
  if (filteredContacts.length === 0) {
    return 0
  }

  // Apply order-based filters
  if (
    filters.lastOrderAfter ||
    filters.lastOrderBefore ||
    filters.minOrderCount ||
    filters.maxOrderCount ||
    filters.hasNoOrders ||
    filters.restaurantLocationIds?.length
  ) {
    // Get orders for filtering
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect()

    // Group orders by contact
    const ordersByContact = new Map<string, Doc<"orders">[]>()
    for (const order of orders) {
      const contactOrders = ordersByContact.get(order.contactId) || []
      contactOrders.push(order)
      ordersByContact.set(order.contactId, contactOrders)
    }

    filteredContacts = filteredContacts.filter((contact) => {
      const contactOrders = ordersByContact.get(contact._id) || []

      // Filter by no orders
      if (filters.hasNoOrders && contactOrders.length > 0) {
        return false
      }

      // Filter by order count
      if (
        filters.minOrderCount &&
        contactOrders.length < filters.minOrderCount
      ) {
        return false
      }
      if (
        filters.maxOrderCount &&
        contactOrders.length > filters.maxOrderCount
      ) {
        return false
      }

      // Filter by last order date
      if (contactOrders.length > 0) {
        const lastOrder = contactOrders.reduce((latest, order) =>
          order._creationTime > latest._creationTime ? order : latest
        )

        if (
          filters.lastOrderAfter &&
          lastOrder._creationTime < filters.lastOrderAfter
        ) {
          return false
        }
        if (
          filters.lastOrderBefore &&
          lastOrder._creationTime > filters.lastOrderBefore
        ) {
          return false
        }

        // Filter by restaurant location
        if (filters.restaurantLocationIds?.length) {
          const hasOrderFromLocation = contactOrders.some((order) =>
            filters.restaurantLocationIds!.includes(order.restaurantLocationId)
          )
          if (!hasOrderFromLocation) {
            return false
          }
        }
      } else if (
        filters.lastOrderAfter ||
        filters.lastOrderBefore ||
        filters.restaurantLocationIds?.length
      ) {
        // Contact has no orders but we're filtering by order criteria
        return false
      }

      return true
    })
  }

  return filteredContacts.length
}

// Get campaign statistics summary
export const getStatistics = authQuery({
  args: {
    organizationId: v.string(),
    whatsappConfigurationId: v.optional(v.id("whatsappConfigurations")),
  },
  handler: async (ctx, args) => {
    let campaigns = await ctx.db
      .query("messageCampaigns")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Filter by whatsappConfigurationId if provided
    if (args.whatsappConfigurationId) {
      campaigns = campaigns.filter(
        (c) => c.whatsappConfigurationId === args.whatsappConfigurationId
      )
    }

    const totalCampaigns = campaigns.length
    const completedCampaigns = campaigns.filter(
      (c) => c.status === "completed"
    ).length
    const totalMessagesSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0)
    const totalMessagesDelivered = campaigns.reduce(
      (sum, c) => sum + c.deliveredCount,
      0
    )
    const totalMessagesFailed = campaigns.reduce(
      (sum, c) => sum + c.failedCount,
      0
    )

    const deliveryRate =
      totalMessagesSent > 0
        ? Math.round((totalMessagesDelivered / totalMessagesSent) * 100)
        : 0

    return {
      totalCampaigns,
      completedCampaigns,
      totalMessagesSent,
      totalMessagesDelivered,
      totalMessagesFailed,
      deliveryRate,
    }
  },
})

// Send a campaign (trigger bulk messaging)
export const send = authMutation({
  args: {
    organizationId: v.string(),
    campaignId: v.id("messageCampaigns"),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign || campaign.organizationId !== args.organizationId) {
      throw new Error("Campaña no encontrada")
    }

    if (campaign.status !== "draft" && campaign.status !== "scheduled") {
      throw new Error(
        "Solo se pueden enviar campañas en borrador o programadas"
      )
    }

    // Trigger the bulk messaging system
    await ctx.scheduler.runAfter(
      0,
      internal.system.bulkMessaging.startCampaign,
      {
        campaignId: args.campaignId,
      }
    )

    return { success: true, message: "Campaña iniciada" }
  },
})

// Upload header image for campaign and return public URL
export const uploadHeaderImage = authAction({
  args: {
    organizationId: v.string(),
    file: v.bytes(),
    contentType: v.string(),
    fileName: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const mimeType = args.contentType

    // Validate file type
    if (
      !mimeType.startsWith("image/") &&
      !mimeType.startsWith("video/") &&
      mimeType !== "application/pdf"
    ) {
      throw new Error(
        "Tipo de archivo no válido. Solo se permiten imágenes, videos o PDFs."
      )
    }

    // Validate file size based on type
    const maxSize = mimeType.startsWith("image/")
      ? 5 * 1024 * 1024 // 5MB for images
      : 10 * 1024 * 1024 // 10MB for videos and documents

    if (args.file.byteLength > maxSize) {
      const maxSizeMB = maxSize / 1024 / 1024
      throw new Error(
        `El archivo es demasiado grande. Máximo ${maxSizeMB}MB para este tipo de archivo.`
      )
    }

    // Generate storage key
    const timestamp = Date.now()
    let extension = mimeType.split("/")[1] || "bin"
    if (extension === "jpeg") extension = "jpg"
    const folder = mimeType.startsWith("image/")
      ? "campaign-images"
      : mimeType.startsWith("video/")
        ? "campaign-videos"
        : "campaign-documents"

    const fileName = args.fileName
      ? args.fileName
          .split(".")
          .slice(0, -1)
          .join(".")
          .replace(/[^a-zA-Z0-9\-_]/g, "_")
      : `header`

    // Ensure unique key
    const uniqueId = Math.random().toString(36).substring(2, 8)
    const storageKey = `${folder}/${args.organizationId}/${fileName}_${timestamp}_${uniqueId}.${extension}`

    // Upload to R2
    const blob = new Blob([args.file], { type: mimeType })
    await r2.store(ctx, blob, {
      type: mimeType,
      key: storageKey,
    })

    // Return public URL
    const publicUrl = `${env.R2_PUBLIC_URL}/${storageKey}`

    console.log(
      `[Campaign] Uploaded header media to R2: ${storageKey}, URL: ${publicUrl}`
    )

    return publicUrl
  },
})
