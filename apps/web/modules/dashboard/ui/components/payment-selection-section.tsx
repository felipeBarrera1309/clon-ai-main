"use client"

import { Button } from "@workspace/ui/components/button"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { HelpCircle, Split, X } from "lucide-react"
import { useEffect, useMemo } from "react"
import { type UseFormReturn, useFieldArray } from "react-hook-form"

export type PaymentMethodType =
  | "cash"
  | "card"
  | "payment_link"
  | "bank_transfer"
  | "corporate_credit"
  | "gift_voucher"
  | "sodexo_voucher"
  | "dynamic_payment_link"

export interface PaymentMethodOption {
  method: PaymentMethodType
  amount?: number
}

interface PaymentSelectionSectionProps {
  form: UseFormReturn<any>
  enabledPaymentMethods: string[]
  total: number
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  payment_link: "Link de Pago",
  bank_transfer: "Transferencia",
  corporate_credit: "Crédito corporativo",
  gift_voucher: "Bono de regalo",
  sodexo_voucher: "Bono Sodexo",
  dynamic_payment_link: "Link de Pago Dinámico",
}

const COMBINABLE_METHODS: PaymentMethodType[] = [
  "cash",
  "card",
  "corporate_credit",
  "gift_voucher",
  "sodexo_voucher",
]

export function PaymentSelectionSection({
  form,
  enabledPaymentMethods,
  total,
}: PaymentSelectionSectionProps) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "paymentMethods",
  })

  const watchPaymentMethods = form.watch("paymentMethods") || []
  const isSplit = watchPaymentMethods.length > 1

  const method0 = form.watch("paymentMethods.0.method")
  const method1 = form.watch("paymentMethods.1.method")

  useEffect(() => {
    if (fields.length === 0 && enabledPaymentMethods.length > 0) {
      append({
        method: enabledPaymentMethods[0] as PaymentMethodType,
        amount: total,
      })
    }
  }, [fields.length, enabledPaymentMethods, append, total])

  useEffect(() => {
    if (
      watchPaymentMethods.length === 1 &&
      watchPaymentMethods[0].amount !== total
    ) {
      form.setValue("paymentMethods.0.amount", total, { shouldValidate: true })
    }
  }, [total, watchPaymentMethods.length, watchPaymentMethods[0]?.amount, form])

  const canSplit = useMemo(() => {
    if (isSplit) return false
    if (!method0) return false
    if (total < 2) return false
    return COMBINABLE_METHODS.includes(method0 as PaymentMethodType)
  }, [isSplit, method0, total])

  const availableForSecond = useMemo(() => {
    if (!method0) return []
    return enabledPaymentMethods.filter(
      (m) =>
        COMBINABLE_METHODS.includes(m as PaymentMethodType) && m !== method0
    )
  }, [enabledPaymentMethods, method0])

  const handleAmountChange = (index: number, value: string) => {
    const amount = parseFloat(value) || 0
    const otherIndex = index === 0 ? 1 : 0

    if (isSplit) {
      const clampedAmount = Math.max(1, Math.min(amount, total - 1))
      const remaining = total - clampedAmount

      form.setValue(`paymentMethods.${index}.amount`, clampedAmount, {
        shouldValidate: true,
      })
      form.setValue(`paymentMethods.${otherIndex}.amount`, remaining, {
        shouldValidate: true,
      })
    }
  }

  const handleAddSplit = () => {
    if (!canSplit || availableForSecond.length === 0) return
    const half = Math.max(1, Math.min(Math.floor(total / 2), total - 1))
    form.setValue("paymentMethods.0.amount", total - half, {
      shouldValidate: true,
    })
    append({
      method: availableForSecond[0] as PaymentMethodType,
      amount: half,
    })
  }

  const handleRemoveSplit = () => {
    remove(1)
    form.setValue("paymentMethods.0.amount", total, { shouldValidate: true })
  }

  return (
    <TooltipProvider>
      <FormItem>
        <FormLabel className="font-medium text-sm leading-none">
          Método de Pago
        </FormLabel>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="group relative flex items-start gap-1"
            >
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <FormField
                    control={form.control}
                    name={`paymentMethods.${index}.method`}
                    render={({ field: selectField }) => (
                      <FormItem>
                        <Select
                          onValueChange={(val) => {
                            selectField.onChange(val)
                            if (
                              index === 0 &&
                              !COMBINABLE_METHODS.includes(
                                val as PaymentMethodType
                              ) &&
                              isSplit
                            ) {
                              handleRemoveSplit()
                            }
                          }}
                          value={selectField.value}
                        >
                          <FormControl>
                            <SelectTrigger className="h-9 bg-background text-xs">
                              <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {enabledPaymentMethods
                              .filter((m) => {
                                const mType = m as PaymentMethodType
                                if (index === 0)
                                  return !isSplit || m !== method1
                                return (
                                  COMBINABLE_METHODS.includes(mType) &&
                                  m !== method0
                                )
                              })
                              .map((m) => (
                                <SelectItem
                                  key={m}
                                  value={m}
                                  className="text-xs"
                                >
                                  {
                                    PAYMENT_METHOD_LABELS[
                                      m as PaymentMethodType
                                    ]
                                  }
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>

                {index === 0 && (
                  <div className="flex items-center gap-1.5">
                    {!COMBINABLE_METHODS.includes(
                      method0 as PaymentMethodType
                    ) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="cursor-help transition-opacity hover:opacity-80"
                          >
                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="max-w-[200px] text-xs">
                            Este método no permite dividirse con otros métodos
                            de pago.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {canSplit && availableForSecond.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="flex h-9 shrink-0 items-center gap-1.5 border-dashed px-3 font-medium text-[11px] text-primary transition-colors hover:border-primary/50 hover:bg-primary/5"
                            onClick={handleAddSplit}
                          >
                            <Split className="h-3.5 w-3.5" />
                            Dividir
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">
                            La división está sujeta a que el método seleccionado
                            sea combinable.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>

              {isSplit && (
                <div className="fade-in slide-in-from-left-2 mt-0.5 flex max-w-fit flex-1 animate-in items-center gap-1 duration-200">
                  <span className="mt-0.5 text-muted-foreground text-xs">
                    $
                  </span>
                  <FormField
                    control={form.control}
                    name={`paymentMethods.${index}.amount`}
                    render={({ field: inputField }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input
                            type="number"
                            className="h-8 border-dashed bg-background font-medium text-xs focus-visible:ring-1"
                            value={inputField.value || ""}
                            onChange={(e) =>
                              handleAmountChange(index, e.target.value)
                            }
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {index === 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleRemoveSplit}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <FormMessage />
      </FormItem>
    </TooltipProvider>
  )
}
