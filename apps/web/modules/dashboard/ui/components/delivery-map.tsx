/** biome-ignore-all lint/suspicious/noArrayIndexKey: Using index as key is acceptable for static delivery area rendering */
"use client"

import L from "leaflet"
import { useEffect } from "react"
import {
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet"
import "leaflet/dist/leaflet.css"
import type { Doc, Id } from "@workspace/backend/_generated/dataModel"

// Custom SVG marker icon
const createCustomIcon = (color: string = "#ef4444") => {
  const svgIcon = `
    <svg width="25" height="41" viewBox="0 0 25 41" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.5 0C5.59644 0 0 5.59644 0 12.5C0 19.4036 12.5 41 12.5 41C12.5 41 25 19.4036 25 12.5C25 5.59644 19.4036 0 12.5 0Z" fill="${color}"/>
      <circle cx="12.5" cy="12.5" r="6" fill="white"/>
    </svg>
  `

  return L.divIcon({
    html: svgIcon,
    className: "custom-marker-icon",
    iconSize: [25, 41],
    iconAnchor: [12.5, 41],
    popupAnchor: [0, -41],
  })
}

// Bucaramanga center coordinates
const BUCARAMANGA_CENTER: [number, number] = [7.1193, -73.1227]

// Component to control map center
const MapController = ({
  selectedLocation,
}: {
  selectedLocation: Doc<"restaurantLocations"> | null
}) => {
  const map = useMap()

  useEffect(() => {
    if (selectedLocation) {
      // Center map on selected location
      const coordinates: [number, number] = [
        selectedLocation.coordinates.latitude,
        selectedLocation.coordinates.longitude,
      ]
      map.flyTo(coordinates, 13, {
        duration: 1.5,
      })
    } else {
      // Return to general view (Bucaramanga center) when "general" is selected
      map.flyTo(BUCARAMANGA_CENTER, 11, {
        duration: 1.5,
      })
    }
  }, [selectedLocation, map])

  return null
}

interface DeliveryMapProps {
  areas?: Doc<"deliveryAreas">[]
  locations?: Doc<"restaurantLocations">[]
  selectedLocation?: Doc<"restaurantLocations"> | null
}

export const DeliveryMap = ({
  areas = [],
  locations = [],
  selectedLocation = null,
}: DeliveryMapProps) => {
  // Helper function to get the color for a delivery area based on its restaurant location
  const getAreaColor = (restaurantLocationId: Id<"restaurantLocations">) => {
    const location = locations.find((loc) => loc._id === restaurantLocationId)
    return location?.color || "#3b82f6" // Default blue if location not found
  }

  // Convert areas to the format expected by Leaflet
  const deliveryZones = areas
    .filter((area) => area.isActive)
    .map((area) => {
      const location = locations.find(
        (loc) => loc._id === area.restaurantLocationId
      )
      return {
        name: area.name,
        locationName: location?.name || "Ubicación no encontrada",
        priority: location?.priority || 0,
        color: getAreaColor(area.restaurantLocationId),
        coordinates: area.coordinates.map(
          (coord) => [coord.lat, coord.lng] as [number, number]
        ),
        deliveryFee: area.deliveryFee,
        minimumOrder: area.minimumOrder,
        estimatedDeliveryTime: area.estimatedDeliveryTime,
      }
    })
  useEffect(() => {
    // Ensure Leaflet CSS is loaded
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    document.head.appendChild(link)

    // Add custom marker styles
    const style = document.createElement("style")
    style.textContent = `
      .custom-marker-icon {
        background: none !important;
        border: none !important;
      }
    `
    document.head.appendChild(style)

    return () => {
      if (document.head.contains(link)) {
        document.head.removeChild(link)
      }
      if (document.head.contains(style)) {
        document.head.removeChild(style)
      }
    }
  }, [])

  return (
    <div className="relative z-0 h-[600px] w-full overflow-hidden rounded-lg border">
      <MapContainer
        center={BUCARAMANGA_CENTER}
        zoom={11}
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Restaurant location markers */}
        {locations.map((location) => (
          <Marker
            key={location._id}
            position={[
              location.coordinates.latitude,
              location.coordinates.longitude,
            ]}
            icon={createCustomIcon(location.color)}
          >
            <Popup>
              <div className="text-center">
                <h3 className="font-semibold">{location.name}</h3>
                <p className="text-muted-foreground text-sm">
                  Código: {location.code}
                </p>
                <p className="text-muted-foreground text-sm">
                  {location.address}
                </p>
                <div
                  className="mx-auto mt-2 h-4 w-4 rounded-full"
                  style={{ backgroundColor: location.color }}
                />
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Map controller for centering */}
        <MapController selectedLocation={selectedLocation} />

        {/* Delivery zones */}
        {deliveryZones.map((zone, index) => (
          <Polygon
            key={index}
            positions={zone.coordinates}
            pathOptions={{
              fillColor: zone.color,
              fillOpacity: 0.3,
              color: zone.color,
              weight: 2,
            }}
          >
            <Popup>
              <div className="min-w-48 text-center">
                <h3 className="mb-1 font-semibold">{zone.name}</h3>
                <div className="space-y-0 text-sm leading-tight">
                  <p className="text-muted-foreground leading-none">
                    📍 Sucursal: {zone.locationName}
                  </p>
                  <p className="text-muted-foreground leading-none">
                    ⭐ Prioridad: {zone.priority}
                  </p>
                  {zone.deliveryFee !== undefined && (
                    <p className="text-muted-foreground leading-none">
                      💰 Costo de entrega: ${zone.deliveryFee}
                    </p>
                  )}
                  {zone.minimumOrder !== undefined && (
                    <p className="text-muted-foreground leading-none">
                      📦 Pedido mínimo: ${zone.minimumOrder}
                    </p>
                  )}
                  {zone.estimatedDeliveryTime && (
                    <p className="text-muted-foreground leading-none">
                      ⏰ Tiempo estimado: {zone.estimatedDeliveryTime}
                    </p>
                  )}
                </div>
                <div
                  className="mx-auto mt-3 h-4 w-4 rounded-full"
                  style={{ backgroundColor: zone.color }}
                />
              </div>
            </Popup>
          </Polygon>
        ))}
      </MapContainer>
    </div>
  )
}
