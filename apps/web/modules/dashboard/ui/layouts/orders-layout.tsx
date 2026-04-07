"use client"

import type { Id } from "@workspace/backend/_generated/dataModel"
import { DetailsListLayout } from "@workspace/ui/layout/detail-list-layout"
import { usePathname, useRouter } from "next/navigation"
import { useMemo } from "react"
import { generateMockOrderById } from "@/lib/mock-orders"
import { OrderIdView } from "../views/order-id-view"
import { OrdersView } from "../views/orders-view"

export interface OrderWithItems {
  _id: string
  _creationTime: number
  orderNumber: string
  customerName: string
  customerPhone: string
  organizationId: string
  conversationId?: string
  contactId?: string
  restaurantLocationId: string
  subtotal: number
  deliveryFee?: number
  total: number
  status:
    | "programado"
    | "pendiente"
    | "preparando"
    | "listo_para_recoger"
    | "en_camino"
    | "entregado"
    | "cancelado"
  orderType: "delivery" | "pickup"
  deliveryAddress?: string
  paymentMethod:
    | "cash"
    | "card"
    | "payment_link"
    | "bank_transfer"
    | "corporate_credit"
    | "gift_voucher"
    | "sodexo_voucher"
    | "dynamic_payment_link"
  paymentMethods?: Array<{
    method:
      | "cash"
      | "card"
      | "payment_link"
      | "bank_transfer"
      | "corporate_credit"
      | "gift_voucher"
      | "sodexo_voucher"
      | "dynamic_payment_link"
    amount?: number
    referenceCode?: string
    notes?: string
  }>
  scheduledTime?: number
  printedAt?: number
  paidAt?: number
  items: Array<{
    _id: string
    _creationTime: number
    orderId: string
    quantity: number
    unitPrice: number
    totalPrice: number
    notes?: string
    products: Array<{
      _id: string
      name: string
      description: string
      price: number
      categoryName: string
      sizeName?: string
    }>
  }>
}

interface OrdersLayoutProps {
  children: React.ReactNode
  selectedOrderId?: string
}

export function OrdersLayout({
  selectedOrderId,
  children,
}: OrdersLayoutProps & { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  // Check if we're in print mode
  const isPrintMode = pathname?.includes("/print")

  // Find the selected order if we have an ID from URL
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null

    // For mock orders, generate the data
    if (selectedOrderId.startsWith("mock-order-")) {
      return generateMockOrderById(selectedOrderId)
    }

    // For real orders, return null - the OrderIdView will handle fetching
    return null
  }, [selectedOrderId])

  // Create a stub order object for real orders so MasterDetailLayout has something to work with
  const finalSelectedOrder = useMemo(() => {
    if (!selectedOrderId) return null

    if (selectedOrderId.startsWith("mock-order-")) {
      return selectedOrder
    }

    // For real orders, create a stub object with just the ID
    // The OrderIdView will handle the actual fetching
    return {
      _id: selectedOrderId,
      _creationTime: 0,
      orderNumber: "",
      customerName: "",
      customerPhone: "",
      organizationId: "",
      restaurantLocationId: "",
      subtotal: 0,
      total: 0,
      status: "pendiente" as const,
      orderType: "delivery" as const,
      paymentMethod: "cash" as const,
      items: [],
    } as OrderWithItems
  }, [selectedOrderId, selectedOrder])

  // Handle item selection - navigate to the order URL
  const handleSelectedItemChange = (item: OrderWithItems | null) => {
    if (item) {
      router.push(`/orders/${item._id}`)
    } else {
      router.push("/orders")
    }
  }

  // If we're in print mode, we still use MasterDetailLayout but render print page in detail area

  return (
    <DetailsListLayout<OrderWithItems>
      selectedItem={finalSelectedOrder}
      onSelectedItemChange={handleSelectedItemChange}
      sidebarContent={({ onSelectItem }) => (
        <OrdersView onSelectOrder={onSelectItem} />
      )}
      detailContent={({ selectedItem, onBack, isMobile }) => {
        // If we're in print mode, render the print page
        if (isPrintMode) {
          return <>{children}</>
        }

        if (!selectedItem) {
          return (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <div className="max-w-md">
                <h3 className="mb-2 font-semibold text-lg">
                  Selecciona un pedido
                </h3>
                <p className="text-muted-foreground">
                  Haz clic en un pedido de la lista para ver sus detalles
                  completos.
                </p>
              </div>
            </div>
          )
        }

        // Render the OrderIdView directly in the layout
        return (
          <OrderIdView
            orderId={selectedItem._id as Id<"orders">}
            onBack={onBack}
            isMobile={isMobile}
          />
        )
      }}
      config={{
        showSidebarOnMobile: false,
      }}
    />
  )
}
