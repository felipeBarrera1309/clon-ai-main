"use client"

import { api } from "@workspace/backend/_generated/api"
import {
  ALLOWED_AGENT_MODEL_OPTIONS,
  sanitizeConfiguredAgentModel,
  type AIModelType,
} from "@workspace/backend/lib/aiModels"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
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
  BotIcon,
  CheckCircleIcon,
  MessageCircleIcon,
  RotateCcwIcon,
  SaveIcon,
  SettingsIcon,
  SparklesIcon,
  StoreIcon,
} from "lucide-react"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { MAX_FIELD_LENGTH } from "@/lib/constants"

const restaurantTypes = [
  { value: "casual", label: "Restaurante Casual" },
  { value: "formal", label: "Restaurante Formal" },
  { value: "pizzeria", label: "Pizzería" },
  { value: "fast-food", label: "Comida Rápida" },
  { value: "vegan", label: "Restaurante Vegano" },
  { value: "cafe", label: "Café/Cafetería" },
  { value: "bakery", label: "Panadería" },
  { value: "other", label: "Otro" },
]

const toneOptions = [
  { value: "professional", label: "Profesional" },
  { value: "friendly", label: "Amigable" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "energetic", label: "Enérgico" },
]

const brandVoiceTemplates = {
  professional:
    "Mantén un tono profesional y cortés en todas las interacciones. Sé claro, directo y empático con los clientes.",
  friendly:
    "Sé amigable, cálido y acogedor. Usa un lenguaje cercano que haga sentir bienvenidos a los clientes.",
  casual:
    "Usa un tono relajado y conversacional. Sé natural y espontáneo, como si fueras un amigo ayudando.",
  formal:
    "Mantén un tono elegante y refinado. Usa un lenguaje sofisticado apropiado para un establecimiento de alta gama.",
  energetic:
    "Sé entusiasta y dinámico. Demuestra pasión por la comida y el servicio al cliente.",
}

const restaurantContextTemplates = {
  casual:
    "# Asistente de Restaurante Casual\n\nEres el asistente virtual de un restaurante casual y acogedor. Ayudas a familias y clientes de todas las edades a disfrutar de una experiencia gastronómica relajada.",
  formal:
    "# Asistente de Restaurante de Alta Cocina\n\nEres el asistente virtual de un restaurante de alta cocina. Te especializas en gastronomía refinada, maridajes de vinos y experiencias culinarias excepcionales.",
  pizzeria:
    "# Asistente de Pizzería\n\nEres el asistente virtual de una pizzería. Te especializas en pizzas artesanales, ingredientes frescos y crear el ambiente perfecto para compartir en familia o con amigos.",
  "fast-food":
    "# Asistente de Comida Rápida\n\nEres el asistente virtual de un restaurante de comida rápida. Tu prioridad es la eficiencia, los combos, las promociones y un servicio ágil.",
  vegan:
    "# Asistente de Restaurante Vegano\n\nEres el asistente virtual de un restaurante vegano. Eres experto en cocina plant-based, ingredientes naturales y promocionas un estilo de vida sostenible.",
  cafe: "# Asistente de Café\n\nEres el asistente virtual de una cafetería. Te especializas en café de calidad, bebidas especiales, repostería y crear un ambiente acogedor para trabajar o socializar.",
  bakery:
    "# Asistente de Panadería\n\nEres el asistente virtual de una panadería. Te especializas en productos horneados frescos, panes artesanales, pasteles y dulces tradicionales.",
  other:
    "# Asistente Virtual de Restaurante\n\nEres el asistente virtual de nuestro establecimiento gastronómico. Ayudas a los clientes con información sobre nuestro menú, pedidos y servicios.",
}

export default function Page() {
  const params = useParams()
  const organizationId = params.organizationId as string

  const [config, setConfig] = useState({
    brandVoice: "",
    restaurantContext: "",
    customGreeting: "",
    businessRules: "",
    specialInstructions: "",
    supportAgentModel: undefined as AIModelType | undefined,
    menuAgentModel: undefined as AIModelType | undefined,
    validationMenuAgentModel: undefined as AIModelType | undefined,
  })
  const [selectedRestaurantType, setSelectedRestaurantType] = useState("")
  const [selectedTone, setSelectedTone] = useState("")
  const [hasChanges, setHasChanges] = useState(false)
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle")

  // Queries and mutations
  const agentConfig = useQuery(
    api.superAdmin.agentConfiguration.getAgentConfiguration,
    { organizationId }
  )
  const upsertConfig = useMutation(
    api.superAdmin.agentConfiguration.upsertAgentConfiguration
  )
  const resetConfig = useMutation(
    api.superAdmin.agentConfiguration.resetAgentConfiguration
  )

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
      })
    }
  }, [agentConfig])

  // Track changes
  useEffect(() => {
    if (agentConfig) {
      const originalConfig = {
        brandVoice: agentConfig.brandVoice,
        restaurantContext: agentConfig.restaurantContext,
        customGreeting: agentConfig.customGreeting,
        businessRules: agentConfig.businessRules,
        specialInstructions: agentConfig.specialInstructions,
        supportAgentModel: agentConfig.supportAgentModel,
        menuAgentModel: agentConfig.menuAgentModel,
        validationMenuAgentModel: agentConfig.validationMenuAgentModel,
      }

      setHasChanges(JSON.stringify(config) !== JSON.stringify(originalConfig))
    }
  }, [config, agentConfig])

  const handleSave = async () => {
    if (!hasChanges) return

    setSaveStatus("saving")
    try {
      await upsertConfig({
        organizationId,
        brandVoice: config.brandVoice.trim() || undefined,
        restaurantContext: config.restaurantContext.trim() || undefined,
        customGreeting: config.customGreeting.trim() || undefined,
        businessRules: config.businessRules.trim() || undefined,
        specialInstructions: config.specialInstructions.trim() || undefined,
        supportAgentModel: sanitizeConfiguredAgentModel(
          config.supportAgentModel
        ),
        menuAgentModel: sanitizeConfiguredAgentModel(config.menuAgentModel),
        validationMenuAgentModel: sanitizeConfiguredAgentModel(
          config.validationMenuAgentModel
        ),
      })
      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    }
  }

  const handleReset = async () => {
    setSaveStatus("saving")
    try {
      await resetConfig({ organizationId })
      setConfig({
        brandVoice: "",
        restaurantContext: "",
        customGreeting: "",
        businessRules: "",
        specialInstructions: "",
        supportAgentModel: undefined,
        menuAgentModel: undefined,
        validationMenuAgentModel: undefined,
      })
      setSelectedRestaurantType("")
      setSelectedTone("")
      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    }
  }

  const updateConfig = (
    field: keyof typeof config,
    value: string | AIModelType | undefined
  ) => {
    // Basic validation for string fields
    if (
      typeof value === "string" &&
      field !== "supportAgentModel" &&
      field !== "menuAgentModel" &&
      field !== "validationMenuAgentModel" &&
      value.length > MAX_FIELD_LENGTH
    ) {
      return // Don't update if exceeds limit
    }
    setConfig((prev) => ({ ...prev, [field]: value }))
  }

  const applyTemplate = (type: "tone" | "restaurant", value: string) => {
    if (type === "tone" && value in brandVoiceTemplates) {
      updateConfig(
        "brandVoice",
        brandVoiceTemplates[value as keyof typeof brandVoiceTemplates]
      )
      setSelectedTone(value)
    } else if (type === "restaurant" && value in restaurantContextTemplates) {
      updateConfig(
        "restaurantContext",
        restaurantContextTemplates[
          value as keyof typeof restaurantContextTemplates
        ]
      )
      setSelectedRestaurantType(value)
    }
  }

  if (agentConfig === undefined) {
    return null
  }

  return (
    <div className="flex h-full flex-col space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={saveStatus === "saving"}
            className="flex items-center gap-2"
          >
            <RotateCcwIcon className="h-4 w-4" />
            Restablecer
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saveStatus === "saving"}
            className="flex items-center gap-2"
          >
            <SaveIcon className="h-4 w-4" />
            {saveStatus === "saving" ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>
      </div>

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

      <div className="grid gap-6">
        {/* Main Configuration Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SparklesIcon className="h-5 w-5" />
              Configuración del Asistente
            </CardTitle>
            <p className="mt-1 text-muted-foreground text-sm">
              Personaliza diferentes aspectos de tu asistente virtual usando las
              pestañas a continuación.
            </p>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="restaurant-info" className="w-full">
              <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                <TabsTrigger
                  value="restaurant-info"
                  className="flex items-center gap-1 px-2 py-2 text-xs sm:px-3 sm:text-sm"
                >
                  <StoreIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Restaurante</span>
                  <span className="sm:hidden">Local</span>
                </TabsTrigger>
                <TabsTrigger
                  value="brand-voice"
                  className="flex items-center gap-1 px-2 py-2 text-xs sm:px-3 sm:text-sm"
                >
                  <MessageCircleIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Personalidad</span>
                  <span className="sm:hidden">Voz</span>
                </TabsTrigger>
                <TabsTrigger
                  value="business-rules"
                  className="flex items-center gap-1 px-2 py-2 text-xs sm:px-3 sm:text-sm"
                >
                  <BookOpenIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                  Reglas
                </TabsTrigger>
                <TabsTrigger
                  value="ai-models"
                  className="flex items-center gap-1 px-2 py-2 text-xs sm:px-3 sm:text-sm"
                >
                  <SparklesIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Modelos IA</span>
                  <span className="sm:hidden">IA</span>
                </TabsTrigger>
                <TabsTrigger
                  value="advanced"
                  className="flex items-center gap-1 px-2 py-2 text-xs sm:px-3 sm:text-sm"
                >
                  <SettingsIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Avanzado</span>
                  <span className="sm:hidden">+</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="restaurant-info" className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="restaurant-type">Tipo de Restaurante</Label>
                    <p className="mb-2 text-muted-foreground text-sm">
                      Selecciona el tipo de restaurante para obtener un contexto
                      base apropiado.
                    </p>
                    <Select
                      value={selectedRestaurantType}
                      onValueChange={(value) =>
                        applyTemplate("restaurant", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona el tipo de tu restaurante" />
                      </SelectTrigger>
                      <SelectContent>
                        {restaurantTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="restaurant-context">
                      Contexto del Restaurante
                    </Label>
                    <p className="mb-2 text-muted-foreground text-sm">
                      Describe tu restaurante, especialidades, y qué lo hace
                      único.
                    </p>
                    <Textarea
                      id="restaurant-context"
                      value={config.restaurantContext}
                      onChange={(e) =>
                        updateConfig("restaurantContext", e.target.value)
                      }
                      placeholder="Ej: Somos una pizzería artesanal que se especializa en ingredientes frescos y locales..."
                      rows={4}
                    />
                    <div className="flex justify-end text-muted-foreground text-xs">
                      <span
                        className={
                          config.restaurantContext.length >
                          MAX_FIELD_LENGTH * 0.9
                            ? "text-amber-600"
                            : ""
                        }
                      >
                        {config.restaurantContext.length}/{MAX_FIELD_LENGTH}
                      </span>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="brand-voice" className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="tone">Tono de Comunicación</Label>
                    <p className="mb-2 text-muted-foreground text-sm">
                      Selecciona el tono base para las conversaciones.
                    </p>
                    <Select
                      value={selectedTone}
                      onValueChange={(value) => applyTemplate("tone", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona el tono de comunicación" />
                      </SelectTrigger>
                      <SelectContent>
                        {toneOptions.map((tone) => (
                          <SelectItem key={tone.value} value={tone.value}>
                            {tone.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="brand-voice">Personalidad y Estilo</Label>
                    <p className="mb-2 text-muted-foreground text-sm">
                      Define cómo debe comunicarse tu asistente con los
                      clientes.
                    </p>
                    <Textarea
                      id="brand-voice"
                      value={config.brandVoice}
                      onChange={(e) =>
                        updateConfig("brandVoice", e.target.value)
                      }
                      placeholder="Ej: Sé amigable, cálido y acogedor. Usa un lenguaje cercano que haga sentir bienvenidos a los clientes..."
                      rows={4}
                    />
                    <div className="flex justify-end text-muted-foreground text-xs">
                      <span
                        className={
                          config.brandVoice.length > MAX_FIELD_LENGTH * 0.9
                            ? "text-amber-600"
                            : ""
                        }
                      >
                        {config.brandVoice.length}/{MAX_FIELD_LENGTH}
                      </span>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="custom-greeting">
                      Saludo Personalizado
                    </Label>
                    <p className="mb-2 text-muted-foreground text-sm">
                      Instrucciones sobre cómo debe saludar y recibir a los
                      clientes.
                    </p>
                    <Textarea
                      id="custom-greeting"
                      value={config.customGreeting}
                      onChange={(e) =>
                        updateConfig("customGreeting", e.target.value)
                      }
                      placeholder="Ej: Saluda con entusiasmo mencionando las especialidades del día..."
                      rows={3}
                    />
                    <div className="flex justify-end text-muted-foreground text-xs">
                      <span
                        className={
                          config.customGreeting.length > MAX_FIELD_LENGTH * 0.9
                            ? "text-amber-600"
                            : ""
                        }
                      >
                        {config.customGreeting.length}/{MAX_FIELD_LENGTH}
                      </span>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="business-rules" className="space-y-4">
                <div>
                  <Label htmlFor="business-rules">
                    Políticas y Reglas del Negocio
                  </Label>
                  <p className="mb-2 text-muted-foreground text-sm">
                    Define políticas específicas, horarios, métodos de pago,
                    políticas de entrega, etc.
                  </p>
                  <Textarea
                    id="business-rules"
                    value={config.businessRules}
                    onChange={(e) =>
                      updateConfig("businessRules", e.target.value)
                    }
                    placeholder="Ej: Horarios de atención: L-V 11:00-22:00, S-D 12:00-23:00. Entrega gratis pedidos >$30.000. Aceptamos efectivo y tarjetas..."
                    rows={6}
                  />
                  <div className="flex justify-end text-muted-foreground text-xs">
                    <span
                      className={
                        config.businessRules.length > MAX_FIELD_LENGTH * 0.9
                          ? "text-amber-600"
                          : ""
                      }
                    >
                      {config.businessRules.length}/{MAX_FIELD_LENGTH}
                    </span>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="ai-models" className="space-y-4">
                <div className="space-y-6">
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <h4 className="mb-2 font-medium text-blue-900">
                      🤖 Configuración de Modelos de IA
                    </h4>
                    <p className="text-blue-800 text-sm">
                      Selecciona los modelos de inteligencia artificial que
                      utilizarán tus agentes. Estos ajustes solo están
                      disponibles para administradores del sistema.
                    </p>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
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
                        Modelo utilizado para responder preguntas específicas
                        sobre el menú y productos disponibles.
                      </p>
                      <Select
                        value={config.menuAgentModel || ""}
                        onValueChange={(value) =>
                          updateConfig("menuAgentModel", value || undefined)
                        }
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
                        Modelo utilizado para validar combinaciones de productos
                        y reglas de negocio del menú.
                      </p>
                      <Select
                        value={config.validationMenuAgentModel || ""}
                        onValueChange={(value) =>
                          updateConfig(
                            "validationMenuAgentModel",
                            value || undefined
                          )
                        }
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
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <h4 className="mb-2 font-medium text-amber-900">
                      ⚠️ Información Importante sobre Modelos
                    </h4>
                    <ul className="space-y-1 text-amber-800 text-sm">
                      <li>
                        • Por defecto se utiliza{" "}
                        <strong>Grok 4 Fast (Sin Razonamiento)</strong> para
                        ambos agentes
                      </li>
                      <li>
                        • Los cambios se aplican inmediatamente a nuevas
                        conversaciones
                      </li>
                      <li>
                        • Cada modelo tiene diferentes capacidades y tiempos de
                        respuesta
                      </li>
                      <li>
                        • El modelo del agente principal maneja la lógica
                        compleja de pedidos
                      </li>
                      <li>
                        • El modelo del agente de menú se especializa en
                        consultas sobre productos
                      </li>
                    </ul>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-4">
                <div>
                  <Label htmlFor="special-instructions">
                    Instrucciones Especiales
                  </Label>
                  <p className="mb-2 text-muted-foreground text-sm">
                    Instrucciones adicionales o comportamientos específicos que
                    quieras que tenga tu asistente.
                  </p>
                  <Textarea
                    id="special-instructions"
                    value={config.specialInstructions}
                    onChange={(e) =>
                      updateConfig("specialInstructions", e.target.value)
                    }
                    placeholder="Ej: Siempre pregunta si el cliente tiene alguna alergia alimentaria antes de confirmar el pedido..."
                    rows={4}
                  />
                  <div className="flex justify-end text-muted-foreground text-xs">
                    <span
                      className={
                        config.specialInstructions.length >
                        MAX_FIELD_LENGTH * 0.9
                          ? "text-amber-600"
                          : ""
                      }
                    >
                      {config.specialInstructions.length}/{MAX_FIELD_LENGTH}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <h4 className="mb-2 font-medium text-amber-900">
                    ⚠️ Información Importante
                  </h4>
                  <ul className="space-y-1 text-amber-800 text-sm">
                    <li>
                      • Las funcionalidades core del asistente (manejo de
                      herramientas, validaciones) están protegidas
                    </li>
                    <li>
                      • Tu personalización se combina con las reglas base del
                      sistema
                    </li>
                    <li>
                      • Los cambios se aplican inmediatamente a nuevas
                      conversaciones
                    </li>
                  </ul>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Preview Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Vista Previa del Asistente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="flex items-start space-x-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-500">
                    <BotIcon className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="rounded-lg border bg-white p-3 shadow-sm">
                      <p className="text-sm">
                        ¡Hola! Soy tu asistente virtual
                        {config.restaurantContext &&
                        selectedRestaurantType !== "other"
                          ? ` de ${restaurantTypes.find((t) => t.value === selectedRestaurantType)?.label.toLowerCase()}`
                          : ""}
                        . ¿En qué puedo ayudarte hoy?
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>{hasChanges && "⚠️ Cambios sin guardar"}</span>
                <span>El asistente usará tu configuración personalizada</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
