"use client"

import { api } from "@workspace/backend/_generated/api"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
// Convex imports
import { useMutation, useQuery } from "convex/react"
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  CreditCardIcon,
  FileTextIcon,
  MessageSquareIcon,
  SaveIcon,
  SettingsIcon,
  ShieldIcon,
  StoreIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useOrganization } from "@/hooks/use-organization"
import { usePlatformAdmin } from "@/hooks/use-platform-admin"
import { getErrorDetails } from "@/lib/error-handling"
import {
  DEFAULT_FOLLOW_UP_SEQUENCE,
  type FollowUpStep,
  isValidFollowUpSequence,
} from "@/modules/dashboard/customization/constants"
import { FollowUpSequenceBuilder } from "@/modules/dashboard/customization/ui/components/follow-up-sequence-builder"
import { MemberPermissionsSettings } from "@/modules/dashboard/ui/components/member-permissions-settings"
import { MenuImageUploader } from "@/modules/dashboard/ui/components/menu-image-uploader"
import { MenuPdfUploader } from "@/modules/dashboard/ui/components/menu-pdf-uploader"
import { OrderStatusSettings } from "@/modules/dashboard/ui/components/order-status-settings"

const DEFAULT_CONFIG = {
  minAdvanceMinutes: 30,
  maxAdvanceDays: 7,
  orderModificationBufferMinutes: 15,
  conversationResolutionBufferMinutes: 30,
  paymentLinkUrl: "",
  bankAccounts: [] as string[],
  acceptCash: true,
  acceptCard: true,
  acceptPaymentLink: true,
  acceptDynamicPaymentLink: false,
  acceptBankTransfer: false,
  acceptCorporateCredit: false,
  acceptGiftVoucher: false,
  acceptSodexoVoucher: false,
  enableDelivery: true,
  enablePickup: true,
  enableElectronicInvoice: false,
  deliveryInstructions: "",
  pickupInstructions: "",
  restaurantName: "",
  restaurantPhone: "",
  restaurantAddress: "",
  menuUrl: "",
  menuType: "none" as "images" | "pdf" | "url" | "none", // New field for menu type selection
  orderStatusMessages: undefined as any, // New field for custom order status messages
  automaticFirstReply: {
    enabled: false,
    message: "",
    sendMenu: false,
  },
}

export default function RestaurantSettingsPage() {
  const { activeOrganizationId } = useOrganization()
  const isPlatformAdmin = usePlatformAdmin()
  const [config, setConfig] = useState(DEFAULT_CONFIG)

  const [hasChanges, setHasChanges] = useState(false)
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle")

  // Follow Up Sequence State
  const [followUpSequence, setFollowUpSequence] = useState<FollowUpStep[]>(
    DEFAULT_FOLLOW_UP_SEQUENCE
  )
  const [followUpValidationError, setFollowUpValidationError] = useState<
    string | null
  >(null)
  const [hasFollowUpChanges, setHasFollowUpChanges] = useState(false)

  // Convex API calls
  const restaurantConfig = useQuery(
    api.private.config.getRestaurantConfig,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  const updateConfigMutation = useMutation(
    api.private.config.updateRestaurantConfigMutation
  )

  // Automatic First Reply (Platform Admin only)
  const automaticReplyConfig = useQuery(
    api.private.config.getAutomaticFirstReplyConfig,
    activeOrganizationId && isPlatformAdmin
      ? { organizationId: activeOrganizationId }
      : "skip"
  )

  const followUpSequenceData = useQuery(
    api.private.agentConfiguration.getFollowUpSequence,
    activeOrganizationId && isPlatformAdmin
      ? { organizationId: activeOrganizationId }
      : "skip"
  )

  const updateFollowUpSequenceMutation = useMutation(
    api.private.agentConfiguration.updateFollowUpSequence
  )

  // Initialize automatic reply config when data loads
  useEffect(() => {
    if (automaticReplyConfig) {
      setConfig((prev) => ({
        ...prev,
        automaticFirstReply: {
          enabled: automaticReplyConfig.enabled,
          message: automaticReplyConfig.message,
          sendMenu: automaticReplyConfig.sendMenu ?? false,
        },
      }))
    }
  }, [automaticReplyConfig])

  // Initialize follow-up sequence when data loads
  useEffect(() => {
    if (followUpSequenceData) {
      setFollowUpSequence(followUpSequenceData)
    }
  }, [followUpSequenceData])

  // Track if config has been initialized
  const configInitializedRef = useRef(false)

  // Initialize config when data loads (only once)
  useEffect(() => {
    if (restaurantConfig && !configInitializedRef.current) {
      configInitializedRef.current = true
      // Use saved menuType if available, otherwise auto-detect
      let menuType: "images" | "pdf" | "url" | "none" =
        restaurantConfig.menuType || "none"

      // Only auto-detect if menuType is not explicitly saved
      if (!restaurantConfig.menuType) {
        if (
          restaurantConfig.menuImages &&
          restaurantConfig.menuImages.length > 0
        ) {
          menuType = "images"
        } else if (restaurantConfig.menuPdf) {
          menuType = "pdf"
        } else if (restaurantConfig.menuUrl) {
          menuType = "url"
        }
      }

      setConfig((prev) => ({
        ...prev,
        minAdvanceMinutes: restaurantConfig.minAdvanceMinutes,
        maxAdvanceDays: restaurantConfig.maxAdvanceDays,
        orderModificationBufferMinutes:
          restaurantConfig.orderModificationBufferMinutes,
        conversationResolutionBufferMinutes:
          restaurantConfig.conversationResolutionBufferMinutes || 30,
        paymentLinkUrl: restaurantConfig.paymentLinkUrl || "",
        bankAccounts: restaurantConfig.bankAccounts || [],
        acceptCash: restaurantConfig.acceptCash ?? true,
        acceptCard: restaurantConfig.acceptCard ?? true,
        acceptPaymentLink: restaurantConfig.acceptPaymentLink ?? true,
        acceptDynamicPaymentLink:
          restaurantConfig.acceptDynamicPaymentLink ?? false,
        acceptBankTransfer: restaurantConfig.acceptBankTransfer ?? false,
        acceptCorporateCredit: restaurantConfig.acceptCorporateCredit ?? false,
        acceptGiftVoucher: restaurantConfig.acceptGiftVoucher ?? false,
        acceptSodexoVoucher: restaurantConfig.acceptSodexoVoucher ?? false,
        enableDelivery: restaurantConfig.enableDelivery ?? true,
        enablePickup: restaurantConfig.enablePickup ?? true,
        enableElectronicInvoice:
          "enableElectronicInvoice" in restaurantConfig
            ? (restaurantConfig.enableElectronicInvoice ?? false)
            : false,
        deliveryInstructions: restaurantConfig.deliveryInstructions || "",
        pickupInstructions: restaurantConfig.pickupInstructions || "",
        restaurantName: restaurantConfig.restaurantName || "",
        restaurantPhone: restaurantConfig.restaurantPhone || "",
        restaurantAddress: restaurantConfig.restaurantAddress || "",
        menuUrl: restaurantConfig.menuUrl || "",
        menuType: menuType,
        orderStatusMessages: restaurantConfig.orderStatusMessages || undefined,
      }))
    }
  }, [restaurantConfig])

  // Track changes
  useEffect(() => {
    // Construct current config for comparison
    // We need to construct it carefully to match the structure of 'config' state
    if (!restaurantConfig) return

    const currentConfig = {
      // ... same fields as setConfig above ...
      minAdvanceMinutes: restaurantConfig.minAdvanceMinutes,
      maxAdvanceDays: restaurantConfig.maxAdvanceDays,
      orderModificationBufferMinutes:
        restaurantConfig.orderModificationBufferMinutes,
      conversationResolutionBufferMinutes:
        restaurantConfig.conversationResolutionBufferMinutes || 30,
      paymentLinkUrl: restaurantConfig.paymentLinkUrl || "",
      bankAccounts: restaurantConfig.bankAccounts || [],
      acceptCash: restaurantConfig.acceptCash ?? true,
      acceptCard: restaurantConfig.acceptCard ?? true,
      acceptPaymentLink: restaurantConfig.acceptPaymentLink ?? true,
      acceptDynamicPaymentLink:
        restaurantConfig.acceptDynamicPaymentLink ?? false,
      acceptBankTransfer: restaurantConfig.acceptBankTransfer ?? false,
      acceptCorporateCredit: restaurantConfig.acceptCorporateCredit ?? false,
      acceptGiftVoucher: restaurantConfig.acceptGiftVoucher ?? false,
      acceptSodexoVoucher: restaurantConfig.acceptSodexoVoucher ?? false,
      enableDelivery: restaurantConfig.enableDelivery ?? true,
      enablePickup: restaurantConfig.enablePickup ?? true,
      enableElectronicInvoice:
        "enableElectronicInvoice" in restaurantConfig
          ? (restaurantConfig.enableElectronicInvoice ?? false)
          : false,
      deliveryInstructions: restaurantConfig.deliveryInstructions || "",
      pickupInstructions: restaurantConfig.pickupInstructions || "",
      restaurantName: restaurantConfig.restaurantName || "",
      restaurantPhone: restaurantConfig.restaurantPhone || "",
      restaurantAddress: restaurantConfig.restaurantAddress || "",
      menuUrl: restaurantConfig.menuUrl || "",
      // Logic for menuType from useEffect
      menuType: restaurantConfig.menuType
        ? restaurantConfig.menuType
        : restaurantConfig.menuImages && restaurantConfig.menuImages.length > 0
          ? "images"
          : restaurantConfig.menuPdf
            ? "pdf"
            : restaurantConfig.menuUrl
              ? "url"
              : "none",
      orderStatusMessages: restaurantConfig.orderStatusMessages || undefined,
      automaticFirstReply: automaticReplyConfig
        ? {
            enabled: automaticReplyConfig.enabled,
            message: automaticReplyConfig.message,
            sendMenu: automaticReplyConfig.sendMenu ?? false,
          }
        : DEFAULT_CONFIG.automaticFirstReply,
    }

    setHasChanges(JSON.stringify(config) !== JSON.stringify(currentConfig))
    setHasChanges(JSON.stringify(config) !== JSON.stringify(currentConfig))
  }, [config, restaurantConfig, automaticReplyConfig])

  // Track follow-up sequence changes
  useEffect(() => {
    if (followUpSequenceData !== undefined) {
      const originalSequence =
        followUpSequenceData ?? DEFAULT_FOLLOW_UP_SEQUENCE
      const hasChanged =
        JSON.stringify(followUpSequence) !== JSON.stringify(originalSequence)
      setHasFollowUpChanges(hasChanged)
    }
  }, [followUpSequence, followUpSequenceData])

  const handleSave = async () => {
    if (!hasChanges && !hasFollowUpChanges) return

    // Validate Follow Up Sequence
    if (hasFollowUpChanges) {
      const validation = isValidFollowUpSequence(followUpSequence)
      if (!validation.valid) {
        setFollowUpValidationError(validation.error ?? null)
        toast.error(validation.error)
        return
      }
      setFollowUpValidationError(null)
    }

    // Validate at least one payment method is enabled
    if (
      !config.acceptCash &&
      !config.acceptCard &&
      !config.acceptPaymentLink &&
      !config.acceptDynamicPaymentLink &&
      !config.acceptBankTransfer &&
      !config.acceptCorporateCredit &&
      !config.acceptGiftVoucher &&
      !config.acceptSodexoVoucher
    ) {
      toast.error("Debes habilitar al menos un método de pago")
      return
    }

    // Validate menu URL is required when menu type is URL
    if (config.menuType === "url" && !config.menuUrl?.trim()) {
      toast.error(
        "Debes ingresar una URL del menú para habilitar el enlace al menú"
      )
      return
    }

    // Validate only one payment link type is enabled
    if (config.acceptPaymentLink && config.acceptDynamicPaymentLink) {
      toast.error(
        "No puedes habilitar ambos tipos de link de pago a la vez. Elige uno."
      )
      return
    }

    // Validate payment link URL is required when payment link is enabled
    if (config.acceptPaymentLink && !config.paymentLinkUrl?.trim()) {
      toast.error(
        "Debes ingresar una URL de link de pago para habilitar pagos por link de pago"
      )
      return
    }

    // Validate bank accounts are required when bank transfer is enabled
    if (
      config.acceptBankTransfer &&
      (!config.bankAccounts || config.bankAccounts.length === 0)
    ) {
      toast.error(
        "Debes ingresar al menos una cuenta bancaria para habilitar transferencias a cuenta bancaria"
      )
      return
    }

    // Validate at least one order type is enabled
    if (!config.enableDelivery && !config.enablePickup) {
      toast.error("Debes habilitar al menos un tipo de pedido")
      return
    }

    // Validate automatic reply message if enabled
    if (
      config.automaticFirstReply.enabled &&
      !config.automaticFirstReply.message.trim()
    ) {
      toast.error(
        "Debes ingresar un mensaje de bienvenida para habilitar la respuesta automática"
      )
      return
    }

    setSaveStatus("saving")
    try {
      if (!activeOrganizationId) return

      const promises = []

      if (hasChanges) {
        promises.push(
          updateConfigMutation({
            ...config,
            organizationId: activeOrganizationId,
          })
        )
      }

      if (hasFollowUpChanges) {
        promises.push(
          updateFollowUpSequenceMutation({
            organizationId: activeOrganizationId,
            followUpSequence: followUpSequence,
          })
        )
      }

      await Promise.all(promises)

      setSaveStatus("success")
      toast.success("Configuración guardada exitosamente")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch (error) {
      console.error("Error saving configuration:", error)
      const errorDetails = getErrorDetails(error)

      // Show specific error message to user
      toast.error(errorDetails.message)

      // Handle specific error types if needed
      if (errorDetails.code === "UNAUTHORIZED") {
        // Could redirect to login or show specific message
        console.log("User needs to re-authenticate")
      }

      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    }
  }

  // Save automatic first reply configuration (Platform Admin only)

  const updateConfig = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  // Handle loading state
  if (restaurantConfig === undefined) {
    return null
  }

  return (
    <>
      <Button
        onClick={handleSave}
        disabled={
          (!hasChanges && !hasFollowUpChanges) || saveStatus === "saving"
        }
        className="flex items-center gap-2 lg:self-end"
      >
        <SaveIcon className="h-4 w-4" />
        {saveStatus === "saving" ? "Guardando..." : "Guardar Cambios"}
      </Button>

      {/* Status alerts */}
      {saveStatus === "success" && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircleIcon className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Configuración guardada exitosamente
          </AlertDescription>
        </Alert>
      )}

      {saveStatus === "error" && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircleIcon className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            Error al guardar la configuración. Inténtalo de nuevo.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="restaurant-info" className="space-y-6">
        <TabsList className="flex h-full w-full flex-wrap">
          <TabsTrigger
            value="restaurant-info"
            className="flex items-center gap-2"
          >
            <StoreIcon className="h-4 w-4" />
            Información
          </TabsTrigger>
          <TabsTrigger value="operations" className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
            Operativa
          </TabsTrigger>
          <TabsTrigger value="order-types" className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4" />
            Tipos de Pedido
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <CreditCardIcon className="h-4 w-4" />
            Pagos
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex items-center gap-2">
            <FileTextIcon className="h-4 w-4" />
            Facturación
          </TabsTrigger>
          <TabsTrigger value="permissions" className="flex items-center gap-2">
            <ShieldIcon className="h-4 w-4" />
            Permisos
          </TabsTrigger>
          {isPlatformAdmin && (
            <TabsTrigger
              value="automatic-reply"
              className="flex items-center gap-2"
            >
              <MessageSquareIcon className="h-4 w-4" />
              Respuestas Automáticas
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="restaurant-info">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <StoreIcon className="h-5 w-5" />
                Información del Restaurante
              </CardTitle>
              <p className="mt-1 text-muted-foreground text-sm">
                Configura la información básica de tu restaurante
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="restaurant-name">Nombre del Restaurante</Label>
                <Input
                  id="restaurant-name"
                  type="text"
                  placeholder="Nombre de tu restaurante"
                  value={config.restaurantName}
                  onChange={(e) =>
                    updateConfig("restaurantName", e.target.value)
                  }
                />
                <p className="text-muted-foreground text-xs">
                  Nombre que aparecerá en los pedidos y comunicaciones
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="restaurant-phone">
                  Teléfono del Restaurante
                </Label>
                <Input
                  id="restaurant-phone"
                  type="tel"
                  placeholder="+57 300 123 4567"
                  value={config.restaurantPhone}
                  onChange={(e) =>
                    updateConfig("restaurantPhone", e.target.value)
                  }
                />
                <p className="text-muted-foreground text-xs">
                  Número de contacto principal del restaurante
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="restaurant-address">Dirección Principal</Label>
                <Input
                  id="restaurant-address"
                  type="text"
                  placeholder="Calle 123 #45-67, Bogotá"
                  value={config.restaurantAddress}
                  onChange={(e) =>
                    updateConfig("restaurantAddress", e.target.value)
                  }
                />
                <p className="text-muted-foreground text-xs">
                  Dirección principal o matriz del restaurante
                </p>
              </div>

              {/* Menu Configuration Section */}
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-base">
                    Menú del Restaurante
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Elige cómo quieres compartir tu menú con los clientes (solo
                    una opción)
                  </p>
                </div>

                {/* Menu Type Selector */}
                <div className="space-y-3">
                  <Label>Tipo de Menú</Label>
                  <div className="space-y-2">
                    {/* Images Option */}
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="menu-type-images"
                        name="menuType"
                        value="images"
                        checked={config.menuType === "images"}
                        onChange={(e) =>
                          updateConfig("menuType", e.target.value)
                        }
                        className="h-4 w-4"
                      />
                      <Label
                        htmlFor="menu-type-images"
                        className="cursor-pointer font-normal"
                      >
                        Imágenes del Menú
                      </Label>
                    </div>

                    {/* PDF Option */}
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="menu-type-pdf"
                        name="menuType"
                        value="pdf"
                        checked={config.menuType === "pdf"}
                        onChange={(e) =>
                          updateConfig("menuType", e.target.value)
                        }
                        className="h-4 w-4"
                      />
                      <Label
                        htmlFor="menu-type-pdf"
                        className="cursor-pointer font-normal"
                      >
                        Documento PDF
                      </Label>
                    </div>

                    {/* URL Option */}
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="menu-type-url"
                        name="menuType"
                        value="url"
                        checked={config.menuType === "url"}
                        onChange={(e) =>
                          updateConfig("menuType", e.target.value)
                        }
                        className="h-4 w-4"
                      />
                      <Label
                        htmlFor="menu-type-url"
                        className="cursor-pointer font-normal"
                      >
                        Enlace al Menú
                      </Label>
                    </div>

                    {/* None Option */}
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="menu-type-none"
                        name="menuType"
                        value="none"
                        checked={config.menuType === "none"}
                        onChange={(e) =>
                          updateConfig("menuType", e.target.value)
                        }
                        className="h-4 w-4"
                      />
                      <Label
                        htmlFor="menu-type-none"
                        className="cursor-pointer font-normal"
                      >
                        No compartir menú
                      </Label>
                    </div>
                  </div>
                </div>

                {/* Conditional Content Based on Selection */}
                {config.menuType === "images" && (
                  <div className="space-y-2">
                    <MenuImageUploader />
                    <p className="text-muted-foreground text-xs">
                      Sube imágenes de tu menú para compartir con los clientes
                    </p>
                  </div>
                )}

                {config.menuType === "pdf" && (
                  <div className="space-y-2">
                    <MenuPdfUploader />
                    <p className="text-muted-foreground text-xs">
                      Sube un PDF de tu menú completo (máximo 16MB)
                    </p>
                  </div>
                )}

                {config.menuType === "url" && (
                  <div className="space-y-2">
                    <Label htmlFor="menu-url">Enlace al Menú</Label>
                    <Input
                      id="menu-url"
                      type="url"
                      placeholder="https://menu.turestaurante.com"
                      value={config.menuUrl}
                      onChange={(e) => updateConfig("menuUrl", e.target.value)}
                    />
                    <p className="text-muted-foreground text-xs">
                      Enlace directo al menú digital de tu restaurante
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operations">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                Configuración Operativa del Restaurante
              </CardTitle>
              <p className="mt-1 text-muted-foreground text-sm">
                Configura los límites de tiempo, gestión de pedidos y políticas
                operativas
              </p>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Scheduling Section */}
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                  <ClockIcon className="h-4 w-4" />
                  Programación de Pedidos
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="min-advance">
                      Anticipación Mínima (minutos)
                    </Label>
                    <Input
                      id="min-advance"
                      type="number"
                      min="0"
                      max="1440"
                      value={config.minAdvanceMinutes}
                      onChange={(e) =>
                        updateConfig(
                          "minAdvanceMinutes",
                          Number.parseInt(e.target.value, 10) || 0
                        )
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      Tiempo mínimo antes del cual se puede programar un pedido
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max-advance">
                      Anticipación Máxima (días)
                    </Label>
                    <Input
                      id="max-advance"
                      type="number"
                      min="1"
                      max="365"
                      value={config.maxAdvanceDays}
                      onChange={(e) =>
                        updateConfig(
                          "maxAdvanceDays",
                          Number.parseInt(e.target.value, 10) || 1
                        )
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      Tiempo máximo con anticipación para programar pedidos
                    </p>
                  </div>
                </div>
              </div>

              {/* Order Management Section */}
              <div className="space-y-4">
                <h4 className="font-medium text-muted-foreground text-sm">
                  Gestión de Pedidos
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="order-modification-buffer">
                      Buffer de Modificación (minutos)
                    </Label>
                    <Input
                      id="order-modification-buffer"
                      type="number"
                      min="0"
                      max="1440"
                      value={config.orderModificationBufferMinutes}
                      onChange={(e) =>
                        updateConfig(
                          "orderModificationBufferMinutes",
                          Number.parseInt(e.target.value, 10) || 0
                        )
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      Tiempo durante el cual se puede modificar un pedido
                      después de creado
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="conversation-resolution-buffer">
                      Buffer de Resolución de Conversación (minutos)
                    </Label>
                    <Input
                      id="conversation-resolution-buffer"
                      type="number"
                      min="0"
                      max="1440"
                      value={config.conversationResolutionBufferMinutes}
                      onChange={(e) =>
                        updateConfig(
                          "conversationResolutionBufferMinutes",
                          Number.parseInt(e.target.value, 10) || 0
                        )
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      Tiempo de espera antes de resolver automáticamente la
                      conversación después de la entrega
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="order-types">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClockIcon className="h-5 w-5" />
                Tipos de Pedido
              </CardTitle>
              <p className="mt-1 text-muted-foreground text-sm">
                Configura qué tipos de pedido acepta tu restaurante
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="enable-delivery" className="text-base">
                    Entrega a Domicilio
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    Permite que los clientes soliciten entrega a domicilio
                  </p>
                </div>
                <Switch
                  id="enable-delivery"
                  checked={config.enableDelivery}
                  onCheckedChange={(checked) =>
                    updateConfig("enableDelivery", checked)
                  }
                />
              </div>
              {config.enableDelivery && (
                <div className="space-y-2 px-1">
                  <Label htmlFor="delivery-instructions">
                    Instrucciones y Políticas para Domicilio
                  </Label>
                  <Textarea
                    id="delivery-instructions"
                    maxLength={500}
                    value={config.deliveryInstructions ?? ""}
                    onChange={(e) =>
                      updateConfig("deliveryInstructions", e.target.value)
                    }
                    placeholder="Instrucciones especiales para pedidos a domicilio... (ej. Nuestros domiciliarios no suben a los apartamentos, por favor baje a recibir su pedido en portería, Tiempo estimado de entrega 45 minutos)"
                  />
                  <p className="text-muted-foreground text-xs">
                    El agente utilizará esta información para guiar al usuario.
                    Máximo 500 caracteres.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="enable-pickup" className="text-base">
                    Recoger en Restaurante
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    Permite que los clientes recojan su pedido en el restaurante
                  </p>
                </div>
                <Switch
                  id="enable-pickup"
                  checked={config.enablePickup}
                  onCheckedChange={(checked) =>
                    updateConfig("enablePickup", checked)
                  }
                />
              </div>
              {config.enablePickup && (
                <div className="space-y-2 px-1">
                  <Label htmlFor="pickup-instructions">
                    Instrucciones y Políticas para Recogida
                  </Label>
                  <Textarea
                    id="pickup-instructions"
                    maxLength={500}
                    value={config.pickupInstructions ?? ""}
                    onChange={(e) =>
                      updateConfig("pickupInstructions", e.target.value)
                    }
                    placeholder="Instrucciones especiales para pedidos para recoger... (ej. Al llegar al restaurante, por favor preséntate en la caja 1 e indica a nombre de quién está el pedido, Tiempo estimado de recogida 15 minutos)"
                  />
                  <p className="text-muted-foreground text-xs">
                    El agente utilizará esta información para guiar al usuario.
                    Máximo 500 caracteres.
                  </p>
                </div>
              )}

              {!config.enableDelivery && !config.enablePickup && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircleIcon className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <strong>Advertencia:</strong> Debes habilitar al menos un
                    tipo de pedido (entrega a domicilio o recoger en
                    restaurante)
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCardIcon className="h-5 w-5" />
                Configuración de Pagos
              </CardTitle>
              <p className="mt-1 text-muted-foreground text-sm">
                Configura los métodos de pago disponibles para tus clientes
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-medium text-sm">
                  Métodos de Pago Disponibles
                </h3>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="accept-cash" className="text-base">
                      Efectivo
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Permite pagos en efectivo al recibir el pedido
                    </p>
                  </div>
                  <Switch
                    id="accept-cash"
                    checked={config.acceptCash}
                    onCheckedChange={(checked) =>
                      updateConfig("acceptCash", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="accept-card" className="text-base">
                      Tarjeta
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Permite pagos con tarjeta de crédito/débito
                    </p>
                  </div>
                  <Switch
                    id="accept-card"
                    checked={config.acceptCard}
                    onCheckedChange={(checked) =>
                      updateConfig("acceptCard", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="accept-payment-link" className="text-base">
                      Link de Pago
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Permite pagos a través de un enlace de pago en línea.
                      Requiere configurar una URL de pago estática.
                    </p>
                  </div>
                  <Switch
                    id="accept-payment-link"
                    checked={config.acceptPaymentLink}
                    onCheckedChange={(checked) =>
                      updateConfig("acceptPaymentLink", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="accept-dynamic-payment-link"
                      className="text-base"
                    >
                      Link de Pago (Dinámico)
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Permite pagos a través de enlaces de pago generados
                      dinámicamente. Al crearse un pedido la conversación será
                      escalada para generación personalizada del enlace.
                    </p>
                  </div>
                  <Switch
                    id="accept-dynamic-payment-link"
                    checked={config.acceptDynamicPaymentLink}
                    onCheckedChange={(checked) =>
                      updateConfig("acceptDynamicPaymentLink", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="accept-bank-transfer" className="text-base">
                      Transferencia a Cuenta Bancaria
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Permite pagos por transferencia a cuentas bancarias
                    </p>
                  </div>
                  <Switch
                    id="accept-bank-transfer"
                    checked={config.acceptBankTransfer}
                    onCheckedChange={(checked) =>
                      updateConfig("acceptBankTransfer", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="accept-corporate-credit"
                      className="text-base"
                    >
                      Crédito Corporativo
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Permite pagos con créditos corporativos o convenios
                      empresariales. La conversación será escalada para gestión
                      manual.
                    </p>
                  </div>
                  <Switch
                    id="accept-corporate-credit"
                    checked={config.acceptCorporateCredit}
                    onCheckedChange={(checked) =>
                      updateConfig("acceptCorporateCredit", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="accept-gift-voucher" className="text-base">
                      Bono de Regalo
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Permite pagos con bonos de regalo del restaurante. La
                      conversación será escalada para gestión manual.
                    </p>
                  </div>
                  <Switch
                    id="accept-gift-voucher"
                    checked={config.acceptGiftVoucher}
                    onCheckedChange={(checked) =>
                      updateConfig("acceptGiftVoucher", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="accept-sodexo-voucher"
                      className="text-base"
                    >
                      Sodexo
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Permite pagos con vales Sodexo. La conversación será
                      escalada para gestión manual.
                    </p>
                  </div>
                  <Switch
                    id="accept-sodexo-voucher"
                    checked={config.acceptSodexoVoucher}
                    onCheckedChange={(checked) =>
                      updateConfig("acceptSodexoVoucher", checked)
                    }
                  />
                </div>

                {!config.acceptCash &&
                  !config.acceptCard &&
                  !config.acceptPaymentLink &&
                  !config.acceptDynamicPaymentLink &&
                  !config.acceptBankTransfer &&
                  !config.acceptCorporateCredit &&
                  !config.acceptGiftVoucher &&
                  !config.acceptSodexoVoucher && (
                    <Alert className="border-red-200 bg-red-50">
                      <AlertCircleIcon className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-800">
                        <strong>Advertencia:</strong> Debes habilitar al menos
                        un método de pago
                      </AlertDescription>
                    </Alert>
                  )}
              </div>

              <div className="space-y-6 border-t pt-6">
                <div className="space-y-2">
                  <Label htmlFor="payment-link-url">
                    URL de Link de Pago{" "}
                    {config.acceptPaymentLink && (
                      <span className="text-red-600">*</span>
                    )}
                  </Label>
                  <Input
                    id="payment-link-url"
                    type="url"
                    placeholder="https://pagos.turestaurante.com"
                    value={config.paymentLinkUrl}
                    onChange={(e) =>
                      updateConfig("paymentLinkUrl", e.target.value)
                    }
                    className={
                      config.acceptPaymentLink && !config.paymentLinkUrl?.trim()
                        ? "border-red-300"
                        : ""
                    }
                  />
                  <p className="text-muted-foreground text-xs">
                    Enlace para procesar pagos en línea
                    {config.acceptPaymentLink && (
                      <span className="text-red-600">
                        {" "}
                        (Requerido cuando pago por link de pago está habilitado)
                      </span>
                    )}
                  </p>
                </div>
                {config.acceptPaymentLink && !config.paymentLinkUrl?.trim() && (
                  <Alert className="border-red-200 bg-red-50">
                    <AlertCircleIcon className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                      <strong>URL de Link de Pago Requerida:</strong> Debes
                      ingresar una URL de link de pago válida para habilitar
                      este método de pago
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label>
                    Cuentas Bancarias{" "}
                    {config.acceptBankTransfer && (
                      <span className="text-red-600">*</span>
                    )}
                  </Label>
                  <div className="space-y-2">
                    {config.bankAccounts.map((account, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          type="text"
                          placeholder="Banco - Tipo de cuenta - Número - Titular"
                          value={account}
                          onChange={(e) => {
                            const newAccounts = [...config.bankAccounts]
                            newAccounts[index] = e.target.value
                            updateConfig("bankAccounts", newAccounts)
                          }}
                          className={
                            config.acceptBankTransfer && !account.trim()
                              ? "border-red-300"
                              : ""
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            const newAccounts = config.bankAccounts.filter(
                              (_, i) => i !== index
                            )
                            updateConfig("bankAccounts", newAccounts)
                          }}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        updateConfig("bankAccounts", [
                          ...config.bankAccounts,
                          "",
                        ])
                      }}
                    >
                      + Añadir cuenta bancaria
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Añade una o más cuentas bancarias para transferencias
                    {config.acceptBankTransfer && (
                      <span className="text-red-600">
                        {" "}
                        (Al menos una cuenta es requerida cuando transferencia a
                        cuenta bancaria está habilitada)
                      </span>
                    )}
                  </p>
                </div>
                {config.acceptBankTransfer &&
                  (!config.bankAccounts ||
                    config.bankAccounts.length === 0) && (
                    <Alert className="border-red-200 bg-red-50">
                      <AlertCircleIcon className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-800">
                        <strong>Cuentas Bancarias Requeridas:</strong> Debes
                        ingresar al menos una cuenta bancaria para habilitar
                        transferencias a cuenta bancaria
                      </AlertDescription>
                    </Alert>
                  )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileTextIcon className="h-5 w-5" />
                Configuración de Facturación Electrónica
              </CardTitle>
              <p className="mt-1 text-muted-foreground text-sm">
                Configura si deseas ofrecer facturación electrónica a tus
                clientes
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label
                    htmlFor="enable-electronic-invoice"
                    className="text-base"
                  >
                    Habilitar Factura Electrónica
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    Cuando está habilitado, el asistente preguntará a los
                    clientes si requieren factura electrónica personalizada
                    durante el proceso de pedido
                  </p>
                </div>
                <Switch
                  id="enable-electronic-invoice"
                  checked={config.enableElectronicInvoice}
                  onCheckedChange={(checked) =>
                    updateConfig("enableElectronicInvoice", checked)
                  }
                />
              </div>

              {config.enableElectronicInvoice && (
                <Alert className="border-blue-200 bg-blue-50">
                  <FileTextIcon className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    El asistente solicitará los siguientes datos a los clientes:
                    <ul className="mt-2 ml-4 list-disc space-y-1">
                      <li>
                        <strong>Persona Natural:</strong> Cédula, correo
                        electrónico y nombre completo
                      </li>
                      <li>
                        <strong>Empresa/Jurídica:</strong> NIT, correo
                        electrónico y razón social
                      </li>
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions">
          <MemberPermissionsSettings />
        </TabsContent>

        {/* Automatic First Reply - Platform Admin Only */}
        {/* Automatic Reply & Order Status - Platform Admin Only */}
        {isPlatformAdmin && (
          <TabsContent value="automatic-reply" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquareIcon className="h-5 w-5" />
                  Mensaje de Bienvenida
                </CardTitle>
                <p className="mt-1 text-muted-foreground text-sm">
                  Configura un mensaje de bienvenida determinístico que se
                  enviará automáticamente cuando un cliente escriba por primera
                  vez
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="automatic-reply-enabled"
                      className="font-medium"
                    >
                      Habilitar Respuesta Automática
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Cuando está activado, se enviará este mensaje como primera
                      respuesta en lugar de usar el agente de IA
                    </p>
                  </div>
                  <Switch
                    id="automatic-reply-enabled"
                    checked={config.automaticFirstReply.enabled}
                    onCheckedChange={(checked) =>
                      updateConfig("automaticFirstReply", {
                        ...config.automaticFirstReply,
                        enabled: checked,
                      })
                    }
                  />
                </div>

                {/* Message Input */}
                <div className="space-y-2">
                  <Label htmlFor="automatic-reply-message">
                    Mensaje de Bienvenida
                  </Label>
                  <Textarea
                    id="automatic-reply-message"
                    placeholder="¡Hola! 👋 Bienvenido a [Nombre del Restaurante]. ¿En qué podemos ayudarte hoy?"
                    value={config.automaticFirstReply.message}
                    onChange={(e) =>
                      updateConfig("automaticFirstReply", {
                        ...config.automaticFirstReply,
                        message: e.target.value,
                      })
                    }
                    rows={4}
                    className="resize-none"
                  />
                  <p className="text-muted-foreground text-xs">
                    Este mensaje se enviará exactamente como está escrito.
                    Puedes usar emojis y saltos de línea.
                  </p>
                </div>

                {/* Send Menu Option */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="automatic-reply-send-menu"
                      className="font-medium"
                    >
                      Incluir Menú
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Envía el menú configurado (imágenes, PDF o URL) junto con
                      el mensaje de bienvenida
                    </p>
                  </div>
                  <Switch
                    id="automatic-reply-send-menu"
                    checked={config.automaticFirstReply.sendMenu}
                    onCheckedChange={(checked) =>
                      updateConfig("automaticFirstReply", {
                        ...config.automaticFirstReply,
                        sendMenu: checked,
                      })
                    }
                  />
                </div>

                {config.automaticFirstReply.sendMenu && (
                  <Alert className="border-blue-200 bg-blue-50">
                    <AlertCircleIcon className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                      El menú se enviará según la configuración en la pestaña
                      "Información" (Imágenes, PDF o URL).
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex items-center justify-between gap-2.5">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquareIcon className="h-5 w-5" />
                    Mensajes de Seguimiento
                  </CardTitle>
                  <p className="text-muted-foreground text-sm">
                    Configura los mensajes automáticos que se envían cuando el
                    cliente no responde.
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <FollowUpSequenceBuilder
                  sequence={followUpSequence}
                  onChange={(newSequence) => {
                    setFollowUpSequence(newSequence)
                    setFollowUpValidationError(null)
                  }}
                />
                {followUpValidationError && (
                  <Alert className="mt-4 border-red-200 bg-red-50">
                    <AlertCircleIcon className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                      {followUpValidationError}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <OrderStatusSettings
              messages={config.orderStatusMessages}
              onUpdate={(messages) =>
                updateConfig("orderStatusMessages", messages)
              }
            />
          </TabsContent>
        )}
      </Tabs>
    </>
  )
}
