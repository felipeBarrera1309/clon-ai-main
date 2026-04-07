"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { useMutation, useQuery } from "convex/react"
import { useAtom } from "jotai"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { menuImportAtom } from "@/modules/onboarding/atoms"
import {
  type CategoriesExtractionResult,
  generateTempId,
  INITIAL_MENU_IMPORT_STATE,
  type MenuImportWizardProps,
  type ProductsExtractionResult,
  type SizesExtractionResult,
  type SubcategoriesExtractionResult,
} from "@/modules/onboarding/types"
import { ExtractionProgress } from "./extraction-progress"
import { FileUploadArea } from "./file-upload-area"
import { TabbedReview } from "./tabbed-review"

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function deduplicateByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const normalized = normalizeName(item.name)
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function safeJsonParse<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

export function MenuImportWizard({
  organizationId,
  onComplete,
  onSkip,
}: MenuImportWizardProps) {
  const [state, setState] = useAtom(menuImportAtom)
  const [isUploading, setIsUploading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const generateUploadUrl = useMutation(
    api.system.menuExtractionPipeline.generateUploadUrl
  )
  const createExtractionJob = useMutation(
    api.system.menuExtractionPipeline.createExtractionJob
  )
  const retryExtractionMutation = useMutation(
    api.system.menuExtractionPipeline.retryExtraction
  )
  const importMenuDataMutation = useMutation(
    api.private.onboarding.importMenuData
  )

  const extractionJob = useQuery(
    api.system.menuExtractionPipeline.getExtractionJob,
    state.extractionJobId
      ? {
          jobId: state.extractionJobId as Id<"menuExtractionJobs">,
        }
      : "skip"
  )

  const handleExtractionComplete = useCallback(() => {
    if (!extractionJob) return

    const categories: CategoriesExtractionResult = safeJsonParse(
      extractionJob.extractedCategories,
      { categories: [] }
    )
    const subcategories: SubcategoriesExtractionResult = safeJsonParse(
      extractionJob.extractedSubcategories,
      { subcategories: [] }
    )
    const sizes: SizesExtractionResult = safeJsonParse(
      extractionJob.extractedSizes,
      { sizes: [] }
    )
    const products: ProductsExtractionResult = safeJsonParse(
      extractionJob.extractedProducts,
      { products: [] }
    )

    const dedupedCategories = deduplicateByName(categories.categories).map(
      (c) => ({
        tempId: generateTempId(),
        name: c.name,
      })
    )

    const dedupedSubcategories = deduplicateByName(
      subcategories.subcategories
    ).map((s) => ({
      tempId: generateTempId(),
      name: s.name,
      categoryTempId:
        dedupedCategories.find(
          (c) => normalizeName(c.name) === normalizeName(s.category)
        )?.tempId ??
        dedupedCategories[0]?.tempId ??
        "",
    }))

    const dedupedSizes = deduplicateByName(sizes.sizes).map((s) => ({
      tempId: generateTempId(),
      name: s.name,
    }))

    const mappedProducts = products.products.map((p) => ({
      tempId: generateTempId(),
      name: p.name,
      description: p.description,
      price: p.price,
      categoryTempId:
        dedupedCategories.find(
          (c) => normalizeName(c.name) === normalizeName(p.category)
        )?.tempId ??
        dedupedCategories[0]?.tempId ??
        "",
      subcategoryTempId: p.subcategory
        ? dedupedSubcategories.find(
            (s) => normalizeName(s.name) === normalizeName(p.subcategory!)
          )?.tempId
        : undefined,
      sizeTempId: p.size
        ? dedupedSizes.find(
            (s) => normalizeName(s.name) === normalizeName(p.size!)
          )?.tempId
        : undefined,
      standAlone: p.standAlone ?? true,
      combinableHalf: p.combinableHalf ?? false,
      combinableWithCategoryTempIds: p.combinableWithCategories
        ?.map(
          (catName) =>
            dedupedCategories.find(
              (c) => normalizeName(c.name) === normalizeName(catName)
            )?.tempId
        )
        .filter((id): id is string => Boolean(id)),
      instructions: p.instructions ?? undefined,
    }))

    setState((prev) => ({
      ...prev,
      phase: "review" as const,
      categories: dedupedCategories,
      subcategories: dedupedSubcategories,
      sizes: dedupedSizes,
      products: mappedProducts,
    }))
  }, [extractionJob, setState])

  useEffect(() => {
    if (
      state.phase === "extracting" &&
      extractionJob?.status === "completed" &&
      state.categories.length === 0
    ) {
      handleExtractionComplete()
    }
  }, [
    extractionJob?.status,
    state.phase,
    state.categories.length,
    handleExtractionComplete,
  ])

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      setIsUploading(true)
      try {
        const storageIds: Id<"_storage">[] = []
        for (const file of files) {
          const uploadUrl = await generateUploadUrl()
          const response = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          })
          if (!response.ok) {
            throw new Error(
              `Error subiendo archivo ${file.name}: ${response.statusText}`
            )
          }
          const { storageId } = await response.json()
          storageIds.push(storageId as Id<"_storage">)
        }

        const jobId = await createExtractionJob({
          organizationId,
          fileStorageIds: storageIds,
        })

        setState((prev) => ({
          ...prev,
          phase: "extracting" as const,
          extractionJobId: jobId,
          uploadedFiles: files.map((f, i) => ({
            name: f.name,
            size: f.size,
            type: f.type,
            storageId: storageIds[i]!,
          })),
        }))
      } catch (error) {
        toast.error("Error al subir los archivos")
        console.error(error)
      } finally {
        setIsUploading(false)
      }
    },
    [generateUploadUrl, createExtractionJob, organizationId, setState]
  )

  const handleManualAdd = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "review" as const,
      categories: [],
      subcategories: [],
      sizes: [],
      products: [],
      uploadedFiles: [],
      extractionJobId: undefined,
    }))
  }, [setState])

  const handleRetry = useCallback(async () => {
    if (state.extractionJobId) {
      await retryExtractionMutation({
        jobId: state.extractionJobId as Id<"menuExtractionJobs">,
      })
    }
  }, [state.extractionJobId, retryExtractionMutation])

  const handleReplaceFiles = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "upload" as const,
      extractionJobId: undefined,
      uploadedFiles: [],
      categories: [],
      subcategories: [],
      sizes: [],
      products: [],
    }))
  }, [setState])

  const handleImport = useCallback(async () => {
    if (!organizationId) {
      toast.error("No se encontró la organización")
      return
    }

    setIsImporting(true)
    try {
      const result = await importMenuDataMutation({
        organizationId,
        categories: state.categories,
        subcategories: state.subcategories,
        sizes: state.sizes,
        products: state.products,
      })

      toast.success(
        `Menú importado: ${result.categoriesCreated} categorías, ${result.productsCreated} productos`
      )
      setState(INITIAL_MENU_IMPORT_STATE)
      onComplete()
    } catch (error) {
      console.error("Error importing menu:", error)
      toast.error("Error al importar el menú")
    } finally {
      setIsImporting(false)
    }
  }, [
    organizationId,
    state.categories,
    state.subcategories,
    state.sizes,
    state.products,
    importMenuDataMutation,
    setState,
    onComplete,
  ])

  const handleAddMoreFiles = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "upload" as const,
      extractionJobId: undefined,
      categories: [],
      subcategories: [],
      sizes: [],
      products: [],
      uploadedFiles: [],
    }))
  }, [setState])

  const handleSkip = useCallback(() => {
    setState(INITIAL_MENU_IMPORT_STATE)
    onSkip()
  }, [setState, onSkip])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-2xl tracking-tight">Importar Menú</h2>
        <p className="text-muted-foreground">
          Sube tu menú en PDF o imagen y nuestro sistema extraerá los datos
          automáticamente.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {state.phase === "upload" && (
            <FileUploadArea
              onFilesSelected={handleFilesSelected}
              onManualAdd={handleManualAdd}
              isUploading={isUploading}
            />
          )}
          {state.phase === "extracting" && (
            <ExtractionProgress
              jobStatus={extractionJob?.status ?? "cleaning"}
              error={extractionJob?.error}
              failedAtStatus={
                extractionJob?.status === "failed"
                  ? (extractionJob.failedAtStage ?? "cleaning")
                  : undefined
              }
              onRetry={handleRetry}
              onReplaceFiles={handleReplaceFiles}
            />
          )}
          {state.phase === "review" && (
            <TabbedReview
              state={state}
              onStateChange={setState}
              onImport={handleImport}
              onAddMoreFiles={handleAddMoreFiles}
              isImporting={isImporting}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={handleSkip}>
          Omitir importación de menú
        </Button>
      </div>
    </div>
  )
}
