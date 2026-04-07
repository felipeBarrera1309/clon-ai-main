"use client"

import { cn } from "@workspace/ui/lib/utils"
import L from "leaflet"
import { Check, Copy, ExternalLink, MapPin } from "lucide-react"
import { useEffect, useState } from "react"
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet"
import { toast } from "sonner"

// Custom SVG marker icon (red pin)
const createCustomIcon = () => {
  const svgIcon = `
    <svg width="30" height="49" viewBox="0 0 25 41" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.5 0C5.59644 0 0 5.59644 0 12.5C0 19.4036 12.5 41 12.5 41C12.5 41 25 19.4036 25 12.5C25 5.59644 19.4036 0 12.5 0Z" fill="#ef4444"/>
      <circle cx="12.5" cy="12.5" r="6" fill="white"/>
    </svg>
  `

  return L.divIcon({
    html: svgIcon,
    className: "custom-marker-icon",
    iconSize: [30, 49],
    iconAnchor: [15, 49],
    popupAnchor: [0, -49],
  })
}

// Component to control map center
const MapController = ({ center }: { center: [number, number] }) => {
  const map = useMap()

  useEffect(() => {
    map.setView(center, map.getZoom())
  }, [center, map])

  return null
}

interface LocationPreviewProps {
  latitude: number
  longitude: number
  address?: string
  enableCopy?: boolean
}

export const LocationPreview = ({
  latitude,
  longitude,
  address,
  enableCopy = false,
}: LocationPreviewProps) => {
  const position: [number, number] = [latitude, longitude]
  const [copied, setCopied] = useState(false)

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
      if (document.head.contains(style)) {
        document.head.removeChild(style)
      }
      if (document.head.contains(link)) {
        document.head.removeChild(link)
      }
    }
  }, [])

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`

  const openGoogleMaps = () => {
    window.open(mapsUrl, "_blank")
  }

  const copyToClipboard = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent opening the map
    navigator.clipboard.writeText(mapsUrl)
    setCopied(true)
    toast.success("Enlace de Google Maps copiado")
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-background">
      <div
        className="relative z-0 h-48 w-full cursor-pointer transition-opacity hover:opacity-90 sm:h-56"
        onClick={openGoogleMaps}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            openGoogleMaps()
          }
        }}
        title="Abrir en Google Maps"
      >
        <MapContainer
          center={position}
          zoom={15}
          scrollWheelZoom={false}
          zoomControl={false}
          dragging={false}
          doubleClickZoom={false}
          attributionControl={false}
          className="pointer-events-none h-full w-full"
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={position} icon={createCustomIcon()} />
          <MapController center={position} />
        </MapContainer>

        {/* Hover Watermark */}
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="flex items-center gap-2 font-medium text-sm text-white">
            <ExternalLink className="h-4 w-4" />
            Abrir mapa
          </div>
        </div>
      </div>

      {/* Footer Section */}
      {(address || enableCopy) && (
        <div className="flex flex-col gap-2 border-t bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span
              className="truncate font-medium text-[10px] text-muted-foreground sm:text-xs"
              title={address}
            >
              {address || "Ubicación seleccionada"}
            </span>
          </div>

          {enableCopy && (
            <button
              type="button"
              onClick={copyToClipboard}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-xs transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                copied ? "text-green-600" : "text-muted-foreground"
              )}
              title="Copiar enlace de Google Maps"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copiar Link</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
