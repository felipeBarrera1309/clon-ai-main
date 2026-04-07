"use client"

import { api } from "@workspace/backend/_generated/api"
import { DateRangePicker } from "@workspace/ui/components/date-range-picker"
import { atom, useAtom } from "jotai"
import { formatPrice } from "../../../../lib/currency"
import { MultiOptions, MultiOptionsGroup } from "../components/multioptions"

// Import order status utilities
const getAllowedStatusesForOrderType = (
  orderType: OrderType
): OrderStatus[] => {
  const baseStatuses: OrderStatus[] = [
    "programado",
    "pendiente",
    "preparando",
    "listo_para_recoger",
    "en_camino",
    "entregado",
    "cancelado",
  ]

  if (orderType === "pickup") {
    // For pickup orders, exclude "en_camino" status
    return baseStatuses.filter((status) => status !== "en_camino")
  }

  // For delivery orders, include all statuses
  return baseStatuses
}

// Date range atom for orders filtering
const dateRangeAtom = atom<DateRange | undefined>(undefined)

import type { Doc, Id } from "@workspace/backend/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"

// Define local types based on Convex schema
type OrderStatus = Doc<"orders">["status"]
type OrderType = Doc<"orders">["orderType"]

// Order with items and related data (as returned by the orders.getMany query)
type OrderWithItems = Doc<"orders"> & {
  items: Array<{
    _id: Id<"orderItems">
    _creationTime: number
    orderId: Id<"orders">
    quantity: number
    unitPrice: number
    totalPrice: number
    notes?: string
    products: Array<{
      _id: Id<"menuProducts">
      name: string
      description: string
      price: number
      categoryName: string
      sizeName?: string
    }>
  }>
  contact: Doc<"contacts">
  restaurantLocation: Doc<"restaurantLocations">
}

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { useInfiniteScroll } from "@workspace/ui/hooks/use-infinite-scroll"
import { cn } from "@workspace/ui/lib/utils"
import { useMutation, usePaginatedQuery, useQuery } from "convex/react"
import {
  Building,
  CalendarIcon,
  ClockIcon,
  Columns3,
  CreditCardIcon,
  PlusIcon,
  PrinterIcon,
  UtensilsIcon,
} from "lucide-react"
import { usePathname } from "next/navigation"
import { useState } from "react"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"
import { formatDate, formatTime } from "../../../../lib/date"
import { CreateOrderDialog } from "../components/create-order-dialog"
import {
  OrderStatusBadge,
  statusConfig,
} from "../components/order-status-badge"

type OrderStatusFilter = OrderStatus | "all"

type PrintedStatus = "printed" | "unprinted" | "all"
type PaidStatus = "paid" | "unpaid" | "all"

// Filter state types for MultiOptions
type StatusFilterValue = OrderStatus[]
type PrintedFilterValue = ("printed" | "unprinted")[]
type PaidFilterValue = ("paid" | "unpaid")[]
type ScheduledFilterValue = ("upcoming" | "today" | "tomorrow")[]
type LocationFilterValue = Id<"restaurantLocations">[]

const statusLabels: Record<OrderStatusFilter, string> = {
  all: "Estados Pedido",
  programado: "Programado",
  pendiente: "Pendiente",
  preparando: "Preparando",
  listo_para_recoger: "Listo para Recoger",
  en_camino: "En Camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
}

export const OrdersView = ({
  onSelectOrder,
}: {
  onSelectOrder?: (order: OrderWithItems) => void
}) => {
  const { activeOrganizationId } = useOrganization()
  const pathname = usePathname()
  // Filter state - now using arrays for MultiOptions
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>([])
  const [printedFilter, setPrintedFilter] = useState<PrintedFilterValue>([])
  const [paidFilter, setPaidFilter] = useState<PaidFilterValue>([])
  const [scheduledFilter, setScheduledFilter] = useState<ScheduledFilterValue>(
    []
  )
  const [locationFilter, setLocationFilter] = useState<LocationFilterValue>([])
  const [dateRange, setDateRange] = useAtom(dateRangeAtom)

  // Use real API data with pagination
  // To use mock data instead, uncomment the import above and replace this with:
  // const orders = useMockPaginatedOrders(500)
  const orders = usePaginatedQuery(
    api.private.orders.getMany,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          status: statusFilter.length === 0 ? undefined : statusFilter,
          printed: printedFilter.length === 0 ? undefined : printedFilter,
          paid: paidFilter.length === 0 ? undefined : paidFilter,
          scheduled: scheduledFilter.length === 0 ? undefined : scheduledFilter,
          restaurantLocationId:
            locationFilter.length === 0 ? undefined : locationFilter,
          dateRange: dateRange
            ? {
                from: dateRange.from?.getTime(),
                to: dateRange.to?.getTime()
                  ? dateRange.to.getTime() + 24 * 60 * 60 * 1000 - 1
                  : undefined,
              }
            : undefined,
        }
      : "skip",
    {
      initialNumItems: 15,
    }
  )

  const locations = useQuery(
    api.private.restaurantLocations.list,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )

  // Infinite scroll integration
  const {
    topElementRef,
    canLoadMore,
    isLoadingMore: infiniteScrollLoadingMore,
    isLoadingFirstPage: infiniteScrollLoadingFirstPage,
  } = useInfiniteScroll({
    status: orders.status,
    loadMore: orders.loadMore,
    numItems: 15,
  })

  // No longer need to synchronize selectedOrder since we use URL-based navigation

  const updateOrderStatus = useMutation(api.private.orders.updateStatus)

  const handleStatusChange = async (
    orderId: Id<"orders">,
    newStatus: OrderStatus
  ) => {
    if (!activeOrganizationId) return
    try {
      await updateOrderStatus({
        organizationId: activeOrganizationId,
        id: orderId,
        status: newStatus,
      })
      toast.success(`Estado actualizado a: ${statusLabels[newStatus]}`)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  // Clear all filters function
  const handleClearAllFilters = () => {
    setStatusFilter([])
    setPrintedFilter([])
    setPaidFilter([])
    setScheduledFilter([])
    setLocationFilter([])
  }

  return (
    <Card className="h-full gap-0 rounded-none border-0 p-0 shadow-none">
      <CardHeader className="flex flex-col items-stretch justify-between border-b p-3!">
        <div className="flex flex-col-reverse gap-3 sm:flex-row lg:items-center lg:justify-between">
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            placeholder="Filtrar por rango de fechas"
            clearable
            className="w-full"
            buttonClassName="w-full"
          />
          <CreateOrderDialog>
            <Button className="flex w-full items-center gap-2 sm:w-auto">
              <PlusIcon className="h-4 w-4" />
              <span className="inline lg:hidden">Crear Pedido</span>
            </Button>
          </CreateOrderDialog>
        </div>

        <MultiOptionsGroup onClearAll={handleClearAllFilters}>
          <MultiOptions
            options={[
              {
                id: "today",
                label: "Para hoy",
              },
              {
                id: "tomorrow",
                label: "Para mañana",
              },
              {
                id: "upcoming",
                label: "Próximos",
              },
            ]}
            value={scheduledFilter}
            onValueChange={(value) =>
              setScheduledFilter(value as ScheduledFilterValue)
            }
            placeholder="Programados"
            icon={<CalendarIcon className="h-4 w-4" />}
            showSearch={false}
            showIndividualBadges={false}
          />
          <MultiOptions
            options={[
              {
                id: "printed",
                label: "Impresos",
              },
              {
                id: "unprinted",
                label: "Sin imprimir",
              },
            ]}
            value={printedFilter}
            onValueChange={(value) =>
              setPrintedFilter(value as PrintedFilterValue)
            }
            placeholder="Impresión"
            icon={<PrinterIcon className="h-4 w-4" />}
            showSearch={false}
            showIndividualBadges={false}
          />
          <MultiOptions
            options={[
              {
                id: "paid",
                label: "Pagados",
              },
              {
                id: "unpaid",
                label: "Sin pagar",
              },
            ]}
            value={paidFilter}
            onValueChange={(value) => setPaidFilter(value as PaidFilterValue)}
            placeholder="Pago"
            icon={<CreditCardIcon className="h-4 w-4" />}
            showSearch={false}
            showIndividualBadges={false}
          />
          <MultiOptions
            options={Object.entries(statusConfig).map(([key, config]) => ({
              id: key,
              label: config.label,
              icon: <config.icon className="h-4 w-4" />,
            }))}
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter(value as StatusFilterValue)
            }
            placeholder="Seguimiento"
            icon={<Columns3 className="h-4 w-4" />}
            showSearch={false}
            showIndividualBadges={false}
          />
          {locations && locations.length > 1 && (
            <MultiOptions
              options={
                locations?.map((location) => ({
                  id: location._id,
                  label: location.name,
                })) || []
              }
              value={locationFilter}
              onValueChange={(value) =>
                setLocationFilter(value as LocationFilterValue)
              }
              placeholder="Sucursal"
              icon={<Building className="h-4 w-4" />}
              showSearch={true}
              showIndividualBadges={false}
            />
          )}
        </MultiOptionsGroup>
      </CardHeader>

      <CardContent className="h-full space-y-1 overflow-hidden p-0">
        {infiniteScrollLoadingFirstPage ? (
          <div className="flex flex-col">
            {Array.from({ length: 5 }).map((_, index) => (
              <Card
                key={index}
                className="gap-1 rounded-none border-muted border-l-2 p-4 text-sm shadow-none transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                </div>
              </Card>
            ))}
          </div>
        ) : orders.results?.length < 1 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 text-muted-foreground">
              <UtensilsIcon className="h-8 w-8" />
            </div>
            <h3 className="mb-2 font-medium text-lg">
              No hay pedidos para mostrar
            </h3>
            <p className="text-muted-foreground">
              No se encontraron pedidos que coincidan con los filtros
              seleccionados.
            </p>
          </div>
        ) : (
          <ScrollArea
            className="h-full"
            childProps={{ style: { display: "block" } }}
          >
            <div className="">
              {orders.results?.map((order) => (
                <Card
                  key={order._id}
                  onClick={() => onSelectOrder?.(order)}
                  className={cn(
                    "cursor-pointer gap-1 rounded-none border-muted border-l-2 p-4 text-sm shadow-none transition-colors hover:border-primary/50 hover:bg-accent",
                    pathname.includes(order._id) &&
                      "border-primary/60 bg-primary/30"
                  )}
                >
                  <CardHeader className="flex items-center justify-between p-0">
                    <CardTitle className="text-base">
                      #{order.orderNumber}
                    </CardTitle>
                    <div className="font-semibold">
                      {formatPrice(order.total)}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-between gap-1 p-0">
                    <div className="flex w-full justify-between gap-1">
                      <span className="truncate text-muted-foreground">
                        {order.customerName}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <div className="flex w-full justify-between gap-1 text-muted-foreground text-xs">
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        {formatDate(order._creationTime)}
                      </div>
                      <div className="ml-auto flex items-center gap-1">
                        <ClockIcon className="h-3 w-3" />
                        {formatTime(order._creationTime)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <div ref={topElementRef} className="h-4" />
              {infiniteScrollLoadingMore && (
                <div className="flex flex-col">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Card
                      key={`loading-${index}`}
                      className="gap-1 rounded-none border-muted border-l-2 p-4 text-sm shadow-none"
                    >
                      <div className="flex items-center justify-between">
                        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                        <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
