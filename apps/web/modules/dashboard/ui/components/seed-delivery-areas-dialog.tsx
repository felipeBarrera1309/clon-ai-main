"use client"

import type { Doc } from "@workspace/backend/_generated/dataModel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { MapPinIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

interface SeedDeliveryAreasDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  locations: Doc<"restaurantLocations">[] | undefined
  onConfirm: (restaurantLocationId: string) => void
  isSeeding?: boolean
}

export const SeedDeliveryAreasDialog = ({
  open,
  onOpenChange,
  locations,
  onConfirm,
  isSeeding = false,
}: SeedDeliveryAreasDialogProps) => {
  const [selectedLocationId, setSelectedLocationId] = useState<string>("")

  const handleConfirm = () => {
    if (!selectedLocationId) {
      toast.error("Por favor selecciona una sucursal de restaurante")
      return
    }
    onConfirm(selectedLocationId)
    setSelectedLocationId("")
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedLocationId("")
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPinIcon className="h-5 w-5" />
            Seleccionar Sucursal para Áreas de Entrega
          </DialogTitle>
          <DialogDescription>
            Las áreas de entrega deben estar asociadas a una sucursal específica
            de tu restaurante. Selecciona la sucursal donde quieres cargar las
            áreas de ejemplo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="location-select" className="font-medium text-sm">
              Sucursal del Restaurante
            </label>
            {locations === undefined ? (
              <div className="h-10 animate-pulse rounded bg-muted" />
            ) : locations.length === 0 ? (
              <div className="rounded-lg border bg-muted/10 py-8 text-center">
                <MapPinIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">
                  No tienes sucursales de restaurante registradas
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Crea una sucursal primero en la sección "Sucursales"
                </p>
              </div>
            ) : (
              <Select
                value={selectedLocationId}
                onValueChange={setSelectedLocationId}
              >
                <SelectTrigger id="location-select">
                  <SelectValue placeholder="Selecciona una sucursal..." />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location._id} value={location._id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{location.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {location.address}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedLocationId && (
            <div className="rounded-lg border bg-muted/10 p-3">
              <p className="mb-2 font-medium text-sm">Sucursal Seleccionada:</p>
              {(() => {
                const location = locations?.find(
                  (l) => l._id === selectedLocationId
                )
                return location ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{location.name}</Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {location.address}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Coordenadas: {location.coordinates.latitude.toFixed(6)},{" "}
                      {location.coordinates.longitude.toFixed(6)}
                    </p>
                  </div>
                ) : null
              })()}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSeeding}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !selectedLocationId || locations?.length === 0 || isSeeding
            }
          >
            {isSeeding ? "Cargando..." : "Cargar Áreas de Ejemplo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
