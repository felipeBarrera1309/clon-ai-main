"use client"

import type { Doc } from "@workspace/backend/_generated/dataModel"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { AlertTriangleIcon } from "lucide-react"

interface DeleteRestaurantLocationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  location: Doc<"restaurantLocations"> | null
  onConfirm: () => void
  isDeleting: boolean
}

export const DeleteRestaurantLocationDialog = ({
  open,
  onOpenChange,
  location,
  onConfirm,
  isDeleting,
}: DeleteRestaurantLocationDialogProps) => {
  if (!location) return null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangleIcon className="h-5 w-5 text-destructive" />
            Eliminar Ubicación
          </AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de que quieres eliminar la ubicación "{location.name}
            "? Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Eliminando..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
