"use client"

import { api } from "@workspace/backend/_generated/api"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useMutation } from "convex/react"
import {
  AlertCircleIcon,
  CheckCircleIcon,
  FileTextIcon,
  Loader2Icon,
  UploadIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { useOrganization } from "@/hooks/use-organization"

interface ComboImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete?: () => void
}

type ConflictResolution = "skip" | "overwrite" | "substitute"
type ImportStep = "upload" | "preview" | "importing" | "complete"

interface ComboPreview {
  id?: string
  name: string
  description: string
  basePrice: number
  isActive: boolean
  rowNumbers: number[]
  slotCount: number
  optionCount: number
  unresolvedOptions: number
  conflicts: string[]
  warnings: string[]
  willOverwrite: boolean
  dbDuplicate: boolean
}

interface ImportPreview {
  combos: ComboPreview[]
  totalCombos: number
  newCombos: number
  conflictingCombos: number
  errors: string[]
  warnings: string[]
}

interface ImportResult {
  success: boolean
  importedCombos: number
  skippedCombos: number
  deletedCombos: number
  errors: string[]
}

export const ComboImportDialog = ({
  isOpen,
  onClose,
  onImportComplete,
}: ComboImportDialogProps) => {
  const { activeOrganizationId } = useOrganization()

  const [currentStep, setCurrentStep] = useState<ImportStep>("upload")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvContent, setCsvContent] = useState("")
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [conflictResolution, setConflictResolution] =
    useState<ConflictResolution>("skip")

  const previewComboImport = useMutation(
    api.private.comboImport.previewComboImport
  )
  const importComboData = useMutation(api.private.comboImport.importComboData)

  const resetState = useCallback(() => {
    setCurrentStep("upload")
    setCsvFile(null)
    setCsvContent("")
    setPreview(null)
    setResult(null)
    setIsProcessing(false)
    setConflictResolution("skip")
  }, [])

  useEffect(() => {
    if (!isOpen) {
      resetState()
    }
  }, [isOpen, resetState])

  const readFileAsText = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => resolve((event.target?.result as string) || "")
      reader.onerror = () => reject(new Error("No se pudo leer el archivo"))
      reader.readAsText(file, "utf-8")
    })
  }, [])

  const handleFileSelect = useCallback(
    async (file: File) => {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."))
      if (![".csv", ".xlsx", ".xls"].includes(ext)) {
        toast.error("Solo se permiten archivos .csv, .xlsx o .xls")
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        toast.error("El archivo supera el máximo de 10MB")
        return
      }

      try {
        let content = ""
        if (ext === ".xlsx" || ext === ".xls") {
          const buffer = await file.arrayBuffer()
          const workbook = XLSX.read(buffer, { type: "array" })
          const firstSheetName = workbook.SheetNames[0]
          if (!firstSheetName) {
            toast.error("El archivo Excel no contiene hojas válidas")
            return
          }
          const worksheet = workbook.Sheets[firstSheetName]
          if (!worksheet) {
            toast.error("No se pudo leer la hoja del archivo Excel")
            return
          }
          content = XLSX.utils.sheet_to_csv(worksheet)
        } else {
          content = await readFileAsText(file)
        }

        if (!content.trim()) {
          toast.error("El archivo está vacío")
          return
        }

        setCsvFile(file)
        setCsvContent(content)
      } catch (error) {
        console.error("Error reading file", error)
        toast.error("No se pudo procesar el archivo")
      }
    },
    [readFileAsText]
  )

  const handlePreview = useCallback(async () => {
    if (!activeOrganizationId) {
      toast.error("No se pudo resolver la organización")
      return
    }
    if (!csvContent.trim()) {
      toast.error("Selecciona un archivo válido")
      return
    }

    setIsProcessing(true)
    try {
      const previewData = await previewComboImport({
        organizationId: activeOrganizationId,
        csvContent,
        conflictResolution,
      })
      setPreview(previewData as ImportPreview)
      setCurrentStep("preview")
      if (previewData.errors.length > 0) {
        toast.error("Se detectaron errores en el archivo")
      }
    } catch (error) {
      console.error("Error previewing import", error)
      toast.error("No se pudo generar la previsualización")
    } finally {
      setIsProcessing(false)
    }
  }, [activeOrganizationId, csvContent, previewComboImport, conflictResolution])

  const handleImport = useCallback(async () => {
    if (!activeOrganizationId) {
      toast.error("No se pudo resolver la organización")
      return
    }

    setIsProcessing(true)
    setCurrentStep("importing")
    try {
      const importResult = await importComboData({
        organizationId: activeOrganizationId,
        csvContent,
        conflictResolution,
      })

      setResult(importResult as ImportResult)
      setCurrentStep("complete")

      if (importResult.success) {
        toast.success("Importación de combos completada")
        onImportComplete?.()
      } else {
        toast.error("La importación finalizó con errores")
      }
    } catch (error) {
      console.error("Error importing combos", error)
      toast.error("No se pudo completar la importación")
      setCurrentStep("preview")
    } finally {
      setIsProcessing(false)
    }
  }, [
    activeOrganizationId,
    csvContent,
    conflictResolution,
    importComboData,
    onImportComplete,
  ])

  const hasBlockingErrors = (preview?.errors.length || 0) > 0
  const hasBlockingConflicts =
    (preview?.combos || []).some(
      (combo) => combo.conflicts.length > 0 || combo.unresolvedOptions > 0
    ) ?? false

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar combos</DialogTitle>
          <DialogDescription>
            Carga un archivo CSV o Excel para crear o actualizar combos.
          </DialogDescription>
        </DialogHeader>

        {currentStep === "upload" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="combo-import-file">Archivo de importación</Label>
              <Input
                id="combo-import-file"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    handleFileSelect(file).catch(() => {
                      toast.error("No se pudo procesar el archivo")
                    })
                  }
                }}
              />
              <p className="text-muted-foreground text-xs">
                Formatos soportados: CSV, XLSX y XLS. Máximo 10MB.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Resolución de conflictos</Label>
              <Select
                value={conflictResolution}
                onValueChange={(value: ConflictResolution) =>
                  setConflictResolution(value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar modo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Saltar existentes</SelectItem>
                  <SelectItem value="overwrite">
                    Sobrescribir existentes
                  </SelectItem>
                  <SelectItem value="substitute">
                    Sustituir catálogo (soft-delete)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {csvFile && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                <FileTextIcon className="h-4 w-4" />
                <span className="font-medium">{csvFile.name}</span>
              </div>
            )}
          </div>
        )}

        {currentStep === "preview" && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Badge variant="outline" className="justify-center py-2">
                Total: {preview.totalCombos}
              </Badge>
              <Badge variant="secondary" className="justify-center py-2">
                Nuevos: {preview.newCombos}
              </Badge>
              <Badge variant="outline" className="justify-center py-2">
                Conflictos: {preview.conflictingCombos}
              </Badge>
              <Badge variant="default" className="justify-center py-2">
                Modo: {conflictResolution}
              </Badge>
            </div>

            {preview.errors.length > 0 && (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 font-medium text-destructive text-sm">
                  <AlertCircleIcon className="h-4 w-4" />
                  Errores
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {preview.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="space-y-2 rounded-md border border-amber-400/40 bg-amber-50 p-3">
                <div className="font-medium text-amber-800 text-sm">
                  Advertencias
                </div>
                <ul className="list-disc space-y-1 pl-5 text-amber-900 text-sm">
                  {preview.warnings.slice(0, 6).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="max-h-[45vh] space-y-2 overflow-auto rounded-md border p-3">
              {preview.combos.map((combo) => {
                const hasIssues =
                  combo.conflicts.length > 0 || combo.unresolvedOptions > 0
                return (
                  <div
                    key={`${combo.name}-${combo.rowNumbers.join("-")}`}
                    className="rounded-md border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{combo.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {combo.slotCount} slots · {combo.optionCount} opciones
                          · ${combo.basePrice.toLocaleString("es-CO")}
                        </p>
                      </div>
                      {hasIssues ? (
                        <Badge variant="destructive">Con errores</Badge>
                      ) : combo.willOverwrite ? (
                        <Badge variant="secondary">Se actualiza</Badge>
                      ) : (
                        <Badge variant="default">Se crea</Badge>
                      )}
                    </div>

                    {combo.conflicts.length > 0 && (
                      <ul className="mt-2 list-disc pl-5 text-destructive text-xs">
                        {combo.conflicts.map((conflict) => (
                          <li key={conflict}>{conflict}</li>
                        ))}
                      </ul>
                    )}

                    {combo.unresolvedOptions > 0 && (
                      <p className="mt-2 text-destructive text-xs">
                        {combo.unresolvedOptions} opción(es) sin producto
                        resuelto.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {currentStep === "importing" && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <Loader2Icon className="h-6 w-6 animate-spin" />
            <p className="text-muted-foreground text-sm">
              Importando combos...
            </p>
          </div>
        )}

        {currentStep === "complete" && result && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircleIcon className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircleIcon className="h-5 w-5 text-destructive" />
              )}
              <p className="font-medium text-sm">
                {result.success
                  ? "Importación completada"
                  : "Importación completada con errores"}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Badge variant="default" className="justify-center py-2">
                Importados: {result.importedCombos}
              </Badge>
              <Badge variant="secondary" className="justify-center py-2">
                Omitidos: {result.skippedCombos}
              </Badge>
              <Badge variant="outline" className="justify-center py-2">
                Eliminados: {result.deletedCombos}
              </Badge>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {result.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (currentStep === "complete") {
                onClose()
                return
              }
              if (currentStep === "preview") {
                setCurrentStep("upload")
                return
              }
              onClose()
            }}
            disabled={isProcessing}
          >
            {currentStep === "complete" ? "Cerrar" : "Cancelar"}
          </Button>

          {currentStep === "upload" && (
            <Button
              onClick={() => {
                handlePreview().catch(() => {
                  toast.error("No se pudo generar la previsualización")
                })
              }}
              disabled={isProcessing || !csvFile}
            >
              {isProcessing ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  Analizando
                </>
              ) : (
                <>
                  <UploadIcon className="mr-2 h-4 w-4" />
                  Previsualizar
                </>
              )}
            </Button>
          )}

          {currentStep === "preview" && (
            <Button
              onClick={() => {
                handleImport().catch(() => {
                  toast.error("No se pudo completar la importación")
                })
              }}
              disabled={
                isProcessing ||
                hasBlockingErrors ||
                hasBlockingConflicts ||
                (preview?.combos.length ?? 0) === 0
              }
            >
              {isProcessing ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  Importando
                </>
              ) : (
                "Importar"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
