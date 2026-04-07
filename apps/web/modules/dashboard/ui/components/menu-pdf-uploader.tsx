"use client"

import { api } from "@workspace/backend/_generated/api"
import { Button } from "@workspace/ui/components/button"
import { useAction, useMutation, useQuery } from "convex/react"
import { FileTextIcon, Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useOrganization } from "@/hooks/use-organization"

interface MenuPdfUploaderProps {
  onUploadComplete?: () => void
}

export function MenuPdfUploader({ onUploadComplete }: MenuPdfUploaderProps) {
  const { activeOrganizationId } = useOrganization()
  const [isUploading, setIsUploading] = useState(false)

  const menuFileUrls = useQuery(
    api.private.menuFiles.getMenuFileUrls,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  const uploadMenuFile = useAction(api.private.menuFiles.uploadMenuFile)
  const saveMenuPdf = useMutation(api.private.menuFiles.saveMenuPdf)
  const deleteMenuPdf = useMutation(api.private.menuFiles.deleteMenuPdf)

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      // Validate file type
      if (file.type !== "application/pdf") {
        toast.error("El archivo debe ser un PDF")
        return
      }

      // Validate file size (10MB max)
      const maxSize = 10 * 1024 * 1024 // 10MB
      if (file.size > maxSize) {
        toast.error("El archivo es demasiado grande. Máximo 10MB")
        return
      }

      setIsUploading(true)

      if (!activeOrganizationId) {
        toast.error("No se pudo determinar la organización activa")
        setIsUploading(false)
        return
      }

      try {
        // Convert File to ArrayBuffer for Convex bytes compatibility
        const arrayBuffer = await file.arrayBuffer()

        // Upload file directly to R2
        const storageId = await uploadMenuFile({
          organizationId: activeOrganizationId,
          file: arrayBuffer,
          fileType: "pdf",
          contentType: file.type || "application/pdf",
          fileName: file.name,
        })

        // Save reference in database
        await saveMenuPdf({
          organizationId: activeOrganizationId,
          storageId,
        })

        toast.success("PDF subido exitosamente")
        onUploadComplete?.()
      } catch (error) {
        console.error("Error uploading PDF:", error)
        toast.error("Error al subir el PDF")
      } finally {
        setIsUploading(false)
        // Reset input
        if (event.target) event.target.value = ""
      }
    },
    [activeOrganizationId, uploadMenuFile, saveMenuPdf, onUploadComplete]
  )

  const handleDelete = useCallback(async () => {
    if (!activeOrganizationId) return

    try {
      await deleteMenuPdf({ organizationId: activeOrganizationId })
      toast.success("PDF eliminado")
    } catch (error) {
      console.error("Error deleting PDF:", error)
      toast.error("Error al eliminar el PDF")
    }
  }, [deleteMenuPdf, activeOrganizationId])

  return (
    <div className="space-y-4">
      {/* Upload button */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isUploading}
          onClick={() => document.getElementById("menu-pdf-input")?.click()}
          className="flex items-center gap-2"
        >
          {isUploading ? (
            <>
              <Loader2Icon className="h-4 w-4 animate-spin" />
              Subiendo...
            </>
          ) : (
            <>
              <UploadIcon className="h-4 w-4" />
              Subir PDF
            </>
          )}
        </Button>
        <input
          id="menu-pdf-input"
          type="file"
          accept="application/pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
        <span className="text-muted-foreground text-xs">Máximo 10MB</span>
      </div>

      {/* PDF View */}
      {menuFileUrls?.pdf && (
        <div className="flex items-center justify-between rounded-lg border bg-muted p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-red-100 text-red-600">
              <FileTextIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium text-sm">
                {(() => {
                  // Extract filename from storage ID
                  const storageId = menuFileUrls.pdf.id
                  if (storageId.includes("/")) {
                    const parts = storageId.split("/")
                    let filename = parts[parts.length - 1] || "Menú en PDF"

                    // Remove timestamp suffix if present (format: name_timestamp.ext)
                    // Find last underscore followed by numbers
                    const lastUnderscoreIndex = filename.lastIndexOf("_")
                    if (lastUnderscoreIndex > 0) {
                      const afterUnderscore = filename.substring(
                        lastUnderscoreIndex + 1
                      )
                      // Check if it's a timestamp (starts with digits)
                      if (/^\d+\./.test(afterUnderscore)) {
                        // Remove the timestamp part, keep extension
                        const dotIndex = afterUnderscore.indexOf(".")
                        if (dotIndex > 0) {
                          const nameWithoutTimestamp = filename.substring(
                            0,
                            lastUnderscoreIndex
                          )
                          const extension = afterUnderscore.substring(dotIndex)
                          filename = nameWithoutTimestamp + extension
                        }
                      }
                    }

                    return filename.replace(/_/g, " ")
                  }
                  return "Menú en PDF"
                })()}
              </p>
              <a
                href={menuFileUrls.pdf.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 text-xs hover:underline"
              >
                Ver PDF
              </a>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2Icon className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!menuFileUrls?.pdf && !isUploading && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <FileTextIcon className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            No hay ningún PDF del menú subido
          </p>
          <p className="text-muted-foreground text-xs">
            Haz clic en "Subir PDF" para agregar
          </p>
        </div>
      )}
    </div>
  )
}
