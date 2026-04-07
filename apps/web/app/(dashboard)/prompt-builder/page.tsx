"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import {
  buildCapabilitiesSection,
  buildConstraintsSection,
  CORE_PROMPT_SECTIONS,
} from "@workspace/backend/system/ai/constants"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
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
  BotIcon,
  CheckCircleIcon,
  CopyIcon,
  EyeIcon,
  RotateCcwIcon,
  SaveIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useOrganization } from "@/hooks/use-organization"
import { usePlatformAdmin } from "@/hooks/use-platform-admin"

export default function PromptBuilderPage() {
  const [selectedContactId, setSelectedContactId] = useState<string>("none")
  const [corePromptOverrides, setCorePromptOverrides] = useState({
    identity: "",
    tools: "",
    conversation: "",
    operations: "",
  })
  const [hasChanges, setHasChanges] = useState(false)
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle")

  // Check platform admin membership for edit permissions
  const isPlatformAdmin = usePlatformAdmin()
  const { activeOrganizationId } = useOrganization()

  // Determine if user can edit (platform admin) or is read-only (normal admin)
  const canEdit = isPlatformAdmin === true
  const isReadOnly = isPlatformAdmin === false

  // Queries
  const contacts = useQuery(
    api.private.contacts.listForPromptBuilder,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  const promptData = useQuery(
    api.private.promptBuilder.getPromptParts,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          contactId:
            selectedContactId === "none"
              ? undefined
              : (selectedContactId as Id<"contacts">),
        }
      : "skip"
  )

  // Mutations
  const updateCoreSection = useMutation(
    api.private.promptBuilder.updateCorePromptSection
  )
  const resetCoreSection = useMutation(
    api.private.promptBuilder.resetCorePromptSection
  )

  // Initialize core prompt overrides when data loads
  useEffect(() => {
    if (promptData?.agentConfig?.specialInstructions) {
      const overrides = parseSpecialInstructions(
        promptData.agentConfig.specialInstructions
      )
      setCorePromptOverrides(overrides)
    }
  }, [promptData])

  const handleUpdateCoreSection = async (
    section: keyof typeof corePromptOverrides,
    content: string
  ) => {
    // Prevent updates in read-only mode
    if (isReadOnly) return

    const sectionMap = {
      identity: "identity",
      tools: "tools",
      conversation: "conversation",
      operations: "operations",
    }

    setSaveStatus("saving")
    try {
      if (!activeOrganizationId) return
      await updateCoreSection({
        organizationId: activeOrganizationId,
        section: sectionMap[section],
        content,
      })
      setCorePromptOverrides((prev) => ({ ...prev, [section]: content }))
      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch (error) {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    }
  }

  const handleResetCoreSection = async (
    section: keyof typeof corePromptOverrides
  ) => {
    // Prevent resets in read-only mode
    if (isReadOnly) return

    const sectionMap = {
      identity: "identity",
      tools: "tools",
      conversation: "conversation",
      operations: "operations",
    }

    setSaveStatus("saving")
    try {
      if (!activeOrganizationId) return
      await resetCoreSection({
        organizationId: activeOrganizationId,
        section: sectionMap[section],
      })
      // Set the local state to the dynamic default values based on restaurant config
      const defaultValues = {
        identity: CORE_PROMPT_SECTIONS.IDENTITY,
        tools: buildCapabilitiesSection(
          promptData?.configFlags?.enableDelivery ?? true,
          promptData?.configFlags?.enableInvoice ?? true
        ),
        conversation: "",
        operations: buildConstraintsSection(
          promptData?.configFlags?.enableDelivery ?? true
        ),
      }
      setCorePromptOverrides((prev) => ({
        ...prev,
        [section]: defaultValues[section],
      }))
      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch (error) {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (contacts === undefined || promptData === undefined) {
    return null
  }

  return (
    <>
      {/* Read-only alert for normal admins */}
      {isReadOnly && (
        <Alert className="border-blue-200 bg-blue-50">
          <EyeIcon className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Modo de solo lectura:</strong> Solo puedes ver la
            configuración de prompts. Para modificar estas opciones, contacta al
            equipo de soporte técnico.
          </AlertDescription>
        </Alert>
      )}

      {/* Status alerts */}
      {saveStatus === "success" && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircleIcon className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Cambios guardados exitosamente
          </AlertDescription>
        </Alert>
      )}

      {saveStatus === "error" && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircleIcon className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            Error al guardar los cambios. Inténtalo de nuevo.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        {/* Contact Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="h-5 w-5" />
              Seleccionar Contacto para Personalización
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="contact-select">Contacto</Label>
                <p className="mb-2 text-muted-foreground text-sm">
                  Selecciona un contacto para ver cómo se personaliza el prompt
                  con su historial de pedidos
                </p>
                <Select
                  value={selectedContactId}
                  onValueChange={setSelectedContactId}
                  disabled={isReadOnly}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un contacto..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      Sin contacto (prompt genérico)
                    </SelectItem>
                    {contacts?.map((contact) => (
                      <SelectItem key={contact._id} value={contact._id}>
                        {contact.displayName} ({contact.phoneNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {promptData?.contact && (
                <div className="rounded-lg bg-gray-50 p-4">
                  <h4 className="mb-2 font-medium">
                    Información del Contacto Seleccionado
                  </h4>
                  <div className="space-y-2 text-sm">
                    <p>
                      <strong>Nombre:</strong> {promptData.contact.displayName}
                    </p>
                    <p>
                      <strong>Teléfono:</strong>{" "}
                      {promptData.contact.phoneNumber}
                    </p>
                    {promptData.contact.lastKnownAddress && (
                      <p>
                        <strong>Última dirección:</strong>{" "}
                        {promptData.contact.lastKnownAddress}
                      </p>
                    )}
                    <p>
                      <strong>Total de pedidos:</strong>{" "}
                      {promptData.contactCount}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Prompt Parts Display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              Partes del Prompt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="core-sections" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="core-sections">Secciones Core</TabsTrigger>
                <TabsTrigger value="custom-sections">
                  Secciones Personalizadas
                </TabsTrigger>
                <TabsTrigger value="complete-prompt">
                  Prompt Completo
                </TabsTrigger>
              </TabsList>

              <TabsContent value="core-sections" className="space-y-6">
                <div className="space-y-6">
                  {/* Identity Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg">
                        Identidad y Propósito
                      </h3>
                      <div className="flex gap-2">
                        {promptData?.agentConfig?.coreIdentityOverride && (
                          <Badge variant="secondary">Personalizado</Badge>
                        )}
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResetCoreSection("identity")}
                            disabled={saveStatus === "saving"}
                          >
                            <RotateCcwIcon className="mr-1 h-4 w-4" />
                            Resetear
                          </Button>
                        )}
                      </div>
                    </div>
                    <Textarea
                      value={
                        corePromptOverrides.identity ||
                        promptData?.agentConfig?.coreIdentityOverride ||
                        CORE_PROMPT_SECTIONS.IDENTITY
                      }
                      onChange={(e) => {
                        if (isReadOnly) return
                        const value = e.target.value
                        setCorePromptOverrides((prev) => ({
                          ...prev,
                          identity: value,
                        }))
                        setHasChanges(true)
                      }}
                      rows={8}
                      className="max-h-[85dvh] font-mono text-sm"
                      disabled={isReadOnly}
                    />
                    {canEdit && (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleUpdateCoreSection(
                            "identity",
                            corePromptOverrides.identity
                          )
                        }
                        disabled={!hasChanges || saveStatus === "saving"}
                      >
                        <SaveIcon className="mr-1 h-4 w-4" />
                        Guardar Cambios
                      </Button>
                    )}
                  </div>

                  {/* Tools Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg">
                        Herramientas Disponibles
                      </h3>
                      <div className="flex gap-2">
                        {promptData?.agentConfig?.coreToolsOverride && (
                          <Badge variant="secondary">Personalizado</Badge>
                        )}
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResetCoreSection("tools")}
                            disabled={saveStatus === "saving"}
                          >
                            <RotateCcwIcon className="mr-1 h-4 w-4" />
                            Resetear
                          </Button>
                        )}
                      </div>
                    </div>
                    <Textarea
                      value={
                        corePromptOverrides.tools ||
                        promptData?.agentConfig?.coreToolsOverride ||
                        buildCapabilitiesSection(
                          promptData?.configFlags?.enableDelivery ?? true,
                          promptData?.configFlags?.enableInvoice ?? true
                        )
                      }
                      onChange={(e) => {
                        if (isReadOnly) return
                        const value = e.target.value
                        setCorePromptOverrides((prev) => ({
                          ...prev,
                          tools: value,
                        }))
                        setHasChanges(true)
                      }}
                      rows={12}
                      className="max-h-[85dvh] font-mono text-sm"
                      disabled={isReadOnly}
                    />
                    {canEdit && (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleUpdateCoreSection(
                            "tools",
                            corePromptOverrides.tools
                          )
                        }
                        disabled={!hasChanges || saveStatus === "saving"}
                      >
                        <SaveIcon className="mr-1 h-4 w-4" />
                        Guardar Cambios
                      </Button>
                    )}
                  </div>

                  {/* Conversation Protocol */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg">
                        Protocolo de Conversación
                      </h3>
                      <div className="flex gap-2">
                        {promptData?.agentConfig?.coreConversationOverride && (
                          <Badge variant="secondary">Personalizado</Badge>
                        )}
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleResetCoreSection("conversation")
                            }
                            disabled={saveStatus === "saving"}
                          >
                            <RotateCcwIcon className="mr-1 h-4 w-4" />
                            Resetear
                          </Button>
                        )}
                      </div>
                    </div>
                    <Textarea
                      value={
                        corePromptOverrides.conversation ??
                        promptData?.agentConfig?.coreConversationOverride ??
                        ""
                      }
                      onChange={(e) => {
                        if (isReadOnly) return
                        const value = e.target.value
                        setCorePromptOverrides((prev) => ({
                          ...prev,
                          conversation: value,
                        }))
                        setHasChanges(true)
                      }}
                      rows={20}
                      className="max-h-[85dvh] font-mono text-sm"
                      disabled={isReadOnly}
                    />
                    {canEdit && (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleUpdateCoreSection(
                            "conversation",
                            corePromptOverrides.conversation
                          )
                        }
                        disabled={!hasChanges || saveStatus === "saving"}
                      >
                        <SaveIcon className="mr-1 h-4 w-4" />
                        Guardar Cambios
                      </Button>
                    )}
                  </div>

                  {/* Operational Rules */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg">
                        Reglas Operativas
                      </h3>
                      <div className="flex gap-2">
                        {promptData?.agentConfig?.coreOperationsOverride && (
                          <Badge variant="secondary">Personalizado</Badge>
                        )}
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResetCoreSection("operations")}
                            disabled={saveStatus === "saving"}
                          >
                            <RotateCcwIcon className="mr-1 h-4 w-4" />
                            Resetear
                          </Button>
                        )}
                      </div>
                    </div>
                    <Textarea
                      value={
                        corePromptOverrides.operations ||
                        promptData?.agentConfig?.coreOperationsOverride ||
                        buildConstraintsSection(
                          promptData?.configFlags?.enableDelivery ?? true
                        )
                      }
                      onChange={(e) => {
                        if (isReadOnly) return
                        const value = e.target.value
                        setCorePromptOverrides((prev) => ({
                          ...prev,
                          operations: value,
                        }))
                        setHasChanges(true)
                      }}
                      rows={12}
                      className="max-h-[85dvh] font-mono text-sm"
                      disabled={isReadOnly}
                    />
                    {canEdit && (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleUpdateCoreSection(
                            "operations",
                            corePromptOverrides.operations
                          )
                        }
                        disabled={!hasChanges || saveStatus === "saving"}
                      >
                        <SaveIcon className="mr-1 h-4 w-4" />
                        Guardar Cambios
                      </Button>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="custom-sections" className="space-y-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-4 font-semibold text-lg">
                      Secciones Personalizadas
                    </h3>
                    <p className="mb-4 text-muted-foreground text-sm">
                      Estas secciones se configuran desde la página de
                      personalización del agente
                    </p>
                  </div>

                  {/* Brand Voice */}
                  <div className="space-y-2">
                    <Label>Personalidad y Estilo</Label>
                    <div className="rounded-lg bg-gray-50 p-4">
                      <pre className="whitespace-pre-wrap font-mono text-sm">
                        {promptData?.agentConfig?.brandVoice ||
                          "No configurado"}
                      </pre>
                    </div>
                  </div>

                  {/* Restaurant Context */}
                  <div className="space-y-2">
                    <Label>Contexto del Restaurante</Label>
                    <div className="rounded-lg bg-gray-50 p-4">
                      <pre className="whitespace-pre-wrap font-mono text-sm">
                        {promptData?.agentConfig?.restaurantContext ||
                          "No configurado"}
                      </pre>
                    </div>
                  </div>

                  {/* Business Rules */}
                  <div className="space-y-2">
                    <Label>Reglas del Negocio</Label>
                    <div className="rounded-lg bg-gray-50 p-4">
                      <pre className="whitespace-pre-wrap font-mono text-sm">
                        {promptData?.agentConfig?.businessRules ||
                          "No configurado"}
                      </pre>
                    </div>
                  </div>

                  {/* Custom Greeting */}
                  <div className="space-y-2">
                    <Label>Saludo Personalizado</Label>
                    <div className="rounded-lg bg-gray-50 p-4">
                      <pre className="whitespace-pre-wrap font-mono text-sm">
                        {promptData?.agentConfig?.customGreeting ||
                          "No configurado"}
                      </pre>
                    </div>
                  </div>

                  {/* Special Instructions */}
                  <div className="space-y-2">
                    <Label>Instrucciones Especiales</Label>
                    <div className="rounded-lg bg-gray-50 p-4">
                      <pre className="whitespace-pre-wrap font-mono text-sm">
                        {promptData?.agentConfig?.specialInstructions ||
                          "No configurado"}
                      </pre>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="complete-prompt" className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">
                      Prompt Completo del Agente
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        copyToClipboard(promptData?.completePrompt || "")
                      }
                    >
                      <CopyIcon className="mr-1 h-4 w-4" />
                      Copiar
                    </Button>
                  </div>

                  <div className="max-h-[85dvh] overflow-y-auto rounded-lg border bg-gray-50 p-6">
                    {promptData?.completePrompt ? (
                      <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                        {promptData.completePrompt}
                      </pre>
                    ) : (
                      <div className="text-center text-muted-foreground">
                        <BotIcon className="mx-auto mb-4 h-12 w-12 opacity-50" />
                        <p>
                          Selecciona un contacto para ver el prompt completo
                          personalizado
                        </p>
                      </div>
                    )}
                  </div>

                  {promptData?.contact && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Badge variant="secondary">
                        Personalizado para: {promptData.contact.displayName}
                      </Badge>
                      <span>•</span>
                      <span>
                        {promptData.contactCount} pedidos anteriores incluidos
                      </span>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

// Helper function to parse special instructions
function parseSpecialInstructions(specialInstructions: string) {
  const sections: Record<string, string> = {}
  const lines = specialInstructions.split("\n")

  let currentSection = ""
  let currentContent = ""

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentSection && currentContent.trim()) {
        sections[currentSection] = currentContent.trim()
      }
      currentSection = line.substring(3).toLowerCase().replace(/\s+/g, "_")
      currentContent = ""
    } else {
      currentContent += `${line}\n`
    }
  }

  if (currentSection && currentContent.trim()) {
    sections[currentSection] = currentContent.trim()
  }

  return {
    identity: sections.identity_and_purpose || "",
    tools: sections.herramientas_disponibles || "",
    conversation: sections.protocolo_de_conversación || "",
    operations: sections.reglas_operativas || "",
  }
}
