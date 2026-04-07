"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Doc } from "@workspace/backend/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ClockIcon,
  Loader2Icon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { handleConvexError } from "@/lib/error-handling"
import { RestaurantLocationForm } from "@/modules/dashboard/ui/components/restaurant-location-form"
import { SchedulePreview } from "@/modules/dashboard/ui/components/schedule-preview"

interface LocationsStepProps {
  organizationId: string
  onComplete: () => void
  onSkip: () => void
  onBack: () => void
}

export function LocationsStep({
  organizationId,
  onComplete,
  onSkip,
  onBack,
}: LocationsStepProps) {
  const [showForm, setShowForm] = useState(false)
  const [editingLocation, setEditingLocation] =
    useState<Doc<"restaurantLocations"> | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const existingLocations = useQuery(
    api.private.restaurantLocations.list,
    organizationId ? { organizationId } : "skip"
  )

  const createLocation = useMutation(api.private.restaurantLocations.create)
  const updateLocation = useMutation(api.private.restaurantLocations.update)
  const deleteLocation = useMutation(api.private.restaurantLocations.remove)
  const completeStep2 = useMutation(
    api.private.onboarding.completeStep2Locations
  )
  const skipStep = useMutation(api.private.onboarding.skipStep)

  const handleCreateLocation = async (locationData: {
    name: string
    code: string
    address: string
    coordinates: { latitude: number; longitude: number }
    available?: boolean
    color: string
    priority: number
    openingHours?: Array<{
      id: string
      day:
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
        | "saturday"
        | "sunday"
      ranges: Array<{ open: string; close: string }>
    }>
    specialSchedules?: Array<{
      date: string
      ranges: Array<{ open: string; close: string }>
    }>
  }) => {
    if (!organizationId) return

    try {
      const cleanedData = {
        organizationId: organizationId,
        ...locationData,
        openingHours: locationData.openingHours?.map((hour) => ({
          day: hour.day,
          ranges: hour.ranges,
        })),
        available: locationData.available ?? true,
      }
      await createLocation(cleanedData)
      toast.success("Sucursal creada exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
      throw error
    }
  }

  const handleUpdateLocation = async (locationData: {
    id?: string
    name: string
    code: string
    address: string
    coordinates: { latitude: number; longitude: number }
    available?: boolean
    color: string
    priority: number
    openingHours?: Array<{
      id: string
      day:
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
        | "saturday"
        | "sunday"
      ranges: Array<{ open: string; close: string }>
    }>
    specialSchedules?: Array<{
      date: string
      ranges: Array<{ open: string; close: string }>
    }>
  }) => {
    if (!locationData.id || !organizationId) return

    try {
      const cleanedData = {
        organizationId: organizationId,
        id: locationData.id,
        name: locationData.name,
        code: locationData.code,
        address: locationData.address,
        coordinates: locationData.coordinates,
        available: locationData.available ?? true,
        color: locationData.color,
        priority: locationData.priority,
        openingHours: locationData.openingHours?.map((hour) => ({
          day: hour.day,
          ranges: hour.ranges,
        })),
        specialSchedules: locationData.specialSchedules,
      }
      await updateLocation(cleanedData)
      toast.success("Sucursal actualizada exitosamente")
      setEditingLocation(null)
    } catch (error) {
      toast.error(handleConvexError(error))
      throw error
    }
  }

  const handleDeleteLocation = async (locationId: string) => {
    if (!organizationId) return
    try {
      await deleteLocation({
        organizationId: organizationId,
        id: locationId as Doc<"restaurantLocations">["_id"],
      })
      toast.success("Sucursal eliminada")
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleConfirm = async () => {
    if (!organizationId) return
    if (!existingLocations || existingLocations.length === 0) {
      toast.error("Debes agregar al menos una sucursal")
      return
    }

    setIsSubmitting(true)

    try {
      await completeStep2({
        organizationId: organizationId,
        locationsCount: existingLocations.length,
      })

      toast.success("Sucursales configuradas correctamente")
      onComplete()
    } catch (error) {
      console.error("Error completing step:", error)
      toast.error("Error al completar el paso")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = async () => {
    if (!organizationId) return
    try {
      await skipStep({
        organizationId: organizationId,
        step: 3,
      })
      onSkip()
    } catch (error) {
      console.error("Error skipping step:", error)
      toast.error("Error al omitir el paso")
    }
  }

  const hasLocations = existingLocations && existingLocations.length > 0

  return (
    <>
      <div className="space-y-6">
        <div>
          <h2 className="font-bold text-2xl tracking-tight">
            Configura tus Sucursales
          </h2>
          <p className="text-muted-foreground">
            Agrega las ubicaciones de tu restaurante con sus horarios de
            atención. Puedes configurar múltiples sucursales.
          </p>
        </div>

        {hasLocations && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-muted-foreground text-sm">
                {existingLocations.length} sucursal(es) configurada(s)
              </h3>
            </div>
            {existingLocations.map((location) => (
              <Card key={location._id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${location.color}20` }}
                      >
                        <MapPinIcon
                          className="h-5 w-5"
                          style={{ color: location.color }}
                        />
                      </div>
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          {location.name}
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
                            {location.code}
                          </span>
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {location.address}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingLocation(location)}
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteLocation(location._id)}
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex items-center gap-4 text-sm">
                    {location.openingHours &&
                    location.openingHours.length > 0 ? (
                      <SchedulePreview location={location} compact />
                    ) : (
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <ClockIcon className="h-3.5 w-3.5" />
                        <span>Sin horario configurado</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      {location.available ? (
                        <span className="flex items-center gap-1 text-green-600 text-xs">
                          <CheckCircle2Icon className="h-3.5 w-3.5" />
                          Disponible
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          No disponible
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Button
          variant="outline"
          onClick={() => setShowForm(true)}
          className="w-full border-dashed py-8"
        >
          <PlusIcon className="mr-2 h-5 w-5" />
          {hasLocations
            ? "Agregar otra sucursal"
            : "Agregar tu primera sucursal"}
        </Button>

        {!hasLocations && (
          <p className="text-center text-muted-foreground text-sm">
            Haz clic en el botón de arriba para agregar tu primera sucursal.
            Podrás configurar la dirección, coordenadas y horarios de atención.
          </p>
        )}

        <div className="flex justify-between pt-4">
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeftIcon className="mr-2 h-4 w-4" />
              Atrás
            </Button>
            <Button variant="ghost" onClick={handleSkip}>
              Omitir
            </Button>
          </div>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || !hasLocations}
          >
            {isSubmitting && (
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            )}
            Continuar
          </Button>
        </div>
      </div>

      <RestaurantLocationForm
        open={showForm}
        onOpenChange={setShowForm}
        location={null}
        mode="create"
        onSubmit={handleCreateLocation}
      />

      <RestaurantLocationForm
        open={!!editingLocation}
        onOpenChange={(open) => {
          if (!open) setEditingLocation(null)
        }}
        location={editingLocation}
        mode="edit"
        onSubmit={handleUpdateLocation}
      />
    </>
  )
}
