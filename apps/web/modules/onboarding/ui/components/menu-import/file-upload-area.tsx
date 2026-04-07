"use client"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  PlusIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

const MAX_FILES = 5
const MAX_FILE_SIZE_MB = 10
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
const ACCEPTED_TYPES = ["image/*", "application/pdf"]
const ACCEPTED_EXTENSIONS = "image/*,.pdf"

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function isValidFileType(file: File): boolean {
  return file.type.startsWith("image/") || file.type === "application/pdf"
}

function getFileIcon(file: File) {
  if (file.type === "application/pdf") {
    return <FileTextIcon className="h-5 w-5 shrink-0 text-red-500" />
  }
  return <ImageIcon className="h-5 w-5 shrink-0 text-blue-500" />
}

interface FileUploadAreaProps {
  onFilesSelected: (files: File[]) => void
  onManualAdd: () => void
  isUploading: boolean
}

export function FileUploadArea({
  onFilesSelected,
  onManualAdd,
  isUploading,
}: FileUploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndAddFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles)
    const validFiles: File[] = []
    let hasErrors = false

    for (const file of fileArray) {
      if (!isValidFileType(file)) {
        toast.error(`"${file.name}" no es un tipo válido. Solo imágenes y PDF.`)
        hasErrors = true
        continue
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error(`"${file.name}" excede el límite de ${MAX_FILE_SIZE_MB}MB.`)
        hasErrors = true
        continue
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    setFiles((prev) => {
      const total = prev.length + validFiles.length
      if (total > MAX_FILES) {
        toast.error(`Máximo ${MAX_FILES} archivos permitidos.`)
        const remaining = MAX_FILES - prev.length
        if (remaining <= 0) return prev
        return [...prev, ...validFiles.slice(0, remaining)]
      }
      return [...prev, ...validFiles]
    })
  }, [])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        validateAndAddFiles(e.target.files)
      }
      if (inputRef.current) {
        inputRef.current.value = ""
      }
    },
    [validateAndAddFiles]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        validateAndAddFiles(e.dataTransfer.files)
      }
    },
    [validateAndAddFiles]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleExtract = () => {
    if (files.length === 0) return
    onFilesSelected(files)
  }

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        className={`flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 bg-muted/5 hover:bg-muted/10"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
      >
        <div className="mb-3 rounded-full bg-primary/10 p-3">
          <UploadIcon className="h-6 w-6 text-primary" />
        </div>
        <p className="mb-1 font-medium text-sm">
          Arrastra tus archivos aquí o haz clic para seleccionar
        </p>
        <p className="mb-3 text-center text-muted-foreground text-xs">
          Imágenes o PDF de tu menú (máx. {MAX_FILES} archivos,{" "}
          {MAX_FILE_SIZE_MB}
          MB cada uno)
        </p>
        <Button variant="outline" size="sm" className="pointer-events-none">
          Seleccionar archivos
        </Button>
        <Input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_EXTENSIONS}
          multiple
          onChange={handleFileSelect}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                {getFileIcon(file)}
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{file.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile(index)
                }}
                disabled={isUploading}
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {files.length < MAX_FILES && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={(e) => {
                e.stopPropagation()
                inputRef.current?.click()
              }}
              disabled={isUploading}
            >
              <PlusIcon className="mr-2 h-4 w-4" />
              Agregar más archivos
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onManualAdd}
          disabled={isUploading}
          className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
        >
          Agregar manualmente
        </button>
        <Button
          onClick={handleExtract}
          disabled={files.length === 0 || isUploading}
        >
          {isUploading ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Subiendo...
            </>
          ) : (
            "Extraer datos"
          )}
        </Button>
      </div>
    </div>
  )
}
