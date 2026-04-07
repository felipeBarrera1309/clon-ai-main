"use client"

import { api } from "@workspace/backend/_generated/api"
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
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { DateRangePicker } from "@workspace/ui/components/date-range-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { useAction, useConvex, useQuery } from "convex/react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  Download,
  ExternalLink,
  MessageSquare,
  ReceiptText,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"
import {
  createAiCostDateRangeFromQuery,
  createAiCostSearchParams,
  createDefaultAiCostDateRange,
  downloadCsv,
  formatAiCost,
  formatAiCostCount,
  getAiCostCoverageLabel,
  getAiCostRangeParams,
  getOrganizationAiCostCalculationOutcomeLabel,
  getOrganizationAiCostCalculationPhaseLabel,
  getOrganizationAiCostCoverageStatusLabel,
  getOrganizationAiCostCoverageStatusVariant,
  getOrganizationAiCostReasonCodeLabel,
} from "@/lib/ai-cost"
import { handleConvexError } from "@/lib/error-handling"
import { AiCostMonthlyChart } from "@/modules/admin/ui/components/ai-cost-monthly-chart"

type CostConversationStatus = "escalated" | "resolved" | "unresolved"
type ConversationCostOrder = "cost_desc" | "recent_desc"

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

const orderByOptions = {
  cost_desc: "Mayor costo",
  recent_desc: "Más recientes",
} as const satisfies Record<ConversationCostOrder, string>

const AiCostStatCard = ({
  description,
  title,
  value,
}: {
  description?: string
  title: string
  value: string | number
}) => (
  <Card className="min-w-0">
    <CardHeader className="space-y-1 pb-2">
      <CardTitle className="min-h-10 text-balance font-medium text-sm leading-5">
        {title}
      </CardTitle>
      {description ? (
        <CardDescription className="line-clamp-2 text-xs">
          {description}
        </CardDescription>
      ) : null}
    </CardHeader>
    <CardContent>
      <div className="break-words font-semibold text-2xl tabular-nums tracking-tight">
        {value}
      </div>
    </CardContent>
  </Card>
)

export const OrganizationAiCostsTab = ({
  organizationId,
}: {
  organizationId: string
}) => {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    () =>
      createAiCostDateRangeFromQuery({
        from: searchParams.get("from"),
        to: searchParams.get("to"),
      }) ?? createDefaultAiCostDateRange()
  )
  const [isBackfillDialogOpen, setIsBackfillDialogOpen] = useState(false)
  const [isStartingBackfill, setIsStartingBackfill] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [offset, setOffset] = useState(0)
  const [unassignedOffset, setUnassignedOffset] = useState(0)
  const [auditOffset, setAuditOffset] = useState(0)
  const [auditOutcome, setAuditOutcome] = useState<string>("all")
  const [auditPhase, setAuditPhase] = useState<string>("all")
  const [orderBy, setOrderBy] = useState<ConversationCostOrder>("cost_desc")
  const dateRangeRef = useRef(dateRange)
  const convexClient = useConvex()
  const pageSize = 25
  const exportBatchSize = 100
  const rangeParams = getAiCostRangeParams(dateRange)

  useEffect(() => {
    dateRangeRef.current = dateRange
  }, [dateRange])

  useEffect(() => {
    const nextRange =
      createAiCostDateRangeFromQuery({
        from: searchParams.get("from"),
        to: searchParams.get("to"),
      }) ?? createDefaultAiCostDateRange()
    const currentRange = getAiCostRangeParams(dateRangeRef.current)
    const nextRangeParams = getAiCostRangeParams(nextRange)

    if (
      currentRange.from !== nextRangeParams.from ||
      currentRange.to !== nextRangeParams.to
    ) {
      setDateRange(nextRange)
    }
  }, [searchParams])

  useEffect(() => {
    const nextParams = createAiCostSearchParams({
      range: dateRange,
      searchParams,
    })
    const nextQuery = nextParams.toString()

    if (nextQuery !== searchParams.toString()) {
      router.replace(`${pathname}?${nextQuery}`, { scroll: false })
    }
  }, [dateRange, pathname, router, searchParams])

  const costOverview = useQuery(
    api.superAdmin.conversationCosts.getOrganizationCostRangeOverview,
    {
      organizationId,
      ...rangeParams,
    }
  )
  const monthlySeries = useQuery(
    api.superAdmin.conversationCosts.listOrganizationMonthlyCostSeries,
    {
      organizationId,
      ...rangeParams,
    }
  )
  const conversationCosts = useQuery(
    api.superAdmin.conversationCosts.listOrganizationConversationsByCostRange,
    {
      limit: pageSize,
      offset,
      orderBy,
      organizationId,
      ...rangeParams,
    }
  )
  const unassignedThreadCosts = useQuery(
    api.superAdmin.conversationCosts
      .listOrganizationUnassignedThreadsByCostRange,
    {
      limit: pageSize,
      offset: unassignedOffset,
      organizationId,
      ...rangeParams,
    }
  )
  const coverageStatus = useQuery(
    api.superAdmin.conversationCosts.getOrganizationAiCostCoverageStatus,
    {
      organizationId,
    }
  )
  const auditEntries = useQuery(
    api.superAdmin.conversationCosts.listOrganizationAiCostCalculationEntries,
    {
      jobId: undefined,
      limit: pageSize,
      offset: auditOffset,
      organizationId,
      outcome:
        auditOutcome === "all"
          ? undefined
          : (auditOutcome as "failed" | "ignored" | "skipped" | "updated"),
      phase:
        auditPhase === "all"
          ? undefined
          : (auditPhase as
              | "conversation_refresh"
              | "cost_sync"
              | "inventory"
              | "resolution"),
      reasonCode: undefined,
    }
  )
  const startHistoricalBackfill = useAction(
    api.superAdmin.conversationCosts.startHistoricalBackfillForOrganization
  )
  const backfillJob = coverageStatus?.backfillJob ?? null
  const coverage = coverageStatus?.coverage

  const backfillActionLabel =
    backfillJob?.status === "failed"
      ? "Reanudar backfill"
      : backfillJob?.status === "completed"
        ? "Reprocesar histórico"
        : "Iniciar backfill"

  const handleStartBackfill = async (mode: "failed_only" | "full" = "full") => {
    setIsStartingBackfill(true)
    try {
      const job = await startHistoricalBackfill({ mode, organizationId })
      toast.success(
        mode === "failed_only"
          ? "Reintento de fallidos lanzado"
          : job?.status === "running"
            ? "Backfill histórico lanzado"
            : "Backfill histórico programado"
      )
      setIsBackfillDialogOpen(false)
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsStartingBackfill(false)
    }
  }

  const handleExport = async () => {
    if (isExporting) {
      return
    }

    setIsExporting(true)
    try {
      const lines: string[][] = [
        [
          "Conversacion",
          "Contacto",
          "Telefono",
          "Estado",
          "Costo rango",
          "Costo lifetime",
          "Cobertura",
          "Ultima actividad",
        ],
      ]
      let exportOffset = 0

      while (true) {
        const page = await convexClient.query(
          api.superAdmin.conversationCosts
            .listOrganizationConversationsByCostRange,
          {
            limit: exportBatchSize,
            offset: exportOffset,
            orderBy,
            organizationId,
            ...rangeParams,
          }
        )

        if (page.truncated) {
          toast.error(
            "No se puede exportar un rango truncado. Ajusta las fechas y vuelve a intentar."
          )
          return
        }

        if (exportOffset === 0 && page.total === 0) {
          toast.error("No hay datos para exportar")
          return
        }

        lines.push(
          ...page.rows.map((row) => [
            row.conversationId,
            row.contactDisplayName ?? "",
            row.contactPhone ?? "",
            conversationStatusLabel[row.status as CostConversationStatus],
            String(row.costInRange),
            String(row.lifetimeCost),
            getAiCostCoverageLabel(row.costCoverage),
            format(row.lastMessageAt ?? row.createdAt, "d MMM yyyy, h:mm a", {
              locale: es,
            }),
          ])
        )

        if (!page.hasMore) {
          break
        }

        if (page.rows.length === 0) {
          throw new Error(
            "La exportacion no pudo continuar porque una pagina llego vacia"
          )
        }

        exportOffset += page.rows.length
      }

      downloadCsv(
        `ai-costs-${organizationId}-${rangeParams.from}-${rangeParams.to}.csv`,
        lines
      )
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsExporting(false)
    }
  }

  if (
    costOverview === undefined ||
    monthlySeries === undefined ||
    conversationCosts === undefined ||
    unassignedThreadCosts === undefined ||
    coverageStatus === undefined ||
    auditEntries === undefined
  ) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const isRangeTruncated =
    Boolean(costOverview.summary.truncated) ||
    Boolean(monthlySeries.truncated) ||
    Boolean(conversationCosts.truncated) ||
    Boolean(unassignedThreadCosts.truncated)
  const canRetryFailures =
    Boolean(coverage?.hasFailures) && backfillJob?.status !== "running"
  const coverageStatusValue = coverage?.status ?? "not_started"
  const coverageWarningCopy =
    coverageStatusValue === "running"
      ? {
          description:
            "El backfill histórico sigue en curso. Algunos datos de conversación pueden apoyarse en el cache legacy además del ledger.",
          title: "Backfill histórico en progreso",
        }
      : coverageStatusValue === "not_started"
        ? {
            description:
              "Todavía no se ha reconstruido el histórico completo del ledger para esta organización.",
            title: "Cobertura histórica sin iniciar",
          }
        : {
            description:
              "Mientras la organización no esté completa, algunos datos de conversación pueden apoyarse en el cache legacy además del ledger.",
            title: "Cobertura histórica parcial",
          }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                Estado del backfill histórico
                <Badge
                  variant={
                    backfillJob?.status === "running"
                      ? "default"
                      : backfillJob?.status === "failed"
                        ? "outline"
                        : backfillJob?.status === "completed"
                          ? "secondary"
                          : "outline"
                  }
                >
                  {backfillJob?.status === "running"
                    ? "En progreso"
                    : backfillJob?.status === "failed"
                      ? "Fallido"
                      : backfillJob?.status === "completed"
                        ? "Completado"
                        : "Sin iniciar"}
                </Badge>
              </CardTitle>
              <CardDescription>
                El ledger temporal se alimenta desde el refresh live y el
                backfill histórico. Los rangos mensuales ya se calculan por
                evento y no por creación de conversación.
              </CardDescription>
            </div>
            <Button
              variant={
                backfillJob?.status === "completed" ? "outline" : "default"
              }
              onClick={() => setIsBackfillDialogOpen(true)}
              disabled={backfillJob?.status === "running" || isStartingBackfill}
            >
              {backfillJob?.status === "running"
                ? "Backfill en progreso"
                : backfillActionLabel}
            </Button>
            {canRetryFailures ? (
              <Button
                variant="outline"
                onClick={() => {
                  handleStartBackfill("failed_only")
                }}
                disabled={isStartingBackfill}
              >
                Reintentar fallidos
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {backfillJob ? (
            <>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Inicio</p>
                <p className="text-sm">
                  {format(backfillJob.startedAt, "d MMM yyyy, h:mm a", {
                    locale: es,
                  })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Fin</p>
                <p className="text-sm">
                  {backfillJob.finishedAt
                    ? format(backfillJob.finishedAt, "d MMM yyyy, h:mm a", {
                        locale: es,
                      })
                    : "Pendiente"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Batch size</p>
                <p className="text-sm">{backfillJob.batchSize}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Procesadas</p>
                <p className="text-sm">{backfillJob.processed}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Actualizadas</p>
                <p className="text-sm">{backfillJob.updated}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">
                  Omitidas / fallidas
                </p>
                <p className="text-sm">
                  {backfillJob.skipped} / {backfillJob.failed}
                </p>
              </div>
              {backfillJob.lastError ? (
                <div className="space-y-1 md:col-span-2 xl:col-span-6">
                  <p className="text-muted-foreground text-xs">Ultimo error</p>
                  <p className="break-words text-sm">{backfillJob.lastError}</p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="md:col-span-2 xl:col-span-6">
              <p className="text-sm">
                Esta organización todavía no tiene un backfill histórico
                lanzado. Las conversaciones nuevas ya actualizan el ledger y los
                resúmenes mensuales.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <AiCostStatCard
          title="Cobertura histórica"
          value={getOrganizationAiCostCoverageStatusLabel(coverage?.status)}
          description={
            coverage?.isComplete
              ? "Todos los threads relevantes están resueltos y sincronizados"
              : "Aún hay threads pendientes o fallidos"
          }
        />
        <AiCostStatCard
          title="Threads descubiertos"
          value={coverage?.threadsDiscovered ?? 0}
        />
        <AiCostStatCard
          title="Mapeados a conversación"
          value={coverage?.threadsResolvedConversation ?? 0}
        />
        <AiCostStatCard
          title="No asignados"
          value={coverage?.threadsResolvedUnassigned ?? 0}
        />
        <AiCostStatCard
          title="Pendientes"
          value={coverage?.threadsPending ?? 0}
        />
        <AiCostStatCard title="Fallidos" value={coverage?.threadsFailed ?? 0} />
      </div>

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Rango de análisis</CardTitle>
            <CardDescription>
              Corte en zona horaria Colombia (`America/Bogota`)
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <DateRangePicker
              value={dateRange}
              onChange={(range) => {
                setOffset(0)
                setUnassignedOffset(0)
                setDateRange(range)
              }}
              clearable={true}
            />
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={isExporting}
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? "Exportando..." : "Exportar CSV"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {isRangeTruncated ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex flex-col gap-2 pt-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="font-medium text-sm">Rango parcialmente truncado</p>
              <p className="text-muted-foreground text-sm">
                El rango seleccionado supera el limite de eventos crudos para
                conversaciones o bordes de mes. Los totales principales usan
                resumenes mensuales, pero algunos conteos o rankings pueden
                quedar incompletos.
              </p>
            </div>
            <Badge variant="outline">Revisar rango</Badge>
          </CardContent>
        </Card>
      ) : null}

      {coverageStatusValue !== "complete" ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex flex-col gap-2 pt-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="font-medium text-sm">{coverageWarningCopy.title}</p>
              <p className="text-muted-foreground text-sm">
                {coverageWarningCopy.description}
              </p>
            </div>
            <Badge
              variant={getOrganizationAiCostCoverageStatusVariant(
                coverageStatusValue
              )}
            >
              {getOrganizationAiCostCoverageStatusLabel(coverageStatusValue)}
            </Badge>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <AiCostStatCard
          title="Costo rango"
          value={formatAiCost(costOverview.summary.totalCostUsd)}
        />
        <AiCostStatCard
          title="Conversaciones con consumo"
          description={
            costOverview.summary.uniqueCountsLowerBound
              ? "Minimo confirmado"
              : undefined
          }
          value={formatAiCostCount(costOverview.summary.totalConversations, {
            lowerBound: costOverview.summary.uniqueCountsLowerBound,
          })}
        />
        <AiCostStatCard
          title="Eventos"
          value={costOverview.summary.totalEvents}
        />
        <AiCostStatCard
          title="Threads sin conversación"
          description={
            costOverview.summary.uniqueCountsLowerBound
              ? "Minimo confirmado"
              : undefined
          }
          value={formatAiCostCount(
            costOverview.summary.totalUnassignedThreads,
            {
              lowerBound: costOverview.summary.uniqueCountsLowerBound,
            }
          )}
        />
        <AiCostStatCard
          title="Costo no asignado"
          value={formatAiCost(costOverview.summary.unassignedThreadCostUsd)}
        />
        <AiCostStatCard
          title="Cobertura estimada"
          value={formatAiCost(
            costOverview.summary.totalEstimatedCoverageCostUsd
          )}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Serie mensual</CardTitle>
          <CardDescription>
            Consumo modelado por mes usando `eventAt` del ledger
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AiCostMonthlyChart series={monthlySeries.series} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Auditoría de cálculo</CardTitle>
            <CardDescription>
              Historial por entidad y job del inventario, resolución y sync de
              costos
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <Select
              value={auditPhase}
              onValueChange={(value) => {
                setAuditOffset(0)
                setAuditPhase(value)
              }}
            >
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Fase" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las fases</SelectItem>
                <SelectItem value="inventory">Inventario</SelectItem>
                <SelectItem value="resolution">Resolución</SelectItem>
                <SelectItem value="cost_sync">Sync costo</SelectItem>
                <SelectItem value="conversation_refresh">
                  Refresh conversación
                </SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={auditOutcome}
              onValueChange={(value) => {
                setAuditOffset(0)
                setAuditOutcome(value)
              }}
            >
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Resultado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="updated">Actualizado</SelectItem>
                <SelectItem value="skipped">Omitido</SelectItem>
                <SelectItem value="failed">Fallido</SelectItem>
                <SelectItem value="ignored">Ignorado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {auditEntries.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay entradas de auditoría para los filtros seleccionados.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Entidad</TableHead>
                      <TableHead>Fase</TableHead>
                      <TableHead>Resultado</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditEntries.rows.map((entry) => (
                      <TableRow key={entry._id}>
                        <TableCell className="text-sm">
                          {format(entry.createdAt, "d MMM yyyy, h:mm a", {
                            locale: es,
                          })}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {entry.entityType === "conversation"
                                ? "Conversación"
                                : "Thread"}
                            </span>
                            <span className="font-mono text-muted-foreground text-xs">
                              {entry.entityId}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {getOrganizationAiCostCalculationPhaseLabel(
                            entry.phase
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              entry.outcome === "updated"
                                ? "secondary"
                                : entry.outcome === "failed"
                                  ? "destructive"
                                  : "outline"
                            }
                          >
                            {getOrganizationAiCostCalculationOutcomeLabel(
                              entry.outcome
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col gap-1">
                            <span>
                              {getOrganizationAiCostReasonCodeLabel(
                                entry.reasonCode
                              )}
                            </span>
                            {entry.reason ? (
                              <span className="text-muted-foreground text-xs">
                                {entry.reason}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  Mostrando {auditEntries.rows.length} de {auditEntries.total}{" "}
                  entradas
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setAuditOffset((current) =>
                        Math.max(0, current - pageSize)
                      )
                    }
                    disabled={auditOffset === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setAuditOffset((current) => current + pageSize)
                    }
                    disabled={!auditEntries.hasMore}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5" />
              Conversaciones del rango
            </CardTitle>
            <CardDescription>
              `costInRange` usa el ledger temporal. `Lifetime` conserva el cache
              total de la conversación.
            </CardDescription>
          </div>
          <div className="w-full md:w-[220px]">
            <Select
              value={orderBy}
              onValueChange={(value) => {
                setOffset(0)
                setOrderBy(value as ConversationCostOrder)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cost_desc">
                  {orderByOptions.cost_desc}
                </SelectItem>
                <SelectItem value="recent_desc">
                  {orderByOptions.recent_desc}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {conversationCosts.rows.length === 0 ? (
            <div className="py-10 text-center">
              <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-muted-foreground text-sm">
                No hay consumo AI registrado para este rango de fechas.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Última actividad</TableHead>
                      <TableHead className="text-right">Rango</TableHead>
                      <TableHead className="text-right">Lifetime</TableHead>
                      <TableHead className="w-[110px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversationCosts.rows.map((conversation) => {
                      const status =
                        conversation.status as CostConversationStatus

                      return (
                        <TableRow key={conversation.conversationId}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {conversation.contactDisplayName ||
                                  conversation.contactPhone ||
                                  "Sin nombre"}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {conversation.contactPhone ||
                                  conversation.threadId}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={conversationStatusVariant[status]}>
                              {conversationStatusLabel[status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(
                              conversation.lastMessageAt ??
                                conversation.createdAt,
                              "d MMM yyyy, h:mm a",
                              { locale: es }
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            <div className="flex flex-col items-end gap-1">
                              <span>
                                {formatAiCost(conversation.costInRange)}
                              </span>
                              {conversation.costCoverage === "estimated" ? (
                                <Badge variant="outline">Estimado</Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatAiCost(conversation.lifetimeCost)}
                          </TableCell>
                          <TableCell>
                            <Button asChild size="sm" variant="outline">
                              <Link
                                href={`/admin/organizations/${organizationId}/conversations/${conversation.conversationId}`}
                              >
                                Ver
                                <ExternalLink className="ml-2 h-4 w-4" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  Mostrando {conversationCosts.rows.length} de{" "}
                  {conversationCosts.total} conversaciones
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setOffset((current) => Math.max(0, current - pageSize))
                    }
                    disabled={offset === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setOffset((current) => current + pageSize)}
                    disabled={!conversationCosts.hasMore}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5" />
            Threads sin conversación
          </CardTitle>
          <CardDescription>
            Este bucket entra al total de la organización, pero no al ranking de
            conversaciones del rango.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unassignedThreadCosts.rows.length === 0 ? (
            <div className="py-10 text-center">
              <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-muted-foreground text-sm">
                No hay threads sin conversación con consumo AI en este rango.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thread ID</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Último evento</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unassignedThreadCosts.rows.map((thread) => (
                      <TableRow key={thread.threadId}>
                        <TableCell className="font-mono text-xs">
                          {thread.threadId}
                        </TableCell>
                        <TableCell className="text-sm">
                          {thread.purpose}
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(thread.lastEventAt, "d MMM yyyy, h:mm a", {
                            locale: es,
                          })}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <div className="flex flex-col items-end gap-1">
                            <span>{formatAiCost(thread.costInRange)}</span>
                            {thread.costCoverage === "estimated" ? (
                              <Badge variant="outline">Estimado</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  Mostrando {unassignedThreadCosts.rows.length} de{" "}
                  {unassignedThreadCosts.total} threads
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setUnassignedOffset((current) =>
                        Math.max(0, current - pageSize)
                      )
                    }
                    disabled={unassignedOffset === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setUnassignedOffset((current) => current + pageSize)
                    }
                    disabled={!unassignedThreadCosts.hasMore}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={isBackfillDialogOpen}
        onOpenChange={setIsBackfillDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {backfillActionLabel} para esta organización
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se procesarán las conversaciones históricas por batches en
              background para poblar el ledger y recalcular los resúmenes
              mensuales usados por este reporte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isStartingBackfill}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async (event) => {
                event.preventDefault()
                await handleStartBackfill("full")
              }}
              disabled={isStartingBackfill}
            >
              {isStartingBackfill ? "Lanzando..." : backfillActionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
