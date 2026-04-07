"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card"
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
  FormField,
  FormItem,
  FormLabel,
} from "@workspace/ui/components/form"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"
import { useMutation, useQuery } from "convex/react"
import { Check, ChevronsUpDown, Layers, Plus, Trash2, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { Control } from "react-hook-form"
import { useFieldArray, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"

// ─── Schemas ────────────────────────────────────────────────────────────────

const comboSlotOptionSchema = z.object({
  menuProductId: z.string().min(1, "Selecciona un producto"),
  upcharge: z.number().min(0, "El recargo no puede ser negativo"),
  isDefault: z.boolean().optional(),
  sortOrder: z.number(),
})

const comboSlotSchema = z
  .object({
    name: z.string().min(1, "El nombre del slot es obligatorio"),
    minSelections: z.number().int().min(0),
    maxSelections: z.number().int().min(1),
    sortOrder: z.number(),
    options: z.array(comboSlotOptionSchema).min(1, "Mínimo 1 opción"),
  })
  .refine((slot) => slot.minSelections <= slot.maxSelections, {
    message: "Mínimo no puede ser mayor al máximo",
    path: ["maxSelections"],
  })

export const comboFormSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  description: z.string(),
  basePrice: z.number().min(0).int(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  isActive: z.boolean(),
  slots: z.array(comboSlotSchema).min(1, "Debe tener al menos 1 slot"),
})

export type ComboFormData = z.infer<typeof comboFormSchema>

// ─── Selector de Producto (corregido: truncado + precio + búsqueda parcial) ─

interface Product {
  _id: string
  name: string
  price: number
  categoryName?: string
}

interface ProductSelectorProps {
  value: string
  onSelect: (id: string) => void
  products: Product[]
  disabled?: boolean
}

export const ProductSelector = ({
  value,
  onSelect,
  products,
  disabled,
}: ProductSelectorProps) => {
  const [open, setOpen] = useState(false)
  const selectedProduct = products.find((p) => p._id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="h-9 w-full justify-between gap-2 px-3 font-normal"
          disabled={disabled}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className="flex-1 truncate text-left"
              title={selectedProduct?.name || "Seleccionar producto"}
            >
              {selectedProduct
                ? selectedProduct.name
                : "Seleccionar producto..."}
            </span>

            {selectedProduct && (
              <Badge
                variant="secondary"
                className="h-5 shrink-0 whitespace-nowrap px-1.5 font-mono text-[10px]"
              >
                ${selectedProduct.price.toLocaleString()}
              </Badge>
            )}
          </div>

          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="z-[100] w-[360px] p-0"
        align="start"
        onWheel={(e) => e.stopPropagation()}
      >
        <Command className="max-h-[320px]">
          {/* Con esto puedes buscar por parte del nombre */}
          <CommandInput placeholder="Buscar producto..." />
          <CommandList className="overflow-y-auto">
            <CommandEmpty>No hay resultados</CommandEmpty>

            <CommandGroup>
              {products.map((product) => (
                <CommandItem
                  key={product._id}
                  value={`${product.name} ${product.categoryName ?? ""} ${product.price ?? ""}`}
                  onSelect={() => {
                    onSelect(product._id)
                    setOpen(false)
                  }}
                  className="py-2"
                >
                  <div className="flex w-full min-w-0 items-start gap-2">
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        value === product._id ? "opacity-100" : "opacity-0"
                      )}
                    />

                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate font-medium"
                        title={product.name}
                      >
                        {product.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        ${product.price.toLocaleString()}
                        {product.categoryName
                          ? ` • ${product.categoryName}`
                          : ""}
                      </div>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─── Fila de Opción (Diseño Ordenado) ───────────────────────────────────────

interface SlotOptionRowProps {
  slotIndex: number
  optionIndex: number
  control: Control<ComboFormData>
  products: Product[]
  onRemove: () => void
}

const SlotOptionRow = ({
  slotIndex,
  optionIndex,
  control,
  products,
  onRemove,
}: SlotOptionRowProps) => {
  return (
    <div className="grid grid-cols-12 items-end gap-2">
      <div className="col-span-12 min-w-0 md:col-span-7">
        {optionIndex === 0 && (
          <FormLabel className="font-bold text-[11px] text-muted-foreground uppercase">
            Producto
          </FormLabel>
        )}
        <FormField
          control={control}
          name={`slots.${slotIndex}.options.${optionIndex}.menuProductId`}
          render={({ field }) => (
            <FormControl>
              <ProductSelector
                value={field.value}
                onSelect={field.onChange}
                products={products}
              />
            </FormControl>
          )}
        />
      </div>

      <div className="col-span-5 md:col-span-2">
        {optionIndex === 0 && (
          <FormLabel className="block truncate font-bold text-[11px] text-muted-foreground uppercase">
            Recargo ($)
          </FormLabel>
        )}
        <FormField
          control={control}
          name={`slots.${slotIndex}.options.${optionIndex}.upcharge`}
          render={({ field }) => (
            <FormControl>
              <Input
                type="number"
                className="h-9"
                value={field.value ?? 0}
                onChange={(e) =>
                  field.onChange(Number.parseInt(e.target.value, 10) || 0)
                }
              />
            </FormControl>
          )}
        />
      </div>

      <div className="col-span-5 md:col-span-2">
        {optionIndex === 0 && (
          <FormLabel className="font-bold text-[11px] text-muted-foreground uppercase">
            Orden
          </FormLabel>
        )}
        <FormField
          control={control}
          name={`slots.${slotIndex}.options.${optionIndex}.sortOrder`}
          render={({ field }) => (
            <FormControl>
              <Input
                type="number"
                className="h-9"
                value={field.value ?? 0}
                onChange={(e) =>
                  field.onChange(Number.parseInt(e.target.value, 10) || 0)
                }
              />
            </FormControl>
          )}
        />
      </div>

      <div className="col-span-2 flex justify-end md:col-span-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Lista de opciones de un slot ───────────────────────────────────────────

interface SlotOptionsListProps {
  sIdx: number
  control: Control<ComboFormData>
  products: Product[]
}

function SlotOptionsList({ sIdx, control, products }: SlotOptionsListProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `slots.${sIdx}.options`,
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-bold text-[11px] text-muted-foreground uppercase">
          Opciones del producto
        </span>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() =>
            append({
              menuProductId: "",
              upcharge: 0,
              sortOrder: fields.length,
            })
          }
        >
          <Plus className="mr-1 h-3 w-3" />
          Agregar opción
        </Button>
      </div>

      {fields.length === 0 && (
        <div className="rounded-md border p-3 text-muted-foreground text-sm">
          Aún no hay opciones. Agrega al menos una opción para este slot.
        </div>
      )}

      {fields.map((f, oIdx) => (
        <SlotOptionRow
          key={f.id}
          slotIndex={sIdx}
          optionIndex={oIdx}
          control={control}
          products={products}
          onRemove={() => remove(oIdx)}
        />
      ))}
    </div>
  )
}

// ─── Slot Card (reusable) ────────────────────────────────────────────────────

export function SlotCard({
  slotIndex,
  control,
  products,
  onRemoveSlot,
}: {
  slotIndex: number
  control: Control<ComboFormData>
  products: Product[]
  onRemoveSlot: () => void
}) {
  return (
    <Card className="border-border shadow-none">
      <CardHeader className="bg-muted/20 p-4">
        <div className="grid grid-cols-12 items-end gap-2">
          <div className="col-span-12 md:col-span-6">
            <FormLabel className="font-bold text-[11px] text-muted-foreground uppercase">
              Nombre del Slot
            </FormLabel>
            <FormField
              control={control}
              name={`slots.${slotIndex}.name`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder="Ej: Bebida"
                      className="h-9"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="col-span-4 md:col-span-2">
            <FormLabel className="font-bold text-[11px] text-muted-foreground uppercase">
              Mín.
            </FormLabel>
            <FormField
              control={control}
              name={`slots.${slotIndex}.minSelections`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="number"
                      className="h-9"
                      value={field.value ?? 0}
                      onChange={(e) =>
                        field.onChange(Number.parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="col-span-4 md:col-span-2">
            <FormLabel className="font-bold text-[11px] text-muted-foreground uppercase">
              Máx.
            </FormLabel>
            <FormField
              control={control}
              name={`slots.${slotIndex}.maxSelections`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="number"
                      className="h-9"
                      value={field.value ?? 0}
                      onChange={(e) =>
                        field.onChange(Number.parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="col-span-3 md:col-span-1">
            <FormLabel className="font-bold text-[11px] text-muted-foreground uppercase">
              Orden
            </FormLabel>
            <FormField
              control={control}
              name={`slots.${slotIndex}.sortOrder`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="number"
                      className="h-9"
                      value={field.value ?? 0}
                      onChange={(e) =>
                        field.onChange(Number.parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="col-span-1 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-destructive"
              onClick={onRemoveSlot}
              title="Eliminar slot"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        <SlotOptionsList
          sIdx={slotIndex}
          control={control}
          products={products}
        />
      </CardContent>
    </Card>
  )
}

// ─── Modal Principal ────────────────────────────────────────────────────────

interface ComboFromListData {
  _id: Id<"combos">
  name: string
  description: string
  basePrice: number
  imageUrl?: string
  isActive: boolean
  slots: Array<{
    name: string
    minSelections: number
    maxSelections: number
    sortOrder: number
    options: Array<{
      menuProductId: string
      upcharge: number
      isDefault?: boolean
      sortOrder: number
      [key: string]: unknown
    }>
    [key: string]: unknown
  }>
  [key: string]: unknown
}

interface ComboFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  combo?: ComboFromListData | null
  mode: "create" | "edit"
}

export const ComboForm = ({
  open,
  onOpenChange,
  combo,
  mode,
}: ComboFormProps) => {
  const { activeOrganizationId } = useOrganization()

  const allProducts = useQuery(
    api.private.menuProducts.list,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          paginationOpts: { numItems: 200, cursor: null },
        }
      : "skip"
  )

  const products: Product[] = (allProducts?.page ?? []).map((p) => ({
    _id: p._id,
    name: p.name,
    price: p.price,
    categoryName: p.categoryName,
  }))

  const createCombo = useMutation(api.private.combos.create)
  const updateCombo = useMutation(api.private.combos.update)

  const mapComboToFormData = useCallback(
    (c: ComboFromListData): ComboFormData => ({
      name: c.name,
      description: c.description,
      basePrice: c.basePrice,
      imageUrl: c.imageUrl || "",
      isActive: c.isActive,
      slots: c.slots.map((slot) => ({
        name: slot.name,
        minSelections: slot.minSelections,
        maxSelections: slot.maxSelections,
        sortOrder: slot.sortOrder,
        options: slot.options.map((opt) => ({
          menuProductId: opt.menuProductId,
          upcharge: opt.upcharge,
          isDefault: opt.isDefault,
          sortOrder: opt.sortOrder,
        })),
      })),
    }),
    []
  )

  const emptyDefaults: ComboFormData = useMemo(
    () => ({
      name: "",
      description: "",
      basePrice: 0,
      imageUrl: "",
      isActive: true,
      slots: [],
    }),
    []
  )

  const form = useForm<ComboFormData>({
    resolver: zodResolver(comboFormSchema),
    defaultValues: combo ? mapComboToFormData(combo) : emptyDefaults,
  })

  // Reset form when dialog opens or combo changes
  useEffect(() => {
    if (open) {
      form.reset(combo ? mapComboToFormData(combo) : emptyDefaults)
    }
  }, [open, combo, form, mapComboToFormData, emptyDefaults])

  const {
    fields: slotFields,
    append: appendSlot,
    remove: removeSlot,
  } = useFieldArray({
    control: form.control,
    name: "slots",
  })

  const onSubmit = async (data: ComboFormData) => {
    try {
      if (!activeOrganizationId) {
        toast.error("No hay organización activa")
        return
      }

      // Map slots/options to match backend types (menuProductId as Id<'menuProducts'>)
      const mappedSlots = data.slots.map((slot) => ({
        name: slot.name,
        minSelections: slot.minSelections,
        maxSelections: slot.maxSelections,
        sortOrder: slot.sortOrder,
        options: slot.options.map((opt) => ({
          menuProductId: opt.menuProductId as Id<"menuProducts">,
          upcharge: opt.upcharge,
          isDefault: opt.isDefault,
          sortOrder: opt.sortOrder,
        })),
      }))

      if (mode === "edit" && combo) {
        await updateCombo({
          organizationId: activeOrganizationId,
          comboId: combo._id,
          name: data.name,
          description: data.description,
          basePrice: data.basePrice,
          imageUrl: data.imageUrl,
          isActive: data.isActive,
          slots: mappedSlots,
        })
      } else {
        await createCombo({
          organizationId: activeOrganizationId,
          name: data.name,
          description: data.description,
          basePrice: data.basePrice,
          imageUrl: data.imageUrl,
          isActive: data.isActive,
          slots: mappedSlots,
        })
      }

      toast.success("Combo guardado correctamente")
      onOpenChange(false)
    } catch (e: unknown) {
      toast.error(handleConvexError(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[96vw] overflow-y-auto border-none p-0 shadow-2xl sm:max-w-4xl">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2 font-bold text-primary text-xl">
            <Layers className="h-5 w-5" />
            {mode === "edit" ? "Editar Combo" : "Crear Nuevo Combo"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6 p-6"
          >
            {/* Encabezado principal */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="md:col-span-3">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">
                        Nombre del Combo
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Combo Familiar" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="md:col-span-1">
                <FormField
                  control={form.control}
                  name="basePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">
                        Precio Base ($)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          value={field.value ?? 0}
                          onChange={(e) =>
                            field.onChange(
                              Number.parseInt(e.target.value, 10) || 0
                            )
                          }
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Slots */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-lg">Configuración de Slots</h3>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    appendSlot({
                      name: "",
                      minSelections: 1,
                      maxSelections: 1,
                      sortOrder: slotFields.length,
                      options: [],
                    })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Agregar Slot
                </Button>
              </div>

              {slotFields.length === 0 && (
                <Card className="border-dashed">
                  <CardContent className="p-6 text-muted-foreground text-sm">
                    No hay slots configurados. Agrega un slot para empezar (por
                    ejemplo: “Bebida”, “Proteína”, “Acompañamiento”).
                  </CardContent>
                </Card>
              )}

              {slotFields.map((slot, sIdx) => (
                <SlotCard
                  key={slot.id}
                  slotIndex={sIdx}
                  control={form.control}
                  products={products}
                  onRemoveSlot={() => removeSlot(sIdx)}
                />
              ))}
            </div>

            <DialogFooter className="sticky bottom-0 gap-2 border-t bg-background pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="px-8 font-bold">
                {mode === "edit" ? "Guardar Cambios" : "Crear Combo"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
