"use client"

import { Button } from "@workspace/ui/components/button"
import { ScrollArea, ScrollBar } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type * as React from "react"
import { useEffect, useRef, useState } from "react"

function SmartHorizontalScrollArea({
  containerClassName,
  className,
  children,
  viewportClassName,
  childProps,
  ...props
}: React.ComponentProps<typeof ScrollArea> & {
  containerClassName?: string
  viewportClassName?: string
  childProps?: React.HTMLAttributes<HTMLDivElement>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null!)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = () => {
    if (viewportRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = viewportRef.current
      const hasOverflow = scrollWidth > clientWidth
      setCanScrollLeft(hasOverflow && scrollLeft > 0)
      setCanScrollRight(
        hasOverflow && scrollLeft < scrollWidth - clientWidth - 1
      ) // -1 for rounding errors
    }
  }

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport) {
      // Use a timeout to ensure the DOM is fully rendered
      const timeoutId = setTimeout(() => {
        checkScroll()
        viewport.addEventListener("scroll", checkScroll)
      }, 100) // Increased timeout

      return () => {
        clearTimeout(timeoutId)
        viewport.removeEventListener("scroll", checkScroll)
      }
    }
  }, [])

  // Also check scroll when children change (content might have been added/removed)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      checkScroll()
    }, 100) // Increased timeout
    return () => clearTimeout(timeoutId)
  }, [children])

  // Use ResizeObserver to detect when content size changes
  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport && "ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(() => {
        setTimeout(checkScroll, 50)
      })
      resizeObserver.observe(viewport)
      return () => resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    if (viewportRef.current && childProps) {
      // Acceder al primer hijo directo del viewport (el div generado por Radix)
      const firstChild = viewportRef.current.firstElementChild as HTMLElement
      if (firstChild) {
        // Aplicar props programáticamente al primer hijo directo
        Object.entries(childProps).forEach(([key, value]) => {
          if (key.startsWith("on") && typeof value === "function") {
            // Para event handlers, usar addEventListener
            const eventName = key.toLowerCase().slice(2)
            firstChild.addEventListener(eventName, value as EventListener)
          } else if (key === "style" && typeof value === "object") {
            // Para estilos, aplicar directamente
            Object.assign(firstChild.style, value)
          } else {
            // Para otros atributos, usar setAttribute
            firstChild.setAttribute(key, String(value))
          }
        })
      }
    }
  }, [childProps])

  const scrollToStart = () => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({ left: 0, behavior: "smooth" })
    }
  }

  const scrollToEnd = () => {
    if (viewportRef.current) {
      const { scrollWidth, clientWidth } = viewportRef.current
      viewportRef.current.scrollTo({
        left: scrollWidth - clientWidth,
        behavior: "smooth",
      })
    }
  }

  return (
    <div className={cn("relative", containerClassName)}>
      {/* Left fade effect */}
      {canScrollLeft && (
        <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent" />
      )}

      {/* Right fade effect */}
      {canScrollRight && (
        <div className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-16 bg-gradient-to-l from-background to-transparent" />
      )}

      {/* Left navigation button */}
      {canScrollLeft && (
        <Button
          variant="secondary"
          size="icon"
          className="-translate-y-1/2 absolute top-1/2 left-1 z-20 size-8 rounded-full shadow lg:opacity-60 lg:transition-opacity lg:hover:opacity-100"
          onClick={scrollToStart}
          aria-label="Scroll to start"
        >
          <ChevronLeft className="size-5" />
        </Button>
      )}

      {/* Right navigation button */}
      {canScrollRight && (
        <Button
          variant="secondary"
          size="icon"
          className="-translate-y-1/2 absolute top-1/2 right-1 z-20 size-8 rounded-full shadow lg:opacity-60 lg:transition-opacity lg:hover:opacity-100"
          onClick={scrollToEnd}
          aria-label="Scroll to end"
        >
          <ChevronRight className="size-5" />
        </Button>
      )}

      <ScrollArea
        ref={rootRef}
        className={cn("relative h-full", className)}
        viewportClassName={viewportClassName}
        childProps={childProps}
        viewportRef={viewportRef}
        {...props}
      >
        {children}
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}

export { SmartHorizontalScrollArea }
