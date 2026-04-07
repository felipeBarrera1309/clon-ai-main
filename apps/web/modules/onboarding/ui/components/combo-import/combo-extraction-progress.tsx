"use client"

import { Button } from "@workspace/ui/components/button"
import { AlertCircleIcon, Loader2Icon, UploadIcon } from "lucide-react"

interface ComboExtractionProgressProps {
  status: string
  error?: string
  onRetry: () => void
  onReplace: () => void
}

export function ComboExtractionProgress({
  status,
  error,
  onRetry,
  onReplace,
}: ComboExtractionProgressProps) {
  const isFailed = status === "failed"

  return (
    <div className="flex flex-col items-center py-8">
      <div className="relative mb-8">
        {!isFailed && (
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        )}
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          {isFailed ? (
            <AlertCircleIcon className="h-8 w-8 text-destructive" />
          ) : (
            <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
          )}
        </div>
      </div>

      <h3 className="mb-2 font-semibold text-lg">
        {isFailed ? "Error en la extracción" : "Analizando documento..."}
      </h3>

      <p className="mb-6 max-w-sm text-center text-muted-foreground text-sm">
        {isFailed
          ? "No se pudieron extraer los combos del documento."
          : "Estamos extrayendo los combos de tu documento. Esto puede tardar unos segundos."}
      </p>

      {isFailed && (
        <div className="w-full max-w-sm space-y-4">
          {error && (
            <p className="text-center text-destructive text-sm">{error}</p>
          )}
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={onReplace}>
              <UploadIcon className="mr-2 h-4 w-4" />
              Reemplazar archivo
            </Button>
            <Button onClick={onRetry}>Reintentar</Button>
          </div>
        </div>
      )}
    </div>
  )
}
