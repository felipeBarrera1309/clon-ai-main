"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@workspace/backend/_generated/api"
import type { Doc, Id } from "@workspace/backend/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form"
import { Input } from "@workspace/ui/components/input"
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
import { Check, ChevronsUpDown, ImageIcon, Plus, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"

const menuProductBuilderFormSchema = z
  .object({
    name: z.string().min(1, "El nombre es obligatorio"),
    description: z.string().min(1, "La descripción es obligatoria"),
    price: z
      .number()
      .min(0, "El precio debe ser mayor o igual a 0")
      .int("El precio debe ser un número entero de pesos"),
    menuProductCategoryId: z.string().min(1, "La categoría es obligatoria"),
    menuProductSubcategoryId: z.string().optional(),
    standAlone: z.boolean(),
    combinableWith: z
      .array(
        z.object({
          menuProductCategoryId: z.string().optional(),
          sizeId: z.string().optional(),
          menuProductId: z.string().optional(),
        })
      )
      .optional(),
    sizeId: z.string().optional(),
    combinableHalf: z.boolean(),
    instructions: z.string().max(500, "Máximo 500 caracteres").optional(),
    minimumQuantity: z.number().int().min(1).optional(),
    maximumQuantity: z.number().int().min(1).optional(),
    externalCode: z.string().optional(),
    imageUrl: z
      .string()
      .url("Debe ser una URL válida")
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (data) => {
      if (data.minimumQuantity && data.maximumQuantity) {
        return data.minimumQuantity <= data.maximumQuantity
      }
      return true
    },
    {
      message: "La cantidad mínima no puede ser mayor a la máxima",
      path: ["minimumQuantity"],
    }
  )

type MenuProductBuilderFormData = z.infer<typeof menuProductBuilderFormSchema>

interface MenuProductBuilderFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Omit<Doc<"menuProducts">, "nameNormalized"> | null
  mode: "create" | "edit"
}

interface CombinableWithRowProps {
  item: {
    menuProductCategoryId?: string
    sizeId?: string
    menuProductId?: string
  }
  index: number
  isProductType: boolean
  selectedProduct?: { _id: string; name: string } | null
  selectedCategory?: { _id: string; name: string } | null
  categories: Array<{ _id: string; name: string }>
  sizes: Array<{ _id: string; name: string }>
  availableProducts: Array<{
    _id: string
    name: string
    menuProductCategoryId: string
  }>
  onTypeChange: (type: "category" | "product") => void
  onCategoryChange: (value: string) => void
  onSizeChange: (value: string) => void
  onProductChange: (value: string) => void
  onRemove: () => void
}

const CombinableWithRow = ({
  item,
  isProductType,
  selectedProduct,
  categories,
  sizes,
  availableProducts,
  onTypeChange,
  onCategoryChange,
  onSizeChange,
  onProductChange,
  onRemove,
}: CombinableWithRowProps) => {
  const [open, setOpen] = useState(false)

  const categoriesMap = new Map(categories.map((c) => [c._id, c.name]))

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div className="w-32">
        <FormLabel className="text-sm">Tipo</FormLabel>
        <Select
          value={isProductType ? "product" : "category"}
          onValueChange={(v) => onTypeChange(v as "category" | "product")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="category">Por Categoría</SelectItem>
            <SelectItem value="product">Por Producto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isProductType ? (
        <div className="min-w-[200px] flex-1">
          <FormLabel className="text-sm">Producto</FormLabel>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between font-normal"
              >
                {selectedProduct?.name || "Buscar producto..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar producto..." />
                <CommandList>
                  <CommandEmpty>No se encontraron productos</CommandEmpty>
                  <CommandGroup>
                    {availableProducts.map((p) => (
                      <CommandItem
                        key={p._id}
                        value={p.name}
                        onSelect={() => {
                          onProductChange(p._id)
                          setOpen(false)
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${
                            item.menuProductId === p._id
                              ? "opacity-100"
                              : "opacity-0"
                          }`}
                        />
                        <span className="flex-1">{p.name}</span>
                        <span className="text-muted-foreground text-xs">
                          (
                          {categoriesMap.get(p.menuProductCategoryId) ||
                            "Sin categoría"}
                          )
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      ) : (
        <>
          <div className="min-w-[150px] flex-1">
            <FormLabel className="text-sm">Categoría</FormLabel>
            <Select
              value={item.menuProductCategoryId || ""}
              onValueChange={onCategoryChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona categoría" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category._id} value={category._id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[120px] flex-1">
            <FormLabel className="text-sm">Tamaño (Opcional)</FormLabel>
            <Select value={item.sizeId || ""} onValueChange={onSizeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona tamaño" />
              </SelectTrigger>
              <SelectContent>
                {sizes.map((size) => (
                  <SelectItem key={size._id} value={size._id}>
                    {size.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <Button type="button" variant="outline" size="sm" onClick={onRemove}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

export const MenuProductBuilderForm = ({
  open,
  onOpenChange,
  product,
  mode,
}: MenuProductBuilderFormProps) => {
  const { activeOrganizationId } = useOrganization()

  // Get categories, subcategories, and sizes for dropdowns
  const categories = useQuery(
    api.private.menuProductCategories.list,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          paginationOpts: { numItems: 100, cursor: null },
        }
      : "skip"
  )
  const subcategories = useQuery(
    api.private.menuProductSubcategories.list,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          paginationOpts: { numItems: 100, cursor: null },
        }
      : "skip"
  )
  const sizes = useQuery(
    api.private.sizes.list,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          paginationOpts: { numItems: 100, cursor: null },
        }
      : "skip"
  )

  // Get all products for combinableWith product selection
  const allProducts = useQuery(
    api.private.menuProducts.list,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          paginationOpts: { numItems: 200, cursor: null },
        }
      : "skip"
  )

  // Filter out the current product being edited from the product list
  const availableProducts =
    allProducts?.page?.filter((p) => p._id !== product?._id) || []

  const createProduct = useMutation(api.private.menuProducts.create)
  const updateProduct = useMutation(api.private.menuProducts.updateProduct)

  const form = useForm<MenuProductBuilderFormData>({
    resolver: zodResolver(menuProductBuilderFormSchema),
    defaultValues: {
      name: product?.name || "",
      description: product?.description || "",
      price: product?.price || 0,
      menuProductCategoryId: product?.menuProductCategoryId || "",
      menuProductSubcategoryId: product?.menuProductSubcategoryId || "none",
      standAlone: product?.standAlone ?? true,
      combinableWith: product?.combinableWith?.length
        ? product.combinableWith.map((item) => ({
            menuProductCategoryId: item.menuProductCategoryId || "",
            sizeId: item.sizeId || "",
            menuProductId: item.menuProductId || "",
          }))
        : [],
      sizeId: product?.sizeId || "",
      combinableHalf: product?.combinableHalf ?? false,
      instructions: product?.instructions || "",
      minimumQuantity: product?.minimumQuantity,
      maximumQuantity: product?.maximumQuantity,
      externalCode: product?.externalCode || "",
      imageUrl: product?.imageUrl || "",
    },
  })

  // Reset form values when product changes (for edit mode)
  useEffect(() => {
    if (product) {
      form.reset({
        name: product.name || "",
        description: product.description || "",
        price: product.price || 0,
        menuProductCategoryId: product.menuProductCategoryId || "",
        menuProductSubcategoryId: product.menuProductSubcategoryId || "none",
        standAlone: product.standAlone ?? true,
        combinableWith: product.combinableWith?.length
          ? product.combinableWith.map((item) => ({
              menuProductCategoryId: item.menuProductCategoryId || "",
              sizeId: item.sizeId || "",
              menuProductId: item.menuProductId || "",
            }))
          : [],
        sizeId: product.sizeId || "",
        combinableHalf: product.combinableHalf ?? false,
        instructions: product.instructions || "",
        minimumQuantity: product.minimumQuantity,
        maximumQuantity: product.maximumQuantity,
        externalCode: product.externalCode || "",
        imageUrl: product.imageUrl || "",
      })
    } else {
      // Reset to empty values for create mode
      form.reset({
        name: "",
        description: "",
        price: 0,
        menuProductCategoryId: "",
        menuProductSubcategoryId: "none",
        standAlone: true,
        combinableWith: [],
        sizeId: "",
        combinableHalf: false,
        instructions: "",
        minimumQuantity: undefined,
        maximumQuantity: undefined,
        externalCode: "",
        imageUrl: "",
      })
    }
  }, [product, form])

  const onSubmit = async (data: MenuProductBuilderFormData) => {
    if (!activeOrganizationId) return

    try {
      const productData = {
        organizationId: activeOrganizationId,
        name: data.name,
        description: data.description,
        price: data.price,
        menuProductCategoryId:
          data.menuProductCategoryId as Id<"menuProductCategories">,
        menuProductSubcategoryId:
          data.menuProductSubcategoryId &&
          data.menuProductSubcategoryId !== "none"
            ? (data.menuProductSubcategoryId as Id<"menuProductSubcategories">)
            : undefined,
        standAlone: data.standAlone,
        combinableWith: data.combinableWith?.length
          ? (data.combinableWith
              .filter(
                (item) =>
                  item.menuProductCategoryId ||
                  (item.menuProductId && item.menuProductId !== "__pending__")
              )
              .map((item) => {
                if (
                  item.menuProductId &&
                  item.menuProductId !== "__pending__"
                ) {
                  const selectedProduct = availableProducts.find(
                    (p) => p._id === item.menuProductId
                  )
                  // Skip if referenced product no longer exists
                  if (!selectedProduct) {
                    return null
                  }
                  return {
                    menuProductCategoryId:
                      selectedProduct.menuProductCategoryId as Id<"menuProductCategories">,
                    sizeId: item.sizeId
                      ? (item.sizeId as Id<"sizes">)
                      : undefined,
                    menuProductId: item.menuProductId as Id<"menuProducts">,
                  }
                }
                return {
                  menuProductCategoryId:
                    item.menuProductCategoryId as Id<"menuProductCategories">,
                  sizeId: item.sizeId
                    ? (item.sizeId as Id<"sizes">)
                    : undefined,
                  menuProductId: undefined,
                }
              })
              .filter(Boolean) as Array<{
              menuProductCategoryId: Id<"menuProductCategories">
              sizeId?: Id<"sizes">
              menuProductId?: Id<"menuProducts">
            }>)
          : undefined,
        sizeId: data.sizeId ? (data.sizeId as Id<"sizes">) : undefined,
        combinableHalf: data.combinableHalf,
        minimumQuantity: data.minimumQuantity,
        maximumQuantity: data.maximumQuantity,
        externalCode: data.externalCode || undefined,
        imageUrl: data.imageUrl || undefined,
        instructions: data.instructions || undefined,
      }

      if (mode === "edit" && product) {
        await updateProduct({
          id: product._id,
          ...productData,
        })
        toast.success("Producto actualizado exitosamente")
      } else {
        await createProduct(productData)
        toast.success("Producto creado exitosamente")
      }
      onOpenChange(false)
      form.reset()
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Editar Producto" : "Añadir Nuevo Producto"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Producto</FormLabel>
                    <FormControl>
                      <Input placeholder="Pizza Margarita" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        placeholder="52000"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            Number.parseInt(e.target.value, 10) || 0
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                    {field.value === 0 && (
                      <span className="text-xs">
                        El producto quedará sin precio asignado
                      </span>
                    )}
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="menuProductCategoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value)
                      // Clear subcategory when category changes
                      form.setValue("menuProductSubcategoryId", "none")
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una categoría" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories?.page?.map((category) => (
                        <SelectItem key={category._id} value={category._id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="menuProductSubcategoryId"
              render={({ field }) => {
                const selectedCategoryId = form.watch("menuProductCategoryId")
                const availableSubcategories =
                  subcategories?.page?.filter(
                    (subcategory) =>
                      subcategory.menuProductCategoryId === selectedCategoryId
                  ) || []

                return (
                  <FormItem>
                    <FormLabel>Subcategoría (Opcional)</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={
                        !selectedCategoryId ||
                        availableSubcategories.length === 0
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !selectedCategoryId
                                ? "Primero selecciona una categoría"
                                : availableSubcategories.length === 0
                                  ? "No hay subcategorías disponibles"
                                  : "Selecciona una subcategoría"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Sin subcategoría</SelectItem>
                        {availableSubcategories.map((subcategory) => (
                          <SelectItem
                            key={subcategory._id}
                            value={subcategory._id}
                          >
                            {subcategory.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )
              }}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Deliciosa pizza con tomate, mozzarella y albahaca fresca"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instrucciones para la IA</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ej: Siempre sugerir bebida. Alertar sobre ingrediente picante..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <div className="flex justify-between">
                    <FormDescription>
                      La IA usará estas instrucciones como guía interna al
                      hablar del producto.
                    </FormDescription>
                    <span
                      className={cn(
                        "text-sm",
                        (field.value?.length || 0) > 500 && "text-destructive"
                      )}
                    >
                      {field.value?.length || 0}/500
                    </span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="externalCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código Externo (Opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="SKU-001, PROD-123" {...field} />
                  </FormControl>
                  <p className="text-muted-foreground text-sm">
                    Código de identificación para integración con sistemas
                    externos
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => {
                const imageUrl = field.value
                const isValidUrl =
                  imageUrl &&
                  (imageUrl.startsWith("https://") ||
                    imageUrl.startsWith("http://"))

                return (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      URL de Imagen (Opcional)
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://ejemplo.com/imagen-producto.jpg"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-sm">
                      URL pública de la imagen del producto. Se mostrará cuando
                      el cliente la solicite por WhatsApp.
                    </p>
                    {isValidUrl && (
                      <div className="mt-2 overflow-hidden rounded-lg border">
                        <img
                          src={imageUrl}
                          alt="Vista previa del producto"
                          className="h-32 w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none"
                          }}
                        />
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )
              }}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="sizeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tamaño (Opcional)</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un tamaño" />
                      </SelectTrigger>
                      <SelectContent>
                        {sizes?.page?.map((size) => (
                          <SelectItem key={size._id} value={size._id}>
                            {size.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-2">
                <FormField
                  control={form.control}
                  name="minimumQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cantidad Mínima</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="1"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value
                                ? Number.parseInt(e.target.value, 10)
                                : undefined
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
                  name="maximumQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cantidad Máxima</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="10"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value
                                ? Number.parseInt(e.target.value, 10)
                                : undefined
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4">
              <FormField
                control={form.control}
                name="standAlone"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Producto Independiente</FormLabel>
                      <p className="text-muted-foreground text-sm">
                        Este producto se puede ordenar por sí solo
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="combinableHalf"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Combinable por Mitades</FormLabel>
                      <p className="text-muted-foreground text-sm">
                        Este producto se puede combinar con otros por mitades
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <FormLabel>Combinaciones (Opcional)</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentValue =
                        form.getValues("combinableWith") || []
                      form.setValue("combinableWith", [
                        ...currentValue,
                        {
                          menuProductCategoryId: "",
                          sizeId: "",
                          menuProductId: "",
                        },
                      ])
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar Combinación
                  </Button>
                </div>

                <FormField
                  control={form.control}
                  name="combinableWith"
                  render={({ field }) => (
                    <div className="space-y-3">
                      {(field.value || []).map((item, index) => {
                        const isProductType = Boolean(item.menuProductId)
                        const selectedProduct = availableProducts.find(
                          (p) => p._id === item.menuProductId
                        )
                        const selectedCategory = categories?.page?.find(
                          (c) => c._id === item.menuProductCategoryId
                        )

                        return (
                          <CombinableWithRow
                            key={index}
                            item={item}
                            index={index}
                            isProductType={isProductType}
                            selectedProduct={selectedProduct}
                            selectedCategory={selectedCategory}
                            categories={categories?.page || []}
                            sizes={sizes?.page || []}
                            availableProducts={availableProducts}
                            onTypeChange={(type) => {
                              const currentValue = field.value || []
                              const newValue = [...currentValue]
                              if (type === "product") {
                                // Use placeholder to indicate product type selection pending
                                newValue[index] = {
                                  menuProductCategoryId: "",
                                  sizeId: "",
                                  menuProductId: "__pending__",
                                }
                              } else {
                                newValue[index] = {
                                  menuProductCategoryId: "",
                                  sizeId: "",
                                  menuProductId: "",
                                }
                              }
                              field.onChange(newValue)
                            }}
                            onCategoryChange={(value) => {
                              const currentValue = field.value || []
                              const newValue = [...currentValue]
                              newValue[index] = {
                                menuProductCategoryId: value,
                                sizeId: newValue[index]?.sizeId || "",
                                menuProductId: "",
                              }
                              field.onChange(newValue)
                            }}
                            onSizeChange={(value) => {
                              const currentValue = field.value || []
                              const newValue = [...currentValue]
                              newValue[index] = {
                                menuProductCategoryId:
                                  newValue[index]?.menuProductCategoryId || "",
                                sizeId: value,
                                menuProductId: "",
                              }
                              field.onChange(newValue)
                            }}
                            onProductChange={(value) => {
                              const currentValue = field.value || []
                              const newValue = [...currentValue]
                              newValue[index] = {
                                menuProductCategoryId: "",
                                sizeId: "",
                                menuProductId: value,
                              }
                              field.onChange(newValue)
                            }}
                            onRemove={() => {
                              const newValue = (field.value || []).filter(
                                (_, i) => i !== index
                              )
                              field.onChange(newValue)
                            }}
                          />
                        )
                      })}
                      {(!field.value || field.value.length === 0) && (
                        <p className="rounded-lg border border-dashed p-3 text-center text-muted-foreground text-sm">
                          No hay combinaciones. Haz clic en "Agregar
                          Combinación" para añadir una.
                        </p>
                      )}
                    </div>
                  )}
                />
                <p className="text-muted-foreground text-sm">
                  Define qué categorías o productos específicos se pueden
                  combinar con este producto
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit">
                {mode === "edit" ? "Actualizar Producto" : "Crear Producto"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
