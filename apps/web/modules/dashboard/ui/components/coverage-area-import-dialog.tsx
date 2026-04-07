/** biome-ignore-all lint/suspicious/noArrayIndexKey: using array index as key for preview items */
"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
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
import { Progress } from "@workspace/ui/components/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useMutation } from "convex/react"
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  FileTextIcon,
  MapPinIcon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"

interface CoverageAreaImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete?: () => void
  locations: Array<{
    _id: Id<"restaurantLocations">
    name: string
    code: string
  }>
}

type ImportStep =
  | "select-location"
  | "upload"
  | "preview"
  | "validate"
  | "import"
  | "complete"

interface ImportPreview {
  folders: Array<{
    name: string
    placemarks: Array<{
      id: string
      name: string
      description: string
      coordinates: { lat: number; lng: number }[]
      deliveryFee?: number
      minimumOrder?: number
      estimatedDeliveryTime?: string
      conflicts: string[]
    }>
  }>
  totalAreas: number
  newAreas: number
  conflictingAreas: number
  errors: string[]
  warnings: string[]
}

interface ImportResult {
  success: boolean
  importedAreas: number
  skippedAreas: number
  errors: string[]
  createdAreaIds: string[]
}

export const CoverageAreaImportDialog = ({
  isOpen,
  onClose,
  onImportComplete,
  locations,
}: CoverageAreaImportDialogProps) => {
  const { activeOrganizationId } = useOrganization()
  const [currentStep, setCurrentStep] = useState<ImportStep>("select-location")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedLocationId, setSelectedLocationId] =
    useState<Id<"restaurantLocations"> | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [conflictResolution, setConflictResolution] = useState<
    "skip" | "overwrite"
  >("skip")
  const [isProcessing, setIsProcessing] = useState(false)
  const [hasSuccessfulImport, setHasSuccessfulImport] = useState(false)

  const previewKMLImport = useMutation(
    api.private.coverageAreaImport.previewKMLImport
  )
  const importKMLData = useMutation(
    api.private.coverageAreaImport.importKMLData
  )
  const previewCoverageAreaImport = useMutation(
    api.private.coverageAreaImport.previewCoverageAreaImport
  )
  const importCoverageAreaData = useMutation(
    api.private.coverageAreaImport.importCoverageAreaData
  )

  const parseTabularData = useCallback(async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: "array" })
          const firstSheetName = workbook.SheetNames[0]
          if (!firstSheetName) return resolve([])
          const worksheet = workbook.Sheets[firstSheetName]
          if (!worksheet) return resolve([])
          const jsonData = XLSX.utils.sheet_to_json(worksheet)
          resolve(jsonData)
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error("Error reading file"))
      reader.readAsArrayBuffer(file)
    })
  }, [])

  const mapToStandardFormat = useCallback((data: any[]): any[] => {
    const normalizeKey = (key: string) =>
      key
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "")

    return data.map((row) => {
      const keys = Object.keys(row)
      const findKey = (candidates: string[]) => {
        const normalizedCandidates = candidates.map(normalizeKey)
        return keys.find((k) => normalizedCandidates.includes(normalizeKey(k)))
      }

      // Find keys using normalized candidates
      const nameKey = findKey(["area_name", "nombre", "name", "area"])
      const descKey = findKey(["description", "descripcion", "desc"])
      const coordKey = findKey([
        "coordinates",
        "coordenadas",
        "coords",
        "poligono",
        "polygon",
      ])
      const feeKey = findKey([
        "delivery_fee",
        "costo_envio",
        "valor",
        "fee",
        "costo",
        "precio_entrega",
      ])
      const minKey = findKey([
        "minimum_order",
        "minimo_pedido",
        "minimo",
        "min",
        "pedido_minimo",
      ])
      const timeKey = findKey([
        "estimated_delivery_time",
        "tiempo_estimado",
        "tiempo",
      ])

      // Parse coordinates (expects lat,lng;lat,lng)
      let coordinates: { lat: number; lng: number }[] = []
      const coordStr = row[coordKey || ""]
      if (typeof coordStr === "string") {
        coordinates = coordStr
          .split(";")
          .map((pair) => {
            const [lat, lng] = pair.split(",").map((n) => parseFloat(n.trim()))
            return { lat: lat || 0, lng: lng || 0 }
          })
          .filter((c) => c.lat !== 0 || c.lng !== 0)
      }

      return {
        name: row[nameKey || ""] || "Área sin nombre",
        description: row[descKey || ""] || undefined,
        coordinates,
        deliveryFee:
          row[feeKey || ""] !== undefined
            ? parseFloat(row[feeKey || ""])
            : undefined,
        minimumOrder:
          row[minKey || ""] !== undefined
            ? parseFloat(row[minKey || ""])
            : undefined,
        estimatedDeliveryTime: row[timeKey || ""]
          ? String(row[timeKey || ""])
          : undefined,
      }
    })
  }, [])

  const handleFileSelect = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase()
      const isKML = ext === "kml"
      const isTabular = ["csv", "xlsx", "xls", "ods"].includes(ext || "")

      if (!isKML && !isTabular) {
        toast.error("Formato de archivo no soportado. Use KML, CSV o Excel.")
        return
      }

      setSelectedFile(file)
      setIsProcessing(true)
      setCurrentStep("preview")

      try {
        if (!activeOrganizationId) {
          throw new Error("No hay una organización activa")
        }
        if (isKML) {
          const content = await file.text()
          const result = await previewKMLImport({
            organizationId: activeOrganizationId,
            kmlContent: content,
            restaurantLocationId:
              selectedLocationId as Id<"restaurantLocations">,
          })
          setPreview(result)
        } else {
          const rawData = await parseTabularData(file)
          const standardizedAreas = mapToStandardFormat(rawData)
          const result = await previewCoverageAreaImport({
            organizationId: activeOrganizationId,
            areas: standardizedAreas,
            restaurantLocationId:
              selectedLocationId as Id<"restaurantLocations">,
          })
          setPreview(result)
        }
        setCurrentStep("validate")
      } catch (error) {
        toast.error(handleConvexError(error))
        setCurrentStep("upload")
      } finally {
        setIsProcessing(false)
      }
    },
    [
      activeOrganizationId,
      mapToStandardFormat,
      parseTabularData,
      previewKMLImport,
      previewCoverageAreaImport,
      selectedLocationId,
    ]
  )

  const handleImport = async () => {
    if (!selectedFile || !selectedLocationId || !activeOrganizationId) return

    setIsProcessing(true)
    setCurrentStep("import")

    try {
      const ext = selectedFile.name.split(".").pop()?.toLowerCase()
      const isKML = ext === "kml"

      let result: ImportResult
      if (isKML) {
        const content = await selectedFile.text()
        result = await importKMLData({
          organizationId: activeOrganizationId,
          kmlContent: content,
          conflictResolution,
          restaurantLocationId: selectedLocationId as Id<"restaurantLocations">,
        })
      } else {
        const rawData = await parseTabularData(selectedFile)
        const standardizedAreas = mapToStandardFormat(rawData)
        result = await importCoverageAreaData({
          organizationId: activeOrganizationId,
          areas: standardizedAreas,
          conflictResolution,
          restaurantLocationId: selectedLocationId as Id<"restaurantLocations">,
        })
      }

      setImportResult(result)
      setCurrentStep("complete")

      if (result.success) {
        toast.success(
          `Importación completada: ${result.importedAreas} áreas importadas`
        )
        setHasSuccessfulImport(true)
      } else {
        toast.error(`Errores durante la importación: ${result.errors.length}`)
      }
    } catch (error) {
      toast.error(handleConvexError(error))
      setCurrentStep("validate")
    } finally {
      setIsProcessing(false)
    }
  }

  const resetDialog = () => {
    setCurrentStep("select-location")
    setSelectedFile(null)
    setSelectedLocationId(null)
    setPreview(null)
    setImportResult(null)
    setIsProcessing(false)
    setHasSuccessfulImport(false)
  }

  const handleClose = () => {
    if (hasSuccessfulImport) {
      onImportComplete?.()
    }
    resetDialog()
    onClose()
  }

  const getStepProgress = () => {
    const steps = [
      "select-location",
      "upload",
      "preview",
      "validate",
      "import",
      "complete",
    ]
    const currentIndex = steps.indexOf(currentStep)
    return ((currentIndex + 1) / steps.length) * 100
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar Áreas de Cobertura</DialogTitle>
          <DialogDescription>
            Importa áreas desde KML (Google My Maps), CSV, Excel o ODS.
          </DialogDescription>

          <div className="space-y-2">
            <div className="flex justify-between text-muted-foreground text-sm">
              <span>Paso {Math.round(getStepProgress() / (100 / 6))} de 6</span>
              <span>
                {currentStep === "select-location"
                  ? "Ubicación"
                  : currentStep === "upload"
                    ? "Archivo"
                    : currentStep === "preview"
                      ? "Procesando"
                      : currentStep === "validate"
                        ? "Validar"
                        : currentStep === "import"
                          ? "Importando"
                          : "Completado"}
              </span>
            </div>
            <Progress value={getStepProgress()} className="h-2" />
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto">
          {currentStep === "select-location" && (
            <div className="space-y-4">
              <h3 className="text-center font-semibold text-lg">
                Selecciona la ubicación del restaurante
              </h3>
              {locations.length > 0 ? (
                <div className="grid gap-3">
                  {locations.map((loc) => (
                    <Button
                      key={loc._id}
                      variant={
                        selectedLocationId === loc._id ? "default" : "outline"
                      }
                      className="flex h-auto items-center justify-start gap-3 p-4"
                      onClick={() => {
                        setSelectedLocationId(loc._id)
                        setCurrentStep("upload")
                      }}
                    >
                      <MapPinIcon className="h-5 w-5" />
                      <div className="text-left">
                        <div className="font-medium">{loc.name}</div>
                        <div className="text-muted-foreground text-sm">
                          Código: {loc.code}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-8 text-center">
                  <div className="rounded-full bg-orange-100 p-3">
                    <AlertTriangleIcon className="h-8 w-8 text-orange-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg">
                      No hay sucursales creadas
                    </h4>
                    <p className="mx-auto max-w-xs text-muted-foreground text-sm">
                      Necesitas al menos una sucursal para poder importar áreas
                      de cobertura.
                    </p>
                  </div>
                  <Button asChild>
                    <Link href="/restaurant-locations">
                      Crear mi primera sucursal
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}

          {currentStep === "upload" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4">
                <MapPinIcon className="h-8 w-8 text-primary" />
                <div>
                  <h4 className="font-semibold">
                    {locations.find((l) => l._id === selectedLocationId)?.name}
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    Seleccionado para importación
                  </p>
                </div>
              </div>

              <div className="rounded-lg border-2 border-muted-foreground/25 border-dashed p-8 text-center">
                <UploadIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 font-semibold text-lg">Subir archivo</h3>
                <p className="mb-4 text-muted-foreground">
                  KML, CSV, XLSX o ODS
                </p>
                <Input
                  type="file"
                  accept=".kml,.csv,.xlsx,.xls,.ods"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelect(file)
                  }}
                  className="mx-auto max-w-xs"
                />
              </div>
            </div>
          )}

          {(currentStep === "preview" || currentStep === "validate") &&
            preview && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4">
                  <FileTextIcon className="h-8 w-8 text-blue-500" />
                  <div>
                    <h4 className="font-semibold">{selectedFile?.name}</h4>
                    <p className="text-muted-foreground text-sm">
                      {preview.totalAreas} áreas encontradas
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border p-4 text-center">
                    <div className="font-bold text-2xl text-green-600">
                      {preview.newAreas}
                    </div>
                    <div className="text-muted-foreground text-sm">Nuevas</div>
                  </div>
                  <div className="rounded-lg border p-4 text-center">
                    <div className="font-bold text-2xl text-orange-600">
                      {preview.conflictingAreas}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      Conflictos
                    </div>
                  </div>
                  <div className="rounded-lg border p-4 text-center">
                    <div className="font-bold text-2xl text-blue-600">
                      {preview.totalAreas}
                    </div>
                    <div className="text-muted-foreground text-sm">Total</div>
                  </div>
                </div>

                {preview.folders.map((folder, idx) => (
                  <div key={idx} className="space-y-3">
                    <h4 className="font-medium">{folder.name}</h4>
                    <div className="space-y-2">
                      {folder.placemarks.map((p, pIdx) => (
                        <div
                          key={pIdx}
                          className="flex items-center justify-between rounded bg-muted/30 p-3"
                        >
                          <div className="flex items-center gap-3">
                            <MapPinIcon className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium">{p.name}</div>
                              <div className="text-muted-foreground text-sm">
                                {p.coordinates.length} puntos
                                {p.deliveryFee !== undefined &&
                                  ` • $${p.deliveryFee}`}
                              </div>
                            </div>
                          </div>
                          {p.conflicts.length > 0 && (
                            <Badge variant="destructive">Conflicto</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {preview.conflictingAreas > 0 && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <Label>Resolución de conflictos</Label>
                    <Select
                      value={conflictResolution}
                      onValueChange={(v: any) => setConflictResolution(v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">Omitir duplicados</SelectItem>
                        <SelectItem value="overwrite">
                          Sobrescribir existentes
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

          {currentStep === "import" && (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="mb-4 h-12 w-12 animate-spin rounded-full border-primary border-b-2" />
              <h3 className="font-semibold text-lg">Importando datos...</h3>
            </div>
          )}

          {currentStep === "complete" && importResult && (
            <div className="space-y-6 text-center">
              {importResult.success ? (
                <CheckCircleIcon className="mx-auto h-16 w-16 text-primary" />
              ) : (
                <XCircleIcon className="mx-auto h-16 w-16 text-red-500" />
              )}
              <h3 className="font-bold text-xl">
                {importResult.success ? "Importación exitosa" : "Casi listo"}
              </h3>
              <p className="text-muted-foreground">
                {importResult.importedAreas} áreas procesadas,{" "}
                {importResult.skippedAreas} omitidas.
              </p>
              {importResult.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded bg-red-50 p-4 text-left text-red-700 text-sm">
                  {importResult.errors.map((e, i) => (
                    <div key={i}>• {e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {currentStep === "select-location" && (
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          )}
          {currentStep === "upload" && (
            <>
              <Button
                variant="outline"
                onClick={() => setCurrentStep("select-location")}
              >
                Atrás
              </Button>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
            </>
          )}
          {currentStep === "validate" && (
            <>
              <Button
                variant="outline"
                onClick={() => setCurrentStep("upload")}
              >
                Atrás
              </Button>
              <Button onClick={handleImport} disabled={isProcessing}>
                Importar
              </Button>
            </>
          )}
          {currentStep === "complete" && (
            <>
              <Button variant="outline" onClick={resetDialog}>
                <UploadIcon className="mr-2 h-4 w-4" />
                Nueva importación
              </Button>
              <Button onClick={handleClose}>Cerrar</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
