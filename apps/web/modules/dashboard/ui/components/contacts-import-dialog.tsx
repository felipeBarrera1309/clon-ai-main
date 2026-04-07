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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { useMutation } from "convex/react"
import {
  AlertCircleIcon,
  CheckCircleIcon,
  FileTextIcon,
  UploadIcon,
  UserPlusIcon,
  XCircleIcon,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useOrganization } from "@/hooks/use-organization"

interface ContactsImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete?: () => void
}

type ImportStep = "upload" | "preview" | "import" | "complete"

interface ParsedContactRow {
  rowNumber: number
  phoneNumber: string
  normalizedPhoneNumber: string
  displayName?: string
  lastKnownAddress?: string
  isValid: boolean
  errors: string[]
}

interface ImportPreview {
  totalRows: number
  validRows: number
  invalidRows: number
  newContacts: number
  duplicateContacts: number
  rows: ParsedContactRow[]
  errors: { row: number; errors: string[] }[]
}

interface ImportResult {
  success: boolean
  error: string | null
  imported: number
  skipped: number
  updated: number
  errors: { row: number; error: string }[]
}

export const ContactsImportDialog = ({
  isOpen,
  onClose,
  onImportComplete,
}: ContactsImportDialogProps) => {
  const { activeOrganizationId } = useOrganization()
  const [currentStep, setCurrentStep] = useState<ImportStep>("upload")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvContent, setCsvContent] = useState<string>("")
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [conflictResolution, setConflictResolution] = useState<
    "skip" | "update"
  >("skip")
  const [isProcessing, setIsProcessing] = useState(false)
  const [hasSuccessfulImport, setHasSuccessfulImport] = useState(false)

  const previewContactsImport = useMutation(
    api.private.contacts.previewContactsImport
  )
  const importContacts = useMutation(api.private.contacts.importContacts)

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
      // Validate file type
      const allowedExtensions = [".csv"]
      const fileExtension = file.name
        .toLowerCase()
        .substring(file.name.lastIndexOf("."))

      if (!allowedExtensions.includes(fileExtension)) {
        toast.error("Solo se permiten archivos CSV (.csv)")
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error("El archivo es demasiado grande. Máximo 5MB")
        return
      }

      if (file.size === 0) {
        toast.error("El archivo está vacío")
        return
      }

      setCsvFile(file)

      try {
        const content = await readFileContent(file)

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
        const hasPhoneHeader =
          firstLineLower.includes("telefono") ||
          firstLineLower.includes("teléfono") ||
          firstLineLower.includes("phone_number")

        if (!hasPhoneHeader) {
          throw new Error(
            "Los encabezados del archivo no coinciden con el formato esperado. Asegúrate de incluir la columna 'telefono'."
          )
        }

        setCsvContent(content)
        setIsProcessing(true)

        if (!activeOrganizationId) {
          throw new Error("No hay una organización activa")
        }

        // Generate preview
        const previewResult = await previewContactsImport({
          organizationId: activeOrganizationId,
          csvContent: content,
        })

        if (!previewResult.success) {
          throw new Error(previewResult.error || "Error al procesar el archivo")
        }

        setPreview(previewResult.preview)
        setCurrentStep("preview")
      } catch (error) {
        console.error("File processing error:", error)
        setCurrentStep("upload")

        if (error instanceof Error) {
          toast.error(`Error al procesar el archivo: ${error.message}`)
        } else {
          toast.error(
            "Error desconocido al procesar el archivo. Inténtalo de nuevo."
          )
        }
      } finally {
        setIsProcessing(false)
      }
    },
    [activeOrganizationId, previewContactsImport, readFileContent]
  )

  const handleImport = async () => {
    if (!csvContent || !activeOrganizationId) return

    setIsProcessing(true)
    setCurrentStep("import")

    try {
      const result = await importContacts({
        organizationId: activeOrganizationId,
        csvContent,
        conflictResolution,
      })

      setImportResult(result)
      setCurrentStep("complete")

      if (result.success) {
        toast.success(
          `Importación completada: ${result.imported} contactos importados`
        )
        setHasSuccessfulImport(true)
      } else {
        toast.error(`Error durante la importación: ${result.error}`)
      }
    } catch (error) {
      console.error("Import error:", error)
      setCurrentStep("preview")

      if (error instanceof Error) {
        toast.error(`Error de importación: ${error.message}`)
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
  }

  const handleClose = () => {
    if (hasSuccessfulImport) {
      onImportComplete?.()
    }
    resetDialog()
    onClose()
  }

  const getStepProgress = () => {
    const steps = ["upload", "preview", "import", "complete"]
    const currentIndex = steps.indexOf(currentStep)
    return ((currentIndex + 1) / steps.length) * 100
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar Contactos</DialogTitle>
          <DialogDescription>
            Importa contactos desde un archivo CSV.{" "}
            <Link
              href="/contacts/import"
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
                {["upload", "preview", "import", "complete"].indexOf(
                  currentStep
                ) + 1}{" "}
                de 4
              </span>
              <span>
                {currentStep === "upload"
                  ? "Subir archivo"
                  : currentStep === "preview"
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
                  Subir archivo CSV
                </h3>
                <p className="mb-4 text-muted-foreground">
                  Arrastra y suelta tu archivo CSV aquí, o haz clic para
                  seleccionar.
                </p>
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      handleFileSelect(file)
                      e.target.value = ""
                    }
                  }}
                  disabled={isProcessing}
                  className="mx-auto max-w-xs"
                />
                <p className="mt-2 text-muted-foreground text-xs">
                  Máximo 5MB. Solo archivos CSV (.csv)
                </p>
              </div>

              {/* Quick format reminder */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="mb-2 font-medium">Formato requerido:</h4>
                <code className="block rounded bg-muted p-2 text-sm">
                  telefono,nombre,direccion
                  <br />
                  &quot;573001234567&quot;,&quot;Juan Perez&quot;,&quot;Calle
                  100 #15-20&quot;
                </code>
                <p className="mt-2 text-muted-foreground text-xs">
                  Solo <strong>telefono</strong> es requerido. Usa comillas para
                  evitar problemas con Excel.
                </p>
              </div>
            </div>
          )}

          {/* Preview Step */}
          {currentStep === "preview" && preview && (
            <div className="space-y-6">
              {/* File Info */}
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4">
                <FileTextIcon className="h-8 w-8 text-blue-500" />
                <div>
                  <h4 className="font-semibold">{csvFile?.name}</h4>
                  <p className="text-muted-foreground text-sm">
                    {((csvFile?.size || 0) / 1024).toFixed(1)} KB •{" "}
                    {preview.totalRows} filas encontradas
                  </p>
                </div>
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border p-4 text-center">
                  <div className="font-bold text-2xl text-blue-600">
                    {preview.totalRows}
                  </div>
                  <div className="text-muted-foreground text-sm">Total</div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="font-bold text-2xl text-green-600">
                    {preview.newContacts}
                  </div>
                  <div className="text-muted-foreground text-sm">Nuevos</div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="font-bold text-2xl text-orange-600">
                    {preview.duplicateContacts}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Duplicados
                  </div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="font-bold text-2xl text-red-600">
                    {preview.invalidRows}
                  </div>
                  <div className="text-muted-foreground text-sm">Inválidos</div>
                </div>
              </div>

              {/* Errors */}
              {preview.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <XCircleIcon className="h-5 w-5 text-red-500" />
                    <h4 className="font-semibold text-red-800">
                      Errores encontrados
                    </h4>
                  </div>
                  <ul className="max-h-32 space-y-1 overflow-y-auto text-red-700 text-sm">
                    {preview.errors.slice(0, 10).map((error, index) => (
                      <li key={index}>
                        • Fila {error.row}: {error.errors.join(", ")}
                      </li>
                    ))}
                    {preview.errors.length > 10 && (
                      <li className="text-red-600">
                        ... y {preview.errors.length - 10} errores más
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Preview Table */}
              <div className="space-y-2">
                <h4 className="font-semibold">
                  Vista previa (primeros 20 contactos)
                </h4>
                <div className="max-h-64 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Fila</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Dirección</TableHead>
                        <TableHead className="w-24">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.slice(0, 20).map((row) => (
                        <TableRow
                          key={row.rowNumber}
                          className={!row.isValid ? "bg-red-50" : ""}
                        >
                          <TableCell className="font-mono text-sm">
                            {row.rowNumber}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {row.normalizedPhoneNumber || row.phoneNumber}
                          </TableCell>
                          <TableCell>{row.displayName || "-"}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {row.lastKnownAddress || "-"}
                          </TableCell>
                          <TableCell>
                            {row.isValid ? (
                              <Badge variant="secondary">Válido</Badge>
                            ) : (
                              <Badge variant="destructive">Error</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Conflict Resolution */}
              {preview.duplicateContacts > 0 && (
                <div className="rounded-lg border p-4">
                  <h4 className="mb-3 font-semibold">
                    Resolución de duplicados
                  </h4>
                  <p className="mb-3 text-muted-foreground text-sm">
                    Se encontraron {preview.duplicateContacts} contactos que ya
                    existen en tu base de datos.
                  </p>
                  <div className="space-y-3">
                    <Label htmlFor="conflict-resolution">
                      ¿Qué hacer con los contactos duplicados?
                    </Label>
                    <Select
                      value={conflictResolution}
                      onValueChange={(value: "skip" | "update") =>
                        setConflictResolution(value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">
                          Omitir contactos duplicados
                        </SelectItem>
                        <SelectItem value="update">
                          Actualizar datos de contactos existentes
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Import Step */}
          {currentStep === "import" && (
            <div className="py-8 text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-primary border-b-2" />
              <h3 className="mb-2 font-semibold text-lg">
                Importando contactos...
              </h3>
              <p className="text-muted-foreground">
                Procesando {preview?.validRows || 0} contactos
              </p>
            </div>
          )}

          {/* Complete Step */}
          {currentStep === "complete" && importResult && (
            <div className="space-y-6">
              <div className="py-8 text-center">
                {importResult.success ? (
                  <CheckCircleIcon className="mx-auto mb-4 h-16 w-16 text-primary" />
                ) : (
                  <XCircleIcon className="mx-auto mb-4 h-16 w-16 text-red-500" />
                )}
                <h3 className="mb-2 font-semibold text-xl">
                  {importResult.success
                    ? "Importación completada"
                    : "Error en la importación"}
                </h3>
                <p className="text-muted-foreground">
                  {importResult.imported} contactos importados
                  {importResult.updated > 0 &&
                    `, ${importResult.updated} actualizados`}
                  {importResult.skipped > 0 &&
                    `, ${importResult.skipped} omitidos`}
                </p>
              </div>

              {/* Import Results */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border p-4 text-center">
                  <div className="font-bold text-2xl text-green-600">
                    {importResult.imported}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    <UserPlusIcon className="mx-auto mb-1 h-4 w-4" />
                    Importados
                  </div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="font-bold text-2xl text-blue-600">
                    {importResult.updated}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Actualizados
                  </div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="font-bold text-2xl text-orange-600">
                    {importResult.skipped}
                  </div>
                  <div className="text-muted-foreground text-sm">Omitidos</div>
                </div>
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
                  <ul className="max-h-32 space-y-1 overflow-y-auto text-red-700 text-sm">
                    {importResult.errors.map((error, index) => (
                      <li key={index}>
                        • Fila {error.row}: {error.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {currentStep === "upload" && (
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          )}

          {currentStep === "preview" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setCurrentStep("upload")
                  setCsvFile(null)
                  setCsvContent("")
                  setPreview(null)
                }}
              >
                Atrás
              </Button>
              <Button
                onClick={handleImport}
                disabled={
                  isProcessing ||
                  preview?.validRows === 0 ||
                  (preview?.newContacts === 0 &&
                    preview?.duplicateContacts === 0)
                }
              >
                {isProcessing ? "Procesando..." : "Importar contactos"}
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
