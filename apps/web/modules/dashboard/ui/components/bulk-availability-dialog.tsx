"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Doc, Id } from "@workspace/backend/_generated/dataModel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useMutation } from "convex/react"
import { CheckCircleIcon, MapPinIcon, XCircleIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"

interface BulkAvailabilityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedProducts: string[]
  locations: Doc<"restaurantLocations">[]
  onSuccess?: () => void
}

type AvailabilityAction = "add_all" | "remove_all" | "custom"

export const BulkAvailabilityDialog = ({
  open,
  onOpenChange,
  selectedProducts,
  locations,
  onSuccess,
}: BulkAvailabilityDialogProps) => {
  const { activeOrganizationId } = useOrganization()
  const [action, setAction] = useState<AvailabilityAction>("add_all")
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(
    new Set()
  )
  const [isUpdating, setIsUpdating] = useState(false)

  const bulkUpdateAvailability = useMutation(
    api.private.menuProductAvailability.bulkUpdateAvailability
  )

  const handleLocationToggle = (locationId: string, checked: boolean) => {
    setSelectedLocations((prev) => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(locationId)
      } else {
        newSet.delete(locationId)
      }
      return newSet
    })
  }

  const handleSelectAllLocations = (checked: boolean) => {
    if (checked) {
      setSelectedLocations(new Set(locations.map((l) => l._id)))
    } else {
      setSelectedLocations(new Set())
    }
  }

  const handleApplyChanges = async () => {
    if (selectedProducts.length === 0) {
      toast.error("No hay productos seleccionados")
      return
    }

    let locationUpdates: Array<{
      locationId: Id<"restaurantLocations">
      available: boolean
    }> = []

    switch (action) {
      case "add_all":
        locationUpdates = locations.map((location) => ({
          locationId: location._id,
          available: true,
        }))
        break

      case "remove_all":
        locationUpdates = locations.map((location) => ({
          locationId: location._id,
          available: false,
        }))
        break

      case "custom":
        if (selectedLocations.size === 0) {
          toast.error("Debe seleccionar al menos una sucursal")
          return
        }
        locationUpdates = Array.from(selectedLocations).map((locationId) => ({
          locationId: locationId as Id<"restaurantLocations">,
          available: true,
        }))
        break
    }

    if (!activeOrganizationId) return

    setIsUpdating(true)
    try {
      await bulkUpdateAvailability({
        organizationId: activeOrganizationId,
        productIds: selectedProducts as Id<"menuProducts">[],
        locationUpdates,
      })

      const actionText =
        action === "add_all"
          ? "agregados a todas las sucursales"
          : action === "remove_all"
            ? "removidos de todas las sucursales"
            : `agregados a ${selectedLocations.size} sucursal${selectedLocations.size !== 1 ? "es" : ""}`

      toast.success(
        `${selectedProducts.length} producto${selectedProducts.length !== 1 ? "s" : ""} ${actionText} exitosamente`
      )

      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDialogClose = () => {
    if (!isUpdating) {
      onOpenChange(false)
      setAction("add_all")
      setSelectedLocations(new Set())
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPinIcon className="h-5 w-5" />
            Gestión Masiva de Disponibilidad
          </DialogTitle>
          <DialogDescription>
            Gestiona la disponibilidad de {selectedProducts.length} producto
            {selectedProducts.length !== 1 ? "s" : ""} seleccionado
            {selectedProducts.length !== 1 ? "s" : ""} en las diferentes
            sucursales.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Action Selection */}
          <div className="space-y-3">
            <Label className="font-medium text-base">Acción a realizar</Label>
            <Select
              value={action}
              onValueChange={(value) => setAction(value as AvailabilityAction)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="add_all">
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="h-4 w-4 text-green-600" />
                    Agregar a todas las sucursales
                  </div>
                </SelectItem>
                <SelectItem value="remove_all">
                  <div className="flex items-center gap-2">
                    <XCircleIcon className="h-4 w-4 text-red-600" />
                    Remover de todas las sucursales
                  </div>
                </SelectItem>
                <SelectItem value="custom">
                  <div className="flex items-center gap-2">
                    <MapPinIcon className="h-4 w-4 text-blue-600" />
                    Personalizar por sucursal
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Custom Location Selection */}
          {action === "custom" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-medium text-base">
                  Seleccionar Sucursales
                </Label>
                <Checkbox
                  checked={selectedLocations.size === locations.length}
                  onCheckedChange={handleSelectAllLocations}
                  aria-label="Seleccionar todas las sucursales"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {locations.map((location) => (
                  <div
                    key={location._id}
                    className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedLocations.has(location._id)}
                      onCheckedChange={(checked) =>
                        handleLocationToggle(location._id, checked as boolean)
                      }
                      aria-label={`Seleccionar ${location.name}`}
                    />
                    <div className="flex flex-1 items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor: location.color || "#6b7280",
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">
                          {location.name}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {location.code}
                          </Badge>
                          {location.available ? (
                            <Badge
                              variant="default"
                              className="bg-green-100 text-green-800 text-xs"
                            >
                              Activa
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="bg-red-100 text-red-800 text-xs"
                            >
                              Inactiva
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {selectedLocations.size > 0 && (
                <p className="text-muted-foreground text-sm">
                  {selectedLocations.size} sucursal
                  {selectedLocations.size !== 1 ? "es" : ""} seleccionada
                  {selectedLocations.size !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}

          {/* Summary */}
          <div className="rounded-lg bg-muted/50 p-4">
            <h4 className="font-medium text-sm">Resumen de la operación:</h4>
            <p className="text-muted-foreground text-sm">
              {action === "add_all" &&
                `Los ${selectedProducts.length} productos seleccionados serán agregados a todas las ${locations.length} sucursales.`}
              {action === "remove_all" &&
                `Los ${selectedProducts.length} productos seleccionados serán removidos de todas las ${locations.length} sucursales.`}
              {action === "custom" &&
                `Los ${selectedProducts.length} productos seleccionados serán agregados a ${selectedLocations.size} sucursal${selectedLocations.size !== 1 ? "es" : ""}.`}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleDialogClose}
            disabled={isUpdating}
          >
            Cancelar
          </Button>
          <Button onClick={handleApplyChanges} disabled={isUpdating}>
            {isUpdating ? "Aplicando cambios..." : "Aplicar Cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
