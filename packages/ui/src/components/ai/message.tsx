import { MessageTimestamp } from "@workspace/ui/components/ai/message-timestamp"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  type MediaItem,
  MediaViewer,
} from "@workspace/ui/components/media-viewer"
import { cn } from "@workspace/ui/lib/utils"
import { Copy, ExternalLink, MapPin } from "lucide-react"
import type { ComponentProps, HTMLAttributes } from "react"
import { useEffect, useState } from "react"
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet"
import { toast } from "sonner"
// Leaflet CSS needs to be imported, but L object should be dynamic or safely used
import "leaflet/dist/leaflet.css"

export type AIMessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "user" | "assistant" | "advisor"
}

export const AIMessage = ({
  className,
  from,
  children,
  ...props
}: AIMessageProps) => (
  <div
    className={cn(
      "group flex w-full gap-2 py-2",
      from === "user" ? "justify-start" : "justify-end",
      from === "user" && "is-user",
      from === "advisor" && "is-advisor",
      className
    )}
    {...props}
  >
    <div className="relative max-w-[80%]">
      {children}
      {from && (
        <span
          className={cn(
            "absolute top-[-1px] scale-[1.5]",
            from === "user" ? "left-[-8px]" : "right-[-8px]"
          )}
          aria-hidden="true"
          data-icon="tail-out"
        >
          <svg
            viewBox="0 0 8 13"
            height="13"
            width="8"
            preserveAspectRatio="xMidYMid meet"
            version="1.1"
            x="0px"
            y="0px"
            enableBackground="new 0 0 8 13"
            className={cn(
              from === "user"
                ? "rotate-[90deg] fill-primary"
                : from === "advisor"
                  ? "rotate-[90deg] scale-y-[-1] fill-primary-200"
                  : "hidden"
            )}
            role="img"
            aria-label="Message tail"
          >
            <title>tail-out</title>
            <path
              opacity="0.13"
              d="M5.188,1H0v11.193l6.467-8.625 C7.526,2.156,6.958,1,5.188,1z"
            />
            <path d="M5.188,0H0v11.193l6.467-8.625C7.526,1.156,6.958,0,5.188,0z" />
          </svg>
        </span>
      )}
    </div>
  </div>
)

export type AIMessageContentProps = HTMLAttributes<HTMLDivElement> & {
  timestamp?: number // Unix timestamp in milliseconds
  from?: "user" | "assistant" | "advisor"
}

export const AIMessageContent = ({
  children,
  className,
  timestamp,
  from,
  ...props
}: AIMessageContentProps) => (
  <div
    className={cn(
      "relative break-words",
      "flex flex-col gap-2 rounded-lg border border-border px-3 py-2 text-sm",
      "bg-background text-foreground",
      "group-[.is-user]:border-transparent group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground",
      "group-[.is-advisor]:border-transparent group-[.is-advisor]:bg-primary-200 group-[.is-advisor]:text-primary-900",
      className
    )}
    {...props}
  >
    <div className="is-user:dark">{children}</div>
    {timestamp && (
      <MessageTimestamp
        timestamp={timestamp}
        className={cn("self-end text-xs leading-none")}
      />
    )}
  </div>
)

export type AIMessageAvatarProps = ComponentProps<typeof Avatar> & {
  src: string
  name?: string
}

export const AIMessageAvatar = ({
  src,
  name,
  className,
  ...props
}: AIMessageAvatarProps) => (
  <Avatar className={cn("size-8", className)} {...props}>
    <AvatarImage alt="" className="mt-0 mb-0" src={src} />
    <AvatarFallback>{name?.slice(0, 2) || "ME"}</AvatarFallback>
  </Avatar>
)

export type ImageAttachmentProps = {
  imageUrl: string
  mimeType: string
  caption?: string
  className?: string
  mediaId?: string
}

export const ImageAttachment = ({
  imageUrl,
  mimeType,
  caption,
  className,
  mediaId,
}: ImageAttachmentProps) => {
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false)

  // Only display if it's an image and has a valid URL
  if (!mimeType.startsWith("image/") || !imageUrl) {
    return null
  }

  const mediaItem: MediaItem = {
    id: mediaId || `image-${Date.now()}`,
    type: "image",
    url: imageUrl,
    name: caption,
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative max-w-sm overflow-hidden rounded-lg border">
        <img
          src={imageUrl}
          alt={caption || "Imagen adjunta"}
          width={300}
          height={200}
          className="h-auto w-full cursor-pointer object-cover transition-opacity hover:opacity-80"
          onClick={() => setMediaViewerOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              setMediaViewerOpen(true)
            }
          }}
        />
      </div>
      {caption && <p className="text-foreground text-sm">{caption}</p>}
      <MediaViewer
        media={[mediaItem]}
        open={mediaViewerOpen}
        onOpenChange={setMediaViewerOpen}
      />
    </div>
  )
}

export type AudioAttachmentProps = {
  audioUrl: string
  mimeType: string
  transcription?: string
  className?: string
}

export const AudioAttachment = ({
  audioUrl,
  mimeType,
  transcription,
  className,
}: AudioAttachmentProps) => {
  // Only display if it's an audio file
  if (!mimeType.startsWith("audio/")) {
    return null
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative max-w-sm overflow-hidden rounded-lg border bg-muted/50 p-3">
        <audio controls className="w-full" preload="metadata">
          <source src={audioUrl} type={mimeType} />
          <track kind="captions" srcLang="es" label="Transcripción" />
          Tu navegador no soporta el elemento de audio.
        </audio>
      </div>
      {transcription && (
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-foreground text-sm">
            <span className="font-medium text-muted-foreground">
              Transcripción:{" "}
            </span>
            {transcription}
          </p>
        </div>
      )}
    </div>
  )
}

export type MultipleMediaAttachmentProps = {
  mediaItems: Array<{
    id: string
    url: string
    type: "image" | "video"
    mimeType: string
    caption?: string
    thumbnail?: string
    name?: string
  }>
  className?: string
}

export const MultipleMediaAttachment = ({
  mediaItems,
  className,
}: MultipleMediaAttachmentProps) => {
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false)
  const [initialIndex, setInitialIndex] = useState(0)

  const handleMediaClick = (index: number) => {
    setInitialIndex(index)
    setMediaViewerOpen(true)
  }

  // Filter out items without valid URLs
  const validMediaItems = mediaItems.filter((item) => item.url)

  const mediaViewerItems: MediaItem[] = validMediaItems.map((item) => ({
    id: item.id,
    type: item.type,
    url: item.url,
    thumbnail: item.thumbnail,
    name: item.name || item.caption,
  }))

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid max-w-md grid-cols-2 gap-2">
        {validMediaItems.map((item, index) => (
          <div key={item.id} className="relative">
            {item.type === "image" ? (
              <div className="relative aspect-square overflow-hidden rounded-lg border">
                <img
                  src={item.url}
                  alt={item.caption || `Media ${index + 1}`}
                  className="h-full w-full cursor-pointer object-cover transition-opacity hover:opacity-80"
                  onClick={() => handleMediaClick(index)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      handleMediaClick(index)
                    }
                  }}
                />
              </div>
            ) : (
              <div
                className="relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-lg border bg-muted/50 transition-opacity hover:opacity-80"
                onClick={() => handleMediaClick(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    handleMediaClick(index)
                  }
                }}
                tabIndex={0}
                role="button"
              >
                <span className="text-2xl">▶</span>
              </div>
            )}
            {validMediaItems.length > 2 && index === 1 && (
              <div
                className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/60 transition-colors hover:bg-black/40"
                onClick={() => handleMediaClick(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    handleMediaClick(index)
                  }
                }}
                tabIndex={0}
                role="button"
              >
                <span className="font-medium text-white">
                  +{validMediaItems.length - 2}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <MediaViewer
        media={mediaViewerItems}
        initialIndex={initialIndex}
        open={mediaViewerOpen}
        onOpenChange={setMediaViewerOpen}
      />
    </div>
  )
}

export type FileAttachmentProps = {
  fileUrl: string
  mimeType: string
  fileName?: string
  caption?: string
  className?: string
}

export const FileAttachment = ({
  fileUrl,
  mimeType,
  fileName,
  caption,
  className,
}: FileAttachmentProps) => {
  const [showPdfModal, setShowPdfModal] = useState(false)

  // Don't display if it's an image or audio (handled by other components)
  if (mimeType.startsWith("image/") || mimeType.startsWith("audio/")) {
    return null
  }

  // Get file extension for display
  const getFileExtension = (url: string) => {
    const extension = url.split(".").pop()?.toUpperCase()
    return extension || "FILE"
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes("pdf")) return "📄"
    if (mimeType.includes("doc") || mimeType.includes("word")) return "📝"
    if (mimeType.includes("xls") || mimeType.includes("excel")) return "📊"
    if (mimeType.includes("ppt") || mimeType.includes("powerpoint")) return "📽️"
    if (mimeType.includes("zip") || mimeType.includes("rar")) return "📦"
    return "📎"
  }

  const extension = getFileExtension(fileUrl)
  const icon = getFileIcon(mimeType)
  const isPdf = mimeType.includes("pdf")

  // Enhanced PDF preview with modal
  if (isPdf) {
    return (
      <>
        <div className={cn("space-y-2", className)}>
          <div
            className="max-w-sm cursor-pointer overflow-hidden rounded-lg border bg-background shadow-sm transition-all hover:shadow-md"
            role="button"
            tabIndex={0}
            onClick={() => setShowPdfModal(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setShowPdfModal(true)
              }
            }}
          >
            {/* PDF Preview Card */}
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
                <span className="text-2xl">📄</span>
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm leading-tight">
                  {fileName || "Menú del restaurante.pdf"}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Click para ver • Documento PDF
                </p>
              </div>
              <div className="rounded bg-red-100 px-2 py-1 font-medium text-red-700 text-xs">
                PDF
              </div>
            </div>
          </div>
          {caption && <p className="text-foreground text-sm">{caption}</p>}
        </div>

        {/* PDF Preview Modal */}
        <Dialog open={showPdfModal} onOpenChange={setShowPdfModal}>
          <DialogContent className="flex h-[85vh] w-[80vw] max-w-none flex-col p-0 sm:max-w-none">
            <DialogHeader className="flex-shrink-0 border-b px-6 py-4">
              <DialogTitle className="flex items-center gap-2">
                <span className="text-xl">📄</span>
                <span className="truncate">
                  {fileName || "Menú del restaurante.pdf"}
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden p-6">
              <iframe
                src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                className="h-full w-full rounded-lg border bg-white"
                title={fileName || "PDF Document"}
              />
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // Original design for non-PDF files
  return (
    <div className={cn("space-y-2", className)}>
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block max-w-sm"
      >
        <div className="flex cursor-pointer items-center gap-3 rounded-lg border bg-muted/30 p-3 transition-colors hover:bg-muted/50">
          <div className="text-2xl">{icon}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground text-sm">
              {fileName || `Archivo.${extension.toLowerCase()}`}
            </p>
            <p className="text-muted-foreground text-xs">
              {mimeType} • Click para abrir
            </p>
          </div>
          <div className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs">
            {extension}
          </div>
        </div>
      </a>
      {caption && <p className="text-foreground text-sm">{caption}</p>}
    </div>
  )
}

export const LocationAttachment = ({
  latitude,
  longitude,
  name,
  address,
  className,
}: {
  latitude: number
  longitude: number
  name?: string
  address?: string
  className?: string
}) => {
  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const position: [number, number] = [latitude, longitude]

  // Custom SVG marker icon (red pin)
  const createCustomIcon = () => {
    // Dynamically import Leaflet to avoid SSR issues
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const L = require("leaflet")

    const svgIcon = `
      <svg width="30" height="49" viewBox="0 0 25 41" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.5 0C5.59644 0 0 5.59644 0 12.5C0 19.4036 12.5 41 12.5 41C12.5 41 25 19.4036 25 12.5C25 5.59644 19.4036 0 12.5 0Z" fill="#ef4444"/>
        <circle cx="12.5" cy="12.5" r="6" fill="white"/>
      </svg>
    `

    return L?.divIcon({
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

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  const openGoogleMaps = () => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      "_blank"
    )
  }

  if (!mounted) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="h-32 w-full animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="overflow-hidden rounded-lg border bg-background">
        <div
          className="relative z-0 h-48 cursor-pointer transition-opacity hover:opacity-90"
          onClick={() => setIsOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setIsOpen(true)
            }
          }}
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
          </MapContainer>

          {/* Overlay for better clickability and visual cue */}
          <div className="absolute inset-0 flex items-end bg-black/5 p-2">
            <div className="flex items-center gap-1 rounded bg-background/90 px-2 py-1 font-medium text-xs shadow-sm backdrop-blur">
              <MapPin className="h-3 w-3 text-red-500" />
              {name || "Ubicación"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t bg-muted/50 p-2">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 truncate text-blue-500 text-xs underline"
          >
            {`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
          </a>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation()
              navigator.clipboard.writeText(
                `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
              )
              toast.success("Enlace copiado")
            }}
            title="Copiar enlace"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="flex h-[90dvh] min-w-[70dvw] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="z-10 border-b bg-background p-4">
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-red-500" />
              <span>{name || "Ubicación compartida"}</span>
            </DialogTitle>
            {address && (
              <p className="text-muted-foreground text-sm">{address}</p>
            )}
          </DialogHeader>

          <div className="relative flex-1 bg-muted">
            {isOpen && (
              <MapContainer
                center={position}
                zoom={16}
                scrollWheelZoom={true}
                className="h-full w-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={position} icon={createCustomIcon()} />
                <MapController center={position} />
              </MapContainer>
            )}

            <div className="absolute right-4 bottom-4 z-[1000]">
              <Button onClick={openGoogleMaps} className="shadow-lg" size="sm">
                <ExternalLink className="mr-2 h-4 w-4" />
                Ver en Google Maps
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export type InteractiveMessageData = {
  type: string // "button", "list", "cta_url", "location_request"
  body?: string
  footer?: { text: string }
  buttons?: Array<{
    id: string
    title: string
  }>
  // List specific fields
  buttonText?: string
  sections?: Array<{
    title?: string
    rows: Array<{
      id: string
      title: string
      description?: string
    }>
  }>
  // CTA specific fields
  ctaButtonText?: string
  ctaUrl?: string
  // Header specific
  header?: {
    type: "image" | "video" | "text" | "document"
    text?: string
    imageUrl?: string
    videoUrl?: string
    documentUrl?: string
    documentFilename?: string
  }
}

export const InteractiveMessage = ({
  data,
}: {
  data: InteractiveMessageData
}) => {
  if (!data) return null

  // Shared Header Component
  const InteractiveHeader = () => {
    if (!data.header) return null

    switch (data.header.type) {
      case "image":
        return data.header.imageUrl ? (
          <img
            src={data.header.imageUrl}
            alt="Header"
            className="mb-2 max-h-48 w-full rounded-lg object-cover"
          />
        ) : null
      case "text":
        return data.header.text ? (
          <div className="mb-1 font-bold text-sm">{data.header.text}</div>
        ) : null
      case "video":
        return data.header.videoUrl ? (
          <div className="mb-2 rounded-lg bg-muted p-2 text-center text-muted-foreground text-xs">
            [Video: {data.header.videoUrl}]
          </div>
        ) : null
      case "document":
        return data.header.documentUrl ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted p-2 text-sm">
            <span>📄</span>
            <span className="truncate">
              {data.header.documentFilename || "Documento"}
            </span>
          </div>
        ) : null
      default:
        return null
    }
  }

  // Shared Footer Component
  const InteractiveFooter = () => {
    if (!data.footer?.text) return null
    return (
      <div className="mt-2 text-muted-foreground text-xs opacity-80">
        {data.footer.text}
      </div>
    )
  }

  // Helper to normalize content rendering
  const renderContent = () => {
    switch (data.type) {
      case "button":
        return (
          <div className="flex flex-col gap-2">
            <InteractiveHeader />
            {data.body && (
              <div className="whitespace-pre-wrap font-medium text-sm">
                {data.body}
              </div>
            )}
            <InteractiveFooter />
            <div className="mt-2 flex flex-wrap gap-2">
              {data.buttons?.map((btn) => (
                <Button
                  key={btn.id}
                  variant="outline"
                  size="sm"
                  className="cursor-default border-primary/20 bg-white text-primary hover:bg-white"
                >
                  {btn.title}
                </Button>
              ))}
            </div>
          </div>
        )

      case "list":
        return (
          <div className="flex flex-col gap-2 rounded-lg border bg-white/50 p-3">
            <InteractiveHeader />
            {data.body && (
              <div className="whitespace-pre-wrap font-medium text-sm">
                {data.body}
              </div>
            )}
            <InteractiveFooter />
            <div className="my-2 border-y py-2 text-center font-medium text-primary text-sm">
              {data.buttonText || "Ver opciones"}
            </div>
            {data.sections?.map((section, idx) => (
              <div key={idx} className="space-y-1">
                {section.title && (
                  <div className="mt-2 font-bold text-muted-foreground text-xs uppercase">
                    {section.title}
                  </div>
                )}
                {section.rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col rounded-md p-2 transition-colors hover:bg-black/5"
                  >
                    <div className="font-medium text-sm">{row.title}</div>
                    {row.description && (
                      <div className="text-wrap font-normal text-muted-foreground text-xs">
                        {row.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )

      case "cta_url":
        return (
          <div className="flex flex-col gap-2">
            <InteractiveHeader />
            {data.body && (
              <div className="whitespace-pre-wrap font-medium text-sm">
                {data.body}
              </div>
            )}
            <InteractiveFooter />
            <Button
              variant="outline"
              size="sm"
              className="w-full cursor-default hover:bg-background"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {data.ctaButtonText || "Ver enlace"}
            </Button>
          </div>
        )

      case "location_request":
        return (
          <div className="flex flex-col gap-2">
            {data.body && (
              <div className="whitespace-pre-wrap font-medium text-sm">
                {data.body}
              </div>
            )}
            <Button
              className="w-full cursor-default justify-start opacity-100"
              variant="outline"
            >
              <MapPin className="mr-2 h-4 w-4" />
              Compartir ubicación
            </Button>
          </div>
        )

      default:
        // Fallback for unknown types
        if (data.body) {
          return (
            <div className="whitespace-pre-wrap font-medium text-sm">
              {data.body}
            </div>
          )
        }
        return null
    }
  }

  return <div className="mt-1 w-full max-w-[85%]">{renderContent()}</div>
}
