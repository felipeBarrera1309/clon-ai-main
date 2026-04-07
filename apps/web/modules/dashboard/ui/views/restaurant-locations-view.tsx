"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Doc } from "@workspace/backend/_generated/dataModel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import type { Column } from "@workspace/ui/components/data-table"
import { Switch } from "@workspace/ui/components/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { DataViewerLayout } from "@workspace/ui/layout/data-viewer-layout"
import { useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { EditIcon, MapPinIcon, PlusIcon, TrashIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"
import { DeleteRestaurantLocationDialog } from "../components/delete-restaurant-location-dialog"
import { RestaurantLocationForm } from "../components/restaurant-location-form"
import { SchedulePreview } from "../components/schedule-preview"

export const RestaurantLocationsView = () => {
  const { activeOrganizationId } = useOrganization()

  // View mode state
  const [viewMode, setViewMode] = useState<"table" | "cards">("table")
  const isMobile = useIsMobile()

  useEffect(() => {
    setViewMode(isMobile ? "cards" : "table")
  }, [isMobile])

  // Dialog state
  const [showForm, setShowForm] = useState(false)
  const [editingLocation, setEditingLocation] =
    useState<Doc<"restaurantLocations"> | null>(null)
  const [locationToDelete, setLocationToDelete] =
    useState<Doc<"restaurantLocations"> | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Get locations (no pagination for now, as the backend doesn't support it)
  const locations = useQuery(
    api.private.restaurantLocations.list,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )

  const createLocation = useMutation(api.private.restaurantLocations.create)
  const updateLocation = useMutation(api.private.restaurantLocations.update)
  const deleteLocation = useMutation(api.private.restaurantLocations.remove)

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
  }) => {
    if (!activeOrganizationId) return

    // Clean opening hours to remove ID field and convert to backend format
    const cleanedData = {
      organizationId: activeOrganizationId,
      ...locationData,
      openingHours: locationData.openingHours?.map((hour) => ({
        day: hour.day,
        ranges: hour.ranges,
      })),
      available: locationData.available ?? true,
    }
    await createLocation(cleanedData)
    toast.success("Ubicación creada exitosamente")
  }

  const handleUpdateLocation = async (locationData: {
    id?: string
    name?: string
    code?: string
    address?: string
    coordinates?: { latitude: number; longitude: number }
    available?: boolean
    color?: string
    priority?: number
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
  }) => {
    // Ensure id is present for update operations
    if (!locationData.id || !activeOrganizationId) {
      throw new Error(
        "Location ID and organization ID are required for updates"
      )
    }

    // Clean opening hours to remove ID field before sending to backend
    const cleanedData = {
      organizationId: activeOrganizationId,
      ...locationData,
      openingHours: locationData.openingHours?.map((hour) => ({
        day: hour.day,
        ranges: hour.ranges,
      })),
    }

    await updateLocation(
      cleanedData as {
        id: string
        organizationId: string
        name?: string
        code?: string
        address?: string
        coordinates?: { latitude: number; longitude: number }
        available?: boolean
        color?: string
        openingHours?: Array<{
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
      }
    )
    toast.success("Ubicación actualizada exitosamente")
    // Form component will handle closing itself on success
    setEditingLocation(null)
  }

  const handleDeleteLocation = async () => {
    if (!locationToDelete || !activeOrganizationId) return

    setIsDeleting(true)
    try {
      await deleteLocation({
        organizationId: activeOrganizationId,
        id: locationToDelete._id,
      })
      setLocationToDelete(null)
      toast.success("Ubicación eliminada exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleEditLocation = (location: Doc<"restaurantLocations">) => {
    setEditingLocation(location)
    setShowForm(true)
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditingLocation(null)
  }

  const handleToggleAvailability = async (
    locationId: string,
    currentAvailable: boolean
  ) => {
    if (!activeOrganizationId) return

    try {
      await updateLocation({
        organizationId: activeOrganizationId,
        id: locationId,
        available: !currentAvailable,
      })
      toast.success(
        `Sucursal ${!currentAvailable ? "habilitada" : "deshabilitada"} exitosamente`
      )
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  // Since the backend doesn't support pagination for restaurant locations,
  // we'll use a simple approach without pagination for now

  // Define columns for restaurant locations
  const locationColumns: Column<Doc<"restaurantLocations">>[] = [
    {
      key: "name",
      header: "Nombre",
      render: (location) => <div className="font-medium">{location.name}</div>,
    },
    {
      key: "code",
      header: "Código",
      render: (location) => (
        <Badge variant="secondary" className="font-mono">
          {location.code}
        </Badge>
      ),
    },
    {
      key: "address",
      header: "Dirección",
      render: (location) => (
        <div className="max-w-[300px] truncate text-sm">{location.address}</div>
      ),
    },
    {
      key: "coordinates",
      header: "Coordenadas GPS",
      render: (location) => (
        <Badge variant="outline">
          {location.coordinates.latitude.toFixed(6)},{" "}
          {location.coordinates.longitude.toFixed(6)}
        </Badge>
      ),
    },
    {
      key: "priority",
      header: "Prioridad",
      render: (location) =>
        location.priority ? (
          <Badge variant="secondary" className="font-mono">
            {location.priority}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">Sin prioridad</span>
        ),
    },
    {
      key: "status",
      header: "Estado",
      render: (location) => (
        <div className="flex items-center gap-3">
          <Switch
            checked={location.available}
            onCheckedChange={() =>
              handleToggleAvailability(location._id, location.available)
            }
          />
          <Badge variant={location.available ? "default" : "secondary"}>
            {location.available ? "Disponible" : "No disponible"}
          </Badge>
        </div>
      ),
    },
    {
      key: "schedule",
      header: "Horario",
      render: (location) => (
        <SchedulePreview location={location} compact={true} />
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (location) => (
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditLocation(location)}
                  className="h-8 w-8 p-0"
                >
                  <EditIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Editar sucursal</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocationToDelete(location)}
                  className="h-8 w-8 p-0 hover:text-destructive"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Eliminar sucursal</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ),
    },
  ]

  // Render card function for restaurant locations
  const renderLocationCard = (location: Doc<"restaurantLocations">) => (
    <Card className="gap-2 transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{location.name}</CardTitle>
            <Badge variant="secondary" className="font-mono">
              {location.code}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditLocation(location)}
                    className="h-8 w-8 p-0"
                  >
                    <EditIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Editar sucursal</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLocationToDelete(location)}
                    className="h-8 w-8 p-0 hover:text-destructive"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Eliminar sucursal</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <p className="mb-1 text-muted-foreground text-sm">Dirección</p>
          <p className="text-sm">{location.address}</p>
        </div>

        <div>
          <p className="mb-1 text-muted-foreground text-sm">Coordenadas GPS</p>
          <Badge variant="outline" className="text-xs">
            {location.coordinates.latitude.toFixed(6)},{" "}
            {location.coordinates.longitude.toFixed(6)}
          </Badge>
        </div>
        <div className="flex justify-between gap-2">
          <div>
            <p className="mb-1 text-muted-foreground text-sm">Prioridad</p>
            {location.priority ? (
              <Badge variant="secondary" className="font-mono">
                {location.priority}
              </Badge>
            ) : (
              <span className="text-muted-foreground text-sm">
                Sin prioridad
              </span>
            )}
          </div>
          <div>
            <p className="mb-2 text-muted-foreground text-sm">Estado</p>
            <div className="flex items-center gap-3">
              <Switch
                checked={location.available}
                onCheckedChange={() =>
                  handleToggleAvailability(location._id, location.available)
                }
              />
              <Badge variant={location.available ? "default" : "secondary"}>
                {location.available ? "Disponible" : "No disponible"}
              </Badge>
            </div>
          </div>
        </div>
        <SchedulePreview location={location} compact={false} />
      </CardContent>
    </Card>
  )

  return (
    <>
      <DataViewerLayout
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        actions={
          <Button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2"
          >
            <PlusIcon className="h-4 w-4" />
            Añadir Sucursal
          </Button>
        }
        data={locations || []}
        tableColumns={locationColumns}
        renderCard={renderLocationCard}
        loading={locations === undefined}
        error={
          locations instanceof Error ||
          locations instanceof ConvexError ||
          locations === null
            ? new Error("Error al cargar sucursales")
            : null
        }
        emptyState={{
          icon: <MapPinIcon className="h-12 w-12" />,
          title: "No hay sucursales",
          description:
            "No hay sucursales registradas. Crea la primera sucursal para comenzar.",
        }}
        itemName={{ singular: "sucursal", plural: "sucursales" }}
      />

      <RestaurantLocationForm
        open={showForm}
        onOpenChange={handleFormClose}
        location={editingLocation}
        mode={editingLocation ? "edit" : "create"}
        onSubmit={editingLocation ? handleUpdateLocation : handleCreateLocation}
      />

      <DeleteRestaurantLocationDialog
        open={!!locationToDelete}
        onOpenChange={(open) => !open && setLocationToDelete(null)}
        location={locationToDelete}
        onConfirm={handleDeleteLocation}
        isDeleting={isDeleting}
      />
    </>
  )
}
