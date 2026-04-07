"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@workspace/backend/_generated/api"
import type { Doc, Id } from "@workspace/backend/_generated/dataModel"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form"
import { Input } from "@workspace/ui/components/input"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"
import { SmartHorizontalScrollArea } from "@workspace/ui/components/smart-horizontal-scroll-area"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowLeftIcon,
  Banknote,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  Edit,
  FileTextIcon,
  Home,
  MessageCircleIcon,
  PackageIcon,
  Printer,
  PrinterCheck,
  PrinterIcon,
  Truck,
  TruckIcon,
  UtensilsIcon,
  X,
  XCircleIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { useOrganization } from "@/hooks/use-organization"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { formatPrice } from "@/lib/currency"
import { formatExactTime } from "@/lib/date"
import { handleConvexError } from "@/lib/error-handling"
import { generateMockOrderById } from "@/lib/mock-orders"
import {
  AddressFormSection,
  type AddressValidationResult,
} from "../components/address-form-section"
import { ConversationStatusBadge } from "../components/conversation-status-badge"
import { LocationPreview } from "../components/location-preview"
import { OrderItemsSection } from "../components/order-items-section"
import { PaymentSelectionSection } from "../components/payment-selection-section"
import { SchedulePreview } from "../components/schedule-preview"
import { ToggleOrderStatusDialog } from "../components/toggle-order-status-dialog"

// Define local types based on Convex schema
type OrderStatus = Doc<"orders">["status"]

const editOrderFormSchema = z
  .object({
    orderType: z.enum(["delivery", "pickup"]),
    deliveryAddress: z.string().optional(),
    paymentMethod: z
      .enum([
        "cash",
        "card",
        "payment_link",
        "bank_transfer",
        "corporate_credit",
        "gift_voucher",
        "sodexo_voucher",
        "dynamic_payment_link",
      ])
      .optional(),
    paymentMethods: z
      .array(
        z.object({
          method: z.string(),
          amount: z.number().min(1, "El monto debe ser mayor a 0").optional(),
        })
      )
      .min(1, "Debe seleccionar al menos un método de pago"),
    restaurantLocationId: z.string().min(1, "La ubicación es obligatoria"),
    deliveryFee: z.number().min(0, "El costo de envío no puede ser negativo"),
    items: z.array(
      z.object({
        menuProduct: z.string().optional(),
        quantity: z.number().min(1, "Cantidad debe ser mayor a 0"),
        notes: z.string().optional(),
      })
    ),
  })
  .refine(
    (data) => {
      if (data.orderType === "delivery" && !data.deliveryAddress) {
        return false
      }
      return true
    },
    {
      message: "La dirección es obligatoria para domicilios",
      path: ["deliveryAddress"],
    }
  )

type EditOrderFormValues = z.infer<typeof editOrderFormSchema>

// Order with items (as returned by the orders.list query)
type OrderWithItems = Doc<"orders"> & {
  items: Array<{
    _id: Id<"orderItems">
    _creationTime: number
    orderId: Id<"orders">
    quantity: number
    unitPrice: number
    totalPrice: number
    notes?: string
    itemType?: "regular" | "combo"
    comboId?: Id<"combos">
    comboBasePrice?: number
    comboName?: string
    products: Array<{
      _id: Id<"menuProducts">
      name: string
      description: string
      price: number
      categoryName: string
      sizeName?: string
      comboSlotName?: string
      upcharge?: number
    }>
  }>
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
  electronicInvoice?: {
    _id: Id<"electronicInvoices">
    _creationTime: number
    orderId: Id<"orders">
    organizationId: string
    invoiceType: "natural" | "juridica"
    email: string
    fullName: string
    cedula?: string
    nit?: string
  } | null
}

const statusLabels: Record<OrderStatus, string> = {
  programado: "Programado",
  pendiente: "Pendiente",
  preparando: "Preparando",
  listo_para_recoger: "Listo para Recoger",
  en_camino: "En Camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
}

const statusIcons: Record<OrderStatus, React.ReactNode> = {
  programado: <CalendarIcon className="h-4 w-4" />,
  pendiente: <ClockIcon className="h-4 w-4" />,
  preparando: <UtensilsIcon className="h-4 w-4" />,
  listo_para_recoger: <PackageIcon className="h-4 w-4" />,
  en_camino: <TruckIcon className="h-4 w-4" />,
  entregado: <CheckCircleIcon className="h-4 w-4" />,
  cancelado: <XCircleIcon className="h-4 w-4" />,
}

// Import order status utilities
const getAllowedStatusesForOrderType = (
  orderType: "delivery" | "pickup"
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

const OrderIdViewContent = ({
  orderId,
  order: providedOrder,
  onBack,
  isMobile,
}: {
  orderId?: Id<"orders">
  order?: OrderWithItems | null
  onBack?: () => void
  isMobile?: boolean
}) => {
  const { activeOrganizationId } = useOrganization()
  const router = useRouter()

  // Validate orderId format and redirect if invalid
  useEffect(() => {
    if (orderId && !/^[a-z0-9]{16,}$/.test(orderId)) {
      router.push("/orders")
    }
  }, [orderId, router])

  // Use provided order if available, otherwise fetch from API
  const fetchedOrder = useQuery(
    api.private.orders.getOne,
    orderId && !providedOrder && activeOrganizationId
      ? { id: orderId, organizationId: activeOrganizationId }
      : "skip"
  )

  const order = providedOrder !== undefined ? providedOrder : fetchedOrder

  const initialValidationResult = useMemo(() => {
    if (!order || order.orderType !== "delivery" || !order.deliveryAddress)
      return null
    return {
      isValid: true,
      address: order.deliveryAddress,
      coordinates: order.coordinates,
      fee: order.deliveryFee,
      restaurantLocationId: order.restaurantLocationId,
      message: "Dirección guardada",
    }
  }, [order])

  const conversation = useQuery(
    api.private.conversations.getOne,
    order?.conversationId && activeOrganizationId
      ? {
          conversationId: order.conversationId,
          organizationId: activeOrganizationId,
        }
      : "skip"
  )

  // Redirect if order doesn't exist
  useEffect(() => {
    if (order === null) {
      router.push("/orders")
    }
  }, [order, router])

  const [isEditing, setIsEditing] = useState(false)
  const [mockPrinted, setMockPrinted] = useState(!!order?.printedAt)
  const [mockPaid, setMockPaid] = useState(!!order?.paidAt)

  const restaurantLocations = useQuery(
    api.private.restaurantLocations.list,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  const menuProducts = useQuery(
    api.private.menuProducts.list,
    activeOrganizationId
      ? {
          paginationOpts: { numItems: 1000, cursor: null },
          organizationId: activeOrganizationId,
        }
      : "skip"
  )
  const restaurantConfig = useQuery(
    api.private.config.getRestaurantConfigQuery,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )

  // Compute enabled order types
  const enabledOrderTypes = useMemo(() => {
    if (!restaurantConfig) return ["delivery", "pickup"]
    const types: string[] = []
    if (restaurantConfig.enableDelivery) types.push("delivery")
    if (restaurantConfig.enablePickup) types.push("pickup")
    return types.length > 0 ? types : ["delivery", "pickup"]
  }, [restaurantConfig])

  // Compute enabled payment methods
  const enabledPaymentMethods = useMemo(() => {
    if (!restaurantConfig)
      return [
        "cash",
        "card",
        "payment_link",
        "bank_transfer",
        "corporate_credit",
        "gift_voucher",
        "sodexo_voucher",
        "dynamic_payment_link",
      ]

    const methods: string[] = []
    if (restaurantConfig.acceptCash) methods.push("cash")
    if (restaurantConfig.acceptCard) methods.push("card")
    if (restaurantConfig.acceptPaymentLink) methods.push("payment_link")
    if (restaurantConfig.acceptDynamicPaymentLink)
      methods.push("dynamic_payment_link")
    if (restaurantConfig.acceptBankTransfer) methods.push("bank_transfer")
    if (restaurantConfig.acceptCorporateCredit) methods.push("corporate_credit")
    if (restaurantConfig.acceptGiftVoucher) methods.push("gift_voucher")
    if (restaurantConfig.acceptSodexoVoucher) methods.push("sodexo_voucher")

    return methods.length > 0 ? methods : ["cash"]
  }, [restaurantConfig])

  const updateOrder = useMutation(api.private.orders.updateOrder)
  const updateOrderStatus = useMutation(api.private.orders.updateStatus)

  // Address Validation State (Only keep result for submission usage)
  const [addressValidationResult, setAddressValidationResult] =
    useState<AddressValidationResult | null>(null)

  const form = useForm<EditOrderFormValues>({
    resolver: zodResolver(editOrderFormSchema),
    defaultValues: {
      orderType: order?.orderType,
      deliveryAddress: order?.deliveryAddress || "",
      paymentMethod: order?.paymentMethod,
      paymentMethods: order?.paymentMethods || [
        { method: order?.paymentMethod || "cash", amount: order?.total || 0 },
      ],
      restaurantLocationId: order?.restaurantLocationId,
      deliveryFee: order?.deliveryFee || 0,
      items:
        order?.items.map((item) => ({
          menuProduct: item.products[0]?._id || "",
          quantity: item.quantity,
          notes: item.notes || "",
        })) || [],
    },
  })

  // Unsaved changes protection
  const hasUnsavedChanges = isEditing && form.formState.isDirty
  const { navigationDialog, closeDialog, confirmNavigation } =
    useUnsavedChanges(hasUnsavedChanges)

  // Auto-select single options (Enforce config on edit)
  useEffect(() => {
    if (isEditing && enabledOrderTypes.length === 1) {
      form.setValue("orderType", enabledOrderTypes[0] as "delivery" | "pickup")
    }
  }, [isEditing, enabledOrderTypes, form])

  useEffect(() => {
    if (isEditing && enabledPaymentMethods.length === 1) {
      // Cast to any because the string is guaranteed to be a valid enum by logic
      form.setValue("paymentMethod", enabledPaymentMethods[0] as any)
    }
  }, [isEditing, enabledPaymentMethods, form])

  useEffect(() => {
    if (
      isEditing &&
      restaurantLocations &&
      restaurantLocations.length === 1 &&
      restaurantLocations[0]
    ) {
      form.setValue("restaurantLocationId", restaurantLocations[0]._id)
    }
  }, [isEditing, restaurantLocations, form])

  const handleSaveAndContinue = async () => {
    await form.handleSubmit(onSubmit)()
    confirmNavigation()
  }

  // Update form values when order data loads
  useEffect(() => {
    if (order) {
      form.reset({
        orderType: order.orderType,
        deliveryAddress: order.deliveryAddress || "",
        paymentMethod: order.paymentMethod,
        paymentMethods: order.paymentMethods || [
          { method: order.paymentMethod || "cash", amount: order.total || 0 },
        ],
        restaurantLocationId: order.restaurantLocationId,
        deliveryFee: order.deliveryFee || 0,
        items:
          order.items.map((item) => ({
            menuProduct: item.products[0]?._id || "",
            quantity: item.quantity,
            notes: item.notes || "",
          })) || [],
      })
    }
  }, [order, form])
  // Reset editing state when order changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: setIsEditing is stable (useState setter)
  useEffect(() => {
    setIsEditing(false)
  }, [orderId])

  // Reset form when entering edit mode
  useEffect(() => {
    if (isEditing && order) {
      form.reset({
        orderType: order.orderType,
        deliveryAddress: order.deliveryAddress || "",
        paymentMethod: order.paymentMethod,
        paymentMethods: order.paymentMethods || [
          { method: order.paymentMethod || "cash", amount: order.total || 0 },
        ],
        restaurantLocationId: order.restaurantLocationId,
        deliveryFee: order.deliveryFee || 0,
        items: order.items.map((item) => ({
          menuProduct: item.products[0]?._id || "",
          quantity: item.quantity,
          notes: item.notes || "",
        })),
      })
    }
  }, [isEditing, order, form])

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  })

  const watchOrderType = form.watch("orderType")
  const watchItems = form.watch("items")
  const watchDeliveryFee = form.watch("deliveryFee")
  const watchDeliveryAddress = form.watch("deliveryAddress")

  const calculateItemSubtotal = (itemIndex: number) => {
    if (!menuProducts?.page) return 0
    const item = watchItems[itemIndex]
    if (!item || !item.menuProduct) return 0
    const product = menuProducts.page.find((p) => p._id === item.menuProduct)
    return (product?.price || 0) * item.quantity
  }

  const calculateSubtotal = () => {
    if (!menuProducts?.page) return 0
    return watchItems.reduce(
      (total, _item, index) => total + calculateItemSubtotal(index),
      0
    )
  }

  const calculateTotal = () => {
    const subtotal = calculateSubtotal()
    const deliveryFee = watchOrderType === "delivery" ? watchDeliveryFee : 0
    return subtotal + deliveryFee
  }

  const onSubmit = async (values: EditOrderFormValues) => {
    try {
      if (!order?._id) {
        toast.error("No se pudo identificar el pedido a actualizar")
        return
      }

      const validItems = values.items.filter((item) => item.menuProduct) // Only include items with selected products

      // If no valid items, keep original order items
      const orderItems =
        validItems.length > 0
          ? validItems.map((item) => ({
              menuProducts: [item.menuProduct as Id<"menuProducts">],
              quantity: item.quantity,
              notes: item.notes || "",
            }))
          : order?.items.map((item) => ({
              menuProducts: item.products.map((p) => p._id),
              quantity: item.quantity,
              notes: item.notes || "",
            })) || []

      const subtotal =
        validItems.length > 0
          ? values.items.reduce((total, item) => {
              if (!item.menuProduct) return total
              const product = menuProducts?.page.find(
                (p) => p._id === item.menuProduct
              )
              if (!product) return total
              return total + product.price * item.quantity
            }, 0)
          : order?.items.reduce((total, item) => {
              const itemPrice = item.products.reduce(
                (sum, product) => sum + product.price,
                0
              )
              return total + itemPrice * item.quantity
            }, 0) || 0

      const deliveryFee =
        values.orderType === "delivery" ? values.deliveryFee : 0
      const total = subtotal + deliveryFee

      await updateOrder({
        orderId: order._id,
        organizationId: activeOrganizationId!,
        orderType: values.orderType,
        deliveryAddress:
          values.orderType === "delivery" ? values.deliveryAddress : undefined,
        coordinates:
          values.orderType === "delivery" &&
          addressValidationResult?.isValid &&
          addressValidationResult.coordinates
            ? addressValidationResult.coordinates
            : undefined,
        paymentMethod: (values.paymentMethods?.[0]?.method as any) || "cash",
        paymentMethods: values.paymentMethods as any,
        restaurantLocationId:
          values.restaurantLocationId as Id<"restaurantLocations">,
        items: orderItems,
        deliveryFee,
        total,
      })

      toast.success("Pedido actualizado exitosamente")
      setIsEditing(false)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleStatusChange = async (
    orderId: Id<"orders">,
    newStatus: OrderStatus
  ) => {
    // For mock orders, just show success message (no real persistence)
    if (providedOrder) {
      toast.success(
        `Estado actualizado a: ${statusLabels[newStatus]} (modo mock)`
      )
      return
    }

    try {
      await updateOrderStatus({
        id: orderId,
        organizationId: activeOrganizationId!,
        status: newStatus,
      })
      toast.success(`Estado actualizado a: ${statusLabels[newStatus]}`)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleToggleStatus = (type: "printed" | "paid", active: boolean) => {
    if (providedOrder) {
      // For mock orders, update local state
      if (type === "printed") {
        setMockPrinted(active)
      } else {
        setMockPaid(active)
      }
    }
    // For real orders, the ToggleOrderStatusDialog handles the mutation
  }

  if (order === undefined) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="animate-pulse">
          <div className="mb-4 h-8 w-64 rounded bg-muted" />
          <div className="mb-2 h-4 w-48 rounded bg-muted" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="h-64 rounded-lg bg-muted" />
            <div className="h-64 rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    )
  }

  if (order === null) {
    // Redirecting to /orders
    return null
  }

  const canEdit =
    order?.status === "programado" || order?.status === "pendiente"

  // Check if we need to show edit mode
  const showEditMode =
    isEditing && canEdit && order && menuProducts && restaurantLocations

  const isDeliveryValid =
    form.watch("orderType") !== "delivery" || addressValidationResult?.isValid

  const areItemsValid =
    form.watch("items").length > 0 &&
    form.watch("items").every((item) => !!item.menuProduct)

  const deliveryFee = order.deliveryFee || 0
  const commonClasses = {
    card: "gap-1",
  }

  return (
    <Form {...form}>
      <form
        id="edit-order-form"
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex h-full flex-col gap-2.5 overflow-hidden p-2.5"
      >
        {/* Header Section */}
        <div className="flex flex-col gap-1 md:justify-between lg:flex-row lg:items-center">
          <div className="flex flex-row flex-wrap items-center justify-between gap-2 sm:flex-nowrap lg:justify-start">
            <div className="flex flex-shrink-0 items-center gap-1">
              {(isMobile || showEditMode) && onBack && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onBack}
                  className="flex-shrink-0"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </Button>
              )}
              <div className="flex flex-shrink-0 flex-col">
                <h2 className="font-bold text-2xl">
                  {showEditMode ? "Editar Pedido" : `#${order.orderNumber}`}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {showEditMode
                    ? `Modifica los detalles del #${order.orderNumber}`
                    : `Recibido ${formatExactTime(order._creationTime)}`}
                </p>
              </div>
            </div>

            {/* Status Buttons for Printed/Paid Status - Only show in view mode */}
            {!showEditMode && (
              <div className="flex flex-wrap justify-start gap-1">
                <ToggleOrderStatusDialog
                  order={order}
                  type="printed"
                  onToggle={
                    providedOrder
                      ? (active) => handleToggleStatus("printed", active)
                      : undefined
                  }
                >
                  <Button
                    variant={
                      providedOrder
                        ? mockPrinted
                          ? "default"
                          : "outline"
                        : order.printedAt
                          ? "default"
                          : "outline"
                    }
                    size="sm"
                    className="px-4"
                  >
                    {order.printedAt ? (
                      <>
                        <PrinterCheck />
                        Impreso
                      </>
                    ) : (
                      <>
                        <Printer />
                        No impreso
                      </>
                    )}
                  </Button>
                </ToggleOrderStatusDialog>
                <ToggleOrderStatusDialog
                  order={order}
                  type="paid"
                  onToggle={
                    providedOrder
                      ? (active) => handleToggleStatus("paid", active)
                      : undefined
                  }
                >
                  <Button
                    variant={
                      providedOrder
                        ? mockPaid
                          ? "default"
                          : "outline"
                        : order.paidAt
                          ? "default"
                          : "outline"
                    }
                    size="sm"
                    className="px-4"
                  >
                    {order.paidAt ? (
                      <>
                        <Banknote />
                        Pagado
                      </>
                    ) : (
                      <>
                        <X />
                        No pagado
                      </>
                    )}
                  </Button>
                </ToggleOrderStatusDialog>
              </div>
            )}
          </div>

          {isMobile ? (
            <SmartHorizontalScrollArea className="w-full">
              <div className="flex justify-center gap-1">
                {!showEditMode && (
                  <Select
                    value={order.status}
                    onValueChange={(value: OrderStatus) =>
                      handleStatusChange(order._id, value)
                    }
                  >
                    <SelectTrigger className="w-[160px] flex-shrink-0">
                      <SelectValue placeholder="Cambiar Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels)
                        .filter(([status]) => {
                          if (status === "all") return false
                          const allowedStatuses =
                            getAllowedStatusesForOrderType(order.orderType)
                          return allowedStatuses.includes(status as OrderStatus)
                        })
                        .map(([status, label]) => (
                          <SelectItem key={status} value={status}>
                            <div className="flex items-center gap-2">
                              {statusIcons[status as OrderStatus]}
                              {label}
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                {canEdit && !showEditMode && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => router.push(`/orders/${order._id}/print`)}
                      className="flex-shrink-0"
                    >
                      <PrinterIcon className="mr-2 h-4 w-4" />
                      Imprimir
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => setIsEditing(true)}
                      className="flex-shrink-0"
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                  </>
                )}
                {showEditMode && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                      className="flex-shrink-0"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      form="edit-order-form"
                      className="flex-shrink-0"
                      disabled={!isDeliveryValid || !areItemsValid}
                    >
                      Actualizar
                    </Button>
                  </>
                )}
              </div>
            </SmartHorizontalScrollArea>
          ) : (
            <div className="flex flex-wrap justify-end gap-1">
              {!showEditMode && (
                <Select
                  value={order.status}
                  onValueChange={(value: OrderStatus) =>
                    handleStatusChange(order._id, value)
                  }
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Cambiar Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels)
                      .filter(([status]) => {
                        if (status === "all") return false
                        const allowedStatuses = getAllowedStatusesForOrderType(
                          order.orderType
                        )
                        return allowedStatuses.includes(status as OrderStatus)
                      })
                      .map(([status, label]) => (
                        <SelectItem key={status} value={status}>
                          <div className="flex items-center gap-2">
                            {statusIcons[status as OrderStatus]}
                            {label}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              {canEdit && !showEditMode && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/orders/${order._id}/print`)}
                  >
                    <PrinterIcon className="mr-2 h-4 w-4" />
                    Imprimir
                  </Button>
                  <Button variant="default" onClick={() => setIsEditing(true)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                </>
              )}
              {showEditMode && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    form="edit-order-form"
                    disabled={!isDeliveryValid || !areItemsValid}
                  >
                    Actualizar
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        <ScrollArea className="h-0 flex-1">
          <div className="m-[1px] flex h-full min-h-0 flex-col gap-1 lg:flex-row">
            <div className="flex flex-1 flex-shrink-0 flex-col gap-1">
              {/* Detalles del pedido */}
              <Card className={commonClasses.card}>
                <CardHeader>
                  <CardTitle className="font-semibold text-lg">
                    Detalles del pedido
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {showEditMode ? (
                    <>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        {/* Restaurant Location */}
                        <FormField
                          control={form.control}
                          name="restaurantLocationId"
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel>Sucursal</FormLabel>
                              {restaurantLocations &&
                              restaurantLocations.length === 1 ? (
                                <div className="flex h-10 w-full cursor-not-allowed items-center justify-between rounded-md border border-input bg-muted px-3 py-2 text-sm opacity-50 ring-offset-background">
                                  <span>{restaurantLocations?.[0]?.name}</span>
                                  {restaurantLocations?.[0] && (
                                    <SchedulePreview
                                      location={restaurantLocations[0]}
                                      compact
                                    />
                                  )}
                                </div>
                              ) : (
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger className="h-auto w-full py-2">
                                      <SelectValue placeholder="Seleccionar sucursal">
                                        {field.value &&
                                        restaurantLocations?.find(
                                          (l) => l._id === field.value
                                        ) ? (
                                          <span className="mr-2 flex w-full items-center justify-between gap-1">
                                            <span>
                                              {
                                                restaurantLocations.find(
                                                  (l) => l._id === field.value
                                                )?.name
                                              }
                                            </span>
                                            <SchedulePreview
                                              location={
                                                restaurantLocations.find(
                                                  (l) => l._id === field.value
                                                )!
                                              }
                                              compact
                                            />
                                          </span>
                                        ) : (
                                          <span className="text-muted-foreground">
                                            Seleccionar sucursal
                                          </span>
                                        )}
                                      </SelectValue>
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {restaurantLocations?.map(
                                      (
                                        location: Doc<"restaurantLocations">,
                                        _idx
                                      ) => (
                                        <SelectItem
                                          key={location._id}
                                          value={location._id}
                                        >
                                          <div className="flex w-full min-w-[200px] items-center justify-between gap-2">
                                            <span>{location.name}</span>
                                            <SchedulePreview
                                              location={location}
                                              compact
                                            />
                                          </div>
                                        </SelectItem>
                                      )
                                    )}
                                  </SelectContent>
                                </Select>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="flex-1">
                          <PaymentSelectionSection
                            form={form}
                            enabledPaymentMethods={enabledPaymentMethods}
                            total={calculateTotal()}
                          />
                        </div>
                      </div>

                      {/* Order Type Toggle */}
                      <FormField
                        control={form.control}
                        name="orderType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipo de Entrega</FormLabel>
                            {enabledOrderTypes.length === 1 ? (
                              <div className="flex h-10 w-full cursor-not-allowed items-center rounded-md border border-input bg-muted px-3 py-2 text-sm opacity-50 ring-offset-background">
                                {enabledOrderTypes[0] === "delivery" ? (
                                  <>
                                    <Truck className="mr-2 h-4 w-4" /> Domicilio
                                  </>
                                ) : (
                                  <>
                                    <Home className="mr-2 h-4 w-4" /> Recoger
                                  </>
                                )}
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-2">
                                {enabledOrderTypes.includes("delivery") && (
                                  <Button
                                    type="button"
                                    variant={
                                      field.value === "delivery"
                                        ? "default"
                                        : "outline"
                                    }
                                    onClick={() => field.onChange("delivery")}
                                    className="w-full justify-start"
                                  >
                                    <Truck className="mr-2 h-4 w-4" />
                                    Domicilio
                                  </Button>
                                )}
                                {enabledOrderTypes.includes("pickup") && (
                                  <Button
                                    type="button"
                                    variant={
                                      field.value === "pickup"
                                        ? "default"
                                        : "outline"
                                    }
                                    onClick={() => field.onChange("pickup")}
                                    className="w-full justify-start"
                                  >
                                    <Home className="mr-2 h-4 w-4" />
                                    Recoger
                                  </Button>
                                )}
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Delivery Address */}
                      {watchOrderType === "delivery" && (
                        <AddressFormSection
                          form={form}
                          organizationId={order?.organizationId}
                          lastKnownAddress={order?.deliveryAddress}
                          initialValidationResult={initialValidationResult}
                          suppressInitialFocus={true}
                          onAddressValidated={(result) => {
                            setAddressValidationResult(result)
                            if (result?.isValid) {
                              if (result.fee !== undefined) {
                                form.setValue("deliveryFee", result.fee)
                              }
                              if (result.restaurantLocationId) {
                                form.setValue(
                                  "restaurantLocationId",
                                  result.restaurantLocationId
                                )
                              }
                            }
                          }}
                        />
                      )}
                    </>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-muted-foreground">Cliente</p>
                        <p className="ellipsis font-medium">
                          {order.customerName}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-muted-foreground">Teléfono</p>
                        <p className="ellipsis font-medium">
                          {order.customerPhone}
                        </p>
                      </div>
                      {order.deliveryAddress && (
                        <div>
                          <p className="mb-1 text-muted-foreground">
                            Dirección
                          </p>
                          <p className="ellipsis font-medium">
                            {order.deliveryAddress}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="mb-1 text-muted-foreground">
                          Tipo de Entrega
                        </p>
                        <p className="ellipsis font-medium">
                          {order.orderType === "delivery"
                            ? "Domicilio"
                            : "Recoger en tienda"}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-muted-foreground">Sucursal</p>
                        <p className="ellipsis font-medium">
                          {restaurantLocations?.find(
                            (location) =>
                              location._id === order.restaurantLocationId
                          )?.name || "Sucursal no encontrada"}
                        </p>
                      </div>
                      {order.scheduledTime && (
                        <div>
                          <p className="mb-1 text-muted-foreground">
                            Programado
                          </p>
                          <p className="ellipsis w-fit font-medium text-primary">
                            {new Date(order.scheduledTime).toLocaleString(
                              "es-CO",
                              {
                                timeZone: "America/Bogota",
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )}
                          </p>
                        </div>
                      )}
                      {order.printedAt && (
                        <div>
                          <p className="mb-1 text-muted-foreground">Impreso</p>
                          <p className="ellipsis font-medium">
                            {new Date(order.printedAt).toLocaleString("es-CO", {
                              timeZone: "America/Bogota",
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      )}

                      <div>
                        <p className="mb-1 text-muted-foreground">
                          Método de Pago
                        </p>
                        {"paymentMethods" in order &&
                        order.paymentMethods &&
                        order.paymentMethods.length > 0 ? (
                          <div className="space-y-2">
                            {order.paymentMethods.map((pm, idx) => (
                              <div
                                key={idx}
                                className="rounded border bg-background p-2"
                              >
                                <div className="flex items-center justify-between">
                                  <p className="ellipsis font-medium text-sm">
                                    {pm.method === "cash" && "Efectivo"}
                                    {pm.method === "card" && "Datafono"}
                                    {(pm.method === "payment_link" ||
                                      pm.method === "dynamic_payment_link") &&
                                      "Link de Pago"}
                                    {pm.method === "bank_transfer" &&
                                      "Transferencia"}
                                    {pm.method === "corporate_credit" &&
                                      "Crédito Corporativo"}
                                    {pm.method === "gift_voucher" &&
                                      "Bono de Regalo"}
                                    {pm.method === "sodexo_voucher" && "Sodexo"}
                                  </p>
                                  <p className="ellipsis font-semibold text-sm">
                                    {formatPrice(pm.amount || order.total)}
                                  </p>
                                </div>
                                {pm.referenceCode && (
                                  <p className="ellipsis text-muted-foreground text-xs">
                                    Código: {pm.referenceCode}
                                  </p>
                                )}
                                {pm.notes && (
                                  <p className="ellipsis text-muted-foreground text-xs">
                                    {pm.notes}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="ellipsis font-medium capitalize">
                            {order.paymentMethod === "cash" && "Efectivo"}
                            {order.paymentMethod === "card" && "Datafono"}
                            {(order.paymentMethod === "payment_link" ||
                              order.paymentMethod === "dynamic_payment_link") &&
                              "Link de Pago"}
                            {order.paymentMethod === "bank_transfer" &&
                              "Transferencia a Cuenta Bancaria"}
                            {order.paymentMethod === "corporate_credit" &&
                              "Crédito Corporativo"}
                            {order.paymentMethod === "gift_voucher" &&
                              "Bono de Regalo"}
                            {order.paymentMethod === "sodexo_voucher" &&
                              "Sodexo"}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="mb-1 text-muted-foreground">
                          Estado de Pago
                        </p>
                        <p className="ellipsis font-medium">
                          {providedOrder
                            ? mockPaid
                              ? "Pagado"
                              : "Pendiente"
                            : order.paidAt
                              ? `Pagado - ${new Date(
                                  order.paidAt
                                ).toLocaleString("es-CO", {
                                  timeZone: "America/Bogota",
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}`
                              : "Pendiente"}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-muted-foreground">Creación</p>
                        <p className="ellipsis font-medium">
                          {new Date(order._creationTime).toLocaleString(
                            "es-CO",
                            {
                              timeZone: "America/Bogota",
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Electronic Invoice */}
              {order.electronicInvoice && (
                <Card className={commonClasses.card}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-semibold text-lg">
                      <FileTextIcon className="h-5 w-5" />
                      Factura Electrónica
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="font-medium text-blue-900">
                          {order.electronicInvoice.invoiceType === "natural"
                            ? "Persona Natural"
                            : "Empresa/Jurídica"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="mb-1 text-blue-700">Nombre</p>
                          <p className="ellipsis font-medium text-blue-900">
                            {order.electronicInvoice.fullName}
                          </p>
                        </div>
                        <div>
                          <p className="mb-1 text-blue-700">Correo</p>
                          <p className="ellipsis font-medium text-blue-900">
                            {order.electronicInvoice.email}
                          </p>
                        </div>
                        {order.electronicInvoice.invoiceType === "natural" &&
                          order.electronicInvoice.cedula && (
                            <div>
                              <p className="mb-1 text-blue-700">Cédula</p>
                              <p className="ellipsis font-medium text-blue-900">
                                {order.electronicInvoice.cedula}
                              </p>
                            </div>
                          )}
                        {order.electronicInvoice.invoiceType === "juridica" &&
                          order.electronicInvoice.nit && (
                            <div>
                              <p className="mb-1 text-blue-700">NIT</p>
                              <p className="ellipsis font-medium text-blue-900">
                                {order.electronicInvoice.nit}
                              </p>
                            </div>
                          )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Productos */}
              {showEditMode ? (
                <OrderItemsSection form={form} menuProducts={menuProducts} />
              ) : (
                <Card className={commonClasses.card}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="font-semibold text-lg">
                      Productos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {order.items.length === 0 ? (
                      <div className="flex items-center justify-center py-12">
                        <p className="text-muted-foreground">
                          No hay productos en este pedido
                        </p>
                      </div>
                    ) : (
                      order.items.map((item) => {
                        const isCombo = item.itemType === "combo"

                        if (isCombo) {
                          // Group products by comboSlotName for display
                          const slotGroups = new Map<
                            string,
                            typeof item.products
                          >()
                          for (const product of item.products) {
                            const slotName =
                              product.comboSlotName || "Sin categoría"
                            const currentGroup = slotGroups.get(slotName)
                            if (currentGroup) {
                              currentGroup.push(product)
                            } else {
                              slotGroups.set(slotName, [product])
                            }
                          }

                          const totalUpcharges = item.products.reduce(
                            (sum, p) => sum + (p.upcharge || 0),
                            0
                          )

                          return (
                            <div
                              key={item._id}
                              className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-3"
                            >
                              {/* Combo header */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="secondary"
                                    className="bg-primary/10 text-primary text-xs"
                                  >
                                    {item.comboName ?? "Combo"}
                                  </Badge>
                                  <span className="font-semibold text-sm">
                                    {formatPrice(item.unitPrice)} ×{" "}
                                    {item.quantity}
                                  </span>
                                </div>
                              </div>

                              {/* Slot selections */}
                              <div className="space-y-1 pl-1">
                                {Array.from(slotGroups.entries()).map(
                                  ([slotName, products]) => (
                                    <div
                                      key={slotName}
                                      className="flex items-baseline gap-1.5 text-sm"
                                    >
                                      <span className="font-medium text-muted-foreground text-xs">
                                        {slotName}:
                                      </span>
                                      <span className="text-foreground text-xs">
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
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>

                              {/* Notes */}
                              {item.notes && (
                                <p className="ellipsis font-semibold text-muted-foreground text-xs uppercase underline">
                                  Nota - {item.notes}
                                </p>
                              )}

                              {/* Price breakdown */}
                              <div className="flex items-center justify-between border-primary/10 border-t pt-1.5 text-muted-foreground text-xs">
                                {item.comboBasePrice !== undefined &&
                                totalUpcharges > 0 ? (
                                  <span>
                                    Base: {formatPrice(item.comboBasePrice)} +
                                    Extras: {formatPrice(totalUpcharges)}
                                  </span>
                                ) : (
                                  <span />
                                )}
                                <span className="font-medium text-foreground">
                                  Subtotal: {formatPrice(item.totalPrice)}
                                </span>
                              </div>
                            </div>
                          )
                        }

                        // Regular item — unchanged rendering
                        const productNames = item.products
                          .map((p) => {
                            const sizePart = p.sizeName ? ` ${p.sizeName}` : ""
                            return `${p.name}${sizePart}`
                          })
                          .join(" + ")

                        return (
                          <div
                            key={item._id}
                            className="space-y-1 rounded-md bg-muted p-2"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="ellipsis font-medium text-sm">
                                  {productNames} - {formatPrice(item.unitPrice)}{" "}
                                  × {item.quantity}
                                </p>
                                {item.notes && (
                                  <p className="ellipsis mt-1 font-semibold text-muted-foreground text-xs uppercase underline">
                                    Nota - {item.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                            <p className="ellipsis text-muted-foreground text-xs">
                              Subtotal: {formatPrice(item.totalPrice)}
                            </p>
                          </div>
                        )
                      })
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
            <div className="flex w-full min-w-0 shrink-0 flex-col gap-1 lg:w-[360px]">
              {/* Resumen del Pedido - Sticky */}
              <div className="sticky top-0 flex flex-col gap-1">
                {/* Location Preview */}
                {!showEditMode &&
                  order.orderType === "delivery" &&
                  order.coordinates && (
                    <LocationPreview
                      latitude={order.coordinates.lat}
                      longitude={order.coordinates.lng}
                      address={order.deliveryAddress}
                      enableCopy
                    />
                  )}
                <Card>
                  <CardHeader>
                    <CardTitle className="font-semibold text-lg">
                      Resumen del Pedido
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium">
                          {showEditMode
                            ? formatPrice(calculateSubtotal())
                            : formatPrice(order.subtotal)}
                        </span>
                      </div>

                      {/* Delivery Fee - Editable only for delivery orders */}
                      {showEditMode
                        ? watchOrderType === "delivery" && (
                            <FormField
                              control={form.control}
                              name="deliveryFee"
                              render={({ field }) => (
                                <FormItem>
                                  <div className="flex items-center justify-between">
                                    <FormLabel className="text-muted-foreground text-sm">
                                      Domicilio
                                    </FormLabel>
                                    <FormControl>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs">$</span>
                                        <Input
                                          type="number"
                                          min="0"
                                          {...field}
                                          onChange={(e) =>
                                            field.onChange(
                                              Number(e.target.value) || 0
                                            )
                                          }
                                          className="h-7 w-24 text-right text-sm"
                                        />
                                      </div>
                                    </FormControl>
                                  </div>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )
                        : deliveryFee > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Domicilio
                              </span>
                              <span className="font-medium">
                                {formatPrice(deliveryFee)}
                              </span>
                            </div>
                          )}

                      <Separator />
                      <div className="flex items-center justify-between pt-2">
                        <span className="font-semibold text-base">Total</span>
                        <span className="font-bold text-primary text-xl">
                          {showEditMode
                            ? formatPrice(calculateTotal())
                            : formatPrice(order.total)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Additional content after summary */}
                {!showEditMode && order.conversationId && (
                  <Button
                    type="button"
                    variant="none"
                    onClick={() =>
                      router.push(`/conversations/${order.conversationId}`)
                    }
                    className="group flex w-full items-center gap-2 text-primary"
                  >
                    <MessageCircleIcon className="h-4 w-4" />
                    <span className="underline-offset-4 hover:underline group-hover:underline">
                      Ver conversación
                    </span>
                    {conversation && (
                      <ConversationStatusBadge status={conversation.status} />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </form>

      <AlertDialog open={navigationDialog.isOpen} onOpenChange={closeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Tienes cambios sin guardar?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios pendientes en el pedido. Si sales ahora, perderás
              los cambios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmNavigation}>
              Continuar sin guardar
            </Button>
            <AlertDialogAction onClick={handleSaveAndContinue}>
              Guardar y continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  )
}

export const OrderIdView = ({
  orderId,
  onBack,
  isMobile,
}: {
  orderId: Id<"orders">
  onBack?: () => void
  isMobile?: boolean
}) => {
  // Check if this is a mock order ID
  const isMockOrder =
    typeof orderId === "string" && orderId.startsWith("mock-order-")

  if (isMockOrder) {
    // For mock orders, render with mock data
    const mockOrder = generateMockOrderById(orderId)
    return (
      <OrderIdViewContent
        order={mockOrder}
        onBack={onBack}
        isMobile={isMobile}
      />
    )
  }

  // For real orders, use the API component
  return (
    <OrderIdViewContent orderId={orderId} onBack={onBack} isMobile={isMobile} />
  )
}
