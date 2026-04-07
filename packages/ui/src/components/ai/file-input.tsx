/** biome-ignore lint/suspicious/noArrayIndexKey: file preview index keys are stable */
/** biome-ignore lint/a11y/useMediaCaption: audio preview doesn't need captions */
"use client"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import {
  ImageIcon,
  MicIcon,
  MicOffIcon,
  PauseIcon,
  PlayIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useRef, useState } from "react"

export type FileType = "audio" | "image"

export interface MediaFile {
  file: File
  type: FileType
  url: string
  duration?: number
}

export type AIInputFileProps = {
  onFilesChange?: (files: MediaFile[]) => void
  maxFiles?: number
  acceptedTypes?: FileType[]
  className?: string
  onError?: (error: string) => void
  files?: MediaFile[] // Controlled mode
}

export const AIInputFile = ({
  onFilesChange,
  maxFiles = 3,
  acceptedTypes = ["audio", "image"],
  className,
  onError,
  files: controlledFiles,
}: AIInputFileProps) => {
  const [internalFiles, setInternalFiles] = useState<MediaFile[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Use controlled files if provided, otherwise use internal state
  const files = controlledFiles !== undefined ? controlledFiles : internalFiles

  const updateFiles = useCallback(
    (newFiles: MediaFile[]) => {
      if (controlledFiles === undefined) {
        setInternalFiles(newFiles)
      }
      onFilesChange?.(newFiles)
    },
    [onFilesChange, controlledFiles]
  )

  const removeFile = useCallback(
    (index: number) => {
      const newFiles = files.filter((_, i) => i !== index)
      updateFiles(newFiles)
    },
    [files, updateFiles]
  )

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder

      const chunks: Blob[] = []
      mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data)
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: "audio/webm" })
        const audioFile = new File(
          [audioBlob],
          `recording-${Date.now()}.webm`,
          {
            type: "audio/webm",
          }
        )

        const mediaFile: MediaFile = {
          file: audioFile,
          type: "audio",
          url: URL.createObjectURL(audioBlob),
          duration: recordingTime,
        }

        if (files.length < maxFiles) {
          updateFiles([...files, mediaFile])
        }

        stream.getTracks().forEach((track) => {
          track.stop()
        })
        setRecordingTime(0)
      }

      mediaRecorder.start()
      setIsRecording(true)

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } catch (error) {
      console.error("Error starting recording:", error)
      onError?.("No se pudo acceder al micrófono. Verifica los permisos.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
      }
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const selectedFiles = Array.from(event.target.files || [])
      const remainingSlots = maxFiles - files.length
      const filesToAdd = selectedFiles.slice(0, remainingSlots)

      // Validate file types and sizes
      const maxSize = 10 * 1024 * 1024 // 10MB
      const supportedImageFormats = [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/gif",
        "image/webp",
      ]

      const validFiles = filesToAdd.filter((file) => {
        if (file.size > maxSize) {
          onError?.(`El archivo ${file.name} es muy grande (máximo 10MB)`)
          return false
        }

        const isValidImage = supportedImageFormats.includes(
          file.type.toLowerCase()
        )
        const isValidAudio = file.type.startsWith("audio/")

        if (!isValidImage && !isValidAudio) {
          if (file.type.startsWith("image/")) {
            onError?.(
              `Formato de imagen no soportado: ${file.name}. Use PNG, JPEG, GIF o WebP.`
            )
          } else {
            onError?.(`Tipo de archivo no soportado: ${file.name}`)
          }
          return false
        }
        return true
      })

      const mediaFiles: MediaFile[] = validFiles.map((file) => ({
        file,
        type: file.type.startsWith("image/") ? "image" : "audio",
        url: URL.createObjectURL(file),
      }))

      updateFiles([...files, ...mediaFiles])

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    } catch (error) {
      console.error("Error selecting files:", error)
      onError?.("Error al seleccionar archivos")
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const canAddMore = files.length < maxFiles

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* File previews */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2">
          {files.map((mediaFile, index) => (
            <FilePreview
              key={index}
              file={mediaFile}
              onRemove={() => removeFile(index)}
            />
          ))}
        </div>
      )}

      {/* Controls */}
      {canAddMore && (
        <div className="flex items-center gap-1">
          {acceptedTypes.includes("image") && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                title="Adjuntar imagen"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </>
          )}

          {acceptedTypes.includes("audio") && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={isRecording ? stopRecording : startRecording}
              title={isRecording ? "Detener grabación" : "Grabar audio"}
              className={cn(isRecording && "text-red-500")}
            >
              {isRecording ? (
                <MicOffIcon className="h-4 w-4" />
              ) : (
                <MicIcon className="h-4 w-4" />
              )}
            </Button>
          )}

          {isRecording && (
            <span className="text-muted-foreground text-sm">
              {formatTime(recordingTime)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

type FilePreviewProps = {
  file: MediaFile
  onRemove: () => void
}

const FilePreview = ({ file, onRemove }: FilePreviewProps) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const toggleAudioPlayback = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  return (
    <div className="relative flex items-center gap-2 rounded-lg border bg-muted p-2">
      {file.type === "image" ? (
        <div className="relative">
          <img
            src={file.url}
            alt="Preview"
            className="h-12 w-12 rounded object-cover"
          />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleAudioPlayback}
          >
            {isPlaying ? (
              <PauseIcon className="h-3 w-3" />
            ) : (
              <PlayIcon className="h-3 w-3" />
            )}
          </Button>
          <div className="text-muted-foreground text-xs">
            {file.duration ? formatTime(file.duration) : "Audio"}
          </div>
          <audio
            ref={audioRef}
            src={file.url}
            onEnded={() => setIsPlaying(false)}
            preload="metadata"
          >
            <track kind="captions" srcLang="es" label="Transcripción" />
          </audio>
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="-right-1 -top-1 absolute h-4 w-4 rounded-full bg-destructive text-destructive-foreground"
        onClick={onRemove}
      >
        <XIcon className="h-2 w-2" />
      </Button>
    </div>
  )
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}
