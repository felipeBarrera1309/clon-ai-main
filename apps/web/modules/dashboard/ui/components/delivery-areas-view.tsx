"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Doc, Id } from "@workspace/backend/_generated/dataModel"
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
// Card components removed (not used after refactor)
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import type { Column } from "@workspace/ui/components/data-table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { SmartHorizontalScrollArea } from "@workspace/ui/components/smart-horizontal-scroll-area"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import { DataViewerLayout } from "@workspace/ui/layout/data-viewer-layout"
import { useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { format, formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  DollarSignIcon,
  EditIcon,
  FileSpreadsheet,
  FilterIcon,
  HelpCircleIcon,
  MapPinIcon,
  NavigationIcon,
  PackageIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
import { useOrganization } from "@/hooks/use-organization"
// removed unused imports
import { validateAndNormalizeCoordinates } from "@/lib/coordinate-utils"
import { handleConvexError } from "@/lib/error-handling"
import { CoverageAreaImportDialog } from "./coverage-area-import-dialog"
import { DeliveryAreasExportSelector } from "./delivery-areas-export-selector"
import { ScheduleManager } from "./schedule-manager"
import { SeedDeliveryAreasDialog } from "./seed-delivery-areas-dialog"

const DeliveryMap = dynamic(
  () => import("./delivery-map").then((mod) => mod.DeliveryMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[600px] w-full animate-pulse items-center justify-center rounded-lg bg-muted">
        <p className="text-muted-foreground">Cargando mapa...</p>
      </div>
    ),
  }
)

const DeliveryAreaMapEditor = dynamic(
  () =>
    import("./delivery-area-map-editor").then(
      (mod) => mod.DeliveryAreaMapEditor
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[400px] w-full animate-pulse items-center justify-center rounded-lg bg-muted">
        <p className="text-muted-foreground">Cargando editor de mapa...</p>
      </div>
    ),
  }
)

export const DeliveryAreasView = () => {
  const { activeOrganizationId } = useOrganization()
  const [showSeedDialog, setShowSeedDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all")
  const [navigationLocationId, setNavigationLocationId] =
    useState<string>("general")

  // Bulk operations state
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false)
  const [showBulkActivateDialog, setShowBulkActivateDialog] = useState(false)
  const [showBulkDeactivateDialog, setShowBulkDeactivateDialog] =
    useState(false)
  const [isBulkOperating, setIsBulkOperating] = useState(false)
  const [selectedBulkLocationId, setSelectedBulkLocationId] =
    useState<string>("")

  // Database queries and mutations
  const areas = useQuery(
    api.private.deliveryAreas.getByOrganization,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  const locations = useQuery(
    api.private.restaurantLocations.list,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )

  const createAreaMutation = useMutation(api.private.deliveryAreas.create)
  const updateAreaMutation = useMutation(api.private.deliveryAreas.update)
  const deleteAreaMutation = useMutation(api.private.deliveryAreas.remove)
  const seedAreasMutation = useMutation(
    api.private.seedDeliveryAreas.seedDeliveryAreas
  )

  // Bulk operations mutations
  const deleteAllByLocationMutation = useMutation(
    api.private.deliveryAreas.deleteAllByLocationId
  )
  const activateAllByLocationMutation = useMutation(
    api.private.deliveryAreas.activateAllByLocationId
  )
  const deactivateAllByLocationMutation = useMutation(
    api.private.deliveryAreas.deactivateAllByLocationId
  )
  // Batch delete by IDs (used for selection-based bulk delete)
  const batchDeleteMutation = useMutation(api.private.deliveryAreas.batchDelete)

  // Auto-center on first location if there's only one location
  useEffect(() => {
    if (locations && locations.length === 1 && locations[0]) {
      setNavigationLocationId(locations[0]._id)
    }
  }, [locations])

  // --- DataViewerLayout / table state (refactor from delivery-areas-table) ---
  const [viewMode, setViewMode] = useState<"table" | "cards">("table")

  // Pagination state
  const [pageSize, setPageSize] = useState(10)
  const [cursor, setCursor] = useState<string | null>(null)
  const [prevCursors, setPrevCursors] = useState<string[]>([])

  // Search (debounced)
  const {
    value: searchValue,
    debouncedValue: searchQuery,
    setValue: setSearchValue,
    clearSearch,
    isSearching,
  } = useDebouncedSearch("", 300)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [locationFilter, setLocationFilter] = useState<string>("all")

  // Pagination handlers
  const handleNext = () => {
    if (areasPaginated?.continueCursor) {
      setPrevCursors((prev) => [...prev, cursor || ""])
      setCursor(areasPaginated.continueCursor)
    }
  }

  const handlePrev = () => {
    if (prevCursors.length > 0) {
      const newPrevCursors = [...prevCursors]
      const prevCursor = newPrevCursors.pop()
      setPrevCursors(newPrevCursors)
      setCursor(prevCursor || null)
    }
  }

  const resetPagination = () => {
    setCursor(null)
    setPrevCursors([])
  }

  // Reset pagination when filters/search change
  useEffect(() => {
    setCursor(null)
    setPrevCursors([])
  }, [])

  // Query paginated areas for the DataViewerLayout
  const areasPaginated = useQuery(
    api.private.deliveryAreas.getByOrganizationPaginated,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          paginationOpts: { numItems: pageSize, cursor },
          statusFilter,
          locationFilter:
            locationFilter !== "all"
              ? (locationFilter as Id<"restaurantLocations">)
              : undefined,
          searchQuery: searchQuery,
        }
      : "skip"
  )

  // Build enhanced areas with location details (for table/cards)
  const locationLookup = new Map((locations || []).map((l) => [l._id, l]))
  const paginatedPage = areasPaginated?.page || []
  const enhancedAreas = paginatedPage.map((area) => ({
    ...area,
    restaurantLocationName: locationLookup.get(area.restaurantLocationId)?.name,
    restaurantLocationColor: locationLookup.get(area.restaurantLocationId)
      ?.color,
  }))

  const isLoadingTable = areasPaginated === undefined
  const hasErrorTable =
    areasPaginated instanceof Error ||
    areasPaginated instanceof ConvexError ||
    areasPaginated === null

  // Selection state for table rows (by area _id)
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set())

  const toggleSelect = (id: string) => {
    setSelectedSet((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isAllVisibleSelected =
    enhancedAreas.length > 0 &&
    enhancedAreas.every((a) => selectedSet.has(a._id))

  const toggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      // unselect visible
      setSelectedSet((prev) => {
        const next = new Set(prev)
        enhancedAreas.forEach((a) => {
          next.delete(a._id)
        })
        return next
      })
    } else {
      // select visible
      setSelectedSet((prev) => {
        const next = new Set(prev)
        enhancedAreas.forEach((a) => {
          next.add(a._id)
        })
        return next
      })
    }
  }

  // --- Create Area dialog state and form (kept at top level to follow hooks rules) ---
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    isActive: true,
    deliveryFee: "",
    minimumOrder: "",
    estimatedDeliveryTime: "",
    coordinates: [] as { lat: number; lng: number }[],
    restaurantLocationId: "" as Id<"restaurantLocations">,
    openingHours: undefined as
      | undefined
      | Array<{
          id?: string
          day:
            | "monday"
            | "tuesday"
            | "wednesday"
            | "thursday"
            | "friday"
            | "saturday"
            | "sunday"
          ranges: Array<{ open: string; close: string }>
        }>,
  })

  const [isCreateScheduleOpen, setIsCreateScheduleOpen] = useState(false)

  const resetCreateForm = () => {
    setCreateForm({
      name: "",
      description: "",
      isActive: true,
      deliveryFee: "",
      minimumOrder: "",
      estimatedDeliveryTime: "",
      coordinates: [],
      restaurantLocationId: "" as Id<"restaurantLocations">,
      openingHours: undefined,
    })
    setEditingArea(null)
  }

  // Editing state for per-item edit
  const [editingArea, setEditingArea] = useState<Doc<"deliveryAreas"> | null>(
    null
  )

  // Per-item delete dialog state
  const [areaToDelete, setAreaToDelete] = useState<Doc<"deliveryAreas"> | null>(
    null
  )
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const handleCreateSubmit = async () => {
    // validate coordinates
    const coordinateValidation = validateAndNormalizeCoordinates(
      createForm.coordinates
    )
    if (!coordinateValidation.isValid) {
      toast.error("Las coordenadas no son válidas")
      return
    }

    const newArea = {
      name: createForm.name,
      description: createForm.description || undefined,
      coordinates: coordinateValidation.normalizedCoordinates,
      isActive: createForm.isActive,
      deliveryFee: createForm.deliveryFee
        ? Number.parseFloat(createForm.deliveryFee)
        : undefined,
      minimumOrder: createForm.minimumOrder
        ? Number.parseFloat(createForm.minimumOrder)
        : undefined,
      estimatedDeliveryTime: createForm.estimatedDeliveryTime || undefined,
      restaurantLocationId: createForm.restaurantLocationId,
      openingHours: createForm.openingHours
        ? createForm.openingHours.map((hour) => ({
            day: hour.day,
            ranges: hour.ranges,
          }))
        : undefined,
    }

    try {
      if (editingArea) {
        // update
        await handleUpdateArea(
          editingArea._id,
          newArea as Partial<Doc<"deliveryAreas">>
        )
        toast.success("Área actualizada")
      } else {
        await handleCreateArea(newArea)
        toast.success("Área creada")
      }
      resetCreateForm()
      setIsCreateDialogOpen(false)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  // Selected bulk delete dialog state
  const [showSelectedBulkDeleteDialog, setShowSelectedBulkDeleteDialog] =
    useState(false)
  const [isSelectedBulkDeleting, setIsSelectedBulkDeleting] = useState(false)

  const handleShowSelectedBulkDeleteDialog = () =>
    setShowSelectedBulkDeleteDialog(true)

  const handleConfirmBulkDeleteSelected = async () => {
    if (selectedSet.size === 0 || !activeOrganizationId) return
    setIsSelectedBulkDeleting(true)
    try {
      const ids = Array.from(selectedSet) as Id<"deliveryAreas">[]
      await batchDeleteMutation({
        organizationId: activeOrganizationId,
        areaIds: ids,
      })
      setSelectedSet(new Set())
      setShowSelectedBulkDeleteDialog(false)
      toast.success(`Se eliminaron ${ids.length} áreas seleccionadas`)
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsSelectedBulkDeleting(false)
    }
  }

  // Define columns (adapted from delivery-areas-table)
  const areaColumns: Column<(typeof enhancedAreas)[number]>[] = [
    {
      key: "select",
      header: (
        <Checkbox
          checked={isAllVisibleSelected}
          onCheckedChange={() => toggleSelectAllVisible()}
          aria-label="Seleccionar todas las áreas"
        />
      ),
      render: (area) => (
        <Checkbox
          checked={selectedSet.has(area._id)}
          onCheckedChange={() => toggleSelect(area._id)}
          aria-label={`Seleccionar ${area.name}`}
        />
      ),
      className: "w-12",
    },
    {
      key: "name",
      header: "Área",
      render: (area) => (
        <div className="flex items-center gap-2">
          <div
            className="h-4 w-4 rounded-full border"
            style={{
              backgroundColor: area.restaurantLocationColor || "#3b82f6",
            }}
          />
          <div>
            <div className="font-medium">{area.name}</div>
            {area.description && (
              <div className="max-w-[150px] truncate text-muted-foreground text-sm">
                {area.description}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "restaurantLocation",
      header: "Ubicación",
      render: (area) => (
        <div className="flex items-center gap-2">
          <MapPinIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            {area.restaurantLocationName || "Sin asignar"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (area) => (
        <Badge variant={area.isActive ? "default" : "secondary"}>
          {area.isActive ? "Activa" : "Inactiva"}
        </Badge>
      ),
    },
    {
      key: "pricing",
      header: "Precios",
      render: (area) => (
        <div className="flex flex-col gap-1 text-sm">
          {area.deliveryFee !== undefined && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <DollarSignIcon className="h-3 w-3" />
              Entrega: ${area.deliveryFee}
            </div>
          )}
          {area.minimumOrder !== undefined && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <PackageIcon className="h-3 w-3" />
              Mínimo: ${area.minimumOrder}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "deliveryTime",
      header: "Tiempo",
      render: (area) =>
        area.estimatedDeliveryTime ? (
          <div className="flex items-center gap-1 text-muted-foreground text-sm">
            <ClockIcon className="h-4 w-4" />
            {area.estimatedDeliveryTime}
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">No definido</span>
        ),
    },
    {
      key: "coordinates",
      header: "Coordenadas",
      render: (area) => (
        <div className="text-muted-foreground text-sm">
          {area.coordinates.length} puntos
        </div>
      ),
    },
    {
      key: "created",
      header: "Fecha de Creación",
      render: (area) => (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <CalendarIcon className="h-4 w-4" />
          <div className="flex flex-col">
            <span>
              {format(new Date(area._creationTime), "dd/MM/yyyy", {
                locale: es,
              })}
            </span>
            <span className="text-xs">
              {formatDistanceToNow(new Date(area._creationTime), {
                addSuffix: true,
                locale: es,
              })}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (area) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // open edit dialog prefilled
              setEditingArea(area)
              setCreateForm({
                name: area.name,
                description: area.description || "",
                isActive: area.isActive,
                deliveryFee: area.deliveryFee?.toString() || "",
                minimumOrder: area.minimumOrder?.toString() || "",
                estimatedDeliveryTime: area.estimatedDeliveryTime || "",
                coordinates: area.coordinates,
                restaurantLocationId: area.restaurantLocationId,
                openingHours: area.openingHours
                  ? area.openingHours.map((h, i) => ({
                      id: `hour-${i}`,
                      day: h.day,
                      ranges: h.ranges,
                    }))
                  : undefined,
              })
              setIsCreateDialogOpen(true)
            }}
            className="h-8 w-8 p-0"
          >
            <EditIcon className="h-4 w-4" />
            <span className="sr-only">Editar</span>
          </Button>
          <Switch
            checked={area.isActive}
            onCheckedChange={() =>
              handleUpdateArea(area._id, { isActive: !area.isActive })
            }
            aria-label={area.isActive ? "Desactivar área" : "Activar área"}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAreaToDelete(area)
              setShowDeleteDialog(true)
            }}
            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
          >
            <Trash2Icon className="h-4 w-4" />
            <span className="sr-only">Eliminar</span>
          </Button>
        </div>
      ),
    },
  ]

  // Loading state
  if (areas === undefined) {
    return <></>
  }

  // Filter areas based on selected location
  const filteredAreas =
    selectedLocationId === "all"
      ? areas
      : areas.filter((area) => area.restaurantLocationId === selectedLocationId)

  // Find navigation location for map centering (separate from filtering)
  const navigationLocation =
    navigationLocationId === "general"
      ? null
      : locations?.find((loc) => loc._id === navigationLocationId)

  // Map data for DeliveryAreasExportSelector
  const mappedAreas = areas.map((area) => ({
    id: area._id,
    name: area.name,
    description: area.description,
    coordinates: area.coordinates.map(
      (coord) => [coord.lat, coord.lng] as [number, number]
    ),
    locationId: area.restaurantLocationId,
    deliveryFee: area.deliveryFee,
    minimumOrder: area.minimumOrder,
    estimatedDeliveryTime: area.estimatedDeliveryTime,
    openingHours: area.openingHours,
  }))

  const mappedLocations =
    locations?.map((loc) => ({
      id: loc._id,
      name: loc.name,
    })) || []

  const handleSeedAreas = () => {
    setShowSeedDialog(true)
  }

  const handleImport = () => {
    setShowImportDialog(true)
  }

  const handleConfirmSeedAreas = async (restaurantLocationId: string) => {
    if (!activeOrganizationId) return
    setIsSeeding(true)
    try {
      const result = await seedAreasMutation({
        organizationId: activeOrganizationId,
        restaurantLocationId,
      })
      toast.success("Áreas de entrega cargadas exitosamente")
      setShowSeedDialog(false)
      if (result.success && result.createdAreaIds) {
        toast.success(
          `Se crearon ${result.createdAreaIds.length} áreas de entrega`
        )
      }
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsSeeding(false)
    }
  }

  const handleImportComplete = () => {
    setShowImportDialog(false)
    // The areas query will automatically refresh
  }

  const handleCreateArea = async (
    newArea: Omit<
      Doc<"deliveryAreas">,
      "_id" | "_creationTime" | "organizationId"
    >
  ) => {
    if (!activeOrganizationId) return
    try {
      await createAreaMutation({
        organizationId: activeOrganizationId,
        name: newArea.name,
        description: newArea.description,
        coordinates: newArea.coordinates,
        isActive: newArea.isActive,
        deliveryFee: newArea.deliveryFee,
        minimumOrder: newArea.minimumOrder,
        estimatedDeliveryTime: newArea.estimatedDeliveryTime,
        restaurantLocationId: newArea.restaurantLocationId,
      })
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleUpdateArea = async (
    id: Id<"deliveryAreas">,
    updates: Partial<Doc<"deliveryAreas">>
  ) => {
    if (!activeOrganizationId) return
    try {
      // Get the current area to ensure we have the restaurantLocationId
      const currentArea = areas?.find((area) => area._id === id)
      if (!currentArea) {
        throw new Error("Area not found")
      }

      await updateAreaMutation({
        organizationId: activeOrganizationId,
        id: id,
        name: updates.name,
        description: updates.description,
        coordinates: updates.coordinates,
        isActive: updates.isActive,
        deliveryFee: updates.deliveryFee,
        minimumOrder: updates.minimumOrder,
        estimatedDeliveryTime: updates.estimatedDeliveryTime,
        restaurantLocationId: currentArea.restaurantLocationId,
        openingHours:
          updates.openingHours === undefined ? null : updates.openingHours,
      })
      toast.success("Área de entrega actualizada exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleDeleteArea = async (id: Id<"deliveryAreas">) => {
    if (!activeOrganizationId) return
    try {
      await deleteAreaMutation({
        organizationId: activeOrganizationId,
        id: id,
      })
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  // Bulk operation dialog handlers
  const handleShowBulkDeleteDialog = (locationId: string) => {
    setSelectedBulkLocationId(locationId)
    setShowBulkDeleteDialog(true)
  }

  const handleShowBulkActivateDialog = (locationId: string) => {
    setSelectedBulkLocationId(locationId)
    setShowBulkActivateDialog(true)
  }

  const handleShowBulkDeactivateDialog = (locationId: string) => {
    setSelectedBulkLocationId(locationId)
    setShowBulkDeactivateDialog(true)
  }

  // Bulk operation handlers
  const handleBulkDeleteAll = async () => {
    if (!selectedBulkLocationId || !activeOrganizationId) return

    setIsBulkOperating(true)
    try {
      const result = await deleteAllByLocationMutation({
        organizationId: activeOrganizationId,
        restaurantLocationId:
          selectedBulkLocationId as Id<"restaurantLocations">,
      })
      const locationName =
        locations?.find((loc) => loc._id === selectedBulkLocationId)?.name ||
        "la ubicación"
      toast.success(
        `Se eliminaron ${result.deletedCount} áreas de entrega de ${locationName} exitosamente`
      )
      setShowBulkDeleteDialog(false)
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsBulkOperating(false)
    }
  }

  const handleBulkActivateAll = async () => {
    if (!selectedBulkLocationId || !activeOrganizationId) return

    setIsBulkOperating(true)
    try {
      const result = await activateAllByLocationMutation({
        organizationId: activeOrganizationId,
        restaurantLocationId:
          selectedBulkLocationId as Id<"restaurantLocations">,
      })
      const locationName =
        locations?.find((loc) => loc._id === selectedBulkLocationId)?.name ||
        "la ubicación"
      toast.success(
        `Se activaron ${result.updatedCount} áreas de entrega de ${locationName} exitosamente`
      )
      setShowBulkActivateDialog(false)
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsBulkOperating(false)
    }
  }

  const handleBulkDeactivateAll = async () => {
    if (!selectedBulkLocationId || !activeOrganizationId) return

    setIsBulkOperating(true)
    try {
      const result = await deactivateAllByLocationMutation({
        organizationId: activeOrganizationId,
        restaurantLocationId:
          selectedBulkLocationId as Id<"restaurantLocations">,
      })
      const locationName =
        locations?.find((loc) => loc._id === selectedBulkLocationId)?.name ||
        "la ubicación"
      toast.success(
        `Se desactivaron ${result.updatedCount} áreas de entrega de ${locationName} exitosamente`
      )
      setShowBulkDeactivateDialog(false)
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsBulkOperating(false)
    }
  }

  return (
    <>
      <div className="flex flex-col flex-wrap justify-between gap-2.5 lg:flex-row">
        <SmartHorizontalScrollArea
          containerClassName="w-full lg:w-fit"
          className="w-full lg:w-fit"
        >
          <div className="flex items-center justify-end gap-1">
            <Link href="/delivery-areas/kml-import-guide">
              <Button variant="outline" className="flex items-center gap-2">
                <HelpCircleIcon className="h-4 w-4" />
                Guía KML
              </Button>
            </Link>
            <Link href="/delivery-areas/csv-import-guide">
              <Button variant="outline" className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Guía CSV
              </Button>
            </Link>
            <Button
              onClick={handleImport}
              variant="outline"
              className="flex items-center gap-2"
            >
              <UploadIcon className="h-4 w-4" />
              Importar
            </Button>
            {areas.length === 0 && (
              <Button onClick={handleSeedAreas} variant="outline">
                Cargar Áreas de Ejemplo
              </Button>
            )}
            <DeliveryAreasExportSelector
              areas={mappedAreas}
              locations={mappedLocations}
            />
          </div>
        </SmartHorizontalScrollArea>
        {locations && locations.length > 0 && (
          <div className="flex flex-wrap gap-3 lg:place-content-end">
            <div className="flex items-center gap-2">
              <NavigationIcon className="h-4 w-4 text-blue-500" />
              <div className="flex flex-col gap-1">
                <Select
                  value={navigationLocationId}
                  onValueChange={setNavigationLocationId}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Navegar a..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">Vista general</SelectItem>
                    {locations.map((location) => (
                      <SelectItem key={location._id} value={location._id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <FilterIcon className="h-4 w-4 text-primary" />
              <div className="flex flex-col gap-1">
                <Select
                  value={selectedLocationId}
                  onValueChange={setSelectedLocationId}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Filtrar por..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las áreas</SelectItem>
                    {locations.map((location) => (
                      <SelectItem key={location._id} value={location._id}>
                        Solo {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
      </div>

      {filteredAreas.length === 0 ? (
        <div className="flex h-[600px] w-full items-center justify-center rounded-lg border bg-muted/10">
          <div className="space-y-4 text-center">
            <h3 className="font-semibold text-lg">
              {selectedLocationId === "all"
                ? "No hay áreas de entrega configuradas"
                : "No hay áreas de entrega para esta ubicación"}
            </h3>
            <p className="text-muted-foreground">
              {selectedLocationId === "all"
                ? "Crea nuevas áreas o importa desde archivos KML o CSV"
                : 'Crea nuevas áreas para esta ubicación o selecciona "Todas las ubicaciones" para ver todas las áreas'}
            </p>
            <div className="flex justify-center gap-2">
              <Button onClick={handleImport} variant="outline">
                Importar
              </Button>
              {areas.length === 0 && (
                <Button onClick={handleSeedAreas} variant="outline">
                  Cargar Áreas de Ejemplo
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <DeliveryMap
          areas={filteredAreas}
          locations={locations || []}
          selectedLocation={navigationLocation}
        />
      )}

      {/* DataViewerLayout con paginación y tabla */}
      <DataViewerLayout
        className="p-0"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchProps={{
          value: searchValue,
          onChange: setSearchValue,
          placeholder: "Buscar por nombre, descripción o ubicación...",
        }}
        filters={
          <>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Estado</SelectItem>
                <SelectItem value="active">Activas</SelectItem>
                <SelectItem value="inactive">Inactivas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Ubicación" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ubicaciones</SelectItem>
                {locations?.map((location) => (
                  <SelectItem key={location._id} value={location._id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        actions={
          <>
            {selectedSet.size > 0 && (
              <Button
                onClick={handleShowSelectedBulkDeleteDialog}
                variant="destructive"
              >
                Eliminar {selectedSet.size} seleccionada
                {selectedSet.size !== 1 ? "s" : ""}
              </Button>
            )}
            {/* Per-location bulk actions dropdown (match DeliveryAreasAdmin) */}
            {locations && locations.length > 0 && areas && areas.length > 0 && (
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-52 justify-between"
                      disabled={isBulkOperating}
                    >
                      {isBulkOperating ? "Procesando..." : "Acciones masivas"}
                      <ChevronDownIcon className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    {locations.map((location) => {
                      const locationAreas = (areas || []).filter(
                        (area) => area.restaurantLocationId === location._id
                      )
                      if (locationAreas.length === 0) return null

                      return (
                        <div key={location._id}>
                          <div className="px-2 py-1.5 font-medium text-muted-foreground text-sm">
                            {location.name} ({locationAreas.length} áreas)
                          </div>
                          <DropdownMenuItem
                            onClick={() =>
                              handleShowBulkActivateDialog(location._id)
                            }
                            className="pl-4 text-green-600"
                            disabled={isBulkOperating}
                          >
                            <CheckIcon className="mr-2 h-4 w-4" />
                            Activar todas
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleShowBulkDeactivateDialog(location._id)
                            }
                            className="pl-4 text-orange-600"
                            disabled={isBulkOperating}
                          >
                            <XIcon className="mr-2 h-4 w-4" />
                            Desactivar todas
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleShowBulkDeleteDialog(location._id)
                            }
                            className="pl-4 text-red-600"
                            disabled={isBulkOperating}
                          >
                            <Trash2Icon className="mr-2 h-4 w-4" />
                            Eliminar todas
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </div>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            {/* Create Area dialog trigger */}
            <Dialog
              open={isCreateDialogOpen}
              onOpenChange={setIsCreateDialogOpen}
            >
              <DialogTrigger asChild>
                <Button variant="default">
                  <PlusIcon className="mr-2 size-4" />
                  Nueva Área
                </Button>
              </DialogTrigger>

              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Nueva área de entrega</DialogTitle>
                  <DialogDescription>
                    Crea una nueva área de entrega dibujando su polígono en el
                    mapa y completando los detalles.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="create-name">Nombre</Label>
                      <Input
                        id="create-name"
                        value={createForm.name}
                        onChange={(e) =>
                          setCreateForm((s) => ({ ...s, name: e.target.value }))
                        }
                        placeholder="ej. Zona Norte - Chapinero"
                      />
                    </div>
                    <div>
                      <Label>Ubicación</Label>
                      <Select
                        value={createForm.restaurantLocationId}
                        onValueChange={(v) =>
                          setCreateForm((s) => ({
                            ...s,
                            restaurantLocationId:
                              v as Id<"restaurantLocations">,
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona ubicación" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations?.map((loc) => (
                            <SelectItem key={loc._id} value={loc._id}>
                              {loc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="create-description">Descripción</Label>
                    <Textarea
                      id="create-description"
                      value={createForm.description}
                      onChange={(e) =>
                        setCreateForm((s) => ({
                          ...s,
                          description: e.target.value,
                        }))
                      }
                      placeholder="Descripción de la zona de entrega"
                    />
                  </div>

                  <div>
                    <Label>Área en el mapa</Label>
                    <DeliveryAreaMapEditor
                      coordinates={createForm.coordinates}
                      color={
                        locationLookup.get(createForm.restaurantLocationId)
                          ?.color || "#3b82f6"
                      }
                      onCoordinatesChange={(coords) =>
                        setCreateForm((s) => ({ ...s, coordinates: coords }))
                      }
                      existingAreas={(areas || [])
                        .filter((area) => area.isActive)
                        .map((area) => {
                          const loc = locations?.find(
                            (l) => l._id === area.restaurantLocationId
                          )
                          if (!loc) return null
                          return {
                            name: area.name,
                            coordinates: area.coordinates,
                            color: loc.color || "#3b82f6",
                            isActive: area.isActive,
                            restaurantLocationId: area.restaurantLocationId,
                            restaurantLocationName: loc.name,
                            restaurantLocationPriority: loc.priority || 0,
                            restaurantLocationColor: loc.color,
                          }
                        })
                        .filter((a): a is NonNullable<typeof a> => a !== null)}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="create-deliveryFee">
                        Costo Envío ($)
                      </Label>
                      <Input
                        id="create-deliveryFee"
                        type="number"
                        value={createForm.deliveryFee}
                        onChange={(e) =>
                          setCreateForm((s) => ({
                            ...s,
                            deliveryFee: e.target.value,
                          }))
                        }
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="create-minimumOrder">
                        Mínimo Pedido ($)
                      </Label>
                      <Input
                        id="create-minimumOrder"
                        type="number"
                        value={createForm.minimumOrder}
                        onChange={(e) =>
                          setCreateForm((s) => ({
                            ...s,
                            minimumOrder: e.target.value,
                          }))
                        }
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="create-estimatedDeliveryTime">
                        Tiempo estimado
                      </Label>
                      <Input
                        id="create-estimatedDeliveryTime"
                        value={createForm.estimatedDeliveryTime}
                        onChange={(e) =>
                          setCreateForm((s) => ({
                            ...s,
                            estimatedDeliveryTime: e.target.value,
                          }))
                        }
                        placeholder="ej. 30-45 min"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <Switch
                      id="create-isActive"
                      checked={createForm.isActive}
                      onCheckedChange={(v) =>
                        setCreateForm((s) => ({ ...s, isActive: !!v }))
                      }
                    />
                    <Label htmlFor="create-isActive">Área activa</Label>
                  </div>

                  {/* Opening Hours (collapsible) */}
                  <Collapsible
                    open={isCreateScheduleOpen}
                    onOpenChange={(open) => {
                      setIsCreateScheduleOpen(open)
                      if (!open) {
                        setCreateForm((prev) => ({
                          ...prev,
                          openingHours: undefined,
                        }))
                      }
                    }}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <ClockIcon className="h-4 w-4" />
                          <span>Horarios de Entrega (Opcional)</span>
                        </div>
                        <ChevronDownIcon
                          className={`h-4 w-4 transition-transform ${isCreateScheduleOpen ? "rotate-180" : ""}`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-3">
                      <div className="space-y-3">
                        <p className="text-muted-foreground text-sm">
                          Si no configuras horarios específicos, la zona usará
                          los horarios del restaurante. Los horarios aquí
                          configurados se aplicarán ADEMÁS de los horarios del
                          restaurante.
                        </p>
                        <ScheduleManager
                          available={true}
                          openingHours={createForm.openingHours?.map(
                            (h, i) => ({
                              id: h.id ?? `hour-${i}`,
                              day: h.day,
                              ranges: h.ranges,
                            })
                          )}
                          onScheduleChange={(data) =>
                            setCreateForm((prev) => ({
                              ...prev,
                              openingHours: data.openingHours,
                            }))
                          }
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleCreateSubmit}
                    disabled={
                      !createForm.name ||
                      !createForm.coordinates ||
                      createForm.coordinates.length === 0
                    }
                  >
                    Crear Área
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
        data={enhancedAreas}
        tableColumns={areaColumns}
        paginationProps={
          areasPaginated !== undefined
            ? {
                state: { pageSize, cursor, prevCursors },
                actions: {
                  setPageSize,
                  handleNext,
                  handlePrev,
                  resetPagination,
                },
                info: {
                  isDone: areasPaginated?.isDone ?? true,
                  continueCursor: areasPaginated?.continueCursor ?? null,
                },
                pageSizeOptions: [10, 20, 50],
              }
            : null
        }
        loading={isLoadingTable}
        error={
          hasErrorTable ? new Error("Error al cargar áreas de entrega") : null
        }
        emptyState={{
          icon: <MapPinIcon className="h-12 w-12" />,
          title: "No hay áreas de entrega",
          description: "Las áreas de entrega aparecerán aquí cuando las crees.",
        }}
        itemName={{ singular: "área", plural: "áreas" }}
      />

      {/* Bulk delete selected items dialog */}
      <AlertDialog
        open={showSelectedBulkDeleteDialog}
        onOpenChange={setShowSelectedBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar áreas seleccionadas?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente {selectedSet.size} área
              {selectedSet.size !== 1 ? "s" : ""} seleccionada
              {selectedSet.size !== 1 ? "s" : ""}. Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSelectedBulkDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBulkDeleteSelected}
              disabled={isSelectedBulkDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSelectedBulkDeleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SeedDeliveryAreasDialog
        open={showSeedDialog}
        onOpenChange={setShowSeedDialog}
        locations={locations || []}
        onConfirm={handleConfirmSeedAreas}
        isSeeding={isSeeding}
      />

      <CoverageAreaImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImportComplete={handleImportComplete}
        locations={locations || []}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar todas las áreas de entrega?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente todas las áreas de entrega
              de la ubicación{" "}
              <strong>
                {
                  locations?.find((loc) => loc._id === selectedBulkLocationId)
                    ?.name
                }
              </strong>
              . Esta acción no se puede deshacer.
              <br />
              <br />
              Se eliminarán{" "}
              <strong>
                {
                  areas.filter(
                    (area) =>
                      area.restaurantLocationId === selectedBulkLocationId
                  ).length
                }{" "}
                áreas
              </strong>{" "}
              de entrega.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkOperating}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteAll}
              disabled={isBulkOperating}
              className="bg-red-600 hover:bg-red-700"
            >
              {isBulkOperating ? "Eliminando..." : "Eliminar todas"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Activate Confirmation Dialog */}
      <AlertDialog
        open={showBulkActivateDialog}
        onOpenChange={setShowBulkActivateDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Activar todas las áreas de entrega?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción activará todas las áreas de entrega de la ubicación{" "}
              <strong>
                {
                  locations?.find((loc) => loc._id === selectedBulkLocationId)
                    ?.name
                }
              </strong>
              .
              <br />
              <br />
              Se activarán las áreas que actualmente están desactivadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkOperating}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkActivateAll}
              disabled={isBulkOperating}
              className="bg-green-600 hover:bg-green-700"
            >
              {isBulkOperating ? "Activando..." : "Activar todas"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Deactivate Confirmation Dialog */}
      <AlertDialog
        open={showBulkDeactivateDialog}
        onOpenChange={setShowBulkDeactivateDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Desactivar todas las áreas de entrega?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción desactivará todas las áreas de entrega de la ubicación{" "}
              <strong>
                {
                  locations?.find((loc) => loc._id === selectedBulkLocationId)
                    ?.name
                }
              </strong>
              .
              <br />
              <br />
              Las áreas desactivadas no estarán disponibles para entregas hasta
              que se reactiven.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkOperating}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeactivateAll}
              disabled={isBulkOperating}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isBulkOperating ? "Desactivando..." : "Desactivar todas"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Per-item Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {areaToDelete
                ? `Eliminar ${areaToDelete.name}?`
                : "Eliminar área?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la área de entrega{" "}
              <strong>{areaToDelete?.name}</strong>. Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (!areaToDelete) return
                try {
                  await handleDeleteArea(areaToDelete._id)
                  toast.success("Área eliminada")
                  setShowDeleteDialog(false)
                  setAreaToDelete(null)
                } catch (err) {
                  toast.error(handleConvexError(err))
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
