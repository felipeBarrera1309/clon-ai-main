"use node"

import { v } from "convex/values"
import { internalAction } from "../_generated/server"

const MAX_TWILIO_LENGTH = 1600

const splitTwilioMessage = (text: string): string[] => {
  const trimmedText = text.trim()
  if (!trimmedText) {
    return []
  }

  if (trimmedText.length <= MAX_TWILIO_LENGTH) {
    return [trimmedText]
  }

  const parts: string[] = []
  let currentPart = ""
  const lines = trimmedText.split("\n")

  for (const line of lines) {
    const candidate = currentPart ? `${currentPart}\n${line}` : line
    if (candidate.length <= MAX_TWILIO_LENGTH) {
      currentPart = candidate
      continue
    }

    if (currentPart) {
      parts.push(currentPart)
      currentPart = ""
    }

    if (line.length <= MAX_TWILIO_LENGTH) {
      currentPart = line
      continue
    }

    const words = line.split(" ")
    for (const word of words) {
      if (word.length > MAX_TWILIO_LENGTH) {
        if (currentPart) {
          parts.push(currentPart)
          currentPart = ""
        }

        for (let i = 0; i < word.length; i += MAX_TWILIO_LENGTH) {
          parts.push(word.slice(i, i + MAX_TWILIO_LENGTH))
        }
        continue
      }

      const wordCandidate = currentPart ? `${currentPart} ${word}` : word
      if (wordCandidate.length <= MAX_TWILIO_LENGTH) {
        currentPart = wordCandidate
      } else {
        if (currentPart) {
          parts.push(currentPart)
        }
        currentPart = word
      }
    }
  }

  if (currentPart) {
    parts.push(currentPart)
  }

  return parts
}

/**
 * Helper to initialize Twilio client and send message
 */
const sendMessage = async (
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body?: string,
  mediaUrl?: string
) => {
  const twilio = require("twilio")
  const client = twilio(accountSid, authToken)

  // Ensure phone numbers have whatsapp: prefix
  const formatNumber = (num: string) =>
    num.startsWith("whatsapp:") ? num : `whatsapp:${num}`

  const fromNumber = formatNumber(from)
  const toNumber = formatNumber(to)

  console.log(
    `📱 [Twilio] Sending ${mediaUrl ? "media" : "text"} message from ${fromNumber} to ${toNumber}`
  )
  if (mediaUrl) {
    console.log(`📎 [Twilio] Media URL: ${mediaUrl.substring(0, 100)}...`)
  }
  if (body) {
    console.log(`💬 [Twilio] Body: ${body}`)
  }

  try {
    const chunks = body ? splitTwilioMessage(body) : []
    const shouldSendBody = chunks.length > 0
    const messageBodies = shouldSendBody ? chunks : [""]

    if (!shouldSendBody && !mediaUrl) {
      console.log("ℹ️ [Twilio] Empty body and no media, skipping send")
      return null
    }

    let firstMessageSid: string | null = null
    for (let index = 0; index < messageBodies.length; index++) {
      const partBody = messageBodies[index] ?? ""
      const messageOptions: any = {
        from: fromNumber,
        to: toNumber,
        body: partBody,
      }

      if (mediaUrl && index === 0) {
        messageOptions.mediaUrl = [mediaUrl]
        console.log(
          `📎 [Twilio] Adding mediaUrl to message options (first chunk only)`
        )
      }

      console.log(
        `🚀 [Twilio] Sending chunk ${index + 1}/${messageBodies.length} (length=${partBody.length})`
      )
      const message = await client.messages.create(messageOptions)
      if (!firstMessageSid) {
        firstMessageSid = message.sid
      }
    }

    console.log(`✅ [Twilio] Message sent successfully`)
    return firstMessageSid
  } catch (error) {
    console.error(`❌ [Twilio] Error sending message:`, error)
    throw new Error(`Failed to send Twilio message: ${(error as any).message}`)
  }
}

/**
 * Send WhatsApp text message via Twilio
 */
export const sendTwilioWhatsAppMessage = internalAction({
  args: {
    twilioAccountSid: v.string(),
    twilioAuthToken: v.string(),
    from: v.string(),
    to: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    return await sendMessage(
      args.twilioAccountSid,
      args.twilioAuthToken,
      args.from,
      args.to,
      args.body
    )
  },
})

/**
 * Send WhatsApp image message via Twilio
 */
export const sendTwilioWhatsAppImageMessage = internalAction({
  args: {
    twilioAccountSid: v.string(),
    twilioAuthToken: v.string(),
    from: v.string(),
    to: v.string(),
    mediaUrl: v.string(),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await sendMessage(
      args.twilioAccountSid,
      args.twilioAuthToken,
      args.from,
      args.to,
      args.body,
      args.mediaUrl
    )
  },
})

/**
 * Send WhatsApp document message via Twilio
 */
export const sendTwilioWhatsAppDocumentMessage = internalAction({
  args: {
    twilioAccountSid: v.string(),
    twilioAuthToken: v.string(),
    from: v.string(),
    to: v.string(),
    mediaUrl: v.string(),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await sendMessage(
      args.twilioAccountSid,
      args.twilioAuthToken,
      args.from,
      args.to,
      args.body,
      args.mediaUrl
    )
  },
})

/**
 * Send WhatsApp message using Twilio Content Template
 */
export const sendTwilioContentTemplateMessage = internalAction({
  args: {
    twilioAccountSid: v.string(),
    twilioAuthToken: v.string(),
    from: v.string(),
    to: v.string(),
    contentSid: v.string(),
    contentVariables: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const twilio = require("twilio")
    const client = twilio(args.twilioAccountSid, args.twilioAuthToken)

    // Ensure phone numbers have whatsapp: prefix
    const formatNumber = (num: string) =>
      num.startsWith("whatsapp:") ? num : `whatsapp:${num}`

    const fromNumber = formatNumber(args.from)
    const toNumber = formatNumber(args.to)

    console.log(
      `📱 [Twilio Content] Sending template ${args.contentSid} from ${fromNumber} to ${toNumber}`
    )

    try {
      const messageOptions: any = {
        from: fromNumber,
        to: toNumber,
        contentSid: args.contentSid,
      }

      // ✅ FIX: Only add statusCallback if CONVEX_SITE_URL is defined to avoid undefined fields
      if (process.env.CONVEX_SITE_URL) {
        messageOptions.statusCallback = `${process.env.CONVEX_SITE_URL}/twilioPostWebhook`
      }

      if (args.contentVariables) {
        messageOptions.contentVariables = JSON.stringify(args.contentVariables)
      }

      console.log(`🚀 [Twilio Content] Calling Twilio API...`)
      const message = await client.messages.create(messageOptions)

      console.log(`✅ [Twilio Content] Template message sent: ${message.sid}`)
      return message.sid
    } catch (error) {
      console.error(
        `❌ [Twilio Content] Error sending template message:`,
        error
      )
      throw new Error(
        `Failed to send Twilio template message: ${(error as any).message}`
      )
    }
  },
})

/**
 * Create a new Twilio Content Template
 */
export const createContentTemplate = internalAction({
  args: {
    accountSid: v.string(),
    authToken: v.string(),
    name: v.string(),
    language: v.string(),
    category: v.union(
      v.literal("MARKETING"),
      v.literal("UTILITY"),
      v.literal("AUTHENTICATION")
    ),
    content: v.string(),
    variableExamples: v.optional(v.array(v.string())),
    // New args for rich templates
    headerType: v.optional(
      v.union(
        v.literal("text"),
        v.literal("image"),
        v.literal("video"),
        v.literal("document")
      )
    ),
    headerContent: v.optional(v.string()), // URL for media or Text for text header
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
          url: v.optional(v.string()), // For call_to_action/url
          phoneNumber: v.optional(v.string()), // For call_to_action/phone_number
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const twilio = require("twilio")
    const client = twilio(args.accountSid, args.authToken)
    const axios = require("axios")

    console.log(
      `📋 [Twilio Content] Creating template "${args.name}" with rich content`
    )

    const hasMedia =
      args.headerType === "image" ||
      args.headerType === "video" ||
      args.headerType === "document"

    // ✅ IMPORTANT: baseIndex logic for Twilio variable numbering
    // - If template has DYNAMIC media (e.g., {{1}} placeholder), it reserves slot 1 for the media URL
    //   So body variables start at {{2}}, {{3}}, etc. (baseIndex = 2)
    // - If template has NO media or STATIC media (hardcoded URL), no slot is reserved
    //   So body variables start at {{1}}, {{2}}, etc. (baseIndex = 1)
    //
    // NOTE: We use hasMedia here during CREATION because we don't yet know if media will be dynamic
    // During CAMPAIGN SENDING (bulkMessaging.ts), we use isDynamicMedia = hasMedia && template.hasDynamicMedia
    // to determine the actual baseIndex. The hasDynamicMedia flag is set during template creation.
    const baseIndex = hasMedia ? 2 : 1

    // Convert variables from {{variable}} to {{1}} or {{2}}, etc. format
    // ✅ FIX: Handle duplicate variable names correctly - same name should map to same index
    let twilioContent = args.content
    const variablePattern = /\{\{(\w+)\}\}/g
    const matches = [...args.content.matchAll(variablePattern)]

    // Build a map of unique variable names to their indices
    // Duplicate names will share the same index
    // Twilio requires same variable name to map to same index.
    // If users need different values, they must use different variable names.
    const variableIndexMap = new Map<string, number>()
    let currentIndex = baseIndex

    for (const match of matches) {
      const varName = match[1]
      if (!varName) continue
      if (!variableIndexMap.has(varName)) {
        variableIndexMap.set(varName, currentIndex)
        currentIndex++
      }
    }

    // Replace all variables with their assigned indices
    for (const [varName, index] of variableIndexMap.entries()) {
      twilioContent = twilioContent.replaceAll(`{{${varName}}}`, `{{${index}}}`)
    }

    // Build Actions (Buttons)
    const actions: any[] = []
    if (args.buttons && args.buttons.length > 0) {
      args.buttons.forEach((btn) => {
        if (btn.type === "quick_reply") {
          actions.push({
            type: "QUICK_REPLY",
            title: btn.text,
          })
        } else if (btn.type === "call_to_action" || btn.type === "url") {
          actions.push({
            type: "URL",
            title: btn.text,
            url: btn.url,
          })
        } else if (btn.type === "phone_number") {
          actions.push({
            type: "PHONE_NUMBER",
            title: btn.text,
            phone_number: btn.phoneNumber,
          })
        }
      })
    }

    // Build Content Template structure based on Header Type
    const types: any = {}

    if (hasMedia) {
      types["twilio/media"] = {
        body: twilioContent,
        media: ["{{1}}"], // Always make media dynamic for campaign flexibility
        actions: actions.length > 0 ? actions : undefined,
      }
    } else if (actions.length > 0) {
      // Text with buttons
      types["twilio/quick-reply"] = {
        body: twilioContent,
        actions: actions,
      }
      const hasUrlOrPhone = args.buttons?.some(
        (b) =>
          b.type === "url" ||
          b.type === "call_to_action" ||
          b.type === "phone_number"
      )

      if (hasUrlOrPhone) {
        types["twilio/call-to-action"] = {
          body: twilioContent,
          actions: actions,
        }
        Reflect.deleteProperty(types, "twilio/quick-reply")
      }
    } else {
      // Plain text
      types["twilio/text"] = {
        body: twilioContent,
      }
    }

    // Build variables structure for examples
    const variables: Record<string, any> = {}

    // If has media, add media example at {{1}}
    if (hasMedia && args.headerContent) {
      variables["1"] = args.headerContent
    }

    if (args.variableExamples) {
      args.variableExamples.forEach((example, index) => {
        variables[`${index + baseIndex}`] = example
      })
    }

    try {
      // 1. Create Content Template using SDK
      const contentTemplate = await client.content.v1.contents.create({
        friendlyName: args.name,
        language: args.language,
        types,
        ...(Object.keys(variables).length > 0 ? { variables } : {}),
      })

      console.log(
        `✅ [Twilio Content] Template created: ${contentTemplate.sid}`
      )

      let approvalStatus = "pending"

      if (args.category === "MARKETING" || args.category === "UTILITY") {
        try {
          // Create approval request
          // Ensure name follows WhatsApp format: lowercase, alphanumeric, underscores
          const whatsappName = args.name
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, "_")
            .replace(/^_+|_+$/g, "")

          console.log(
            `📨 [Twilio Content] Submitting approval for "${whatsappName}" to WhatsApp`
          )

          // Correct endpoint for WhatsApp approval: /ApprovalRequests/whatsapp
          // Must use JSON
          const response = await axios.post(
            `https://content.twilio.com/v1/Content/${contentTemplate.sid}/ApprovalRequests/whatsapp`,
            {
              name: whatsappName,
              category: args.category, // UPPERCASE is standard for Enum in Content API
            },
            {
              auth: {
                username: args.accountSid,
                password: args.authToken,
              },
              headers: {
                "Content-Type": "application/json",
              },
            }
          )

          const approval = response.data
          console.log(
            `📨 [Twilio Content] Approval request submitted: ${approval.sid}`
          )
          approvalStatus = approval.status || "pending"
        } catch (approvalError) {
          console.warn(
            `⚠️ [Twilio Content] Could not submit for approval via API. Template created as Draft.`,
            (approvalError as any).response?.data ||
              (approvalError as any).message
          )
        }
      }

      return {
        sid: contentTemplate.sid,
        friendly_name: contentTemplate.friendlyName,
        status: approvalStatus,
      }
    } catch (error) {
      console.error(`❌ [Twilio Content] Error creating template:`, error)
      throw new Error(
        `Failed to create Twilio Content Template: ${(error as any).message}`
      )
    }
  },
})

/**
 * Get all Content Templates for a Twilio account
 */
export const listContentTemplates = internalAction({
  args: {
    accountSid: v.string(),
    authToken: v.string(),
  },
  returns: v.array(
    v.object({
      sid: v.string(),
      friendly_name: v.string(),
      language: v.string(),
      status: v.string(),
      types: v.any(),
      variables: v.optional(v.any()), // Added variables field to validator
      approval_requests: v.optional(
        v.object({
          sid: v.string(),
          status: v.string(),
          name: v.string(),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    console.log(
      `📋 [Twilio Content] Fetching all content templates via Raw API`
    )

    try {
      const axios = require("axios")
      const auth = Buffer.from(`${args.accountSid}:${args.authToken}`).toString(
        "base64"
      )
      const headers = { Authorization: `Basic ${auth}` }

      // 1. Fetch All Contents (Raw HTTP to avoid SDK property masking)
      const listResponse = await axios.get(
        "https://content.twilio.com/v1/Content?PageSize=1000",
        { headers }
      )

      const contents = listResponse.data.contents || []

      console.log(
        `✅ [Twilio Content] Found ${contents.length} content templates. Fetching approval statuses...`
      )

      // ✅ FIX: Batch approval requests to avoid overwhelming API with 1000+ concurrent requests
      // Process templates in batches of 10 to be respectful to Twilio API
      const BATCH_SIZE = Number(process.env.TWILIO_BATCH_SIZE ?? 10)
      const templatesWithApproval: any[] = []

      for (let i = 0; i < contents.length; i += BATCH_SIZE) {
        const batch = contents.slice(i, i + BATCH_SIZE)

        const batchResults = await Promise.all(
          batch.map(async (content: any) => {
            // API returns snake_case usually, but let's check both just in case
            const sid = content.sid
            const friendlyName =
              content.friendly_name || content.friendlyName || sid
            const language = content.language || "es"
            const initialStatus = content.status || "draft" // This comes from Content Resource

            let finalStatus = initialStatus
            let approvalData

            try {
              // 3. Fetch Approvals (Raw HTTP)
              const approvalsRes = await axios.get(
                `https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`,
                {
                  headers,
                  timeout: 5000, // 5s timeout
                }
              )

              // FIX: The API returns an object where keys are channels (e.g. { whatsapp: { status: 'approved' } })
              // It does NOT return an array 'approval_requests' in this endpoint version.
              const responseData = approvalsRes.data

              // Direct check for WhatsApp object
              const waApproval = responseData.whatsapp

              if (waApproval) {
                // console.log(`🔍 [${friendlyName}] Found WA approval: ${waApproval.status}`)
                finalStatus = waApproval.status
                approvalData = {
                  sid: waApproval.sid || sid, // Sometimes approval doesn't have distinct SID
                  status: waApproval.status,
                  name: waApproval.name,
                }
              } else {
                // Fallback: Check if there's an 'approval_requests' array (legacy/different endpoint behavior)
                const approvalRequests = responseData.approval_requests || []
                const waLegacy = approvalRequests.find(
                  (r: any) =>
                    r.kind === "whatsapp" ||
                    r.category === "AUTHENTICATION" ||
                    r.category === "MARKETING" ||
                    r.category === "UTILITY"
                )
                if (waLegacy) {
                  finalStatus = waLegacy.status
                  approvalData = {
                    sid: waLegacy.sid,
                    status: waLegacy.status,
                    name: waLegacy.name,
                  }
                }
              }
            } catch (e) {
              // console.warn(`Error fetching approvals for ${sid}: ${(e as any).message}`)
            }

            return {
              sid,
              friendly_name: friendlyName,
              language,
              status: finalStatus,
              types: content.types,
              variables: content.variables,
              approval_requests: approvalData,
            }
          })
        )

        templatesWithApproval.push(...batchResults)

        // Small delay between batches to be respectful to API
        if (i + BATCH_SIZE < contents.length) {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }

      return templatesWithApproval
    } catch (error) {
      console.error(
        `❌ [Twilio Content] Error fetching templates:`,
        (error as any).response?.data || error
      )
      throw new Error(
        `Failed to fetch Twilio Content Templates: ${(error as any).message}`
      )
    }
  },
})
