"use client"

import type { Id } from "@workspace/backend/_generated/dataModel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@workspace/ui/components/form"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@workspace/ui/components/popover"
import SearchInput from "@workspace/ui/components/search-input"
import { Layers, MessageSquare, Minus, Plus, Trash2 } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { type UseFormReturn, useFieldArray } from "react-hook-form"
import { formatPrice } from "@/lib/currency"
import {
  calculateComboSubtotal,
  calculateComboUnitPrice,
} from "@/lib/order-pricing"
import { normalizeSearchText } from "@/lib/text-utils"

interface Product {
  _id: Id<"menuProducts">
  name: string
  price: number
  description?: string
  categoryName?: string
}

interface OrderItemsSectionProps {
  form: UseFormReturn<any>
  menuProducts: { page: Product[] } | undefined
}

export function OrderItemsSection({
  form,
  menuProducts,
}: OrderItemsSectionProps) {
  const { fields, prepend, remove } = useFieldArray({
    control: form.control,
    name: "items",
  })

  const [searchQuery, setSearchQuery] = useState("")
  const [localSearchValue, setLocalSearchValue] = useState("")
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)

  const watchItems = form.watch("items")

  const filteredProducts = useMemo(() => {
    if (!menuProducts?.page || !searchQuery) return []
    const normalizedQuery = normalizeSearchText(searchQuery)
    return menuProducts.page.filter(
      (p) =>
        normalizeSearchText(p.name).includes(normalizedQuery) ||
        (p.categoryName &&
          normalizeSearchText(p.categoryName).includes(normalizedQuery))
    )
  }, [menuProducts, searchQuery])

  const updateQuantity = (index: number, delta: number) => {
    const currentQty = form.getValues(`items.${index}.quantity`)
    const newQty = Math.max(1, currentQty + delta)
    form.setValue(`items.${index}.quantity`, newQty, { shouldDirty: true })
  }

  const handleAddProduct = (product: Product) => {
    // Check if product already exists to increment quantity instead?
    const existingIndex = watchItems.findIndex(
      (item: any) => item.menuProduct === product._id && !item.notes
    )

    if (existingIndex > -1) {
      updateQuantity(existingIndex, 1)
    } else {
      prepend({ menuProduct: product._id, quantity: 1, notes: "" })
    }

    setLocalSearchValue("")
    setSearchQuery("")
    setIsSearchOpen(false)

    // Restore focus to search input
    searchInputRef.current?.focus()
    // Force focus again after a tick to ensure it sticks after state updates
    setTimeout(() => {
      searchInputRef.current?.focus()
    }, 0)
  }

  const calculateItemSubtotal = (index: number) => {
    const item = watchItems[index]
    if (!item) return 0

    if (item.itemType === "combo") {
      return calculateComboSubtotal({
        comboBasePrice: item.comboBasePrice,
        comboSlotSelections: item.comboSlotSelections,
        quantity: item.quantity,
      })
    }

    if (!menuProducts?.page) return 0
    const product = menuProducts.page.find((p) => p._id === item.menuProduct)
    return (product?.price || 0) * item.quantity
  }

  return (
    <Card className="flex flex-col gap-2 overflow-hidden border-none shadow-sm ring-1 ring-border">
      <CardHeader className="sticky top-0 z-10 flex flex-col gap-4 bg-background px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-1">
          <CardTitle className="text-lg">Productos</CardTitle>
          <p className="text-muted-foreground text-xs">
            {fields.length} {fields.length === 1 ? "artículo" : "artículos"}{" "}
            agregados
          </p>
        </div>

        <div className="w-full sm:max-w-[300px]">
          <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
            <PopoverAnchor asChild>
              <div className="w-full">
                <SearchInput
                  ref={searchInputRef}
                  inputProps={{
                    value: localSearchValue,
                    autoComplete: "off",
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                      const val = e.target.value
                      setLocalSearchValue(val)
                      if (!isSearchOpen && val.length > 0) {
                        setIsSearchOpen(true)
                      }
                      if (val.length === 0) {
                        setIsSearchOpen(false)
                        setSearchQuery("")
                      }
                    },
                    onFocus: () => {
                      if (localSearchValue.length > 0) {
                        setIsSearchOpen(true)
                      }
                    },
                    onClick: () => {
                      if (localSearchValue.length > 0) {
                        setIsSearchOpen(true)
                      }
                    },
                    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Escape") {
                        setIsSearchOpen(false)
                      }
                      // Proxy Arrows and Enter to Command
                      if (
                        isSearchOpen &&
                        ["ArrowUp", "ArrowDown", "Enter"].includes(e.key)
                      ) {
                        e.preventDefault()
                        const event = new KeyboardEvent("keydown", {
                          key: e.key,
                          code: e.code,
                          keyCode: e.keyCode,
                          which: e.which,
                          bubbles: true,
                          cancelable: true,
                        })
                        // Find the Command root and dispatch
                        const commandRoot = document.querySelector(
                          '[data-slot="command-root"]'
                        )
                        if (commandRoot) {
                          commandRoot.dispatchEvent(event)
                        }
                      }
                    },
                    placeholder: "Buscar producto...",
                    className: "h-9",
                  }}
                  clearButtonProps={{
                    onClick: (e: React.MouseEvent) => {
                      e.preventDefault()
                      setLocalSearchValue("")
                      setSearchQuery("")
                      setIsSearchOpen(false)
                      searchInputRef.current?.focus()
                    },
                  }}
                  debounce={{
                    delay: 350,
                    handler: () => setSearchQuery(localSearchValue),
                  }}
                />
              </div>
            </PopoverAnchor>
            <PopoverContent
              className="w-[350px] max-w-[calc(100vw-32px)] p-0 shadow-2xl"
              align="end"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onPointerDownOutside={(e) => {
                // Prevent popover from closing when clicking the input/anchor
                if (searchInputRef.current?.contains(e.target as Node)) {
                  e.preventDefault()
                }
              }}
            >
              <Command
                shouldFilter={false}
                className="border-none"
                data-slot="command-root"
              >
                <CommandList className="max-h-[300px]" data-slot="command-list">
                  {searchQuery.length > 0 && filteredProducts.length === 0 && (
                    <CommandEmpty className="py-6 text-center text-muted-foreground text-sm">
                      No se encontraron productos
                    </CommandEmpty>
                  )}
                  {searchQuery.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground text-xs">
                      Comienza a escribir para buscar...
                    </div>
                  )}
                  <CommandGroup>
                    {filteredProducts.map((product) => (
                      <CommandItem
                        key={product._id}
                        onSelect={() => handleAddProduct(product)}
                        className="flex cursor-pointer items-center justify-between p-3"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{product.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {product.categoryName}
                          </span>
                        </div>
                        <span className="font-semibold text-primary">
                          {formatPrice(product.price)}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {fields.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-5">
            <h3 className="font-semibold text-lg text-muted-foreground">
              Tu pedido está vacío
            </h3>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {fields.map((field, index) => {
              const item = watchItems[index]
              const isCombo = item?.itemType === "combo"

              if (isCombo) {
                const unitPrice = calculateComboUnitPrice({
                  comboBasePrice: item.comboBasePrice,
                  comboSlotSelections: item.comboSlotSelections,
                })

                return (
                  <div
                    key={field.id}
                    className="group transition-colors hover:bg-muted/30"
                  >
                    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-2">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold text-sm sm:text-base">
                            {item.comboName}
                          </span>
                          <Badge
                            variant="outline"
                            className="gap-1 border-primary/30 bg-primary/5 text-[10px] text-primary"
                          >
                            <Layers className="h-2.5 w-2.5" />
                            Combo
                          </Badge>
                        </div>
                        {item.comboSlotSelections &&
                          item.comboSlotSelections.length > 0 && (
                            <span className="text-[10px] text-muted-foreground italic sm:text-xs">
                              {item.comboSlotSelections
                                .map(
                                  (sel: {
                                    slotName: string
                                    productName: string
                                    quantity?: number
                                  }) =>
                                    `${sel.slotName}: ${sel.productName}${(sel.quantity ?? 1) > 1 ? ` x${sel.quantity}` : ""}`
                                )
                                .join(", ")}
                            </span>
                          )}
                        <span className="text-[10px] text-muted-foreground italic sm:text-xs">
                          {formatPrice(unitPrice)} c/u
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-4 sm:justify-end">
                        <div className="flex items-center gap-1 rounded-full border bg-background p-1 shadow-sm">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => updateQuantity(index, -1)}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>

                          <FormField
                            control={form.control}
                            name={`items.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem className="space-y-0">
                                <FormControl>
                                  <input
                                    {...field}
                                    type="number"
                                    className="w-8 bg-transparent text-center font-bold text-xs outline-none [appearance:textfield] sm:w-10 sm:text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    min="1"
                                    onChange={(e) => {
                                      const val =
                                        parseInt(e.target.value, 10) || 1
                                      field.onChange(Math.max(1, val))
                                    }}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => updateQuantity(index, 1)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        <div className="flex items-center gap-3 sm:w-24 sm:flex-col sm:items-end sm:gap-1">
                          <span className="font-bold text-primary text-sm sm:text-base">
                            {formatPrice(calculateItemSubtotal(index))}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="h-7 w-7 rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => remove(index)}
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="px-4 pt-1 pb-4 sm:px-6">
                      <FormField
                        control={form.control}
                        name={`items.${index}.notes`}
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between">
                            <FormLabel className="flex items-center gap-1.5 font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                              <MessageSquare className="h-3 w-3" />
                              Notas del combo
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="h-9 border-dashed bg-background focus-visible:ring-1"
                                placeholder="Ej: Sin cebolla, extra salsa..."
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )
              }

              const product = menuProducts?.page.find(
                (p) => p._id === item?.menuProduct
              )
              if (!product) return null

              return (
                <div
                  key={field.id}
                  className="group transition-colors hover:bg-muted/30"
                >
                  <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-2">
                    {/* Info */}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-sm sm:text-base">
                          {product.name}
                        </span>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-tight">
                          {product.categoryName}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground italic sm:text-xs">
                        {formatPrice(product.price)} c/u
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      {/* Quantity Control */}
                      <div className="flex items-center gap-1 rounded-full border bg-background p-1 shadow-sm">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => updateQuantity(index, -1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>

                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem className="space-y-0">
                              <FormControl>
                                <input
                                  {...field}
                                  type="number"
                                  className="w-8 bg-transparent text-center font-bold text-xs outline-none [appearance:textfield] sm:w-10 sm:text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  min="1"
                                  onChange={(e) => {
                                    const val =
                                      parseInt(e.target.value, 10) || 1
                                    field.onChange(Math.max(1, val))
                                  }}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => updateQuantity(index, 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Subtotal & Actions */}
                      <div className="flex items-center gap-3 sm:w-24 sm:flex-col sm:items-end sm:gap-1">
                        <span className="font-bold text-primary text-sm sm:text-base">
                          {formatPrice(calculateItemSubtotal(index))}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7 rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => remove(index)}
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notes Area */}
                  <div className="px-4 pt-1 pb-4 sm:px-6">
                    <FormField
                      control={form.control}
                      name={`items.${index}.notes`}
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="flex items-center gap-1.5 font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                            <MessageSquare className="h-3 w-3" />
                            Notas del producto
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="h-9 border-dashed bg-background focus-visible:ring-1"
                              placeholder="Ej: Sin cebolla, extra salsa..."
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
