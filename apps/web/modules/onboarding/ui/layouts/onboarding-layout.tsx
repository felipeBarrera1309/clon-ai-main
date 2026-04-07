"use client"

import { Card, CardContent } from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"
import { Check } from "lucide-react"
import Image from "next/image"
import type * as React from "react"
import { useOrganization } from "@/hooks/use-organization"

interface OnboardingLayoutProps {
  children: React.ReactNode
  currentStep: number
  completedSteps?: number[]
}

const STEPS = [
  { id: 1, title: "Menú" },
  { id: 2, title: "Combos" },
  { id: 3, title: "Sucursales" },
  { id: 4, title: "Zonas de Entrega" },
  { id: 5, title: "Bot" },
  { id: 6, title: "Reglas" },
]

export function OnboardingLayout({
  children,
  currentStep,
  completedSteps = [],
}: OnboardingLayoutProps) {
  const { activeOrganization } = useOrganization()

  return (
    <div className="min-h-screen w-full bg-muted/30">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Image alt="ClonAI" height={32} width={32} src="/logo.svg" />
            <span className="font-semibold text-lg tracking-tight">ClonAI</span>
            <Separator orientation="vertical" className="mx-2 h-4" />
            <span className="text-muted-foreground text-sm">
              {activeOrganization?.name ?? "Configuración de tu Restaurante"}
            </span>
          </div>
          <div className="hidden font-medium text-muted-foreground text-sm md:block">
            Paso {currentStep} de {STEPS.length}
          </div>
        </div>

        <div className="border-t bg-background/50">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-0 sm:gap-1">
                {STEPS.map((step, index) => {
                  const isCompleted =
                    completedSteps.includes(step.id) || currentStep > step.id
                  const isCurrent = currentStep === step.id
                  const isPending = !isCompleted && !isCurrent
                  const isLast = index === STEPS.length - 1

                  return (
                    <div key={step.id} className="flex items-center">
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-full border-2 font-semibold text-xs transition-all duration-200",
                            isCompleted
                              ? "border-primary bg-primary text-primary-foreground"
                              : isCurrent
                                ? "border-primary bg-background text-primary ring-4 ring-primary/20"
                                : "border-muted-foreground/30 bg-background text-muted-foreground"
                          )}
                        >
                          {isCompleted ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            step.id
                          )}
                        </div>
                        <span
                          className={cn(
                            "max-w-[80px] truncate text-center text-xs transition-colors",
                            isCurrent
                              ? "font-medium text-foreground"
                              : isPending
                                ? "text-muted-foreground/60"
                                : "text-muted-foreground"
                          )}
                        >
                          {step.title}
                        </span>
                      </div>
                      {!isLast && (
                        <div
                          className={cn(
                            "mx-1 mb-5 h-0.5 w-6 transition-colors sm:mx-2 sm:w-10 md:w-16",
                            isCompleted
                              ? "bg-primary"
                              : "bg-muted-foreground/30"
                          )}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
        <Card className="border-none shadow-sm ring-1 ring-border/50">
          <CardContent className="p-6 md:p-8">{children}</CardContent>
        </Card>
      </main>
    </div>
  )
}
