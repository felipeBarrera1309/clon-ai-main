"use client"

import { MapContainer, Polygon, TileLayer } from "react-leaflet"
import "leaflet/dist/leaflet.css"

interface ZoneMapItem {
  zoneKey: string
  name: string
  selected: boolean
  coordinates: Array<{ lat: number; lng: number }>
}

interface OnboardingZonesMapProps {
  center: [number, number]
  zones: ZoneMapItem[]
  selectedZoneKey: string | null
  onSelectZone: (zoneKey: string) => void
}

export const OnboardingZonesMap = ({
  center,
  zones,
  selectedZoneKey,
  onSelectZone,
}: OnboardingZonesMapProps) => {
  return (
    <div className="h-[360px] w-full overflow-hidden rounded-lg border">
      <MapContainer center={center} zoom={12} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {zones
          .filter((zone) => zone.coordinates.length >= 3)
          .map((zone) => {
            const isSelected = selectedZoneKey === zone.zoneKey
            const isEnabled = zone.selected
            return (
              <Polygon
                key={zone.zoneKey}
                positions={zone.coordinates.map(
                  (coord) => [coord.lat, coord.lng] as [number, number]
                )}
                pathOptions={{
                  fillColor: isSelected ? "#0f766e" : "#3b82f6",
                  fillOpacity: isEnabled ? (isSelected ? 0.4 : 0.25) : 0.1,
                  color: isSelected ? "#0f766e" : "#2563eb",
                  weight: isSelected ? 3 : 2,
                  dashArray: isEnabled ? undefined : "6 4",
                }}
                eventHandlers={{
                  click: () => onSelectZone(zone.zoneKey),
                }}
              />
            )
          })}
      </MapContainer>
    </div>
  )
}
