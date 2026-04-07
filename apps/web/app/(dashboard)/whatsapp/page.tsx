"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@workspace/backend/_generated/api"
import type { Doc, Id } from "@workspace/backend/_generated/dataModel"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form"
import { Input } from "@workspace/ui/components/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { useMutation, useQuery } from "convex/react"
import {
  AlertTriangleIcon,
  EditIcon,
  EyeIcon,
  PlusIcon,
  SettingsIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  TrashIcon,
} from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { useOrganization } from "@/hooks/use-organization"
import { useIsImplementor, usePlatformAdmin } from "@/hooks/use-platform-admin"
import { handleConvexError } from "@/lib/error-handling"

const whatsappConfigSchema = z
  .object({
    provider: z.enum(["meta", "twilio", "360dialog", "gupshup"]),
    displayName: z
      .string()
      .min(1, "El nombre de configuración es obligatorio")
      .max(100, "El nombre es demasiado largo"),
    phoneNumber: z
      .string()
      .min(1, "El número de teléfono es obligatorio")
      .regex(
        /^[1-9]\d{1,14}$/,
        "Formato inválido. Usa formato internacional: 1234567890"
      ),
    // Meta specific fields
    accessToken: z.string().optional(),
    phoneNumberId: z.string().optional(),
    wabaId: z.string().optional(),
    metaAppId: z.string().optional(),
    // Twilio specific fields
    twilioAccountSid: z.string().optional(),
    twilioAuthToken: z.string().optional(),
    twilioPhoneNumber: z.string().optional(),
    // 360dialog specific fields
    dialog360ApiKey: z.string().optional(),
    // Gupshup specific fields
    gupshupApiKey: z.string().optional(),
    gupshupAppName: z.string().optional(),
    gupshupAppId: z.string().optional(), // App ID de Gupshup
    gupshupAppToken: z.string().optional(),
    gupshupSourceNumber: z.string().optional(),
    gupshupMediaToken: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.provider === "meta") {
        return !!data.accessToken && !!data.phoneNumberId
      }
      if (data.provider === "twilio") {
        return (
          !!data.twilioAccountSid &&
          !!data.twilioAuthToken &&
          !!data.twilioPhoneNumber
        )
      }
      if (data.provider === "360dialog") {
        return !!data.dialog360ApiKey
      }
      if (data.provider === "gupshup") {
        return !!data.gupshupApiKey && !!data.gupshupAppName
      }
      return true
    },
    {
      message:
        "Por favor completa todos los campos requeridos para el proveedor seleccionado",
      path: ["provider"],
    }
  )

type WhatsAppConfigFormData = z.infer<typeof whatsappConfigSchema>

export default function WhatsAppSettingsPage() {
  // WhatsApp configuration state
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] =
    useState<Id<"whatsappConfigurations"> | null>(null)
  const [deleteConfigConfirmation, setDeleteConfigConfirmation] = useState<{
    isOpen: boolean
    configId: Id<"whatsappConfigurations"> | null
    displayName: string
  }>({
    isOpen: false,
    configId: null,
    displayName: "",
  })

  // Check platform admin membership for edit permissions
  const isPlatformAdmin = usePlatformAdmin()
  const isImplementor = useIsImplementor()
  const { activeOrganizationId } = useOrganization()

  // Implementors and platform admins can edit; regular org members are read-only
  const canEdit = isPlatformAdmin === true || isImplementor === true
  const isReadOnly =
    !canEdit && isPlatformAdmin !== undefined && isImplementor !== undefined

  // Queries
  const whatsappConfigs = useQuery(
    api.private.whatsappConfigurations.getConfigurations,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  // Mutations for WhatsApp configurations
  const createWhatsappConfig = useMutation(
    api.private.whatsappConfigurations.createConfiguration
  )
  const updateWhatsappConfig = useMutation(
    api.private.whatsappConfigurations.updateConfiguration
  )
  const deleteWhatsappConfig = useMutation(
    api.private.whatsappConfigurations.deleteConfiguration
  )
  const toggleConfigActiveStatus = useMutation(
    api.private.whatsappConfigurations.toggleActiveStatus
  )

  const configForm = useForm<WhatsAppConfigFormData>({
    resolver: zodResolver(whatsappConfigSchema),
    defaultValues: {
      provider: "meta",
      accessToken: "",
      phoneNumberId: "",
      wabaId: "",
      metaAppId: "",
      phoneNumber: "",
      displayName: "",
      twilioAccountSid: "",
      twilioAuthToken: "",
      twilioPhoneNumber: "",
      dialog360ApiKey: "",
      gupshupApiKey: "",
      gupshupAppName: "",
      gupshupAppId: "",
      gupshupAppToken: "",
      gupshupSourceNumber: "",
      gupshupMediaToken: "",
    },
  })

  // WhatsApp Configuration handlers
  const handleEditConfig = (config: Doc<"whatsappConfigurations">) => {
    setEditingConfig(config._id)
    configForm.reset({
      provider:
        (config.provider as "meta" | "twilio" | "360dialog" | "gupshup") ||
        "meta",
      accessToken: config.accessToken || "",
      phoneNumberId: config.phoneNumberId || "",
      wabaId: config.wabaId || "",
      metaAppId: config.metaAppId || "",
      phoneNumber: config.phoneNumber,
      displayName: config.displayName || "",
      twilioAccountSid: config.twilioAccountSid || "",
      twilioAuthToken: config.twilioAuthToken || "",
      twilioPhoneNumber: config.twilioPhoneNumber || "",
      dialog360ApiKey: config.dialog360ApiKey || "",
      gupshupApiKey: config.gupshupApiKey || "",
      gupshupAppName: config.gupshupAppName || "",
      gupshupAppId: config.gupshupAppId || "",
      gupshupAppToken: config.gupshupAppToken || "",
      gupshupSourceNumber: config.gupshupSourceNumber || "",
      gupshupMediaToken: config.gupshupMediaToken || "",
    })
    setIsConfigDialogOpen(true)
  }

  const handleCreateConfig = () => {
    setEditingConfig(null)
    configForm.reset({
      provider: "meta",
      accessToken: "",
      phoneNumberId: "",
      wabaId: "",
      metaAppId: "",
      phoneNumber: "",
      displayName: "",
      twilioAccountSid: "",
      twilioAuthToken: "",
      twilioPhoneNumber: "",
      dialog360ApiKey: "",
      gupshupApiKey: "",
      gupshupAppName: "",
      gupshupAppId: "",
      gupshupAppToken: "",
      gupshupSourceNumber: "",
      gupshupMediaToken: "",
    })
    setIsConfigDialogOpen(true)
  }

  const handleCloseConfigDialog = () => {
    setIsConfigDialogOpen(false)
    setEditingConfig(null)
    configForm.reset()
  }

  const onConfigSubmit = async (values: WhatsAppConfigFormData) => {
    // Prevent submissions in read-only mode
    if (isReadOnly || !activeOrganizationId) return

    try {
      if (editingConfig) {
        await updateWhatsappConfig({
          organizationId: activeOrganizationId,
          configurationId: editingConfig,
          ...values,
        })
        toast.success("¡Configuración de WhatsApp actualizada exitosamente!")
      } else {
        await createWhatsappConfig({
          organizationId: activeOrganizationId,
          ...values,
        })
        toast.success("¡Configuración de WhatsApp agregada exitosamente!")
      }

      configForm.reset()
      setIsConfigDialogOpen(false)
      setEditingConfig(null)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleDeleteConfig = (
    configId: Id<"whatsappConfigurations">,
    displayName?: string
  ) => {
    setDeleteConfigConfirmation({
      isOpen: true,
      configId,
      displayName: displayName || "Configuración sin nombre",
    })
  }

  const handleConfirmDeleteConfig = async () => {
    // Prevent deletions in read-only mode
    if (isReadOnly || !activeOrganizationId) return

    if (!deleteConfigConfirmation.configId) return

    try {
      await deleteWhatsappConfig({
        organizationId: activeOrganizationId,
        configurationId: deleteConfigConfirmation.configId,
      })
      toast.success("¡Configuración de WhatsApp eliminada exitosamente!")
      setDeleteConfigConfirmation({
        isOpen: false,
        configId: null,
        displayName: "",
      })
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleCancelDeleteConfig = () => {
    setDeleteConfigConfirmation({
      isOpen: false,
      configId: null,
      displayName: "",
    })
  }

  const handleToggleConfigStatus = async (
    configId: Id<"whatsappConfigurations">
  ) => {
    // Prevent toggles in read-only mode
    if (isReadOnly || !activeOrganizationId) return

    try {
      const result = await toggleConfigActiveStatus({
        organizationId: activeOrganizationId,
        configurationId: configId,
      })
      toast.success(
        `¡Configuración ${result.isActive ? "activada" : "desactivada"}!`
      )
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Read-only alert for normal admins */}
      {isReadOnly && (
        <Alert className="border-blue-200 bg-blue-50">
          <EyeIcon className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Modo de solo lectura:</strong> Solo puedes ver la
            configuración de WhatsApp. Para modificar estas opciones, contacta
            al equipo de soporte técnico.
          </AlertDescription>
        </Alert>
      )}

      {/* WhatsApp Configuration Section */}
      <div className="mb-8 space-y-6">
        <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-2xl tracking-tight">
                Configuración de API
              </h2>
            </div>
            <p className="text-muted-foreground">
              Configura las credenciales de WhatsApp Business API
            </p>
          </div>

          <Dialog
            open={isConfigDialogOpen}
            onOpenChange={handleCloseConfigDialog}
          >
            {canEdit && (
              <Button size="lg" onClick={handleCreateConfig}>
                <PlusIcon className="mr-2 h-4 w-4" />
                Agregar Configuración
              </Button>
            )}
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingConfig
                    ? "Editar Configuración de WhatsApp"
                    : "Agregar Configuración de WhatsApp"}
                </DialogTitle>
                <DialogDescription>
                  {editingConfig
                    ? "Modifica la configuración de WhatsApp Business API"
                    : "Agrega una nueva configuración de WhatsApp Business API"}
                </DialogDescription>
              </DialogHeader>

              <Form {...configForm}>
                <form
                  onSubmit={configForm.handleSubmit(onConfigSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={configForm.control}
                    name="provider"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Proveedor</FormLabel>
                        <FormControl>
                          <div className="flex w-full rounded-lg bg-muted p-1">
                            <button
                              type="button"
                              onClick={() => field.onChange("meta")}
                              disabled={isReadOnly}
                              className={`flex-1 rounded-md px-3 py-2 font-medium text-sm transition-colors ${
                                field.value === "meta"
                                  ? "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              } ${isReadOnly ? "cursor-not-allowed opacity-50" : ""}`}
                            >
                              Meta
                            </button>
                            <button
                              type="button"
                              onClick={() => field.onChange("twilio")}
                              disabled={isReadOnly}
                              className={`flex-1 rounded-md px-3 py-2 font-medium text-sm transition-colors ${
                                field.value === "twilio"
                                  ? "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              } ${isReadOnly ? "cursor-not-allowed opacity-50" : ""}`}
                            >
                              Twilio
                            </button>
                            <button
                              type="button"
                              onClick={() => field.onChange("360dialog")}
                              disabled={isReadOnly}
                              className={`flex-1 rounded-md px-3 py-2 font-medium text-sm transition-colors ${
                                field.value === "360dialog"
                                  ? "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              } ${isReadOnly ? "cursor-not-allowed opacity-50" : ""}`}
                            >
                              360dialog
                            </button>
                            <button
                              type="button"
                              onClick={() => field.onChange("gupshup")}
                              disabled={isReadOnly}
                              className={`flex-1 rounded-md px-3 py-2 font-medium text-sm transition-colors ${
                                field.value === "gupshup"
                                  ? "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              } ${isReadOnly ? "cursor-not-allowed opacity-50" : ""}`}
                            >
                              Gupshup
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={configForm.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre de Configuración</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Configuración Principal"
                              disabled={isReadOnly}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={configForm.control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número de Teléfono</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="5491122334455"
                              disabled={isReadOnly}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Meta Configuration Fields */}
                  {configForm.watch("provider") === "meta" && (
                    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                      <p className="font-medium text-sm">
                        Configuración de Meta
                      </p>
                      <FormField
                        control={configForm.control}
                        name="accessToken"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Token de Acceso</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="EAA..."
                                type="password"
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={configForm.control}
                        name="phoneNumberId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ID del Número de Teléfono</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="123456789"
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={configForm.control}
                        name="wabaId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              WABA ID (WhatsApp Business Account ID)
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="1173681551480770"
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <p className="text-muted-foreground text-xs">
                              Requerido para plantillas de mensajes masivos.
                              Encuéntralo en Meta Business Suite → Configuración
                              → WhatsApp → Configuración de la cuenta.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={configForm.control}
                        name="metaAppId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Meta App ID (opcional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="123456789012345"
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <p className="text-muted-foreground text-xs">
                              Requerido para crear plantillas con imágenes.
                              Encuéntralo en Meta for Developers → Tu App →
                              Configuración → Básica → ID de la aplicación.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* Twilio Configuration Fields */}
                  {configForm.watch("provider") === "twilio" && (
                    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                      <p className="font-medium text-sm">
                        Configuración de Twilio
                      </p>
                      <FormField
                        control={configForm.control}
                        name="twilioAccountSid"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Account SID</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="AC..."
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={configForm.control}
                        name="twilioAuthToken"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Auth Token</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Token secreto..."
                                type="password"
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={configForm.control}
                        name="twilioPhoneNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Número de WhatsApp (Twilio)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="whatsapp:+14155238886"
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* 360dialog Configuration Fields */}
                  {configForm.watch("provider") === "360dialog" && (
                    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                      <p className="font-medium text-sm">
                        Configuración de 360dialog
                      </p>
                      <FormField
                        control={configForm.control}
                        name="dialog360ApiKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>API Key (D360-API-KEY)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Tu API Key de 360dialog..."
                                type="password"
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={configForm.control}
                        name="wabaId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>WABA ID (opcional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="WhatsApp Business Account ID..."
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* Gupshup Configuration Fields */}
                  {configForm.watch("provider") === "gupshup" && (
                    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                      <p className="font-medium text-sm">
                        Configuración de Gupshup
                      </p>
                      <FormField
                        control={configForm.control}
                        name="gupshupApiKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>API Key</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Tu API Key de Gupshup..."
                                type="password"
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={configForm.control}
                        name="gupshupAppName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nombre de la App</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Nombre de tu app en Gupshup..."
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <p className="text-muted-foreground text-xs">
                              El nombre de la aplicación registrada en Gupshup
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={configForm.control}
                        name="gupshupAppId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>App ID</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="ID de tu app en Gupshup..."
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <p className="text-muted-foreground text-xs">
                              El identificador único de la aplicación en Gupshup
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={configForm.control}
                        name="gupshupAppToken"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>App Token</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Token de tu app en Gupshup..."
                                type="password"
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <p className="text-muted-foreground text-xs">
                              Requerido para la API de Partner de Gupshup v3
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={configForm.control}
                        name="gupshupMediaToken"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Media Token</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Token para descargar media de Gupshup..."
                                type="password"
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <p className="text-muted-foreground text-xs">
                              Token de Gupshup para descargar audios e imágenes
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={configForm.control}
                        name="gupshupSourceNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Número Fuente (opcional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="573001234567"
                                disabled={isReadOnly}
                                {...field}
                              />
                            </FormControl>
                            <p className="text-muted-foreground text-xs">
                              Si es diferente al número de teléfono principal
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseConfigDialog}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={configForm.formState.isSubmitting || isReadOnly}
                    >
                      {configForm.formState.isSubmitting
                        ? editingConfig
                          ? "Actualizando..."
                          : "Agregando..."
                        : editingConfig
                          ? "Actualizar Configuración"
                          : "Agregar Configuración"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* WhatsApp Configurations List */}
        <div className="grid gap-6 lg:gap-8">
          {whatsappConfigs === undefined ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="flex items-center space-x-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-muted-foreground text-sm">
                    Cargando configuraciones...
                  </span>
                </div>
              </CardContent>
            </Card>
          ) : whatsappConfigs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <SettingsIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mt-4 font-semibold text-lg">
                  No hay configuraciones
                </h3>
                <p className="mt-2 max-w-sm text-center text-muted-foreground text-sm">
                  Comienza agregando tu configuración de WhatsApp Business API.
                </p>
                {canEdit && (
                  <Button onClick={handleCreateConfig} className="mt-6">
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Agregar configuración
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {whatsappConfigs.map((config) => (
                <Card key={config._id} className="relative">
                  <CardHeader>
                    <div className="flex flex-col space-y-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-3 text-lg">
                          <span className="font-mono text-sm">
                            {config.phoneNumber}
                          </span>
                          <div className="flex gap-1">
                            <Badge
                              variant={
                                config.isActive ? "default" : "secondary"
                              }
                              className="h-5 text-[10px] uppercase"
                            >
                              {config.isActive ? "Activa" : "Inactiva"}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="h-5 text-[10px] uppercase"
                            >
                              {config.provider || "meta"}
                            </Badge>
                          </div>
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {config.displayName || "Configuración sin nombre"}
                        </CardDescription>
                      </div>
                      {canEdit && (
                        <TooltipProvider>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditConfig(config)}
                                  className="h-8 w-8 p-0"
                                >
                                  <EditIcon className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Editar configuración</p>
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleToggleConfigStatus(config._id)
                                  }
                                  className="h-8 w-8 p-0"
                                >
                                  {config.isActive ? (
                                    <ToggleRightIcon className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <ToggleLeftIcon className="h-4 w-4 text-gray-400" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {config.isActive
                                    ? "Desactivar configuración"
                                    : "Activar configuración"}
                                </p>
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleDeleteConfig(
                                      config._id,
                                      config.displayName
                                    )
                                  }
                                  className="h-8 w-8 p-0 hover:text-destructive"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Eliminar configuración</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="mb-1 font-medium text-muted-foreground text-xs">
                        {config.provider === "twilio"
                          ? "Account SID"
                          : config.provider === "360dialog"
                            ? "API Key"
                            : config.provider === "gupshup"
                              ? "App Name"
                              : "Phone Number ID"}
                      </div>
                      <code className="block w-full truncate rounded bg-muted px-2 py-1 text-[10px]">
                        {config.provider === "twilio"
                          ? config.twilioAccountSid
                          : config.provider === "360dialog"
                            ? config.dialog360ApiKey
                              ? `${config.dialog360ApiKey.substring(0, 8)}...`
                              : "No configurado"
                            : config.provider === "gupshup"
                              ? config.gupshupAppName || "No configurado"
                              : config.phoneNumberId}
                      </code>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Delete Configuration Confirmation Dialog */}
        <Dialog
          open={deleteConfigConfirmation.isOpen}
          onOpenChange={handleCancelDeleteConfig}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangleIcon className="h-5 w-5" />
                Confirmar Eliminación
              </DialogTitle>
              <DialogDescription>
                ¿Estás seguro de que quieres eliminar esta configuración? Esta
                acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="font-medium">Nombre:</span>{" "}
                    <span className="font-mono">
                      {deleteConfigConfirmation.displayName}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-muted-foreground text-sm">
                Al eliminar esta configuración:
                <ul className="mt-2 list-inside list-disc space-y-1">
                  <li>Se perderán todas las credenciales de API</li>
                  <li>Los números asociados dejarán de funcionar</li>
                  <li>
                    La configuración del webhook se eliminará permanentemente
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelDeleteConfig}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirmDeleteConfig}
              >
                <TrashIcon className="mr-2 h-4 w-4" />
                Eliminar Configuración
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Cómo funciona
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-sm">
                1
              </div>
              <h4 className="font-semibold">Configurar API</h4>
              <p className="text-muted-foreground text-sm">
                Configura las credenciales de WhatsApp Business API con tu token
                de acceso y número de teléfono
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-sm">
                2
              </div>
              <h4 className="font-semibold">Configurar Webhook</h4>
              <p className="text-muted-foreground text-sm">
                El webhook procesará automáticamente los mensajes entrantes de
                WhatsApp
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-sm">
                3
              </div>
              <h4 className="font-semibold">Recibir Mensajes</h4>
              <p className="text-muted-foreground text-sm">
                Los mensajes de WhatsApp aparecerán en tu panel de
                conversaciones
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-sm">
                4
              </div>
              <h4 className="font-semibold">Respuestas de IA</h4>
              <p className="text-muted-foreground text-sm">
                Tu agente de IA responderá automáticamente según tu
                configuración
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
