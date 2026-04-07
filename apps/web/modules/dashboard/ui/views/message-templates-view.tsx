"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import type { Column } from "@workspace/ui/components/data-table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { DataViewerLayout } from "@workspace/ui/layout/data-viewer-layout"
import { useAction, useMutation, useQuery } from "convex/react"
import {
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  EditIcon,
  EyeIcon,
  FileTextIcon,
  ImageIcon,
  LinkIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PhoneIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
  VideoIcon,
  XCircleIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"

// Types for template variables and links
type TemplateVariable = {
  name: string
  example: string
}

type TemplateLink = {
  type: "url" | "phone"
  nombre: string
  url?: string
  phoneNumber?: string
}

// Form schema for local templates (simple)
const localFormSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(100, "El nombre no puede tener más de 100 caracteres"),
  content: z
    .string()
    .min(1, "El contenido es requerido")
    .max(4000, "El contenido no puede tener más de 4000 caracteres"),
})

// Form schema for Meta templates (with additional fields)
const metaFormSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(512, "El nombre no puede tener más de 512 caracteres")
    .regex(/^[a-z0-9_]+$/, "Solo letras minúsculas, números y guiones bajos"),
  description: z
    .string()
    .min(1, "La descripción es requerida")
    .max(500, "La descripción no puede tener más de 500 caracteres"),
  content: z
    .string()
    .min(1, "El contenido es requerido")
    .max(1024, "El contenido no puede tener más de 1024 caracteres"),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  language: z.string().min(1),
})

type LocalFormData = z.infer<typeof localFormSchema>
type MetaFormData = z.infer<typeof metaFormSchema>

// Helper to get status badge
const getStatusBadge = (status?: "pending" | "approved" | "rejected") => {
  switch (status) {
    case "approved":
      return (
        <Badge variant="default" className="bg-green-600">
          <CheckCircleIcon className="mr-1 h-3 w-3" />
          Aprobada
        </Badge>
      )
    case "rejected":
      return (
        <Badge variant="destructive">
          <XCircleIcon className="mr-1 h-3 w-3" />
          Rechazada
        </Badge>
      )
    case "pending":
      return (
        <Badge variant="secondary">
          <ClockIcon className="mr-1 h-3 w-3" />
          Pendiente
        </Badge>
      )
    default:
      return <Badge variant="outline">Local</Badge>
  }
}

// Helper to get category label
const getCategoryLabel = (
  category?: "MARKETING" | "UTILITY" | "AUTHENTICATION"
) => {
  switch (category) {
    case "MARKETING":
      return "Marketing"
    case "UTILITY":
      return "Utilidad"
    case "AUTHENTICATION":
      return "Autenticación"
    default:
      return "-"
  }
}

interface MessageTemplatesViewProps {
  whatsappConfigId: Id<"whatsappConfigurations">
  wabaId: string
  provider?: "meta" | "twilio" | "360dialog"
}

export const MessageTemplatesView = ({
  whatsappConfigId,
  wabaId,
  provider = "meta",
}: MessageTemplatesViewProps) => {
  const { activeOrganizationId } = useOrganization()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isMetaCreateDialogOpen, setIsMetaCreateDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] =
    useState<Id<"messageTemplates"> | null>(null)
  const [previewTemplate, setPreviewTemplate] =
    useState<Id<"messageTemplates"> | null>(null)
  const [viewMode, setViewMode] = useState<"table" | "cards">("table")
  const [isSyncing, setIsSyncing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isCreatingMeta, setIsCreatingMeta] = useState(false)
  const [confirmSyncOpen, setConfirmSyncOpen] = useState(false)
  const [confirmImportOpen, setConfirmImportOpen] = useState(false)

  // Meta template form state
  const [variables, setVariables] = useState<TemplateVariable[]>([])
  const [links, setLinks] = useState<TemplateLink[]>([])
  const [headerType, setHeaderType] = useState<
    "none" | "text" | "image" | "video" | "document"
  >("none")
  const [headerText, setHeaderText] = useState("")
  const [headerImageUrl, setHeaderImageUrl] = useState("")
  const [uploadMode, setUploadMode] = useState<"url" | "file">("url")
  const [isUploading, setIsUploading] = useState(false)

  const uploadHeaderImage = useAction(
    api.private.messageCampaigns.uploadHeaderImage
  )

  const isMobile = useIsMobile()

  useEffect(() => {
    setViewMode(isMobile ? "cards" : "table")
  }, [isMobile])

  // Queries
  const skipMeta = provider !== "meta" && provider !== "360dialog"
  const skipTwilio = provider !== "twilio"

  // Meta Templates Query
  const metaTemplates = useQuery(
    api.private.metaTemplates.listWithStatus,
    activeOrganizationId && !skipMeta
      ? {
          organizationId: activeOrganizationId,
          wabaId,
          includeInactive: true,
        }
      : "skip"
  )

  // Twilio Templates Query
  const twilioTemplates = useQuery(
    api.private.twilioTemplates.listWithStatus,
    activeOrganizationId && !skipTwilio
      ? {
          organizationId: activeOrganizationId,
          twilioConfigId: whatsappConfigId,
          includeInactive: true,
        }
      : "skip"
  )

  const templates = skipTwilio ? metaTemplates : twilioTemplates

  const availableVariables = useQuery(
    api.private.messageTemplates.getAvailableVariables,
    {}
  )
  const previewData = useQuery(
    api.private.messageTemplates.preview,
    previewTemplate && activeOrganizationId
      ? { organizationId: activeOrganizationId, templateId: previewTemplate }
      : "skip"
  )

  // Local template mutations
  const createMutation = useMutation(api.private.messageTemplates.create)
  const updateMutation = useMutation(api.private.messageTemplates.update)
  const removeMutation = useMutation(api.private.messageTemplates.remove)

  // Meta template actions
  const createInMetaAction = useAction(api.private.metaTemplates.createInMeta)
  const syncStatusesAction = useAction(api.private.metaTemplates.syncStatuses)
  const importFromMetaAction = useAction(
    api.private.metaTemplates.importFromMeta
  )

  // Twilio template actions
  const createInTwilioAction = useAction(
    api.private.twilioTemplates.createInTwilio
  )
  const importFromTwilioAction = useAction(
    api.private.twilioTemplates.importFromTwilio
  )

  // Local template form
  const localForm = useForm<LocalFormData>({
    resolver: zodResolver(localFormSchema),
    defaultValues: {
      name: "",
      content: "",
    },
  })

  // Meta/Twilio template form
  const metaForm = useForm<MetaFormData>({
    resolver: zodResolver(metaFormSchema),
    defaultValues: {
      name: "",
      description: "",
      content: "",
      category: "MARKETING",
      language: "es",
    },
  })

  // Handle local template creation
  const handleCreate = async (data: LocalFormData) => {
    if (!activeOrganizationId) return

    try {
      await createMutation({
        organizationId: activeOrganizationId,
        name: data.name,
        content: data.content,
        wabaId,
      })
      toast.success("Plantilla creada exitosamente")
      setIsCreateDialogOpen(false)
      localForm.reset()
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  // Handle Meta/Twilio template creation
  const handleMetaCreate = async (data: MetaFormData) => {
    if (!activeOrganizationId) return

    // Verify header (Twilio now supports headers too)
    // Validate header media URL if provided
    const hasMediaHeader =
      headerType === "image" ||
      headerType === "video" ||
      headerType === "document"

    if (hasMediaHeader && headerImageUrl) {
      if (!headerImageUrl.startsWith("https://")) {
        const mediaTypeName =
          headerType === "video"
            ? "video"
            : headerType === "document"
              ? "documento"
              : "imagen"
        toast.error(`La URL del ${mediaTypeName} debe comenzar con https://`)
        return
      }
    }

    if (hasMediaHeader && !headerImageUrl) {
      const mediaTypeName =
        headerType === "video"
          ? "un video"
          : headerType === "document"
            ? "un documento"
            : "una imagen"
      toast.error(`Se requiere ${mediaTypeName} para este tipo de header`)
      return
    }

    setIsCreatingMeta(true)
    try {
      if (skipMeta) {
        // Create in Twilio
        await createInTwilioAction({
          organizationId: activeOrganizationId,
          name: data.name,
          description: data.description,
          content: data.content,
          category: data.category,
          language: data.language,
          configId: whatsappConfigId,
          variables: variables.length > 0 ? variables : undefined,
          headerType: headerType !== "none" ? headerType : undefined,
          headerContent: headerType === "text" ? headerText : headerImageUrl,
          buttons:
            links.length > 0
              ? links.map((l) => ({
                  type: l.type === "url" ? "url" : "phone_number",
                  text: l.nombre,
                  url: l.type === "url" ? l.url : undefined,
                  phoneNumber: l.type === "phone" ? l.phoneNumber : undefined,
                }))
              : undefined,
        })
        toast.success("Plantilla enviada a Twilio para aprobación")
      } else {
        // Create in Meta
        await createInMetaAction({
          organizationId: activeOrganizationId,
          name: data.name,
          description: data.description,
          content: data.content,
          category: data.category,
          language: data.language,
          configId: whatsappConfigId,
          variables: variables.length > 0 ? variables : undefined,
          links: links.length > 0 ? links : undefined,
          header:
            headerType !== "none"
              ? {
                  type: headerType,
                  text: headerType === "text" ? headerText : undefined,
                  imageUrl: headerType !== "text" ? headerImageUrl : undefined,
                }
              : undefined,
        })
        toast.success("Plantilla enviada a Meta para aprobación")
      }

      setIsMetaCreateDialogOpen(false)
      metaForm.reset()
      setVariables([])
      setLinks([])
      setHeaderType("none")
      setHeaderText("")
      setHeaderImageUrl("")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsCreatingMeta(false)
    }
  }

  // Handle sync statuses
  const handleSyncStatuses = async () => {
    if (!activeOrganizationId) return

    setConfirmSyncOpen(false)
    setIsSyncing(true)
    try {
      if (skipMeta) {
        // Sync Twilio (actually imports/updates)
        const result = await importFromTwilioAction({
          organizationId: activeOrganizationId,
          twilioConfigId: whatsappConfigId,
        })
        toast.success(
          `Sincronización completada: ${result.imported} nuevas, ${result.updated} actualizadas`
        )
      } else {
        // Sync Meta
        const result = await syncStatusesAction({
          organizationId: activeOrganizationId,
          wabaId,
          whatsappConfigId,
        })
        toast.success(
          `Sincronización completada: ${result.synced} de ${result.total} plantillas actualizadas`
        )
      }
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsSyncing(false)
    }
  }

  // Handle import from Meta/Twilio
  const handleImportFromMeta = async () => {
    if (!activeOrganizationId) return

    setConfirmImportOpen(false)
    setIsImporting(true)
    try {
      if (skipMeta) {
        // Import from Twilio
        const result = await importFromTwilioAction({
          organizationId: activeOrganizationId,
          twilioConfigId: whatsappConfigId,
        })
        toast.success(
          `Importación completada: ${result.imported} nuevas, ${result.updated} actualizadas de ${result.total} plantillas`
        )
      } else {
        // Import from Meta
        const result = await importFromMetaAction({
          organizationId: activeOrganizationId,
          wabaId,
          whatsappConfigId,
        })
        toast.success(
          `Importación completada: ${result.imported} nuevas, ${result.updated} actualizadas de ${result.total} plantillas`
        )
      }
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsImporting(false)
    }
  }

  // Add variable
  const addVariable = () => {
    if (variables.length >= 10) {
      toast.error("Máximo 10 variables permitidas")
      return
    }
    setVariables([...variables, { name: "", example: "" }])
  }

  // Remove variable
  const removeVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index))
  }

  // Update variable
  const updateVariable = (
    index: number,
    field: keyof TemplateVariable,
    value: string
  ) => {
    const newVariables = [...variables]
    const currentVar = newVariables[index]
    if (currentVar) {
      newVariables[index] = { ...currentVar, [field]: value }
      setVariables(newVariables)
    }
  }

  // Add link/button
  const addLink = (type: "url" | "phone") => {
    if (links.length >= 3) {
      toast.error("Máximo 3 botones permitidos")
      return
    }
    setLinks([
      ...links,
      {
        type,
        nombre: "",
        url: type === "url" ? "" : undefined,
        phoneNumber: type === "phone" ? "" : undefined,
      },
    ])
  }

  // Remove link
  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index))
  }

  // Update link
  const updateLink = (
    index: number,
    field: keyof TemplateLink,
    value: string
  ) => {
    const newLinks = [...links]
    const currentLink = newLinks[index]
    if (currentLink) {
      newLinks[index] = { ...currentLink, [field]: value }
      setLinks(newLinks)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeOrganizationId) return

    setIsUploading(true)
    try {
      const url = await uploadHeaderImage({
        organizationId: activeOrganizationId,
        file: await file.arrayBuffer(),
        contentType: file.type,
        fileName: file.name,
      })
      setHeaderImageUrl(url)
      toast.success("Archivo subido exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsUploading(false)
    }
  }

  const handleEdit = (templateId: Id<"messageTemplates">) => {
    const template = templates?.find((t) => t._id === templateId)
    if (template) {
      localForm.reset({
        name: template.name,
        content: template.content,
      })
      setEditingTemplate(templateId)
    }
  }

  const handleUpdate = async (data: LocalFormData) => {
    if (!editingTemplate || !activeOrganizationId) return

    try {
      await updateMutation({
        organizationId: activeOrganizationId,
        templateId: editingTemplate,
        name: data.name,
        content: data.content,
      })
      toast.success("Plantilla actualizada exitosamente")
      setEditingTemplate(null)
      localForm.reset()
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleDelete = async (templateId: Id<"messageTemplates">) => {
    if (!activeOrganizationId) return

    try {
      await removeMutation({ organizationId: activeOrganizationId, templateId })
      toast.success("Plantilla eliminada exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleToggleActive = async (
    templateId: Id<"messageTemplates">,
    isActive: boolean
  ) => {
    if (!activeOrganizationId) return

    try {
      await updateMutation({
        organizationId: activeOrganizationId,
        templateId,
        isActive,
      })
      toast.success(isActive ? "Plantilla activada" : "Plantilla desactivada")
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const filteredTemplates = templates?.filter((template) => {
    // Search filter
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.content.toLowerCase().includes(searchQuery.toLowerCase())

    // Status filter
    let matchesStatus = true
    if (statusFilter !== "all") {
      matchesStatus = template.status === statusFilter
    }

    return matchesSearch && matchesStatus
  })

  // Define table columns
  const tableColumns: Column<NonNullable<typeof templates>[number]>[] = [
    {
      key: "name",
      header: "Nombre",
      render: (template) => (
        <div>
          <div className="font-medium">{template.name}</div>
          {template.code && template.code !== template.name && (
            <div className="text-muted-foreground text-xs">{template.code}</div>
          )}
        </div>
      ),
    },
    {
      key: "content",
      header: "Contenido",
      render: (template) => (
        <div className="max-w-md truncate text-muted-foreground">
          {template.content}
        </div>
      ),
    },
    {
      key: "category",
      header: "Categoría",
      render: (template) => (
        <span className="text-sm">{getCategoryLabel(template.category)}</span>
      ),
    },
    {
      key: "metaStatus",
      header: "Estado Meta",
      render: (template) => getStatusBadge(template.status),
    },
    {
      key: "variables",
      header: "Variables",
      render: (template) => (
        <div className="flex flex-wrap gap-1">
          {template.variables.length > 0 ? (
            template.variables.slice(0, 3).map((v) => (
              <Badge key={v} variant="secondary" className="text-xs">
                {`{{${v}}}`}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground text-sm">-</span>
          )}
          {template.variables.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{template.variables.length - 3}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "usageCount",
      header: "Usos",
      render: (template) => (
        <Badge variant="outline">{template.usageCount}</Badge>
      ),
    },
    {
      key: "status",
      header: "Activa",
      render: (template) => (
        <Badge variant={template.isActive ? "default" : "secondary"}>
          {template.isActive ? "Sí" : "No"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (template) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Abrir menú</span>
              <MoreHorizontalIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setPreviewTemplate(template._id)}>
              <EyeIcon className="mr-2 h-4 w-4" />
              Vista previa
            </DropdownMenuItem>
            {!template.whatsappTemplateId && (
              <DropdownMenuItem onClick={() => handleEdit(template._id)}>
                <EditIcon className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() =>
                handleToggleActive(template._id, !template.isActive)
              }
            >
              {template.isActive ? "Desactivar" : "Activar"}
            </DropdownMenuItem>
            {!template.whatsappTemplateId && (
              <DropdownMenuItem
                onClick={() => handleDelete(template._id)}
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
    <>
      <DataViewerLayout
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchProps={{
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: "Buscar por nombre o contenido...",
        }}
        actions={
          <div className="flex items-center gap-2">
            {/* Status Filter */}
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as typeof statusFilter)
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="approved">Aprobadas</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="rejected">Rechazadas</SelectItem>
              </SelectContent>
            </Select>

            {/* Sync/Import Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={isSyncing || isImporting}>
                  {isSyncing || isImporting ? (
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCwIcon className="mr-2 h-4 w-4" />
                  )}
                  Meta
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setConfirmSyncOpen(true)}
                  disabled={isSyncing}
                >
                  <RefreshCwIcon className="mr-2 h-4 w-4" />
                  Sincronizar estados
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setConfirmImportOpen(true)}
                  disabled={isImporting}
                >
                  <DownloadIcon className="mr-2 h-4 w-4" />
                  Importar de Meta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Create Template Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Nueva Plantilla
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsCreateDialogOpen(true)}>
                  <FileTextIcon className="mr-2 h-4 w-4" />
                  Plantilla local
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setIsMetaCreateDialogOpen(true)}
                >
                  <CheckCircleIcon className="mr-2 h-4 w-4" />
                  {skipMeta
                    ? "Plantilla Twilio (WhatsApp)"
                    : "Plantilla Meta (WhatsApp)"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
        data={filteredTemplates || []}
        tableColumns={tableColumns}
        loading={templates === undefined}
        error={
          templates instanceof Error || templates === null
            ? new Error("Error al cargar plantillas")
            : null
        }
        emptyState={{
          icon: <FileTextIcon className="h-12 w-12" />,
          title: searchQuery
            ? "No se encontraron plantillas"
            : "No hay plantillas",
          description: searchQuery
            ? `No hay plantillas que coincidan con "${searchQuery}".`
            : "Crea tu primera plantilla para comenzar a enviar mensajes masivos",
        }}
        itemName={{ singular: "plantilla", plural: "plantillas" }}
      />

      {/* Local Template Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear Plantilla Local</DialogTitle>
            <DialogDescription>
              Crea una plantilla reutilizable para uso interno (no requiere
              aprobación externa)
            </DialogDescription>
          </DialogHeader>
          <Form {...localForm}>
            <form
              onSubmit={localForm.handleSubmit(handleCreate)}
              className="space-y-4"
            >
              <FormField
                control={localForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Promoción de fin de semana"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={localForm.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contenido del mensaje</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Escribe el contenido del mensaje..."
                        className="min-h-[150px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Usa variables como {`{{nombre}}`} para personalizar el
                      mensaje.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {availableVariables && (
                <div className="rounded-lg border p-4">
                  <h4 className="mb-2 font-medium text-sm">
                    Variables disponibles:
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {availableVariables.map((v) => (
                      <Badge
                        key={v.name}
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => {
                          const currentContent = localForm.getValues("content")
                          localForm.setValue(
                            "content",
                            `${currentContent}{{${v.name}}}`
                          )
                        }}
                      >
                        {`{{${v.name}}}`} - {v.description}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button type="submit">Crear Plantilla</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Meta/Twilio Template Create Dialog */}
      <Dialog
        open={isMetaCreateDialogOpen}
        onOpenChange={(open) => {
          setIsMetaCreateDialogOpen(open)
          // ✅ CRITICAL FIX: Reset form state when dialog closes
          // Without this, stale header/variable/link data can be resubmitted unintentionally
          if (!open) {
            metaForm.reset()
            setVariables([])
            setLinks([])
            setHeaderType("none")
            setHeaderText("")
            setHeaderImageUrl("")
            setUploadMode("url")
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {skipMeta
                ? "Crear Plantilla Twilio (WhatsApp)"
                : "Crear Plantilla Meta (WhatsApp)"}
            </DialogTitle>
            <DialogDescription>
              {skipMeta
                ? "Crea una plantilla para enviar mediante Twilio Content API. Requiere aprobación."
                : "Crea una plantilla oficial de WhatsApp Business API. Requiere aprobación de Meta."}
            </DialogDescription>
          </DialogHeader>
          <Form {...metaForm}>
            <form
              onSubmit={metaForm.handleSubmit(handleMetaCreate)}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={metaForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre (identificador)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="ej: bienvenida_cliente"
                          {...field}
                          onChange={(e) => {
                            const value = e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9_]/g, "_")
                            field.onChange(value)
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        Solo minúsculas, números y guiones bajos viajan a la
                        API.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={metaForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona categoría" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="MARKETING">Marketing</SelectItem>
                          <SelectItem value="UTILITY">Utilidad</SelectItem>
                          <SelectItem value="AUTHENTICATION">
                            Autenticación
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={metaForm.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Idioma</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona idioma" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="es">Español</SelectItem>
                          <SelectItem value="es_MX">
                            Español (México)
                          </SelectItem>
                          <SelectItem value="es_AR">
                            Español (Argentina)
                          </SelectItem>
                          <SelectItem value="en">Inglés</SelectItem>
                          <SelectItem value="en_US">Inglés (US)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={metaForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Descripción interna de la plantilla"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={metaForm.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contenido del mensaje</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Hola {{1}}, tu pedido {{2}} está listo..."
                        className="min-h-[120px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Usa {`{{1}}`}, {`{{2}}`}, etc. para variables posicionales
                      (máx. 1024 caracteres)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Header Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">Header (opcional)</h4>
                </div>
                <Select
                  value={headerType}
                  onValueChange={(value) =>
                    setHeaderType(
                      value as "none" | "text" | "image" | "video" | "document"
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo de header" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin header</SelectItem>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="image">Imagen</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="document">Documento</SelectItem>
                  </SelectContent>
                </Select>

                {headerType === "text" && (
                  <div className="space-y-2">
                    <Input
                      placeholder="Texto del header (ej: ¡Oferta especial!)"
                      value={headerText}
                      onChange={(e) => setHeaderText(e.target.value)}
                    />
                    <p className="text-muted-foreground text-xs">
                      El texto del header aparecerá en negrita arriba del
                      mensaje.
                    </p>
                  </div>
                )}

                {headerType === "image" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="URL de la imagen (https://...)"
                        value={headerImageUrl}
                        onChange={(e) => setHeaderImageUrl(e.target.value)}
                        className="flex-1"
                      />
                    </div>
                    <p className="text-muted-foreground text-xs">
                      La imagen debe ser JPG, PNG o WebP, máximo 5MB.
                    </p>
                    {headerImageUrl && (
                      <div className="mt-2 rounded-lg border p-2">
                        {/* biome-ignore lint/performance/noImgElement: Preview */}
                        <img
                          src={headerImageUrl}
                          alt="Preview del header"
                          className="max-h-32 rounded object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = "none"
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {headerType === "video" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <VideoIcon className="h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="URL del video (https://...)"
                        value={headerImageUrl}
                        onChange={(e) => setHeaderImageUrl(e.target.value)}
                        className="flex-1"
                      />
                    </div>
                    <p className="text-muted-foreground text-xs">
                      El video debe ser MP4, máximo 10MB.
                    </p>
                  </div>
                )}

                {headerType === "document" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FileTextIcon className="h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="URL del documento (https://...)"
                        value={headerImageUrl}
                        onChange={(e) => setHeaderImageUrl(e.target.value)}
                        className="flex-1"
                      />
                    </div>
                    <p className="text-muted-foreground text-xs">
                      El documento debe ser PDF, máximo 10MB.
                    </p>
                  </div>
                )}
              </div>

              {/* Variables Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">Variables dinámicas</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addVariable}
                    disabled={variables.length >= 10}
                  >
                    <PlusIcon className="mr-1 h-3 w-3" />
                    Agregar variable
                  </Button>
                </div>
                {variables.length > 0 && (
                  <div className="space-y-2">
                    {variables.map((variable, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Badge variant="secondary" className="shrink-0">
                          {`{{${index + 1}}}`}
                        </Badge>
                        <Input
                          placeholder="Nombre (ej: nombre)"
                          value={variable.name}
                          onChange={(e) =>
                            updateVariable(index, "name", e.target.value)
                          }
                          className="flex-1"
                        />
                        <Input
                          placeholder="Ejemplo (ej: Juan)"
                          value={variable.example}
                          onChange={(e) =>
                            updateVariable(index, "example", e.target.value)
                          }
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeVariable(index)}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {variables.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    No hay variables. Las variables permiten personalizar el
                    mensaje para cada destinatario.
                  </p>
                )}
              </div>

              {/* Buttons/Links Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">Botones (opcional)</h4>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addLink("url")}
                      disabled={links.length >= 3}
                    >
                      <LinkIcon className="mr-1 h-3 w-3" />
                      URL
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addLink("phone")}
                      disabled={links.length >= 3}
                    >
                      <PhoneIcon className="mr-1 h-3 w-3" />
                      Teléfono
                    </Button>
                  </div>
                </div>
                {links.length > 0 && (
                  <div className="space-y-2">
                    {links.map((link, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded-lg border p-2"
                      >
                        <Badge
                          variant={
                            link.type === "url" ? "default" : "secondary"
                          }
                          className="shrink-0"
                        >
                          {link.type === "url" ? "URL" : "Tel"}
                        </Badge>
                        <Input
                          placeholder="Texto del botón"
                          value={link.nombre}
                          onChange={(e) =>
                            updateLink(index, "nombre", e.target.value)
                          }
                          className="flex-1"
                        />
                        {link.type === "url" ? (
                          <Input
                            placeholder="https://ejemplo.com"
                            value={link.url || ""}
                            onChange={(e) =>
                              updateLink(index, "url", e.target.value)
                            }
                            className="flex-1"
                          />
                        ) : (
                          <Input
                            placeholder="+573001234567"
                            value={link.phoneNumber || ""}
                            onChange={(e) =>
                              updateLink(index, "phoneNumber", e.target.value)
                            }
                            className="flex-1"
                          />
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLink(index)}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {links.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    No hay botones. Puedes agregar hasta 3 botones de URL o
                    teléfono.
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsMetaCreateDialogOpen(false)}
                  disabled={isCreatingMeta}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isCreatingMeta}>
                  {isCreatingMeta ? (
                    <>
                      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : skipMeta ? (
                    "Enviar a Twilio para aprobación"
                  ) : (
                    "Enviar a Meta para aprobación"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingTemplate}
        onOpenChange={(open) => !open && setEditingTemplate(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Plantilla</DialogTitle>
            <DialogDescription>
              Modifica la plantilla de mensaje
            </DialogDescription>
          </DialogHeader>
          <Form {...localForm}>
            <form
              onSubmit={localForm.handleSubmit(handleUpdate)}
              className="space-y-4"
            >
              <FormField
                control={localForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={localForm.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contenido del mensaje</FormLabel>
                    <FormControl>
                      <Textarea className="min-h-[150px]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit">Actualizar Plantilla</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog
        open={!!previewTemplate}
        onOpenChange={(open) => !open && setPreviewTemplate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vista Previa</DialogTitle>
            <DialogDescription>
              Así se verá el mensaje con datos de ejemplo
            </DialogDescription>
          </DialogHeader>
          {previewData && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 font-medium text-muted-foreground text-sm">
                  Plantilla original:
                </h4>
                <p className="whitespace-pre-wrap">
                  {previewData.template.content}
                </p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                <h4 className="mb-2 font-medium text-green-700 text-sm dark:text-green-300">
                  Mensaje personalizado:
                </h4>
                <p className="whitespace-pre-wrap">
                  {previewData.previewContent}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Sync Dialog */}
      <Dialog open={confirmSyncOpen} onOpenChange={setConfirmSyncOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sincronizar estados</DialogTitle>
            <DialogDescription>
              Esta acción actualizará el estado de aprobación de todas las
              plantillas existentes consultando la API de Meta. ¿Deseas
              continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSyncOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSyncStatuses}>Sincronizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Import Dialog */}
      <Dialog open={confirmImportOpen} onOpenChange={setConfirmImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar plantillas de Meta</DialogTitle>
            <DialogDescription>
              Esta acción importará todas las plantillas de tu cuenta de Meta
              WhatsApp Business. Las plantillas existentes serán actualizadas y
              las nuevas serán creadas. ¿Deseas continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmImportOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleImportFromMeta}>Importar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
