import { v } from "convex/values"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server"
import { getSafeErrorDetails } from "../lib/errorUtils"
import {
  sendDialog360Message,
  sendDialog360TemplateMessageApi,
  sendMetaWhatsAppMessage,
  sendTemplateMessage,
  uploadMediaToWhatsApp,
} from "../model/whatsapp"

// WhatsApp API rate limits (conservative estimates)
// NOTE: Current settings are VERY conservative (5 msgs/15s = ~0.33 msg/s).
// For production workloads with verified WhatsApp Business accounts, you can safely increase to:
// - BATCH_SIZE: 20-50, BATCH_DELAY_MS: 1000-2000 (targeting 20-50 msg/s)
// - WhatsApp tier limits: Tier 1 (80 msg/s), Tier 2 (250 msg/s), Unlimited (1000 msg/s)
// Adjust based on your messaging tier and campaign volume requirements.
const MESSAGES_PER_SECOND = 5 // Pacing within the batch
const BATCH_SIZE = 5 // 5 messages per batch
const BATCH_DELAY_MS = 15000 // Wait 15 seconds between batches
const MAX_RETRIES = 3

/**
 * ✅ VALIDATION HELPERS: Prevent runtime crashes from incomplete configs
 */
function validateTwilioConfig(config: Doc<"whatsappConfigurations">): {
  accountSid: string
  authToken: string
  fromNumber: string
} {
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    throw new Error(
      `Twilio configuration ${config._id} missing required credentials (AccountSid/AuthToken)`
    )
  }
  const fromNumber = config.twilioPhoneNumber || config.phoneNumber
  if (!fromNumber) {
    throw new Error(`Twilio configuration ${config._id} missing phone number`)
  }
  return {
    accountSid: config.twilioAccountSid,
    authToken: config.twilioAuthToken,
    fromNumber,
  }
}

function validateMetaConfig(config: Doc<"whatsappConfigurations">): {
  phoneNumberId: string
  accessToken: string
} {
  if (!config.phoneNumberId || !config.accessToken) {
    throw new Error(
      `Meta configuration ${config._id} missing required credentials (phoneNumberId/accessToken)`
    )
  }
  return {
    phoneNumberId: config.phoneNumberId,
    accessToken: config.accessToken,
  }
}

function validate360DialogConfig(config: Doc<"whatsappConfigurations">): {
  apiKey: string
} {
  if (!config.dialog360ApiKey) {
    throw new Error(`360Dialog configuration ${config._id} missing API key`)
  }
  return {
    apiKey: config.dialog360ApiKey,
  }
}

/**
 * Start sending a campaign
 * This mutation prepares the campaign and schedules the sending action
 */
export const startCampaign = internalMutation({
  args: {
    campaignId: v.id("messageCampaigns"),
  },
  handler: async (ctx, args) => {
    console.log(
      `🚀 [BulkMessaging] Starting campaign processing for ID: ${args.campaignId}`
    )
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign) {
      console.error(`❌ [BulkMessaging] Campaign not found: ${args.campaignId}`)
      throw new Error("Campaña no encontrada")
    }

    console.log(
      `📋 [BulkMessaging] Current campaign status: ${campaign.status}`
    )

    if (campaign.status !== "draft" && campaign.status !== "scheduled") {
      console.warn(
        `⚠️ [BulkMessaging] Campaign already processing/completed. Status: ${campaign.status}`
      )
      throw new Error("La campaña ya está en proceso o completada")
    }

    // Get template
    const template = await ctx.db.get(campaign.templateId)
    if (!template) {
      console.error(
        `❌ [BulkMessaging] Template not found: ${campaign.templateId}`
      )
      throw new Error("Plantilla no encontrada")
    }

    console.log(
      `📄 [BulkMessaging] Template: ${template.name}, Status: ${template.status}`
    )

    // Validate template is approved for Meta templates
    if (template.status && template.status !== "approved") {
      console.error(
        `❌ [BulkMessaging] Template NOT approved. Status: ${template.status}`
      )
      throw new Error(
        `La plantilla "${template.name}" no está aprobada por Meta. Estado actual: ${template.status}`
      )
    }

    // Get WhatsApp configuration
    let whatsappConfig: Doc<"whatsappConfigurations"> | null = null
    if (campaign.whatsappConfigurationId) {
      whatsappConfig = await ctx.db.get(campaign.whatsappConfigurationId)
    } else {
      // Get first active WhatsApp config for the organization
      whatsappConfig = await ctx.db
        .query("whatsappConfigurations")
        .withIndex("by_organization_and_active", (q) =>
          q.eq("organizationId", campaign.organizationId).eq("isActive", true)
        )
        .first()
    }

    if (!whatsappConfig) {
      console.error(`❌ [BulkMessaging] No active WhatsApp configuration found`)
      throw new Error("No hay configuración de WhatsApp activa")
    }

    console.log(
      `✅ [BulkMessaging] Using WhatsApp Config: ${whatsappConfig.phoneNumber} (${whatsappConfig.provider || "meta"})`
    )

    // Get contacts based on selection mode
    let contacts: Doc<"contacts">[]

    if (
      campaign.recipientSelectionMode === "manual" &&
      campaign.selectedContactIds
    ) {
      // Manual selection: get specific contacts
      contacts = []
      for (const contactId of campaign.selectedContactIds) {
        const contact = await ctx.db.get(contactId)
        if (
          contact &&
          !contact.isBlocked &&
          contact.organizationId === campaign.organizationId
        ) {
          contacts.push(contact)
        }
      }
    } else {
      // Filter-based selection
      contacts = await getFilteredContacts(
        ctx,
        campaign.organizationId,
        campaign.recipientFilters
      )
    }

    console.log(
      `👥 [BulkMessaging] Found ${contacts.length} valid contacts to message`
    )

    if (contacts.length === 0) {
      throw new Error("No hay contactos para enviar")
    }

    // Create campaign recipients
    for (const contact of contacts) {
      // Personalize message content (for preview/reference)
      const personalizedContent = personalizeMessage(template.content, contact)

      // Extract template parameters for Meta API using stored variable names
      const templateParams = extractTemplateParams(
        template.content,
        template.variables || [],
        contact
      )

      await ctx.db.insert("campaignRecipients", {
        campaignId: args.campaignId,
        contactId: contact._id,
        organizationId: campaign.organizationId,
        status: "pending",
        personalizedContent,
        templateParams, // Store params for sending
        retryCount: 0,
      })
    }

    // Update campaign status
    await ctx.db.patch(args.campaignId, {
      status: "sending",
      sentAt: Date.now(),
      totalRecipients: contacts.length,
    })

    // Increment template usage
    await ctx.db.patch(campaign.templateId, {
      usageCount: template.usageCount + 1,
      lastUsedAt: Date.now(),
    })

    // Schedule the sending action
    await ctx.scheduler.runAfter(
      0,
      internal.system.bulkMessaging.processCampaignBatch,
      {
        campaignId: args.campaignId,
        whatsappConfigId: whatsappConfig._id,
        batchNumber: 0,
      }
    )

    return { recipientCount: contacts.length }
  },
})

/**
 * Process a batch of campaign messages
 * This action sends messages in batches with rate limiting
 */
export const processCampaignBatch = internalAction({
  args: {
    campaignId: v.id("messageCampaigns"),
    whatsappConfigId: v.id("whatsappConfigurations"),
    batchNumber: v.number(),
  },
  handler: async (ctx, args) => {
    // Get campaign
    const campaign = await ctx.runQuery(
      internal.system.bulkMessaging.getCampaign,
      {
        campaignId: args.campaignId,
      }
    )

    if (!campaign || campaign.status !== "sending") {
      console.log(
        `[BulkMessaging] Campaign ${args.campaignId} is not in sending status, stopping`
      )
      return
    }

    // Get template for this campaign
    const template = await ctx.runQuery(
      internal.system.bulkMessaging.getTemplate,
      {
        templateId: campaign.templateId,
      }
    )

    if (!template) {
      console.error(`[BulkMessaging] Template not found for campaign`)
      await ctx.runMutation(
        internal.system.bulkMessaging.updateCampaignStatus,
        {
          campaignId: args.campaignId,
          status: "cancelled",
        }
      )
      return
    }

    // Get WhatsApp config
    const whatsappConfig = await ctx.runQuery(
      internal.system.bulkMessaging.getWhatsAppConfig,
      {
        configId: args.whatsappConfigId,
      }
    )

    if (!whatsappConfig || !whatsappConfig.isActive) {
      console.error(`[BulkMessaging] WhatsApp config not found or inactive`)
      await ctx.runMutation(
        internal.system.bulkMessaging.updateCampaignStatus,
        {
          campaignId: args.campaignId,
          status: "cancelled",
        }
      )
      return
    }

    // Get pending recipients for this batch
    const recipients = await ctx.runQuery(
      internal.system.bulkMessaging.getPendingRecipients,
      {
        campaignId: args.campaignId,
        limit: BATCH_SIZE,
      }
    )

    if (recipients.length === 0) {
      // No more recipients, mark campaign as completed
      await ctx.runMutation(internal.system.bulkMessaging.completeCampaign, {
        campaignId: args.campaignId,
      })
      console.log(`[BulkMessaging] Campaign ${args.campaignId} completed`)
      return
    }

    console.log(
      `[BulkMessaging] Processing batch ${args.batchNumber} with ${recipients.length} recipients`
    )

    // Determine if we should use template messages or regular text
    const useTemplateMessage =
      template.status === "approved" && template.whatsappTemplateId
    const templateName = template.name
    const templateLanguage = template.language || "es"

    // Upload header media once for the entire batch if template has media header
    // Note: 360dialog doesn't support dynamic header media in template messages the same way Meta does
    let headerMediaId: string | undefined
    const headerMediaUrl = campaign.headerImageUrl || template.headerImageUrl
    const provider = whatsappConfig.provider || "meta"

    // Determine if we need to upload header media (image, video, or document)
    const hasMediaHeader =
      template.headerType === "image" ||
      template.headerType === "video" ||
      template.headerType === "document"

    // Validate that we have a header media URL if the template requires it
    // Templates with media headers MUST have a valid URL to upload
    if (hasMediaHeader && provider === "meta") {
      if (!headerMediaUrl) {
        console.error(
          `[BulkMessaging] Campaign ${args.campaignId} requires header ${template.headerType} but no URL provided`
        )
        await ctx.runMutation(
          internal.system.bulkMessaging.updateCampaignStatus,
          {
            campaignId: args.campaignId,
            status: "cancelled",
          }
        )
        console.error(
          `[BulkMessaging] Campaign ${args.campaignId} cancelled: template has ${template.headerType} header but no image URL was provided. ` +
            `Please provide the image URL when creating the campaign.`
        )
        return
      }

      // Validate that the URL looks like a valid URL (not a header_handle from Meta)
      // header_handle values are typically alphanumeric strings, not URLs
      const isValidUrl =
        headerMediaUrl.startsWith("http://") ||
        headerMediaUrl.startsWith("https://")
      if (!isValidUrl) {
        console.error(
          `[BulkMessaging] Campaign ${args.campaignId} has invalid header URL: ${headerMediaUrl}`
        )
        await ctx.runMutation(
          internal.system.bulkMessaging.updateCampaignStatus,
          {
            campaignId: args.campaignId,
            status: "cancelled",
          }
        )
        console.error(
          `[BulkMessaging] Campaign ${args.campaignId} cancelled: the header URL is not valid. ` +
            `For templates imported from Meta, you must provide a valid image URL when creating the campaign.`
        )
        return
      }
    }

    if (
      useTemplateMessage &&
      hasMediaHeader &&
      headerMediaUrl &&
      provider === "meta" // Only Meta provider supports dynamic header media
    ) {
      try {
        console.log(
          `[BulkMessaging] Uploading header ${template.headerType} for campaign ${args.campaignId}`
        )

        // Detect MIME type from URL and header type
        let mimeType: string
        const lowerUrl = headerMediaUrl.toLowerCase()

        if (template.headerType === "video") {
          // Video header
          if (lowerUrl.includes(".3gp")) {
            mimeType = "video/3gpp"
          } else {
            mimeType = "video/mp4" // Default video format
          }
        } else if (template.headerType === "document") {
          // Document header
          mimeType = "application/pdf" // Default document format
        } else {
          // Image header (default)
          if (lowerUrl.includes(".png")) {
            mimeType = "image/png"
          } else if (lowerUrl.includes(".webp")) {
            mimeType = "image/webp"
          } else {
            mimeType = "image/jpeg" // Default image format
          }
        }

        const { phoneNumberId, accessToken } =
          validateMetaConfig(whatsappConfig)
        headerMediaId = await uploadMediaToWhatsApp(
          ctx,
          headerMediaUrl,
          phoneNumberId,
          accessToken,
          mimeType
        )
        console.log(
          `[BulkMessaging] Header ${template.headerType} uploaded successfully, mediaId: ${headerMediaId}`
        )
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Error desconocido"
        console.error(
          `[BulkMessaging] Failed to upload header ${template.headerType} for campaign ${args.campaignId}:`,
          errorMessage
        )

        // If the template requires a media header and upload failed, cancel the campaign
        // because all messages would fail anyway
        await ctx.runMutation(
          internal.system.bulkMessaging.updateCampaignStatus,
          {
            campaignId: args.campaignId,
            status: "cancelled",
          }
        )

        console.error(
          `[BulkMessaging] Campaign ${args.campaignId} cancelled due to header ${template.headerType} upload failure`
        )
        return
      }
    }

    // Process each recipient
    let sentCount = 0
    let failedCount = 0

    for (const recipient of recipients) {
      try {
        // Get contact phone number
        const contact = await ctx.runQuery(
          internal.system.bulkMessaging.getContact,
          {
            contactId: recipient.contactId,
          }
        )

        if (!contact || !contact.phoneNumber) {
          await ctx.runMutation(
            internal.system.bulkMessaging.updateRecipientStatus,
            {
              recipientId: recipient._id,
              status: "failed",
              errorMessage: "Contacto sin número de teléfono",
            }
          )
          failedCount++
          continue
        }

        let whatsappMessageId: string | undefined

        if (useTemplateMessage) {
          // Send template message via WhatsApp Business API
          // Parse template params if stored
          let templateParams: string[] | undefined
          if (recipient.templateParams) {
            try {
              templateParams = JSON.parse(recipient.templateParams)
            } catch (parseError) {
              console.warn(
                `[BulkMessaging] Failed to parse templateParams for recipient ${recipient._id}:`,
                parseError
              )
              templateParams = undefined
            }
          }

          if (provider === "360dialog") {
            // Send via 360dialog
            const { apiKey } = validate360DialogConfig(whatsappConfig)
            whatsappMessageId = await sendDialog360TemplateMessageApi(
              ctx,
              contact.phoneNumber,
              templateName,
              templateLanguage,
              apiKey,
              templateParams,
              hasMediaHeader
                ? (template.headerType as "image" | "video" | "document")
                : undefined,
              hasMediaHeader ? headerMediaUrl : undefined
            )
          } else if (provider === "twilio") {
            // Send via Twilio Content Template

            // ✅ IMPORTANT: Variable mapping for Twilio campaigns
            // Determine variable mapping based on media presence
            // This MUST match the logic in twilioActions.ts:createContentTemplate
            //
            // - hasMedia: Template schema has headerType = image/video/document
            // - isDynamicMedia: Template uses {{1}} placeholder for media (not a static URL)
            // - baseIndex: Starting index for body variables
            //   * If isDynamicMedia = true: {{1}} is media URL, body starts at {{2}} (baseIndex = 2)
            //   * If isDynamicMedia = false: No media variable, body starts at {{1}} (baseIndex = 1)
            const hasMedia =
              template.headerType === "image" ||
              template.headerType === "video" ||
              template.headerType === "document"
            const isDynamicMedia = hasMedia && template.hasDynamicMedia
            const baseIndex = isDynamicMedia ? 2 : 1

            // Convert parameters to Twilio format: { "1": "value1", "2": "value2" }
            const contentVariables: Record<string, string> = {}

            // If media exists AND is dynamic, pass the headerMediaUrl as variable "1"
            if (isDynamicMedia && headerMediaUrl) {
              contentVariables["1"] = headerMediaUrl
            }

            if (templateParams) {
              templateParams.forEach((param, index) => {
                contentVariables[`${index + baseIndex}`] = param
              })
            }

            console.log(
              `[BulkMessaging] Sending Twilio Content Template ${template.whatsappTemplateId} to ${contact.phoneNumber}`
            )

            // ✅ FIX: Validate contentSid exists before sending
            if (!template.whatsappTemplateId) {
              throw new Error(
                `Template "${template.name}" missing whatsappTemplateId (Twilio Content SID)`
              )
            }

            // ✅ FIX: Validate Twilio credentials exist
            const { accountSid, authToken, fromNumber } =
              validateTwilioConfig(whatsappConfig)

            whatsappMessageId = await ctx.runAction(
              internal.actions.twilioActions.sendTwilioContentTemplateMessage,
              {
                twilioAccountSid: accountSid,
                twilioAuthToken: authToken,
                from: fromNumber,
                to: contact.phoneNumber,
                contentSid: template.whatsappTemplateId,
                contentVariables,
              }
            )
          } else {
            // Send via Meta
            // Determine header type from template
            const headerMediaType: "image" | "video" | "document" | undefined =
              template.headerType === "video"
                ? "video"
                : template.headerType === "document"
                  ? "document"
                  : template.headerType === "image"
                    ? "image"
                    : undefined

            // Prepare flow buttons if template has any
            // Flow buttons require a unique flow_token for each message
            let flowButtons:
              | Array<{
                  index: number
                  flowToken: string
                  flowActionPayload?: string
                }>
              | undefined

            if (template.links && template.links.length > 0) {
              // Filter only flow buttons and calculate their correct index
              // The index must match the button's position in Meta's template (0-based)
              // We need to count ALL buttons (url, phone, quick_reply, flow) to get the correct index
              let buttonIndex = 0
              const flowButtonsWithIndex: Array<{
                link: (typeof template.links)[0]
                buttonIndex: number
              }> = []

              for (const link of template.links) {
                if (link.type === "flow") {
                  flowButtonsWithIndex.push({ link, buttonIndex })
                }
                // Increment index for all button types (url, phone, quick_reply, flow)
                // as they all count towards the button index in Meta's template
                buttonIndex++
              }

              if (flowButtonsWithIndex.length > 0) {
                // Generate unique flow_token for each flow button
                // The flow_token should be unique per message to track the interaction
                flowButtons = flowButtonsWithIndex.map((item) => ({
                  index: item.buttonIndex,
                  // Generate a unique token combining campaign, recipient, and timestamp
                  flowToken: `${args.campaignId}_${recipient._id}_${Date.now()}_${item.buttonIndex}`,
                }))
              }
            }

            const { phoneNumberId, accessToken } =
              validateMetaConfig(whatsappConfig)
            whatsappMessageId = await sendTemplateMessage(
              ctx,
              contact.phoneNumber,
              templateName,
              templateLanguage,
              phoneNumberId,
              accessToken,
              templateParams,
              headerMediaId, // Pass header media ID if available
              headerMediaId ? headerMediaType : undefined, // Pass header type only if we have media
              undefined, // buttonUrlParams - not used for now
              flowButtons // Pass flow buttons if any
            )
          }
        } else {
          // Fallback to regular text message (for non-Meta templates)
          if (provider === "360dialog") {
            const { apiKey } = validate360DialogConfig(whatsappConfig)
            whatsappMessageId = await sendDialog360Message(
              ctx,
              contact.phoneNumber,
              recipient.personalizedContent || "",
              apiKey
            )
          } else if (provider === "twilio") {
            // ✅ FIX: Validate Twilio credentials exist
            const { accountSid, authToken, fromNumber } =
              validateTwilioConfig(whatsappConfig)

            // Send regular text via Twilio Action
            whatsappMessageId =
              (await ctx.runAction(
                internal.actions.twilioActions.sendTwilioWhatsAppMessage,
                {
                  twilioAccountSid: accountSid,
                  twilioAuthToken: authToken,
                  from: fromNumber,
                  to: contact.phoneNumber,
                  body: recipient.personalizedContent || "",
                }
              )) ?? undefined
          } else {
            const { phoneNumberId, accessToken } =
              validateMetaConfig(whatsappConfig)
            whatsappMessageId = await sendMetaWhatsAppMessage(
              ctx,
              contact.phoneNumber,
              recipient.personalizedContent || "",
              phoneNumberId,
              accessToken
            )
          }
        }

        // Update recipient status
        await ctx.runMutation(
          internal.system.bulkMessaging.updateRecipientStatus,
          {
            recipientId: recipient._id,
            status: "sent",
            sentAt: Date.now(),
            whatsappMessageId,
          }
        )

        sentCount++

        // Small delay between messages to respect rate limits
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 / MESSAGES_PER_SECOND)
        )
      } catch (error) {
        console.error(
          `[BulkMessaging] Error sending to recipient ${recipient._id}:`,
          getSafeErrorDetails(error)
        )

        const errorMessage =
          error instanceof Error ? error.message : "Error desconocido"
        const newRetryCount = recipient.retryCount + 1

        if (newRetryCount >= MAX_RETRIES) {
          await ctx.runMutation(
            internal.system.bulkMessaging.updateRecipientStatus,
            {
              recipientId: recipient._id,
              status: "failed",
              errorMessage,
            }
          )
          failedCount++
        } else {
          // Mark for retry
          await ctx.runMutation(
            internal.system.bulkMessaging.incrementRetryCount,
            {
              recipientId: recipient._id,
              errorMessage,
            }
          )
        }
      }
    }

    // Update campaign statistics
    await ctx.runMutation(internal.system.bulkMessaging.updateCampaignStats, {
      campaignId: args.campaignId,
      sentDelta: sentCount,
      failedDelta: failedCount,
    })

    // Schedule next batch
    await ctx.scheduler.runAfter(
      BATCH_DELAY_MS,
      internal.system.bulkMessaging.processCampaignBatch,
      {
        campaignId: args.campaignId,
        whatsappConfigId: args.whatsappConfigId,
        batchNumber: args.batchNumber + 1,
      }
    )
  },
})

// Internal queries for the action
export const getCampaign = internalQuery({
  args: { campaignId: v.id("messageCampaigns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.campaignId)
  },
})

export const getTemplate = internalQuery({
  args: { templateId: v.id("messageTemplates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.templateId)
  },
})

export const getWhatsAppConfig = internalQuery({
  args: { configId: v.id("whatsappConfigurations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.configId)
  },
})

export const getContact = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.contactId)
  },
})

export const getPendingRecipients = internalQuery({
  args: {
    campaignId: v.id("messageCampaigns"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("campaignRecipients")
      .withIndex("by_campaign_and_status", (q) =>
        q.eq("campaignId", args.campaignId).eq("status", "pending")
      )
      .take(args.limit)
  },
})

export const updateRecipientStatus = internalMutation({
  args: {
    recipientId: v.id("campaignRecipients"),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("read"),
      v.literal("failed")
    ),
    sentAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    readAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    whatsappMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { recipientId, ...updates } = args
    await ctx.db.patch(recipientId, updates)
  },
})

export const incrementRetryCount = internalMutation({
  args: {
    recipientId: v.id("campaignRecipients"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const recipient = await ctx.db.get(args.recipientId)
    if (recipient) {
      await ctx.db.patch(args.recipientId, {
        retryCount: recipient.retryCount + 1,
        errorMessage: args.errorMessage,
      })
    }
  },
})

export const updateCampaignStats = internalMutation({
  args: {
    campaignId: v.id("messageCampaigns"),
    sentDelta: v.number(),
    failedDelta: v.number(),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId)
    if (campaign) {
      await ctx.db.patch(args.campaignId, {
        sentCount: campaign.sentCount + args.sentDelta,
        failedCount: campaign.failedCount + args.failedDelta,
      })
    }
  },
})

export const updateCampaignStatsAtomic = internalMutation({
  args: {
    campaignId: v.id("messageCampaigns"),
    deltas: v.object({
      sentCount: v.optional(v.number()),
      deliveredCount: v.optional(v.number()),
      readCount: v.optional(v.number()),
      failedCount: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign) {
      console.error(`❌ [CAMPAIGN STATS] Campaign ${args.campaignId} not found`)
      return
    }

    // Build atomic update object with Math.max guards
    const updates: any = {}

    if (args.deltas.sentCount !== undefined) {
      updates.sentCount = Math.max(
        0,
        (campaign.sentCount || 0) + args.deltas.sentCount
      )
    }
    if (args.deltas.deliveredCount !== undefined) {
      updates.deliveredCount = Math.max(
        0,
        (campaign.deliveredCount || 0) + args.deltas.deliveredCount
      )
    }
    if (args.deltas.readCount !== undefined) {
      updates.readCount = Math.max(
        0,
        (campaign.readCount || 0) + args.deltas.readCount
      )
    }
    if (args.deltas.failedCount !== undefined) {
      updates.failedCount = Math.max(
        0,
        (campaign.failedCount || 0) + args.deltas.failedCount
      )
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.campaignId, updates)
    }
  },
})

export const updateCampaignStatus = internalMutation({
  args: {
    campaignId: v.id("messageCampaigns"),
    status: v.union(
      v.literal("draft"),
      v.literal("scheduled"),
      v.literal("sending"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.campaignId, { status: args.status })
  },
})

export const completeCampaign = internalMutation({
  args: { campaignId: v.id("messageCampaigns") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.campaignId, {
      status: "completed",
      completedAt: Date.now(),
    })
  },
})

// Helper function to get filtered contacts
async function getFilteredContacts(
  ctx: MutationCtx,
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
): Promise<Doc<"contacts">[]> {
  // Get all contacts first
  const allContacts = await ctx.db
    .query("contacts")
    .withIndex("by_organization_id", (q) =>
      q.eq("organizationId", organizationId)
    )
    .collect()

  // Filter out blocked contacts
  let filteredContacts = allContacts.filter((c) => !c.isBlocked)

  // If no filters or allContacts is true, return all non-blocked contacts
  if (!filters || filters.allContacts) {
    return filteredContacts
  }

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
  }

  // Optimization: If no contacts left after basic filtering, return empty
  if (filteredContacts.length === 0) {
    return []
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

  return filteredContacts
}

// Helper function to personalize message content
function personalizeMessage(
  template: string,
  contact: Doc<"contacts">
): string {
  let message = template

  // Replace common variables
  const variables: Record<string, string> = {
    nombre: contact.displayName || "Cliente",
    telefono: contact.phoneNumber || "",
  }

  for (const [key, value] of Object.entries(variables)) {
    message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value)
  }

  return message
}

/**
 * Helper function to extract template parameters for Meta API.
 * Meta templates use {{1}}, {{2}}, etc. for positional parameters.
 *
 * This function uses the stored variable names from the template to properly
 * map contact data to the correct positional parameters.
 *
 * @param templateContent - The template content with {{1}}, {{2}} placeholders
 * @param templateVariables - Array of variable names stored with the template (e.g., ["nombre", "telefono"])
 * @param contact - The contact to extract values from
 * @returns JSON string of parameter values, or undefined if no positional params
 */
function extractTemplateParams(
  templateContent: string,
  templateVariables: string[],
  contact: Doc<"contacts">
): string | undefined {
  // Check if template uses positional parameters ({{1}}, {{2}}, etc.)
  const positionalRegex = /\{\{(\d+)\}\}/g
  const positionalMatches = templateContent.match(positionalRegex)

  if (!positionalMatches || positionalMatches.length === 0) {
    return undefined
  }

  // Available contact data for variable substitution
  const contactData: Record<string, string> = {
    nombre: contact.displayName || "Cliente",
    name: contact.displayName || "Cliente",
    telefono: contact.phoneNumber || "",
    phone: contact.phoneNumber || "",
    variable_1: contact.displayName || "Cliente",
    variable_2: contact.phoneNumber || "",
  }

  // Find the maximum position number used in the template
  const maxPosition = Math.max(
    ...positionalMatches.map((m) => parseInt(m.replace(/[{}]/g, ""), 10))
  )

  const params: string[] = []

  for (let i = 1; i <= maxPosition; i++) {
    // Use the stored variable name if available, otherwise use default mapping
    const variableName = templateVariables[i - 1]

    if (variableName && contactData[variableName.toLowerCase()]) {
      params.push(contactData[variableName.toLowerCase()] || "")
    } else if (variableName && contactData[variableName]) {
      params.push(contactData[variableName] || "")
    } else {
      // Fallback to position-based defaults
      const fallbackKey = `variable_${i}`
      params.push(contactData[fallbackKey] || "")
    }
  }

  return JSON.stringify(params)
}

// Mutation to trigger campaign sending (called from private API)
export const sendCampaign = internalMutation({
  args: {
    campaignId: v.id("messageCampaigns"),
  },
  handler: async (ctx, args) => {
    // This just schedules the internal action
    await ctx.scheduler.runAfter(
      0,
      internal.system.bulkMessaging.startCampaign,
      {
        campaignId: args.campaignId,
      }
    )
    return { success: true }
  },
})

// Update recipient status from WhatsApp webhook
export const updateRecipientStatusFromWebhook = internalMutation({
  args: {
    whatsappMessageId: v.string(),
    status: v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("read"),
      v.literal("failed")
    ),
    timestamp: v.number(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find the campaign recipient by WhatsApp message ID
    const recipient = await ctx.db
      .query("campaignRecipients")
      .withIndex("by_whatsapp_message_id", (q) =>
        q.eq("whatsappMessageId", args.whatsappMessageId)
      )
      .first()

    if (!recipient) {
      // Most webhook status updates belong to regular conversations, not campaigns.
      return { updated: false, reason: "not_campaign_message" as const }
    } else {
      console.log(
        `[BulkMessaging] Recipient FOUND: ${recipient._id} (Campaign: ${recipient.campaignId})`
      )
    }

    // Map WhatsApp status to our status
    const statusMap: Record<string, "sent" | "delivered" | "read" | "failed"> =
      {
        sent: "sent",
        delivered: "delivered",
        read: "read",
        failed: "failed",
      }

    const newStatus = statusMap[args.status]
    if (!newStatus) {
      console.warn(
        `[BulkMessaging] Unknown status: ${args.status} for message ${args.whatsappMessageId}`
      )
      return { updated: false }
    }

    // Only update if the new status is "more advanced" than the current one
    const statusOrder = ["pending", "sent", "delivered", "read", "failed"]
    const currentIndex = statusOrder.indexOf(recipient.status)
    const newIndex = statusOrder.indexOf(newStatus)

    // Failed can override any status, otherwise only advance forward
    if (newStatus !== "failed" && newIndex <= currentIndex) {
      return { updated: false }
    }

    // Update the recipient status
    const updateData: {
      status: "sent" | "delivered" | "read" | "failed"
      deliveredAt?: number
      readAt?: number
      errorMessage?: string
    } = {
      status: newStatus,
    }

    if (newStatus === "delivered") {
      updateData.deliveredAt = args.timestamp
    } else if (newStatus === "read") {
      updateData.deliveredAt = recipient.deliveredAt || args.timestamp
      updateData.readAt = args.timestamp
    } else if (newStatus === "failed" && args.errorMessage) {
      updateData.errorMessage = args.errorMessage
    }

    await ctx.db.patch(recipient._id, updateData)

    // Update campaign statistics
    const campaign = await ctx.db.get(recipient.campaignId)
    if (campaign) {
      if (newStatus === "delivered" && recipient.status !== "delivered") {
        await ctx.db.patch(campaign._id, {
          deliveredCount: campaign.deliveredCount + 1,
        })
      } else if (newStatus === "read" && recipient.status !== "read") {
        // Update readCount when message is read
        // Also update deliveredCount if it wasn't already delivered
        const updates: { readCount: number; deliveredCount?: number } = {
          readCount: campaign.readCount + 1,
        }
        if (recipient.status !== "delivered") {
          updates.deliveredCount = campaign.deliveredCount + 1
        }
        await ctx.db.patch(campaign._id, updates)
      } else if (newStatus === "failed" && recipient.status !== "failed") {
        await ctx.db.patch(campaign._id, {
          failedCount: campaign.failedCount + 1,
          // Decrement sent count if it was previously sent
          sentCount:
            recipient.status === "sent"
              ? campaign.sentCount - 1
              : campaign.sentCount,
        })
      }
    }

    console.log(
      `[BulkMessaging] Updated recipient ${recipient._id} status to ${newStatus}${args.errorMessage ? ` (${args.errorMessage})` : ""}`
    )

    return { updated: true, newStatus }
  },
})
