"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"

export interface MediaItem {
  id: string
  type: "image" | "video"
  url: string
  thumbnail?: string
  name?: string
}

interface MediaViewerProps {
  media: MediaItem[]
  initialIndex?: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MediaViewer({
  media,
  initialIndex = 0,
  open,
  onOpenChange,
}: MediaViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const previousIndexRef = useRef(initialIndex)

  const currentMedia = media[currentIndex]

  // Reset zoom and position when changing media
  useEffect(() => {
    if (previousIndexRef.current !== currentIndex) {
      setZoom(1)
      setPosition({ x: 0, y: 0 })
      previousIndexRef.current = currentIndex
    }
  }, [currentIndex])

  // Update index when initialIndex changes
  useEffect(() => {
    setCurrentIndex(initialIndex)
  }, [initialIndex])

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : media.length - 1))
  }, [media.length])

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < media.length - 1 ? prev + 1 : 0))
  }, [media.length])

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.5, 4))
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.5, 0.5))
  }

  const handleDownload = async () => {
    if (!currentMedia) return

    try {
      // First try to fetch the image to validate the URL
      const testResponse = await fetch(currentMedia.url, { method: "HEAD" })
      if (!testResponse.ok) {
        console.error(
          "[MediaViewer] URL not accessible:",
          currentMedia.url,
          testResponse.status
        )
        return
      }

      const response = await fetch(currentMedia.url)
      if (!response.ok) {
        console.error(
          "[MediaViewer] Failed to fetch image:",
          response.status,
          response.statusText
        )
        return
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = currentMedia.name || `media-${currentMedia.id}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("[MediaViewer] Error downloading media:", error)
      console.error("[MediaViewer] Media URL:", currentMedia.url)
      console.error("[MediaViewer] Media type:", currentMedia.type)
    }
  }

  // Keyboard navigation
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrevious()
      if (e.key === "ArrowRight") handleNext()
      if (e.key === "Escape") onOpenChange(false)
      if (e.key === "+" || e.key === "=") handleZoomIn()
      if (e.key === "-") handleZoomOut()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, handlePrevious, handleNext, onOpenChange])

  // Mouse drag for panning when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.deltaY < 0) {
      handleZoomIn()
    } else {
      handleZoomOut()
    }
  }

  if (!currentMedia) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!h-dvh !max-h-[80dvh] !max-w-5xl w-max border-0 border-r-2 bg-black/95 p-0"
        onPointerDownOutside={(e: Event) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">
          Visor de medios -{" "}
          {currentMedia.name || `Media ${currentIndex + 1} de ${media.length}`}
        </DialogTitle>

        {/* Header */}
        <div className="absolute top-0 right-0 left-0 z-50 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </Button>
            <span className="font-medium text-sm text-white">
              {currentIndex + 1} / {media.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              className="text-white hover:bg-white/20"
            >
              <ZoomOut className="h-5 w-5" />
            </Button>
            <span className="min-w-[3rem] text-center text-sm text-white">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              disabled={zoom >= 4}
              className="text-white hover:bg-white/20"
            >
              <ZoomIn className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              className="text-white hover:bg-white/20"
            >
              <Download className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Media Content */}
        <div
          className="relative flex h-full w-full min-w-2xl items-center justify-center overflow-hidden bg-black"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          role="application"
        >
          {currentMedia.type === "image" ? (
            <img
              src={currentMedia.url || "/placeholder.svg"}
              alt={currentMedia.name || "Media"}
              className={cn(
                "max-h-full max-w-full object-contain transition-transform",
                zoom > 1 && "cursor-move",
                isDragging && "cursor-grabbing"
              )}
              style={{
                transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                userSelect: "none",
              }}
              draggable={false}
              onError={(e) => {
                console.error(
                  "[MediaViewer] Failed to load image:",
                  currentMedia.url
                )
                console.error("[MediaViewer] Image element:", e.currentTarget)
                // Try to use placeholder as fallback
                e.currentTarget.src = "/placeholder.svg"
              }}
              onLoad={() => {
                console.log(
                  "[MediaViewer] Image loaded successfully:",
                  currentMedia.url
                )
              }}
            />
          ) : (
            <video
              src={currentMedia.url}
              controls
              className="max-h-full max-w-full"
              style={{
                transform: `scale(${zoom})`,
              }}
            >
              <track
                kind="captions"
                src="data:text/vtt,WEBVTT"
                srcLang="es"
                label="Español"
              />
              Tu navegador no soporta el elemento de video.
            </video>
          )}
        </div>

        {/* Navigation Arrows */}
        {media.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrevious}
              className="-translate-y-1/2 absolute top-1/2 left-4 z-50 h-12 w-12 text-white hover:bg-white/20"
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNext}
              className="-translate-y-1/2 absolute top-1/2 right-4 z-50 h-12 w-12 text-white hover:bg-white/20"
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          </>
        )}

        {/* Thumbnail Strip (optional, for WhatsApp-like experience) */}
        {media.length > 1 && (
          <div className="absolute right-0 bottom-0 left-0 z-50 bg-gradient-to-t from-black/60 to-transparent p-4">
            <div className="flex justify-center gap-2 overflow-x-auto pb-2">
              {media.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setCurrentIndex(index)}
                  className={cn(
                    "h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all",
                    index === currentIndex
                      ? "scale-110 border-white"
                      : "border-white/30 opacity-60 hover:opacity-100"
                  )}
                >
                  {item.type === "image" ? (
                    <img
                      src={item.thumbnail || item.url}
                      alt={`Thumbnail ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-black/50">
                      <span className="text-white text-xs">▶</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
