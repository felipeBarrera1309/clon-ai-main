"use client"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { InfoIcon, PlusIcon, TrashIcon } from "lucide-react"
import { useId } from "react"
import {
  type FollowUpStep,
  MAX_DELAY_MINUTES,
  MAX_FOLLOW_UP_STEPS,
  MAX_MESSAGE_LENGTH,
  MIN_DELAY_MINUTES,
} from "../../constants"

type Props = {
  sequence: FollowUpStep[]
  onChange: (sequence: FollowUpStep[]) => void
  disabled?: boolean
}

function getStepKey(step: FollowUpStep, index: number): string {
  return `step-${index}-${step.delayMinutes}`
}

export function FollowUpSequenceBuilder({
  sequence,
  onChange,
  disabled,
}: Props) {
  const componentId = useId()
  const safeSequence = sequence ?? []

  const addStep = () => {
    if (safeSequence.length >= MAX_FOLLOW_UP_STEPS) return
    const lastDelay =
      safeSequence.length > 0
        ? (safeSequence[safeSequence.length - 1]?.delayMinutes ?? 0)
        : 0
    onChange([
      ...safeSequence,
      { delayMinutes: lastDelay + 5, messageTemplate: "" },
    ])
  }

  const removeStep = (index: number) => {
    if (safeSequence.length <= 1) return
    onChange(safeSequence.filter((_, i) => i !== index))
  }

  const updateStep = (
    index: number,
    field: keyof FollowUpStep,
    value: string | number
  ) => {
    const newSequence = [...safeSequence]
    const currentStep = newSequence[index]
    if (!currentStep) return

    if (field === "delayMinutes") {
      const numValue =
        typeof value === "string"
          ? parseInt(value, 10) || MIN_DELAY_MINUTES
          : value
      newSequence[index] = {
        ...currentStep,
        delayMinutes: Math.max(
          MIN_DELAY_MINUTES,
          Math.min(MAX_DELAY_MINUTES, numValue)
        ),
      }
    } else {
      const strValue =
        typeof value === "string"
          ? value.slice(0, MAX_MESSAGE_LENGTH)
          : String(value)
      newSequence[index] = { ...currentStep, messageTemplate: strValue }
    }
    onChange(newSequence)
  }

  const getValidationError = (index: number): string | null => {
    const step = safeSequence[index]
    if (!step) return null

    if (step.delayMinutes < MIN_DELAY_MINUTES) {
      return `Mínimo ${MIN_DELAY_MINUTES} minuto`
    }

    if (index > 0) {
      const prevStep = safeSequence[index - 1]
      if (prevStep && step.delayMinutes <= prevStep.delayMinutes) {
        return "Debe ser mayor que el paso anterior"
      }
    }

    if (!step.messageTemplate.trim()) {
      return "El mensaje es requerido"
    }

    return null
  }

  return (
    <div className="space-y-4">
      <Alert className="border-blue-200 bg-blue-50">
        <InfoIcon className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          Puedes usar{" "}
          <code className="rounded bg-blue-100 px-1">{"{customerName}"}</code> y{" "}
          <code className="rounded bg-blue-100 px-1">{"{restaurantName}"}</code>{" "}
          en tus mensajes. El último paso siempre cierra la conversación.
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        {safeSequence.map((step, index) => {
          const error = getValidationError(index)
          const isLastStep = index === safeSequence.length - 1
          const stepKey = `${componentId}-${getStepKey(step, index)}`

          return (
            <Card key={stepKey} className={error ? "border-red-300" : ""}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-4">
                  <div className="flex w-16 shrink-0 flex-col items-center">
                    <span className="font-medium text-muted-foreground text-sm">
                      Paso {index + 1}
                    </span>
                    {isLastStep && (
                      <span className="mt-1 text-center text-amber-600 text-xs">
                        (Cierra chat)
                      </span>
                    )}
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="w-16 shrink-0">Esperar</Label>
                      <Input
                        type="number"
                        min={MIN_DELAY_MINUTES}
                        max={MAX_DELAY_MINUTES}
                        value={step.delayMinutes}
                        onChange={(e) =>
                          updateStep(index, "delayMinutes", e.target.value)
                        }
                        className="w-20"
                        disabled={disabled}
                      />
                      <span className="text-muted-foreground text-sm">
                        {step.delayMinutes === 1 ? "minuto" : "minutos"} desde
                        el último mensaje del cliente
                      </span>
                    </div>

                    <div>
                      <Label>Mensaje</Label>
                      <Textarea
                        value={step.messageTemplate}
                        onChange={(e) =>
                          updateStep(index, "messageTemplate", e.target.value)
                        }
                        placeholder={
                          isLastStep
                            ? "Ej: Chat cerrado. ¡Escríbeme cuando quieras!"
                            : "Ej: ¿Sigues ahí, {customerName}? 😊"
                        }
                        rows={2}
                        disabled={disabled}
                        className={
                          !step.messageTemplate.trim() ? "border-red-300" : ""
                        }
                      />
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">
                          {step.messageTemplate.length}/{MAX_MESSAGE_LENGTH}
                        </span>
                        {error && (
                          <span className="text-red-600 text-xs">{error}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {safeSequence.length > 1 && !disabled && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeStep(index)}
                      aria-label={`Eliminar paso ${index + 1}`}
                      className="shrink-0 text-destructive hover:text-destructive"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {safeSequence.length < MAX_FOLLOW_UP_STEPS && !disabled && (
        <Button variant="outline" onClick={addStep} className="w-full">
          <PlusIcon className="mr-2 h-4 w-4" />
          Agregar paso
        </Button>
      )}

      {safeSequence.length >= MAX_FOLLOW_UP_STEPS && (
        <p className="text-center text-muted-foreground text-sm">
          Máximo {MAX_FOLLOW_UP_STEPS} pasos permitidos
        </p>
      )}
    </div>
  )
}
