"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "convex/react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { ArrowLeft, ReceiptText } from "lucide-react"
import { useRouter } from "next/navigation"
import { use, useEffect } from "react"
import { usePlatformAdmin } from "@/hooks/use-platform-admin"
import { formatAiCost } from "@/lib/ai-cost"
import { ConversationCostBreakdown } from "@/modules/dashboard/ui/components/conversation-cost-breakdown"

type CostConversationStatus = "escalated" | "resolved" | "unresolved"

const conversationStatusLabel = {
  escalated: "Escalada",
  resolved: "Resuelta",
  unresolved: "Abierta",
} as const satisfies Record<CostConversationStatus, string>

const conversationStatusVariant = {
  escalated: "default",
  resolved: "secondary",
  unresolved: "outline",
} as const satisfies Record<
  CostConversationStatus,
  "default" | "outline" | "secondary"
>

type Props = {
  params: Promise<{
    conversationId: string
    organizationId: string
  }>
}

export function AdminConversationCostDetailView({ params }: Props) {
  const router = useRouter()
  const isPlatformAdmin = usePlatformAdmin()
  const { conversationId, organizationId } = use(params)

  useEffect(() => {
    if (isPlatformAdmin === false) {
      router.push(`/admin/organizations/${organizationId}`)
    }
  }, [isPlatformAdmin, organizationId, router])

  const costDetail = useQuery(
    api.superAdmin.conversationCosts.getConversationCostDetail,
    isPlatformAdmin
      ? {
          conversationId: conversationId as Id<"conversations">,
          organizationId,
        }
      : "skip"
  )

  if (isPlatformAdmin !== true || costDetail === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const displayName =
    costDetail.conversation.contact?.displayName ||
    costDetail.conversation.contact?.phoneNumber ||
    costDetail.conversation.threadId
  const status = costDetail.conversation.status as CostConversationStatus
  const snapshotCost = costDetail.conversation.cost
  const ledgerCost = costDetail.summary.totalCost
  const hasCostDrift =
    snapshotCost !== undefined && Math.abs(snapshotCost - ledgerCost) >= 0.0001

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/admin/organizations/${organizationId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-bold text-2xl tracking-tight">
            {displayName}
          </h1>
          <p className="text-muted-foreground text-sm">
            Detalle de costo AI por conversación
          </p>
        </div>
        <Badge variant={conversationStatusVariant[status]}>
          {conversationStatusLabel[status]}
        </Badge>
        {costDetail.conversation.costCoverage === "estimated" ? (
          <Badge variant="outline">Estimado</Badge>
        ) : null}
      </div>

      {costDetail.conversation.costCoverage === "estimated" ? (
        <div className="rounded-lg border border-dashed px-4 py-3">
          <p className="font-medium text-sm">Costo histórico estimado</p>
          <p className="text-muted-foreground text-sm">
            Esta conversación se backfilleó desde histórico y puede no incluir
            subthreads auxiliares antiguos que no quedaron registrados antes del
            deploy.
          </p>
        </div>
      ) : null}

      {hasCostDrift ? (
        <div className="rounded-lg border border-dashed px-4 py-3">
          <p className="font-medium text-sm">
            Hay diferencia entre snapshot y ledger
          </p>
          <p className="text-muted-foreground text-sm">
            El detalle inferior se construye desde los eventos persistidos del
            ledger AI. Si difiere del snapshot de la conversación, hace falta un
            refresh o una reconciliación explícita.
          </p>
        </div>
      ) : null}

      {costDetail.conversation.aiCostLastSyncError ? (
        <div className="rounded-lg border border-dashed px-4 py-3">
          <p className="font-medium text-sm">Último error de sincronización</p>
          <p className="text-muted-foreground text-sm">
            {costDetail.conversation.aiCostLastSyncError}
          </p>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5" />
            Resumen
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Organización</p>
            <p className="break-all font-mono text-sm">{organizationId}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Thread ID</p>
            <p className="break-all font-mono text-sm">
              {costDetail.conversation.threadId}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Creada</p>
            <p className="text-sm">
              {format(
                costDetail.conversation._creationTime,
                "d MMM yyyy, h:mm a",
                {
                  locale: es,
                }
              )}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Costo ledger</p>
            <p className="text-sm">{formatAiCost(ledgerCost)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Costo snapshot</p>
            <p className="text-sm">
              {snapshotCost !== undefined
                ? formatAiCost(snapshotCost)
                : "Sin snapshot"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Última actividad</p>
            <p className="text-sm">
              {format(
                costDetail.conversation.lastMessageAt ??
                  costDetail.conversation._creationTime,
                "d MMM yyyy, h:mm a",
                { locale: es }
              )}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Último refresh</p>
            <p className="text-sm">
              {costDetail.summary.costUpdatedAt
                ? format(
                    costDetail.summary.costUpdatedAt,
                    "d MMM yyyy, h:mm a",
                    {
                      locale: es,
                    }
                  )
                : "Sin refresco"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Mensajes con costo</p>
            <p className="text-sm">{costDetail.summary.messagesWithCost}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Threads AI</p>
            <p className="text-sm">{costDetail.summary.threadsCount}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <ConversationCostBreakdown
            costBreakdown={{
              messages: costDetail.messages,
              summary: costDetail.summary,
            }}
            isLoading={false}
          />
        </CardContent>
      </Card>
    </div>
  )
}
