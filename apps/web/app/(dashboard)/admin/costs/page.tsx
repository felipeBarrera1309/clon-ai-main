"use client"

import { api } from "@workspace/backend/_generated/api"
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
import { Input } from "@workspace/ui/components/input"
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
import { Textarea } from "@workspace/ui/components/textarea"
import { useAction, useMutation, useQuery } from "convex/react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"
import { usePlatformAdmin } from "@/hooks/use-platform-admin"
import {
  createAiCostDateRangeFromQuery,
  createAiCostSearchParams,
  createDefaultAiCostDateRange,
  formatAiCost,
  formatAiCostCount,
  formatAiCostPeriodMonth,
  getAiCostRangeParams,
  getDefaultAiCostBillingMonth,
  getOrganizationAiCostCoverageStatusLabel,
  getOrganizationAiCostCoverageStatusVariant,
} from "@/lib/ai-cost"
import { handleConvexError } from "@/lib/error-handling"
import { AiCostMonthlyChart } from "@/modules/admin/ui/components/ai-cost-monthly-chart"

type SortBy = "cost_desc" | "name_asc"

const sortOptions = {
  cost_desc: "Mayor costo",
  name_asc: "Nombre",
} as const satisfies Record<SortBy, string>

const billingProviderOptions = [
  { label: "AI Gateway", value: "ai-gateway" },
  { label: "OpenAI", value: "openai" },
  { label: "Otro", value: "other" },
] as const

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

export default function AdminAiCostsPage() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isPlatformAdmin = usePlatformAdmin()
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    () =>
      createAiCostDateRangeFromQuery({
        from: searchParams.get("from"),
        to: searchParams.get("to"),
      }) ?? createDefaultAiCostDateRange()
  )
  const [offset, setOffset] = useState(0)
  const [coverageOffset, setCoverageOffset] = useState(0)
  const [sortBy, setSortBy] = useState<SortBy>("cost_desc")
  const [billingProvider, setBillingProvider] = useState("ai-gateway")
  const [billingAmount, setBillingAmount] = useState("")
  const [billingMonth, setBillingMonth] = useState(getDefaultAiCostBillingMonth)
  const [billingNotes, setBillingNotes] = useState("")
  const [isSavingStatement, setIsSavingStatement] = useState(false)
  const dateRangeRef = useRef(dateRange)
  const [pendingBackfillOrganizationIds, setPendingBackfillOrganizationIds] =
    useState<string[]>([])
  const pageSize = 25
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
    if (isPlatformAdmin === false) {
      router.push("/admin/organizations")
    }
  }, [isPlatformAdmin, router])

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

  const overview = useQuery(
    api.superAdmin.conversationCosts.getPlatformCostRangeOverview,
    isPlatformAdmin ? rangeParams : "skip"
  )
  const organizations = useQuery(
    api.superAdmin.conversationCosts.listPlatformOrganizationCostsPage,
    isPlatformAdmin
      ? {
          limit: pageSize,
          offset,
          sortBy,
          ...rangeParams,
        }
      : "skip"
  )
  const reconciliation = useQuery(
    api.superAdmin.conversationCosts.getPlatformBillingReconciliation,
    isPlatformAdmin ? rangeParams : "skip"
  )
  const coverageOrganizations = useQuery(
    api.superAdmin.conversationCosts.listOrganizationsAiCostCoveragePage,
    isPlatformAdmin
      ? {
          limit: pageSize,
          offset: coverageOffset,
        }
      : "skip"
  )
  const startHistoricalBackfill = useAction(
    api.superAdmin.conversationCosts.startHistoricalBackfillForOrganization
  )
  const upsertBillingStatement = useMutation(
    api.superAdmin.conversationCosts.upsertBillingStatement
  )

  const handleSaveStatement = async () => {
    const amount = Number(billingAmount)
    if (
      !billingMonth ||
      Number.isNaN(amount) ||
      amount < 0 ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)
    ) {
      toast.error("Completa mes y monto facturado")
      return
    }

    setIsSavingStatement(true)
    try {
      await upsertBillingStatement({
        billedAmountUsd: amount,
        notes: billingNotes || undefined,
        periodMonth: billingMonth,
        provider: billingProvider,
      })
      toast.success("Facturación mensual guardada")
      setBillingAmount("")
      setBillingNotes("")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsSavingStatement(false)
    }
  }

  const handleBackfillAction = async (
    organizationId: string,
    mode: "failed_only" | "full"
  ) => {
    if (pendingBackfillOrganizationIds.includes(organizationId)) {
      return
    }

    setPendingBackfillOrganizationIds((current) =>
      current.includes(organizationId) ? current : [...current, organizationId]
    )

    try {
      await startHistoricalBackfill({ mode, organizationId })
      toast.success(
        mode === "failed_only"
          ? "Reintento de fallidos lanzado"
          : "Backfill histórico lanzado"
      )
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setPendingBackfillOrganizationIds((current) =>
        current.filter((id) => id !== organizationId)
      )
    }
  }

  if (
    isPlatformAdmin !== true ||
    overview === undefined ||
    organizations === undefined ||
    reconciliation === undefined ||
    coverageOrganizations === undefined
  ) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
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
    Boolean(overview.summary.truncated) ||
    Boolean(organizations.truncated) ||
    Boolean(reconciliation.truncated)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Costos IA globales</CardTitle>
            <CardDescription>
              Consolidado cross-org por rango, con corte en `America/Bogota`
            </CardDescription>
          </div>
          <DateRangePicker
            value={dateRange}
            onChange={(range) => {
              setOffset(0)
              setDateRange(range)
            }}
            clearable={true}
          />
        </CardHeader>
      </Card>

      {isRangeTruncated ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex flex-col gap-2 pt-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="font-medium text-sm">Rango parcialmente truncado</p>
              <p className="text-muted-foreground text-sm">
                Se activaron limites de lectura sobre eventos crudos. Los
                resumenes mensuales siguen cubriendo la mayor parte del rango,
                pero algunos conteos o rankings pueden quedar incompletos.
              </p>
            </div>
            <Badge variant="outline">Ajustar rango</Badge>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <AiCostStatCard
          title="Costo modelado"
          value={formatAiCost(overview.summary.totalCostUsd)}
        />
        <AiCostStatCard
          title="Organizaciones"
          value={overview.summary.organizationCount}
        />
        <AiCostStatCard
          title="Conversaciones"
          description={
            overview.summary.uniqueCountsLowerBound
              ? "Minimo confirmado"
              : undefined
          }
          value={formatAiCostCount(overview.summary.totalConversations, {
            lowerBound: overview.summary.uniqueCountsLowerBound,
          })}
        />
        <AiCostStatCard
          title="Cobertura estimada"
          value={formatAiCost(overview.summary.totalEstimatedCoverageCostUsd)}
        />
        <AiCostStatCard
          title="Threads sin conversación"
          description={
            overview.summary.uniqueCountsLowerBound
              ? "Minimo confirmado"
              : undefined
          }
          value={formatAiCostCount(overview.summary.totalUnassignedThreads, {
            lowerBound: overview.summary.uniqueCountsLowerBound,
          })}
        />
        <AiCostStatCard
          title="Costo no asignado"
          value={formatAiCost(overview.summary.unassignedThreadCostUsd)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Serie mensual y conciliación</CardTitle>
          <CardDescription>
            Modelado vs facturado agregado por mes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AiCostMonthlyChart
            showBilled={true}
            series={reconciliation.months.map((month) => ({
              billedAmountUsd: month.billedAmountUsd,
              estimatedCostUsd: month.estimatedCostUsd,
              periodMonth: month.periodMonth,
              totalCostUsd: month.totalModeledCostUsd,
            }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Organizaciones por costo</CardTitle>
              <CardDescription>
                `costInRange` agregado desde el ledger temporal
              </CardDescription>
            </div>
            <div className="w-full md:w-[220px]">
              <Select
                value={sortBy}
                onValueChange={(value) => {
                  setOffset(0)
                  setSortBy(value as SortBy)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cost_desc">
                    {sortOptions.cost_desc}
                  </SelectItem>
                  <SelectItem value="name_asc">
                    {sortOptions.name_asc}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {organizations.rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No hay consumo para el rango seleccionado.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Organización</TableHead>
                        <TableHead>Cobertura</TableHead>
                        <TableHead className="text-right">
                          Costo del rango
                        </TableHead>
                        <TableHead className="w-[110px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {organizations.rows.map((row) => (
                        <TableRow key={row.organizationId}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {row.name ?? row.organizationId}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {row.organizationId}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                row.costCoverage === "estimated"
                                  ? "outline"
                                  : "secondary"
                              }
                            >
                              {row.costCoverage === "estimated"
                                ? "Estimado"
                                : "Completo"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatAiCost(row.costInRange)}
                          </TableCell>
                          <TableCell>
                            <Button asChild size="sm" variant="outline">
                              <Link
                                href={`/admin/organizations/${row.organizationId}?${createAiCostSearchParams(
                                  {
                                    extraParams: { tab: "costs" },
                                    range: dateRange,
                                  }
                                ).toString()}`}
                              >
                                Ver detalle
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-sm">
                    Mostrando {organizations.rows.length} de{" "}
                    {organizations.total} organizaciones con su costo total
                    dentro del rango filtrado
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
                      disabled={!organizations.hasMore}
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
            <CardTitle>Cargar facturación</CardTitle>
            <CardDescription>
              Registro manual mensual para conciliación
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <p className="font-medium text-sm">Mes</p>
              <Input
                type="month"
                value={billingMonth}
                onChange={(event) => setBillingMonth(event.target.value)}
                placeholder="YYYY-MM"
              />
            </div>
            <div className="space-y-2">
              <p className="font-medium text-sm">Proveedor</p>
              <Select
                value={billingProvider}
                onValueChange={setBillingProvider}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {billingProviderOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-sm">Monto facturado</p>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={billingAmount}
                onChange={(event) => setBillingAmount(event.target.value)}
                placeholder="0.0000"
              />
            </div>
            <div className="space-y-2">
              <p className="font-medium text-sm">Notas</p>
              <Textarea
                value={billingNotes}
                onChange={(event) => setBillingNotes(event.target.value)}
                placeholder="Referencia de factura, observaciones, etc."
              />
            </div>
            <Button onClick={handleSaveStatement} disabled={isSavingStatement}>
              {isSavingStatement ? "Guardando..." : "Guardar facturación"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cobertura histórica por organización</CardTitle>
          <CardDescription>
            Estado operativo del inventario de threads, mapeo y sync del ledger
          </CardDescription>
        </CardHeader>
        <CardContent>
          {coverageOrganizations.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no hay organizaciones con seguimiento histórico de costos.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organización</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Resueltos</TableHead>
                      <TableHead>Pend. / fallidos</TableHead>
                      <TableHead>Último job</TableHead>
                      <TableHead>Última actualización</TableHead>
                      <TableHead className="w-[150px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coverageOrganizations.rows.map((row) => {
                      const isRunning =
                        row.coverage.status === "running" ||
                        row.backfillJob?.status === "running"
                      const actionMode =
                        row.coverage.hasFailures &&
                        row.coverage.threadsPending === 0
                          ? "failed_only"
                          : "full"
                      const isActionPending =
                        pendingBackfillOrganizationIds.includes(
                          row.organizationId
                        )
                      const actionLabel = isRunning
                        ? "En progreso"
                        : isActionPending
                          ? "Iniciando..."
                          : row.coverage.status === "not_started"
                            ? "Iniciar histórico"
                            : actionMode === "failed_only"
                              ? "Reintentar fallidos"
                              : "Reprocesar"

                      return (
                        <TableRow key={row.organizationId}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {row.name ?? row.organizationId}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {row.organizationId}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={getOrganizationAiCostCoverageStatusVariant(
                                row.coverage.status
                              )}
                            >
                              {getOrganizationAiCostCoverageStatusLabel(
                                row.coverage.status
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {row.coverage.threadsResolvedConversation +
                              row.coverage.threadsResolvedUnassigned}
                            {row.coverage.threadsRelevant > 0
                              ? ` / ${row.coverage.threadsRelevant}`
                              : ""}
                          </TableCell>
                          <TableCell className="text-sm">
                            {row.coverage.threadsPending} /{" "}
                            {row.coverage.threadsFailed}
                          </TableCell>
                          <TableCell className="text-sm">
                            {row.backfillJob ? (
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {row.backfillJob.mode === "failed_only"
                                    ? "Reintento fallidos"
                                    : "Backfill completo"}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                  {row.backfillJob.status === "running"
                                    ? "En progreso"
                                    : row.backfillJob.status === "failed"
                                      ? "Fallido"
                                      : "Completado"}
                                </span>
                              </div>
                            ) : (
                              "Sin job"
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {row.coverage.lastUpdatedAt
                              ? format(
                                  row.coverage.lastUpdatedAt,
                                  "d MMM yyyy, h:mm a",
                                  { locale: es }
                                )
                              : "Sin actividad"}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button asChild size="sm" variant="outline">
                                <Link
                                  href={`/admin/organizations/${row.organizationId}`}
                                >
                                  Ver
                                </Link>
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  handleBackfillAction(
                                    row.organizationId,
                                    actionMode
                                  )
                                }}
                                disabled={isRunning || isActionPending}
                              >
                                {actionLabel}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  Mostrando {coverageOrganizations.rows.length} de{" "}
                  {coverageOrganizations.total} organizaciones
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setCoverageOffset((current) =>
                        Math.max(0, current - pageSize)
                      )
                    }
                    disabled={coverageOffset === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setCoverageOffset((current) => current + pageSize)
                    }
                    disabled={!coverageOrganizations.hasMore}
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
          <CardTitle>Conciliación mensual</CardTitle>
          <CardDescription>
            Diferencia entre costo modelado y facturado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Modelado</TableHead>
                  <TableHead className="text-right">Facturado</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead>Proveedores</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciliation.months.map((month) => (
                  <TableRow key={month.periodMonth}>
                    <TableCell>
                      {formatAiCostPeriodMonth(month.periodMonth)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatAiCost(month.totalModeledCostUsd)}
                    </TableCell>
                    <TableCell className="text-right">
                      {month.billedAmountUsd === undefined
                        ? "Sin cargar"
                        : formatAiCost(month.billedAmountUsd)}
                    </TableCell>
                    <TableCell className="text-right">
                      {month.deltaUsd === undefined
                        ? "Sin delta"
                        : `${formatAiCost(month.deltaUsd)}${
                            month.deltaPercentage !== undefined
                              ? ` (${month.deltaPercentage}%)`
                              : ""
                          }`}
                    </TableCell>
                    <TableCell>
                      {month.providers.length > 0
                        ? month.providers.join(", ")
                        : "Sin proveedor"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
