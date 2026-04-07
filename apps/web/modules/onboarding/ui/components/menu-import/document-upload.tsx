"use client"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useState } from "react"
import { toast } from "sonner"

interface DocumentUploadProps {
  onFileSelect: (file: File) => void
  onExtract: () => void
  isExtracting: boolean
  selectedFile: File | null
  onClearFile: () => void
  acceptedTypes?: string
  title?: string
  description?: string
}

export function DocumentUpload({
  onFileSelect,
  onExtract,
  isExtracting,
  selectedFile,
  onClearFile,
  acceptedTypes = "image/*,.pdf",
  title = "Sube un documento",
  description = "Arrastra una imagen o PDF de tu menú",
}: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0]
        if (file) {
          onFileSelect(file)
        }
      }
    },
    [onFileSelect]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0]
        if (file) {
          const isValid =
            file.type.startsWith("image/") || file.type === "application/pdf"
          if (isValid) {
            onFileSelect(file)
          } else {
            toast.error("Solo se permiten imágenes y archivos PDF")
          }
        }
      }
    },
    [onFileSelect]
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

  if (selectedFile) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedFile.type.includes("pdf") ? (
              <FileTextIcon className="h-8 w-8 text-red-500" />
            ) : (
              <ImageIcon className="h-8 w-8 text-blue-500" />
            )}
            <div>
              <p className="font-medium text-sm">{selectedFile.name}</p>
              <p className="text-muted-foreground text-xs">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClearFile}
              disabled={isExtracting}
            >
              <XIcon className="h-4 w-4" />
            </Button>
            <Button onClick={onExtract} disabled={isExtracting}>
              {isExtracting ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  Extrayendo...
                </>
              ) : (
                "Extraer datos"
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
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
      onClick={() => document.getElementById("doc-upload-input")?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          document.getElementById("doc-upload-input")?.click()
        }
      }}
    >
      <div className="mb-3 rounded-full bg-primary/10 p-3">
        <UploadIcon className="h-6 w-6 text-primary" />
      </div>
      <p className="mb-1 font-medium text-sm">{title}</p>
      <p className="mb-3 text-center text-muted-foreground text-xs">
        {description}
      </p>
      <Button variant="outline" size="sm" className="pointer-events-none">
        Seleccionar archivo
      </Button>
      <Input
        id="doc-upload-input"
        type="file"
        className="hidden"
        accept={acceptedTypes}
        onChange={handleFileSelect}
      />
    </div>
  )
}
