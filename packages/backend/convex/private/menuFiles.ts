import { R2 } from "@convex-dev/r2"
import { v } from "convex/values"
import { components, internal } from "../_generated/api"
import { internalQuery } from "../_generated/server"
import { env } from "../lib/env"
import { authAction, authMutation, authQuery } from "../lib/helpers"
import {
  getRestaurantConfigForOrg,
  upsertRestaurantConfigForOrg,
} from "../model/config"
import { generateR2Key } from "../model/whatsapp"

// Internal query to get current menu PDF config (safe to use from action)
export const getMenuPdfConfig = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    return await getRestaurantConfigForOrg(ctx, args.organizationId)
  },
})

// Action for uploading menu files directly to R2
export const uploadMenuFile = authAction({
  args: {
    organizationId: v.string(),
    file: v.bytes(),
    fileType: v.union(v.literal("image"), v.literal("pdf")),
    contentType: v.string(),
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const r2 = new R2(components.r2)
    const mimeType = args.contentType

    // Logic to delete previous PDF if exists and we are uploading a new PDF
    // Note: R2 component may not have a delete method, so we just log for now
    // Files will be overwritten with new timestamp-based names
    if (args.fileType === "pdf") {
      const config = await ctx.runQuery(
        internal.private.menuFiles.getMenuPdfConfig,
        {
          organizationId: args.organizationId,
        }
      )

      if (config?.menuPdf) {
        console.log(
          `� [MENU] Replacing old PDF: ${config.menuPdf} with new upload`
        )
      }
    }

    let storageKey: string

    if (args.fileName) {
      console.log(
        `📁 [MENU UPLOAD] Processing file with name: "${args.fileName}"`
      )

      // Generate storage key with original filename but ensure uniqueness
      // Format: files/{orgId}/{sanitizedFileName}_{timestamp}.{extension}
      const timestamp = Date.now()

      // Extract extension properly
      const lastDotIndex = args.fileName.lastIndexOf(".")
      let nameWithoutExt = args.fileName
      let extension = ""

      if (lastDotIndex > 0) {
        nameWithoutExt = args.fileName.substring(0, lastDotIndex)
        extension = args.fileName.substring(lastDotIndex)
      }

      console.log(`  - Name without extension: "${nameWithoutExt}"`)
      console.log(`  - Extension: "${extension}"`)

      // Sanitize name: replace spaces with underscores, remove special chars but keep alphanumerics
      // We want to be permissive but safe for URLs
      const safeName = nameWithoutExt
        .replace(/\s+/g, "_") // Replace spaces with underscores
        .replace(/[^a-zA-Z0-9\-_]/g, "") // Remove non-alphanumeric chars (except - and _)

      console.log(`  - Sanitized name: "${safeName}"`)

      // Should name be empty after sanitization (e.g. only special chars), fall back to "file"
      const finalName = safeName || "file"
      const finalFileName = `${finalName}_${timestamp}${extension}`

      console.log(`  - Final filename: "${finalFileName}"`)

      // Define folder based on type
      const folder = args.fileType === "image" ? "images" : "files"

      // We use orgId folder to prevent collisions between tenants
      storageKey = `${folder}/${args.organizationId}/${finalFileName}`
    } else {
      console.log(`⚠️ [MENU UPLOAD] No fileName provided, using random key`)
      // Fallback to random key if fileName is not provided
      storageKey = generateR2Key(mimeType)
    }

    const blob = new Blob([args.file], { type: mimeType })

    await r2.store(ctx, blob, {
      type: mimeType,
      key: storageKey,
    })

    console.log(`✅ [MENU] Uploaded new file to R2: ${storageKey}`)

    return storageKey
  },
})

// Mutation to generate upload URL for menu files (Legacy/Fallback)
export const generateMenuFileUploadUrl = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.storage.generateUploadUrl()
  },
})

// Mutation to save menu image reference
export const saveMenuImage = authMutation({
  args: {
    organizationId: v.string(),
    storageId: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await getRestaurantConfigForOrg(ctx, args.organizationId)

    // Clean up PDF and URL when uploading images
    if (config?.menuPdf) {
      try {
        if (!config.menuPdf.includes("/")) {
          await ctx.storage.delete(config.menuPdf as any)
        }
        console.log("Deleted old PDF from Convex when uploading images")
      } catch (error) {
        console.log(`Old PDF ${config.menuPdf} not found, continuing...`)
      }
    }

    const currentImages = (config?.menuImages || []) as string[]
    const updatedImages = [...currentImages, args.storageId]

    await upsertRestaurantConfigForOrg(ctx, args.organizationId, {
      menuImages: updatedImages,
      menuPdf: undefined, // Clear PDF
      menuUrl: "", // Clear URL
      menuType: "images", // Set type to images
    })

    return { success: true, storageId: args.storageId }
  },
})

// Mutation to save menu PDF reference
export const saveMenuPdf = authMutation({
  args: {
    organizationId: v.string(),
    storageId: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await getRestaurantConfigForOrg(ctx, args.organizationId)

    // Delete old PDF if exists
    if (config?.menuPdf) {
      try {
        if (!config.menuPdf.includes("/")) {
          await ctx.storage.delete(config.menuPdf as any)
        }
      } catch (error) {
        // Ignore error if file doesn't exist (already deleted or stale reference)
        console.log(
          `Old PDF ${config.menuPdf} not found in storage, continuing...`
        )
      }
    }

    // Delete all images when uploading PDF
    if (config?.menuImages && Array.isArray(config.menuImages)) {
      for (const imageId of config.menuImages as string[]) {
        try {
          if (!imageId.includes("/")) {
            await ctx.storage.delete(imageId as any)
          }
          console.log(`Deleted image ${imageId} from Convex when uploading PDF`)
        } catch (error) {
          console.log(`Image ${imageId} not found, continuing...`)
        }
      }
    }

    await upsertRestaurantConfigForOrg(ctx, args.organizationId, {
      menuPdf: args.storageId,
      menuImages: [], // Clear images
      menuUrl: "", // Clear URL
      menuType: "pdf", // Set type to PDF
    })

    return { success: true, storageId: args.storageId }
  },
})

// Mutation to delete menu image
export const deleteMenuImage = authMutation({
  args: {
    organizationId: v.string(),
    storageId: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(`🗑️ [MENU DELETE IMAGE] Deleting image: ${args.storageId}`)

    const config = await getRestaurantConfigForOrg(ctx, args.organizationId)

    if (!config?.menuImages) {
      console.log(`⚠️ [MENU DELETE IMAGE] No menu images found in config`)
      return { success: false, error: "No menu images found" }
    }

    // Delete from storage (R2 or Convex Native)
    if (args.storageId.includes("/")) {
      // It's an R2 file - R2 component typically doesn't have delete
      // We'll just remove the reference from DB
      console.log(
        `📦 [MENU DELETE IMAGE] R2 file detected, removing DB reference only`
      )
    } else {
      // Legacy Convex storage
      try {
        await ctx.storage.delete(args.storageId as any)
        console.log(`✅ [MENU DELETE IMAGE] Deleted from Convex storage`)
      } catch (error) {
        console.error(
          `❌ [MENU DELETE IMAGE] Failed to delete from Convex storage:`,
          error
        )
      }
    }

    // Update config to remove the reference
    const updatedImages = (config.menuImages as string[]).filter(
      (id) => id !== args.storageId
    )

    await upsertRestaurantConfigForOrg(ctx, args.organizationId, {
      menuImages: updatedImages,
    })

    return { success: true }
  },
})

// Mutation to delete menu PDF
export const deleteMenuPdf = authMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(
      `🗑️ [MENU DELETE] Starting PDF deletion for org: ${args.organizationId}`
    )

    const config = await getRestaurantConfigForOrg(ctx, args.organizationId)

    if (!config?.menuPdf) {
      console.log(`⚠️ [MENU DELETE] No menu PDF found in config`)
      return { success: false, error: "No menu PDF found" }
    }

    console.log(`📄 [MENU DELETE] Found PDF to delete: ${config.menuPdf}`)

    // Delete from storage (R2 or Convex Native)
    if (config.menuPdf.includes("/")) {
      // It's an R2 file - R2 component typically doesn't have delete
      // We'll just remove the reference from DB
      console.log(
        `📦 [MENU DELETE] R2 file detected, removing DB reference only`
      )
    } else {
      // Legacy Convex storage
      try {
        await ctx.storage.delete(config.menuPdf as any)
        console.log(`✅ [MENU DELETE] Deleted from Convex storage`)
      } catch (error) {
        console.error(
          `❌ [MENU DELETE] Failed to delete from Convex storage:`,
          error
        )
      }
    }

    // Update config to remove the reference - THIS IS THE KEY PART
    await upsertRestaurantConfigForOrg(ctx, args.organizationId, {
      menuPdf: undefined,
      menuType: "url", // Fallback to URL or empty
    })

    console.log(`✅ [MENU DELETE] PDF reference removed from database`)

    return { success: true }
  },
})

// Query to get menu file URLs
export const getMenuFileUrls = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await getRestaurantConfigForOrg(ctx, args.organizationId)
    const urls: {
      images: Array<{ id: string; url: string }>
      pdf: { id: string; url: string } | null
    } = {
      images: [],
      pdf: null,
    }

    if (config?.menuImages && Array.isArray(config.menuImages)) {
      for (const imageId of config.menuImages as string[]) {
        if (imageId.includes("/")) {
          urls.images.push({
            id: imageId,
            url: `${env.R2_PUBLIC_URL}/${imageId}`,
          })
          continue
        }
        const url = await ctx.storage.getUrl(imageId as any)
        if (url) {
          urls.images.push({ id: imageId, url })
        }
      }
    }

    if (config?.menuPdf) {
      if (config.menuPdf.includes("/")) {
        urls.pdf = {
          id: config.menuPdf,
          url: `${env.R2_PUBLIC_URL}/${config.menuPdf}`,
        }
      } else {
        const url = await ctx.storage.getUrl(config.menuPdf as any)
        if (url) {
          urls.pdf = { id: config.menuPdf, url }
        }
      }
    }

    return urls
  },
})
