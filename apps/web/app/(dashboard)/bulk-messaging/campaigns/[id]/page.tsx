"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { useQuery } from "convex/react"
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  PhoneIcon,
  SendIcon,
  UserIcon,
  XCircleIcon,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { useOrganization } from "@/hooks/use-organization"

const RECIPIENT_STATUS_CONFIG = {
  pending: {
    label: "Pendiente",
    variant: "secondary" as const,
    icon: ClockIcon,
  },
  sent: {
    label: "Enviado",
    variant: "default" as const,
    icon: SendIcon,
  },
  delivered: {
    label: "Entregado",
    variant: "default" as const,
    icon: CheckCircleIcon,
  },
  read: {
    label: "Leído",
    variant: "default" as const,
    icon: CheckCircleIcon,
  },
  failed: {
    label: "Fallido",
    variant: "destructive" as const,
    icon: XCircleIcon,
  },
}

const CAMPAIGN_STATUS_CONFIG = {
  draft: { label: "Borrador", variant: "secondary" as const },
  scheduled: { label: "Programada", variant: "outline" as const },
  sending: { label: "Enviando", variant: "default" as const },
  completed: { label: "Completada", variant: "default" as const },
  cancelled: { label: "Cancelada", variant: "destructive" as const },
}

export default function CampaignDetailPage() {
  const params = useParams()
  const campaignId = params.id as Id<"messageCampaigns">
  const { activeOrganizationId } = useOrganization()

  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "sent" | "delivered" | "read" | "failed"
  >("all")

  const campaign = useQuery(
    api.private.messageCampaigns.getOne,
    activeOrganizationId
      ? { organizationId: activeOrganizationId, campaignId }
      : "skip"
  )

  const recipients = useQuery(
    api.private.messageCampaigns.getRecipients,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          campaignId,
          status: statusFilter === "all" ? undefined : statusFilter,
          limit: 100,
        }
      : "skip"
  )

  if (!campaign) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-muted-foreground">Cargando campaña...</div>
      </div>
    )
  }

  const statusConfig = CAMPAIGN_STATUS_CONFIG[campaign.status]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/bulk-messaging">
          <Button variant="ghost" size="icon">
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-2xl">{campaign.name}</h1>
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Plantilla: {campaign.template?.name || "Plantilla eliminada"}
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-sm">
              Total Destinatarios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{campaign.totalRecipients}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-sm">Enviados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-blue-600">
              {campaign.sentCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-sm">Entregados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-green-600">
              {campaign.deliveredCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-sm">Fallidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-destructive">
              {campaign.failedCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-sm">Tasa Entrega</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {campaign.sentCount > 0
                ? Math.round(
                    (campaign.deliveredCount / campaign.sentCount) * 100
                  )
                : 0}
              %
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recipients Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Destinatarios</CardTitle>
              <CardDescription>
                Lista de contactos y estado de envío
              </CardDescription>
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(
                  value as
                    | "all"
                    | "pending"
                    | "sent"
                    | "delivered"
                    | "read"
                    | "failed"
                )
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="sent">Enviados</SelectItem>
                <SelectItem value="delivered">Entregados</SelectItem>
                <SelectItem value="read">Leídos</SelectItem>
                <SelectItem value="failed">Fallidos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {recipients?.recipients && recipients.recipients.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Enviado</TableHead>
                  <TableHead>Entregado</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.recipients.map((recipient) => {
                  const recipientStatusConfig =
                    RECIPIENT_STATUS_CONFIG[recipient.status]
                  const StatusIcon = recipientStatusConfig.icon

                  return (
                    <TableRow key={recipient._id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {recipient.contactName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <PhoneIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-sm">
                            {recipient.contactPhone}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={recipientStatusConfig.variant}
                          className="gap-1"
                        >
                          <StatusIcon className="h-3 w-3" />
                          {recipientStatusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {recipient.sentAt ? (
                          <span className="text-muted-foreground text-sm">
                            {new Date(recipient.sentAt).toLocaleString(
                              "es-CO",
                              {
                                dateStyle: "short",
                                timeStyle: "short",
                              }
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {recipient.deliveredAt ? (
                          <span className="text-muted-foreground text-sm">
                            {new Date(recipient.deliveredAt).toLocaleString(
                              "es-CO",
                              {
                                dateStyle: "short",
                                timeStyle: "short",
                              }
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {recipient.errorMessage ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex cursor-help items-center gap-1 text-destructive">
                                  <AlertCircleIcon className="h-4 w-4" />
                                  <span className="max-w-[200px] truncate text-sm">
                                    {recipient.errorMessage}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-sm">
                                <p className="text-sm">
                                  {recipient.errorMessage}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              {recipients === undefined
                ? "Cargando destinatarios..."
                : "No hay destinatarios con este filtro"}
            </div>
          )}
          {recipients?.hasMore && (
            <div className="mt-4 text-center text-muted-foreground text-sm">
              Mostrando los primeros 100 destinatarios
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
