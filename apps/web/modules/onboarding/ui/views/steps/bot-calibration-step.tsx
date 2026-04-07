"use client"

import { api } from "@workspace/backend/_generated/api"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import { Switch } from "@workspace/ui/components/switch"
import { useMutation } from "convex/react"
import { ArrowLeftIcon, BotIcon, Loader2Icon, SparklesIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

interface BotCalibrationStepProps {
  organizationId: string
  onComplete: () => void
  onSkip: () => void
  onBack: () => void
}

interface CalibrationData {
  tone: "formal" | "casual" | "friendly" | "professional"
  greetingStyle: "short" | "medium" | "detailed"
  responseLength: "brief" | "detailed"
  upselling: boolean
  promotionMentions: boolean
}

const TONE_OPTIONS = [
  {
    value: "formal",
    label: "Formal",
    description: "Trato de usted, lenguaje profesional",
  },
  {
    value: "casual",
    label: "Casual",
    description: "Trato de tú, lenguaje relajado",
  },
  {
    value: "friendly",
    label: "Amigable",
    description: "Cercano y cálido, con emojis ocasionales",
  },
  {
    value: "professional",
    label: "Profesional",
    description: "Equilibrado entre formal y cercano",
  },
] as const

const GREETING_OPTIONS = [
  {
    value: "short",
    label: "Corto",
    example: "¡Hola! ¿En qué te puedo ayudar?",
  },
  {
    value: "medium",
    label: "Medio",
    example: "¡Hola! Bienvenido a [Restaurante]. ¿Qué te gustaría ordenar hoy?",
  },
  {
    value: "detailed",
    label: "Detallado",
    example:
      "¡Hola! Bienvenido a [Restaurante]. Soy tu asistente virtual y estoy aquí para ayudarte con tu pedido. ¿Te gustaría ver nuestro menú o ya sabes qué ordenar?",
  },
] as const

const RESPONSE_LENGTH_OPTIONS = [
  {
    value: "brief",
    label: "Breve",
    description: "Respuestas concisas y directas",
  },
  {
    value: "detailed",
    label: "Detallado",
    description: "Respuestas más completas con información adicional",
  },
] as const

export function BotCalibrationStep({
  organizationId,
  onComplete,
  onSkip,
  onBack,
}: BotCalibrationStepProps) {
  const [calibration, setCalibration] = useState<CalibrationData>({
    tone: "friendly",
    greetingStyle: "medium",
    responseLength: "brief",
    upselling: true,
    promotionMentions: true,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const completeStep4 = useMutation(
    api.private.onboarding.completeStep4BotCalibration
  )
  const skipStep = useMutation(api.private.onboarding.skipStep)

  const handleConfirm = async () => {
    if (!organizationId) return

    setIsSubmitting(true)

    try {
      await completeStep4({
        organizationId: organizationId,
        calibrationData: calibration,
      })

      toast.success("Configuración del bot guardada")
      onComplete()
    } catch (error) {
      console.error("Error saving calibration:", error)
      toast.error("Error al guardar la configuración")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = async () => {
    if (!organizationId) return
    try {
      await skipStep({
        organizationId: organizationId,
        step: 5,
      })
      onSkip()
    } catch (error) {
      console.error("Error skipping step:", error)
      toast.error("Error al omitir el paso")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-2xl tracking-tight">
          Calibra tu Asistente
        </h2>
        <p className="text-muted-foreground">
          Personaliza cómo tu bot interactúa con los clientes.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BotIcon className="h-5 w-5" />
              Tono de comunicación
            </CardTitle>
            <CardDescription>
              ¿Cómo quieres que el bot se comunique con tus clientes?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={calibration.tone}
              onValueChange={(value) =>
                setCalibration((prev) => ({
                  ...prev,
                  tone: value as CalibrationData["tone"],
                }))
              }
              className="grid gap-3 sm:grid-cols-2"
            >
              {TONE_OPTIONS.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`tone-${option.value}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50 ${
                    calibration.tone === option.value
                      ? "border-primary bg-primary/5"
                      : ""
                  }`}
                >
                  <RadioGroupItem
                    value={option.value}
                    id={`tone-${option.value}`}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="font-medium">{option.label}</p>
                    <p className="text-muted-foreground text-sm">
                      {option.description}
                    </p>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SparklesIcon className="h-5 w-5" />
              Estilo de saludo
            </CardTitle>
            <CardDescription>
              ¿Cómo quieres que el bot salude a los clientes?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={calibration.greetingStyle}
              onValueChange={(value) =>
                setCalibration((prev) => ({
                  ...prev,
                  greetingStyle: value as CalibrationData["greetingStyle"],
                }))
              }
              className="space-y-3"
            >
              {GREETING_OPTIONS.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`greeting-${option.value}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50 ${
                    calibration.greetingStyle === option.value
                      ? "border-primary bg-primary/5"
                      : ""
                  }`}
                >
                  <RadioGroupItem
                    value={option.value}
                    id={`greeting-${option.value}`}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="font-medium">{option.label}</p>
                    <p className="text-muted-foreground text-sm italic">
                      "{option.example}"
                    </p>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Longitud de respuestas</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={calibration.responseLength}
              onValueChange={(value) =>
                setCalibration((prev) => ({
                  ...prev,
                  responseLength: value as CalibrationData["responseLength"],
                }))
              }
              className="grid gap-3 sm:grid-cols-2"
            >
              {RESPONSE_LENGTH_OPTIONS.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`length-${option.value}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50 ${
                    calibration.responseLength === option.value
                      ? "border-primary bg-primary/5"
                      : ""
                  }`}
                >
                  <RadioGroupItem
                    value={option.value}
                    id={`length-${option.value}`}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="font-medium">{option.label}</p>
                    <p className="text-muted-foreground text-sm">
                      {option.description}
                    </p>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Comportamiento de ventas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="upselling" className="font-medium">
                  Sugerir productos adicionales
                </Label>
                <p className="text-muted-foreground text-sm">
                  El bot sugerirá complementos y productos relacionados
                </p>
              </div>
              <Switch
                id="upselling"
                checked={calibration.upselling}
                onCheckedChange={(checked) =>
                  setCalibration((prev) => ({ ...prev, upselling: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="promotions" className="font-medium">
                  Mencionar promociones
                </Label>
                <p className="text-muted-foreground text-sm">
                  El bot informará sobre promociones activas
                </p>
              </div>
              <Switch
                id="promotions"
                checked={calibration.promotionMentions}
                onCheckedChange={(checked) =>
                  setCalibration((prev) => ({
                    ...prev,
                    promotionMentions: checked,
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between pt-4">
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Atrás
          </Button>
          <Button variant="ghost" onClick={handleSkip}>
            Omitir
          </Button>
        </div>
        <Button onClick={handleConfirm} disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
          )}
          Guardar y Continuar
        </Button>
      </div>
    </div>
  )
}
