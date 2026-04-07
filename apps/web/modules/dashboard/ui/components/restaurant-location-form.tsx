"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@workspace/backend/_generated/api"
import type { Doc } from "@workspace/backend/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
import { useAction } from "convex/react"
import { LoaderIcon, MapPinIcon, SearchIcon } from "lucide-react"
import React, { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import {
  formatCoordinateForDisplay,
  validateCoordinate,
} from "@/lib/coordinate-utils"
import { handleConvexError } from "@/lib/error-handling"
import { ScheduleManager } from "./schedule-manager"
import { SpecialScheduleManager } from "./special-schedule-manager"

const restaurantLocationFormSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  code: z
    .string()
    .min(3, "El código debe tener exactamente 3 caracteres")
    .max(3, "El código debe tener exactamente 3 caracteres")
    .regex(
      /^[A-Z0-9]{3}$/,
      "El código debe contener solo letras mayúsculas y números"
    ),
  address: z.string().min(1, "La dirección es obligatoria"),
  latitude: z
    .string()
    .min(
      1,
      "La latitud es obligatoria. Usa el botón 'Obtener Coordenadas' para generarlas automáticamente."
    ),
  longitude: z
    .string()
    .min(
      1,
      "La longitud es obligatoria. Usa el botón 'Obtener Coordenadas' para generarlas automáticamente."
    ),
  available: z.boolean(),
  color: z
    .string()
    .regex(
      /^#[0-9A-Fa-f]{6}$/,
      "El color debe ser un código hexadecimal válido"
    ),
  priority: z.number().min(1, "La prioridad debe ser mayor a 0"),
})

type RestaurantLocationFormData = z.infer<typeof restaurantLocationFormSchema>

interface OpeningHour {
  id: string
  day:
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday"
  ranges: Array<{
    open: string
    close: string
  }>
}

interface SpecialSchedule {
  id: string
  date: string // ISO date string (YYYY-MM-DD)
  ranges: Array<{
    open: string
    close: string
  }>
}

interface SpecialScheduleSubmit {
  date: string // ISO date string (YYYY-MM-DD)
  ranges: Array<{
    open: string
    close: string
  }>
}

interface RestaurantLocationSubmitData {
  id?: string
  name: string
  code: string
  address: string
  coordinates: { latitude: number; longitude: number }
  available: boolean
  color: string
  priority: number
  openingHours?: OpeningHour[]
  specialSchedules?: SpecialScheduleSubmit[]
}

interface RestaurantLocationFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  location?: Doc<"restaurantLocations"> | null
  color?: string
  mode: "create" | "edit"
  onSubmit: (data: RestaurantLocationSubmitData) => void
}

export const RestaurantLocationForm = ({
  open,
  onOpenChange,
  location,
  mode,
  onSubmit,
}: RestaurantLocationFormProps) => {
  const [openingHours, setOpeningHours] = useState<OpeningHour[]>([])
  const [specialSchedules, setSpecialSchedules] = useState<SpecialSchedule[]>(
    []
  )
  const [isGeocoding, setIsGeocoding] = useState(false)

  const geocodeAddress = useAction(
    api.private.restaurantLocations.geocodeAddressAction
  )

  const form = useForm<RestaurantLocationFormData>({
    resolver: zodResolver(restaurantLocationFormSchema),
    defaultValues: {
      name: "",
      code: "",
      address: "",
      latitude: "",
      longitude: "",
      available: true,
      color: "#3b82f6",
      priority: 1,
    },
  })

  // Update state when location changes (for edit mode)
  React.useEffect(() => {
    if (location) {
      // Clean opening hours to only include the expected fields and add IDs if missing
      const cleanedOpeningHours = (location.openingHours || []).map((hour) => ({
        id: `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        day: hour.day,
        ranges: hour.ranges,
      }))
      setOpeningHours(cleanedOpeningHours)

      // Clean special schedules to only include the expected fields and add IDs if missing
      const cleanedSpecialSchedules = (location.specialSchedules || []).map(
        (schedule) => ({
          id: `special-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: schedule.date,
          ranges: schedule.ranges,
        })
      )
      setSpecialSchedules(cleanedSpecialSchedules)

      // Reset form with location values
      form.reset({
        name: location.name || "",
        code: location.code || "",
        address: location.address || "",
        latitude: formatCoordinateForDisplay(
          location.coordinates.latitude || 0
        ),
        longitude: formatCoordinateForDisplay(
          location.coordinates.longitude || 0
        ),
        available: location.available ?? true,
        color: location.color || "#3b82f6",
        priority: location.priority,
      })
    } else {
      // Reset for create mode
      setOpeningHours([])
      setSpecialSchedules([])
      form.reset({
        name: "",
        code: "",
        address: "",
        latitude: "",
        longitude: "",
        available: true,
        color: "#3b82f6",
        priority: 1,
      })
    }
  }, [location, form])

  const handleSubmit = async (data: RestaurantLocationFormData) => {
    // Validate and transform coordinate strings to numbers
    const latResult = validateCoordinate(data.latitude, "latitude")
    const lngResult = validateCoordinate(data.longitude, "longitude")

    if (!latResult.isValid) {
      form.setError("latitude", {
        message: latResult.error || "Latitud inválida",
      })
      return
    }

    if (!lngResult.isValid) {
      form.setError("longitude", {
        message: lngResult.error || "Longitud inválida",
      })
      return
    }

    // Clean special schedules to remove IDs before sending to backend
    const cleanedSpecialSchedules: SpecialScheduleSubmit[] =
      specialSchedules?.map(({ id, ...schedule }) => schedule) || []

    const formattedData = {
      ...(mode === "edit" && location ? { id: location._id } : {}),
      name: data.name,
      code: data.code,
      address: data.address,
      coordinates: {
        latitude: latResult.value as number,
        longitude: lngResult.value as number,
      },
      available: data.available,
      color: data.color,
      priority: data.priority,
      openingHours, // Keep full OpeningHour[] with IDs for the parent component
      specialSchedules: cleanedSpecialSchedules,
    }

    try {
      await onSubmit(formattedData)
      // Only reset form and close dialog on success
      form.reset()
      // Clean opening hours to only include the expected fields and add IDs if missing
      const resetOpeningHours = (location?.openingHours || []).map((hour) => ({
        id: `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        day: hour.day,
        ranges: hour.ranges,
      }))
      setOpeningHours(resetOpeningHours)
      // Clean special schedules to only include the expected fields and add IDs if missing
      const resetSpecialSchedules = (location?.specialSchedules || []).map(
        (schedule) => ({
          id: `special-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: schedule.date,
          ranges: schedule.ranges,
        })
      )
      setSpecialSchedules(resetSpecialSchedules)
      onOpenChange(false) // Close the dialog only on success
    } catch (error) {
      // Show error but keep form open so user doesn't lose progress
      toast.error(handleConvexError(error))
      // Don't reset form or close dialog on error
    }
  }

  const handleGeocodeAddress = async () => {
    const address = form.getValues("address")
    if (!address?.trim()) {
      toast.error("Por favor ingresa una dirección antes de geocodificar")
      return
    }

    setIsGeocoding(true)
    try {
      const result = await geocodeAddress({ address })

      if (result.success && result.coordinates) {
        // Update the form with the geocoded coordinates
        form.setValue("latitude", result.coordinates.lat.toString())
        form.setValue("longitude", result.coordinates.lng.toString())

        toast.success("Coordenadas obtenidas exitosamente")
        if (result.formattedAddress) {
          toast.success(`Dirección formateada: ${result.formattedAddress}`)
        }
      } else {
        toast.error(result.error || "No se pudo geocodificar la dirección")
      }
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsGeocoding(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset()
    } else {
      // When opening, ensure form is initialized with current location values
      if (location) {
        form.reset({
          name: location.name || "",
          code: location.code || "",
          address: location.address || "",
          latitude: formatCoordinateForDisplay(
            location.coordinates.latitude || 0
          ),
          longitude: formatCoordinateForDisplay(
            location.coordinates.longitude || 0
          ),
          available: location.available ?? true,
          color: location.color || "#3b82f6",
          priority: location.priority,
        })
        // Clean opening hours to only include the expected fields and add IDs if missing
        const cleanedOpeningHours = (location.openingHours || []).map(
          (hour) => ({
            id: `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            day: hour.day,
            ranges: hour.ranges,
          })
        )
        setOpeningHours(cleanedOpeningHours)
        // Clean special schedules to only include the expected fields and add IDs if missing
        const cleanedSpecialSchedules = (location.specialSchedules || []).map(
          (schedule) => ({
            id: `special-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            date: schedule.date,
            ranges: schedule.ranges,
          })
        )
        setSpecialSchedules(cleanedSpecialSchedules)
      } else {
        // For create mode
        form.reset({
          name: "",
          code: "",
          address: "",
          latitude: "",
          longitude: "",
          available: true,
          color: "#3b82f6",
          priority: 1,
        })
        setOpeningHours([])
        setSpecialSchedules([])
      }
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPinIcon className="h-5 w-5" />
            {mode === "create" ? "Nueva Sucursal" : "Editar Sucursal"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Restaurante</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Restaurante Centro" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código (3 caracteres)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: CEN"
                      maxLength={3}
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value.toUpperCase())
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección Completa</FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Ej: Calle 10 #20-30, Bogotá"
                        {...field}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleGeocodeAddress}
                        disabled={isGeocoding || !field.value?.trim()}
                        className="whitespace-nowrap"
                      >
                        {isGeocoding ? (
                          <>
                            <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                            Obteniendo...
                          </>
                        ) : (
                          <>
                            <SearchIcon className="mr-2 h-4 w-4" />
                            Obtener Coordenadas
                          </>
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="latitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitud</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Automático o manual: 4.6097"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value)}
                        className={
                          field.value ? "border-green-200 bg-green-50" : ""
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="longitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitud</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Automático o manual: -74.0817"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value)}
                        className={
                          field.value ? "border-green-200 bg-green-50" : ""
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {(!form.getValues("latitude") || !form.getValues("longitude")) && (
              <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-700 text-sm">
                <SearchIcon className="h-4 w-4 flex-shrink-0" />
                <span>
                  💡 <strong>Tip:</strong> Ingresa la dirección completa arriba
                  y haz clic en "Obtener Coordenadas" para generar
                  automáticamente la latitud y longitud.
                </span>
              </div>
            )}

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color para Áreas de Entrega</FormLabel>
                  <div className="mb-2 text-muted-foreground text-sm">
                    Este color se usará para mostrar todas las áreas de entrega
                    asociadas a esta sucursal
                  </div>
                  <FormControl>
                    <div className="flex items-center gap-3">
                      <Input
                        type="color"
                        className="h-10 w-16 cursor-pointer rounded border p-1"
                        {...field}
                      />
                      <Input
                        type="text"
                        placeholder="#3b82f6"
                        className="flex-1"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridad para Áreas de Entrega</FormLabel>
                  <div className="mb-2 text-muted-foreground text-sm">
                    Número que determina la prioridad cuando múltiples
                    sucursales cubren la misma zona (menor número = mayor
                    prioridad)
                  </div>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Ej: 1"
                      min="1"
                      {...field}
                      onChange={(e) =>
                        field.onChange(Number.parseInt(e.target.value, 10) || 1)
                      }
                      value={field.value}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center space-x-2 pt-4">
              <FormField
                control={form.control}
                name="available"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Sucursal Disponible
                      </FormLabel>
                      <div className="text-muted-foreground text-sm">
                        Activar para que la sucursal aparezca como disponible
                        para pedidos
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="mt-6 border-t pt-6">
              <h3 className="mb-4 text-center font-semibold text-lg">
                🕐 Horario de Atención
              </h3>
              <ScheduleManager
                available={form.watch("available")}
                openingHours={openingHours}
                onScheduleChange={(data) => {
                  form.setValue("available", data.available)
                  setOpeningHours(data.openingHours || [])
                }}
              />
            </div>

            <div className="mt-6 border-t pt-6">
              <h3 className="mb-4 text-center font-semibold text-lg">
                📅 Horarios Especiales
              </h3>
              <SpecialScheduleManager
                specialSchedules={specialSchedules}
                onScheduleChange={setSpecialSchedules}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">
                {mode === "create" ? "Crear Sucursal" : "Actualizar Sucursal"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
