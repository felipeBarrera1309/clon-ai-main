"use client"

import { api } from "@workspace/backend/_generated/api"
import { Button } from "@workspace/ui/components/button"
import { useAction, useMutation, useQuery } from "convex/react"
import { ImageIcon, Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useOrganization } from "@/hooks/use-organization"

interface MenuImageUploaderProps {
  onUploadComplete?: () => void
}

export function MenuImageUploader({
  onUploadComplete,
}: MenuImageUploaderProps) {
  const { activeOrganizationId } = useOrganization()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>("")

  const menuFileUrls = useQuery(
    api.private.menuFiles.getMenuFileUrls,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  const uploadMenuFile = useAction(api.private.menuFiles.uploadMenuFile)
  const saveMenuImage = useMutation(api.private.menuFiles.saveMenuImage)
  const deleteMenuImage = useMutation(api.private.menuFiles.deleteMenuImage)

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (!files || files.length === 0) return

      setIsUploading(true)
      setUploadProgress("Preparando subida...")

      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          if (!file) continue

          // Validate file type
          if (!file.type.startsWith("image/")) {
            toast.error(`${file.name} no es una imagen válida`)
            continue
          }

          // Validate file size (5MB max)
          const maxSize = 5 * 1024 * 1024 // 5MB
          if (file.size > maxSize) {
            toast.error(`${file.name} es demasiado grande. Máximo 5MB`)
            continue
          }

          setUploadProgress(`Subiendo ${i + 1} de ${files.length}...`)

          if (!activeOrganizationId) {
            toast.error("No se pudo determinar la organización activa")
            continue
          }

          // Convert File to ArrayBuffer for Convex bytes compatibility
          const arrayBuffer = await file.arrayBuffer()

          // Upload file directly to R2
          const storageId = await uploadMenuFile({
            organizationId: activeOrganizationId,
            file: arrayBuffer,
            fileType: "image",
            contentType: file.type || "image/jpeg",
            fileName: file.name,
          })

          // Save reference in database
          await saveMenuImage({
            organizationId: activeOrganizationId,
            storageId,
          })
        }

        toast.success("Imágenes subidas exitosamente")
        onUploadComplete?.()
      } catch (error) {
        console.error("Error uploading images:", error)
        toast.error("Error al subir las imágenes")
      } finally {
        setIsUploading(false)
        setUploadProgress("")
        // Reset input
        if (event.target) event.target.value = ""
      }
    },
    [activeOrganizationId, uploadMenuFile, saveMenuImage, onUploadComplete]
  )

  const handleDelete = useCallback(
    async (storageId: string) => {
      if (!activeOrganizationId) return

      try {
        await deleteMenuImage({
          organizationId: activeOrganizationId,
          storageId,
        })
        toast.success("Imagen eliminada")
      } catch (error) {
        console.error("Error deleting image:", error)
        toast.error("Error al eliminar la imagen")
      }
    },
    [deleteMenuImage, activeOrganizationId]
  )

  return (
    <div className="space-y-4">
      {/* Upload button */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isUploading}
          onClick={() => document.getElementById("menu-images-input")?.click()}
          className="flex items-center gap-2"
        >
          {isUploading ? (
            <>
              <Loader2Icon className="h-4 w-4 animate-spin" />
              {uploadProgress}
            </>
          ) : (
            <>
              <UploadIcon className="h-4 w-4" />
              Subir Imágenes
            </>
          )}
        </Button>
        <input
          id="menu-images-input"
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <span className="text-muted-foreground text-xs">
          Máximo 5MB por imagen
        </span>
      </div>

      {/* Image grid */}
      {menuFileUrls?.images && menuFileUrls.images.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {menuFileUrls.images.map((image) => (
            <div
              key={image.id}
              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
            >
              {/* biome-ignore lint/performance/noImgElement: External R2 or Convex URL */}
              <img
                src={image.url}
                alt="Imagen del menú"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={() => handleDelete(image.id)}
                  className="h-8 w-8"
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {(!menuFileUrls?.images || menuFileUrls.images.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            No hay imágenes del menú subidas
          </p>
          <p className="text-muted-foreground text-xs">
            Haz clic en "Subir Imágenes" para agregar
          </p>
        </div>
      )}
    </div>
  )
}
