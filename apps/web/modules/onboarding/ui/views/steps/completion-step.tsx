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
import { useMutation, useQuery } from "convex/react"
import {
  BotIcon,
  CheckCircle2Icon,
  Loader2Icon,
  MapPinIcon,
  MenuIcon,
  RocketIcon,
  TruckIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

interface CompletionStepProps {
  organizationId: string
  onGoToDashboard: () => void
}

export function CompletionStep({
  organizationId,
  onGoToDashboard,
}: CompletionStepProps) {
  const [isCompleting, setIsCompleting] = useState(false)

  const summary = useQuery(
    api.private.onboarding.getOnboardingSummary,
    organizationId ? { organizationId } : "skip"
  )

  const completeOnboarding = useMutation(
    api.private.onboarding.completeOnboarding
  )

  const handleComplete = async () => {
    if (!organizationId) return

    setIsCompleting(true)

    try {
      await completeOnboarding({
        organizationId,
      })

      toast.success("¡Configuración completada!")
      onGoToDashboard()
    } catch (error) {
      console.error("Error completing onboarding:", error)
      toast.error("Error al completar la configuración")
    } finally {
      setIsCompleting(false)
    }
  }

  const stats = summary?.summary || {
    productsCount: 0,
    locationsCount: 0,
    deliveryAreasCount: 0,
    botCalibrationConfigured: false,
    businessRulesConfigured: false,
  }

  const completedSteps = [
    {
      icon: MenuIcon,
      title: "Menú",
      description: `${stats.productsCount} productos configurados`,
      completed: stats.productsCount > 0,
    },
    {
      icon: MapPinIcon,
      title: "Sucursales",
      description: `${stats.locationsCount} sucursal(es) configurada(s)`,
      completed: stats.locationsCount > 0,
    },
    {
      icon: TruckIcon,
      title: "Zonas de Entrega",
      description: `${stats.deliveryAreasCount} zona(s) configurada(s)`,
      completed: stats.deliveryAreasCount > 0,
    },
    {
      icon: BotIcon,
      title: "Asistente IA",
      description: stats.botCalibrationConfigured
        ? "Personalizado"
        : "Configuración por defecto",
      completed: stats.botCalibrationConfigured,
    },
  ]

  return (
    <div className="min-h-screen w-full bg-muted/30">
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <div className="space-y-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2Icon className="h-10 w-10 text-green-600" />
          </div>

          <div className="space-y-2">
            <h1 className="font-bold text-3xl tracking-tight">
              ¡Todo listo para comenzar!
            </h1>
            <p className="mx-auto max-w-md text-muted-foreground">
              Tu restaurante está configurado y listo para recibir pedidos a
              través de WhatsApp.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Resumen de configuración
              </CardTitle>
              <CardDescription>
                Esto es lo que configuraste durante el onboarding
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {completedSteps.map((step, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 rounded-lg border p-4"
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        step.completed
                          ? "bg-green-100 text-green-600 dark:bg-green-900/30"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <step.icon className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{step.title}</p>
                      <p className="text-muted-foreground text-sm">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
            <CardContent className="flex items-start gap-4 pt-6 text-left">
              <RocketIcon className="mt-0.5 h-6 w-6 shrink-0 text-blue-600" />
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  Próximos pasos
                </p>
                <ul className="mt-2 space-y-1 text-blue-700 text-sm dark:text-blue-300">
                  <li>• Conecta tu número de WhatsApp Business</li>
                  <li>
                    • Personaliza las respuestas del bot en el Prompt Builder
                  </li>
                  <li>
                    • Configura geocercas precisas para tus zonas de entrega
                  </li>
                  <li>• Agrega promociones y combos especiales</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Button
            size="lg"
            onClick={handleComplete}
            disabled={isCompleting}
            className="w-full sm:w-auto"
          >
            {isCompleting ? (
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RocketIcon className="mr-2 h-4 w-4" />
            )}
            Ir al Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}
