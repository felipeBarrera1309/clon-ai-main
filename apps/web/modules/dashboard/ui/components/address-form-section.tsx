"use client"

import { api } from "@workspace/backend/_generated/api"
import { Button } from "@workspace/ui/components/button"
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
  FormMessage,
} from "@workspace/ui/components/form"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@workspace/ui/components/popover"
import SearchInput from "@workspace/ui/components/search-input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import { useAction, useQuery } from "convex/react"
import { HelpCircle, Loader2, MapPin, Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { LocationPreview } from "./location-preview"
import { SchedulePreview } from "./schedule-preview"

interface AddressFormSectionProps {
  form: UseFormReturn<any>
  organizationId?: string
  lastKnownAddress?: string
  initialValidationResult?: AddressValidationResult | null
  onAddressValidated?: (result: AddressValidationResult | null) => void
  suppressInitialFocus?: boolean
}

export type AddressValidationResult = {
  isValid: boolean
  message?: string
  fee?: number
  deliveryArea?: string
  restaurantLocationId?: string
  coordinates?: { lat: number; lng: number }
  validatedAddress?: string
}

export function AddressFormSection({
  form,
  organizationId,
  lastKnownAddress,
  initialValidationResult,
  onAddressValidated,
  suppressInitialFocus = true,
}: AddressFormSectionProps) {
  const [openAddressSuggestions, setOpenAddressSuggestions] = useState(false)
  const [isValidatingAddress, setIsValidatingAddress] = useState(false)
  const [addressCandidates, setAddressCandidates] = useState<any[]>([])
  const [specificAddressResult, setSpecificAddressResult] =
    useState<AddressValidationResult | null>(initialValidationResult || null)
  const [addressValidationResult, setAddressValidationResult] =
    useState<AddressValidationResult | null>(initialValidationResult || null)
  const [isInitialSync, setIsInitialSync] = useState(true)
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync state when initialValidationResult arrives
  useEffect(() => {
    if (initialValidationResult) {
      setAddressValidationResult(initialValidationResult)
      setSpecificAddressResult(initialValidationResult)
      // If we are syncing initial data, we definitely don't want the popover open
      setOpenAddressSuggestions(false)
    }
  }, [initialValidationResult])

  // Prevent auto-focus and auto-popover on mount when suppressed
  useEffect(() => {
    if (suppressInitialFocus && typeof window !== "undefined") {
      const timer = setTimeout(() => {
        // If it captured focus during mount, release it
        if (
          document.activeElement instanceof HTMLInputElement &&
          document.activeElement.placeholder === "Dirección completa..."
        ) {
          document.activeElement.blur()
          setOpenAddressSuggestions(false)
        }
        // Mark initial sync/mount as complete after a short delay
        setIsInitialSync(false)
      }, 100)
      return () => clearTimeout(timer)
    } else {
      // If not suppressed, we are ready immediately
      setIsInitialSync(false)
    }
  }, [suppressInitialFocus])

  const validateAddress = useAction(
    api.private.addressValidation.validateAddress
  )
  const searchAddress = useAction(api.private.addressValidation.searchAddress)
  const restaurantLocations = useQuery(
    api.private.restaurantLocations.list,
    organizationId ? { organizationId } : "skip"
  )

  const watchDeliveryAddress = form.watch("deliveryAddress")
  const watchOrderType = form.watch("orderType")

  // Sync external validation result state if form value matches
  // This helps when editing an existing order with a valid address
  useEffect(() => {
    // If we have coordinates in the form/order (logic handled by parent usually), we could verify validity
    // For now, we rely on the user interacting or the debounce check
  }, [])

  const handleAddressValidation = async (addressOverride?: string) => {
    const addressToValidate = addressOverride || watchDeliveryAddress

    if (
      watchOrderType !== "delivery" ||
      !addressToValidate ||
      addressToValidate.length < 1
    ) {
      setAddressValidationResult(null)
      setAddressCandidates([])
      setSpecificAddressResult(null) // Clear specific result too
      setOpenAddressSuggestions(false)
      return
    }

    setIsValidatingAddress(true)
    setSpecificAddressResult(null) // Proactively clear previous specific results
    try {
      if (!organizationId) {
        setIsValidatingAddress(false)
        return
      }

      // 1. Run Search to get candidates
      const candidates = await searchAddress({
        query: addressToValidate,
        organizationId: organizationId,
      })

      setAddressCandidates(candidates)

      // 2. Also Validate the *current* exact string
      const result = await validateAddress({
        address: addressToValidate,
        organizationId: organizationId,
      })

      if (result.isValid && result.deliveryArea) {
        const validationResult = {
          isValid: true,
          message: `Cobertura: ${result.deliveryArea.name}`,
          fee: result.deliveryArea.deliveryFee,
          deliveryArea: result.deliveryArea.name,
          restaurantLocationId: result.deliveryArea.restaurantLocationId,
          coordinates: result.coordinates,
          validatedAddress: addressToValidate, // Store for comparison
        }
        setSpecificAddressResult(validationResult)
        setOpenAddressSuggestions(true)
      } else {
        setSpecificAddressResult({
          isValid: false,
          message: result.error || "Sin cobertura",
          validatedAddress: addressToValidate,
        })
      }
    } catch (error) {
      console.error("Validation error", error)
      setSpecificAddressResult({ isValid: false, message: "Error validando" })
    } finally {
      setIsValidatingAddress(false)
    }
  }

  if (watchOrderType !== "delivery") return null

  return (
    <FormField
      control={form.control}
      name="deliveryAddress"
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>
            Dirección de Entrega
            {addressValidationResult?.isValid && (
              <span className="ml-2 font-medium text-green-600 text-xs">
                {addressValidationResult.message}
              </span>
            )}
            {!isValidatingAddress &&
              !addressValidationResult?.isValid &&
              specificAddressResult &&
              !specificAddressResult.isValid && (
                <div className="ml-2 inline-flex items-center gap-2">
                  <span className="font-medium text-destructive text-xs">
                    {specificAddressResult.message}
                  </span>
                  <span className="text-muted-foreground text-xs">|</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const manualResult = {
                        isValid: true,
                        message: "Validación manual",
                        fee: 0,
                        deliveryArea: "Manual",
                        // Keep existing coordinates if any, or undefined
                        coordinates: specificAddressResult.coordinates,
                      }
                      setAddressValidationResult(manualResult)
                      setSpecificAddressResult(manualResult)
                      // Notify Parent
                      onAddressValidated?.(manualResult)
                      // Close suggestions
                      setOpenAddressSuggestions(false)
                    }}
                    className="cursor-pointer font-medium text-primary text-xs underline hover:text-primary/80"
                  >
                    Validar manualmente
                  </button>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 cursor-help text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">
                          Usa esta opción solo si la dirección está realmente en
                          zona de cobertura pero el sistema no la detecta
                          automáticamente.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
          </FormLabel>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <Popover
                open={openAddressSuggestions}
                onOpenChange={setOpenAddressSuggestions}
              >
                <PopoverAnchor asChild>
                  <FormControl>
                    <div className="relative flex-1">
                      <SearchInput
                        ref={inputRef}
                        inputProps={{
                          ...field,
                          value: field.value || "",
                          placeholder: "Dirección completa...",
                          autoFocus: false,
                          onChange: (e) => {
                            const newValue = e.target.value
                            const prevValue = field.value || ""

                            field.onChange(e)

                            // Reset only if content changed (ignore leading/trailing spaces)
                            if (newValue.trim() !== prevValue.trim()) {
                              setAddressValidationResult(null)
                              setSpecificAddressResult(null)
                              onAddressValidated?.(null)
                            }

                            if (newValue.length === 0) {
                              setAddressCandidates([])
                              setOpenAddressSuggestions(false)
                            } else if (!openAddressSuggestions) {
                              setOpenAddressSuggestions(true)
                            }
                          },
                          onFocus: () => {
                            setIsFocused(true)
                            // Only open and search if NOT in the initial mount/sync phase
                            if (
                              !isInitialSync &&
                              field.value &&
                              field.value.length > 0
                            ) {
                              setOpenAddressSuggestions(true)
                              handleAddressValidation()
                            }
                          },
                          onBlur: () => {
                            setIsFocused(false)
                          },
                          onClick: () => {
                            if (field.value && field.value.length > 0) {
                              setOpenAddressSuggestions(true)
                              handleAddressValidation()
                            }
                          },
                          onKeyDown: (e) => {
                            if (e.key === "Escape") {
                              setOpenAddressSuggestions(false)
                            }
                            // Proxy Arrows and Enter to Command
                            if (
                              openAddressSuggestions &&
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
                              const commandRoot = document.querySelector(
                                '[data-slot="address-command-root"]'
                              )
                              if (commandRoot) {
                                commandRoot.dispatchEvent(event)
                              }
                            }
                          },
                        }}
                        styleConfigs={{
                          input: cn(
                            !isValidatingAddress &&
                              addressValidationResult &&
                              !addressValidationResult.isValid &&
                              "border-destructive focus-visible:ring-destructive",
                            !isValidatingAddress &&
                              addressValidationResult?.isValid &&
                              "border-green-500 focus-visible:ring-green-500"
                          ),
                        }}
                        clearButtonProps={{
                          onClick: () => {
                            field.onChange("")
                            setAddressValidationResult(null)
                            setSpecificAddressResult(null)
                            setAddressCandidates([])
                            setOpenAddressSuggestions(false)
                            onAddressValidated?.(null)
                          },
                        }}
                        debounce={{
                          delay: 1500,
                          handler: () => {
                            // Only trigger search and open popover if we have focus and NOT in initial sync
                            if (isFocused && !isInitialSync) {
                              handleAddressValidation()
                              setOpenAddressSuggestions(true)
                            }
                          },
                        }}
                      />
                      {isValidatingAddress && (
                        <div className="absolute top-2.5 right-8">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </FormControl>
                </PopoverAnchor>
                <PopoverContent
                  className="p-0"
                  align="start"
                  style={{ width: "var(--radix-popover-trigger-width)" }}
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  onPointerDownOutside={(e) => {
                    if (inputRef.current?.contains(e.target as Node)) {
                      e.preventDefault()
                    }
                  }}
                >
                  <Command
                    data-slot="address-command-root"
                    key={`${specificAddressResult?.validatedAddress || ""}-${addressCandidates.length}-${isValidatingAddress}`}
                  >
                    <CommandList>
                      {isValidatingAddress && (
                        <div className="flex flex-col items-center justify-center gap-2 py-6">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          <p className="animate-pulse text-muted-foreground text-xs">
                            Buscando cobertura y sugerencias...
                          </p>
                        </div>
                      )}
                      {!isValidatingAddress &&
                        !specificAddressResult &&
                        addressCandidates.length === 0 && (
                          <CommandEmpty className="py-6 text-center text-muted-foreground text-xs">
                            Escribe una dirección para ver sugerencias con
                            cobertura.
                          </CommandEmpty>
                        )}
                      {specificAddressResult && (
                        <CommandGroup
                          heading={
                            <span className="font-bold text-[11px] text-primary uppercase tracking-wider">
                              Dirección Específica
                            </span>
                          }
                        >
                          <CommandItem
                            value={specificAddressResult.validatedAddress}
                            disabled={!specificAddressResult.isValid}
                            onSelect={() => {
                              if (!specificAddressResult.isValid) return
                              form.setValue(
                                "deliveryAddress",
                                specificAddressResult.validatedAddress!
                              )
                              setAddressValidationResult(specificAddressResult)
                              onAddressValidated?.(specificAddressResult)
                              setOpenAddressSuggestions(false)
                              toast.success("Dirección específica seleccionada")
                            }}
                            className={cn(
                              "flex cursor-pointer flex-col items-start gap-1 px-4 py-4 transition-all hover:bg-primary/5",
                              !specificAddressResult.isValid
                                ? "opacity-60 grayscale-[0.5]"
                                : "border-primary border-l-2 bg-primary/5"
                            )}
                          >
                            <div className="flex w-full items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                                    specificAddressResult.isValid
                                      ? "bg-green-100 text-green-600"
                                      : "bg-destructive/10 text-destructive"
                                  )}
                                >
                                  <MapPin className="h-4 w-4" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-bold text-sm leading-tight">
                                    {watchDeliveryAddress}
                                  </span>
                                  {specificAddressResult.isValid ? (
                                    <span className="font-semibold text-green-600 text-xs leading-tight">
                                      {specificAddressResult.message}
                                    </span>
                                  ) : (
                                    <span className="font-medium text-destructive text-xs leading-tight">
                                      Completa mejor la dirección.
                                    </span>
                                  )}
                                </div>
                              </div>
                              {specificAddressResult.isValid && (
                                <div className="flex shrink-0 flex-col items-end">
                                  <span className="font-bold text-green-600 text-sm">
                                    ${specificAddressResult.fee}
                                  </span>
                                  <span className="font-medium text-[10px] text-muted-foreground uppercase">
                                    Domicilio
                                  </span>
                                </div>
                              )}
                            </div>
                          </CommandItem>
                        </CommandGroup>
                      )}

                      {addressCandidates.length > 0 && (
                        <CommandGroup
                          heading={
                            <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                              Direcciones con Cobertura
                            </span>
                          }
                        >
                          {addressCandidates.map((candidate, idx) => {
                            const isSelected =
                              candidate.address === watchDeliveryAddress
                            const location = restaurantLocations?.find(
                              (l) =>
                                l._id ===
                                candidate.deliveryArea.restaurantLocationId
                            )
                            return (
                              <CommandItem
                                key={`${candidate.address}-${idx}`}
                                value={candidate.address}
                                onSelect={() => {
                                  form.setValue(
                                    "deliveryAddress",
                                    candidate.address
                                  )
                                  const validationResult = {
                                    isValid: true,
                                    message: `Cobertura: ${candidate.deliveryArea.name}`,
                                    fee: candidate.deliveryArea.deliveryFee,
                                    deliveryArea: candidate.deliveryArea.name,
                                    restaurantLocationId:
                                      candidate.deliveryArea
                                        .restaurantLocationId,
                                    coordinates: candidate.coordinates,
                                    validatedAddress: candidate.address,
                                  }
                                  setAddressValidationResult(validationResult)
                                  setSpecificAddressResult(validationResult)
                                  onAddressValidated?.(validationResult)
                                  setOpenAddressSuggestions(false)
                                  toast.success("Dirección asignada con éxito")
                                }}
                                className="flex cursor-pointer flex-col items-start gap-1 border-muted/50 border-b px-4 py-3 last:border-0"
                              >
                                <div className="flex w-full items-center justify-between">
                                  <span className="font-medium text-sm">
                                    {candidate.address}
                                  </span>
                                  <div className="flex flex-col items-end">
                                    <span className="font-bold text-green-600 text-xs">
                                      ${candidate.deliveryArea.deliveryFee}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex w-full items-center justify-between text-muted-foreground text-xs">
                                  <div className="flex items-center gap-1.5 font-medium">
                                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                    <span>{candidate.deliveryArea.name}</span>
                                  </div>
                                  {location ? (
                                    <div className="flex cursor-help items-center gap-2 rounded bg-muted/50 px-1.5 py-0.5">
                                      <span className="font-medium text-[10px] text-muted-foreground">
                                        {location.name}
                                      </span>
                                      <SchedulePreview
                                        location={location}
                                        compact={true}
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-[10px]">
                                      {candidate.scheduleInfo?.isOpen
                                        ? "🟢 Abierto"
                                        : "🔴 Cerrado"}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {addressValidationResult?.isValid && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpenAddressSuggestions(true)}
                  className="shrink-0"
                >
                  <Search className="mr-2 h-4 w-4" />
                  Buscar
                </Button>
              )}
            </div>

            {lastKnownAddress && lastKnownAddress !== field.value && (
              <div className="flex justify-start">
                <Button
                  type="button"
                  variant="link"
                  className="h-auto flex-col items-start gap-1 p-0 text-muted-foreground text-xs hover:text-primary sm:flex-row"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const value = lastKnownAddress
                    field.onChange(value)

                    // Clear previous results to avoid contamination before new search
                    setAddressValidationResult(null)
                    setSpecificAddressResult(null)
                    setAddressCandidates([])

                    // Focus immediately to take control
                    inputRef.current?.focus()

                    // Give it a micro-tick to ensure RHF and Popover state updates finish
                    setTimeout(() => {
                      inputRef.current?.focus()
                      setOpenAddressSuggestions(true)
                      handleAddressValidation(value)
                    }, 50)
                  }}
                >
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Usar última dirección conocida:
                  </span>
                  <span className="font-medium underline decoration-dotted">
                    {lastKnownAddress}
                  </span>
                </Button>
              </div>
            )}

            {addressValidationResult?.isValid &&
              addressValidationResult.coordinates && (
                <div className="mt-2">
                  <LocationPreview
                    latitude={addressValidationResult.coordinates.lat}
                    longitude={addressValidationResult.coordinates.lng}
                    address={field.value}
                    enableCopy
                  />
                </div>
              )}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
