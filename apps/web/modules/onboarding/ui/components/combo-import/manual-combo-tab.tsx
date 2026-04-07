"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
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
import { Separator } from "@workspace/ui/components/separator"
import { Textarea } from "@workspace/ui/components/textarea"
import { useMutation, useQuery } from "convex/react"
import { Layers, Loader2, PackageOpen, Plus } from "lucide-react"
import { useEffect } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { toast } from "sonner"
import { handleConvexError } from "@/lib/error-handling"
import {
  type ComboFormData,
  comboFormSchema,
  SlotCard,
} from "@/modules/dashboard/ui/components/combo-form"

// ─── Types ──────────────────────────────────────────────────────────────────

interface PopulatedOption {
  _id: string
  comboSlotId: string
  menuProductId: string
  menuProductName: string
  upcharge: number
  isDefault?: boolean
  sortOrder: number
  organizationId: string
}

interface PopulatedSlot {
  _id: string
  comboId: string
  name: string
  minSelections: number
  maxSelections: number
  sortOrder: number
  organizationId: string
  options: PopulatedOption[]
}

export interface ComboData {
  _id: Id<"combos">
  name: string
  description: string
  basePrice: number
  imageUrl?: string
  isActive: boolean
  organizationId: string
  slots: PopulatedSlot[]
}

interface ManualComboTabProps {
  organizationId: string
  editingCombo?: ComboData | null
  onEditComplete?: () => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildDefaultValues(combo?: ComboData | null): ComboFormData {
  if (combo) {
    return {
      name: combo.name,
      description: combo.description,
      basePrice: combo.basePrice,
      imageUrl: combo.imageUrl || "",
      isActive: combo.isActive,
      slots: combo.slots.map((slot) => ({
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
    }
  }
  return {
    name: "",
    description: "",
    basePrice: 0,
    imageUrl: "",
    isActive: true,
    slots: [],
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ManualComboTab({
  organizationId,
  editingCombo,
  onEditComplete,
}: ManualComboTabProps) {
  const isEditing = !!editingCombo

  const allProducts = useQuery(
    api.private.menuProducts.list,
    organizationId
      ? {
          organizationId,
          paginationOpts: { numItems: 200, cursor: null },
        }
      : "skip"
  )

  const products = (allProducts?.page ?? []).map((p) => ({
    _id: p._id as string,
    name: p.name,
    price: p.price,
    categoryName: p.categoryName,
  }))
  const isProductListTruncated = allProducts?.continueCursor !== null

  const createCombo = useMutation(api.private.combos.create)
  const updateCombo = useMutation(api.private.combos.update)

  const form = useForm<ComboFormData>({
    resolver: zodResolver(comboFormSchema),
    defaultValues: buildDefaultValues(editingCombo),
  })

  const {
    fields: slotFields,
    append: appendSlot,
    remove: removeSlot,
  } = useFieldArray({
    control: form.control,
    name: "slots",
  })

  useEffect(() => {
    form.reset(buildDefaultValues(editingCombo))
  }, [editingCombo, form])

  const handleAddSlot = () => {
    appendSlot({
      name: "",
      minSelections: 1,
      maxSelections: 1,
      sortOrder: slotFields.length,
      options: [],
    })
  }

  const onSubmit = async (data: ComboFormData) => {
    try {
      const slotsPayload = data.slots.map((slot) => ({
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

      if (isEditing && editingCombo) {
        await updateCombo({
          organizationId,
          comboId: editingCombo._id,
          name: data.name,
          description: data.description,
          basePrice: data.basePrice,
          imageUrl: data.imageUrl || undefined,
          isActive: data.isActive,
          slots: slotsPayload,
        })
        toast.success("Combo actualizado exitosamente")
        onEditComplete?.()
      } else {
        await createCombo({
          organizationId,
          name: data.name,
          description: data.description,
          basePrice: data.basePrice,
          imageUrl: data.imageUrl || undefined,
          isActive: data.isActive,
          slots: slotsPayload,
        })
        toast.success("Combo creado exitosamente")
        form.reset(buildDefaultValues(null))
      }
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  return (
    <div className="py-4">
      {allProducts !== undefined && products.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <PackageOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium text-sm">
            Agrega productos al menú primero para poder crear combos
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Vuelve al paso anterior para importar o crear productos.
          </p>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {isProductListTruncated && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs">
                Solo se cargaron los primeros 200 productos del menú en los
                selectores. Si no encuentras un producto, intenta filtrar o
                reducir temporalmente el menú.
              </div>
            )}

            {/* ── Basic Info ─────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Combo</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Combo Familiar, Almuerzo Ejecutivo"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="basePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio Base ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        placeholder="25000"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            Number.parseInt(e.target.value, 10) || 0
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      Precio base en pesos colombianos
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe el combo: qué incluye, para cuántas personas, etc."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Slots Builder ──────────────────────────────────────── */}
            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-base">Slots del Combo</h3>
                  <p className="text-muted-foreground text-sm">
                    Configura las categorías de selección del combo (ej:
                    Principal, Acompañamiento, Bebida)
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddSlot}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Agregar slot
                </Button>
              </div>

              {form.formState.errors.slots?.message && (
                <p className="text-destructive text-sm">
                  {form.formState.errors.slots.message}
                </p>
              )}

              {slotFields.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <Layers className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-muted-foreground text-sm">
                    No hay slots configurados. Agrega al menos un slot para
                    definir las opciones del combo.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={handleAddSlot}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Agregar primer slot
                  </Button>
                </div>
              )}

              <div className="space-y-4">
                {slotFields.map((slotField, slotIndex) => (
                  <SlotCard
                    key={slotField.id}
                    slotIndex={slotIndex}
                    control={form.control}
                    products={products}
                    onRemoveSlot={() => removeSlot(slotIndex)}
                  />
                ))}
              </div>
            </div>

            {/* ── Submit ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-end gap-3">
              {isEditing && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    form.reset(buildDefaultValues(null))
                    onEditComplete?.()
                  }}
                  disabled={form.formState.isSubmitting}
                >
                  Cancelar edición
                </Button>
              )}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {form.formState.isSubmitting
                  ? isEditing
                    ? "Guardando..."
                    : "Creando..."
                  : isEditing
                    ? "Guardar Cambios"
                    : "Agregar Combo"}
              </Button>
            </div>
          </form>
        </Form>
      )}
    </div>
  )
}
