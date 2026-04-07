"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Doc, Id } from "@workspace/backend/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { useMutation, useQuery } from "convex/react"
import { CheckCircleIcon, MapPinIcon, XCircleIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"
import { DASHBOARD_VIEWS } from "../../constants"

interface ProductAvailabilitySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product:
    | (Omit<Doc<"menuProducts">, "nameNormalized"> & {
        availability: Record<string, boolean>
      })
    | null
}

export const ProductAvailabilitySheet = ({
  open,
  onOpenChange,
  product,
}: ProductAvailabilitySheetProps) => {
  const { activeOrganizationId } = useOrganization()
  const locations = useQuery(
    api.private.restaurantLocations.list,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  const productAvailabilities = useQuery(
    api.private.menuProductAvailability.getByProduct,
    product && activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          productId: product._id as Id<"menuProducts">,
        }
      : "skip"
  )
  const toggleAvailability = useMutation(
    api.private.menuProductAvailability.toggleAvailability
  )
  const ResturantsIcon = DASHBOARD_VIEWS["/restaurant-locations"].icon

  const [togglingAvailability, setTogglingAvailability] = useState<
    Map<string, boolean>
  >(new Map())

  const handleToggleAvailability = async (
    productId: string,
    locationId: string,
    currentAvailability: boolean
  ) => {
    if (!activeOrganizationId) return

    const toggleKey = `${productId}-${locationId}`

    setTogglingAvailability((prev) => new Map(prev.set(toggleKey, true)))

    try {
      await toggleAvailability({
        organizationId: activeOrganizationId,
        productId: productId as Id<"menuProducts">,
        locationId: locationId as Id<"restaurantLocations">,
        available: !currentAvailability,
      })

      toast.success(
        currentAvailability
          ? "Producto removido de la sucursal"
          : "Producto agregado a la sucursal"
      )
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setTogglingAvailability((prev) => {
        const newMap = new Map(prev)
        newMap.delete(toggleKey)
        return newMap
      })
    }
  }

  if (!product) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b-1">
          <SheetTitle className="flex items-center gap-2">
            <ResturantsIcon className="h-5 w-5" />
            Disponibilidad de: {product.name}
          </SheetTitle>
          <SheetDescription className="ellipsis max-h-[500px]">
            {product.description}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex h-0 flex-1">
          {locations?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MapPinIcon className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">
                No hay sucursales configuradas
              </p>
            </div>
          ) : (
            <div>
              {locations?.map((location) => {
                const availabilityRecord = productAvailabilities?.find(
                  (avail) => avail.restaurantLocationId === location._id
                )
                const isAvailable = availabilityRecord?.available ?? true
                const toggleKey = `${product._id}-${location._id}`
                const isLoading = togglingAvailability.get(toggleKey) || false
                return (
                  <div
                    key={location._id}
                    className="flex items-center justify-between border-b-1 p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-3 w-3 flex-shrink-0 rounded-full"
                        style={{
                          backgroundColor: location.color || "#6b7280",
                        }}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">
                          {location.name}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {location.code}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-transparent"
                      onClick={() =>
                        handleToggleAvailability(
                          product._id,
                          location._id,
                          isAvailable
                        )
                      }
                      disabled={isLoading}
                    >
                      <div className="flex items-center justify-center">
                        {isLoading ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                        ) : isAvailable ? (
                          <CheckCircleIcon className="h-5 w-5 text-primary-600 hover:text-primary-700" />
                        ) : (
                          <XCircleIcon className="h-5 w-5 text-red-600 hover:text-red-700" />
                        )}
                      </div>
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
