"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
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
import { cn } from "@workspace/ui/lib/utils"
import { ConfigProvider, DatePicker, TimePicker } from "antd"
import esES from "antd/lib/locale/es_ES"
import { useMutation, useQuery } from "convex/react"
import dayjs from "dayjs"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"
import {
  Check,
  Clock,
  Home,
  Layers,
  Loader2,
  Package,
  Truck,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { useOrganization } from "@/hooks/use-organization"
import { formatPrice } from "@/lib/currency"
import { handleConvexError } from "@/lib/error-handling"
import { calculateComboSubtotal } from "@/lib/order-pricing"
import { generateTimeSlots, isLocationOpen } from "@/lib/schedule-helpers"
import {
  AddressFormSection,
  type AddressValidationResult,
} from "./address-form-section"
import { type ComboItemData, ComboSlotPicker } from "./combo-slot-picker"
import { ConversationStatusBadge } from "./conversation-status-badge"
import { OrderItemsSection } from "./order-items-section"
import { OrderStatusBadge } from "./order-status-badge"
import { PaymentSelectionSection } from "./payment-selection-section"
import { SchedulePreview } from "./schedule-preview"
import "dayjs/locale/es"

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale("es")
dayjs.tz.setDefault("America/Bogota")

const orderFormSchema = z
  .object({
    conversationId: z.string().min(1, "Debe seleccionar una conversación"),
    orderType: z.enum(["delivery", "pickup"], {
      required_error: "El tipo de pedido es obligatorio",
    }),
    deliveryAddress: z.string().optional(),
    paymentMethod: z
      .enum(
        [
          "cash",
          "card",
          "payment_link",
          "bank_transfer",
          "corporate_credit",
          "gift_voucher",
          "sodexo_voucher",
          "dynamic_payment_link",
        ],
        {
          required_error: "El método de pago es obligatorio",
        }
      )
      .optional(),
    paymentMethods: z
      .array(
        z.object({
          method: z.enum([
            "cash",
            "card",
            "payment_link",
            "bank_transfer",
            "corporate_credit",
            "gift_voucher",
            "sodexo_voucher",
            "dynamic_payment_link",
          ]),
          amount: z.number().min(1, "El monto debe ser mayor a 0").optional(),
        })
      )
      .min(1, "Debe seleccionar al menos un método de pago"),
    restaurantLocationId: z
      .string()
      .min(1, "La ubicación del restaurante es obligatoria"),
    scheduledTime: z.string().optional(),
    deliveryFee: z.number().min(0, "El costo de envío no puede ser negativo"),
    items: z
      .array(
        z.object({
          menuProduct: z.string().optional(),
          quantity: z.number().min(1, "La cantidad debe ser mayor a 0"),
          notes: z.string().optional(),
          itemType: z.enum(["regular", "combo"]).optional(),
          comboId: z.string().optional(),
          comboName: z.string().optional(),
          comboBasePrice: z.number().optional(),
          comboSlotSelections: z
            .array(
              z.object({
                slotId: z.string().optional(),
                slotName: z.string(),
                menuProductId: z.string(),
                productName: z.string(),
                upcharge: z.number(),
                quantity: z.number().int().min(1).optional(),
              })
            )
            .optional(),
          menuProducts: z.array(z.string()).optional(),
        })
      )
      .min(1, "Debe agregar al menos un artículo al pedido"),
  })
  .refine(
    (data) => {
      if (data.orderType === "delivery" && !data.deliveryAddress) {
        return false
      }
      return true
    },
    {
      message:
        "La dirección de entrega es obligatoria para pedidos de delivery",
      path: ["deliveryAddress"],
    }
  )

type OrderFormValues = z.infer<typeof orderFormSchema>

interface CreateOrderDialogProps {
  children: React.ReactNode
}

export function CreateOrderDialog({ children }: CreateOrderDialogProps) {
  const { activeOrganizationId } = useOrganization()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const menuProducts = useQuery(
    api.private.menuProducts.list,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          paginationOpts: { numItems: 1000, cursor: null },
        }
      : "skip"
  )

  const restaurantLocations = useQuery(
    api.private.restaurantLocations.list,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
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
  type PaymentMethodType =
    | "cash"
    | "card"
    | "payment_link"
    | "bank_transfer"
    | "corporate_credit"
    | "gift_voucher"
    | "sodexo_voucher"
    | "dynamic_payment_link"

  const enabledPaymentMethods = useMemo((): PaymentMethodType[] => {
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

    const methods: PaymentMethodType[] = []
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

  const conversationsResult = useQuery(
    api.private.conversations.getMany,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          paginationOpts: { numItems: 50, cursor: null },
          status: "escalated",
          orderExistence: "without-order",
        }
      : "skip"
  )
  const createOrder = useMutation(
    api.private.orders.createOrderFromConversation
  )

  const escalatedConversations = conversationsResult?.page || []

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      conversationId: "",
      orderType: "delivery",
      deliveryAddress: "",
      paymentMethod: "cash",
      restaurantLocationId: "",
      scheduledTime: "",
      deliveryFee: 0,
      items: [],
      paymentMethods: [{ method: "cash", amount: 0 }],
    },
  })

  // Auto-select single options
  useEffect(() => {
    if (enabledOrderTypes.length === 1) {
      form.setValue("orderType", enabledOrderTypes[0] as "delivery" | "pickup")
    }
  }, [enabledOrderTypes, form])

  useEffect(() => {
    if (
      restaurantLocations &&
      restaurantLocations.length === 1 &&
      restaurantLocations[0]
    ) {
      form.setValue("restaurantLocationId", restaurantLocations[0]._id)
    }
  }, [restaurantLocations, form])

  // ... (keep field array hook) ...
  const { fields, append, prepend, remove } = useFieldArray({
    control: form.control,
    name: "items",
  })

  const watchOrderType = form.watch("orderType")
  const watchScheduledTime = form.watch("scheduledTime")
  // ... (keep other watches) ...
  const watchItems = form.watch("items")
  const watchConversationId = form.watch("conversationId")
  const watchDeliveryFee = form.watch("deliveryFee")
  const watchDeliveryAddress = form.watch("deliveryAddress")

  const selectedConversation = escalatedConversations?.find(
    (conv) => conv._id === watchConversationId
  )
  // Address Validation State (Only keep result for submission usage)
  const [addressValidationResult, setAddressValidationResult] =
    useState<AddressValidationResult | null>(null)
  const [showComboPicker, setShowComboPicker] = useState(false)
  const [pendingComboData, setPendingComboData] =
    useState<ComboItemData | null>(null)

  const handleConfirmCombo = useCallback(() => {
    if (!pendingComboData) return
    prepend({
      itemType: "combo" as const,
      comboId: pendingComboData.comboId,
      comboName: pendingComboData.comboName,
      comboBasePrice: pendingComboData.comboBasePrice,
      menuProducts: pendingComboData.menuProducts,
      comboSlotSelections: pendingComboData.comboSlotSelections,
      quantity: pendingComboData.quantity,
      notes: pendingComboData.notes ?? "",
    })
    setShowComboPicker(false)
    setPendingComboData(null)
  }, [prepend, pendingComboData])

  const availablePaymentMethods = useMemo(() => {
    const methods = [
      {
        value: "cash",
        label: "Efectivo",
        enabled: restaurantConfig?.acceptCash ?? true,
      },
      {
        value: "card",
        label: "Datafono",
        enabled: restaurantConfig?.acceptCard ?? true,
      },
      {
        value: "payment_link",
        label: "Link de Pago",
        enabled: restaurantConfig?.acceptPaymentLink ?? false,
      },
      {
        value: "bank_transfer",
        label: "Transferencia a Cuenta Bancaria",
        enabled: restaurantConfig?.acceptBankTransfer ?? false,
      },
      {
        value: "corporate_credit",
        label: "Crédito Corporativo",
        enabled: restaurantConfig?.acceptCorporateCredit ?? false,
      },
      {
        value: "gift_voucher",
        label: "Bono de Regalo",
        enabled: restaurantConfig?.acceptGiftVoucher ?? false,
      },
      {
        value: "sodexo_voucher",
        label: "Sodexo",
        enabled: restaurantConfig?.acceptSodexoVoucher ?? false,
      },
      {
        value: "dynamic_payment_link",
        label: "Link de Pago",
        enabled: restaurantConfig?.acceptDynamicPaymentLink ?? false,
      },
    ]
    return methods.filter((m) => m.enabled)
  }, [restaurantConfig])

  const calculateItemSubtotal = useCallback(
    (itemIndex: number) => {
      const item = watchItems[itemIndex]
      if (!item) return 0

      if (item.itemType === "combo") {
        return calculateComboSubtotal({
          comboBasePrice: item.comboBasePrice,
          comboSlotSelections: item.comboSlotSelections,
          quantity: item.quantity,
        })
      }

      if (!menuProducts?.page || !item.menuProduct) return 0
      const product = menuProducts.page.find(
        (pm) => pm._id === item.menuProduct
      )
      return (product?.price || 0) * item.quantity
    },
    [menuProducts?.page, watchItems]
  )

  const calculateSubtotal = useCallback(() => {
    return watchItems.reduce(
      (total, _item, index) => total + calculateItemSubtotal(index),
      0
    )
  }, [watchItems, calculateItemSubtotal])

  const calculateTotal = useCallback(() => {
    const subtotal = calculateSubtotal()
    const deliveryFee = watchOrderType === "delivery" ? watchDeliveryFee : 0
    return subtotal + deliveryFee
  }, [calculateSubtotal, watchOrderType, watchDeliveryFee])

  useEffect(() => {
    if (enabledPaymentMethods.length === 1 && enabledPaymentMethods[0]) {
      form.setValue("paymentMethods", [
        {
          method: enabledPaymentMethods[0] as PaymentMethodType,
          amount: calculateTotal(),
        },
      ])
    }
  }, [enabledPaymentMethods, form, calculateTotal])

  const resetForm = () => {
    form.reset()
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm()
    }
    setOpen(isOpen)
  }

  const onSubmit = async (values: OrderFormValues) => {
    if (!activeOrganizationId) return
    try {
      const scheduledTime = values.scheduledTime
        ? new Date(values.scheduledTime).getTime()
        : undefined

      const result = await createOrder({
        organizationId: activeOrganizationId,
        conversationId: values.conversationId as Id<"conversations">,
        orderType: values.orderType,
        deliveryAddress:
          values.orderType === "delivery" ? values.deliveryAddress : undefined,
        coordinates:
          values.orderType === "delivery" &&
          addressValidationResult?.isValid &&
          addressValidationResult.coordinates
            ? addressValidationResult.coordinates
            : undefined,
        paymentMethod: (values.paymentMethods?.[0]?.method ||
          "cash") as PaymentMethodType,
        paymentMethods: values.paymentMethods?.map((pm) => ({
          ...pm,
          method: pm.method as PaymentMethodType,
        })),
        restaurantLocationId:
          values.restaurantLocationId as Id<"restaurantLocations">,
        scheduledTime,
        deliveryFee: values.orderType === "delivery" ? values.deliveryFee : 0,
        items: values.items
          .filter((i) =>
            i.itemType === "combo" ? !!i.comboId : !!i.menuProduct
          )
          .map((item) => {
            if (item.itemType === "combo") {
              return {
                menuProducts: (item.menuProducts || []) as Id<"menuProducts">[],
                quantity: item.quantity,
                notes: item.notes || undefined,
                itemType: "combo" as const,
                comboId: item.comboId,
                comboName: item.comboName,
                comboBasePrice: item.comboBasePrice,
                comboSlotSelections: item.comboSlotSelections,
              }
            }
            return {
              menuProducts: [item.menuProduct as Id<"menuProducts">],
              quantity: item.quantity,
              notes: item.notes || undefined,
            }
          }),
      })

      toast.success(`Pedido creado exitosamente: ${result.orderNumber}`)
      setOpen(false)
      resetForm()
      router.push(`/orders/${result.orderId}`)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const canSubmit =
    !!watchConversationId &&
    calculateTotal() > 0 &&
    watchItems.length > 0 &&
    watchItems.every(
      (item) =>
        (item.itemType === "combo" && !!item.comboId) || !!item.menuProduct
    ) &&
    (watchOrderType !== "delivery" || addressValidationResult?.isValid)
  const hasItems = watchItems.some(
    (item) =>
      (item.itemType === "combo" && !!item.comboId) || !!item.menuProduct
  )

  const selectedLocation = restaurantLocations?.find(
    (l) => l._id === form.watch("restaurantLocationId")
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className={cn(
          "flex flex-col overflow-hidden p-0 transition-all duration-300 ease-in-out",
          watchConversationId
            ? "h-[90dvh] w-full sm:max-w-[90vw] lg:max-w-7xl"
            : "h-auto w-fit pr-4"
        )}
        aria-describedby={undefined}
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex h-full flex-col"
          >
            {/* Header */}
            <div className="flex flex-shrink-0 flex-col gap-4 border-b px-6 py-4 md:flex-row md:items-center md:justify-between">
              <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
                <DialogTitle className="flex flex-shrink-0 items-center gap-2 font-bold text-xl">
                  <Package className="h-6 w-6" />
                  <span className="whitespace-nowrap">Crear Pedido</span>
                  <span className="hidden md:inline-block">para</span>
                </DialogTitle>

                <div className="w-full">
                  <FormField
                    control={form.control}
                    name="conversationId"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Seleccionar cliente">
                                {selectedConversation ? (
                                  <span className="font-medium">
                                    {selectedConversation.contact.displayName ||
                                      "Sin Nombre"}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    Seleccionar cliente
                                  </span>
                                )}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {escalatedConversations?.length === 0 ? (
                              <div className="p-4 text-center text-muted-foreground text-sm">
                                No hay conversaciones escaladas disponibles
                              </div>
                            ) : (
                              escalatedConversations?.map((conv) => (
                                <SelectItem key={conv._id} value={conv._id}>
                                  <div className="flex flex-col text-left">
                                    <span className="font-medium">
                                      {conv.contact.displayName || "Sin Nombre"}
                                    </span>
                                    <span className="text-muted-foreground text-xs">
                                      {conv.contact.phoneNumber}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Main Content */}
            {watchConversationId ? (
              <>
                <div className="fade-in slide-in-from-bottom-4 flex flex-1 animate-in flex-col overflow-hidden duration-500">
                  {/* Left Column - Scrollable Inputs */}
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <ScrollArea className="h-full">
                      <div className="flex flex-col gap-4 p-4 lg:p-6">
                        {/* Customer Info (Read Only) */}
                        {selectedConversation && (
                          <Card className="gap-1">
                            <CardHeader>
                              <CardTitle className="text-base">
                                Información del Cliente
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="font-medium text-muted-foreground text-xs uppercase">
                                    Teléfono
                                  </p>
                                  <p className="font-medium">
                                    {selectedConversation.contact.phoneNumber}
                                  </p>
                                </div>
                                <div>
                                  <p className="font-medium text-muted-foreground text-xs uppercase">
                                    Última dirección
                                  </p>
                                  <p className="font-medium">
                                    {selectedConversation.contact
                                      .lastKnownAddress || "N/A"}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {/* Order Details */}
                        <Card className="gap-1">
                          <CardHeader>
                            <CardTitle className="text-base">
                              Detalles del Pedido
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                              <FormField
                                control={form.control}
                                name="restaurantLocationId"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Sucursal</FormLabel>
                                    {restaurantLocations &&
                                    restaurantLocations.length === 1 ? (
                                      <div className="flex h-10 w-full cursor-not-allowed items-center justify-between rounded-md border border-input bg-muted px-3 py-2 text-sm opacity-50 ring-offset-background">
                                        <span>
                                          {restaurantLocations?.[0]?.name}
                                        </span>
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
                                          <SelectTrigger className="h-auto py-2">
                                            <SelectValue placeholder="Seleccionar sucursal">
                                              {field.value &&
                                              restaurantLocations?.find(
                                                (l) => l._id === field.value
                                              ) ? (
                                                <span className="mr-2 flex w-full items-center justify-between gap-1">
                                                  <span>
                                                    {
                                                      restaurantLocations.find(
                                                        (l) =>
                                                          l._id === field.value
                                                      )?.name
                                                    }
                                                  </span>
                                                  {restaurantLocations.find(
                                                    (l) => l._id === field.value
                                                  ) && (
                                                    <SchedulePreview
                                                      location={
                                                        restaurantLocations.find(
                                                          (l) =>
                                                            l._id ===
                                                            field.value
                                                        )!
                                                      }
                                                      compact
                                                    />
                                                  )}
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
                                          {restaurantLocations?.map((loc) => (
                                            <SelectItem
                                              key={loc._id}
                                              value={loc._id}
                                            >
                                              <div className="flex w-full min-w-[280px] items-center justify-between">
                                                <span>{loc.name}</span>
                                                <SchedulePreview
                                                  location={loc}
                                                  compact
                                                />
                                              </div>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <PaymentSelectionSection
                                form={form}
                                enabledPaymentMethods={enabledPaymentMethods}
                                total={calculateTotal()}
                              />
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                                            <Truck className="mr-2 h-4 w-4" />{" "}
                                            Domicilio
                                          </>
                                        ) : (
                                          <>
                                            <Home className="mr-2 h-4 w-4" />{" "}
                                            Recoger
                                          </>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-2 gap-2">
                                        {enabledOrderTypes.includes(
                                          "delivery"
                                        ) && (
                                          <Button
                                            type="button"
                                            variant={
                                              field.value === "delivery"
                                                ? "default"
                                                : "outline"
                                            }
                                            onClick={() =>
                                              field.onChange("delivery")
                                            }
                                            className="w-full justify-start"
                                          >
                                            <Truck className="mr-2 h-4 w-4" />
                                            Domicilio
                                          </Button>
                                        )}
                                        {enabledOrderTypes.includes(
                                          "pickup"
                                        ) && (
                                          <Button
                                            type="button"
                                            variant={
                                              field.value === "pickup"
                                                ? "default"
                                                : "outline"
                                            }
                                            onClick={() =>
                                              field.onChange("pickup")
                                            }
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

                              <FormField
                                control={form.control}
                                name="scheduledTime"
                                render={({ field }) => {
                                  const selectedRestaurantId = form.watch(
                                    "restaurantLocationId"
                                  )
                                  const selectedLocation =
                                    restaurantLocations?.find(
                                      (l) => l._id === selectedRestaurantId
                                    )
                                  const { isOpen } = selectedLocation
                                    ? isLocationOpen(selectedLocation)
                                    : { isOpen: true }

                                  // If closed, scheduling is mandatory
                                  const isRequired =
                                    !isOpen && !!selectedRestaurantId

                                  // Split current value into Date and Time for UI
                                  // Use Bogota TZ to determine what "Day" and "Time" it is
                                  const currentValue = field.value
                                    ? dayjs(field.value).tz("America/Bogota")
                                    : null
                                  const dateValue = currentValue
                                    ? currentValue.format("YYYY-MM-DD")
                                    : ""
                                  // timeValue can pass the dayjs object directly, AntD handles it
                                  const timeValue = currentValue

                                  const handleDateChange = (
                                    e: React.ChangeEvent<HTMLInputElement>
                                  ) => {
                                    const newDateStr = e.target.value
                                    if (!newDateStr) {
                                      field.onChange("")
                                      return
                                    }

                                    const newDateTime = new Date(newDateStr)

                                    if (timeValue) {
                                      // Maintain time if already selected
                                      const [h, m] = [
                                        timeValue.hour(),
                                        timeValue.minute(),
                                      ]
                                      newDateTime.setHours(h, m)

                                      // Re-apply timezone context if needed, but for simple preservation:
                                      field.onChange(
                                        dayjs(newDateTime).toISOString()
                                      )
                                    } else {
                                      // Initialize with default time (noon) to allow date persistence without specific time yet
                                      field.onChange(
                                        new Date(
                                          `${newDateStr}T12:00:00`
                                        ).toISOString()
                                      )
                                    }
                                  }

                                  // Calculate Disabled Times using generateTimeSlots
                                  const disabledTime = () => {
                                    if (!selectedLocation || !dateValue)
                                      return {}
                                    const validSlots = generateTimeSlots(
                                      selectedLocation,
                                      dateValue
                                    )

                                    const disabledHours = () => {
                                      const hours = []
                                      for (let i = 0; i < 24; i++) {
                                        // Check if this hour has ANY valid slot
                                        // A slot is "HH:MM".
                                        // If no slot starts with "HH:", then HH is disabled.
                                        const prefix = `${i.toString().padStart(2, "0")}:`
                                        if (
                                          !validSlots.some((s) =>
                                            s.startsWith(prefix)
                                          )
                                        ) {
                                          hours.push(i)
                                        }
                                      }
                                      return hours
                                    }

                                    const disabledMinutes = (
                                      selectedHour: number
                                    ) => {
                                      const minutes = []
                                      const prefix = `${selectedHour
                                        .toString()
                                        .padStart(2, "0")}:`
                                      for (let i = 0; i < 60; i += 15) {
                                        // Assuming 15 min steps from helper
                                        // Check if specific HH:MM is in slots
                                        const timeStr =
                                          prefix + i.toString().padStart(2, "0")
                                        if (!validSlots.includes(timeStr)) {
                                          minutes.push(i)
                                        }
                                      }
                                      // Also disable non-15 min steps?
                                      for (let i = 0; i < 60; i++) {
                                        if (i % 15 !== 0) minutes.push(i)
                                      }
                                      return minutes
                                    }
                                    return { disabledHours, disabledMinutes }
                                  }

                                  return (
                                    <FormItem>
                                      <FormLabel className="flex items-center gap-2">
                                        <Clock className="h-4 w-4" />
                                        Programar{" "}
                                        {isRequired ? (
                                          <span className="text-destructive">
                                            *
                                          </span>
                                        ) : (
                                          "(Opcional)"
                                        )}
                                      </FormLabel>
                                      <FormControl>
                                        <div className="flex flex-col gap-2">
                                          <div className="flex items-center gap-2">
                                            <ConfigProvider
                                              locale={esES}
                                              theme={{
                                                token: {
                                                  // Layout
                                                  borderRadius: 7.6, // Matches --radius: 0.475rem
                                                  controlHeight: 36, // Matches h-9
                                                  fontFamily:
                                                    "var(--font-sans)",
                                                  fontSize: 14, // text-sm

                                                  // Colors
                                                  colorBgContainer:
                                                    "transparent",
                                                  colorBorder: "var(--input)", // Matches border-input
                                                  colorPrimary: "var(--ring)", // Matches ring color
                                                  colorText:
                                                    "var(--foreground)",
                                                  colorTextPlaceholder:
                                                    "var(--muted-foreground)",
                                                  controlItemBgActive:
                                                    "var(--primary)",

                                                  // Focus States (Simulating Shadcn ring)
                                                  controlOutlineWidth: 3,
                                                  colorPrimaryHover:
                                                    "var(--ring)",
                                                },
                                                components: {
                                                  DatePicker: {
                                                    activeBorderColor:
                                                      "var(--ring)",
                                                    hoverBorderColor:
                                                      "var(--ring)",
                                                    activeShadow:
                                                      "0 0 0 3px color-mix(in srgb, var(--ring) 50%, transparent)",
                                                  },
                                                },
                                              }}
                                            >
                                              <DatePicker
                                                allowClear={false}
                                                format="DD/MM/YYYY"
                                                placeholder="Seleccionar fecha"
                                                minDate={dayjs()}
                                                value={
                                                  dateValue
                                                    ? dayjs(dateValue)
                                                    : null
                                                }
                                                onChange={(date) => {
                                                  if (!date) {
                                                    // Should not happen with allowClear={false} but safe check
                                                    return
                                                  }
                                                  const dateStr =
                                                    date.format("YYYY-MM-DD")

                                                  // Try to preserve existing time or set default
                                                  if (timeValue) {
                                                    const [h, m] = [
                                                      timeValue.hour(),
                                                      timeValue.minute(),
                                                    ]
                                                    // Construct new date in Bogota time with preserved time
                                                    const newDateTime = dayjs
                                                      .tz(
                                                        dateStr,
                                                        "YYYY-MM-DD",
                                                        "America/Bogota"
                                                      )
                                                      .hour(h)
                                                      .minute(m)
                                                    field.onChange(
                                                      newDateTime.toISOString()
                                                    )
                                                  } else {
                                                    // Initialize: date at 12:00 Bogota time
                                                    const newDateTime = dayjs
                                                      .tz(
                                                        dateStr,
                                                        "YYYY-MM-DD",
                                                        "America/Bogota"
                                                      )
                                                      .hour(12)
                                                      .minute(0)
                                                    field.onChange(
                                                      newDateTime.toISOString()
                                                    )
                                                  }
                                                }}
                                                className={cn(
                                                  "w-[160px]",
                                                  "shadow-sm transition-colors hover:border-ring focus:border-ring",
                                                  "font-medium [&_input]:text-primary"
                                                )}
                                                status={
                                                  isRequired && !field.value
                                                    ? "error"
                                                    : ""
                                                }
                                                inputReadOnly
                                              />
                                            </ConfigProvider>

                                            {/* Time Picker (AntD) */}
                                            <ConfigProvider
                                              locale={esES}
                                              theme={{
                                                token: {
                                                  borderRadius: 7.6,
                                                  controlHeight: 36,
                                                  fontFamily:
                                                    "var(--font-sans)",
                                                  controlItemBgActive:
                                                    "var(--primary)",
                                                  fontSize: 14,

                                                  colorBgContainer:
                                                    "transparent",
                                                  colorBorder: "var(--input)",
                                                  colorPrimary: "var(--ring)",
                                                  colorText:
                                                    "var(--foreground)",
                                                  colorTextPlaceholder:
                                                    "var(--muted-foreground)",

                                                  controlOutlineWidth: 3,
                                                  colorPrimaryHover:
                                                    "var(--ring)",
                                                },
                                                components: {
                                                  DatePicker: {
                                                    activeBorderColor:
                                                      "var(--ring)",
                                                    hoverBorderColor:
                                                      "var(--ring)",
                                                    activeShadow:
                                                      "0 0 0 3px color-mix(in srgb, var(--ring) 50%, transparent)",
                                                  },
                                                },
                                              }}
                                            >
                                              <TimePicker
                                                allowClear={false}
                                                format="h:mm a"
                                                use12Hours
                                                value={timeValue}
                                                minuteStep={15}
                                                disabled={!dateValue}
                                                placeholder="Hora"
                                                disabledTime={disabledTime}
                                                onChange={(time) => {
                                                  if (!time || !dateValue) {
                                                    return
                                                  }
                                                  const [h, m] = [
                                                    time.hour(),
                                                    time.minute(),
                                                  ]

                                                  const bogotaDate = dayjs
                                                    .tz(
                                                      dateValue,
                                                      "America/Bogota"
                                                    )
                                                    .hour(h)
                                                    .minute(m)

                                                  field.onChange(
                                                    bogotaDate.toISOString()
                                                  )
                                                }}
                                                className={cn(
                                                  "shadow-sm transition-colors hover:border-ring focus:border-ring",
                                                  "font-medium [&_input]:text-primary"
                                                )}
                                                status={
                                                  isRequired && !field.value
                                                    ? "error"
                                                    : ""
                                                }
                                                inputReadOnly
                                              />
                                            </ConfigProvider>

                                            {field.value && (
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                                                onClick={() =>
                                                  field.onChange("")
                                                }
                                                title="Limpiar horario de programación"
                                              >
                                                <X className="h-4 w-4" />
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      </FormControl>
                                      {isRequired && !field.value && (
                                        <FormMessage>
                                          La sucursal está cerrada. Debes
                                          programar el pedido.
                                        </FormMessage>
                                      )}
                                    </FormItem>
                                  )
                                }}
                              />
                            </div>

                            {watchOrderType === "delivery" && (
                              <AddressFormSection
                                form={form}
                                organizationId={
                                  selectedConversation?.organizationId
                                }
                                lastKnownAddress={
                                  selectedConversation?.contact.lastKnownAddress
                                }
                                suppressInitialFocus={false}
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
                          </CardContent>
                        </Card>

                        {/* Items */}
                        <OrderItemsSection
                          form={form}
                          menuProducts={menuProducts}
                        />

                        {/* Combo Picker */}
                        {showComboPicker && activeOrganizationId ? (
                          <div className="space-y-3">
                            <ComboSlotPicker
                              organizationId={activeOrganizationId}
                              restaurantLocationId={form.watch(
                                "restaurantLocationId"
                              )}
                              onChange={setPendingComboData}
                              onRemove={() => {
                                setShowComboPicker(false)
                                setPendingComboData(null)
                              }}
                            />
                            {pendingComboData && (
                              <Button
                                type="button"
                                onClick={handleConfirmCombo}
                                className="w-full"
                              >
                                Agregar Combo al Pedido
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full gap-2 border-dashed"
                            onClick={() => setShowComboPicker(true)}
                          >
                            <Layers className="h-4 w-4" />
                            Agregar Combo
                          </Button>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>

                {/* Footer - Animated */}
                <div className="fade-in slide-in-from-bottom-4 flex flex-shrink-0 animate-in flex-col gap-4 divide-y border-t bg-muted/40 px-6 py-4 delay-100 duration-500">
                  {/* Summary Breakdown */}
                  {(hasItems || watchOrderType === "delivery") && (
                    <div className="flex flex-col items-start gap-2 pb-4 text-sm">
                      {hasItems && (
                        <div className="flex w-full justify-between md:w-64">
                          <span className="text-muted-foreground">
                            Subtotal:
                          </span>
                          <span>{formatPrice(calculateSubtotal())}</span>
                        </div>
                      )}

                      {watchOrderType === "delivery" && (
                        <div className="flex w-full items-center justify-between md:w-64">
                          <span className="text-muted-foreground">
                            Domicilio:
                          </span>
                          <FormField
                            control={form.control}
                            name="deliveryFee"
                            render={({ field }) => (
                              <div className="flex w-24 items-center gap-1">
                                <span className="text-xs">$</span>
                                <Input
                                  type="number"
                                  className="h-7 bg-background px-2 text-right"
                                  min="0"
                                  {...field}
                                  onChange={(e) =>
                                    field.onChange(Number(e.target.value))
                                  }
                                />
                              </div>
                            )}
                          />
                        </div>
                      )}

                      {(hasItems ||
                        (watchOrderType === "delivery" &&
                          Number(form.watch("deliveryFee") || 0) > 0)) && (
                        <div className="flex w-full justify-between font-bold text-lg md:w-64">
                          <span>Total:</span>
                          <span>{formatPrice(calculateTotal())}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="hidden text-muted-foreground text-xs sm:inline">
                        El pedido se creará en estado:
                      </span>
                      <OrderStatusBadge
                        status={
                          watchScheduledTime ||
                          (selectedLocation &&
                            !isLocationOpen(selectedLocation, dayjs().toDate())
                              .isOpen)
                            ? "programado"
                            : "pendiente"
                        }
                        classNames="py-0 px-2 h-5 text-[10px] cursor-default"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpen(false)}
                        disabled={form.formState.isSubmitting}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={!canSubmit || form.formState.isSubmitting}
                      >
                        {form.formState.isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creando...
                          </>
                        ) : (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            Crear Pedido
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="fade-in zoom-in-95 flex flex-1 animate-in flex-col items-center justify-center p-8 text-center duration-500">
                <div className="flex max-w-md flex-col items-center gap-4">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">
                      Selecciona una conversación
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Solo se puede crear una orden para clientes con una
                      conversación en estado{" "}
                      <ConversationStatusBadge
                        status="escalated"
                        className="inline-flex"
                      />{" "}
                      la cual se mostrará en el selector del encabezado de dicha
                      conversación.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
