"use client"

import { api } from "@workspace/backend/_generated/api"
import {
  ALLOWED_AGENT_MODEL_OPTIONS,
  sanitizeConfiguredAgentModel,
  type AIModelType,
} from "@workspace/backend/lib/aiModels"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
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
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import { useMutation, useQuery } from "convex/react"
import {
  AlertCircleIcon,
  BookOpenIcon,
  CheckCircleIcon,
  EyeIcon,
  HelpCircleIcon,
  MessageCircleIcon,
  RotateCcwIcon,
  SaveIcon,
  SettingsIcon,
  StoreIcon,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useOrganization } from "@/hooks/use-organization"
import { useIsImplementor, usePlatformAdmin } from "@/hooks/use-platform-admin"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { MAX_FIELD_LENGTH } from "@/lib/constants"

export default function Page() {
  const [config, setConfig] = useState<{
    brandVoice: string
    restaurantContext: string
    customGreeting: string
    businessRules: string
    specialInstructions: string
    supportAgentModel: AIModelType | undefined
    menuAgentModel: AIModelType | undefined
    validationMenuAgentModel: AIModelType | undefined
    menuValidationAgentPrompt: string
    menuAgentPrompt: string
    ragConfiguration: unknown
    requireInitialLocationValidation: boolean
    strictAddressValidation: boolean
  }>({
    brandVoice: "",
    restaurantContext: "",
    customGreeting: "",
    businessRules: "",
    specialInstructions: "",
    supportAgentModel: undefined,
    menuAgentModel: undefined,
    validationMenuAgentModel: undefined,
    menuValidationAgentPrompt: "",
    menuAgentPrompt: "",
    ragConfiguration: undefined,
    requireInitialLocationValidation: false,
    strictAddressValidation: false,
  })

  const [hasChanges, setHasChanges] = useState(false)
  const [hasMainAgentChanges, setMainAgentHasChanges] = useState(false)
  const [hasRestaurantContextChanges, setHasRestaurantContextChanges] =
    useState(false)
  const [hasBrandVoiceChanges, setHasBrandVoiceChanges] = useState(false)
  const [hasCustomGreetingChanges, setHasCustomGreetingChanges] =
    useState(false)
  const [hasBusinessRulesChanges, setHasBusinessRulesChanges] = useState(false)
  const [hasSpecialInstructionsChanges, setHasSpecialInstructionsChanges] =
    useState(false)
  const [
    hasMenuValidationAgentPromptChanges,
    setHasMenuValidationAgentPromptChanges,
  ] = useState(false)
  const [hasMenuAgentPromptChanges, setHasMenuAgentPromptChanges] =
    useState(false)
  const [hasAIModelChanges, setHasAIModelChanges] = useState(false)
  const [hasConversationFlowChanges, setHasConversationFlowChanges] =
    useState(false)
  const [
    hasRequireInitialLocationValidationChanges,
    setHasRequireInitialLocationValidationChanges,
  ] = useState(false)
  const [
    hasStrictAddressValidationChanges,
    setHasStrictAddressValidationChanges,
  ] = useState(false)

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle")
  const [resetDialog, setResetDialog] = useState<{
    isOpen: boolean
    field: string
    title: string
    description: string
    onConfirm: () => void
  }>({
    isOpen: false,
    field: "",
    title: "",
    description: "",
    onConfirm: () => {},
  })
  const saveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (saveStatusTimeoutRef.current) {
        clearTimeout(saveStatusTimeoutRef.current)
      }
    }
  }, [])

  // Check platform admin membership for edit permissions
  const isPlatformAdmin = usePlatformAdmin()
  const isImplementor = useIsImplementor()
  const { activeOrganizationId } = useOrganization()

  // Queries and mutations
  const agentConfig = useQuery(
    api.private.agentConfiguration.getAgentConfiguration,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )

  const whatsappConfigurations = useQuery(
    api.private.whatsappConfigurations.getConfigurations,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )

  const upsertConfig = useMutation(
    api.private.agentConfiguration.upsertAgentConfiguration
  )

  const resetBrandVoice = useMutation(
    api.private.agentConfiguration.resetBrandVoice
  )
  const resetRestaurantContext = useMutation(
    api.private.agentConfiguration.resetRestaurantContext
  )
  const resetCustomGreeting = useMutation(
    api.private.agentConfiguration.resetCustomGreeting
  )
  const resetBusinessRules = useMutation(
    api.private.agentConfiguration.resetBusinessRules
  )
  const resetSpecialInstructions = useMutation(
    api.private.agentConfiguration.resetSpecialInstructions
  )
  const resetMenuValidationAgentPrompt = useMutation(
    api.private.agentConfiguration.resetMenuValidationAgentPrompt
  )
  const resetMenuAgentPrompt = useMutation(
    api.private.agentConfiguration.resetMenuAgentPrompt
  )

  // Implementors and platform admins can edit; regular org members are read-only
  const canEdit = isPlatformAdmin === true || isImplementor === true
  const isReadOnly =
    !canEdit && isPlatformAdmin !== undefined && isImplementor !== undefined

  // Initialize config when data loads
  useEffect(() => {
    if (agentConfig) {
      setConfig({
        brandVoice: agentConfig.brandVoice,
        restaurantContext: agentConfig.restaurantContext,
        customGreeting: agentConfig.customGreeting,
        businessRules: agentConfig.businessRules,
        specialInstructions: agentConfig.specialInstructions,
        supportAgentModel: agentConfig.supportAgentModel,
        menuAgentModel: agentConfig.menuAgentModel,
        validationMenuAgentModel: agentConfig.validationMenuAgentModel,
        menuValidationAgentPrompt: agentConfig.menuValidationAgentPrompt,
        menuAgentPrompt: agentConfig.menuAgentPrompt || "",
        ragConfiguration: agentConfig.ragConfiguration,
        requireInitialLocationValidation:
          agentConfig.requireInitialLocationValidation || false,
        strictAddressValidation: agentConfig.strictAddressValidation || false,
      })
    }
  }, [agentConfig])

  // Track individual field changes
  useEffect(() => {
    if (agentConfig) {
      setHasRestaurantContextChanges(
        config.restaurantContext !== agentConfig.restaurantContext
      )
      setHasBrandVoiceChanges(config.brandVoice !== agentConfig.brandVoice)
      setHasCustomGreetingChanges(
        config.customGreeting !== agentConfig.customGreeting
      )
      setHasBusinessRulesChanges(
        config.businessRules !== agentConfig.businessRules
      )
      setHasSpecialInstructionsChanges(
        config.specialInstructions !== agentConfig.specialInstructions
      )
      setHasMenuValidationAgentPromptChanges(
        config.menuValidationAgentPrompt !==
          agentConfig.menuValidationAgentPrompt
      )
      setHasMenuAgentPromptChanges(
        config.menuAgentPrompt !== (agentConfig.menuAgentPrompt || "")
      )
      setHasAIModelChanges(
        config.supportAgentModel !== agentConfig.supportAgentModel ||
          config.menuAgentModel !== agentConfig.menuAgentModel ||
          config.validationMenuAgentModel !==
            agentConfig.validationMenuAgentModel ||
          JSON.stringify(config.ragConfiguration) !==
            JSON.stringify(agentConfig.ragConfiguration)
      )
      setHasRequireInitialLocationValidationChanges(
        config.requireInitialLocationValidation !==
          (agentConfig.requireInitialLocationValidation || false)
      )
      setHasStrictAddressValidationChanges(
        config.strictAddressValidation !==
          (agentConfig.strictAddressValidation || false)
      )
    }
  }, [config, agentConfig])

  // Track conversation flow changes collectively
  useEffect(() => {
    setHasConversationFlowChanges(
      hasRequireInitialLocationValidationChanges ||
        hasStrictAddressValidationChanges
    )
  }, [
    hasRequireInitialLocationValidationChanges,
    hasStrictAddressValidationChanges,
  ])

  // Track overall changes
  useEffect(() => {
    setHasChanges(
      hasRestaurantContextChanges ||
        hasBrandVoiceChanges ||
        hasCustomGreetingChanges ||
        hasBusinessRulesChanges ||
        hasSpecialInstructionsChanges ||
        hasMenuValidationAgentPromptChanges ||
        hasMenuAgentPromptChanges ||
        hasAIModelChanges ||
        hasConversationFlowChanges
    )
  }, [
    hasRestaurantContextChanges,
    hasBrandVoiceChanges,
    hasCustomGreetingChanges,
    hasBusinessRulesChanges,
    hasSpecialInstructionsChanges,
    hasMenuValidationAgentPromptChanges,
    hasMenuAgentPromptChanges,
    hasAIModelChanges,
    hasConversationFlowChanges,
  ])

  useEffect(() => {
    setMainAgentHasChanges(
      hasRestaurantContextChanges ||
        hasBrandVoiceChanges ||
        hasCustomGreetingChanges ||
        hasBusinessRulesChanges ||
        hasSpecialInstructionsChanges
    )
  }, [
    hasRestaurantContextChanges,
    hasBrandVoiceChanges,
    hasCustomGreetingChanges,
    hasBusinessRulesChanges,
    hasSpecialInstructionsChanges,
  ])

  // Unsaved changes protection
  const { navigationDialog, closeDialog, confirmNavigation } =
    useUnsavedChanges(hasChanges)

  const resetSaveStatusAfterDelay = () => {
    if (saveStatusTimeoutRef.current) {
      clearTimeout(saveStatusTimeoutRef.current)
    }
    saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 3000)
  }

  const handleSave = async (onSuccess?: () => void) => {
    if (!hasChanges || !activeOrganizationId) return

    setSaveStatus("saving")
    try {
      const savePromises: Promise<unknown>[] = []

      const hasMainConfigChanges =
        hasRestaurantContextChanges ||
        hasBrandVoiceChanges ||
        hasCustomGreetingChanges ||
        hasBusinessRulesChanges ||
        hasSpecialInstructionsChanges ||
        hasMenuValidationAgentPromptChanges ||
        hasMenuAgentPromptChanges ||
        hasAIModelChanges ||
        hasConversationFlowChanges

      if (hasMainConfigChanges) {
        savePromises.push(
          upsertConfig({
            organizationId: activeOrganizationId,
            brandVoice: config.brandVoice.trim() || undefined,
            restaurantContext: config.restaurantContext.trim() || undefined,
            customGreeting: config.customGreeting.trim() || undefined,
            businessRules: config.businessRules.trim() || undefined,
            specialInstructions: config.specialInstructions.trim() || undefined,
        supportAgentModel: sanitizeConfiguredAgentModel(
          config.supportAgentModel
        ),
        menuAgentModel: sanitizeConfiguredAgentModel(config.menuAgentModel),
        validationMenuAgentModel:
          sanitizeConfiguredAgentModel(config.validationMenuAgentModel),
            menuValidationAgentPrompt:
              config.menuValidationAgentPrompt.trim() || undefined,
            menuAgentPrompt: config.menuAgentPrompt.trim() || undefined,
            ragConfiguration: config.ragConfiguration || undefined,
            requireInitialLocationValidation:
              config.requireInitialLocationValidation,
            strictAddressValidation: config.strictAddressValidation,
          })
        )
      }

      await Promise.all(savePromises)
      setSaveStatus("success")
      resetSaveStatusAfterDelay()
      onSuccess?.()
    } catch {
      setSaveStatus("error")
      resetSaveStatusAfterDelay()
    }
  }

  const handleResetBrandVoice = async () => {
    if (!activeOrganizationId) return
    setSaveStatus("saving")
    try {
      await resetBrandVoice({ organizationId: activeOrganizationId })
      setConfig((prev) => ({ ...prev, brandVoice: "" }))
      setSaveStatus("success")
      resetSaveStatusAfterDelay()
    } catch {
      setSaveStatus("error")
      resetSaveStatusAfterDelay()
    }
  }

  const handleResetRestaurantContext = async () => {
    if (!activeOrganizationId) return
    setSaveStatus("saving")
    try {
      await resetRestaurantContext({ organizationId: activeOrganizationId })
      setConfig((prev) => ({ ...prev, restaurantContext: "" }))
      setSaveStatus("success")
      resetSaveStatusAfterDelay()
    } catch {
      setSaveStatus("error")
      resetSaveStatusAfterDelay()
    }
  }

  const handleResetCustomGreeting = async () => {
    if (!activeOrganizationId) return
    setSaveStatus("saving")
    try {
      await resetCustomGreeting({ organizationId: activeOrganizationId })
      setConfig((prev) => ({ ...prev, customGreeting: "" }))
      setSaveStatus("success")
      resetSaveStatusAfterDelay()
    } catch {
      setSaveStatus("error")
      resetSaveStatusAfterDelay()
    }
  }

  const handleResetBusinessRules = async () => {
    if (!activeOrganizationId) return
    setSaveStatus("saving")
    try {
      await resetBusinessRules({ organizationId: activeOrganizationId })
      setConfig((prev) => ({ ...prev, businessRules: "" }))
      setSaveStatus("success")
      resetSaveStatusAfterDelay()
    } catch {
      setSaveStatus("error")
      resetSaveStatusAfterDelay()
    }
  }

  const handleResetSpecialInstructions = async () => {
    if (!activeOrganizationId) return
    setSaveStatus("saving")
    try {
      await resetSpecialInstructions({ organizationId: activeOrganizationId })
      setConfig((prev) => ({ ...prev, specialInstructions: "" }))
      setSaveStatus("success")
      resetSaveStatusAfterDelay()
    } catch {
      setSaveStatus("error")
      resetSaveStatusAfterDelay()
    }
  }

  const handleResetMenuValidationAgentPrompt = async () => {
    if (!activeOrganizationId) return
    setSaveStatus("saving")
    try {
      await resetMenuValidationAgentPrompt({
        organizationId: activeOrganizationId,
      })
      setConfig((prev) => ({ ...prev, menuValidationAgentPrompt: "" }))
      setSaveStatus("success")
      resetSaveStatusAfterDelay()
    } catch {
      setSaveStatus("error")
      resetSaveStatusAfterDelay()
    }
  }

  const handleResetMenuAgentPrompt = async () => {
    if (!activeOrganizationId) return
    setSaveStatus("saving")
    try {
      await resetMenuAgentPrompt({ organizationId: activeOrganizationId })
      setConfig((prev) => ({ ...prev, menuAgentPrompt: "" }))
      setSaveStatus("success")
      resetSaveStatusAfterDelay()
    } catch {
      setSaveStatus("error")
      resetSaveStatusAfterDelay()
    }
  }

  const openResetDialog = (
    field: string,
    title: string,
    description: string,
    onConfirm: () => void
  ) => {
    setResetDialog({
      isOpen: true,
      field,
      title,
      description,
      onConfirm,
    })
  }

  const closeResetDialog = () => {
    setResetDialog((prev) => ({ ...prev, isOpen: false }))
  }

  const confirmReset = async () => {
    await resetDialog.onConfirm()
    closeResetDialog()
  }

  const saveAndNavigate = async () => {
    await handleSave(() => {
      confirmNavigation()
    })
  }

  const updateConfig = (
    field: keyof typeof config,
    value: string | AIModelType | boolean | unknown
  ) => {
    // Prevent changes in read-only mode
    if (isReadOnly) return

    // Basic validation for string fields
    if (
      typeof value === "string" &&
      field !== "supportAgentModel" &&
      field !== "menuAgentModel" &&
      field !== "validationMenuAgentModel" &&
      field !== "menuValidationAgentPrompt" &&
      field !== "menuAgentPrompt" &&
      field !== "ragConfiguration" &&
      field !== "requireInitialLocationValidation" &&
      field !== "strictAddressValidation" &&
      value.length > MAX_FIELD_LENGTH
    ) {
      return // Don't update if exceeds limit
    }
    setConfig((prev) => ({ ...prev, [field]: value }))
  }

  if (agentConfig === undefined || whatsappConfigurations === undefined) {
    return null
  }

  // Strict Validation Logic: can only enable if there are active numbers AND they are all Meta
  const activeWhatsappConfigs =
    whatsappConfigurations?.filter((c) => c.isActive) || []
  const hasActiveNumbers = activeWhatsappConfigs.length > 0
  const hasOnlyMeta =
    hasActiveNumbers &&
    activeWhatsappConfigs.every((c) => c.provider === "meta")
  const canEnableStrictValidation = hasOnlyMeta

  // If currently enabled but conditions fail (e.g. number deleted), force disable
  // Note: changing state during render is bad, but for display/update logic we handle it in onChange
  const isStrictValidationDisabled = !canEnableStrictValidation && !isReadOnly

  return (
    <>
      {/* Read-only alert for normal admins */}
      {isReadOnly && (
        <Alert className="border-blue-200 bg-blue-50">
          <EyeIcon className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Modo de solo lectura:</strong> Solo puedes ver la
            configuración actual. Para modificar estas opciones, contacta al
            equipo de soporte técnico.
          </AlertDescription>
        </Alert>
      )}

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

      <div className="flex flex-col gap-2.5">
        {/* AI Models Section - Always Visible */}
        <Card>
          <CardContent className="flex flex-col gap-1">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-3">
                <Label htmlFor="support-agent-model">
                  Modelo del Agente Principal
                </Label>
                <p className="text-muted-foreground text-sm">
                  Modelo utilizado para el agente principal que maneja
                  conversaciones, pedidos y atención al cliente.
                </p>
                <Select
                  value={config.supportAgentModel || ""}
                  onValueChange={(value) =>
                    updateConfig("supportAgentModel", value || undefined)
                  }
                  disabled={isReadOnly}
                >
                  <SelectTrigger className="h-auto min-h-[40px]">
                    <SelectValue placeholder="Por defecto: Grok 4 Fast" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[300px] sm:max-w-none">
                    {ALLOWED_AGENT_MODEL_OPTIONS.map((model) => (
                      <SelectItem
                        key={model.value}
                        value={model.value}
                        className="h-auto py-3"
                      >
                        <div className="flex w-full flex-col items-start gap-1">
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="font-medium text-sm">
                              {model.label}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {model.provider}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label htmlFor="menu-agent-model">
                  Modelo del Agente de Menú
                </Label>
                <p className="text-muted-foreground text-sm">
                  Modelo utilizado para responder preguntas específicas sobre el
                  menú y productos disponibles.
                </p>
                <Select
                  value={config.menuAgentModel || ""}
                  onValueChange={(value) =>
                    updateConfig("menuAgentModel", value || undefined)
                  }
                  disabled={isReadOnly}
                >
                  <SelectTrigger className="h-auto min-h-[40px]">
                    <SelectValue placeholder="Por defecto: Grok 4 Fast" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[300px] sm:max-w-none">
                    {ALLOWED_AGENT_MODEL_OPTIONS.map((model) => (
                      <SelectItem
                        key={model.value}
                        value={model.value}
                        className="h-auto py-3"
                      >
                        <div className="flex w-full flex-col items-start gap-1">
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="font-medium text-sm">
                              {model.label}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {model.provider}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label htmlFor="validation-menu-agent-model">
                  Modelo del Agente de Validación de Menú
                </Label>
                <p className="text-muted-foreground text-sm">
                  Modelo utilizado para validar combinaciones de productos y
                  reglas complejas de productos.
                </p>
                <Select
                  value={config.validationMenuAgentModel || ""}
                  onValueChange={(value) =>
                    updateConfig("validationMenuAgentModel", value || undefined)
                  }
                  disabled={isReadOnly}
                >
                  <SelectTrigger className="h-auto min-h-[40px]">
                    <SelectValue placeholder="Por defecto: Gemini 2.5 Flash" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[300px] sm:max-w-none">
                    {ALLOWED_AGENT_MODEL_OPTIONS.map((model) => (
                      <SelectItem
                        key={model.value}
                        value={model.value}
                        className="h-auto py-3"
                      >
                        <div className="flex w-full flex-col items-start gap-1">
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="font-medium text-sm">
                              {model.label}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {model.provider}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Unsaved Changes Alert for AI Models */}
            {hasAIModelChanges && (
              <span className="font-medium text-amber-600 text-sm">
                ⚠️ Cambios sin guardar
              </span>
            )}
          </CardContent>
        </Card>

        {/* Conversation Flow Variables Card */}
        <Card>
          <CardHeader className="flex items-center justify-between gap-2.5">
            <CardTitle>Variables de flujo conversacional</CardTitle>
            {hasConversationFlowChanges && (
              <span className="font-medium text-amber-600 text-sm">
                ⚠️ Cambios sin guardar
              </span>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="require-initial-location-validation">
                  Requerir ubicación inicial
                </Label>
                <p className="text-muted-foreground text-sm">
                  Cuando está activado, el asistente solicita la ubicación del
                  cliente antes de mostrar el menú o procesar pedidos.
                </p>
                <p className="text-muted-foreground text-xs">
                  <strong>Recomendado</strong> para restaurantes con productos
                  constantemente inhabilitados en multiples sucursales
                </p>
              </div>
              <Switch
                id="require-initial-location-validation"
                checked={config.requireInitialLocationValidation}
                onCheckedChange={(checked) =>
                  updateConfig("requireInitialLocationValidation", checked)
                }
                disabled={isReadOnly}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="strict-address-validation">
                  Solicitar ubicación en direcciones no geodecodificables
                </Label>
                <div className="text-muted-foreground text-sm">
                  <p>
                    Fuerza el uso de ubicación GPS para sitios específicos
                    (edificios, conjuntos) que no tienen una dirección vial
                    clara.
                  </p>
                  {!hasActiveNumbers ? (
                    <p className="mt-1 text-amber-600 text-xs">
                      Requiere conectar un número de WhatsApp.
                    </p>
                  ) : !hasOnlyMeta ? (
                    <p className="mt-1 text-amber-600 text-xs">
                      Solo disponible para números conectados via Meta Cloud
                      API.
                    </p>
                  ) : null}
                </div>
              </div>
              <Switch
                id="strict-address-validation"
                checked={config.strictAddressValidation}
                onCheckedChange={(checked) => {
                  if (checked && !canEnableStrictValidation) return
                  updateConfig("strictAddressValidation", checked)
                }}
                disabled={isStrictValidationDisabled || isReadOnly}
              />
            </div>
          </CardContent>
        </Card>

        {/* Follow-Up Sequence Card */}

        {/* Main Configuration Panel */}
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Personalización del Agente Principal</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {hasMainAgentChanges && (
                <span className="font-medium text-amber-600 text-sm">
                  ⚠️ Cambios sin guardar
                </span>
              )}
              <Link href="/customization/agent-guide">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5"
                >
                  <HelpCircleIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    Guía - Agente Principal
                  </span>
                  <span className="sm:hidden">Guía</span>
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="restaurant-info" className="w-full">
              <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
                <TabsTrigger
                  value="restaurant-info"
                  className="flex items-center gap-1 px-2 py-2 text-xs sm:px-3 sm:text-sm"
                >
                  <StoreIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="inline">Restaurante</span>
                </TabsTrigger>
                <TabsTrigger
                  value="brand-voice"
                  className="flex items-center gap-1 px-2 py-2 text-xs sm:px-3 sm:text-sm"
                >
                  <MessageCircleIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="inline">Personalidad</span>
                </TabsTrigger>
                <TabsTrigger
                  value="business-rules"
                  className="flex items-center gap-1 px-2 py-2 text-xs sm:px-3 sm:text-sm"
                >
                  <BookOpenIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                  Reglas
                </TabsTrigger>
                <TabsTrigger
                  value="advanced"
                  className="flex items-center gap-1 px-2 py-2 text-xs sm:px-3 sm:text-sm"
                >
                  <SettingsIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="inline">Avanzado</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="restaurant-info" className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <Label htmlFor="restaurant-context">
                      Contexto del Restaurante
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Describe tu restaurante, especialidades, y qué lo hace
                      único.
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        openResetDialog(
                          "restaurantContext",
                          "Restablecer Contexto del Restaurante",
                          "¿Estás seguro de que quieres restablecer el contexto del restaurante? Esta acción eliminará toda la información personalizada y no se puede deshacer.",
                          handleResetRestaurantContext
                        )
                      }
                      disabled={saveStatus === "saving"}
                      className="mt-6 flex items-center gap-2 sm:mt-0"
                    >
                      <RotateCcwIcon className="h-4 w-4" />
                      Restablecer Restaurante
                    </Button>
                  )}
                </div>
                <div>
                  <Textarea
                    id="restaurant-context"
                    value={config.restaurantContext}
                    onChange={(e) =>
                      updateConfig("restaurantContext", e.target.value)
                    }
                    placeholder="Ej: Somos una pizzería artesanal que se especializa en ingredientes frescos y locales..."
                    rows={4}
                    disabled={isReadOnly}
                    className="max-h-[85dvh]"
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {config.restaurantContext.length}/{MAX_FIELD_LENGTH}
                    </span>
                    {hasRestaurantContextChanges && (
                      <span className="font-medium text-amber-600">
                        ⚠️ Cambios sin guardar
                      </span>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="brand-voice" className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <Label htmlFor="brand-voice">Personalidad y Estilo</Label>
                    <p className="text-muted-foreground text-sm">
                      Define cómo debe comunicarse tu asistente con los
                      clientes.
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        openResetDialog(
                          "brandVoice",
                          "Restablecer Personalidad y Estilo",
                          "¿Estás seguro de que quieres restablecer la personalidad y estilo del asistente? Esta acción eliminará toda la configuración personalizada y no se puede deshacer.",
                          handleResetBrandVoice
                        )
                      }
                      disabled={saveStatus === "saving"}
                      className="mt-6 flex items-center gap-2 sm:mt-0"
                    >
                      <RotateCcwIcon className="h-4 w-4" />
                      Restablecer Personalidad
                    </Button>
                  )}
                </div>
                <div>
                  <Textarea
                    id="brand-voice"
                    value={config.brandVoice}
                    onChange={(e) => updateConfig("brandVoice", e.target.value)}
                    placeholder="Ej: Sé amigable, cálido y acogedor. Usa un lenguaje cercano que haga sentir bienvenidos a los clientes..."
                    rows={4}
                    disabled={isReadOnly}
                    className="max-h-[85dvh]"
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {config.brandVoice.length}/{MAX_FIELD_LENGTH}
                    </span>
                    {hasBrandVoiceChanges && (
                      <span className="font-medium text-amber-600">
                        ⚠️ Cambios sin guardar
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <Label htmlFor="custom-greeting">
                      Saludo Personalizado
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Instrucciones sobre cómo debe saludar y recibir a los
                      clientes.
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        openResetDialog(
                          "customGreeting",
                          "Restablecer Saludo Personalizado",
                          "¿Estás seguro de que quieres restablecer el saludo personalizado? Esta acción eliminará toda la configuración personalizada y no se puede deshacer.",
                          handleResetCustomGreeting
                        )
                      }
                      disabled={saveStatus === "saving"}
                      className="mt-6 flex items-center gap-2 sm:mt-0"
                    >
                      <RotateCcwIcon className="h-4 w-4" />
                      Restablecer Saludo
                    </Button>
                  )}
                </div>
                <div>
                  <Textarea
                    id="custom-greeting"
                    value={config.customGreeting}
                    onChange={(e) =>
                      updateConfig("customGreeting", e.target.value)
                    }
                    placeholder="Ej: Saluda con entusiasmo mencionando las especialidades del día..."
                    rows={3}
                    disabled={isReadOnly}
                    className="max-h-[85dvh]"
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {config.customGreeting.length}/{MAX_FIELD_LENGTH}
                    </span>
                    {hasCustomGreetingChanges && (
                      <span className="font-medium text-amber-600">
                        ⚠️ Cambios sin guardar
                      </span>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="business-rules" className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <Label htmlFor="business-rules">
                      Políticas y Reglas del Negocio
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Define políticas específicas, horarios, métodos de pago,
                      políticas de entrega, etc.
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        openResetDialog(
                          "businessRules",
                          "Restablecer Políticas y Reglas",
                          "¿Estás seguro de que quieres restablecer las políticas y reglas del negocio? Esta acción eliminará toda la configuración personalizada y no se puede deshacer.",
                          handleResetBusinessRules
                        )
                      }
                      disabled={saveStatus === "saving"}
                      className="mt-6 flex items-center gap-2 sm:mt-0"
                    >
                      <RotateCcwIcon className="h-4 w-4" />
                      Restablecer Reglas
                    </Button>
                  )}
                </div>
                <Textarea
                  id="business-rules"
                  value={config.businessRules}
                  onChange={(e) =>
                    updateConfig("businessRules", e.target.value)
                  }
                  placeholder="Ej: Horarios de atención: L-V 11:00-22:00, S-D 12:00-23:00. Entrega gratis pedidos >$30.000. Aceptamos efectivo y tarjetas..."
                  rows={6}
                  disabled={isReadOnly}
                  className="max-h-[85dvh]"
                />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {config.businessRules.length}/{MAX_FIELD_LENGTH}
                  </span>
                  {hasBusinessRulesChanges && (
                    <span className="font-medium text-amber-600">
                      ⚠️ Cambios sin guardar
                    </span>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <Label htmlFor="special-instructions">
                      Instrucciones Especiales
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      Instrucciones adicionales o comportamientos específicos
                      que quieras que tenga tu asistente.
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        openResetDialog(
                          "specialInstructions",
                          "Restablecer Instrucciones Especiales",
                          "¿Estás seguro de que quieres restablecer las instrucciones especiales? Esta acción eliminará toda la configuración personalizada y no se puede deshacer.",
                          handleResetSpecialInstructions
                        )
                      }
                      disabled={saveStatus === "saving"}
                      className="mt-6 flex items-center gap-2 sm:mt-0"
                    >
                      <RotateCcwIcon className="h-4 w-4" />
                      Restablecer Avanzado
                    </Button>
                  )}
                </div>
                <Textarea
                  id="special-instructions"
                  value={config.specialInstructions}
                  onChange={(e) =>
                    updateConfig("specialInstructions", e.target.value)
                  }
                  placeholder="Ej: Siempre pregunta si el cliente tiene alguna alergia alimentaria antes de confirmar el pedido..."
                  rows={4}
                  disabled={isReadOnly}
                  className="max-h-[85dvh]"
                />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {config.specialInstructions.length}/{MAX_FIELD_LENGTH}
                  </span>
                  {hasSpecialInstructionsChanges && (
                    <span className="font-medium text-amber-600">
                      ⚠️ Cambios sin guardar
                    </span>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Personalización del Agente de Menú</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/customization/menu-agent-guide">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5"
                >
                  <HelpCircleIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    Guía - Agentes de Menú
                  </span>
                  <span className="sm:hidden">Guía</span>
                </Button>
              </Link>
            </div>

            {canEdit && (
              <Button
                variant="outline"
                onClick={() =>
                  openResetDialog(
                    "menuAgentPrompt",
                    "Restablecer Prompt del Agente de Menú",
                    "¿Estás seguro de que quieres restablecer el prompt del agente de menú? Esta acción eliminará toda la configuración personalizada y no se puede deshacer.",
                    handleResetMenuAgentPrompt
                  )
                }
                disabled={saveStatus === "saving"}
                className="mt-6 flex items-center gap-2 sm:mt-0"
              >
                <RotateCcwIcon className="h-4 w-4" />
                Restablecer
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              id="menu-agent-prompt"
              value={config.menuAgentPrompt}
              onChange={(e) => updateConfig("menuAgentPrompt", e.target.value)}
              placeholder="Ej: Responde preguntas sobre el menú, precios y disponibilidad de productos..."
              rows={6}
              disabled={isReadOnly}
              className="max-h-[85dvh]"
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {config.menuAgentPrompt.length}/{MAX_FIELD_LENGTH}
              </span>
              {hasMenuAgentPromptChanges && (
                <span className="font-medium text-amber-600">
                  ⚠️ Cambios sin guardar
                </span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>
              Personalización del Agente de Validación de Menú
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/customization/menu-agent-guide">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5"
                >
                  <HelpCircleIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    Guía - Agentes de Menú
                  </span>
                  <span className="sm:hidden">Guía</span>
                </Button>
              </Link>
            </div>

            {canEdit && (
              <Button
                variant="outline"
                onClick={() =>
                  openResetDialog(
                    "menuValidationAgentPrompt",
                    "Restablecer Prompt de Validación de Menú",
                    "¿Estás seguro de que quieres restablecer el prompt del agente de validación de menú? Esta acción eliminará toda la configuración personalizada y no se puede deshacer.",
                    handleResetMenuValidationAgentPrompt
                  )
                }
                disabled={saveStatus === "saving"}
                className="mt-6 flex items-center gap-2 sm:mt-0"
              >
                <RotateCcwIcon className="h-4 w-4" />
                Restablecer
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              id="menu-validation-agent-prompt"
              value={config.menuValidationAgentPrompt}
              onChange={(e) =>
                updateConfig("menuValidationAgentPrompt", e.target.value)
              }
              placeholder="Ej: Valida que los productos combinables (como medias pizzas) se pidan en pares del mismo tamaño y categoría..."
              rows={6}
              disabled={isReadOnly}
              className="max-h-[85dvh]"
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {config.menuValidationAgentPrompt.length}/{MAX_FIELD_LENGTH}
              </span>
              {hasMenuValidationAgentPromptChanges && (
                <span className="font-medium text-amber-600">
                  ⚠️ Cambios sin guardar
                </span>
              )}
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          {canEdit && hasChanges && (
            <Button
              onClick={() => handleSave()}
              disabled={saveStatus === "saving"}
              className="flex w-fit items-center gap-2"
            >
              <SaveIcon className="h-4 w-4" />
              {saveStatus === "saving" ? "Guardando..." : "Guardar Cambios"}
            </Button>
          )}
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={resetDialog.isOpen} onOpenChange={closeResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{resetDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {resetDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeResetDialog}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReset}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Restablecer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Navigation Confirmation Dialog */}
      <AlertDialog open={navigationDialog.isOpen} onOpenChange={closeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios pendientes que no se han guardado. Si continúas,
              perderás estos cambios. ¿Deseas guardar los cambios antes de
              continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmNavigation}>
              Continuar sin guardar
            </Button>
            <AlertDialogAction
              onClick={saveAndNavigate}
              disabled={saveStatus === "saving"}
            >
              {saveStatus === "saving" ? "Guardando..." : "Guardar y continuar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
