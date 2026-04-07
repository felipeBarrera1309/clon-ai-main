"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { useMutation, useQuery } from "convex/react"
import { useAtom } from "jotai"
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  FileTextIcon,
  Loader2Icon,
  MessageCircleIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { formatPrice } from "@/lib/currency"
import { handleConvexError } from "@/lib/error-handling"
import { comboImportAtom } from "@/modules/onboarding/atoms"
import {
  type ExtractedComboData,
  generateTempId,
  INITIAL_COMBO_IMPORT_STATE,
} from "@/modules/onboarding/types"
import { ChatComboTab } from "./chat-combo-tab"
import { ComboExtractionProgress } from "./combo-extraction-progress"
import { ComboExtractionReview } from "./combo-extraction-review"
import { ComboFileUpload } from "./combo-file-upload"
import { type ComboData, ManualComboTab } from "./manual-combo-tab"

function safeJsonParse<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

interface ComboImportWizardProps {
  organizationId: string
  onComplete: () => void
  onSkip: () => void
  onBack: () => void
}

export function ComboImportWizard({
  organizationId,
  onComplete,
  onSkip,
  onBack,
}: ComboImportWizardProps) {
  const [comboToDelete, setComboToDelete] = useState<{
    id: Id<"combos">
    name: string
  } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)
  const [editingComboId, setEditingComboId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("pdf")
  const [isUploading, setIsUploading] = useState(false)

  // ─── PDF extraction state machine ────────────────────────────────────
  const [comboImportState, setComboImportState] = useAtom(comboImportAtom)

  const generateUploadUrl = useMutation(
    api.system.comboExtractionPipeline.generateUploadUrl
  )
  const createComboExtractionJob = useMutation(
    api.system.comboExtractionPipeline.createComboExtractionJob
  )
  const retryComboExtractionMutation = useMutation(
    api.system.comboExtractionPipeline.retryComboExtraction
  )

  const extractionJob = useQuery(
    api.system.comboExtractionPipeline.getComboExtractionJob,
    comboImportState.extractionJobId
      ? {
          jobId: comboImportState.extractionJobId as Id<"comboExtractionJobs">,
        }
      : "skip"
  )

  const menuProducts = useQuery(
    api.private.menuProducts.list,
    organizationId
      ? { organizationId, paginationOpts: { numItems: 1, cursor: null } }
      : "skip"
  )
  const hasProducts = (menuProducts?.page?.length ?? 0) > 0

  const combos = useQuery(
    api.private.combos.list,
    organizationId ? { organizationId } : "skip"
  )

  const removeCombo = useMutation(api.private.combos.remove)
  const completeStep2Combos = useMutation(
    api.private.onboarding.completeStep2Combos
  )
  const skipStep = useMutation(api.private.onboarding.skipStep)

  const handleExtractionComplete = useCallback(() => {
    if (!extractionJob?.extractedCombos) return

    const parsed = safeJsonParse<{
      combos: Array<{
        name: string
        description: string
        basePrice: number
        slots: Array<{
          name: string
          minSelections: number
          maxSelections: number
          options: Array<{
            productName: string
            upcharge: number
            isDefault: boolean
          }>
        }>
      }>
    }>(extractionJob.extractedCombos, { combos: [] })

    const extractedCombos: ExtractedComboData[] = parsed.combos.map((c) => ({
      tempId: generateTempId(),
      name: c.name,
      description: c.description,
      basePrice: c.basePrice,
      slots: c.slots.map((s) => ({
        tempId: generateTempId(),
        name: s.name,
        minSelections: s.minSelections,
        maxSelections: s.maxSelections,
        options: s.options.map((o) => ({
          tempId: generateTempId(),
          productName: o.productName,
          upcharge: o.upcharge,
          isDefault: o.isDefault,
        })),
      })),
    }))

    setComboImportState((prev) => ({
      ...prev,
      phase: "review" as const,
      extractedCombos,
    }))
  }, [extractionJob, setComboImportState])

  useEffect(() => {
    if (
      comboImportState.phase === "extracting" &&
      extractionJob?.status === "completed" &&
      comboImportState.extractedCombos.length === 0
    ) {
      handleExtractionComplete()
    }
  }, [
    extractionJob?.status,
    comboImportState.phase,
    comboImportState.extractedCombos.length,
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

        const jobId = await createComboExtractionJob({
          organizationId,
          fileStorageIds: storageIds,
        })

        setComboImportState((prev) => ({
          ...prev,
          phase: "extracting" as const,
          extractionJobId: jobId,
        }))
      } catch (error) {
        toast.error("Error al subir los archivos")
        console.error(error)
      } finally {
        setIsUploading(false)
      }
    },
    [
      generateUploadUrl,
      createComboExtractionJob,
      organizationId,
      setComboImportState,
    ]
  )

  const handleRetryExtraction = useCallback(async () => {
    if (comboImportState.extractionJobId) {
      await retryComboExtractionMutation({
        jobId: comboImportState.extractionJobId as Id<"comboExtractionJobs">,
      })
    }
  }, [comboImportState.extractionJobId, retryComboExtractionMutation])

  const handleReplaceFile = useCallback(() => {
    setComboImportState(INITIAL_COMBO_IMPORT_STATE)
  }, [setComboImportState])

  const handleImportComplete = useCallback(() => {
    setComboImportState(INITIAL_COMBO_IMPORT_STATE)
  }, [setComboImportState])

  const handleDiscardExtraction = useCallback(() => {
    setComboImportState(INITIAL_COMBO_IMPORT_STATE)
  }, [setComboImportState])

  const handleDeleteCombo = async () => {
    if (!comboToDelete) return
    setIsDeleting(true)
    try {
      await removeCombo({
        organizationId,
        comboId: comboToDelete.id,
      })
      toast.success(`Combo "${comboToDelete.name}" eliminado`)
      setComboToDelete(null)
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleComplete = async () => {
    setIsCompleting(true)
    try {
      await completeStep2Combos({ organizationId })
      onComplete()
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsCompleting(false)
    }
  }

  const handleSkip = async () => {
    setIsSkipping(true)
    try {
      await skipStep({
        organizationId,
        step: 2,
      })
      onSkip()
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsSkipping(false)
    }
  }

  const comboCount = combos?.length ?? 0

  const editingCombo = useMemo<ComboData | null>(() => {
    if (!editingComboId || !combos) return null
    return (combos.find((c) => c._id === editingComboId) as ComboData) ?? null
  }, [editingComboId, combos])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-2xl tracking-tight">
          Configura tus Combos
        </h2>
        <p className="text-muted-foreground">
          Crea combos agrupando productos de tu menú. Puedes subir un PDF,
          crearlos manualmente o usar el asistente de IA.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        <div className="space-y-4">
          {!hasProducts && menuProducts !== undefined && (
            <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
              <CardContent className="flex items-start gap-3 pt-6">
                <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-900 dark:text-amber-100">
                    No hay productos en tu menú
                  </p>
                  <p className="text-amber-700 text-sm dark:text-amber-300">
                    Para crear combos necesitas productos del menú. Puedes
                    volver al paso anterior para añadir productos, o saltar este
                    paso.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 border-amber-300 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-950/40"
                    onClick={onBack}
                  >
                    <ArrowLeftIcon className="mr-1.5 h-3.5 w-3.5" />
                    Volver al Menú
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <div
                className={
                  !hasProducts && menuProducts !== undefined
                    ? "pointer-events-none opacity-40"
                    : ""
                }
              >
                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="w-full"
                >
                  <TabsList className="w-full">
                    <TabsTrigger value="pdf" className="gap-1.5">
                      <FileTextIcon className="h-4 w-4" />
                      Subir PDF
                    </TabsTrigger>
                    <TabsTrigger value="manual" className="gap-1.5">
                      <PlusIcon className="h-4 w-4" />
                      Crear Manual
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="gap-1.5">
                      <MessageCircleIcon className="h-4 w-4" />
                      Chat con Asistente
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="pdf">
                    {(comboImportState.phase === "idle" ||
                      comboImportState.phase === "upload") && (
                      <ComboFileUpload
                        onFilesSelected={handleFilesSelected}
                        isUploading={isUploading}
                      />
                    )}
                    {comboImportState.phase === "extracting" && (
                      <ComboExtractionProgress
                        status={extractionJob?.status ?? "processing"}
                        error={extractionJob?.error}
                        onRetry={handleRetryExtraction}
                        onReplace={handleReplaceFile}
                      />
                    )}
                    {comboImportState.phase === "review" && (
                      <ComboExtractionReview
                        extractedCombos={comboImportState.extractedCombos}
                        organizationId={organizationId}
                        onImportComplete={handleImportComplete}
                        onDiscard={handleDiscardExtraction}
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="manual">
                    <ManualComboTab
                      organizationId={organizationId}
                      editingCombo={editingCombo}
                      onEditComplete={() => setEditingComboId(null)}
                    />
                  </TabsContent>

                  <TabsContent value="chat">
                    <ChatComboTab organizationId={organizationId} />
                  </TabsContent>
                </Tabs>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-medium text-sm">
              <PackageIcon className="h-4 w-4 text-muted-foreground" />
              Combos creados
              {comboCount > 0 && (
                <Badge variant="secondary">{comboCount}</Badge>
              )}
            </h3>
          </div>

          {combos === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : comboCount === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <PackageIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">
                  No hay combos creados aún. Usa cualquiera de los métodos de
                  arriba para crear combos.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {combos.map((combo) => (
                <Card key={combo._id} className="overflow-hidden">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">
                          {combo.name}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="font-mono text-muted-foreground text-xs">
                            {formatPrice(combo.basePrice)}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            · {combo.slots.length}{" "}
                            {combo.slots.length === 1 ? "slot" : "slots"}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingComboId(combo._id)
                            setActiveTab("manual")
                          }}
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setComboToDelete({
                              id: combo._id,
                              name: combo.name,
                            })
                          }
                        >
                          <Trash2Icon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Atrás
          </Button>
          <Button
            variant="ghost"
            onClick={handleSkip}
            disabled={isSkipping || isCompleting}
          >
            {isSkipping ? (
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Omitir
          </Button>
        </div>
        <Button onClick={handleComplete} disabled={isCompleting || isSkipping}>
          {isCompleting ? (
            <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Continuar
        </Button>
      </div>

      <AlertDialog
        open={!!comboToDelete}
        onOpenChange={(open) => {
          if (!open) setComboToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar combo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro que deseas eliminar el combo &quot;
              {comboToDelete?.name}&quot;? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCombo}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
