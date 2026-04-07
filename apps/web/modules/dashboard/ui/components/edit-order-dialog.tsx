"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@workspace/backend/_generated/api"
import type { Doc, Id } from "@workspace/backend/_generated/dataModel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import { Card } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"
import { useMutation, useQuery } from "convex/react"
import { addDays, format, startOfDay } from "date-fns"
import { es } from "date-fns/locale"
import {
  CalendarIcon,
  Edit,
  Layers,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"
import { calculateComboSubtotal } from "@/lib/order-pricing"
import type { ComboItemData, ComboSlotSelection } from "./combo-slot-picker"
import { ComboSlotPicker } from "./combo-slot-picker"

const editOrderFormSchema = z
  .object({
    orderType: z.enum(["delivery", "pickup"], {
      required_error: "El tipo de pedido es obligatorio",
    }),
    deliveryAddress: z.string().optional(),
    paymentMethod: z.enum(
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
    ),
    restaurantLocationId: z
      .string()
      .min(1, "La ubicación del restaurante es obligatoria"),
    scheduledDate: z.date().optional(),
    scheduledTime: z.string().optional(),
    items: z
      .array(
        z.object({
          menuProducts: z.array(z.string()),
          quantity: z.number().min(1, "La cantidad debe ser mayor a 0"),
          notes: z.string().optional(),
          // Combo fields (all optional — present only for combo items)
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
          isDiscontinued: z.boolean().optional(),
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
  .refine(
    (data) => {
      // Each item must have either menuProducts (regular) or comboId (combo)
      return data.items.every(
        (item) =>
          (item.menuProducts && item.menuProducts.length > 0) ||
          (item.itemType === "combo" && !!item.comboId)
      )
    },
    {
      message:
        "Cada artículo debe tener productos seleccionados o ser un combo",
      path: ["items"],
    }
  )

type EditOrderFormValues = z.infer<typeof editOrderFormSchema>

interface EditOrderDialogProps {
  orderId: Id<"orders">
  children: React.ReactNode
}

export function EditOrderDialog({ orderId, children }: EditOrderDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<
    Record<number, Id<"menuProducts">[]>
  >({})
  const [productSearch, setProductSearch] = useState<Record<number, string>>({})
  const { activeOrganizationId } = useOrganization()

  // Fetch order data
  const order = useQuery(
    api.private.orders.getOne,
    activeOrganizationId
      ? { id: orderId, organizationId: activeOrganizationId }
      : "skip"
  )
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
  const updateOrder = useMutation(api.private.orders.updateOrder)

  const form = useForm<EditOrderFormValues>({
    resolver: zodResolver(editOrderFormSchema),
    defaultValues: {
      orderType: "delivery",
      deliveryAddress: "",
      paymentMethod: "cash",
      restaurantLocationId: "",
      scheduledDate: undefined,
      scheduledTime: "",
      items: [
        {
          menuProducts: [],
          quantity: 1,
          notes: "",
        },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  })

  const watchOrderType = form.watch("orderType")
  const watchItems = form.watch("items")
  const watchScheduledDate = form.watch("scheduledDate")
  const watchScheduledTime = form.watch("scheduledTime")
  const watchRestaurantLocationId = form.watch("restaurantLocationId")

  const availableCombos = useQuery(
    api.private.combos.getAvailableByLocation,
    activeOrganizationId && watchRestaurantLocationId
      ? {
          organizationId: activeOrganizationId,
          locationId: watchRestaurantLocationId as Id<"restaurantLocations">,
        }
      : "skip"
  )

  // Calculate subtotal for a specific item
  const calculateItemSubtotal = (itemIndex: number) => {
    const item = watchItems[itemIndex]
    if (!item) return 0

    if (item.itemType === "combo") {
      return calculateComboSubtotal({
        comboBasePrice: item.comboBasePrice,
        comboSlotSelections: item.comboSlotSelections,
        quantity: item.quantity,
      })
    }

    if (!menuProducts?.page) return 0

    const itemProducts = item.menuProducts
      .map((productId) => menuProducts.page.find((p) => p._id === productId))
      .filter(Boolean)

    const itemPrice = itemProducts.reduce(
      (sum, product) => sum + (product?.price || 0),
      0
    )
    return itemPrice * item.quantity
  }

  // Initialize form when order loads
  useEffect(() => {
    if (order && menuProducts?.page) {
      const isScheduled = order.status === "programado"
      const availableComboIds = new Set(
        (availableCombos ?? []).map((combo: { _id: string }) => combo._id)
      )

      form.reset({
        orderType: order.orderType,
        deliveryAddress: order.deliveryAddress || "",
        paymentMethod: order.paymentMethod,
        restaurantLocationId: order.restaurantLocationId,
        scheduledDate:
          isScheduled && order.scheduledTime
            ? new Date(order.scheduledTime)
            : undefined,
        scheduledTime:
          isScheduled && order.scheduledTime
            ? format(new Date(order.scheduledTime), "h:mm a")
            : "",
        items: order.items.map((item) => {
          if (item.itemType === "combo") {
            const comboIdStr = item.comboId ? String(item.comboId) : undefined
            const isDiscontinued = comboIdStr
              ? availableCombos
                ? !availableComboIds.has(comboIdStr)
                : false
              : false
            return {
              menuProducts: item.products.map((p) => p._id),
              quantity: item.quantity,
              notes: item.notes || "",
              itemType: "combo" as const,
              comboId: comboIdStr,
              comboName: item.comboName ?? "Combo",
              comboBasePrice: item.comboBasePrice,
              comboSlotSelections: item.products
                .filter(
                  (p): p is typeof p & { comboSlotName: string } =>
                    !!p.comboSlotName
                )
                .map((p) => ({
                  slotId: p.comboSlotId,
                  slotName: p.comboSlotName,
                  menuProductId: String(p._id),
                  productName: p.name,
                  upcharge: p.upcharge ?? 0,
                  quantity: p.quantity ?? 1,
                })),
              isDiscontinued,
            }
          }
          return {
            menuProducts: item.products.map((p) => p._id),
            quantity: item.quantity,
            notes: item.notes || "",
          }
        }),
      })

      // Initialize selected products (only for regular items)
      const initialSelectedProducts: Record<number, Id<"menuProducts">[]> = {}
      order.items.forEach((item, index: number) => {
        if (item.itemType !== "combo") {
          initialSelectedProducts[index] = item.products.map((p) => p._id)
        }
      })
      setSelectedProducts(initialSelectedProducts)
    }
  }, [order, menuProducts, form, availableCombos])

  // Update isDiscontinued flags when combo availability data loads
  useEffect(() => {
    if (!availableCombos) return

    const availableComboIds = new Set(
      availableCombos.map((c: { _id: string }) => c._id)
    )

    const currentItems = form.getValues("items")

    currentItems.forEach((item, index) => {
      if (item.itemType === "combo" && item.comboId) {
        const isDiscontinued = !availableComboIds.has(item.comboId)
        if (item.isDiscontinued !== isDiscontinued) {
          form.setValue(`items.${index}.isDiscontinued`, isDiscontinued)
        }
      }
    })
  }, [availableCombos, form])

  // Combine date and time into timestamp
  const getScheduledTimestamp = () => {
    const scheduledDate = form.getValues("scheduledDate")
    const scheduledTime = form.getValues("scheduledTime")

    if (!scheduledDate || !scheduledTime) return undefined

    const timeParts = scheduledTime.split(":")
    if (timeParts.length !== 2) return undefined

    const hours = Number(timeParts[0])
    const minutes = Number(timeParts[1])

    if (Number.isNaN(hours) || Number.isNaN(minutes)) return undefined

    const combinedDate = new Date(scheduledDate)
    combinedDate.setHours(hours, minutes, 0, 0)

    return combinedDate.getTime()
  }

  // Validate scheduled time
  const validateScheduledTime = (timestamp: number | undefined) => {
    if (!timestamp) return undefined

    const now = Date.now()
    const minAdvanceTime = 30 * 60 * 1000 // 30 minutes minimum
    const maxAdvanceTime = 7 * 24 * 60 * 60 * 1000 // 7 days maximum

    if (timestamp < now + minAdvanceTime) {
      return "La hora programada debe ser al menos 30 minutos en el futuro"
    }

    if (timestamp > now + maxAdvanceTime) {
      return "La hora programada no puede ser más de 7 días en el futuro"
    }

    return undefined
  }

  // Calculate total price
  const calculateTotal = () => {
    return watchItems.reduce((total, _item, index) => {
      return total + calculateItemSubtotal(index)
    }, 0)
  }

  // Validate order items using the same logic as the AI agent
  const validateOrderItems = async (
    items: typeof watchItems,
    restaurantLocationId: string,
    restaurantLocations: Doc<"restaurantLocations">[]
  ) => {
    const errors: string[] = []

    if (!menuProducts?.page) {
      errors.push("No se pudieron cargar los productos del menú")
      return errors
    }

    for (const [itemIndex, item] of items.entries()) {
      const itemNumber = itemIndex + 1

      if (item.itemType === "combo") {
        if (!item.comboId) {
          errors.push(`Ítem ${itemNumber}: Debe seleccionar un combo`)
        }
        continue
      }
      if (!item.menuProducts || item.menuProducts.length === 0) {
        errors.push(`Ítem ${itemNumber}: Debe seleccionar al menos un producto`)
        continue
      }

      // Get all products in this combination
      const products = item.menuProducts
        .map((productId) => menuProducts.page.find((p) => p._id === productId))
        .filter((p): p is NonNullable<typeof p> => p !== undefined)

      // Check if all products exist
      if (products.length !== item.menuProducts.length) {
        errors.push(`Ítem ${itemNumber}: Algunos productos no existen`)
        continue
      }

      const validProducts = products

      // Check availability at location
      const selectedLocation = restaurantLocations.find(
        (loc) => loc._id === restaurantLocationId
      )
      const locationCode = selectedLocation?.code

      if (!locationCode) {
        errors.push(
          `Ítem ${itemNumber}: No se pudo determinar el código de ubicación`
        )
        continue
      }

      const unavailableProducts = validProducts.filter((product) => {
        const availability = product.availability[locationCode] ?? false
        return !availability
      })

      if (unavailableProducts.length > 0) {
        const unavailableNames = unavailableProducts
          .map((p) => p.name)
          .join(", ")
        errors.push(
          `Ítem ${itemNumber}: Productos no disponibles en esta ubicación: ${unavailableNames}`
        )
        continue
      }

      // Validate combination logic
      const nonStandaloneProducts = validProducts.filter((p) => !p.standAlone)

      if (nonStandaloneProducts.length > 0) {
        const standaloneProducts = validProducts.filter((p) => p.standAlone)

        if (standaloneProducts.length === 0) {
          errors.push(
            `Ítem ${itemNumber}: Productos no independientes necesitan combinarse con al menos un producto independiente`
          )
          continue
        }

        // Check if non-standalone products can be combined with available standalone products
        for (const nonStandalone of nonStandaloneProducts) {
          const canCombine = standaloneProducts.some((standalone) => {
            const standaloneCanCombine =
              standalone.combinableWith?.some(
                (combo) =>
                  combo.menuProductCategoryId ===
                    nonStandalone.menuProductCategoryId &&
                  (!combo.sizeId ||
                    !nonStandalone.sizeId ||
                    combo.sizeId === nonStandalone.sizeId)
              ) ?? false

            const nonStandaloneCanCombine =
              nonStandalone.combinableWith?.some(
                (combo) =>
                  combo.menuProductCategoryId ===
                    standalone.menuProductCategoryId &&
                  (!combo.sizeId ||
                    !standalone.sizeId ||
                    combo.sizeId === standalone.sizeId)
              ) ?? false

            return standaloneCanCombine || nonStandaloneCanCombine
          })

          if (!canCombine) {
            errors.push(
              `Ítem ${itemNumber}: El producto "${nonStandalone.name}" no se puede combinar con los productos independientes disponibles`
            )
            break
          }
        }

        if (errors[errors.length - 1]?.includes("no se puede combinar"))
          continue
      }

      // Check half pizza combinations
      const halfCombinableProducts = validProducts.filter(
        (p) => p.combinableHalf
      )

      if (halfCombinableProducts.length > 0) {
        const nonHalfProducts = validProducts.filter((p) => !p.combinableHalf)

        // If there are non-half products, they must be combinable with the standalone products
        if (nonHalfProducts.length > 0) {
          const standaloneProductsInCombo = validProducts.filter(
            (p) => p.standAlone
          )

          for (const nonHalfProduct of nonHalfProducts) {
            const canCombineWithStandalone = standaloneProductsInCombo.some(
              (standalone) => {
                const standaloneCanCombine =
                  standalone.combinableWith?.some(
                    (combo) =>
                      combo.menuProductCategoryId ===
                        nonHalfProduct.menuProductCategoryId &&
                      (!combo.sizeId ||
                        !nonHalfProduct.sizeId ||
                        combo.sizeId === nonHalfProduct.sizeId)
                  ) ?? false

                const nonHalfCanCombine =
                  nonHalfProduct.combinableWith?.some(
                    (combo) =>
                      combo.menuProductCategoryId ===
                        standalone.menuProductCategoryId &&
                      (!combo.sizeId ||
                        !standalone.sizeId ||
                        combo.sizeId === standalone.sizeId)
                  ) ?? false

                return standaloneCanCombine || nonHalfCanCombine
              }
            )

            if (!canCombineWithStandalone) {
              errors.push(
                `Ítem ${itemNumber}: El producto "${nonHalfProduct.name}" no se puede combinar con los productos disponibles`
              )
              break
            }
          }

          if (errors[errors.length - 1]?.includes("no se puede combinar"))
            continue
        }

        // Validate the half pizza combinations themselves
        const halfGroups: Record<string, typeof validProducts> = {}

        for (const product of halfCombinableProducts) {
          const key = `${product.menuProductCategoryId}-${product.sizeId || "no-size"}`
          if (!halfGroups[key]) {
            halfGroups[key] = []
          }
          halfGroups[key].push(product)
        }

        // Each group must have exactly 2 products
        for (const [key, products] of Object.entries(halfGroups)) {
          if (products.length !== 2) {
            errors.push(
              `Ítem ${itemNumber}: Las combinaciones de media pizza deben tener exactamente 2 productos de la misma categoría y tamaño`
            )
            break
          }
        }

        if (errors[errors.length - 1]?.includes("media pizza")) continue
      }
    }

    return errors
  }

  const getFilteredProductsForItem = (itemIndex: number) => {
    const searchTerm = productSearch[itemIndex]?.toLowerCase() || ""

    if (!menuProducts?.page) return {}

    return menuProducts.page
      .filter(
        (product) =>
          !searchTerm ||
          product.name.toLowerCase().includes(searchTerm) ||
          product.description.toLowerCase().includes(searchTerm) ||
          product.categoryName.toLowerCase().includes(searchTerm)
      )
      .reduce(
        (acc, product) => {
          const categoryName = product.categoryName
          if (!acc[categoryName]) {
            acc[categoryName] = []
          }
          acc[categoryName].push(product)
          return acc
        },
        {} as Record<string, typeof menuProducts.page>
      )
  }

  const updateItemProducts = (
    itemIndex: number,
    products: Id<"menuProducts">[]
  ) => {
    setSelectedProducts((prev) => ({
      ...prev,
      [itemIndex]: products,
    }))
    form.setValue(`items.${itemIndex}.menuProducts`, products)
  }

  const addItem = () => {
    append({
      menuProducts: [],
      quantity: 1,
      notes: "",
    })
  }

  const removeItem = (index: number) => {
    if (fields.length > 1) {
      remove(index)
      const newSelectedProducts = { ...selectedProducts }
      const newProductSearch = { ...productSearch }
      delete newSelectedProducts[index]
      delete newProductSearch[index]
      setSelectedProducts(newSelectedProducts)
      setProductSearch(newProductSearch)
    }
  }

  const handleComboChange = useCallback(
    (index: number, data: ComboItemData | null) => {
      if (!data) {
        // Keep item as combo but clear payload to avoid stale combo data
        // while the picker is in an incomplete state.
        form.setValue(`items.${index}.comboId`, "")
        form.setValue(`items.${index}.comboName`, "")
        form.setValue(`items.${index}.comboBasePrice`, 0)
        form.setValue(`items.${index}.comboSlotSelections`, [])
        form.setValue(`items.${index}.menuProducts`, [])
        return
      }
      form.setValue(`items.${index}.comboId`, data.comboId)
      form.setValue(`items.${index}.comboName`, data.comboName)
      form.setValue(`items.${index}.comboBasePrice`, data.comboBasePrice)
      form.setValue(
        `items.${index}.comboSlotSelections`,
        data.comboSlotSelections
      )
      form.setValue(`items.${index}.menuProducts`, data.menuProducts)
      form.setValue(`items.${index}.quantity`, data.quantity)
      form.setValue(`items.${index}.notes`, data.notes ?? "")
    },
    [form]
  )

  const handleAddCombo = () => {
    append({
      menuProducts: [],
      quantity: 1,
      notes: "",
      itemType: "combo" as const,
      comboId: "",
      comboName: "",
      comboBasePrice: 0,
      comboSlotSelections: [],
    })
  }

  const onSubmit = async (values: EditOrderFormValues) => {
    if (!order) return

    try {
      // Validate order items before submission
      const validationErrors = await validateOrderItems(
        values.items,
        values.restaurantLocationId,
        restaurantLocations || []
      )
      if (validationErrors.length > 0) {
        const errorMessage = `Errores de validación:\n\n${validationErrors.map((error, index) => `${index + 1}. ${error}`).join("\n")}`
        toast.error(errorMessage, {
          duration: 8000, // Show longer for multiple errors
        })
        return
      }

      const scheduledTimestamp = getScheduledTimestamp()
      const scheduledTimeError = validateScheduledTime(scheduledTimestamp)

      if (scheduledTimestamp && scheduledTimeError) {
        toast.error(scheduledTimeError)
        return
      }

      // Prepare order items for backend
      const orderItems = values.items.map((item) => {
        if (item.itemType === "combo") {
          return {
            menuProducts: (item.menuProducts || []) as Id<"menuProducts">[],
            quantity: item.quantity,
            notes: item.notes || "",
            itemType: "combo" as const,
            comboId: item.comboId,
            comboName: item.comboName,
            comboBasePrice: item.comboBasePrice,
            comboSlotSelections: item.comboSlotSelections?.map((sel) => ({
              slotId: sel.slotId,
              slotName: sel.slotName,
              menuProductId: sel.menuProductId as Id<"menuProducts">,
              productName: sel.productName,
              upcharge: sel.upcharge,
              quantity: sel.quantity,
            })),
          }
        }
        return {
          menuProducts: item.menuProducts as Id<"menuProducts">[],
          quantity: item.quantity,
          notes: item.notes || "",
        }
      })

      const orderTotal = calculateTotal()

      const updateData = {
        orderType: values.orderType,
        deliveryAddress:
          values.orderType === "delivery" ? values.deliveryAddress : undefined,
        paymentMethod: values.paymentMethod,
        restaurantLocationId:
          values.restaurantLocationId as Id<"restaurantLocations">,
        scheduledTime: scheduledTimestamp,
        items: orderItems,
        total: orderTotal,
      }

      if (!activeOrganizationId) return

      const result = await updateOrder({
        organizationId: activeOrganizationId,
        orderId: orderId,
        ...updateData,
      })

      toast.success(result.message || "Pedido actualizado exitosamente")
      setOpen(false)
      form.reset()
      setSelectedProducts({})
      setProductSearch({})
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  if (!order || !menuProducts || !restaurantLocations) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-primary border-b-2"></div>
              <p>Cargando...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  const isScheduled = order.status === "programado"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto sm:max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            {isScheduled ? "Editar Pedido Programado" : "Editar Pedido"}
          </DialogTitle>
          <DialogDescription>
            Modifica los detalles del pedido #{order.orderNumber}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-6">
              {/* Order Type & Location */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="orderType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de pedido</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="delivery">Domicilio</SelectItem>
                          <SelectItem value="pickup">
                            Recoger en tienda
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="restaurantLocationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ubicación del restaurante</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar ubicación" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {restaurantLocations.map(
                            (location: Doc<"restaurantLocations">) => (
                              <SelectItem
                                key={location._id}
                                value={location._id}
                              >
                                {location.name}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Scheduled Date & Time - Only show for scheduled orders */}
              {isScheduled && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="scheduledDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fecha programada</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value
                                  ? format(field.value, "PPP", { locale: es })
                                  : "Seleccionar fecha"}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => {
                                const now = new Date()
                                const today = startOfDay(now)
                                const maxDate = addDays(today, 7)
                                const dateToCheck = startOfDay(date)
                                return (
                                  dateToCheck < now || dateToCheck > maxDate
                                )
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="scheduledTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hora programada</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Delivery Address - Only show for delivery orders */}
              {watchOrderType === "delivery" && (
                <FormField
                  control={form.control}
                  name="deliveryAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dirección de entrega</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Ingresa la dirección completa de entrega"
                          rows={2}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Payment Method */}
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Método de pago</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar método de pago" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="cash">Efectivo</SelectItem>
                        <SelectItem value="card">Datafono</SelectItem>
                        <SelectItem value="payment_link">
                          Pago por Link de Pago
                        </SelectItem>
                        <SelectItem value="bank_transfer">
                          Transferencia a Cuenta Bancaria
                        </SelectItem>
                        <SelectItem value="corporate_credit">
                          Crédito Corporativo
                        </SelectItem>
                        <SelectItem value="gift_voucher">
                          Bono de Regalo
                        </SelectItem>
                        <SelectItem value="sodexo_voucher">Sodexo</SelectItem>
                        <SelectItem value="dynamic_payment_link">
                          Enlace de pago dinámico
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Order Items */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="font-medium text-base">
                    Productos del pedido
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddCombo}
                      disabled={!activeOrganizationId}
                    >
                      <Layers className="mr-2 h-4 w-4" />
                      Agregar Combo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addItem}
                      disabled={!menuProducts || menuProducts.page.length === 0}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Agregar producto
                    </Button>
                  </div>
                </div>

                <div className="space-y-6">
                  {fields.map((field, index) => {
                    const item = watchItems[index]
                    const isComboItem = item?.itemType === "combo"

                    if (isComboItem && activeOrganizationId) {
                      return (
                        <ComboSlotPicker
                          key={field.id}
                          organizationId={activeOrganizationId}
                          restaurantLocationId={watchRestaurantLocationId}
                          initialComboId={item.comboId}
                          initialSelections={
                            item.comboSlotSelections as
                              | ComboSlotSelection[]
                              | undefined
                          }
                          initialQuantity={item.quantity}
                          initialNotes={item.notes}
                          isDiscontinued={item.isDiscontinued}
                          onChange={(data) => handleComboChange(index, data)}
                          onRemove={
                            fields.length > 1
                              ? () => removeItem(index)
                              : undefined
                          }
                        />
                      )
                    }

                    return (
                      <Card key={field.id} className="p-6">
                        <div className="space-y-4">
                          {/* Product Search */}
                          <div className="relative">
                            <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 transform text-muted-foreground" />
                            <Input
                              type="text"
                              placeholder="Buscar productos por nombre, descripción o categoría..."
                              value={productSearch[index] || ""}
                              onChange={(e) =>
                                setProductSearch((prev) => ({
                                  ...prev,
                                  [index]: e.target.value,
                                }))
                              }
                              className="pl-10"
                            />
                          </div>

                          {/* Search Results */}
                          <div className="max-h-64 space-y-2 overflow-y-auto">
                            {productSearch[index] &&
                            Object.keys(getFilteredProductsForItem(index))
                              .length === 0 ? (
                              <div className="py-4 text-center text-muted-foreground">
                                <Package className="mx-auto mb-1 h-6 w-6 opacity-50" />
                                <p className="text-xs">
                                  No se encontraron productos
                                </p>
                                <p className="text-xs">
                                  Intenta con otros términos
                                </p>
                              </div>
                            ) : (
                              productSearch[index] &&
                              Object.entries(
                                getFilteredProductsForItem(index)
                              ).map(([categoryName, products]) => (
                                <div key={categoryName}>
                                  <h5 className="mb-1 px-1 font-medium text-muted-foreground text-xs">
                                    {categoryName}
                                  </h5>
                                  <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
                                    {products.map((product) => {
                                      const isSelected = selectedProducts[
                                        index
                                      ]?.includes(product._id)
                                      return (
                                        <button
                                          type="button"
                                          key={product._id}
                                          className={cn(
                                            "flex cursor-pointer items-center justify-between rounded-lg border p-2 transition-colors hover:bg-muted/50",
                                            isSelected &&
                                              "border-primary bg-primary/5"
                                          )}
                                          onClick={() => {
                                            const currentProducts =
                                              selectedProducts[index] || []
                                            const newProducts = isSelected
                                              ? currentProducts.filter(
                                                  (id) => id !== product._id
                                                )
                                              : [
                                                  ...currentProducts,
                                                  product._id,
                                                ]
                                            updateItemProducts(
                                              index,
                                              newProducts
                                            )
                                          }}
                                        >
                                          <div className="min-w-0 flex-1">
                                            <p className="truncate font-medium text-sm">
                                              {product.name}
                                            </p>
                                            <p className="truncate text-muted-foreground text-xs">
                                              {product.description}
                                            </p>
                                            <p className="font-medium text-primary text-sm">
                                              $
                                              {product.price.toLocaleString(
                                                "es-CO"
                                              )}
                                            </p>
                                          </div>
                                          {isSelected && (
                                            <div className="ml-2">
                                              <Badge
                                                variant="secondary"
                                                className="text-xs"
                                              >
                                                ✓
                                              </Badge>
                                            </div>
                                          )}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Selected Products Summary */}
                          {selectedProducts[index] &&
                            selectedProducts[index].length > 0 && (
                              <div className="space-y-2">
                                <Label className="font-medium text-sm">
                                  Productos seleccionados:
                                </Label>
                                <div className="flex flex-wrap gap-2">
                                  {selectedProducts[index].map((productId) => {
                                    const product = menuProducts.page.find(
                                      (p) => p._id === productId
                                    )
                                    return product ? (
                                      <Badge
                                        key={productId}
                                        variant="secondary"
                                        className="cursor-pointer text-xs transition-colors hover:bg-destructive hover:text-destructive-foreground"
                                        onClick={() => {
                                          const currentProducts =
                                            selectedProducts[index] || []
                                          const newProducts =
                                            currentProducts.filter(
                                              (id) => id !== productId
                                            )
                                          updateItemProducts(index, newProducts)
                                        }}
                                      >
                                        {product.name} - $
                                        {product.price.toLocaleString("es-CO")}
                                        <span className="ml-1 text-xs opacity-70">
                                          ×
                                        </span>
                                      </Badge>
                                    ) : null
                                  })}
                                </div>
                              </div>
                            )}

                          {/* Quantity and Notes */}
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <FormField
                              control={form.control}
                              name={`items.${index}.quantity`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Cantidad</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min="1"
                                      {...field}
                                      onChange={(e) =>
                                        field.onChange(
                                          Number(e.target.value) || 1
                                        )
                                      }
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`items.${index}.notes`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Notas</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      placeholder="Notas especiales (opcional)"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* Item Total and Remove Button */}
                          <div className="flex items-center justify-between border-t pt-4">
                            <div className="text-muted-foreground text-sm">
                              Subtotal: $
                              {calculateItemSubtotal(index).toLocaleString(
                                "es-CO"
                              )}
                            </div>
                            {fields.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeItem(index)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Eliminar
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>

              {/* Order Total */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-lg">Total del pedido:</span>
                  <span className="font-bold text-2xl text-primary">
                    ${calculateTotal().toLocaleString("es-CO")}
                  </span>
                </div>
              </Card>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">Actualizar Pedido</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
