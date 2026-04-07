"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { useMutation, useQuery } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CreditCardIcon,
  MapPinIcon,
  PhoneIcon,
  PrinterIcon,
  UserIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { use, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"
import { formatPrice } from "../../../../../lib/currency"

export default function PrintOrderPage({
  params,
}: {
  params: Promise<{ id: Id<"orders"> }>
}) {
  const router = useRouter()
  const { activeOrganizationId } = useOrganization()
  const resolvedParams = use(params)
  const orderId = resolvedParams.id

  const order = useQuery(
    api.private.orders.getOne,
    activeOrganizationId
      ? { id: orderId, organizationId: activeOrganizationId }
      : "skip"
  )
  const markAsPrinted = useMutation(api.private.orders.markAsPrinted)

  // State for print confirmation modal
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printInitiated, setPrintInitiated] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const autoPrintTriggeredRef = useRef(false)

  // Auto-print functionality - trigger only once when page loads
  useEffect(() => {
    if (
      order &&
      !autoPrintTriggeredRef.current &&
      !isPrinting &&
      typeof window !== "undefined"
    ) {
      autoPrintTriggeredRef.current = true
      setIsPrinting(true)
      // Small delay to ensure content is rendered
      setTimeout(() => {
        try {
          window.print()
          // Show confirmation modal after print dialog closes
          setTimeout(() => {
            console.log(order.printedAt)
            if (!order.printedAt) setShowPrintModal(true)
            setIsPrinting(false)
          }, 100)
        } catch (error) {
          console.error("Error during auto-print:", error)
          setIsPrinting(false)
        }
      }, 500)
    }
  }, [order, isPrinting])

  const handleMarkAsPrinted = async () => {
    if (!activeOrganizationId) {
      toast.error("Sesión expirada. Inicia sesión nuevamente.")
      return
    }

    try {
      await markAsPrinted({
        id: orderId,
        organizationId: activeOrganizationId,
      })
      toast.success("Pedido marcado como impreso")
      setShowPrintModal(false)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handlePrintAgain = () => {
    if (isPrinting) return // Prevent multiple prints
    setIsPrinting(true)
    setPrintInitiated(false)
    setShowPrintModal(false)
    // Re-trigger the print effect
    setTimeout(() => {
      try {
        window.print()
        setTimeout(() => {
          if (order && !order.printedAt) setShowPrintModal(true)

          setIsPrinting(false)
        }, 100)
      } catch (error) {
        console.error("Error during print again:", error)
        setIsPrinting(false)
      }
    }, 500)
  }

  if (order === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="animate-pulse">Cargando pedido...</div>
      </div>
    )
  }

  if (order === null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <h1 className="font-bold text-2xl">Pedido no encontrado</h1>
          <Button
            onClick={() => router.back()}
            className="mt-4"
            variant="outline"
          >
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Volver
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Print-specific styles */}
      <style jsx global>{`
        @media print {
          body {
            font-size: 12px;
            line-height: 1.4;
          }
          .no-print {
            display: none !important;
          }
          .print-break {
            page-break-before: always;
          }
          @page {
            margin: 0.5in;
            size: letter;
          }
        }
      `}</style>

      {/* Navigation - Always hidden in print view */}
      <div className="no-print p-6 pb-4">
        <div className="mb-6 flex items-center gap-3">
          <Button
            onClick={() => router.push(`/orders/${orderId}`)}
            variant="outline"
          >
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Volver al pedido
          </Button>
        </div>
      </div>

      {/* Print Content */}
      <div className="mx-auto max-w-4xl bg-white px-6 py-6">
        {/* Header */}
        <div className="mb-6 border-gray-800 border-b-2 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-bold text-3xl text-gray-900">
                Pedido #{order.orderNumber}
              </h1>
              <p className="mt-1 text-gray-600">
                Realizado{" "}
                {formatDistanceToNow(new Date(order._creationTime), {
                  addSuffix: true,
                  locale: es,
                })}
              </p>
            </div>
            <div className="text-right">
              <div className="text-gray-600 text-sm">
                Estado:{" "}
                <span className="font-semibold capitalize">
                  {order.status === "pendiente" && "Pendiente"}
                  {order.status === "preparando" && "Preparando"}
                  {order.status === "listo_para_recoger" &&
                    "Listo para Recoger"}
                  {order.status === "en_camino" && "En Camino"}
                  {order.status === "entregado" && "Entregado"}
                  {order.status === "cancelado" && "Cancelado"}
                </span>
              </div>
              {order.printedAt && (
                <div className="mt-1 text-gray-500 text-xs">
                  Impreso: {new Date(order.printedAt).toLocaleString("es-CO")}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Customer Information */}
        <div className="mb-6">
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">
            Información del Cliente
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-gray-600" />
              <span className="font-medium">{order.customerName}</span>
            </div>
            {order.customerPhone && (
              <div className="flex items-center gap-2">
                <PhoneIcon className="h-4 w-4 text-gray-600" />
                <span>{order.customerPhone}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <CreditCardIcon className="h-4 w-4 text-gray-600" />
              <span>
                {order.paymentMethod === "cash" && "Efectivo"}
                {order.paymentMethod === "card" && "Datafono"}
                {order.paymentMethod === "payment_link" &&
                  "Pago por Link de Pago"}
                {order.paymentMethod === "bank_transfer" &&
                  "Transferencia a Cuenta Bancaria"}
              </span>
            </div>
          </div>
        </div>

        {/* Delivery Address */}
        {order.deliveryAddress && (
          <div className="mb-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-gray-900 text-xl">
              <MapPinIcon className="h-5 w-5" />
              Dirección de Entrega
            </h2>
            <div className="rounded border bg-gray-50 p-3">
              <p className="text-gray-800">{order.deliveryAddress}</p>
            </div>
          </div>
        )}

        {/* Order Items */}
        <div className="mb-6">
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">
            Productos del Pedido
          </h2>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900">
                    Producto
                  </th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-900">
                    Cant.
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-900">
                    Precio Unit.
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-900">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, index) => {
                  const isCombo = item.itemType === "combo"

                  if (isCombo) {
                    const slotGroups = new Map<string, typeof item.products>()
                    for (const product of item.products) {
                      const slotName = product.comboSlotName || "Sin categoría"
                      if (!slotGroups.has(slotName)) {
                        slotGroups.set(slotName, [])
                      }
                      slotGroups.get(slotName)?.push(product)
                    }

                    const totalUpcharges = item.products.reduce(
                      (sum, p) => sum + (p.upcharge || 0),
                      0
                    )

                    return (
                      <tr key={`${item._id}-${index}`} className="border-t">
                        <td className="px-4 py-2">
                          <div>
                            <div className="font-medium text-gray-900">
                              🎁 {item.comboName ?? "Combo"}
                            </div>
                            <div className="mt-1 space-y-0.5 pl-4">
                              {Array.from(slotGroups.entries()).map(
                                ([slotName, products]) => (
                                  <div
                                    key={slotName}
                                    className="text-gray-700 text-sm"
                                  >
                                    <span className="font-medium text-gray-500">
                                      {slotName}:
                                    </span>{" "}
                                    {products
                                      .map((p) => {
                                        const sizePart = p.sizeName
                                          ? ` ${p.sizeName}`
                                          : ""
                                        const upchargePart =
                                          p.upcharge && p.upcharge > 0
                                            ? ` (+${formatPrice(p.upcharge)})`
                                            : ""
                                        return `${p.name}${sizePart}${upchargePart}`
                                      })
                                      .join(", ")}
                                  </div>
                                )
                              )}
                            </div>
                            {item.comboBasePrice !== undefined &&
                              totalUpcharges > 0 && (
                                <div className="mt-1 text-gray-500 text-xs">
                                  Base: {formatPrice(item.comboBasePrice)} +
                                  Extras: {formatPrice(totalUpcharges)}
                                </div>
                              )}
                            {item.notes && (
                              <div className="text-gray-600 text-sm italic">
                                Nota: {item.notes}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center font-medium">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {formatPrice(item.unitPrice)}
                        </td>
                        <td className="px-4 py-2 text-right font-medium">
                          {formatPrice(item.totalPrice)}
                        </td>
                      </tr>
                    )
                  }

                  // Regular item
                  return (
                    <tr key={`${item._id}-${index}`} className="border-t">
                      <td className="px-4 py-2">
                        <div>
                          <div className="font-medium text-gray-900">
                            {item.products.map((p) => p.name).join(" + ")}
                          </div>
                          {item.products.length > 1 && (
                            <div className="text-gray-600 text-sm">
                              Productos:{" "}
                              {item.products.map((p) => p.name).join(", ")}
                            </div>
                          )}
                          {item.notes && (
                            <div className="text-gray-600 text-sm italic">
                              Nota: {item.notes}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center font-medium">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatPrice(item.unitPrice)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {formatPrice(item.totalPrice)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Order Totals */}
        <div className="mb-6">
          <div className="flex justify-end">
            <div className="w-64">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">
                    {formatPrice(order.subtotal)}
                  </span>
                </div>
                {order.deliveryFee && order.deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Envío:</span>
                    <span className="font-medium">
                      {formatPrice(order.deliveryFee)}
                    </span>
                  </div>
                )}
                <div className="mt-2 border-gray-800 border-t-2 pt-2">
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total:</span>
                    <span>{formatPrice(order.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t pt-4 text-center text-gray-500 text-sm">
          <p>Gracias por tu pedido • Pedido #{order.orderNumber}</p>
          <p className="mt-1">
            Generado el {new Date().toLocaleString("es-CO")}
          </p>
        </div>
      </div>

      {/* Print Confirmation Modal */}
      <Dialog open={showPrintModal} onOpenChange={setShowPrintModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PrinterIcon className="h-5 w-5" />
              Confirmar Impresión
            </DialogTitle>
            <DialogDescription>
              ¿El pedido #{order.orderNumber} se imprimió correctamente?
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
            <CheckCircleIcon className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800 text-sm">
                Marcar como impreso
              </p>
              <p className="text-green-600 text-xs">
                Esto ayudará a rastrear los pedidos que ya se imprimieron
              </p>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowPrintModal(false)}>
              No, no está impreso
            </Button>
            <Button
              onClick={handleMarkAsPrinted}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircleIcon className="mr-2 h-4 w-4" />
              Sí, marcar como impreso
            </Button>
          </DialogFooter>

          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrintAgain}
              className="text-gray-500 text-xs"
            >
              Reimprimir pedido
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Botón para volver a imprimir - siempre visible */}
      <div className="no-print fixed right-4 bottom-4">
        <Button
          onClick={() => {
            if (isPrinting) return // Prevent multiple prints
            setIsPrinting(true)
            setPrintInitiated(true)
            try {
              window.print()
              // Show confirmation modal after print dialog closes
              setTimeout(() => {
                if (!order.printedAt) setShowPrintModal(true)
                setIsPrinting(false)
              }, 100)
            } catch (error) {
              console.error("Error during manual print:", error)
              setIsPrinting(false)
            }
          }}
          disabled={isPrinting}
          className="shadow-lg"
        >
          <PrinterIcon className="mr-2 h-4 w-4" />
          {isPrinting ? "Imprimiendo..." : "Imprimir de nuevo"}
        </Button>
      </div>
    </>
  )
}
