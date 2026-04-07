"use client"

import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"
import { cn } from "@workspace/ui/lib/utils"
import type * as React from "react"
import { useEffect, useRef, useState } from "react"

function ScrollArea({
  className,
  children,
  viewportClassName,
  childProps,
  viewportRef: externalViewportRef,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportClassName?: string
  childProps?: React.HTMLAttributes<HTMLDivElement>
  viewportRef?: React.RefObject<HTMLDivElement | null>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const internalViewportRef = useRef<HTMLDivElement>(null)
  const viewportRef = externalViewportRef || internalViewportRef

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

  return (
    <ScrollAreaPrimitive.Root
      ref={rootRef}
      data-slot="scroll-area"
      className={cn("relative h-full", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full h-full min-h-0 rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:outline-1 focus-visible:ring-[3px] focus-visible:ring-ring/50",
          viewportClassName
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none select-none p-px transition-colors",
        orientation === "vertical" &&
          "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
