"use client"

import { Loader2Icon, SparklesIcon } from "lucide-react"

interface ExtractionLoadingProps {
  message?: string
}

export function ExtractionLoading({
  message = "Analizando documento con IA...",
}: ExtractionLoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <SparklesIcon className="h-4 w-4" />
        <span>{message}</span>
      </div>
    </div>
  )
}
