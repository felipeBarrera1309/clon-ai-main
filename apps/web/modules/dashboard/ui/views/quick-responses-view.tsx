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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { DataViewerLayout } from "@workspace/ui/layout/data-viewer-layout"
import { useMutation, useQuery } from "convex/react"
import {
  EditIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"

const formSchema = z.object({
  title: z
    .string()
    .min(1, "El título es requerido")
    .max(20, "El título no puede tener más de 20 caracteres"),
  content: z
    .string()
    .min(1, "El contenido es requerido")
    .max(1050, "El contenido no puede tener más de 1050 caracteres"),
  category: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

export const QuickResponsesView = () => {
  const { activeOrganizationId } = useOrganization()
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingResponse, setEditingResponse] =
    useState<Id<"quickResponses"> | null>(null)
  const [viewMode, setViewMode] = useState<"table" | "cards">("table")
  const isMobile = useIsMobile()

  useEffect(() => {
    setViewMode(isMobile ? "cards" : "table")
  }, [isMobile])

  const quickResponses = useQuery(
    api.private.quickResponses.list,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  const categories = useQuery(
    api.private.quickResponses.getCategories,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )

  const createMutation = useMutation(api.private.quickResponses.create)
  const updateMutation = useMutation(api.private.quickResponses.update)
  const removeMutation = useMutation(api.private.quickResponses.remove)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      content: "",
      category: "",
    },
  })

  const handleCreate = async (data: FormData) => {
    if (!activeOrganizationId) return

    try {
      await createMutation({
        organizationId: activeOrganizationId,
        title: data.title,
        content: data.content,
        category: data.category || undefined,
      })
      toast.success("Respuesta rápida creada exitosamente")
      setIsCreateDialogOpen(false)
      form.reset()
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleEdit = (responseId: Id<"quickResponses">) => {
    const response = quickResponses?.find((r) => r._id === responseId)
    if (response) {
      form.reset({
        title: response.title,
        content: response.content,
        category: response.category || "",
      })
      setEditingResponse(responseId)
    }
  }

  const handleUpdate = async (data: FormData) => {
    if (!editingResponse || !activeOrganizationId) return

    try {
      await updateMutation({
        organizationId: activeOrganizationId,
        quickResponseId: editingResponse,
        title: data.title,
        content: data.content,
        category: data.category || undefined,
      })
      toast.success("Respuesta rápida actualizada exitosamente")
      setEditingResponse(null)
      form.reset()
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleDelete = async (responseId: Id<"quickResponses">) => {
    if (!activeOrganizationId) return

    try {
      await removeMutation({
        organizationId: activeOrganizationId,
        quickResponseId: responseId,
      })
      toast.success("Respuesta rápida eliminada exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleToggleActive = async (
    responseId: Id<"quickResponses">,
    isActive: boolean
  ) => {
    if (!activeOrganizationId) return

    try {
      await updateMutation({
        organizationId: activeOrganizationId,
        quickResponseId: responseId,
        isActive,
      })
      toast.success(isActive ? "Respuesta activada" : "Respuesta desactivada")
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const filteredResponses = quickResponses?.filter(
    (response) =>
      response.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      response.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      response.category?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Define table columns
  const tableColumns: Column<NonNullable<typeof quickResponses>[number]>[] = [
    {
      key: "title",
      header: "Título",
      render: (response) => <div className="font-medium">{response.title}</div>,
    },
    {
      key: "content",
      header: "Contenido",
      render: (response) => (
        <div className="max-w-md truncate">{response.content}</div>
      ),
    },
    {
      key: "category",
      header: "Categoría",
      render: (response) =>
        response.category ? (
          <Badge variant="secondary">{response.category}</Badge>
        ) : (
          <span className="text-muted-foreground text-sm">Sin categoría</span>
        ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (response) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Abrir menú</span>
              <MoreHorizontalIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(response._id)}>
              <EditIcon className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDelete(response._id)}
              className="text-destructive"
            >
              <TrashIcon className="mr-2 h-4 w-4" />
              Eliminar
            </DropdownMenuItem>
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
          placeholder: "Buscar por título, contenido o categoría...",
        }}
        actions={
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          >
            <DialogTrigger asChild>
              <Button>
                <PlusIcon className="mr-2 h-4 w-4" />
                Nueva Respuesta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Respuesta Rápida</DialogTitle>
                <DialogDescription>
                  Crea una nueva plantilla de respuesta para usar en las
                  conversaciones
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(handleCreate)}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Título</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ej: Saludo de bienvenida"
                            maxLength={20}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contenido</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Escribe el contenido de la respuesta..."
                            maxLength={1050}
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit">Crear Respuesta</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        }
        data={filteredResponses || []}
        tableColumns={tableColumns}
        loading={quickResponses === undefined}
        error={
          quickResponses instanceof Error || quickResponses === null
            ? new Error("Error al cargar respuestas rápidas")
            : null
        }
        emptyState={{
          icon: <MessageSquareIcon className="h-12 w-12" />,
          title: searchQuery
            ? "No se encontraron respuestas rápidas"
            : "No hay respuestas rápidas",
          description: searchQuery
            ? `No hay respuestas que coincidan con "${searchQuery}". Intenta con otro término de búsqueda.`
            : "Crea tu primera respuesta rápida para comenzar a usar plantillas en las conversaciones",
        }}
        itemName={{
          singular: "respuesta rápida",
          plural: "respuestas rápidas",
        }}
      />

      {/* Edit Dialog */}
      <Dialog
        open={!!editingResponse}
        onOpenChange={(open) => !open && setEditingResponse(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Respuesta Rápida</DialogTitle>
            <DialogDescription>
              Modifica la plantilla de respuesta
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleUpdate)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Saludo de bienvenida"
                        maxLength={20}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contenido</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Escribe el contenido de la respuesta..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit">Actualizar Respuesta</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
