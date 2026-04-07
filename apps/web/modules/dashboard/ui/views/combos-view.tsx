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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import type { Column } from "@workspace/ui/components/data-table"
import { Switch } from "@workspace/ui/components/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { DataViewerLayout } from "@workspace/ui/layout/data-viewer-layout"
import { useMutation, useQuery } from "convex/react"
import {
  DownloadIcon,
  EditIcon,
  HelpCircleIcon,
  LayersIcon,
  MapPinIcon,
  PackageIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"
import { formatPrice } from "../../../../lib/currency"
import { ComboAvailabilitySheet } from "../components/combo-availability-sheet"
import { ComboForm } from "../components/combo-form"
import { ComboImportDialog } from "../components/combo-import-dialog"

type ComboFromList = {
  _id: Id<"combos">
  _creationTime: number
  name: string
  description: string
  basePrice: number
  imageUrl?: string
  isActive: boolean
  organizationId: string
  slots: Array<{
    _id: Id<"comboSlots">
    _creationTime: number
    comboId: Id<"combos">
    name: string
    minSelections: number
    maxSelections: number
    sortOrder: number
    organizationId: string
    options: Array<{
      _id: Id<"comboSlotOptions">
      _creationTime: number
      comboSlotId: Id<"comboSlots">
      menuProductId: Id<"menuProducts">
      menuProductName: string
      upcharge: number
      isDefault?: boolean
      sortOrder: number
      organizationId: string
    }>
  }>
}

export const CombosView = () => {
  const { activeOrganizationId } = useOrganization()

  const [viewMode, setViewMode] = useState<"table" | "cards">("table")
  const isMobile = useIsMobile()

  useEffect(() => {
    setViewMode(isMobile ? "cards" : "table")
  }, [isMobile])

  const [comboToDelete, setComboToDelete] = useState<ComboFromList | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [exportTrigger, setExportTrigger] = useState<string | undefined>(
    undefined
  )
  const [isExporting, setIsExporting] = useState(false)
  const [comboFormOpen, setComboFormOpen] = useState(false)
  const [comboFormMode, setComboFormMode] = useState<"create" | "edit">(
    "create"
  )
  const [comboToEdit, setComboToEdit] = useState<ComboFromList | null>(null)
  const [availabilityCombo, setAvailabilityCombo] =
    useState<ComboFromList | null>(null)

  const combos = useQuery(
    api.private.combos.list,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  ) as ComboFromList[] | undefined
  const exportData = useQuery(
    api.private.combos.exportCombosToXlsx,
    activeOrganizationId && exportTrigger
      ? { organizationId: activeOrganizationId, trigger: exportTrigger }
      : "skip"
  )

  const toggleActive = useMutation(api.private.combos.toggleActive)
  const removeCombo = useMutation(api.private.combos.remove)

  const handleExport = () => {
    setIsExporting(true)
    setExportTrigger(Date.now().toString())
  }

  const handleToggleActive = async (combo: ComboFromList) => {
    if (!activeOrganizationId) return

    try {
      const result = await toggleActive({
        organizationId: activeOrganizationId,
        comboId: combo._id,
      })
      toast.success(result.isActive ? "Combo activado" : "Combo desactivado")
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleConfirmDelete = async () => {
    if (!comboToDelete || !activeOrganizationId) return

    setIsDeleting(true)
    try {
      await removeCombo({
        organizationId: activeOrganizationId,
        comboId: comboToDelete._id,
      })
      setComboToDelete(null)
      toast.success("Combo eliminado exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsDeleting(false)
    }
  }

  const getTotalOptions = (combo: ComboFromList) =>
    combo.slots.reduce((sum, slot) => sum + slot.options.length, 0)

  const handleCreateCombo = () => {
    setComboToEdit(null)
    setComboFormMode("create")
    setComboFormOpen(true)
  }

  const handleEditCombo = (combo: ComboFromList) => {
    setComboToEdit(combo)
    setComboFormMode("edit")
    setComboFormOpen(true)
  }

  const handleOpenAvailability = (combo: ComboFromList) => {
    setAvailabilityCombo(combo)
  }

  const comboColumns: Column<ComboFromList>[] = [
    {
      key: "name",
      header: "Nombre",
      render: (combo) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <PackageIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-medium">{combo.name}</div>
            {combo.description && (
              <p className="max-w-[300px] truncate text-muted-foreground text-xs">
                {combo.description}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "basePrice",
      header: "Precio Base",
      render: (combo) => (
        <span className="font-medium">{formatPrice(combo.basePrice)}</span>
      ),
    },
    {
      key: "slots",
      header: "Slots",
      render: (combo) => (
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {combo.slots.length} {combo.slots.length === 1 ? "slot" : "slots"}
          </Badge>
          <Badge variant="outline">
            {getTotalOptions(combo)}{" "}
            {getTotalOptions(combo) === 1 ? "opción" : "opciones"}
          </Badge>
        </div>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (combo) => (
        <div className="flex items-center gap-3">
          <Switch
            checked={combo.isActive}
            onCheckedChange={() => handleToggleActive(combo)}
          />
          <Badge variant={combo.isActive ? "default" : "secondary"}>
            {combo.isActive ? "Activo" : "Inactivo"}
          </Badge>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (combo) => (
        <TooltipProvider>
          <div className="flex items-center justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditCombo(combo)}
                  className="h-8 w-8 p-0"
                >
                  <EditIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Editar combo</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenAvailability(combo)}
                  className="h-8 w-8 p-0"
                >
                  <MapPinIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Disponibilidad por sucursal</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setComboToDelete(combo)}
                  className="h-8 w-8 p-0 hover:text-destructive"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Eliminar combo</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ),
    },
  ]

  const renderComboCard = (combo: ComboFromList) => (
    <Card className="gap-2 transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <PackageIcon className="h-4 w-4" />
              </div>
              <span className="truncate">{combo.name}</span>
            </CardTitle>
            {combo.description && (
              <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                {combo.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditCombo(combo)}
                    className="h-8 w-8 p-0"
                  >
                    <EditIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Editar combo</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenAvailability(combo)}
                    className="h-8 w-8 p-0"
                  >
                    <MapPinIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Disponibilidad por sucursal</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setComboToDelete(combo)}
                    className="h-8 w-8 p-0 hover:text-destructive"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Eliminar combo</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-lg">
            {formatPrice(combo.basePrice)}
          </span>
          <div className="flex items-center gap-3">
            <Switch
              checked={combo.isActive}
              onCheckedChange={() => handleToggleActive(combo)}
            />
            <Badge variant={combo.isActive ? "default" : "secondary"}>
              {combo.isActive ? "Activo" : "Inactivo"}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            <LayersIcon className="mr-1 h-3 w-3" />
            {combo.slots.length} {combo.slots.length === 1 ? "slot" : "slots"}
          </Badge>
          <Badge variant="outline">
            {getTotalOptions(combo)}{" "}
            {getTotalOptions(combo) === 1 ? "opción" : "opciones"}
          </Badge>
        </div>

        {combo.slots.length > 0 && (
          <div>
            <p className="mb-2 text-muted-foreground text-sm">Slots</p>
            <div className="flex flex-wrap gap-1">
              {combo.slots.slice(0, 3).map((slot) => (
                <Badge key={slot._id} variant="outline" className="text-xs">
                  {slot.name}
                  <span className="ml-1 text-muted-foreground">
                    ({slot.options.length})
                  </span>
                </Badge>
              ))}
              {combo.slots.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{combo.slots.length - 3} más
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )

  useEffect(() => {
    // exportData is undefined while loading, null if query returned null, or a base64 string
    if (!exportTrigger) return
    if (exportData === undefined) return // still loading

    try {
      if (typeof exportData === "string" && exportData.length > 0) {
        const date = new Date().toISOString().split("T")[0]
        const filename = `combos-export-${date}.xlsx`

        const binaryString = atob(exportData)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast.success("Combos exportados exitosamente")
      } else {
        toast.error("No hay datos para exportar")
      }
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsExporting(false)
      setExportTrigger(undefined)
    }
  }, [exportData, exportTrigger])

  useEffect(() => {
    if (!activeOrganizationId && isExporting) {
      setIsExporting(false)
      setExportTrigger(undefined)
    }
  }, [activeOrganizationId, isExporting])

  return (
    <>
      <DataViewerLayout
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/combos/import-guide">
              <Button variant="outline" className="flex items-center gap-2">
                <HelpCircleIcon className="h-4 w-4" />
                Guía de Importación
              </Button>
            </Link>
            <Button
              onClick={() => setIsImportDialogOpen(true)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <UploadIcon className="h-4 w-4" />
              Importar
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting}
              variant="outline"
              className="flex items-center gap-2"
            >
              <DownloadIcon className="h-4 w-4" />
              {isExporting ? "Exportando..." : "Exportar"}
            </Button>
            <Button
              onClick={handleCreateCombo}
              className="flex items-center gap-2"
            >
              <PlusIcon className="h-4 w-4" />
              Crear Combo
            </Button>
          </div>
        }
        data={combos || []}
        tableColumns={comboColumns}
        renderCard={renderComboCard}
        loading={combos === undefined}
        error={null}
        emptyState={{
          icon: <PackageIcon className="h-12 w-12" />,
          title: "No hay combos",
          description:
            "No hay combos registrados. Crea el primer combo para comenzar.",
        }}
        itemName={{ singular: "combo", plural: "combos" }}
      />

      <AlertDialog
        open={!!comboToDelete}
        onOpenChange={(open) => !open && setComboToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar combo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar el combo{" "}
              <strong>{comboToDelete?.name}</strong>? Esta acción eliminará
              también todos los slots y opciones asociados. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ComboForm
        open={comboFormOpen}
        onOpenChange={setComboFormOpen}
        combo={comboToEdit}
        mode={comboFormMode}
      />

      <ComboAvailabilitySheet
        open={!!availabilityCombo}
        onOpenChange={(open) => !open && setAvailabilityCombo(null)}
        combo={availabilityCombo}
      />

      <ComboImportDialog
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
      />
    </>
  )
}
