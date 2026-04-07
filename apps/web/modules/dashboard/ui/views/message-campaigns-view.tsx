"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { DataViewerLayout } from "@workspace/ui/layout/data-viewer-layout"
import { useMutation, useQuery } from "convex/react"
import {
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  EyeIcon,
  FileSpreadsheetIcon,
  FilterIcon,
  MailIcon,
  MapPinIcon,
  MoreHorizontalIcon,
  PauseCircleIcon,
  PlayIcon,
  PlusIcon,
  SendIcon,
  ShoppingCartIcon,
  TrashIcon,
  UserPlusIcon,
  UsersIcon,
  XCircleIcon,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { read, utils } from "xlsx"
import { z } from "zod"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"
import { ContactSelectorDialog } from "../components/contact-selector-dialog"

const formSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(100, "El nombre no puede tener más de 100 caracteres"),
  templateId: z.string().min(1, "Selecciona una plantilla"),
  // Recipient selection mode
  recipientSelectionMode: z.enum(["filters", "manual"]),
  // Filter-based selection
  allContacts: z.boolean(),
  // Advanced filters
  minOrderCount: z.string().optional(),
  maxOrderCount: z.string().optional(),
  hasNoOrders: z.boolean().optional(),
  lastOrderAfter: z.string().optional(),
  lastOrderBefore: z.string().optional(),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  restaurantLocationIds: z.array(z.string()).optional(),
  // Manual selection
  selectedContactIds: z.array(z.string()).optional(),
  scheduledAt: z.string().optional(),
  // Header media URL for templates with media headers (image, video, document)
  // Validación de URL comentada temporalmente
  headerImageUrl: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

const STATUS_CONFIG = {
  draft: { label: "Borrador", variant: "secondary" as const, icon: ClockIcon },
  scheduled: {
    label: "Programada",
    variant: "outline" as const,
    icon: CalendarIcon,
  },
  sending: { label: "Enviando", variant: "default" as const, icon: SendIcon },
  completed: {
    label: "Completada",
    variant: "default" as const,
    icon: CheckCircleIcon,
  },
  cancelled: {
    label: "Cancelada",
    variant: "destructive" as const,
    icon: XCircleIcon,
  },
}

interface MessageCampaignsViewProps {
  whatsappConfigId: Id<"whatsappConfigurations">
  wabaId: string
  provider?: "meta" | "twilio" | "360dialog"
}

export const MessageCampaignsView = ({
  whatsappConfigId,
  wabaId,
  provider = "meta",
}: MessageCampaignsViewProps) => {
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"table" | "cards">("table")
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [isContactSelectorOpen, setIsContactSelectorOpen] = useState(false)
  const isMobile = useIsMobile()
  const { activeOrganizationId } = useOrganization()

  useEffect(() => {
    setViewMode(isMobile ? "cards" : "table")
  }, [isMobile])

  const campaigns = useQuery(
    api.private.messageCampaigns.list,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          whatsappConfigurationId: whatsappConfigId,
        }
      : "skip"
  )

  const isTwilio = provider === "twilio"
  const isMeta = provider === "meta" || provider === "360dialog"

  // Get templates for this WABA (approved ones for campaign creation)
  const metaTemplates = useQuery(
    api.private.metaTemplates.listApproved,
    activeOrganizationId && isMeta
      ? { wabaId, organizationId: activeOrganizationId }
      : "skip"
  )

  // Get templates for Twilio (all statuses, filter approved later)
  const twilioTemplates = useQuery(
    api.private.twilioTemplates.listWithStatus,
    activeOrganizationId && isTwilio
      ? {
          organizationId: activeOrganizationId,
          twilioConfigId: whatsappConfigId,
        }
      : "skip"
  )

  const templates = isTwilio
    ? twilioTemplates
        ?.filter((t) => t.status?.toLowerCase() === "approved")
        .map((t) => ({ ...t, name: t.name, _id: t._id })) // Ensure compatibility if types differ slightly
    : metaTemplates
  const statistics = useQuery(
    api.private.messageCampaigns.getStatistics,
    activeOrganizationId
      ? {
          whatsappConfigurationId: whatsappConfigId,
          organizationId: activeOrganizationId,
        }
      : "skip"
  )
  const restaurantLocations = useQuery(
    api.private.restaurantLocations.list,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )

  const createMutation = useMutation(api.private.messageCampaigns.create)
  const sendMutation = useMutation(api.private.messageCampaigns.send)
  const cancelMutation = useMutation(api.private.messageCampaigns.cancel)
  const removeMutation = useMutation(api.private.messageCampaigns.remove)

  const importContactsBatchMutation = useMutation(
    api.private.contacts.importContactsBatch
  )

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      templateId: "",
      recipientSelectionMode: "filters",
      allContacts: true,
      minOrderCount: "",
      maxOrderCount: "",
      hasNoOrders: false,
      lastOrderAfter: "",
      lastOrderBefore: "",
      createdAfter: "",
      createdBefore: "",
      restaurantLocationIds: [],
      selectedContactIds: [],
      scheduledAt: "",
      headerImageUrl: "",
    },
  })

  const recipientSelectionMode = form.watch("recipientSelectionMode")
  const allContacts = form.watch("allContacts")
  const minOrderCount = form.watch("minOrderCount")
  const maxOrderCount = form.watch("maxOrderCount")
  const hasNoOrders = form.watch("hasNoOrders")
  const lastOrderAfter = form.watch("lastOrderAfter")
  const lastOrderBefore = form.watch("lastOrderBefore")
  const createdAfter = form.watch("createdAfter")
  const createdBefore = form.watch("createdBefore")
  const restaurantLocationIds = form.watch("restaurantLocationIds")
  const selectedContactIds = form.watch("selectedContactIds") || []
  const selectedTemplateId = form.watch("templateId")

  // Get selected template to check if it has image header
  const selectedTemplate = templates?.find((t) => t._id === selectedTemplateId)

  // Pre-fill header image from template when selected, clear when switching to template without one
  useEffect(() => {
    if (selectedTemplate?.headerImageUrl) {
      form.setValue("headerImageUrl", selectedTemplate.headerImageUrl)
    } else if (selectedTemplate) {
      // Clear stale value when switching to a template without header image
      form.setValue("headerImageUrl", "")
    }
  }, [
    selectedTemplate?._id,
    form,
    selectedTemplate?.headerImageUrl,
    selectedTemplate,
  ])

  // Handle Excel file upload for contacts
  const handleExcelUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file || !activeOrganizationId) return

      const toastId = toast.loading("Procesando archivo...")

      try {
        const arrayBuffer = await file.arrayBuffer()
        const wb = read(arrayBuffer)
        const sheetName = wb.SheetNames[0]
        if (!sheetName) {
          toast.error("El archivo Excel no tiene hojas válidas", {
            id: toastId,
          })
          return
        }
        const ws = wb.Sheets[sheetName]
        if (!ws) {
          toast.error("Error al leer la hoja del archivo", { id: toastId })
          return
        }
        const data = utils.sheet_to_json(ws) as any[]

        if (data.length === 0) {
          toast.error("El archivo está vacío", { id: toastId })
          return
        }

        // Map columns (try to be flexible)
        const contactsToImport = data
          .map((row) => {
            // Try to find phone number in various common column names
            const phoneNumber =
              row.telefono ||
              row.Telefono ||
              row.Teléfono ||
              row.TELEFONO ||
              row.phone ||
              row.Phone ||
              row.mobile ||
              row.celular ||
              row.Celular

            // Try to find name
            const displayName =
              row.nombre ||
              row.Nombre ||
              row.name ||
              row.Name ||
              row.cliente ||
              row.Cliente

            if (!phoneNumber) return null

            return {
              phoneNumber: String(phoneNumber),
              displayName: displayName ? String(displayName) : undefined,
            }
          })
          .filter((c) => c !== null) as {
          phoneNumber: string
          displayName?: string
        }[]

        if (contactsToImport.length === 0) {
          toast.error(
            "No se encontraron contactos válidos. Asegúrate de tener una columna 'telefono'.",
            { id: toastId }
          )
          return
        }

        // Limit batch size if necessary (Convex limits)
        if (contactsToImport.length > 1000) {
          toast.error(
            "El archivo contiene demasiados contactos. El límite es 1000 por lote.",
            { id: toastId }
          )
          return
        }

        const ids = await importContactsBatchMutation({
          organizationId: activeOrganizationId,
          contacts: contactsToImport,
        })

        if (ids.length > 0) {
          const currentIds = form.getValues("selectedContactIds") || []
          // Combine and deduplicate
          const newSet = new Set([...currentIds, ...ids])
          form.setValue("selectedContactIds", Array.from(newSet))
          toast.success(
            `${ids.length} contactos importados y seleccionados correctamente`,
            { id: toastId }
          )
        } else {
          toast.warning("No se importaron contactos nuevos o válidos", {
            id: toastId,
          })
        }
      } catch (error) {
        console.error("Error importing contacts:", error)
        toast.error("Error al procesar el archivo Excel", { id: toastId })
      } finally {
        event.target.value = ""
      }
    },
    [activeOrganizationId, importContactsBatchMutation, form]
  )
  // Get selected contacts info for display
  const selectedContactsInfo = useQuery(
    api.private.contacts.getByIds,
    selectedContactIds.length > 0 && activeOrganizationId
      ? {
          contactIds: selectedContactIds as Id<"contacts">[],
          organizationId: activeOrganizationId,
        }
      : "skip"
  )

  // Build filters for preview (only used in filter mode)
  const previewFilters = useMemo(() => {
    if (recipientSelectionMode === "manual") {
      return undefined // Don't use filters in manual mode
    }

    if (allContacts) {
      return { allContacts: true }
    }

    const filters: {
      allContacts?: boolean
      minOrderCount?: number
      maxOrderCount?: number
      hasNoOrders?: boolean
      lastOrderAfter?: number
      lastOrderBefore?: number
      createdAfter?: number
      createdBefore?: number
      restaurantLocationIds?: Id<"restaurantLocations">[]
    } = {}

    if (minOrderCount) {
      filters.minOrderCount = parseInt(minOrderCount, 10)
    }
    if (maxOrderCount) {
      filters.maxOrderCount = parseInt(maxOrderCount, 10)
    }
    if (hasNoOrders) {
      filters.hasNoOrders = true
    }
    if (lastOrderAfter) {
      filters.lastOrderAfter = new Date(lastOrderAfter).getTime()
    }
    if (lastOrderBefore) {
      filters.lastOrderBefore = new Date(lastOrderBefore).getTime()
    }
    if (createdAfter) {
      // Start of the day (00:00:00.000)
      filters.createdAfter = new Date(`${createdAfter}T00:00:00`).getTime()
    }
    if (createdBefore) {
      // End of the day (23:59:59.999)
      filters.createdBefore = new Date(
        `${createdBefore}T23:59:59.999`
      ).getTime()
    }
    if (restaurantLocationIds && restaurantLocationIds.length > 0) {
      filters.restaurantLocationIds =
        restaurantLocationIds as Id<"restaurantLocations">[]
    }

    // If no filters are set, default to all contacts
    if (Object.keys(filters).length === 0) {
      return { allContacts: true }
    }

    return filters
  }, [
    recipientSelectionMode,
    allContacts,
    minOrderCount,
    maxOrderCount,
    hasNoOrders,
    lastOrderAfter,
    lastOrderBefore,
    restaurantLocationIds,
    createdAfter,
    createdBefore,
  ])

  // Preview recipient count (only for filter mode)
  const recipientCount = useQuery(
    api.private.messageCampaigns.previewRecipientCount,
    recipientSelectionMode === "filters" &&
      previewFilters &&
      activeOrganizationId
      ? {
          recipientFilters: previewFilters,
          organizationId: activeOrganizationId,
        }
      : "skip"
  )

  // Effective recipient count based on selection mode
  const effectiveRecipientCount =
    recipientSelectionMode === "manual"
      ? selectedContactIds.length
      : recipientCount

  const handleCreate = async (data: FormData) => {
    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }

    // Validación de header media URL comentada temporalmente
    // const hasMediaHeader =
    //   selectedTemplate?.headerType === "image" ||
    //   selectedTemplate?.headerType === "video" ||
    //   selectedTemplate?.headerType === "document"
    //
    // if (hasMediaHeader && !data.headerImageUrl) {
    //   const mediaType =
    //     selectedTemplate?.headerType === "video"
    //       ? "un video"
    //       : selectedTemplate?.headerType === "document"
    //         ? "un documento"
    //         : "una imagen"
    //   toast.error(
    //     `Esta plantilla requiere ${mediaType} en el header. Por favor, proporciona una URL.`
    //   )
    //   return
    // }

    try {
      const scheduledAt = data.scheduledAt
        ? new Date(data.scheduledAt).getTime()
        : undefined

      if (data.recipientSelectionMode === "manual") {
        // Manual selection mode
        if (!data.selectedContactIds || data.selectedContactIds.length === 0) {
          toast.error("Debes seleccionar al menos un contacto")
          return
        }

        await createMutation({
          name: data.name,
          templateId: data.templateId as Id<"messageTemplates">,
          whatsappConfigurationId: whatsappConfigId,
          recipientSelectionMode: "manual",
          selectedContactIds: data.selectedContactIds as Id<"contacts">[],
          scheduledAt,
          organizationId: activeOrganizationId,
          headerImageUrl: data.headerImageUrl || undefined,
        })
      } else {
        // Filter-based selection mode
        let recipientFilters: {
          allContacts?: boolean
          minOrderCount?: number
          maxOrderCount?: number
          hasNoOrders?: boolean
          lastOrderAfter?: number
          lastOrderBefore?: number
          createdAfter?: number
          createdBefore?: number
          restaurantLocationIds?: Id<"restaurantLocations">[]
        }

        if (data.allContacts) {
          recipientFilters = { allContacts: true }
        } else {
          recipientFilters = {}
          if (data.minOrderCount) {
            recipientFilters.minOrderCount = parseInt(data.minOrderCount, 10)
          }
          if (data.maxOrderCount) {
            recipientFilters.maxOrderCount = parseInt(data.maxOrderCount, 10)
          }
          if (data.hasNoOrders) {
            recipientFilters.hasNoOrders = true
          }
          if (data.lastOrderAfter) {
            recipientFilters.lastOrderAfter = new Date(
              data.lastOrderAfter
            ).getTime()
          }
          if (data.lastOrderBefore) {
            recipientFilters.lastOrderBefore = new Date(
              data.lastOrderBefore
            ).getTime()
          }
          if (data.createdAfter) {
            recipientFilters.createdAfter = new Date(
              `${data.createdAfter}T00:00:00`
            ).getTime()
          }
          if (data.createdBefore) {
            recipientFilters.createdBefore = new Date(
              `${data.createdBefore}T23:59:59.999`
            ).getTime()
          }
          if (
            data.restaurantLocationIds &&
            data.restaurantLocationIds.length > 0
          ) {
            recipientFilters.restaurantLocationIds =
              data.restaurantLocationIds as Id<"restaurantLocations">[]
          }

          // If no filters, default to all contacts
          if (Object.keys(recipientFilters).length === 0) {
            recipientFilters = { allContacts: true }
          }
        }

        await createMutation({
          name: data.name,
          templateId: data.templateId as Id<"messageTemplates">,
          whatsappConfigurationId: whatsappConfigId,
          recipientSelectionMode: "filters",
          recipientFilters,
          scheduledAt,
          organizationId: activeOrganizationId,
          headerImageUrl: data.headerImageUrl || undefined,
        })
      }

      toast.success("Campaña creada exitosamente")
      setIsCreateDialogOpen(false)
      form.reset()
      setShowAdvancedFilters(false)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleSend = async (campaignId: Id<"messageCampaigns">) => {
    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }
    try {
      await sendMutation({ campaignId, organizationId: activeOrganizationId })
      toast.success("Campaña iniciada")
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleCancel = async (campaignId: Id<"messageCampaigns">) => {
    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }
    try {
      await cancelMutation({ campaignId, organizationId: activeOrganizationId })
      toast.success("Campaña cancelada")
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleDelete = async (campaignId: Id<"messageCampaigns">) => {
    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }
    try {
      await removeMutation({ campaignId, organizationId: activeOrganizationId })
      toast.success("Campaña eliminada")
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const filteredCampaigns = campaigns?.filter((campaign) =>
    campaign.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Count active filters
  const activeFilterCount = useMemo(() => {
    if (allContacts) return 0
    let count = 0
    if (minOrderCount) count++
    if (maxOrderCount) count++
    if (hasNoOrders) count++
    if (lastOrderAfter) count++
    if (lastOrderBefore) count++
    if (createdAfter) count++
    if (createdBefore) count++
    if (restaurantLocationIds && restaurantLocationIds.length > 0) count++
    return count
  }, [
    allContacts,
    minOrderCount,
    maxOrderCount,
    hasNoOrders,
    lastOrderAfter,
    lastOrderBefore,
    createdAfter,
    createdBefore,
    restaurantLocationIds,
  ])

  // Define table columns
  const tableColumns: Column<NonNullable<typeof campaigns>[number]>[] = [
    {
      key: "name",
      header: "Nombre",
      render: (campaign) => <div className="font-medium">{campaign.name}</div>,
    },
    {
      key: "template",
      header: "Plantilla",
      render: (campaign) => (
        <span className="text-muted-foreground">{campaign.templateName}</span>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (campaign) => {
        const config = STATUS_CONFIG[campaign.status]
        const Icon = config.icon
        return (
          <Badge variant={config.variant} className="gap-1">
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        )
      },
    },
    {
      key: "recipients",
      header: "Destinatarios",
      render: (campaign) => (
        <div className="flex items-center gap-1">
          <UsersIcon className="h-4 w-4 text-muted-foreground" />
          <span>{campaign.totalRecipients}</span>
        </div>
      ),
    },
    {
      key: "progress",
      header: "Progreso",
      render: (campaign) => {
        if (campaign.status === "draft" || campaign.status === "scheduled") {
          return <span className="text-muted-foreground">-</span>
        }
        const sent = campaign.sentCount
        const failed = campaign.failedCount
        const total = campaign.totalRecipients
        const processed = sent + failed
        const percentage = total > 0 ? Math.round((processed / total) * 100) : 0

        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="h-2 w-20 rounded-full bg-muted">
                <div
                  className={`h-2 rounded-full ${failed > 0 && sent === 0 ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-muted-foreground text-sm">
                {percentage}%
              </span>
            </div>
            {campaign.status === "completed" && (
              <div className="flex gap-2 text-xs">
                <span className="text-green-600">{sent} enviados</span>
                {failed > 0 && (
                  <span className="text-destructive">{failed} fallidos</span>
                )}
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: "actions",
      header: "Acciones",
      render: (campaign) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Abrir menú</span>
              <MoreHorizontalIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/bulk-messaging/campaigns/${campaign._id}`}>
                <EyeIcon className="mr-2 h-4 w-4" />
                Ver detalles
              </Link>
            </DropdownMenuItem>
            {(campaign.status === "draft" ||
              campaign.status === "scheduled") && (
              <DropdownMenuItem onClick={() => handleSend(campaign._id)}>
                <PlayIcon className="mr-2 h-4 w-4" />
                Enviar ahora
              </DropdownMenuItem>
            )}
            {campaign.status === "sending" && (
              <DropdownMenuItem onClick={() => handleCancel(campaign._id)}>
                <PauseCircleIcon className="mr-2 h-4 w-4" />
                Cancelar
              </DropdownMenuItem>
            )}
            {(campaign.status === "draft" ||
              campaign.status === "completed" ||
              campaign.status === "cancelled") && (
              <DropdownMenuItem
                onClick={() => handleDelete(campaign._id)}
                className="text-destructive"
              >
                <TrashIcon className="mr-2 h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      {statistics && (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">
                Total Campañas
              </CardTitle>
              <MailIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">
                {statistics.totalCampaigns}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">
                Mensajes Enviados
              </CardTitle>
              <SendIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">
                {statistics.totalMessagesSent}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">Entregados</CardTitle>
              <CheckCircleIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">
                {statistics.totalMessagesDelivered}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">Fallidos</CardTitle>
              <XCircleIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl text-destructive">
                {statistics.totalMessagesFailed}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">
                Tasa de Entrega
              </CardTitle>
              <CheckCircleIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">
                {statistics.deliveryRate}%
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <DataViewerLayout
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchProps={{
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: "Buscar campañas...",
        }}
        actions={
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={(open) => {
              setIsCreateDialogOpen(open)
              if (!open) {
                form.reset()
                setShowAdvancedFilters(false)
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <PlusIcon className="mr-2 h-4 w-4" />
                Nueva Campaña
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Crear Campaña</DialogTitle>
                <DialogDescription>
                  Configura una nueva campaña de mensajería masiva
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(handleCreate)}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre de la campaña</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ej: Promoción Navidad 2026"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="templateId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plantilla de mensaje</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona una plantilla" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {templates
                              ?.filter((t) => t.isActive)
                              .map((template) => (
                                <SelectItem
                                  key={template._id}
                                  value={template._id}
                                >
                                  {template.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Header Media URL - comentado temporalmente */}
                  {/* {(selectedTemplate?.headerType === "image" ||
                    selectedTemplate?.headerType === "video" ||
                    selectedTemplate?.headerType === "document") && (
                      <FormField
                        control={form.control}
                        name="headerImageUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <ImageIcon className="h-4 w-4" />
                              {selectedTemplate?.headerType === "video"
                                ? "Video del header"
                                : selectedTemplate?.headerType === "document"
                                  ? "Documento del header"
                                  : "Imagen del header"}
                              <span className="text-destructive">*</span>
                            </FormLabel>
                            <div className="space-y-3">
                              <FormControl>
                                <Input
                                  placeholder={
                                    selectedTemplate?.headerType === "video"
                                      ? "https://ejemplo.com/video.mp4"
                                      : selectedTemplate?.headerType ===
                                        "document"
                                        ? "https://ejemplo.com/documento.pdf"
                                        : "https://ejemplo.com/imagen.jpg"
                                  }
                                  {...field}
                                />
                              </FormControl>
                            </div>
                            <FormDescription>
                              {selectedTemplate?.headerType === "video"
                                ? "Esta plantilla requiere un video en el header. El video debe ser MP4, máximo 10MB."
                                : selectedTemplate?.headerType === "document"
                                  ? "Esta plantilla requiere un documento en el header. El documento debe ser PDF, máximo 10MB."
                                  : "Esta plantilla requiere una imagen en el header. La imagen debe ser JPG, PNG o WebP, máximo 5MB."}
                            </FormDescription>
                            {field.value &&
                              selectedTemplate?.headerType === "image" && (
                                <div className="mt-2 rounded-lg border p-2">
                                  <img
                                    src={field.value}
                                    alt="Preview del header"
                                    className="max-h-32 rounded object-contain"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none"
                                    }}
                                  />
                                </div>
                              )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )} */}

                  {/* Recipient Selection */}
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="recipientSelectionMode"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel>Selección de destinatarios</FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={(value) => {
                                field.onChange(value)
                                if (value === "manual") {
                                  setShowAdvancedFilters(false)
                                }
                              }}
                              defaultValue={field.value}
                              className="flex flex-col space-y-2"
                            >
                              <div className="flex items-center space-x-3 rounded-lg border p-4">
                                <RadioGroupItem value="filters" id="filters" />
                                <Label
                                  htmlFor="filters"
                                  className="flex flex-1 cursor-pointer flex-col gap-1"
                                >
                                  <span className="flex items-center gap-2 font-medium">
                                    <FilterIcon className="h-4 w-4" />
                                    Por filtros
                                  </span>
                                  <span className="text-muted-foreground text-sm">
                                    Selecciona contactos según criterios como
                                    historial de pedidos o ubicación
                                  </span>
                                </Label>
                              </div>
                              <div className="flex items-center space-x-3 rounded-lg border p-4">
                                <RadioGroupItem value="manual" id="manual" />
                                <Label
                                  htmlFor="manual"
                                  className="flex flex-1 cursor-pointer flex-col gap-1"
                                >
                                  <span className="flex items-center gap-2 font-medium">
                                    <UserPlusIcon className="h-4 w-4" />
                                    Selección manual
                                  </span>
                                  <span className="text-muted-foreground text-sm">
                                    Elige contactos específicos de una lista
                                  </span>
                                </Label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {/* Filter-based selection options */}
                    {recipientSelectionMode === "filters" && (
                      <>
                        <FormField
                          control={form.control}
                          name="allContacts"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">
                                  Todos los contactos
                                </FormLabel>
                                <FormDescription>
                                  Enviar a todos los contactos no bloqueados
                                </FormDescription>
                              </div>
                              <FormControl>
                                <input
                                  type="checkbox"
                                  checked={field.value}
                                  onChange={(e) => {
                                    field.onChange(e.target.checked)
                                    if (e.target.checked) {
                                      setShowAdvancedFilters(false)
                                    }
                                  }}
                                  className="h-5 w-5 rounded border-gray-300"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        {/* Advanced Filters */}
                        {!allContacts && (
                          <Collapsible
                            open={showAdvancedFilters}
                            onOpenChange={setShowAdvancedFilters}
                          >
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="outline"
                                type="button"
                                className="w-full justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <FilterIcon className="h-4 w-4" />
                                  <span>Filtros avanzados</span>
                                  {activeFilterCount > 0 && (
                                    <Badge variant="secondary" className="ml-2">
                                      {activeFilterCount} activo
                                      {activeFilterCount > 1 ? "s" : ""}
                                    </Badge>
                                  )}
                                </div>
                                <ChevronDownIcon
                                  className={`h-4 w-4 transition-transform ${showAdvancedFilters ? "rotate-180" : ""}`}
                                />
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-4 pt-4">
                              {/* Order Count Filters */}
                              <div className="space-y-4 rounded-lg border p-4">
                                <div className="flex items-center gap-2 font-medium text-sm">
                                  <ShoppingCartIcon className="h-4 w-4" />
                                  Historial de pedidos
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <FormField
                                    control={form.control}
                                    name="minOrderCount"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Mínimo de pedidos</FormLabel>
                                        <FormControl>
                                          <Input
                                            type="number"
                                            min="0"
                                            placeholder="Ej: 1"
                                            {...field}
                                          />
                                        </FormControl>
                                        <FormDescription>
                                          Clientes con al menos X pedidos
                                        </FormDescription>
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="maxOrderCount"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Máximo de pedidos</FormLabel>
                                        <FormControl>
                                          <Input
                                            type="number"
                                            min="0"
                                            placeholder="Ej: 10"
                                            {...field}
                                          />
                                        </FormControl>
                                        <FormDescription>
                                          Clientes con máximo X pedidos
                                        </FormDescription>
                                      </FormItem>
                                    )}
                                  />
                                </div>
                                <div className="mt-4">
                                  <FormField
                                    control={form.control}
                                    name="hasNoOrders"
                                    render={({ field }) => (
                                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                        <FormControl>
                                          <input
                                            type="checkbox"
                                            checked={field.value}
                                            onChange={field.onChange}
                                            className="h-4 w-4 rounded border-gray-300"
                                          />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                          <FormLabel>
                                            Clientes sin pedidos
                                          </FormLabel>
                                          <FormDescription>
                                            Incluir solo clientes que nunca han
                                            realizado un pedido
                                          </FormDescription>
                                        </div>
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </div>

                              {/* Date Range Filters */}
                              <div className="space-y-4 rounded-lg border p-4">
                                <div className="flex items-center gap-2 font-medium text-sm">
                                  <CalendarIcon className="h-4 w-4" />
                                  Último pedido
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <FormField
                                    control={form.control}
                                    name="lastOrderAfter"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Después de</FormLabel>
                                        <FormControl>
                                          <Input type="date" {...field} />
                                        </FormControl>
                                        <FormDescription>
                                          Último pedido después de esta fecha
                                        </FormDescription>
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="lastOrderBefore"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Antes de</FormLabel>
                                        <FormControl>
                                          <Input type="date" {...field} />
                                        </FormControl>
                                        <FormDescription>
                                          Último pedido antes de esta fecha
                                        </FormDescription>
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </div>

                              {/* Creation Date Range Filters */}
                              <div className="space-y-4 rounded-lg border p-4">
                                <div className="flex items-center gap-2 font-medium text-sm">
                                  <UserPlusIcon className="h-4 w-4" />
                                  Fecha de creación
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <FormField
                                    control={form.control}
                                    name="createdAfter"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Creado después de</FormLabel>
                                        <FormControl>
                                          <Input type="date" {...field} />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="createdBefore"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Creado antes de</FormLabel>
                                        <FormControl>
                                          <Input type="date" {...field} />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </div>

                              {/* Location Filter */}
                              {restaurantLocations &&
                                restaurantLocations.length > 0 && (
                                  <div className="space-y-4 rounded-lg border p-4">
                                    <div className="flex items-center gap-2 font-medium text-sm">
                                      <MapPinIcon className="h-4 w-4" />
                                      Sucursales
                                    </div>
                                    <FormField
                                      control={form.control}
                                      name="restaurantLocationIds"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>
                                            Filtrar por sucursal
                                          </FormLabel>
                                          <FormDescription>
                                            Clientes que han ordenado en estas
                                            sucursales
                                          </FormDescription>
                                          <div className="mt-2 grid grid-cols-2 gap-2">
                                            {restaurantLocations.map(
                                              (location) => (
                                                <label
                                                  key={location._id}
                                                  className="flex cursor-pointer items-center gap-2 rounded-md border p-2 hover:bg-muted/50"
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={
                                                      field.value?.includes(
                                                        location._id
                                                      ) || false
                                                    }
                                                    onChange={(e) => {
                                                      const current =
                                                        field.value || []
                                                      if (e.target.checked) {
                                                        field.onChange([
                                                          ...current,
                                                          location._id,
                                                        ])
                                                      } else {
                                                        field.onChange(
                                                          current.filter(
                                                            (id) =>
                                                              id !==
                                                              location._id
                                                          )
                                                        )
                                                      }
                                                    }}
                                                    className="rounded"
                                                  />
                                                  <span className="text-sm">
                                                    {location.name}
                                                  </span>
                                                </label>
                                              )
                                            )}
                                          </div>
                                        </FormItem>
                                      )}
                                    />
                                  </div>
                                )}
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </>
                    )}

                    {/* Manual selection options */}
                    {recipientSelectionMode === "manual" && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">
                              Contactos seleccionados
                            </p>
                            <p className="text-muted-foreground text-sm">
                              {selectedContactIds.length === 0
                                ? "Ningún contacto seleccionado"
                                : `${selectedContactIds.length} contacto${selectedContactIds.length > 1 ? "s" : ""} seleccionado${selectedContactIds.length > 1 ? "s" : ""}`}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsContactSelectorOpen(true)}
                          >
                            <UserPlusIcon className="mr-2 h-4 w-4" />
                            {selectedContactIds.length === 0
                              ? "Seleccionar contactos"
                              : "Modificar selección"}
                          </Button>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            onClick={() =>
                              document.getElementById("excel-upload")?.click()
                            }
                          >
                            <FileSpreadsheetIcon className="mr-2 h-4 w-4" />
                            Cargar Excel
                          </Button>
                          <input
                            id="excel-upload"
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            onChange={handleExcelUpload}
                          />
                        </div>

                        {/* Show selected contacts preview */}
                        {selectedContactsInfo &&
                          selectedContactsInfo.length > 0 && (
                            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                              {selectedContactsInfo
                                .slice(0, 5)
                                .map((contact) => (
                                  <div
                                    key={contact._id}
                                    className="flex items-center gap-2 rounded p-2 text-sm"
                                  >
                                    <UsersIcon className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">
                                      {contact.displayName || "Sin nombre"}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {contact.phoneNumber}
                                    </span>
                                  </div>
                                ))}
                              {selectedContactsInfo.length > 5 && (
                                <p className="px-2 text-muted-foreground text-sm">
                                  y {selectedContactsInfo.length - 5} más...
                                </p>
                              )}
                            </div>
                          )}
                      </div>
                    )}
                  </div>

                  {/* Recipient Count Preview */}
                  {effectiveRecipientCount !== undefined && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
                      <div className="flex items-center gap-2">
                        <UsersIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <span className="font-medium text-blue-700 dark:text-blue-300">
                          {effectiveRecipientCount} destinatario
                          {effectiveRecipientCount !== 1 ? "s" : ""}
                        </span>
                        {recipientSelectionMode === "filters" &&
                          !allContacts &&
                          activeFilterCount > 0 && (
                            <span className="text-blue-600 text-sm dark:text-blue-400">
                              ({activeFilterCount} filtro
                              {activeFilterCount > 1 ? "s" : ""} aplicado
                              {activeFilterCount > 1 ? "s" : ""})
                            </span>
                          )}
                        {recipientSelectionMode === "manual" && (
                          <span className="text-blue-600 text-sm dark:text-blue-400">
                            (selección manual)
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Programar envío (opcional)</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormDescription>
                          Deja vacío para guardar como borrador
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit">Crear Campaña</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        }
        data={filteredCampaigns || []}
        tableColumns={tableColumns}
        loading={campaigns === undefined}
        error={
          campaigns instanceof Error || campaigns === null
            ? new Error("Error al cargar campañas")
            : null
        }
        emptyState={{
          icon: <MailIcon className="h-12 w-12" />,
          title: searchQuery ? "No se encontraron campañas" : "No hay campañas",
          description: searchQuery
            ? `No hay campañas que coincidan con "${searchQuery}".`
            : "Crea tu primera campaña para comenzar a enviar mensajes masivos",
        }}
        itemName={{ singular: "campaña", plural: "campañas" }}
      />

      <ContactSelectorDialog
        open={isContactSelectorOpen}
        onOpenChange={setIsContactSelectorOpen}
        selectedContactIds={selectedContactIds as Id<"contacts">[]}
        onSelectionChange={(contactIds) => {
          form.setValue("selectedContactIds", contactIds)
        }}
        title="Seleccionar Destinatarios"
        description="Selecciona los contactos que recibirán esta campaña"
      />
    </div>
  )
}
