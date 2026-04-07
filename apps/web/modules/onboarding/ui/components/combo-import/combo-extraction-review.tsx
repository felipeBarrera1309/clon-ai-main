"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Separator } from "@workspace/ui/components/separator"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"
import { useMutation, useQuery } from "convex/react"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  CircleDotIcon,
  Loader2Icon,
  PackageIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { formatPrice } from "@/lib/currency"
import type {
  ExtractedComboData,
  ExtractedOptionData,
  ExtractedSlotData,
} from "@/modules/onboarding/types"

// ─── Types ──────────────────────────────────────────────────────────────────

interface ResolvedOption extends ExtractedOptionData {
  resolvedProductId: string | null
  resolvedProductName: string | null
  confidence: number
}

interface ResolvedSlot extends Omit<ExtractedSlotData, "options"> {
  options: ResolvedOption[]
}

interface ResolvedCombo extends Omit<ExtractedComboData, "slots"> {
  slots: ResolvedSlot[]
}

interface ComboExtractionReviewProps {
  extractedCombos: ExtractedComboData[]
  organizationId: string
  onImportComplete: () => void
  onDiscard: () => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getConfidenceLevel(score: number): "high" | "medium" | "low" {
  if (score >= 0.9) return "high"
  if (score >= 0.5) return "medium"
  return "low"
}

function getConfidenceBadge(level: "high" | "medium" | "low") {
  switch (level) {
    case "high":
      return {
        variant: "default" as const,
        className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/25",
        icon: CheckCircle2Icon,
        label: "Coincidencia",
      }
    case "medium":
      return {
        variant: "default" as const,
        className: "bg-amber-500/15 text-amber-700 border-amber-500/25",
        icon: CircleDotIcon,
        label: "Revisar",
      }
    case "low":
      return {
        variant: "default" as const,
        className: "bg-red-500/15 text-red-700 border-red-500/25",
        icon: AlertCircleIcon,
        label: "Sin coincidencia",
      }
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ComboExtractionReview({
  extractedCombos,
  organizationId,
  onImportComplete,
  onDiscard,
}: ComboExtractionReviewProps) {
  const [isImporting, setIsImporting] = useState(false)

  const allProductNames = useMemo(() => {
    const names = new Set<string>()
    for (const combo of extractedCombos) {
      for (const slot of combo.slots) {
        for (const option of slot.options) {
          if (option.productName.trim()) {
            names.add(option.productName.trim())
          }
        }
      }
    }
    return Array.from(names)
  }, [extractedCombos])

  const productMatches = useQuery(
    api.system.comboExtractionPipeline.getProductMatches,
    allProductNames.length > 0
      ? { organizationId, productNames: allProductNames }
      : "skip"
  )

  const allProductsResult = useQuery(
    api.private.menuProducts.list,
    organizationId
      ? {
          organizationId,
          paginationOpts: { numItems: 200, cursor: null },
        }
      : "skip"
  )

  const allProducts = useMemo(
    () =>
      (allProductsResult?.page ?? []).map((p) => ({
        _id: p._id as string,
        name: p.name,
        price: p.price,
        categoryName: p.categoryName,
      })),
    [allProductsResult]
  )
  const isProductListTruncated = allProductsResult?.continueCursor !== null

  const initialResolved = useMemo<ResolvedCombo[]>(() => {
    if (!productMatches) return []

    return extractedCombos.map((combo) => ({
      ...combo,
      slots: combo.slots.map((slot) => ({
        ...slot,
        options: slot.options.map((option) => {
          const matches = productMatches[option.productName.trim()]
          const topMatch = matches?.[0]
          const confidence = topMatch?.score ?? 0

          return {
            ...option,
            resolvedProductId:
              confidence >= 0.9 ? (topMatch?.productId ?? null) : null,
            resolvedProductName:
              confidence >= 0.9 ? (topMatch?.productName ?? null) : null,
            confidence,
          }
        }),
      })),
    }))
  }, [extractedCombos, productMatches])

  const [combos, setCombos] = useState<ResolvedCombo[]>([])
  const initializedExtractionKeyRef = useRef<string | null>(null)
  const extractionKey = useMemo(
    () => extractedCombos.map((combo) => combo.tempId).join("|"),
    [extractedCombos]
  )

  useEffect(() => {
    if (initialResolved.length === 0) return
    if (initializedExtractionKeyRef.current === extractionKey) return

    setCombos(initialResolved)
    initializedExtractionKeyRef.current = extractionKey
  }, [initialResolved, extractionKey])

  const createCombo = useMutation(api.private.combos.create)

  // ─── Combo-level editors ────────────────────────────────────────────────

  const updateComboField = useCallback(
    (tempId: string, field: keyof ExtractedComboData, value: unknown) => {
      setCombos((prev) =>
        prev.map((c) => (c.tempId === tempId ? { ...c, [field]: value } : c))
      )
    },
    []
  )

  const removeCombo = useCallback((tempId: string) => {
    setCombos((prev) => prev.filter((c) => c.tempId !== tempId))
  }, [])

  // ─── Slot-level editors ─────────────────────────────────────────────────

  const updateSlotField = useCallback(
    (
      comboTempId: string,
      slotTempId: string,
      field: keyof ExtractedSlotData,
      value: unknown
    ) => {
      setCombos((prev) =>
        prev.map((c) =>
          c.tempId === comboTempId
            ? {
                ...c,
                slots: c.slots.map((s) =>
                  s.tempId === slotTempId ? { ...s, [field]: value } : s
                ),
              }
            : c
        )
      )
    },
    []
  )

  // ─── Option-level editors ───────────────────────────────────────────────

  const updateOptionProduct = useCallback(
    (
      comboTempId: string,
      slotTempId: string,
      optionTempId: string,
      productId: string,
      productName: string
    ) => {
      const hasSelection = productId.trim().length > 0
      setCombos((prev) =>
        prev.map((c) =>
          c.tempId === comboTempId
            ? {
                ...c,
                slots: c.slots.map((s) =>
                  s.tempId === slotTempId
                    ? {
                        ...s,
                        options: s.options.map((o) =>
                          o.tempId === optionTempId
                            ? {
                                ...o,
                                resolvedProductId: hasSelection
                                  ? productId
                                  : null,
                                resolvedProductName: hasSelection
                                  ? productName
                                  : null,
                                confidence: hasSelection ? 1.0 : 0,
                              }
                            : o
                        ),
                      }
                    : s
                ),
              }
            : c
        )
      )
    },
    []
  )

  const updateOptionUpcharge = useCallback(
    (
      comboTempId: string,
      slotTempId: string,
      optionTempId: string,
      upcharge: number
    ) => {
      setCombos((prev) =>
        prev.map((c) =>
          c.tempId === comboTempId
            ? {
                ...c,
                slots: c.slots.map((s) =>
                  s.tempId === slotTempId
                    ? {
                        ...s,
                        options: s.options.map((o) =>
                          o.tempId === optionTempId ? { ...o, upcharge } : o
                        ),
                      }
                    : s
                ),
              }
            : c
        )
      )
    },
    []
  )

  // ─── Validation ─────────────────────────────────────────────────────────

  const unresolvedCount = useMemo(() => {
    let count = 0
    for (const combo of combos) {
      for (const slot of combo.slots) {
        for (const option of slot.options) {
          if (!option.resolvedProductId) count++
        }
      }
    }
    return count
  }, [combos])

  // ─── Import handler ─────────────────────────────────────────────────────

  const handleImport = async () => {
    if (unresolvedCount > 0) {
      toast.error(
        `Hay ${unresolvedCount} producto(s) sin asignar. Resuelve todas las coincidencias antes de importar.`
      )
      return
    }

    setIsImporting(true)
    let successCount = 0
    let failCount = 0

    for (const combo of combos) {
      try {
        await createCombo({
          organizationId,
          name: combo.name,
          description: combo.description,
          basePrice: combo.basePrice,
          isActive: true,
          slots: combo.slots.map((slot, slotIndex) => ({
            name: slot.name,
            minSelections: slot.minSelections,
            maxSelections: slot.maxSelections,
            sortOrder: slotIndex,
            options: slot.options.map((option, optionIndex) => ({
              menuProductId: option.resolvedProductId as Id<"menuProducts">,
              upcharge: option.upcharge,
              isDefault: option.isDefault,
              sortOrder: optionIndex,
            })),
          })),
        })
        successCount++
      } catch (error) {
        failCount++
        console.error(`Failed to import combo "${combo.name}":`, error)
      }
    }

    setIsImporting(false)

    if (failCount > 0) {
      toast.error(
        `Se importaron ${successCount} combo(s), pero ${failCount} fallaron. Revisa la consola para más detalles.`
      )
    } else {
      toast.success(`${successCount} combo(s) importado(s) exitosamente`)
    }

    if (successCount > 0) {
      onImportComplete()
    }
  }

  // ─── Empty/Loading states ───────────────────────────────────────────────

  if (extractedCombos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <PackageIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">
          No se encontraron combos en los archivos subidos.
        </p>
        <Button variant="outline" onClick={onDiscard} className="mt-4">
          Volver
        </Button>
      </div>
    )
  }

  if (!productMatches) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground text-sm">
          Buscando coincidencias de productos...
        </p>
      </div>
    )
  }

  const isInitializingResolvedCombos =
    combos.length === 0 &&
    initialResolved.length > 0 &&
    initializedExtractionKeyRef.current !== extractionKey

  if (isInitializingResolvedCombos) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {isProductListTruncated && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs">
          <AlertCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Solo se cargaron los primeros 200 productos del menú en los
            selectores manuales. Si no encuentras un producto, filtra más o
            reduce el menú temporalmente.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="font-mono">
            {combos.length} combo{combos.length !== 1 ? "s" : ""}
          </Badge>
          {unresolvedCount > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500/25 bg-amber-500/10 text-amber-700"
            >
              <AlertCircleIcon className="mr-1 h-3 w-3" />
              {unresolvedCount} sin asignar
            </Badge>
          )}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {combos.map((combo) => (
          <ComboCard
            key={combo.tempId}
            combo={combo}
            productMatches={productMatches}
            allProducts={allProducts}
            onUpdateComboField={updateComboField}
            onRemoveCombo={removeCombo}
            onUpdateSlotField={updateSlotField}
            onUpdateOptionProduct={updateOptionProduct}
            onUpdateOptionUpcharge={updateOptionUpcharge}
          />
        ))}
      </Accordion>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onDiscard} disabled={isImporting}>
          Descartar
        </Button>
        <Button
          onClick={handleImport}
          disabled={isImporting || unresolvedCount > 0}
        >
          {isImporting ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Importando...
            </>
          ) : (
            `Importar ${combos.length} Combo${combos.length !== 1 ? "s" : ""}`
          )}
        </Button>
      </div>
    </div>
  )
}

// ─── Combo Card ─────────────────────────────────────────────────────────────

interface ComboCardProps {
  combo: ResolvedCombo
  productMatches: Record<
    string,
    Array<{
      productId: string
      productName: string
      price: number
      score: number
    }>
  >
  allProducts: Array<{
    _id: string
    name: string
    price: number
    categoryName: string
  }>
  onUpdateComboField: (
    tempId: string,
    field: keyof ExtractedComboData,
    value: unknown
  ) => void
  onRemoveCombo: (tempId: string) => void
  onUpdateSlotField: (
    comboTempId: string,
    slotTempId: string,
    field: keyof ExtractedSlotData,
    value: unknown
  ) => void
  onUpdateOptionProduct: (
    comboTempId: string,
    slotTempId: string,
    optionTempId: string,
    productId: string,
    productName: string
  ) => void
  onUpdateOptionUpcharge: (
    comboTempId: string,
    slotTempId: string,
    optionTempId: string,
    upcharge: number
  ) => void
}

function ComboCard({
  combo,
  productMatches,
  allProducts,
  onUpdateComboField,
  onRemoveCombo,
  onUpdateSlotField,
  onUpdateOptionProduct,
  onUpdateOptionUpcharge,
}: ComboCardProps) {
  const totalOptions = combo.slots.reduce((sum, s) => sum + s.options.length, 0)
  const resolvedOptions = combo.slots.reduce(
    (sum, s) =>
      sum + s.options.filter((o) => o.resolvedProductId !== null).length,
    0
  )

  return (
    <AccordionItem
      value={combo.tempId}
      className="rounded-lg border bg-card shadow-sm"
    >
      <AccordionTrigger className="px-4 hover:no-underline">
        <div className="flex flex-1 items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-sm">
              {combo.name || "Combo sin nombre"}
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-muted-foreground text-xs">
              <span>{formatPrice(combo.basePrice)}</span>
              <span>·</span>
              <span>
                {combo.slots.length} slot{combo.slots.length !== 1 ? "s" : ""}
              </span>
              <span>·</span>
              <span>
                {resolvedOptions}/{totalOptions} productos
              </span>
            </div>
          </div>
          {resolvedOptions === totalOptions ? (
            <Badge className="border-emerald-500/25 bg-emerald-500/15 text-emerald-700">
              <CheckCircle2Icon className="mr-1 h-3 w-3" />
              Listo
            </Badge>
          ) : (
            <Badge className="border-amber-500/25 bg-amber-500/15 text-amber-700">
              {totalOptions - resolvedOptions} pendiente
              {totalOptions - resolvedOptions !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </AccordionTrigger>

      <AccordionContent className="px-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <span className="font-medium text-muted-foreground text-xs">
              Nombre
            </span>
            <Input
              value={combo.name}
              onChange={(e) =>
                onUpdateComboField(combo.tempId, "name", e.target.value)
              }
              placeholder="Nombre del combo"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <span className="font-medium text-muted-foreground text-xs">
              Precio base
            </span>
            <Input
              type="number"
              value={combo.basePrice || ""}
              onChange={(e) =>
                onUpdateComboField(
                  combo.tempId,
                  "basePrice",
                  parseInt(e.target.value, 10) || 0
                )
              }
              placeholder="0"
              className="h-9"
              min={0}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <span className="font-medium text-muted-foreground text-xs">
              Descripción
            </span>
            <Textarea
              value={combo.description}
              onChange={(e) =>
                onUpdateComboField(combo.tempId, "description", e.target.value)
              }
              placeholder="Descripción del combo"
              className="min-h-[36px] resize-none"
              rows={1}
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onRemoveCombo(combo.tempId)}
          >
            <Trash2Icon className="mr-1 h-3.5 w-3.5" />
            Eliminar combo
          </Button>
        </div>

        <Separator className="my-3" />

        <div className="space-y-4">
          {combo.slots.map((slot) => (
            <SlotSection
              key={slot.tempId}
              slot={slot}
              comboTempId={combo.tempId}
              productMatches={productMatches}
              allProducts={allProducts}
              onUpdateSlotField={onUpdateSlotField}
              onUpdateOptionProduct={onUpdateOptionProduct}
              onUpdateOptionUpcharge={onUpdateOptionUpcharge}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

// ─── Slot Section ───────────────────────────────────────────────────────────

interface SlotSectionProps {
  slot: ResolvedSlot
  comboTempId: string
  productMatches: Record<
    string,
    Array<{
      productId: string
      productName: string
      price: number
      score: number
    }>
  >
  allProducts: Array<{
    _id: string
    name: string
    price: number
    categoryName: string
  }>
  onUpdateSlotField: (
    comboTempId: string,
    slotTempId: string,
    field: keyof ExtractedSlotData,
    value: unknown
  ) => void
  onUpdateOptionProduct: (
    comboTempId: string,
    slotTempId: string,
    optionTempId: string,
    productId: string,
    productName: string
  ) => void
  onUpdateOptionUpcharge: (
    comboTempId: string,
    slotTempId: string,
    optionTempId: string,
    upcharge: number
  ) => void
}

function SlotSection({
  slot,
  comboTempId,
  productMatches,
  allProducts,
  onUpdateSlotField,
  onUpdateOptionProduct,
  onUpdateOptionUpcharge,
}: SlotSectionProps) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <span className="font-medium text-muted-foreground text-xs">
              Nombre del slot
            </span>
            <Input
              value={slot.name}
              onChange={(e) =>
                onUpdateSlotField(
                  comboTempId,
                  slot.tempId,
                  "name",
                  e.target.value
                )
              }
              placeholder="Ej: Principal, Bebida..."
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <span className="font-medium text-muted-foreground text-xs">
              Mín. selecciones
            </span>
            <Input
              type="number"
              value={slot.minSelections}
              onChange={(e) =>
                onUpdateSlotField(
                  comboTempId,
                  slot.tempId,
                  "minSelections",
                  parseInt(e.target.value, 10) || 0
                )
              }
              min={0}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <span className="font-medium text-muted-foreground text-xs">
              Máx. selecciones
            </span>
            <Input
              type="number"
              value={slot.maxSelections}
              onChange={(e) =>
                onUpdateSlotField(
                  comboTempId,
                  slot.tempId,
                  "maxSelections",
                  parseInt(e.target.value, 10) || 1
                )
              }
              min={1}
              className="h-8 text-sm"
            />
          </div>
        </div>

        <Separator className="my-2.5" />

        <div className="space-y-2">
          <p className="font-medium text-muted-foreground text-xs">Opciones</p>
          {slot.options.length === 0 ? (
            <p className="rounded border border-dashed p-3 text-center text-muted-foreground text-xs">
              Sin opciones en este slot.
            </p>
          ) : (
            <div className="space-y-1.5">
              {slot.options.map((option) => (
                <OptionRow
                  key={option.tempId}
                  option={option}
                  comboTempId={comboTempId}
                  slotTempId={slot.tempId}
                  productMatches={productMatches}
                  allProducts={allProducts}
                  onUpdateOptionProduct={onUpdateOptionProduct}
                  onUpdateOptionUpcharge={onUpdateOptionUpcharge}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Option Row ─────────────────────────────────────────────────────────────

interface OptionRowProps {
  option: ResolvedOption
  comboTempId: string
  slotTempId: string
  productMatches: Record<
    string,
    Array<{
      productId: string
      productName: string
      price: number
      score: number
    }>
  >
  allProducts: Array<{
    _id: string
    name: string
    price: number
    categoryName: string
  }>
  onUpdateOptionProduct: (
    comboTempId: string,
    slotTempId: string,
    optionTempId: string,
    productId: string,
    productName: string
  ) => void
  onUpdateOptionUpcharge: (
    comboTempId: string,
    slotTempId: string,
    optionTempId: string,
    upcharge: number
  ) => void
}

function OptionRow({
  option,
  comboTempId,
  slotTempId,
  productMatches,
  allProducts,
  onUpdateOptionProduct,
  onUpdateOptionUpcharge,
}: OptionRowProps) {
  const level = getConfidenceLevel(option.confidence)
  const badge = getConfidenceBadge(level)
  const BadgeIcon = badge.icon

  const suggestions = productMatches[option.productName.trim()] ?? []

  return (
    <div className="grid grid-cols-1 items-start gap-2 rounded-md bg-muted/30 p-2 sm:grid-cols-[1fr_auto_6rem]">
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-muted-foreground text-xs">
            &ldquo;{option.productName}&rdquo;
          </span>
          <Badge
            variant="outline"
            className={cn("shrink-0 text-[10px]", badge.className)}
          >
            <BadgeIcon className="mr-0.5 h-2.5 w-2.5" />
            {badge.label}
          </Badge>
        </div>

        {level === "high" && option.resolvedProductId && (
          <p className="flex items-center gap-1.5 text-sm">
            <CheckCircle2Icon className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span className="truncate font-medium">
              {option.resolvedProductName}
            </span>
          </p>
        )}

        {level === "medium" && !option.resolvedProductId && (
          <SuggestionSelect
            suggestions={suggestions}
            onSelect={(productId, productName) =>
              onUpdateOptionProduct(
                comboTempId,
                slotTempId,
                option.tempId,
                productId,
                productName
              )
            }
          />
        )}

        {level === "medium" && option.resolvedProductId && (
          <p className="flex items-center gap-1.5 text-sm">
            <CheckCircle2Icon className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span className="truncate font-medium">
              {option.resolvedProductName}
            </span>
          </p>
        )}

        {level === "low" && !option.resolvedProductId && (
          <ManualProductSelector
            products={allProducts}
            onSelect={(productId, productName) =>
              onUpdateOptionProduct(
                comboTempId,
                slotTempId,
                option.tempId,
                productId,
                productName
              )
            }
          />
        )}

        {level === "low" && option.resolvedProductId && (
          <p className="flex items-center gap-1.5 text-sm">
            <CheckCircle2Icon className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span className="truncate font-medium">
              {option.resolvedProductName}
            </span>
          </p>
        )}

        {option.resolvedProductId && (
          <button
            type="button"
            className="text-muted-foreground text-xs underline hover:text-foreground"
            onClick={() =>
              onUpdateOptionProduct(
                comboTempId,
                slotTempId,
                option.tempId,
                "",
                ""
              )
            }
          >
            Cambiar producto
          </button>
        )}
      </div>

      <div className="space-y-1">
        <span className="font-medium text-[10px] text-muted-foreground">
          Recargo
        </span>
        <Input
          type="number"
          value={option.upcharge || ""}
          onChange={(e) =>
            onUpdateOptionUpcharge(
              comboTempId,
              slotTempId,
              option.tempId,
              parseInt(e.target.value, 10) || 0
            )
          }
          placeholder="0"
          className="h-8 w-20 text-sm"
          min={0}
        />
      </div>

      <div className="hidden text-right text-[10px] text-muted-foreground sm:block">
        {Math.round(option.confidence * 100)}%
      </div>
    </div>
  )
}

// ─── Suggestion Select (for medium confidence) ─────────────────────────────

interface SuggestionSelectProps {
  suggestions: Array<{
    productId: string
    productName: string
    price: number
    score: number
  }>
  onSelect: (productId: string, productName: string) => void
}

function SuggestionSelect({ suggestions, onSelect }: SuggestionSelectProps) {
  if (suggestions.length === 0) {
    return (
      <p className="text-muted-foreground text-xs italic">
        Sin sugerencias disponibles
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {suggestions.slice(0, 3).map((s) => (
        <button
          key={s.productId}
          type="button"
          className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent"
          onClick={() => onSelect(s.productId, s.productName)}
        >
          <span className="min-w-0 flex-1 truncate">{s.productName}</span>
          <span className="shrink-0 text-muted-foreground text-xs">
            {formatPrice(s.price)}
          </span>
          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
            {Math.round(s.score * 100)}%
          </Badge>
        </button>
      ))}
    </div>
  )
}

// ─── Manual Product Selector (for low confidence) ──────────────────────────

interface ManualProductSelectorProps {
  products: Array<{
    _id: string
    name: string
    price: number
    categoryName: string
  }>
  onSelect: (productId: string, productName: string) => void
}

function ManualProductSelector({
  products,
  onSelect,
}: ManualProductSelectorProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full max-w-[300px] justify-between font-normal text-sm"
        >
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <SearchIcon className="h-3 w-3" />
            Buscar producto...
          </span>
          <ChevronsUpDownIcon className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar producto..." />
          <CommandList>
            <CommandEmpty>No se encontraron productos</CommandEmpty>
            <CommandGroup>
              {products.map((product) => (
                <CommandItem
                  key={product._id}
                  value={product._id}
                  keywords={[
                    product.name,
                    product.categoryName,
                    String(product.price),
                  ]}
                  onSelect={() => {
                    onSelect(product._id, product.name)
                    setOpen(false)
                  }}
                >
                  <CheckIcon className={cn("mr-2 h-4 w-4 opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">
                    {product.name}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {formatPrice(product.price)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
