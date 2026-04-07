"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
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
import { useQuery } from "convex/react"
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  FileTextIcon,
  MailIcon,
  PhoneIcon,
  SettingsIcon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useOrganization } from "@/hooks/use-organization"
import { MessageCampaignsView } from "./message-campaigns-view"
import { MessageTemplatesView } from "./message-templates-view"

export const BulkMessagingView = () => {
  const [selectedConfigId, setSelectedConfigId] =
    useState<Id<"whatsappConfigurations"> | null>(null)
  const { activeOrganizationId } = useOrganization()
  const whatsappConfigs = useQuery(
    api.private.whatsappConfigurations.getConfigurations,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )

  // Find selected or active configuration
  const selectedConfig = selectedConfigId
    ? whatsappConfigs?.find((c) => c._id === selectedConfigId)
    : whatsappConfigs?.find((c) => c.isActive)

  // Auto-select if only one config or if there's an active one
  const effectiveConfigId = selectedConfig?._id ?? null

  // Check configuration status
  const hasConfigs = (whatsappConfigs?.length ?? 0) > 0
  const provider = selectedConfig?.provider || "meta"
  const isTwilio = provider === "twilio"
  const isMeta = provider === "meta"
  const is360Dialog = provider === "360dialog"

  // Validation logic
  const hasWabaId = !!selectedConfig?.wabaId
  const hasTwilioCreds =
    !!selectedConfig?.twilioAccountSid && !!selectedConfig?.twilioAuthToken
  const has360Creds = !!selectedConfig?.dialog360ApiKey

  const isValidConfig =
    (isMeta && hasWabaId) ||
    (isTwilio && hasTwilioCreds) ||
    (is360Dialog && has360Creds)

  const configsWithWaba = whatsappConfigs?.filter((c) => c.wabaId) ?? []

  // Virtual WABA for Twilio to satisfy child components for now
  // In the backend we use "twilio-" prefix logic
  const effectiveWabaId =
    selectedConfig?.wabaId ||
    (isTwilio && selectedConfig?.twilioAccountSid
      ? `twilio-${selectedConfig.twilioAccountSid}`
      : "") ||
    ""

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl tracking-tight">Mensajería Masiva</h1>
        <p className="text-muted-foreground">
          Envía mensajes promocionales y avisos a múltiples clientes
        </p>
      </div>

      {/* No WhatsApp configuration */}
      {whatsappConfigs && !hasConfigs && (
        <Alert variant="destructive">
          <AlertTriangleIcon className="h-4 w-4" />
          <AlertTitle>Configuración de WhatsApp requerida</AlertTitle>
          <AlertDescription className="mt-2">
            <p>
              Para usar la mensajería masiva, primero debes configurar tu cuenta
              de WhatsApp Business API.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/whatsapp">
                <SettingsIcon className="mr-2 h-4 w-4" />
                Configurar WhatsApp
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Has configs - show selector */}
      {hasConfigs && (
        <>
          {/* Account Selector Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <PhoneIcon className="h-5 w-5" />
                Cuenta de WhatsApp
              </CardTitle>
              <CardDescription>
                Selecciona desde qué número enviar los mensajes masivos. Las
                plantillas se sincronizan desde la cuenta de negocio asociada.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Select
                    value={effectiveConfigId ?? ""}
                    onValueChange={(value) =>
                      setSelectedConfigId(value as Id<"whatsappConfigurations">)
                    }
                  >
                    <SelectTrigger className="w-full sm:w-80">
                      <SelectValue placeholder="Selecciona una cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      {whatsappConfigs?.map((config) => (
                        <SelectItem key={config._id} value={config._id}>
                          <div className="flex items-center gap-2">
                            <span>{config.phoneNumber}</span>
                            {config.displayName && (
                              <span className="text-muted-foreground">
                                ({config.displayName})
                              </span>
                            )}
                            <Badge
                              variant="outline"
                              className="ml-1 text-[10px]"
                            >
                              {config.provider === "twilio"
                                ? "Twilio"
                                : config.provider === "360dialog"
                                  ? "360Dialog"
                                  : "Meta"}
                            </Badge>
                            {!config.wabaId && config.provider === "meta" && (
                              <span className="text-destructive text-xs">
                                (Sin WABA)
                              </span>
                            )}
                            {config.isActive && (
                              <CheckCircleIcon className="h-3 w-3 text-green-600" />
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedConfig && (
                  <div className="flex items-center gap-4 text-sm">
                    {isValidConfig ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircleIcon className="h-4 w-4" />
                        <span>
                          {isTwilio
                            ? "Twilio Configurado"
                            : is360Dialog
                              ? "360Dialog Configurado"
                              : "WABA configurado"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-destructive">
                        <AlertTriangleIcon className="h-4 w-4" />
                        <span>
                          {isTwilio
                            ? "Credenciales incompletas"
                            : is360Dialog
                              ? "API Key faltante"
                              : "WABA no configurado"}
                        </span>
                      </div>
                    )}
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/whatsapp">
                        <SettingsIcon className="mr-1 h-3 w-3" />
                        Configurar
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Warning: Selected Meta config has no WABA ID */}
          {selectedConfig && isMeta && !hasWabaId && (
            <Alert variant="destructive">
              <AlertTriangleIcon className="h-4 w-4" />
              <AlertTitle>WABA ID no configurado</AlertTitle>
              <AlertDescription className="mt-2">
                <p>
                  La cuenta seleccionada ({selectedConfig.phoneNumber}) no tiene
                  configurado el WhatsApp Business Account ID (WABA ID).
                </p>
                <p className="mt-2 text-sm">
                  El WABA ID es necesario para sincronizar plantillas con Meta y
                  enviar mensajes masivos. Puedes encontrarlo en:{" "}
                  <strong>
                    Meta Business Suite → Configuración → WhatsApp →
                    Configuración de la cuenta
                  </strong>
                </p>
                {configsWithWaba.length > 0 && (
                  <p className="mt-2 text-sm">
                    Tienes {configsWithWaba.length} cuenta(s) con WABA
                    configurado. Selecciona una de ellas o configura el WABA ID
                    para esta cuenta.
                  </p>
                )}
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/whatsapp">
                    <SettingsIcon className="mr-2 h-4 w-4" />
                    Configurar WABA ID
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Show tabs if config is valid */}
          {isValidConfig && (
            <Tabs defaultValue="campaigns" className="space-y-4">
              <TabsList>
                <TabsTrigger value="campaigns" className="gap-2">
                  <MailIcon className="h-4 w-4" />
                  Campañas
                </TabsTrigger>
                <TabsTrigger value="templates" className="gap-2">
                  <FileTextIcon className="h-4 w-4" />
                  Plantillas
                </TabsTrigger>
              </TabsList>
              <TabsContent value="campaigns">
                <MessageCampaignsView
                  whatsappConfigId={selectedConfig._id}
                  wabaId={effectiveWabaId}
                  provider={provider}
                />
              </TabsContent>
              <TabsContent value="templates">
                <MessageTemplatesView
                  whatsappConfigId={selectedConfig._id}
                  wabaId={effectiveWabaId}
                  provider={provider}
                />
              </TabsContent>
            </Tabs>
          )}

          {/* No config selected */}
          {!selectedConfig && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <PhoneIcon className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="font-semibold text-lg">
                  Selecciona una cuenta de WhatsApp
                </h3>
                <p className="mt-1 text-muted-foreground text-sm">
                  Elige desde qué número quieres gestionar las campañas y
                  plantillas
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
