"use client"

import { Button } from "@workspace/ui/components/button"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CircleIcon,
  Loader2Icon,
  UploadIcon,
} from "lucide-react"

interface ExtractionProgressProps {
  jobStatus: string
  error?: string
  failedAtStatus?: string
  onRetry: () => void
  onReplaceFiles: () => void
}

const EXTRACTION_STEPS = [
  { key: "cleaning", label: "Limpiando datos" },
  { key: "extracting_categories", label: "Categorías" },
  { key: "extracting_subcategories", label: "Subcategorías" },
  { key: "extracting_sizes", label: "Tamaños" },
  { key: "extracting_products", label: "Productos" },
] as const

type StepKey = (typeof EXTRACTION_STEPS)[number]["key"]

const STATUS_TO_STEP_INDEX: Record<string, number> = {
  cleaning: 0,
  extracting_categories: 1,
  extracting_subcategories: 2,
  extracting_sizes: 3,
  extracting_products: 4,
  completed: 5,
}

function getStepState(
  stepIndex: number,
  currentStepIndex: number,
  isFailed: boolean
): "completed" | "current" | "pending" {
  if (isFailed) {
    if (stepIndex < currentStepIndex) return "completed"
    if (stepIndex === currentStepIndex) return "current"
    return "pending"
  }
  if (stepIndex < currentStepIndex) return "completed"
  if (stepIndex === currentStepIndex) return "current"
  return "pending"
}

export function ExtractionProgress({
  jobStatus,
  error,
  failedAtStatus,
  onRetry,
  onReplaceFiles,
}: ExtractionProgressProps) {
  const isFailed = jobStatus === "failed"
  const currentStepIndex = isFailed
    ? (STATUS_TO_STEP_INDEX[failedAtStatus ?? ""] ?? 0)
    : (STATUS_TO_STEP_INDEX[jobStatus] ?? 0)

  return (
    <div className="flex flex-col items-center py-8">
      <div className="relative mb-8">
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          {isFailed ? (
            <AlertCircleIcon className="h-8 w-8 text-destructive" />
          ) : (
            <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
          )}
        </div>
      </div>

      <h3 className="mb-6 font-semibold text-lg">
        {isFailed ? "Error en la extracción" : "Extrayendo datos del menú..."}
      </h3>

      <div className="w-full max-w-sm space-y-3">
        {EXTRACTION_STEPS.map((step, index) => {
          const state = getStepState(index, currentStepIndex, isFailed)

          return (
            <div key={step.key} className="flex items-center gap-3">
              {state === "completed" && (
                <CheckCircle2Icon className="h-5 w-5 shrink-0 text-primary" />
              )}
              {state === "current" && !isFailed && (
                <Loader2Icon className="h-5 w-5 shrink-0 animate-spin text-primary" />
              )}
              {state === "current" && isFailed && (
                <AlertCircleIcon className="h-5 w-5 shrink-0 text-destructive" />
              )}
              {state === "pending" && (
                <CircleIcon className="h-5 w-5 shrink-0 text-muted-foreground/40" />
              )}
              <span
                className={
                  state === "completed"
                    ? "text-muted-foreground text-sm"
                    : state === "current"
                      ? "font-medium text-sm"
                      : "text-muted-foreground/60 text-sm"
                }
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>

      {isFailed && (
        <div className="mt-6 w-full max-w-sm space-y-4">
          {error && (
            <p className="text-center text-destructive text-sm">{error}</p>
          )}
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={onReplaceFiles}>
              <UploadIcon className="mr-2 h-4 w-4" />
              Subir otro archivo
            </Button>
            <Button onClick={onRetry}>Reintentar</Button>
          </div>
        </div>
      )}
    </div>
  )
}
