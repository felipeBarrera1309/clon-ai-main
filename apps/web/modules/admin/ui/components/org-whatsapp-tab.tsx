"use client"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"
import { MessageSquare, Settings } from "lucide-react"
import Link from "next/link"

interface WhatsAppConfig {
  phoneNumber: string
  isActive: boolean
  displayName?: string | null
  appId?: string | null // Gupshup App ID
}

interface WhatsAppTabProps {
  organizationId: string
  whatsappConfig?: WhatsAppConfig | null
}

export function WhatsAppTab({
  organizationId,
  whatsappConfig,
}: WhatsAppTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración WhatsApp</CardTitle>
        <CardDescription>Integración con WhatsApp Business API</CardDescription>
      </CardHeader>
      <CardContent>
        {whatsappConfig ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Número de Teléfono:
                  </span>
                  <span className="font-mono">
                    {whatsappConfig.phoneNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estado:</span>
                  <Badge
                    variant={whatsappConfig.isActive ? "default" : "secondary"}
                  >
                    {whatsappConfig.isActive ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
              </div>
              {whatsappConfig.displayName && (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Nombre para mostrar:
                    </span>
                    <span>{whatsappConfig.displayName}</span>
                  </div>
                </div>
              )}
              {whatsappConfig.appId && (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">App ID:</span>
                    <span className="font-mono">{whatsappConfig.appId}</span>
                  </div>
                </div>
              )}
            </div>
            <Separator />
            <Link href={`/admin/organizations/${organizationId}/whatsapp`}>
              <Button>
                <Settings className="mr-2 h-4 w-4" />
                Editar Configuración
              </Button>
            </Link>
          </div>
        ) : (
          <div className="py-8 text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 mb-4 text-muted-foreground">
              No hay configuración de WhatsApp
            </p>
            <Link href={`/admin/organizations/${organizationId}/whatsapp`}>
              <Button>Crear Configuración</Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
