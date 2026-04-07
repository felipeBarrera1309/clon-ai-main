import { openai } from "@ai-sdk/openai"
import { R2 } from "@convex-dev/r2"
import { generateText } from "ai"
import { ConvexError, v } from "convex/values"
import OpenAI, { toFile } from "openai"
import { components, internal } from "../_generated/api"
import { action, mutation } from "../_generated/server"
import { generateR2Key } from "../model/whatsapp"

export const uploadFile = action({
  args: {
    file: v.bytes(),
    fileType: v.union(v.literal("audio"), v.literal("image")),
    contentType: v.string(),
    messageId: v.string(),
    organizationId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify the user has permission to upload files
    const contact = await ctx.runQuery(
      internal.system.contacts.getOneByPhoneNumber,
      {
        organizationId: args.organizationId,
        phoneNumber: args.phoneNumber,
      }
    )

    if (!contact || contact.isBlocked) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Sesión inválida",
      })
    }

    // Validate image format for OpenAI compatibility
    if (args.fileType === "image") {
      const mimeType = args.contentType
      const supportedFormats = [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/gif",
        "image/webp",
      ]

      if (!supportedFormats.includes(mimeType.toLowerCase())) {
        throw new ConvexError({
          code: "INVALID_FORMAT",
          message: "Formato de imagen no soportado. Use PNG, JPEG, GIF o WebP.",
        })
      }
    }

    const r2 = new R2(components.r2)
    const mimeType = args.contentType
    const storageKey = generateR2Key(mimeType)

    const blob = new Blob([args.file], { type: mimeType })

    const fileStorageId = await r2.store(ctx, blob, {
      type: mimeType,
      key: storageKey,
    })

    // Create attachment record
    await ctx.runMutation(internal.system.messageAttachments.create, {
      messageId: args.messageId,
      organizationId: contact.organizationId,
      fileStorageId: storageKey, // Use the R2 key here too
      fileType: args.fileType,
      fileName: `${args.fileType}-${Date.now()}`,
      fileSize: args.file.byteLength,
      mimeType: mimeType,
    })

    return storageKey
  },
})

// Generate upload URL for widget file uploads
export const generateWidgetUploadUrl = mutation({
  args: {
    organizationId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify the user has permission to upload files
    const contact = await ctx.runQuery(
      internal.system.contacts.getOneByPhoneNumber,
      {
        organizationId: args.organizationId,
        phoneNumber: args.phoneNumber,
      }
    )

    if (!contact || contact.isBlocked) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Sesión inválida",
      })
    }

    // Generate upload URL
    return await ctx.storage.generateUploadUrl()
  },
})

// Complete widget file upload after successful upload to storage URL
export const completeWidgetUpload = mutation({
  args: {
    storageId: v.string(),
    fileType: v.union(v.literal("audio"), v.literal("image")),
    organizationId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify the user has permission to upload files
    const contact = await ctx.runQuery(
      internal.system.contacts.getOneByPhoneNumber,
      {
        organizationId: args.organizationId,
        phoneNumber: args.phoneNumber,
      }
    )

    if (!contact || contact.isBlocked) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Sesión inválida",
      })
    }

    // Return the storage ID (simulates WhatsApp media upload)
    return args.storageId
  },
})

// Generate upload URL for operator file uploads (authenticated)
export const generateOperatorUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    // Verify authentication
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "No autenticado",
      })
    }

    // Generate upload URL
    return await ctx.storage.generateUploadUrl()
  },
})

// Action for operators to upload files directly to R2
export const uploadOperatorFile = action({
  args: {
    file: v.bytes(),
    fileType: v.union(v.literal("audio"), v.literal("image")),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify authentication
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "No autenticado",
      })
    }

    // Validate image format for OpenAI compatibility (if it's an image)
    if (args.fileType === "image") {
      const mimeType = args.contentType
      const supportedFormats = [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/gif",
        "image/webp",
      ]

      if (!supportedFormats.includes(mimeType.toLowerCase())) {
        throw new ConvexError({
          code: "INVALID_FORMAT",
          message: "Formato de imagen no soportado. Use PNG, JPEG, GIF o WebP.",
        })
      }
    }

    const r2 = new R2(components.r2)
    const mimeType = args.contentType
    const storageKey = generateR2Key(mimeType)

    const blob = new Blob([args.file], { type: mimeType })

    const fileStorageId = await r2.store(ctx, blob, {
      type: mimeType,
      key: storageKey,
    })
    console.log(
      `✅ [UPLOAD OPERATOR FILE] Stored in R2 with key: ${storageKey} (Convex ID: ${fileStorageId})`
    )

    return storageKey
  },
})

// Transcription using OpenAI SDK directly
// NOTE: No se usa el AI SDK (experimental_transcribe) porque siempre agrega
// response_format: 'verbose_json' y timestamp_granularities: 'segment' que
// causan que Whisper rechace archivos OGG/OPUS de WhatsApp con error 400.
export async function transcribeAudioFileUrl(
  audioUrl: string
): Promise<string> {
  try {
    // Download the audio bytes from R2
    console.log("🎵 [TRANSCRIBE] Fetching audio from:", audioUrl)
    const fetchResponse = await fetch(audioUrl)
    if (!fetchResponse.ok) {
      throw new Error(
        `Failed to fetch audio: ${fetchResponse.status} ${fetchResponse.statusText}`
      )
    }

    const contentType = fetchResponse.headers.get("content-type")
    console.log("🎵 [TRANSCRIBE] Response content-type:", contentType)

    const audioBuffer = await fetchResponse.arrayBuffer()
    console.log("🎵 [TRANSCRIBE] Audio size:", audioBuffer.byteLength, "bytes")

    // Validate audio data - check if it's actually binary audio or an error page
    const headerBytes = new Uint8Array(audioBuffer.slice(0, 4))
    const headerStr = String.fromCharCode(...headerBytes)
    console.log(
      "🎵 [TRANSCRIBE] First 4 bytes:",
      Array.from(headerBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" "),
      `("${headerStr}")`
    )

    // OGG files start with "OggS", check if it's a valid audio format
    if (headerStr.startsWith("<") || headerStr.startsWith("{")) {
      const textContent = new TextDecoder().decode(audioBuffer.slice(0, 200))
      console.error(
        "🎵 [TRANSCRIBE] ERROR: R2 returned text instead of audio:",
        textContent
      )
      return "[Error al transcribir audio: el archivo descargado no es audio válido]"
    }

    // Use OpenAI SDK directly — toFile() handles OGG/OPUS properly
    const openaiClient = new OpenAI()
    const audioFile = await toFile(audioBuffer, "audio.ogg", {
      type: "audio/ogg",
    })

    const result = await openaiClient.audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
      language: "es",
    })

    console.log("🎵 [TRANSCRIBE] Success:", result.text?.slice(0, 80))
    return result.text || "[No se pudo transcribir el audio]"
  } catch (error) {
    console.error("🎵 [TRANSCRIBE] Unexpected error:", error)

    if (error instanceof Error) {
      console.error("🎵 [TRANSCRIBE] Error details:", error.message)
      return `[Error al transcribir audio: ${error.message}]`
    }

    return "[Error al transcribir audio]"
  }
}

// AI SDK image analysis function
export async function analyzeImageUrl(imageUrl: string): Promise<string> {
  try {
    // Use OpenAI gpt-4o-mini vision (gateway xai model doesn't support image input)
    const response = await generateText({
      model: openai("gpt-4o-mini"),
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente que analiza imágenes enviadas por clientes de restaurantes. Describe de manera detallada y útil lo que ves en la imagen, especialmente si está relacionado con comida, productos del restaurante, ubicaciones de entrega, o cualquier información relevante para el servicio al cliente. Responde siempre en español.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe detalladamente lo que ves en esta imagen:",
            },
            {
              type: "image",
              image: new URL(imageUrl),
            },
          ],
        },
      ],
    })

    return response.text || "[No se pudo analizar la imagen]"
  } catch (error) {
    console.error("🖼️ [AI SDK IMAGE ANALYSIS] Unexpected error:", error)

    if (error instanceof Error) {
      console.error("🖼️ [AI SDK IMAGE ANALYSIS] Error details:", error.message)
      return `[Error al analizar imagen: ${error.message}]`
    }

    return "[Error al analizar imagen]"
  }
}
