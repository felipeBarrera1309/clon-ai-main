/** biome-ignore-all lint/suspicious/noArrayIndexKey: Using index as key is acceptable for static delivery area rendering */
"use client"

import L from "leaflet"
import { useEffect, useRef, useState } from "react"
import {
  MapContainer,
  Polygon,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  AlertTriangleIcon,
  EditIcon,
  SaveIcon,
  Trash2Icon,
  UndoIcon,
  XIcon,
} from "lucide-react"
import { validateAndNormalizeCoordinates } from "@/lib/coordinate-utils"

const BUCARAMANGA_CENTER: [number, number] = [7.1193, -73.1227]

interface Coordinate {
  lat: number
  lng: number
}

interface DeliveryAreaMapEditorProps {
  coordinates: Coordinate[]
  color: string
  onCoordinatesChange: (coordinates: Coordinate[]) => void
  isEditing?: boolean
  existingAreas?: Array<{
    name: string
    coordinates: Coordinate[]
    color: string
    isActive: boolean
    restaurantLocationId: string
    restaurantLocationName: string
    restaurantLocationPriority: number
    restaurantLocationColor: string
  }>
}

// Component to handle manual drawing with click events
const ManualDrawingControls = ({
  onCoordinatesChange,
  color,
  coordinates,
}: {
  onCoordinatesChange: (coordinates: Coordinate[]) => void
  color: string
  coordinates: Coordinate[]
  isDrawing: boolean
  onFinishDrawing: () => void
}) => {
  const [tempPoints, setTempPoints] = useState<Coordinate[]>(coordinates)
  const markersRef = useRef<L.Marker[]>([])
  const map = useMap()

  // Clear markers when component unmounts or drawing stops
  useEffect(() => {
    return () => {
      markersRef.current.forEach((marker) => {
        map.removeLayer(marker)
      })
      markersRef.current = []
    }
  }, [map])

  // Handle map clicks for drawing
  useMapEvents({
    click: (e) => {
      const newPoint = { lat: e.latlng.lat, lng: e.latlng.lng }
      const newPoints = [...tempPoints, newPoint]

      // Add marker for this point
      const marker = L.marker([e.latlng.lat, e.latlng.lng], {
        icon: L.divIcon({
          className: "custom-div-icon",
          html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        }),
      })

      marker.addTo(map)
      markersRef.current.push(marker)

      setTempPoints(newPoints)
      onCoordinatesChange(newPoints)
    },
  })

  // Update markers when coordinates change externally
  useEffect(() => {
    if (coordinates.length !== tempPoints.length) {
      setTempPoints(coordinates)

      // Clear existing markers
      markersRef.current.forEach((marker) => {
        map.removeLayer(marker)
      })
      markersRef.current = []

      // Add markers for existing coordinates
      coordinates.forEach((coord) => {
        const marker = L.marker([coord.lat, coord.lng], {
          icon: L.divIcon({
            className: "custom-div-icon",
            html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          }),
        })

        marker.addTo(map)
        markersRef.current.push(marker)
      })
    }
  }, [coordinates, color, map, tempPoints.length])

  return null
}

export const DeliveryAreaMapEditor = ({
  coordinates,
  color,
  onCoordinatesChange,
  existingAreas = [],
}: DeliveryAreaMapEditorProps) => {
  const [isDrawingMode, setIsDrawingMode] = useState(false)
  const [coordinateWarnings, setCoordinateWarnings] = useState<string[]>([])

  // Validate coordinates when they change
  useEffect(() => {
    if (coordinates.length > 0) {
      const validation = validateAndNormalizeCoordinates(coordinates)
      setCoordinateWarnings(validation.warnings)
    } else {
      setCoordinateWarnings([])
    }
  }, [coordinates])

  const handleStartDrawing = () => {
    setIsDrawingMode(true)
  }

  const handleFinishDrawing = () => {
    setIsDrawingMode(false)
  }

  const handleUndoLastPoint = () => {
    if (coordinates.length > 0) {
      const newCoordinates = coordinates.slice(0, -1)
      onCoordinatesChange(newCoordinates)
    }
  }

  const handleClearAll = () => {
    onCoordinatesChange([])
    setIsDrawingMode(false)
  }

  const canCompletePolygon = coordinates.length >= 3

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-lg">Definir Área de Entrega</h3>
          {coordinates.length > 0 && (
            <Badge variant="outline">
              {coordinates.length} puntos definidos
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isDrawingMode ? (
            <>
              <Button onClick={handleStartDrawing} size="sm">
                <EditIcon className="mr-2 size-4" />
                {coordinates.length === 0
                  ? "Dibujar Área"
                  : "Continuar Dibujando"}
              </Button>
              {coordinates.length > 0 && (
                <Button onClick={handleClearAll} size="sm" variant="outline">
                  <Trash2Icon className="mr-2 size-4" />
                  Limpiar
                </Button>
              )}
            </>
          ) : (
            <>
              {coordinates.length > 0 && (
                <Button
                  onClick={handleUndoLastPoint}
                  size="sm"
                  variant="outline"
                >
                  <UndoIcon className="mr-2 size-4" />
                  Deshacer
                </Button>
              )}
              {canCompletePolygon && (
                <Button
                  onClick={handleFinishDrawing}
                  size="sm"
                  variant="default"
                >
                  <SaveIcon className="mr-2 size-4" />
                  Completar Área
                </Button>
              )}
              <Button
                onClick={() => setIsDrawingMode(false)}
                size="sm"
                variant="outline"
              >
                <XIcon className="mr-2 size-4" />
                Cancelar
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="h-[400px] w-full overflow-hidden rounded-lg border">
        <MapContainer
          center={BUCARAMANGA_CENTER}
          zoom={11}
          scrollWheelZoom={true}
          className="h-full w-full"
          style={{ cursor: isDrawingMode ? "crosshair" : "grab" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Existing areas (for context) */}
          {existingAreas.map((area, index) => (
            <Polygon
              key={index}
              positions={area.coordinates.map(
                (coord) => [coord.lat, coord.lng] as [number, number]
              )}
              pathOptions={{
                fillColor: area.color,
                fillOpacity: 0.1,
                color: area.color,
                weight: 1,
                dashArray: "5, 5",
              }}
              eventHandlers={{
                click: (e) => {
                  const popup = L.popup()
                    .setLatLng(e.latlng)
                    .setContent(`
                      <div style="min-width: 200px;">
                        <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">
                          ${area.name}
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                          <div style="width: 12px; height: 12px; border-radius: 50%; border: 1px solid #ccc; background-color: ${area.restaurantLocationColor};"></div>
                          <span style="font-weight: 500; color: #374151;">${area.restaurantLocationName}</span>
                        </div>
                        <div style="display: inline-block; padding: 2px 8px; background-color: #f3f4f6; border-radius: 4px; font-size: 12px; color: #6b7280; margin-bottom: 6px;">
                          Prioridad ${area.restaurantLocationPriority}
                        </div>
                        <div style="font-size: 12px; color: #6b7280;">
                          Estado: <span style="font-weight: 500; color: ${area.isActive ? "#059669" : "#dc2626"}">${area.isActive ? "Activa" : "Inactiva"}</span>
                        </div>
                      </div>
                    `)
                  popup.openOn(e.target._map)
                },
              }}
            />
          ))}

          {/* Current polygon being drawn */}
          {coordinates.length >= 3 && (
            <Polygon
              positions={coordinates.map(
                (coord) => [coord.lat, coord.lng] as [number, number]
              )}
              pathOptions={{
                fillColor: color,
                fillOpacity: 0.3,
                color: color,
                weight: 2,
              }}
            />
          )}

          {/* Drawing controls */}
          <ManualDrawingControls
            onCoordinatesChange={onCoordinatesChange}
            color={color}
            coordinates={coordinates}
            isDrawing={isDrawingMode}
            onFinishDrawing={handleFinishDrawing}
          />
        </MapContainer>
      </div>

      {isDrawingMode && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-blue-900">
                Modo de Dibujo Activo
              </h4>
              <p className="text-blue-700 text-sm">
                Haz clic en el mapa para agregar puntos. Necesitas al menos 3
                puntos para crear un área.
                {coordinates.length > 0 &&
                  ` Puntos actuales: ${coordinates.length}`}
                {canCompletePolygon && " - ¡Ya puedes completar el área!"}
              </p>
            </div>
          </div>
        </div>
      )}

      {coordinates.length >= 3 && !isDrawingMode && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <SaveIcon className="size-4 text-green-600" />
            <span className="font-medium text-green-900">
              Área definida correctamente
            </span>
          </div>
          <p className="mt-1 text-green-700 text-sm">
            Se ha creado un polígono con {coordinates.length} puntos. Puedes
            guardar el área o seguir editando.
          </p>
        </div>
      )}

      {coordinateWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangleIcon className="size-4 text-amber-600" />
            <span className="font-medium text-amber-900">
              Coordenadas corregidas automáticamente
            </span>
          </div>
          <p className="mb-2 text-amber-700 text-sm">
            Algunas coordenadas estaban fuera de los rangos válidos y fueron
            corregidas:
          </p>
          <ul className="space-y-1 text-amber-700 text-sm">
            {coordinateWarnings.map((warning, index) => (
              <li key={index} className="text-xs">
                • {warning}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
