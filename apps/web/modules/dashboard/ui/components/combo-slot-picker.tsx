"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"
import { useQuery } from "convex/react"
import { AlertTriangle, Layers, Minus, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { formatPrice } from "@/lib/currency"

export interface ComboSlotSelection {
  slotId?: string
  slotName: string
  menuProductId: string
  productName: string
  upcharge: number
  quantity?: number
}

export interface ComboItemData {
  itemType: "combo"
  comboId: string
  comboName: string
  comboBasePrice: number
  menuProducts: string[]
  comboSlotSelections: ComboSlotSelection[]
  quantity: number
  notes?: string
}

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

interface ComboWithSlots {
  _id: string
  name: string
  description: string
  basePrice: number
  imageUrl?: string
  isActive: boolean
  organizationId: string
  isDeleted?: boolean
  slots: PopulatedSlot[]
}

export interface ComboSlotPickerProps {
  restaurantLocationId?: string
  organizationId: string
  initialComboId?: string
  initialSelections?: ComboSlotSelection[]
  initialQuantity?: number
  initialNotes?: string
  isDiscontinued?: boolean
  onChange: (data: ComboItemData | null) => void
  onRemove?: () => void
}

type SlotSelectionQuantities = Record<string, number>
type ComboSelectionsState = Record<string, SlotSelectionQuantities>

interface SlotRowProps {
  slot: PopulatedSlot
  selectedQuantities: SlotSelectionQuantities
  onSelectSingle: (menuProductId: string) => void
  onIncrement: (menuProductId: string) => void
  onDecrement: (menuProductId: string) => void
}

const SlotRow = ({
  slot,
  selectedQuantities,
  onSelectSingle,
  onIncrement,
  onDecrement,
}: SlotRowProps) => {
  const isRequired = slot.minSelections > 0
  const isSingleSelect = slot.maxSelections === 1
  const totalSelected = Object.values(selectedQuantities).reduce(
    (sum, value) => sum + value,
    0
  )

  if (isSingleSelect) {
    const selectedProductId = Object.entries(selectedQuantities).find(
      ([, qty]) => qty > 0
    )?.[0]

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="font-semibold text-sm">{slot.name}</Label>
          {isRequired ? (
            <Badge
              variant="default"
              className="bg-primary/10 text-[10px] text-primary hover:bg-primary/10"
            >
              Requerido
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="text-[10px] text-muted-foreground"
            >
              Opcional
            </Badge>
          )}
        </div>

        <RadioGroup
          value={selectedProductId ?? ""}
          onValueChange={onSelectSingle}
          className="gap-1.5"
        >
          {slot.options.map((option) => (
            <Label
              key={option._id}
              htmlFor={`slot-${slot._id}-${option._id}`}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 font-normal transition-colors",
                selectedProductId === option.menuProductId
                  ? "border-primary/40 bg-primary/5"
                  : "border-border hover:border-border/80 hover:bg-muted/40"
              )}
            >
              <RadioGroupItem
                value={option.menuProductId}
                id={`slot-${slot._id}-${option._id}`}
              />
              <span className="flex-1 text-sm">{option.menuProductName}</span>
              <span
                className={cn(
                  "shrink-0 font-medium text-xs",
                  option.upcharge > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
                )}
              >
                {option.upcharge > 0
                  ? `+${formatPrice(option.upcharge)}`
                  : "Incluido"}
              </span>
            </Label>
          ))}
        </RadioGroup>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="font-semibold text-sm">{slot.name}</Label>
        {isRequired ? (
          <Badge
            variant="default"
            className="bg-primary/10 text-[10px] text-primary hover:bg-primary/10"
          >
            Requerido
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="text-[10px] text-muted-foreground"
          >
            Opcional
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px]">
          {slot.minSelections === slot.maxSelections
            ? `Elige ${slot.maxSelections}`
            : `Elige ${slot.minSelections}-${slot.maxSelections}`}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          Seleccionadas {totalSelected}/{slot.maxSelections}
        </Badge>
      </div>

      <div className="space-y-1.5">
        {slot.options.map((option) => {
          const currentQty = selectedQuantities[option.menuProductId] ?? 0
          const isMaxReached = totalSelected >= slot.maxSelections
          const canIncrement = !isMaxReached

          return (
            <div
              key={option._id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                currentQty > 0
                  ? "border-primary/40 bg-primary/5"
                  : "border-border hover:border-border/80 hover:bg-muted/40"
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">{option.menuProductName}</p>
                <p
                  className={cn(
                    "text-xs",
                    option.upcharge > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                  )}
                >
                  {option.upcharge > 0
                    ? `+${formatPrice(option.upcharge)}`
                    : "Incluido"}
                </p>
              </div>

              <div className="flex items-center gap-1 rounded-full border bg-background p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  onClick={() => onDecrement(option.menuProductId)}
                  disabled={currentQty === 0}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="w-6 text-center font-semibold text-xs">
                  {currentQty}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  onClick={() => onIncrement(option.menuProductId)}
                  disabled={!canIncrement}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const ComboSlotPicker = ({
  restaurantLocationId,
  organizationId,
  initialComboId,
  initialSelections,
  initialQuantity,
  initialNotes,
  isDiscontinued,
  onChange,
  onRemove,
}: ComboSlotPickerProps) => {
  const allCombos = useQuery(
    api.private.combos.list,
    organizationId ? { organizationId } : "skip"
  )

  const locationCombos = useQuery(
    api.private.combos.getAvailableByLocation,
    organizationId && restaurantLocationId
      ? {
          organizationId,
          locationId: restaurantLocationId as Id<"restaurantLocations">,
        }
      : "skip"
  )

  const availableCombos = useMemo(() => {
    const source = restaurantLocationId ? locationCombos : allCombos
    if (!source) return []
    return (source as ComboWithSlots[]).filter(
      (c) => c.isActive && c.isDeleted !== true
    )
  }, [allCombos, locationCombos, restaurantLocationId])

  const [selectedComboId, setSelectedComboId] = useState<string>(
    initialComboId ?? ""
  )
  const [slotSelections, setSlotSelections] = useState<ComboSelectionsState>({})
  const [quantity, setQuantity] = useState(initialQuantity ?? 1)
  const [notes, setNotes] = useState(initialNotes ?? "")

  const selectedCombo = useMemo(() => {
    if (!selectedComboId) return null

    const found = availableCombos.find((c) => c._id === selectedComboId)
    if (found) return found

    if (isDiscontinued && allCombos) {
      return (
        (allCombos as ComboWithSlots[]).find(
          (c) => c._id === selectedComboId
        ) ?? null
      )
    }

    return null
  }, [selectedComboId, availableCombos, allCombos, isDiscontinued])

  const getSlotSelectedCount = useCallback(
    (slotId: string) => {
      const slotMap = slotSelections[slotId] ?? {}
      return Object.values(slotMap).reduce((sum, value) => sum + value, 0)
    },
    [slotSelections]
  )

  const isValid = useMemo(() => {
    if (!selectedCombo) return false
    for (const slot of selectedCombo.slots) {
      const selectedCount = getSlotSelectedCount(slot._id)
      if (selectedCount < slot.minSelections) {
        return false
      }
      if (selectedCount > slot.maxSelections) {
        return false
      }
    }
    return true
  }, [selectedCombo, getSlotSelectedCount])

  const totalUpcharges = useMemo(() => {
    if (!selectedCombo) return 0
    let sum = 0

    for (const slot of selectedCombo.slots) {
      const slotMap = slotSelections[slot._id] ?? {}
      for (const option of slot.options) {
        const optionQty = slotMap[option.menuProductId] ?? 0
        if (optionQty > 0) {
          sum += option.upcharge * optionQty
        }
      }
    }

    return sum
  }, [selectedCombo, slotSelections])

  const totalPrice = useMemo(() => {
    if (!selectedCombo) return 0
    return (selectedCombo.basePrice + totalUpcharges) * quantity
  }, [selectedCombo, totalUpcharges, quantity])

  const buildOutput = useCallback((): ComboItemData | null => {
    if (!selectedCombo || !isValid) return null

    const comboSlotSelections: ComboSlotSelection[] = []
    const menuProducts: string[] = []

    for (const slot of selectedCombo.slots) {
      const slotMap = slotSelections[slot._id] ?? {}
      for (const option of slot.options) {
        const optionQty = slotMap[option.menuProductId] ?? 0
        if (optionQty <= 0) continue

        comboSlotSelections.push({
          slotId: slot._id,
          slotName: slot.name,
          menuProductId: option.menuProductId,
          productName: option.menuProductName,
          upcharge: option.upcharge,
          quantity: optionQty,
        })

        for (let i = 0; i < optionQty; i += 1) {
          menuProducts.push(option.menuProductId)
        }
      }
    }

    return {
      itemType: "combo",
      comboId: selectedCombo._id,
      comboName: selectedCombo.name,
      comboBasePrice: selectedCombo.basePrice,
      menuProducts,
      comboSlotSelections,
      quantity,
      notes: notes.trim() || undefined,
    }
  }, [selectedCombo, slotSelections, quantity, notes, isValid])

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const hasSyncedInitialStateRef = useRef(false)
  const hasHydratedInitialSelectionsRef = useRef(false)

  useEffect(() => {
    if (hasHydratedInitialSelectionsRef.current) return
    if (
      !selectedCombo ||
      !initialSelections ||
      initialSelections.length === 0
    ) {
      return
    }

    const map: ComboSelectionsState = {}

    for (const selection of initialSelections) {
      const targetSlot = selectedCombo.slots.find((slot) => {
        if (selection.slotId && slot._id === selection.slotId) return true
        if (slot.name !== selection.slotName) return false
        return slot.options.some(
          (option) => option.menuProductId === selection.menuProductId
        )
      })
      if (!targetSlot) continue

      const existingSlotMap = map[targetSlot._id] ?? {}
      const currentCount = Object.values(existingSlotMap).reduce(
        (sum, value) => sum + value,
        0
      )
      const qtyToApply = selection.quantity ?? 1
      const remaining = Math.max(0, targetSlot.maxSelections - currentCount)
      const boundedQty = Math.min(qtyToApply, remaining)

      if (boundedQty > 0) {
        existingSlotMap[selection.menuProductId] =
          (existingSlotMap[selection.menuProductId] ?? 0) + boundedQty
        map[targetSlot._id] = existingSlotMap
      }
    }

    setSlotSelections(map)
    hasHydratedInitialSelectionsRef.current = true
  }, [selectedCombo, initialSelections])

  useEffect(() => {
    const output = buildOutput()
    const waitingForInitialComboData =
      Boolean(initialComboId) &&
      selectedComboId === initialComboId &&
      !selectedCombo

    if (
      !hasSyncedInitialStateRef.current &&
      waitingForInitialComboData &&
      output === null
    ) {
      return
    }

    hasSyncedInitialStateRef.current = true
    onChangeRef.current(output)
  }, [buildOutput, initialComboId, selectedCombo, selectedComboId])

  const handleComboChange = (comboId: string) => {
    setSelectedComboId(comboId)
    hasHydratedInitialSelectionsRef.current = true

    const combo = availableCombos.find((c) => c._id === comboId)
    if (combo) {
      const defaults: ComboSelectionsState = {}
      for (const slot of combo.slots) {
        const defaultOptions = slot.options
          .filter((o) => o.isDefault)
          .slice(0, slot.maxSelections)
        defaults[slot._id] = Object.fromEntries(
          defaultOptions.map((option) => [option.menuProductId, 1])
        )
      }
      setSlotSelections(defaults)
    } else {
      setSlotSelections({})
    }
  }

  const handleSingleSelect = (slot: PopulatedSlot, menuProductId: string) => {
    setSlotSelections((prev) => ({
      ...prev,
      [slot._id]: { [menuProductId]: 1 },
    }))
  }

  const handleSlotQuantityChange = (
    slot: PopulatedSlot,
    menuProductId: string,
    delta: number
  ) => {
    setSlotSelections((prev) => {
      const slotMap = { ...(prev[slot._id] ?? {}) }
      const currentQty = slotMap[menuProductId] ?? 0
      const currentTotal = Object.values(slotMap).reduce(
        (sum, value) => sum + value,
        0
      )

      if (delta > 0 && currentTotal >= slot.maxSelections) {
        return prev
      }

      const nextQty = Math.max(0, currentQty + delta)
      if (nextQty === 0) {
        delete slotMap[menuProductId]
      } else {
        slotMap[menuProductId] = nextQty
      }

      return {
        ...prev,
        [slot._id]: slotMap,
      }
    })
  }

  const handleQuantityChange = (delta: number) => {
    setQuantity((prev) => Math.max(1, prev + delta))
  }

  const handleDeselect = () => {
    setSelectedComboId("")
    setSlotSelections({})
    setQuantity(1)
    setNotes("")
  }

  return (
    <Card className="overflow-hidden border-border/60">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Combo</CardTitle>
          {isDiscontinued && (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
            >
              <AlertTriangle className="mr-1 h-3 w-3" />
              Combo descontinuado
            </Badge>
          )}
        </div>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Seleccionar combo
          </Label>
          <Select value={selectedComboId} onValueChange={handleComboChange}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Elegir un combo...">
                {selectedCombo ? (
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{selectedCombo.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatPrice(selectedCombo.basePrice)}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Elegir un combo...
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {availableCombos.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  {restaurantLocationId
                    ? "No hay combos disponibles para esta sucursal"
                    : "No hay combos disponibles"}
                </div>
              ) : (
                availableCombos.map((combo) => (
                  <SelectItem key={combo._id} value={combo._id}>
                    <div className="flex w-full items-center justify-between gap-3">
                      <div className="flex flex-col">
                        <span className="font-medium">{combo.name}</span>
                        {combo.description && (
                          <span className="line-clamp-1 text-muted-foreground text-xs">
                            {combo.description}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 font-semibold text-primary text-sm">
                        {formatPrice(combo.basePrice)}
                      </span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          {selectedComboId && !isDiscontinued && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-muted-foreground text-xs"
              onClick={handleDeselect}
            >
              Quitar combo
            </Button>
          )}
        </div>

        {isDiscontinued && selectedCombo && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-amber-800 text-xs dark:text-amber-300">
              Este combo fue descontinuado y ya no está disponible para nuevos
              pedidos. Los datos se muestran como referencia del pedido
              original.
            </p>
          </div>
        )}

        {selectedCombo && selectedCombo.slots.length > 0 && (
          <>
            <Separator />

            <div className="space-y-4">
              {selectedCombo.slots.map((slot) => (
                <SlotRow
                  key={slot._id}
                  slot={slot}
                  selectedQuantities={slotSelections[slot._id] ?? {}}
                  onSelectSingle={(productId) =>
                    handleSingleSelect(slot, productId)
                  }
                  onIncrement={(productId) =>
                    handleSlotQuantityChange(slot, productId, 1)
                  }
                  onDecrement={(productId) =>
                    handleSlotQuantityChange(slot, productId, -1)
                  }
                />
              ))}
            </div>
          </>
        )}

        {selectedCombo && (
          <>
            <Separator />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Cantidad
                </Label>
                <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-md"
                    onClick={() => handleQuantityChange(-1)}
                    disabled={quantity <= 1}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (!Number.isNaN(val) && val >= 1) setQuantity(val)
                    }}
                    className="h-8 w-14 border-0 bg-transparent text-center font-bold shadow-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    min={1}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-md"
                    onClick={() => handleQuantityChange(1)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Notas (opcional)
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: Sin cebolla, extra salsa..."
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
            </div>
          </>
        )}

        {selectedCombo && (
          <>
            <Separator />

            <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Precio base</span>
                <span>{formatPrice(selectedCombo.basePrice)}</span>
              </div>
              {totalUpcharges > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Recargos</span>
                  <span className="text-amber-600 dark:text-amber-400">
                    +{formatPrice(totalUpcharges)}
                  </span>
                </div>
              )}
              {quantity > 1 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cantidad</span>
                  <span>&times;{quantity}</span>
                </div>
              )}
              <Separator className="my-1.5" />
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">Total combo</span>
                <span className="font-bold text-lg text-primary">
                  {formatPrice(totalPrice)}
                </span>
              </div>

              {!isValid && selectedCombo.slots.length > 0 && (
                <p className="mt-1 text-destructive text-xs">
                  Completa todos los slots requeridos para continuar
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
