"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Doc, Id } from "@workspace/backend/_generated/dataModel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import { useMutation, useQuery } from "convex/react"
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  Loader2Icon,
  MapPinnedIcon,
  PlusIcon,
} from "lucide-react"
import dynamic from "next/dynamic"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { CityKey, TemplateZoneDraft } from "@/modules/onboarding/types"

interface DeliveryZonesStepProps {
  organizationId: string
  onComplete: () => void
  onSkip: () => void
  onBack: () => void
}

const CITY_OPTIONS: Array<{
  value: CityKey
  label: string
  center: [number, number]
}> = [
  {
    value: "bucaramanga",
    label: "Bucaramanga",
    center: [7.1193, -73.1227],
  },
  {
    value: "bogota",
    label: "Bogotá",
    center: [4.711, -74.0721],
  },
]

const DeliveryAreaMapEditor = dynamic(
  () =>
    import("@/modules/dashboard/ui/components/delivery-area-map-editor").then(
      (mod) => mod.DeliveryAreaMapEditor
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[400px] w-full animate-pulse items-center justify-center rounded-lg border bg-muted/50">
        <p className="text-muted-foreground text-sm">
          Cargando editor de mapa...
        </p>
      </div>
    ),
  }
)

const OnboardingZonesMap = dynamic(
  () =>
    import("../../components/onboarding-zones-map").then(
      (mod) => mod.OnboardingZonesMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[360px] w-full animate-pulse items-center justify-center rounded-lg border bg-muted/50">
        <p className="text-muted-foreground text-sm">Cargando mapa...</p>
      </div>
    ),
  }
)

const createDefaultPolygon = (
  centerLat: number,
  centerLng: number,
  radiusKm = 1.3
): Array<{ lat: number; lng: number }> => {
  const latDelta = radiusKm / 111
  const lngDelta = radiusKm / (111 * Math.cos((centerLat * Math.PI) / 180))

  return [
    { lat: centerLat + latDelta, lng: centerLng - lngDelta },
    { lat: centerLat + latDelta, lng: centerLng + lngDelta },
    { lat: centerLat - latDelta, lng: centerLng + lngDelta },
    { lat: centerLat - latDelta, lng: centerLng - lngDelta },
  ]
}

const parseOptionalNumber = (value: string): number | undefined => {
  if (!value.trim()) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const toInputNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return ""
  return value.toString()
}

export function DeliveryZonesStep({
  organizationId,
  onComplete,
  onSkip,
  onBack,
}: DeliveryZonesStepProps) {
  const [selectedCity, setSelectedCity] = useState<CityKey | null>(null)
  const [zones, setZones] = useState<TemplateZoneDraft[]>([])
  const [selectedZoneKey, setSelectedZoneKey] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState("")
  const [defaultMinimumOrder, setDefaultMinimumOrder] = useState("")
  const [defaultEstimatedTime, setDefaultEstimatedTime] = useState("30-45 min")
  const [defaultLocationId, setDefaultLocationId] = useState("")
  const [defaultIsActive, setDefaultIsActive] = useState(true)

  const initializedCityRef = useRef<CityKey | null>(null)

  const existingZones = useQuery(
    api.private.deliveryAreas.getByOrganization,
    organizationId ? { organizationId } : "skip"
  )

  const locations = useQuery(
    api.private.restaurantLocations.list,
    organizationId ? { organizationId } : "skip"
  )

  const templates = useQuery(
    api.private.deliveryAreaTemplates.listByCity,
    selectedCity ? { cityKey: selectedCity } : "skip"
  )

  const saveStep3FromTemplates = useMutation(
    api.private.onboarding.saveStep3DeliveryZonesFromTemplates
  )

  const skipStep = useMutation(api.private.onboarding.skipStep)

  const hasExistingZones = !!existingZones && existingZones.length > 0
  const hasLocations = !!locations && locations.length > 0

  const selectedCityMeta = useMemo(
    () => CITY_OPTIONS.find((city) => city.value === selectedCity) ?? null,
    [selectedCity]
  )

  const selectedZone = useMemo(
    () => zones.find((zone) => zone.zoneKey === selectedZoneKey) ?? null,
    [zones, selectedZoneKey]
  )

  useEffect(() => {
    if (!locations || locations.length === 0) return
    setDefaultLocationId((prev) => prev || locations[0]?._id || "")
  }, [locations])

  useEffect(() => {
    if (!selectedCity || !templates || !locations) return
    if (initializedCityRef.current === selectedCity) return

    // Compute location directly from locations array to avoid stale
    // defaultLocationId state when both queries resolve in the same cycle.
    const resolvedLocationId = locations[0]?._id || ""

    const nextZones: TemplateZoneDraft[] = templates.map((template) => ({
      zoneKey: template.zoneKey,
      name: template.zoneName,
      coordinates: template.polygon,
      deliveryFee: template.defaultDeliveryFee,
      minimumOrder: template.defaultMinimumOrder,
      estimatedDeliveryTime: template.defaultEstimatedDeliveryTime,
      restaurantLocationId: resolvedLocationId,
      isActive: template.isActive,
      selected: true,
    }))

    setZones(nextZones)
    setSelectedZoneKey(nextZones[0]?.zoneKey ?? null)
    initializedCityRef.current = selectedCity
  }, [templates, selectedCity, locations])

  const updateZone = (
    zoneKey: string,
    updater: (zone: TemplateZoneDraft) => TemplateZoneDraft
  ) => {
    setZones((prev) =>
      prev.map((zone) => (zone.zoneKey === zoneKey ? updater(zone) : zone))
    )
  }

  const applyDefaults = (mode: "selected" | "all") => {
    const defaultFee = parseOptionalNumber(defaultDeliveryFee)
    const defaultMinOrder = parseOptionalNumber(defaultMinimumOrder)

    setZones((prev) =>
      prev.map((zone) => {
        if (mode === "selected" && !zone.selected) {
          return zone
        }

        return {
          ...zone,
          deliveryFee: defaultFee ?? null,
          minimumOrder: defaultMinOrder ?? null,
          estimatedDeliveryTime: defaultEstimatedTime.trim(),
          restaurantLocationId: defaultLocationId,
          isActive: defaultIsActive,
        }
      })
    )

    toast.success(
      mode === "selected"
        ? "Valores por defecto aplicados a zonas seleccionadas"
        : "Valores por defecto aplicados a todas las zonas"
    )
  }

  const handleAddManualZone = () => {
    if (!selectedCityMeta) return
    const center = selectedCityMeta.center
    const newZone: TemplateZoneDraft = {
      zoneKey: `manual-${Date.now()}`,
      name: "Nueva zona",
      coordinates: createDefaultPolygon(center[0], center[1]),
      deliveryFee: parseOptionalNumber(defaultDeliveryFee) ?? null,
      minimumOrder: parseOptionalNumber(defaultMinimumOrder) ?? null,
      estimatedDeliveryTime: defaultEstimatedTime,
      restaurantLocationId: defaultLocationId,
      isActive: defaultIsActive,
      selected: true,
    }

    setZones((prev) => [...prev, newZone])
    setSelectedZoneKey(newZone.zoneKey)
  }

  const validateZones = (): boolean => {
    const selected = zones.filter((zone) => zone.selected)

    if (selected.length === 0) {
      toast.error("Selecciona al menos una zona de entrega")
      return false
    }

    for (const zone of selected) {
      if (!zone.name.trim()) {
        toast.error("Todas las zonas seleccionadas deben tener nombre")
        return false
      }

      if (!zone.restaurantLocationId) {
        toast.error("Todas las zonas seleccionadas deben tener una sucursal")
        return false
      }

      if (zone.coordinates.length < 3) {
        toast.error(`La zona ${zone.name} debe tener al menos 3 puntos`)
        return false
      }

      if (zone.deliveryFee !== null && zone.deliveryFee < 0) {
        toast.error("El precio de entrega no puede ser negativo")
        return false
      }

      if (zone.minimumOrder !== null && zone.minimumOrder < 0) {
        toast.error("El pedido mínimo no puede ser negativo")
        return false
      }

      if (!zone.estimatedDeliveryTime.trim()) {
        toast.error("Todas las zonas seleccionadas deben tener tiempo estimado")
        return false
      }
    }

    return true
  }

  const handleSaveAndContinue = async () => {
    if (!organizationId || !selectedCity) return
    if (!validateZones()) return

    setIsSubmitting(true)
    try {
      const result = await saveStep3FromTemplates({
        organizationId,
        cityKey: selectedCity,
        defaults: {
          restaurantLocationId: defaultLocationId
            ? (defaultLocationId as Id<"restaurantLocations">)
            : undefined,
        },
        zones: zones.map((zone) => ({
          zoneKey: zone.zoneKey,
          name: zone.name,
          coordinates: zone.coordinates,
          selected: zone.selected,
          deliveryFee: zone.deliveryFee ?? undefined,
          minimumOrder: zone.minimumOrder ?? undefined,
          estimatedDeliveryTime: zone.estimatedDeliveryTime,
          restaurantLocationId: zone.restaurantLocationId
            ? (zone.restaurantLocationId as Id<"restaurantLocations">)
            : undefined,
          isActive: zone.isActive,
        })),
      })

      toast.success(`${result.zonesCreated} zona(s) de entrega creada(s)`)
      onComplete()
    } catch (error) {
      console.error("Error saving onboarding step 3 zones:", error)
      toast.error("Error al guardar las zonas de entrega")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = async () => {
    if (!organizationId) return
    try {
      await skipStep({
        organizationId,
        step: 4,
      })
      onSkip()
    } catch (error) {
      console.error("Error skipping step:", error)
      toast.error("Error al omitir el paso")
    }
  }

  if (!hasLocations && !hasExistingZones) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-bold text-2xl tracking-tight">
            Zonas de Entrega
          </h2>
          <p className="text-muted-foreground">
            Configura tus geolocalizaciones para definir cobertura y costos de
            entrega.
          </p>
        </div>

        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangleIcon className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-100">
                Primero configura tus sucursales
              </p>
              <p className="text-amber-700 text-sm dark:text-amber-300">
                Necesitas al menos una sucursal para asignar zonas de entrega.
              </p>
            </div>
          </CardContent>
        </Card>

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
        </div>
      </div>
    )
  }

  if (hasExistingZones) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-bold text-2xl tracking-tight">
            Zonas de Entrega
          </h2>
          <p className="text-muted-foreground">
            Ya tienes zonas configuradas. Puedes continuar al siguiente paso.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Zonas existentes</CardTitle>
            <CardDescription>
              Ya tienes {existingZones?.length || 0} zona(s) configurada(s).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {existingZones?.slice(0, 6).map((zone) => (
              <div
                key={zone._id}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                <div className="font-medium">{zone.name}</div>
                <div className="text-muted-foreground">
                  {zone.deliveryFee !== undefined
                    ? `$${zone.deliveryFee.toLocaleString("es-CO")}`
                    : "Sin costo"}
                  {zone.estimatedDeliveryTime
                    ? ` · ${zone.estimatedDeliveryTime}`
                    : ""}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

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
          <Button onClick={onComplete}>Continuar</Button>
        </div>
      </div>
    )
  }

  const selectedZones = zones.filter((zone) => zone.selected)
  const allSelectedHaveLocation =
    selectedZones.length > 0 &&
    selectedZones.every((zone) => !!zone.restaurantLocationId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-2xl tracking-tight">Zonas de Entrega</h2>
        <p className="text-muted-foreground">
          Selecciona una ciudad, aplica valores por defecto y ajusta cada zona
          en mapa y tabla.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ciudad y valores por defecto
          </CardTitle>
          <CardDescription>
            Los valores por defecto se aplican una sola vez y luego puedes
            personalizar cada zona.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="city">Ciudad</Label>
              <Select
                value={selectedCity || ""}
                onValueChange={(value) => {
                  const city = value as CityKey
                  setSelectedCity(city)
                  setZones([])
                  setSelectedZoneKey(null)
                  initializedCityRef.current = null
                }}
              >
                <SelectTrigger id="city">
                  <SelectValue placeholder="Selecciona una ciudad" />
                </SelectTrigger>
                <SelectContent>
                  {CITY_OPTIONS.map((city) => (
                    <SelectItem key={city.value} value={city.value}>
                      {city.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-location">Sucursal por defecto</Label>
              <Select
                value={defaultLocationId}
                onValueChange={setDefaultLocationId}
              >
                <SelectTrigger id="default-location">
                  <SelectValue placeholder="Selecciona una sucursal" />
                </SelectTrigger>
                <SelectContent>
                  {(locations || []).map((location) => (
                    <SelectItem key={location._id} value={location._id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="default-fee">Costo entrega</Label>
              <Input
                id="default-fee"
                type="number"
                min={0}
                placeholder="5000"
                value={defaultDeliveryFee}
                onChange={(e) => setDefaultDeliveryFee(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-min-order">Pedido mínimo</Label>
              <Input
                id="default-min-order"
                type="number"
                min={0}
                placeholder="20000"
                value={defaultMinimumOrder}
                onChange={(e) => setDefaultMinimumOrder(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-time">Tiempo estimado</Label>
              <Input
                id="default-time"
                placeholder="30-45 min"
                value={defaultEstimatedTime}
                onChange={(e) => setDefaultEstimatedTime(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-3">
              <Switch
                id="default-active"
                checked={defaultIsActive}
                onCheckedChange={(value) => setDefaultIsActive(!!value)}
              />
              <Label htmlFor="default-active">Activa por defecto</Label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyDefaults("selected")}
              disabled={zones.filter((zone) => zone.selected).length === 0}
            >
              Aplicar a seleccionadas
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyDefaults("all")}
              disabled={zones.length === 0}
            >
              Aplicar a todas
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAddManualZone}
              disabled={!selectedCity}
            >
              <PlusIcon className="mr-2 h-4 w-4" />
              Agregar zona manual
            </Button>
            <Badge variant="secondary">
              {zones.filter((zone) => zone.selected).length} seleccionada(s)
            </Badge>
          </div>
        </CardContent>
      </Card>

      {selectedCity && templates === undefined && (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Cargando zonas de ciudad...
          </CardContent>
        </Card>
      )}

      {selectedCity && zones.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPinnedIcon className="h-5 w-5" />
                Mapa de zonas
              </CardTitle>
              <CardDescription>
                Haz clic en una zona de la tabla o del mapa para editar su
                polígono.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <OnboardingZonesMap
                center={selectedCityMeta?.center ?? [7.1193, -73.1227]}
                zones={zones.map((zone) => ({
                  zoneKey: zone.zoneKey,
                  name: zone.name,
                  selected: zone.selected,
                  coordinates: zone.coordinates,
                }))}
                selectedZoneKey={selectedZoneKey}
                onSelectZone={setSelectedZoneKey}
              />

              {selectedZone ? (
                <div className="space-y-2">
                  <p className="font-medium text-sm">
                    Editar polígono: {selectedZone.name}
                  </p>
                  <DeliveryAreaMapEditor
                    coordinates={selectedZone.coordinates}
                    color="#0f766e"
                    onCoordinatesChange={(coords) => {
                      updateZone(selectedZone.zoneKey, (zone) => ({
                        ...zone,
                        coordinates: coords,
                      }))
                    }}
                    existingAreas={zones
                      .filter((zone) => zone.zoneKey !== selectedZone.zoneKey)
                      .map((zone, index) => ({
                        name: zone.name,
                        coordinates: zone.coordinates,
                        color: zone.selected ? "#3b82f6" : "#94a3b8",
                        isActive: zone.isActive,
                        restaurantLocationId: zone.restaurantLocationId,
                        restaurantLocationName:
                          (locations || []).find(
                            (loc: Doc<"restaurantLocations">) =>
                              loc._id === zone.restaurantLocationId
                          )?.name || "Sin sucursal",
                        restaurantLocationPriority: index + 1,
                        restaurantLocationColor: "#3b82f6",
                      }))}
                  />
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Selecciona una zona para editar su geocerca.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Configuración por zona
              </CardTitle>
              <CardDescription>
                Ajusta valores individuales y selección de zonas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-[760px] space-y-3 overflow-y-auto pr-1">
                {zones.map((zone) => {
                  const isSelected = selectedZoneKey === zone.zoneKey
                  return (
                    <div
                      key={zone.zoneKey}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedZoneKey(zone.zoneKey)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          setSelectedZoneKey(zone.zoneKey)
                        }
                      }}
                      className={`rounded-lg border p-3 transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/40"
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={zone.selected}
                            onCheckedChange={(value) =>
                              updateZone(zone.zoneKey, (current) => ({
                                ...current,
                                selected: !!value,
                              }))
                            }
                          />
                          <span className="font-medium text-sm">
                            {zone.name}
                          </span>
                        </div>
                        <Badge
                          variant={zone.selected ? "default" : "secondary"}
                        >
                          {zone.selected ? "Incluida" : "Excluida"}
                        </Badge>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor={`zone-name-${zone.zoneKey}`}>
                            Nombre
                          </Label>
                          <Input
                            id={`zone-name-${zone.zoneKey}`}
                            value={zone.name}
                            onChange={(e) =>
                              updateZone(zone.zoneKey, (current) => ({
                                ...current,
                                name: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`zone-time-${zone.zoneKey}`}>
                            Tiempo estimado
                          </Label>
                          <Input
                            id={`zone-time-${zone.zoneKey}`}
                            value={zone.estimatedDeliveryTime}
                            onChange={(e) =>
                              updateZone(zone.zoneKey, (current) => ({
                                ...current,
                                estimatedDeliveryTime: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`zone-fee-${zone.zoneKey}`}>
                            Costo entrega
                          </Label>
                          <Input
                            id={`zone-fee-${zone.zoneKey}`}
                            type="number"
                            min={0}
                            value={toInputNumber(zone.deliveryFee)}
                            onChange={(e) =>
                              updateZone(zone.zoneKey, (current) => ({
                                ...current,
                                deliveryFee: e.target.value
                                  ? Number.parseFloat(e.target.value)
                                  : null,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`zone-min-${zone.zoneKey}`}>
                            Pedido mínimo
                          </Label>
                          <Input
                            id={`zone-min-${zone.zoneKey}`}
                            type="number"
                            min={0}
                            value={toInputNumber(zone.minimumOrder)}
                            onChange={(e) =>
                              updateZone(zone.zoneKey, (current) => ({
                                ...current,
                                minimumOrder: e.target.value
                                  ? Number.parseFloat(e.target.value)
                                  : null,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor={`zone-location-${zone.zoneKey}`}>
                            Sucursal
                          </Label>
                          <Select
                            value={zone.restaurantLocationId}
                            onValueChange={(value) =>
                              updateZone(zone.zoneKey, (current) => ({
                                ...current,
                                restaurantLocationId: value,
                              }))
                            }
                          >
                            <SelectTrigger id={`zone-location-${zone.zoneKey}`}>
                              <SelectValue placeholder="Selecciona una sucursal" />
                            </SelectTrigger>
                            <SelectContent>
                              {(locations || []).map((location) => (
                                <SelectItem
                                  key={location._id}
                                  value={location._id}
                                >
                                  {location.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end gap-3">
                          <Switch
                            id={`zone-active-${zone.zoneKey}`}
                            checked={zone.isActive}
                            onCheckedChange={(value) =>
                              updateZone(zone.zoneKey, (current) => ({
                                ...current,
                                isActive: !!value,
                              }))
                            }
                          />
                          <Label htmlFor={`zone-active-${zone.zoneKey}`}>
                            Zona activa
                          </Label>
                        </div>
                      </div>

                      <p className="mt-2 text-muted-foreground text-xs">
                        {zone.coordinates.length} punto(s) de polígono
                      </p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
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
          onClick={handleSaveAndContinue}
          disabled={
            isSubmitting ||
            !selectedCity ||
            zones.length === 0 ||
            selectedZones.length === 0 ||
            !allSelectedHaveLocation
          }
        >
          {isSubmitting && (
            <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
          )}
          Guardar y continuar
        </Button>
      </div>
    </div>
  )
}
