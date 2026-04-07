import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import SearchInput from "@workspace/ui/components/search-input"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { cn } from "@workspace/ui/lib/utils"
import JSZip from "jszip"
import { CheckIcon, Download } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

export interface DeliveryArea {
  id: string
  name: string
  description?: string
  coordinates: Array<[number, number]> // [lat, lng]
  locationId: string
  deliveryFee?: number
  minimumOrder?: number
  estimatedDeliveryTime?: string
  openingHours?: Array<{
    day: string
    ranges: Array<{ open: string; close: string }>
  }>
}

export interface Location {
  id: string
  name: string
}

interface DeliveryAreasExportSelectorProps {
  areas: DeliveryArea[]
  locations: Location[]
  className?: string
}

type ExportFormat = "kml" | "csv"

function generateCSV(
  _locationName: string,
  locationCode: string,
  areas: DeliveryArea[]
): string {
  const header = [
    "nombre",
    "descripción",
    "coordenadas",
    "sucursal",
    "activo",
    "valor",
    "mínimo pedido",
    "tiempo estimado",
  ]

  const rows = areas.map((area) => {
    // Convert coordinates to [lat,lng;lat,lng] string
    const coordsStr = area.coordinates
      .map(([lat, lng]) => `${lat},${lng}`)
      .join(";")

    const row = [
      `"${area.name.replace(/"/g, '""')}"`,
      `"${(area.description || "").replace(/"/g, '""')}"`,
      `"${coordsStr}"`,
      `"${locationCode}"`,
      "true",
      area.deliveryFee?.toString() || "",
      area.minimumOrder?.toString() || "",
      `"${(area.estimatedDeliveryTime || "").replace(/"/g, '""')}"`,
    ]
    return row.join(",")
  })

  return [header.join(","), ...rows].join("\n")
}

function generateKML(locationName: string, areas: DeliveryArea[]): string {
  const placemarks = areas
    .map((area) => {
      const coordinates = area.coordinates
        .map(([lat, lng]) => `${lng},${lat},0`)
        .join(" ")

      const description = area.description || ""

      // ExtendedData for structured storage (Using Spanish keys for consistency with CSV export)
      const extendedData = `
        <ExtendedData>
          <Data name="valor">
            <value>${area.deliveryFee || 0}</value>
          </Data>
          <Data name="mínimo_pedido">
            <value>${area.minimumOrder || 0}</value>
          </Data>
          <Data name="tiempo_estimado">
            <value>${area.estimatedDeliveryTime || ""}</value>
          </Data>
        </ExtendedData>`

      return `    <Placemark>
      <name>${area.name}</name>
      <description><![CDATA[${description}]]></description>${extendedData}
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordinates}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`
    })
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Áreas de entrega - ${locationName}</name>
    <Folder>
      <name>${locationName}</name>
${placemarks}
    </Folder>
  </Document>
</kml>`
}

function downloadZIP(zip: JSZip, filename: string) {
  zip.generateAsync({ type: "blob" }).then((content: Blob) => {
    const url = URL.createObjectURL(content)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  })
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function DeliveryAreasExportSelector({
  areas,
  locations,
  className,
}: DeliveryAreasExportSelectorProps) {
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [format, setFormat] = useState<ExportFormat>("kml")
  const isMobile = useIsMobile()

  // Filtrar ubicaciones que tienen al menos una área de entrega
  const locationsWithAreas = useMemo(
    () =>
      locations.filter((location) =>
        areas.some((area) => area.locationId === location.id)
      ),
    [areas, locations]
  )

  // Seleccionar todas las ubicaciones por defecto cuando se abre el popover
  useEffect(() => {
    if (isOpen) {
      setSelectedLocations(locationsWithAreas.map((loc) => loc.id))
    }
  }, [isOpen, locationsWithAreas])

  // Si no hay ubicaciones con áreas, no renderizar el componente
  if (locationsWithAreas.length === 0) {
    return null
  }

  const locationMap = new Map(
    locationsWithAreas.map((loc) => [loc.id, loc.name])
  )

  const filteredLocations = locationsWithAreas.filter((location) =>
    location.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleToggleLocation = (locationId: string) => {
    setSelectedLocations((prev) =>
      prev.includes(locationId)
        ? prev.filter((id) => id !== locationId)
        : [...prev, locationId]
    )
  }

  const handleExport = async () => {
    if (selectedLocations.length === 0) {
      toast.error("Selecciona al menos una ubicación para exportar")
      return
    }

    try {
      if (selectedLocations.length === 1) {
        // Descargar directo para una sola ubicación
        const locationId = selectedLocations[0]!
        const location = locations.find((l) => l.id === locationId)
        if (location) {
          const locationAreas = areas.filter(
            (area) => area.locationId === locationId
          )
          const content =
            format === "kml"
              ? generateKML(location.name, locationAreas)
              : generateCSV(location.name, location.name, locationAreas) // Note: using name as code if code not in Location interface

          const extension = format === "kml" ? "kml" : "csv"
          const type =
            format === "kml"
              ? "application/vnd.google-earth.kml+xml"
              : "text/csv"

          downloadFile(content, `${location.name}.${extension}`, type)
          toast.success(`Ubicación ${location.name} exportada exitosamente`)
        }
      } else {
        // Crear ZIP para múltiples ubicaciones
        const zip = new JSZip()
        const timestamp = Date.now()

        selectedLocations.forEach((locationId) => {
          const location = locations.find((l) => l.id === locationId)
          if (location) {
            const locationAreas = areas.filter(
              (area) => area.locationId === locationId
            )
            if (locationAreas.length > 0) {
              const content =
                format === "kml"
                  ? generateKML(location.name, locationAreas)
                  : generateCSV(location.name, location.name, locationAreas)
              const extension = format === "kml" ? "kml" : "csv"
              zip.file(`${location.name}.${extension}`, content)
            }
          }
        })

        downloadZIP(zip, `areas-entrega-${timestamp}.zip`)
        toast.success(
          `Exportadas ${selectedLocations.length} ubicaciones exitosamente`
        )
      }
      setSelectedLocations([])
      setIsOpen(false)
    } catch (error) {
      console.error("Error al exportar áreas:", error)
      toast.error("Error al exportar las áreas")
    }
  }

  const handleSingleExport = async (
    location: Location,
    exportFormat: ExportFormat = "kml"
  ) => {
    try {
      const locationAreas = areas.filter(
        (area) => area.locationId === location.id
      )
      const content =
        exportFormat === "kml"
          ? generateKML(location.name, locationAreas)
          : generateCSV(location.name, location.name, locationAreas)

      const extension = exportFormat === "kml" ? "kml" : "csv"
      const type =
        exportFormat === "kml"
          ? "application/vnd.google-earth.kml+xml"
          : "text/csv"

      downloadFile(content, `${location.name}.${extension}`, type)
      toast.success(`Ubicación ${location.name} exportada exitosamente`)
    } catch (error) {
      console.error("Error al exportar ubicación:", error)
      toast.error("Error al exportar la ubicación")
    }
  }

  if (locationsWithAreas.length === 1) {
    const location = locationsWithAreas[0]!
    return (
      <div className="flex gap-1">
        <Button
          variant="outline"
          onClick={() => handleSingleExport(location, "kml")}
          className={cn(className)}
        >
          <Download className="mr-1 h-3 w-3" />
          KML
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSingleExport(location, "csv")}
          className={cn(className)}
        >
          <Download className="mr-1 h-3 w-3" />
          CSV
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn(className)}>
            <Download className="mr-1 h-3 w-3" />
            <span>Exportar</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="flex h-full w-64 flex-col overflow-hidden p-0"
          align="start"
        >
          <SearchInput
            inputProps={{
              placeholder: "Buscar ubicaciones...",
              value: searchQuery,
              onChange: (e) => setSearchQuery(e.target.value),
            }}
            clearButtonProps={{
              onClick: () => setSearchQuery(""),
            }}
            styleConfigs={{
              input: "focus-visible:ring-0 rounded-b-none border-b-0",
            }}
          />

          <div className="flex gap-2 border-gray-200 border-b bg-muted/20 p-2">
            <Button
              variant={format === "kml" ? "default" : "outline"}
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => setFormat("kml")}
            >
              KML
            </Button>
            <Button
              variant={format === "csv" ? "default" : "outline"}
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => setFormat("csv")}
            >
              CSV
            </Button>
          </div>

          <ScrollArea
            className="h-full overflow-hidden"
            viewportClassName="max-h-96"
          >
            {filteredLocations.length > 0 ? (
              filteredLocations.map((location, index) => {
                const isSelected = selectedLocations.includes(location.id)
                const locationAreas = areas.filter(
                  (area) => area.locationId === location.id
                )

                return (
                  <div
                    key={location.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-start gap-2 border-gray-200 border-b px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 focus:outline-none",
                      index < filteredLocations.length - 1 ? "" : "border-b-0",
                      isSelected && "bg-accent"
                    )}
                    onClick={() => handleToggleLocation(location.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleToggleLocation(location.id)
                      }
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      onChange={() => handleToggleLocation(location.id)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 text-gray-700">
                      {location.name} ({locationAreas.length} áreas)
                    </span>
                    {isSelected && (
                      <CheckIcon className="h-4 w-4 text-primary" />
                    )}
                  </div>
                )
              })
            ) : (
              <div className="px-3 py-4 text-center text-gray-500 text-sm">
                No se encontraron ubicaciones
              </div>
            )}
          </ScrollArea>

          {selectedLocations.length > 0 && (
            <div className="flex w-full gap-2 border-gray-300 border-t p-2">
              <Button
                variant="outline"
                onClick={() => setSelectedLocations([])}
                className="flex-1 text-sm"
              >
                Limpiar
              </Button>
              <Button
                variant="default"
                onClick={handleExport}
                className="flex-1 text-sm"
              >
                <Download className="mr-1 h-4 w-4" />
                Exportar ({selectedLocations.length})
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
