/** biome-ignore-all lint/suspicious/noArrayIndexKey: using array index as key for preview items */
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
  AlertTriangleIcon,
  CheckCircleIcon,
  ChefHatIcon,
  FileTextIcon,
  PackageIcon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { useOrganization } from "@/hooks/use-organization"

interface MenuImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete?: () => void
}

type ImportStep = "upload" | "preview" | "validate" | "import" | "complete"

interface ImportPreview {
  products: Array<{
    id: string
    name: string
    description: string
    categoryName: string
    subcategoryName?: string
    sizeName?: string
    price: number
    standAlone: boolean
    combinableHalf: boolean
    minimumQuantity?: number
    maximumQuantity?: number
    externalCode?: string
    combinableWith: Array<{
      categoryName: string
      sizeName?: string
      productName?: string
    }>
    instructions?: string
    imageUrl?: string
    componentsNames?: Array<{
      productName: string
    }>
    deshabilitarEn?: string[]
    rowNumber: number
    conflicts: string[]
    willOverwrite: boolean
    categoryExists: boolean
    subcategoryExists: boolean
    sizeExists: boolean
    combinableCategoriesExist: boolean
    componentsExist: boolean
    deshabilitarEnLocationsExist: boolean
    internalDuplicateOf?: number
    dbDuplicate?: boolean
  }>
  totalProducts: number
  newProducts: number
  conflictingProducts: number
  categories: string[]
  subcategories: string[]
  sizes: string[]
  errors: string[]
  warnings: string[]
}

interface ImportResult {
  success: boolean
  importedProducts: number
  skippedProducts: number
  deletedProducts: number
  errors: string[]
  createdProductIds: string[]
  createdCategories: string[]
  createdSubcategories: string[]
  createdSizes: string[]
}

export const MenuImportDialog = ({
  isOpen,
  onClose,
  onImportComplete,
}: MenuImportDialogProps) => {
  const { activeOrganizationId } = useOrganization()
  const [currentStep, setCurrentStep] = useState<ImportStep>("upload")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvContent, setCsvContent] = useState<string>("")
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [conflictResolution, setConflictResolution] = useState<
    "skip" | "overwrite" | "substitute"
  >("skip")
  const [substituteConfirm, setSubstituteConfirm] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [hasSuccessfulImport, setHasSuccessfulImport] = useState(false)

  const previewMenuImport = useMutation(
    api.private.menuImport.previewMenuImport
  )
  const importMenuData = useMutation(api.private.menuImport.importMenuData)

  useEffect(() => {
    const refreshPreview = async () => {
      if (
        csvContent &&
        activeOrganizationId &&
        (currentStep === "preview" || currentStep === "validate")
      ) {
        try {
          const previewResult = await previewMenuImport({
            organizationId: activeOrganizationId,
            csvContent,
            conflictResolution,
          })
          setPreview(previewResult)
        } catch (error) {
          console.error("Error refreshing preview:", error)
        }
      }
    }
    refreshPreview()
  }, [
    conflictResolution,
    csvContent,
    activeOrganizationId,
    currentStep,
    previewMenuImport,
  ])

  const readFileContent = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = () => reject(new Error("Error reading file"))
      reader.readAsText(file, "utf-8")
    })
  }, [])

  const handleFileSelect = useCallback(
    async (file: File) => {
      // Strict file type validation
      const allowedExtensions = [".csv", ".xlsx", ".xls"]
      const fileExtension = file.name
        .toLowerCase()
        .substring(file.name.lastIndexOf("."))
      const allowedMimeTypes = [
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/plain", // Some CSV files might have this MIME type
      ]

      const isValidExtension = allowedExtensions.includes(fileExtension)
      const isValidMimeType =
        allowedMimeTypes.includes(file.type) || file.type === ""

      if (!isValidExtension) {
        toast.error("Solo se permiten archivos CSV o Excel (.csv, .xlsx, .xls)")
        return
      }

      if (!isValidMimeType && file.type !== "") {
        toast.error(
          "El tipo de archivo no es válido. Asegúrate de subir un archivo CSV o Excel."
        )
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        // 10MB limit
        toast.error("El archivo es demasiado grande. Máximo 10MB")
        return
      }

      if (file.size === 0) {
        toast.error("El archivo está vacío")
        return
      }

      setCsvFile(file)

      try {
        let content: string

        if (fileExtension === ".xlsx" || fileExtension === ".xls") {
          // Handle Excel files
          const arrayBuffer = await file.arrayBuffer()
          const workbook = XLSX.read(arrayBuffer, { type: "array" })
          const firstSheetName = workbook.SheetNames[0]
          if (!firstSheetName) {
            throw new Error(
              "El archivo Excel no contiene hojas de cálculo válidas"
            )
          }
          const worksheet = workbook.Sheets[firstSheetName]
          if (!worksheet) {
            throw new Error(
              "No se pudo leer la hoja de cálculo del archivo Excel"
            )
          }
          content = XLSX.utils.sheet_to_csv(worksheet)
        } else {
          // Handle CSV files
          content = await readFileContent(file)
        }

        // Basic content validation
        if (!content || content.trim().length === 0) {
          throw new Error(
            "El archivo está vacío o no se pudo leer su contenido"
          )
        }

        // Basic CSV structure validation
        const lines = content.split("\n").filter((line) => line.trim())
        if (lines.length < 2) {
          throw new Error(
            "El archivo debe tener al menos una fila de encabezados y una fila de datos"
          )
        }

        // Check if first line looks like headers
        const firstLine = lines[0]
        if (!firstLine) {
          throw new Error("El archivo no tiene contenido válido")
        }
        const firstLineLower = firstLine.toLowerCase()
        const hasRequiredHeaders = [
          "nombre_producto",
          "descripcion",
          "categoria",
          "individual",
          "combinable_mitad",
        ].every((header) => firstLineLower.includes(header))

        if (!hasRequiredHeaders) {
          throw new Error(
            "Los encabezados del archivo no coinciden con el formato esperado. Asegúrate de usar la plantilla correcta."
          )
        }

        setCsvContent(content)
        setCurrentStep("preview")
        setIsProcessing(true)

        if (!activeOrganizationId) {
          throw new Error("No se pudo determinar la organización activa")
        }

        // Generate preview
        const previewResult = await previewMenuImport({
          organizationId: activeOrganizationId,
          csvContent: content,
          conflictResolution,
        })
        setPreview(previewResult)

        setIsProcessing(false)
        setCurrentStep("validate")
      } catch (error) {
        console.error("File processing error:", error)
        setIsProcessing(false)
        setCurrentStep("upload")

        // Handle different types of errors with user-friendly messages
        if (error instanceof Error) {
          // Check for specific error types
          if (
            error.message.includes("encabezados") ||
            error.message.includes("headers")
          ) {
            toast.error(
              "El formato del archivo no es válido. Asegúrate de usar la plantilla correcta con los encabezados requeridos."
            )
          } else if (error.message.includes("JSON")) {
            toast.error(
              "Error al procesar el archivo. Verifica que el formato sea correcto."
            )
          } else {
            toast.error(`Error al procesar el archivo: ${error.message}`)
          }
        } else {
          toast.error(
            "Error desconocido al procesar el archivo. Inténtalo de nuevo."
          )
        }
      }
    },
    [
      activeOrganizationId,
      conflictResolution,
      previewMenuImport,
      readFileContent,
    ]
  )

  const handleImport = async () => {
    if (!csvContent || !activeOrganizationId) return

    setIsProcessing(true)
    setCurrentStep("import")

    try {
      const result = await importMenuData({
        organizationId: activeOrganizationId,
        csvContent,
        conflictResolution,
      })

      setImportResult(result)
      setCurrentStep("complete")

      if (result.success) {
        const parts = []
        if (result.importedProducts > 0)
          parts.push(`${result.importedProducts} importados`)
        if (result.skippedProducts > 0)
          parts.push(`${result.skippedProducts} omitidos`)
        if (result.deletedProducts > 0)
          parts.push(`${result.deletedProducts} eliminados`)

        toast.success(
          `Importación completada${parts.length > 0 ? `: ${parts.join(", ")}` : ""}`
        )
        setHasSuccessfulImport(true)
        // Don't call onImportComplete here - let user see results first
      } else {
        toast.error(`Errores durante la importación: ${result.errors.length}`)
      }
    } catch (error) {
      console.error("Import error:", error)
      setCurrentStep("validate")

      // Handle different types of errors with user-friendly messages
      if (error instanceof Error) {
        if (error.message.includes("durante la importación")) {
          toast.error(
            "Error durante la importación. Revisa los datos e inténtalo de nuevo."
          )
        } else {
          toast.error(`Error de importación: ${error.message}`)
        }
      } else {
        toast.error(
          "Error desconocido durante la importación. Inténtalo de nuevo."
        )
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const resetDialog = () => {
    setCurrentStep("upload")
    setCsvFile(null)
    setCsvContent("")
    setPreview(null)
    setImportResult(null)
    setConflictResolution("skip")
    setIsProcessing(false)
    setHasSuccessfulImport(false)
    setSubstituteConfirm(false)
  }

  const handleClose = () => {
    if (hasSuccessfulImport) {
      onImportComplete?.()
    }
    resetDialog()
    onClose()
  }

  const getStepProgress = () => {
    const steps = ["upload", "preview", "validate", "import", "complete"]
    const currentIndex = steps.indexOf(currentStep)
    return ((currentIndex + 1) / steps.length) * 100
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar Productos del Menú</DialogTitle>
          <DialogDescription>
            Importa productos con el formato estándar.{" "}
            <Link
              href="/menu/import-guide"
              className="text-primary hover:underline"
            >
              Ver guía completa de importación →
            </Link>
          </DialogDescription>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-muted-foreground text-sm">
              <span>
                Paso{" "}
                {[
                  "upload",
                  "preview",
                  "validate",
                  "import",
                  "complete",
                ].indexOf(currentStep) + 1}{" "}
                de 5
              </span>
              <span>
                {currentStep === "upload"
                  ? "Subir archivo"
                  : currentStep === "preview"
                    ? "Procesando..."
                    : currentStep === "validate"
                      ? "Validar datos"
                      : currentStep === "import"
                        ? "Importando..."
                        : "Completado"}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all duration-300"
                style={{ width: `${getStepProgress()}%` }}
              />
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto">
          {/* Upload Step */}
          {currentStep === "upload" && (
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-muted-foreground/25 border-dashed p-8 text-center">
                <UploadIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 font-semibold text-lg">
                  Subir archivo CSV/XLSX
                </h3>
                <p className="mb-4 text-muted-foreground">
                  Arrastra y suelta tu archivo CSV/XLSX (Excel) aquí, o haz clic
                  para seleccionar. Asegúrate de seguir el formato correcto.
                </p>
                <Input
                  type="file"
                  accept=".csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      handleFileSelect(file)
                      // Reset the input so the same file can be selected again if there's an error
                      e.target.value = ""
                    }
                  }}
                  disabled={isProcessing}
                  className="mx-auto max-w-xs"
                />
                <p className="mt-2 text-muted-foreground text-xs">
                  Máximo 10MB. Archivos CSV o Excel (.csv, .xlsx, .xls)
                </p>
              </div>
            </div>
          )}

          {/* Preview Step */}
          {(currentStep === "preview" || currentStep === "validate") &&
            preview && (
              <div className="space-y-6">
                {/* File Info */}
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4">
                  <FileTextIcon className="h-8 w-8 text-blue-500" />
                  <div>
                    <h4 className="font-semibold">{csvFile?.name}</h4>
                    <p className="text-muted-foreground text-sm">
                      {(csvFile?.size || 0) / 1024} KB • {preview.totalProducts}{" "}
                      productos encontrados
                    </p>
                  </div>
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border p-4 text-center">
                    <div className="font-bold text-2xl text-green-600">
                      {preview.newProducts}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      Nuevos productos
                    </div>
                  </div>
                  <div className="rounded-lg border p-4 text-center">
                    <div className="font-bold text-2xl text-orange-600">
                      {preview.conflictingProducts}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      Conflictos
                    </div>
                  </div>
                  <div className="rounded-lg border p-4 text-center">
                    <div className="font-bold text-2xl text-blue-600">
                      {preview.totalProducts}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      Total productos
                    </div>
                  </div>
                </div>

                {/* Errors and Warnings */}
                {(preview.errors.length > 0 || preview.warnings.length > 0) && (
                  <div className="space-y-3">
                    {preview.errors.length > 0 && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <XCircleIcon className="h-5 w-5 text-red-500" />
                          <h4 className="font-semibold text-red-800">
                            Errores
                          </h4>
                        </div>
                        <ul className="space-y-1 text-red-700 text-sm">
                          {preview.errors.map((error, index) => (
                            <li key={index}>• {error}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {preview.warnings.length > 0 && (
                      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <AlertTriangleIcon className="h-5 w-5 text-yellow-500" />
                          <h4 className="font-semibold text-yellow-800">
                            Advertencias
                          </h4>
                        </div>
                        <ul className="space-y-1 text-sm text-yellow-700">
                          {preview.warnings.map((warning, index) => (
                            <li key={index}>• {warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Zero Price Products Warning */}
                {(() => {
                  const zeroPriceProducts = preview.products.filter(
                    (product) => product.price === 0
                  )
                  return zeroPriceProducts.length > 0 ? (
                    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <AlertTriangleIcon className="h-5 w-5 text-yellow-500" />
                        <h4 className="font-semibold text-yellow-800">
                          Productos con precio cero
                        </h4>
                      </div>
                      <p className="mb-3 text-sm text-yellow-700">
                        Los siguientes productos tienen precio cero. Asegúrate
                        de que esto sea correcto antes de importar:
                      </p>
                      <ul className="space-y-1 text-sm text-yellow-700">
                        {zeroPriceProducts.map((product) => (
                          <li key={product.id}>
                            • {product.name}
                            {product.sizeName && ` (${product.sizeName})`}
                            {" - "}
                            {product.categoryName}
                            {product.subcategoryName &&
                              ` > ${product.subcategoryName}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null
                })()}

                {/* Products Disabled in Locations Warning */}
                {(() => {
                  const productsWithDisabling = preview.products.filter(
                    (product) =>
                      product.deshabilitarEn &&
                      product.deshabilitarEn.length > 0
                  )

                  if (productsWithDisabling.length === 0) return null

                  // Group products by location codes
                  const locationGroups: Record<
                    string,
                    { products: typeof productsWithDisabling; exists: boolean }
                  > = {}

                  productsWithDisabling.forEach((product) => {
                    if (product.deshabilitarEn) {
                      product.deshabilitarEn.forEach((locationCode) => {
                        if (!locationGroups[locationCode]) {
                          locationGroups[locationCode] = {
                            products: [],
                            exists: product.deshabilitarEnLocationsExist,
                          }
                        }
                        locationGroups[locationCode].products.push(product)
                      })
                    }
                  })

                  return (
                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <AlertTriangleIcon className="h-5 w-5 text-orange-500" />
                        <h4 className="font-semibold text-orange-800">
                          Productos deshabilitados por ubicación
                        </h4>
                      </div>
                      <p className="mb-3 text-orange-700 text-sm">
                        Los siguientes productos serán deshabilitados en las
                        ubicaciones especificadas:
                      </p>
                      <div className="space-y-3">
                        {Object.entries(locationGroups).map(
                          ([locationCode, { products, exists }]) => (
                            <div
                              key={locationCode}
                              className="border-orange-300 border-l-2 pl-3"
                            >
                              <div className="mb-2 flex items-center gap-2">
                                <span className="font-medium text-orange-800">
                                  Ubicación: {locationCode}
                                </span>
                                {!exists && (
                                  <Badge
                                    variant="destructive"
                                    className="text-xs"
                                  >
                                    Código desconocido
                                  </Badge>
                                )}
                              </div>
                              <ul className="space-y-1 text-orange-700 text-sm">
                                {products.map((product) => (
                                  <li key={`${product.id}-${locationCode}`}>
                                    • {product.name}
                                    {product.sizeName &&
                                      ` (${product.sizeName})`}
                                    {" - "}
                                    {product.categoryName}
                                    {product.subcategoryName &&
                                      ` > ${product.subcategoryName}`}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* Preview Products */}
                <div className="space-y-4">
                  <h4 className="font-semibold">
                    Vista previa de productos por categoría
                  </h4>

                  {/* Group products by category */}
                  {preview &&
                    Object.entries(
                      preview.products.reduce(
                        (acc, product) => {
                          if (!acc[product.categoryName]) {
                            acc[product.categoryName] = []
                          }
                          acc[product.categoryName]?.push(product)
                          return acc
                        },
                        {} as Record<string, typeof preview.products>
                      )
                    ).map(([categoryName, products]) => (
                      <div key={categoryName} className="rounded-lg border p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <ChefHatIcon className="h-4 w-4" />
                          <h5 className="font-medium">{categoryName}</h5>
                          <Badge variant="outline" className="text-xs">
                            {products.length} producto
                            {products.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          {products.map((product) => (
                            <div
                              key={product.id}
                              className="flex items-center justify-between rounded bg-muted/30 p-3"
                            >
                              <div className="flex flex-1 items-start gap-3">
                                <div className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                                  {product.imageUrl ? (
                                    <img
                                      src={product.imageUrl}
                                      alt={product.name}
                                      className="h-full w-full object-cover"
                                      onError={(e) => {
                                        const target =
                                          e.target as HTMLImageElement
                                        target.src = ""
                                        target.className = "hidden"
                                      }}
                                    />
                                  ) : (
                                    <PackageIcon className="h-5 w-5 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium">
                                    {product.name}
                                    {product.sizeName && (
                                      <span className="ml-2 text-muted-foreground">
                                        ({product.sizeName})
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground text-sm">
                                    <span className="font-medium text-foreground">
                                      ${product.price.toLocaleString()}
                                    </span>
                                    {product.subcategoryName && (
                                      <span>• {product.subcategoryName}</span>
                                    )}
                                    {product.externalCode && (
                                      <span>
                                        • Código: {product.externalCode}
                                      </span>
                                    )}
                                    <span>
                                      •{" "}
                                      {product.standAlone
                                        ? "Independiente"
                                        : "No independiente"}
                                    </span>
                                    {product.combinableHalf && (
                                      <span>• Combinable por mitades</span>
                                    )}
                                  </div>

                                  {/* Extra details in separate line if long */}
                                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground text-xs">
                                    {product.combinableWith.length > 0 && (
                                      <span>
                                        Combinable con:{" "}
                                        {product.combinableWith
                                          .map((combo) => {
                                            const parts = [combo.categoryName]
                                            if (combo.productName)
                                              parts.push(combo.productName)
                                            if (combo.sizeName)
                                              parts.push(`(${combo.sizeName})`)
                                            return parts.join(" ")
                                          })
                                          .join(", ")}
                                      </span>
                                    )}
                                    {product.instructions && (
                                      <span>
                                        • Instrucciones: {product.instructions}
                                      </span>
                                    )}
                                    {product.componentsNames &&
                                      product.componentsNames.length > 0 && (
                                        <span>
                                          • Componentes:{" "}
                                          {product.componentsNames
                                            .map((c) => c.productName)
                                            .join(", ")}
                                        </span>
                                      )}
                                  </div>

                                  {product.conflicts.length > 0 && (
                                    <div className="mt-1 space-y-1">
                                      {product.conflicts.map((c, i) => (
                                        <div
                                          key={i}
                                          className="font-medium text-orange-600 text-xs"
                                        >
                                          • {c}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col items-center gap-1">
                                {(!product.categoryExists ||
                                  (product.subcategoryName &&
                                    !product.subcategoryExists) ||
                                  (product.sizeName &&
                                    !product.sizeExists)) && (
                                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                                    {!product.categoryExists && (
                                      <Badge
                                        variant="secondary"
                                        className="text-xs"
                                      >
                                        Nueva categoría
                                      </Badge>
                                    )}
                                    {product.subcategoryName &&
                                      !product.subcategoryExists && (
                                        <Badge
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          Nueva subcategoría
                                        </Badge>
                                      )}
                                    {product.sizeName &&
                                      !product.sizeExists && (
                                        <Badge
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          Nuevo tamaño
                                        </Badge>
                                      )}
                                  </div>
                                )}
                                {(product.internalDuplicateOf ||
                                  product.dbDuplicate ||
                                  !product.dbDuplicate ||
                                  (product.conflicts.length > 0 &&
                                    !product.dbDuplicate) ||
                                  (product.componentsNames &&
                                    product.componentsNames.length > 0 &&
                                    !product.componentsExist)) && (
                                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                                    {/* New Product Badge */}
                                    {!product.dbDuplicate &&
                                      !product.internalDuplicateOf && (
                                        <Badge
                                          variant="outline"
                                          className="border-green-500 bg-green-50 text-green-700 text-xs"
                                        >
                                          Nuevo
                                        </Badge>
                                      )}

                                    {product.internalDuplicateOf && (
                                      <Badge
                                        variant="destructive"
                                        className="bg-orange-500 text-xs hover:bg-orange-600"
                                      >
                                        Duplicado (fila{" "}
                                        {product.internalDuplicateOf})
                                      </Badge>
                                    )}

                                    {/* Dynamic Status Badges */}
                                    {product.dbDuplicate &&
                                      (conflictResolution === "overwrite" ||
                                      conflictResolution === "substitute" ? (
                                        <Badge
                                          variant="outline"
                                          className="border-blue-500 bg-blue-50 text-blue-700 text-xs"
                                        >
                                          Actualizar
                                        </Badge>
                                      ) : (
                                        <Badge
                                          variant="secondary"
                                          className="border-gray-300 text-gray-500 text-xs"
                                        >
                                          Omitido (ya existe)
                                        </Badge>
                                      ))}

                                    {/* Other functional conflicts */}
                                    {product.conflicts.length > 0 &&
                                      !product.dbDuplicate && (
                                        <Badge
                                          variant="destructive"
                                          className="text-xs"
                                        >
                                          {product.conflicts.length} conflicto
                                          {product.conflicts.length > 1
                                            ? "s"
                                            : ""}
                                        </Badge>
                                      )}

                                    {product.componentsNames &&
                                      product.componentsNames.length > 0 &&
                                      !product.componentsExist && (
                                        <Badge
                                          variant="destructive"
                                          className="text-xs"
                                        >
                                          Componentes no existen
                                        </Badge>
                                      )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

          {/* Import Step */}
          {currentStep === "import" && (
            <div className="py-8 text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-primary border-b-2"></div>
              <h3 className="mb-2 font-semibold text-lg">
                Importando productos...
              </h3>
              <p className="text-muted-foreground">
                Procesando {preview?.totalProducts || 0} productos del menú
              </p>
            </div>
          )}

          {/* Complete Step */}
          {currentStep === "complete" && importResult && (
            <div>
              <div className="py-8 text-center">
                {importResult.success ? (
                  <CheckCircleIcon className="mx-auto mb-4 h-16 w-16 text-primary" />
                ) : (
                  <XCircleIcon className="mx-auto mb-4 h-16 w-16 text-red-500" />
                )}
                <h3 className="mb-2 font-semibold text-xl">
                  {importResult.success
                    ? "Importación completada"
                    : "Errores en la importación"}
                </h3>
                {(importResult.createdCategories.length > 0 ||
                  importResult.createdSubcategories.length > 0 ||
                  importResult.createdSizes.length > 0) && (
                  <p className="mt-2 text-muted-foreground text-sm">
                    {importResult.createdCategories.length > 0 &&
                      `${importResult.createdCategories.length} categorías creadas`}
                    {importResult.createdCategories.length > 0 &&
                      (importResult.createdSubcategories.length > 0 ||
                        importResult.createdSizes.length > 0) &&
                      ", "}
                    {importResult.createdSubcategories.length > 0 &&
                      `${importResult.createdSubcategories.length} subcategorías creadas`}
                    {importResult.createdSubcategories.length > 0 &&
                      importResult.createdSizes.length > 0 &&
                      ", "}
                    {importResult.createdSizes.length > 0 &&
                      `${importResult.createdSizes.length} tamaños creados`}
                  </p>
                )}
              </div>

              {/* Import Results */}
              <div className="flex gap-4">
                {importResult.importedProducts > 0 && (
                  <div className="flex-1 rounded-lg border p-4 text-center">
                    <div className="font-bold text-2xl text-green-600">
                      {importResult.importedProducts}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      Productos importados
                    </div>
                  </div>
                )}
                {importResult.skippedProducts > 0 && (
                  <div className="flex-1 rounded-lg border p-4 text-center">
                    <div className="font-bold text-2xl text-orange-600">
                      {importResult.skippedProducts}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      Productos omitidos
                    </div>
                  </div>
                )}
                {importResult.deletedProducts > 0 && (
                  <div className="flex-1 rounded-lg border p-4 text-center">
                    <div className="font-bold text-2xl text-red-600">
                      {importResult.deletedProducts}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      Productos eliminados
                    </div>
                  </div>
                )}
              </div>

              {/* Errors */}
              {importResult.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <AlertCircleIcon className="h-5 w-5 text-red-500" />
                    <h4 className="font-semibold text-red-800">
                      Errores durante la importación
                    </h4>
                  </div>
                  <ul className="space-y-1 text-red-700 text-sm">
                    {importResult.errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fixed Conflict Resolution Section (Always Visible above Footer) */}
        {(currentStep === "preview" || currentStep === "validate") &&
          preview && (
            <div className="border-t bg-muted/30 p-4">
              <div className="mx-auto max-w-2xl space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-semibold text-sm">
                      Modo de Importación
                    </h4>
                    <p className="text-muted-foreground text-xs">
                      Elige cómo procesar los productos que ya existen en tu
                      menú.
                    </p>
                  </div>
                  <Select
                    value={conflictResolution}
                    onValueChange={(
                      value: "skip" | "overwrite" | "substitute"
                    ) => {
                      setConflictResolution(value)
                      if (value !== "substitute") setSubstituteConfirm(false)
                    }}
                  >
                    <SelectTrigger className="w-[280px] bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">
                        Omitir duplicados (solo nuevos)
                      </SelectItem>
                      <SelectItem value="overwrite">
                        Actualizar productos existentes (mezclar)
                      </SelectItem>
                      <SelectItem value="substitute">
                        Sustituir menú completo
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {conflictResolution === "substitute" && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3">
                    <div className="flex gap-3">
                      <AlertTriangleIcon className="h-5 w-5 flex-shrink-0 text-red-600" />
                      <div className="space-y-2">
                        <p className="font-semibold text-red-900 text-xs">
                          OPERACIÓN DESTRUCTIVA: Se eliminarán los productos no
                          incluidos en el archivo.
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="confirm-substitute"
                            checked={substituteConfirm}
                            onChange={(e) =>
                              setSubstituteConfirm(e.target.checked)
                            }
                            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                          />
                          <label
                            htmlFor="confirm-substitute"
                            className="cursor-pointer select-none font-medium text-red-900 text-xs"
                          >
                            Confirmo que deseo reemplazar mi menú actual
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {conflictResolution === "overwrite" && (
                  <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-2 text-blue-800 text-xs">
                    <AlertCircleIcon className="h-4 w-4 flex-shrink-0" />
                    <p>
                      Se actualizarán datos de productos existentes y se crearán
                      los nuevos.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

        <DialogFooter>
          {currentStep === "upload" && (
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          )}

          {(currentStep === "validate" || currentStep === "preview") && (
            <>
              <Button
                variant="outline"
                onClick={() => setCurrentStep("upload")}
              >
                Atrás
              </Button>
              <Button
                onClick={handleImport}
                disabled={
                  isProcessing ||
                  (preview?.errors.length ?? 0) > 0 ||
                  (conflictResolution === "substitute" && !substituteConfirm)
                }
                variant={
                  conflictResolution === "substitute"
                    ? "destructive"
                    : "default"
                }
              >
                {isProcessing
                  ? "Procesando..."
                  : conflictResolution === "substitute"
                    ? "Sustituir Menú Completo"
                    : "Importar productos"}
              </Button>
            </>
          )}

          {currentStep === "complete" && (
            <>
              <Button variant="outline" onClick={resetDialog}>
                Importar otro archivo
              </Button>
              <Button onClick={handleClose}>Cerrar</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
