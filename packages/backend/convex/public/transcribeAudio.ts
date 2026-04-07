import { R2 } from "@convex-dev/r2"
import { ConvexError, v } from "convex/values"
import { components } from "../_generated/api"
import { action } from "../_generated/server"
import { env } from "../lib/env"
import { generateR2Key } from "../model/whatsapp"
import { transcribeAudioFileUrl } from "./files"

export const transcribeAudio = action({
  args: {
    audioData: v.bytes(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "No autenticado",
      })
    }

    const supportedFormats = [
      "audio/webm",
      "audio/mp3",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/m4a",
      "audio/mp4",
    ]

    if (!supportedFormats.includes(args.mimeType.toLowerCase())) {
      throw new ConvexError({
        code: "INVALID_FORMAT",
        message:
          "Formato de audio no soportado. Use WebM, MP3, WAV, OGG o M4A.",
      })
    }

    const r2 = new R2(components.r2)
    const storageKey = generateR2Key(args.mimeType)

    try {
      const blob = new Blob([args.audioData], { type: args.mimeType })
      await r2.store(ctx, blob, {
        type: args.mimeType,
        key: storageKey,
      })

      const audioUrl = `${env.R2_PUBLIC_URL}/${storageKey}`
      const transcription = await transcribeAudioFileUrl(audioUrl)

      return {
        success: true,
        transcription,
      }
    } catch (error) {
      if (error instanceof ConvexError) {
        throw error
      }

      console.error("[TRANSCRIBE] Error transcribing audio:", error)
      throw new ConvexError({
        code: "TRANSCRIPTION_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Error al transcribir el audio",
      })
    }
  },
})
