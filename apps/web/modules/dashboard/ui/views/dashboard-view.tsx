"use client"

import { api } from "@workspace/backend/_generated/api"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
} from "@workspace/ui/components/chart"
import { DateRangePicker } from "@workspace/ui/components/date-range-picker"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { useQuery } from "convex/react"
import {
  CalendarIcon,
  ChefHatIcon,
  DollarSignIcon,
  MessageSquareIcon,
  ShoppingCartIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react"
import { useState } from "react"
import type { DateRange } from "react-day-picker"
import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis } from "recharts"
import { useOrganization } from "@/hooks/use-organization"
import { formatCurrency } from "../../../../lib/currency"

type TabType = "general" | "pedidos" | "clientes" | "sucursales"

// Component for displaying trend indicators
const TrendIndicator = ({
  change,
  showPercentage = true,
  size = "sm",
}: {
  change: number
  showPercentage?: boolean
  size?: "sm" | "md"
}) => {
  const isPositive = change > 0
  const isNeutral = change === 0

  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4"
  const textSize = size === "sm" ? "text-xs" : "text-sm"

  if (isNeutral) {
    return (
      <div
        className={`${textSize} flex items-center gap-1 text-muted-foreground`}
      >
        <span>-</span>
        {showPercentage && <span>0%</span>}
      </div>
    )
  }

  return (
    <div
      className={`${textSize} flex items-center gap-1 ${
        isPositive ? "text-green-600" : "text-red-600"
      }`}
    >
      {isPositive ? (
        <TrendingUpIcon className={iconSize} />
      ) : (
        <TrendingDownIcon className={iconSize} />
      )}
      {showPercentage && <span>{Math.abs(change).toFixed(1)}%</span>}
    </div>
  )
}

export const DashboardView = () => {
  const { activeOrganizationId } = useOrganization()
  const [activeTab, setActiveTab] = useState<TabType>("general")
  const [appliedDateRange, setAppliedDateRange] = useState<
    DateRange | undefined
  >(() => ({
    from: (() => {
      const date = new Date()
      date.setDate(date.getDate() - 7) // Última semana por defecto
      return date
    })(),
    to: new Date(),
  }))

  const metrics = useQuery(
    api.private.dashboard.getFilteredMetrics,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          startDate: appliedDateRange?.from
            ? appliedDateRange.from.getTime()
            : undefined,
          endDate: appliedDateRange?.to
            ? appliedDateRange.to.getTime()
            : undefined,
        }
      : "skip"
  )
  const analytics = useQuery(
    api.private.dashboard.getSalesAnalytics,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          startDate: appliedDateRange?.from
            ? appliedDateRange.from.getTime()
            : undefined,
          endDate: appliedDateRange?.to
            ? appliedDateRange.to.getTime()
            : undefined,
        }
      : "skip"
  )
  const locationMetrics = useQuery(
    api.private.dashboard.getLocationMetrics,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          startDate: appliedDateRange?.from
            ? appliedDateRange.from.getTime()
            : undefined,
          endDate: appliedDateRange?.to
            ? appliedDateRange.to.getTime()
            : undefined,
        }
      : "skip"
  )
  const orderAnalytics = useQuery(
    api.private.dashboard.getOrderAnalytics,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          startDate: appliedDateRange?.from
            ? appliedDateRange.from.getTime()
            : undefined,
          endDate: appliedDateRange?.to
            ? appliedDateRange.to.getTime()
            : undefined,
        }
      : "skip"
  )
  const customerAnalytics = useQuery(
    api.private.dashboard.getCustomerAnalytics,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          startDate: appliedDateRange?.from
            ? appliedDateRange.from.getTime()
            : undefined,
          endDate: appliedDateRange?.to
            ? appliedDateRange.to.getTime()
            : undefined,
        }
      : "skip"
  )

  // Chart configurations
  const salesTrendConfig = {
    total: {
      label: "Total Ventas",
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig

  // Generic color palette for dynamic charts
  const chartColors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ]

  // Function to generate dynamic chart config based on data
  const generateChartConfig = (
    data: Array<{ category: string }>
  ): ChartConfig => {
    const config: ChartConfig = {}
    data.forEach((item, index) => {
      const categoryKey = item.category
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/á/g, "a")
        .replace(/é/g, "e")
        .replace(/í/g, "i")
        .replace(/ó/g, "o")
        .replace(/ú/g, "u")
      config[categoryKey] = {
        label: item.category,
        color: chartColors[index % chartColors.length],
      }
    })
    return config
  }

  // Create chart data following the example pattern
  const getChartData = (data: Array<{ category: string; total: number }>) => {
    return data.map((item, index) => {
      const categoryKey = item.category
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/á/g, "a")
        .replace(/é/g, "e")
        .replace(/í/g, "i")
        .replace(/ó/g, "o")
        .replace(/ú/g, "u")

      return {
        ...item,
        category: item.category,
        total: item.total,
        fill: chartColors[index % chartColors.length],
      }
    })
  }
  // Derived analytics lists
  const topProducts = (analytics?.topProducts ?? []) as Array<{
    name: string
    units: number
  }>
  const bottomProducts = (analytics?.bottomProducts ?? []) as Array<{
    name: string
    units: number
  }>
  const topProductsByProfit = (analytics?.topProductsByProfit ?? []) as Array<{
    name: string
    revenue: number
  }>
  const maxUnitsTop =
    topProducts.reduce((m, p) => (p.units > m ? p.units : m), 0) || 1
  const maxUnitsBottom =
    bottomProducts.reduce((m, p) => (p.units > m ? p.units : m), 0) || 1
  const maxRevenueTop =
    topProductsByProfit.reduce((m, p) => (p.revenue > m ? p.revenue : m), 0) ||
    1

  if (metrics === undefined) {
    return (
      <div className="flex h-full flex-col space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={`skeleton-card-${i}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="font-medium text-sm">
                  <div className="h-4 animate-pulse rounded bg-muted" />
                </CardTitle>
                <div className="h-4 w-4 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="mb-2 h-8 animate-pulse rounded bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Tabs and Date Filter */}
      <div className="flex items-center justify-between">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabType)}
          className="w-full"
        >
          <div className="mb-6 flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
            <TabsList className="grid w-full max-w-lg grid-cols-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
              <TabsTrigger value="clientes">Clientes</TabsTrigger>
              <TabsTrigger value="sucursales">Sucursales</TabsTrigger>
            </TabsList>
            <DateRangePicker
              value={appliedDateRange}
              onChange={setAppliedDateRange}
              clearable={true}
              className="self-end"
            />
          </div>

          {/* General Tab */}
          <TabsContent value="general" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Total de Pedidos
                  </CardTitle>
                  <ShoppingCartIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {metrics.totalOrders}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      {metrics.ordersByStatus.entregado || 0} entregados
                    </p>
                    {metrics.comparisons && (
                      <TrendIndicator
                        change={metrics.comparisons.ordersChange}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Ingresos Totales
                  </CardTitle>
                  <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {formatCurrency(metrics.totalRevenue)}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      En el período seleccionado
                    </p>
                    {metrics.comparisons && (
                      <TrendIndicator
                        change={metrics.comparisons.revenueChange}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Ticket Promedio
                  </CardTitle>
                  <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {formatCurrency(metrics.averageOrderValue)}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">Por pedido</p>
                    {metrics.comparisons && (
                      <TrendIndicator
                        change={metrics.comparisons.averageOrderChange}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Total Clientes
                  </CardTitle>
                  <UsersIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {metrics.totalClients}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      Contactos registrados
                    </p>
                    <TrendIndicator change={0} showPercentage={false} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Pedidos automatizados
                  </CardTitle>
                  <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {metrics.aiAutomationStats?.aiAutomationRate ?? 0}%
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      {metrics.aiAutomationStats?.aiCompletedConversations ?? 0}{" "}
                      pedidos sin intervención
                    </p>
                    <TrendIndicator change={0} showPercentage={false} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 xl:grid-cols-2">
              {/* Sales Trend */}
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Tendencia de Ventas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analytics ? (
                    <div className="flex w-full justify-center">
                      <ChartContainer
                        config={salesTrendConfig}
                        className="h-72 w-full max-w-3xl items-center"
                      >
                        <BarChart
                          data={analytics.salesTrend.map((item) => ({
                            ...item,
                            fill: "var(--color-total)",
                          }))}
                        >
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="month"
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                          />
                          <ChartTooltip
                            content={<ChartTooltipContent />}
                            labelFormatter={(value) => `${value}`}
                          />
                          <Bar
                            dataKey="total"
                            fill="var(--color-total)"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      Cargando datos...
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Sales by Category */}
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Ventas por Categoría
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analytics && analytics.salesByCategory.length > 0 ? (
                    <div className="flex w-full justify-center">
                      <ChartContainer
                        config={generateChartConfig(analytics.salesByCategory)}
                        className="h-80 w-full max-w-xl items-center"
                      >
                        <PieChart
                          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                        >
                          <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent hideLabel />}
                          />
                          <Pie
                            data={getChartData(analytics.salesByCategory)}
                            dataKey="total"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={120}
                            strokeWidth={2}
                          />
                          <ChartLegend
                            content={({ payload }) => (
                              <div className="-translate-y-2 flex flex-wrap justify-center gap-2">
                                {payload?.map((entry) => (
                                  <div
                                    key={`legend-${entry.value}`}
                                    className="flex items-center gap-2"
                                  >
                                    <div
                                      className="h-3 w-3 rounded-sm"
                                      style={{ backgroundColor: entry.color }}
                                    />
                                    <span className="text-muted-foreground text-sm">
                                      {entry.value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          />
                        </PieChart>
                      </ChartContainer>
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      Sin datos en el período seleccionado
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top/Bottom Products */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Top 10 Productos Más Vendidos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {topProducts.length > 0 ? (
                    <div className="space-y-3">
                      {topProducts.map((p, idx) => (
                        <div
                          key={`top-${p.name}-${idx}`}
                          className="flex items-center gap-3"
                        >
                          <div className="w-6 font-semibold text-muted-foreground text-sm">
                            #{idx + 1}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-sm leading-tight">
                              {p.name}
                            </div>
                            <div className="mt-1 h-2 rounded bg-muted">
                              <div
                                className="h-2 rounded bg-chart-1"
                                style={{
                                  width: `${Math.min(100, (p.units / maxUnitsTop) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div className="w-20 text-right text-muted-foreground text-xs">
                            {p.units} Vendidos
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      Sin datos en el período seleccionado
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Top 10 Productos Mayor Ticket
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {topProductsByProfit.length > 0 ? (
                    <div className="space-y-3">
                      {topProductsByProfit.map((p, idx) => (
                        <div
                          key={`profit-${p.name}-${idx}`}
                          className="flex items-center gap-3"
                        >
                          <div className="w-6 font-semibold text-muted-foreground text-sm">
                            #{idx + 1}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-sm leading-tight">
                              {p.name}
                            </div>
                            <div className="mt-1 h-2 rounded bg-muted">
                              <div
                                className="h-2 rounded bg-chart-1"
                                style={{
                                  width: `${Math.min(100, (p.revenue / maxRevenueTop) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div className="w-20 text-right text-muted-foreground text-xs">
                            {formatCurrency(p.revenue)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      Sin datos en el período seleccionado
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Combo Metrics */}
            {analytics?.comboMetrics &&
              analytics.comboMetrics.comboOrderCount > 0 && (
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="font-medium text-sm">
                        Pedidos con Combo
                      </CardTitle>
                      <ShoppingCartIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="font-bold text-2xl">
                        {analytics.comboMetrics.comboOrderCount}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {analytics.comboMetrics.comboItemCount} items de combo
                        en total
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="font-medium text-sm">
                        Ingresos por Combos
                      </CardTitle>
                      <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="font-bold text-2xl">
                        {formatCurrency(analytics.comboMetrics.comboRevenue)}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        En el período seleccionado
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="font-medium text-sm">
                        Top Combos
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {analytics.comboMetrics.topCombos.length > 0 ? (
                        <div className="space-y-3">
                          {analytics.comboMetrics.topCombos.map(
                            (combo, idx) => (
                              <div
                                key={`combo-${combo.name}-${idx}`}
                                className="flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-muted-foreground text-xs">
                                    #{idx + 1}
                                  </span>
                                  <span className="font-medium text-sm">
                                    {combo.name}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="text-muted-foreground text-xs">
                                    {combo.count} vendidos &middot;{" "}
                                    {formatCurrency(combo.revenue)}
                                  </span>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        <div className="text-muted-foreground text-sm">
                          Sin datos de combos
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
          </TabsContent>

          {/* Pedidos Tab */}
          <TabsContent value="pedidos" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Pedidos Pendientes
                  </CardTitle>
                  <ShoppingCartIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {metrics.ordersByStatus.pendiente || 0}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      Requieren atención
                    </p>
                    <TrendIndicator change={0} showPercentage={false} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Pedidos Entregados
                  </CardTitle>
                  <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {metrics.ordersByStatus.entregado || 0}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      Completados exitosamente
                    </p>
                    <TrendIndicator change={0} showPercentage={false} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    En Preparación
                  </CardTitle>
                  <ChefHatIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {metrics.ordersByStatus.preparando || 0}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">En proceso</p>
                    <TrendIndicator change={0} showPercentage={false} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    En Camino
                  </CardTitle>
                  <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {metrics.ordersByStatus.en_camino || 0}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      Próximos a entregar
                    </p>
                    <TrendIndicator change={0} showPercentage={false} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Enhanced Order Analytics Charts */}
            <div className="grid gap-4 xl:grid-cols-2">
              {/* Order Type Performance */}
              <Card>
                <CardHeader>
                  <CardTitle>Domicilio vs. Recoger</CardTitle>
                </CardHeader>
                <CardContent>
                  {orderAnalytics?.orderTypePerformance ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center">
                          <p className="font-bold text-2xl">
                            {orderAnalytics.orderTypePerformance.delivery.count}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            Domicilio
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {formatCurrency(
                              orderAnalytics.orderTypePerformance.delivery
                                .revenue
                            )}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-2xl">
                            {orderAnalytics.orderTypePerformance.pickup.count}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            Recoger
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {formatCurrency(
                              orderAnalytics.orderTypePerformance.pickup.revenue
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex w-full justify-center">
                        <ChartContainer
                          config={{
                            delivery: {
                              label: "Domicilio",
                              color: "var(--chart-1)",
                            },
                            pickup: {
                              label: "Recoger",
                              color: "var(--chart-2)",
                            },
                          }}
                          className="h-64 w-full max-w-md"
                        >
                          <PieChart>
                            <ChartTooltip
                              content={<ChartTooltipContent hideLabel />}
                            />
                            <Pie
                              data={[
                                {
                                  type: "Domicilio",
                                  count:
                                    orderAnalytics.orderTypePerformance.delivery
                                      .count,
                                  fill: "var(--color-delivery)",
                                },
                                {
                                  type: "Recoger",
                                  count:
                                    orderAnalytics.orderTypePerformance.pickup
                                      .count,
                                  fill: "var(--color-pickup)",
                                },
                              ]}
                              dataKey="count"
                              nameKey="type"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                            />
                          </PieChart>
                        </ChartContainer>
                      </div>
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      Cargando datos...
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payment Method Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Métodos de Pago</CardTitle>
                </CardHeader>
                <CardContent>
                  {orderAnalytics?.paymentMethodTrends ? (
                    <div className="flex w-full justify-center">
                      <ChartContainer
                        config={{
                          cash: { label: "Efectivo", color: "var(--chart-1)" },
                          card: { label: "Datafono", color: "var(--chart-2)" },
                          transfer: {
                            label: "Transferencia",
                            color: "var(--chart-3)",
                          },
                        }}
                        className="h-80 w-full max-w-md"
                      >
                        <PieChart>
                          <ChartTooltip
                            content={<ChartTooltipContent hideLabel />}
                          />
                          <Pie
                            data={[
                              {
                                method: "Efectivo",
                                count: orderAnalytics.paymentMethodTrends.cash,
                                fill: "var(--color-cash)",
                              },
                              {
                                method: "Datafono",
                                count: orderAnalytics.paymentMethodTrends.card,
                                fill: "var(--color-card)",
                              },
                              {
                                method: "Transferencia",
                                count:
                                  orderAnalytics.paymentMethodTrends.transfer,
                                fill: "var(--color-transfer)",
                              },
                            ]}
                            dataKey="count"
                            nameKey="method"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={120}
                          />
                          <ChartLegend
                            content={({ payload }) => (
                              <div className="mt-4 flex flex-wrap justify-center gap-2">
                                {payload?.map((entry) => (
                                  <div
                                    key={`legend-${entry.value}`}
                                    className="flex items-center gap-2"
                                  >
                                    <div
                                      className="h-3 w-3 rounded-sm"
                                      style={{ backgroundColor: entry.color }}
                                    />
                                    <span className="text-muted-foreground text-sm">
                                      {entry.value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          />
                        </PieChart>
                      </ChartContainer>
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      Cargando datos...
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Peak Hours Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>Análisis de Horarios Pico</CardTitle>
              </CardHeader>
              <CardContent>
                {orderAnalytics?.hourlyData ? (
                  <div className="flex w-full justify-center">
                    <ChartContainer
                      config={{
                        orders: { label: "Pedidos", color: "var(--chart-1)" },
                      }}
                      className="h-64 w-full"
                    >
                      <BarChart data={orderAnalytics.hourlyData}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10 }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                        />
                        <ChartTooltip
                          content={<ChartTooltipContent />}
                          labelFormatter={(value) => `Hora: ${value}`}
                        />
                        <Bar
                          dataKey="orders"
                          fill="var(--color-orders)"
                          radius={[2, 2, 0, 0]}
                        />
                      </BarChart>
                    </ChartContainer>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    Cargando datos...
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Clientes Tab */}
          <TabsContent value="clientes" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Conversaciones
                  </CardTitle>
                  <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {metrics.totalConversations}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      Interacciones totales
                    </p>
                    <TrendIndicator change={0} showPercentage={false} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Conversaciones Activas
                  </CardTitle>
                  <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {(metrics.conversationsByStatus.unresolved || 0) +
                      (metrics.conversationsByStatus.escalated || 0)}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      Requieren atención
                    </p>
                    <TrendIndicator change={0} showPercentage={false} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Tasa de Conversión
                  </CardTitle>
                  <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {customerAnalytics?.conversionRate
                      ? `${customerAnalytics.conversionRate.toFixed(1)}%`
                      : "0%"}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      Conversación a pedido
                    </p>
                    <TrendIndicator change={0} showPercentage={false} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Clientes Activos
                  </CardTitle>
                  <UsersIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {customerAnalytics?.activeCustomers || 0}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      Con pedidos realizados
                    </p>
                    <TrendIndicator change={0} showPercentage={false} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Customer Analytics Charts */}
            <div className="grid gap-4 xl:grid-cols-2">
              {/* Customer Lifetime Value Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Distribución de Valor del Cliente</CardTitle>
                </CardHeader>
                <CardContent>
                  {customerAnalytics?.lifetimeValueDistribution ? (
                    <div className="flex w-full justify-center">
                      <ChartContainer
                        config={{
                          oneTime: {
                            label: "Una vez",
                            color: "var(--chart-1)",
                          },
                          repeat: {
                            label: "Repetidor",
                            color: "var(--chart-2)",
                          },
                          loyal: { label: "Leal", color: "var(--chart-3)" },
                        }}
                        className="h-80 w-full max-w-md"
                      >
                        <PieChart>
                          <ChartTooltip
                            content={<ChartTooltipContent hideLabel />}
                          />
                          <Pie
                            data={[
                              {
                                segment: "Una vez",
                                count:
                                  customerAnalytics.lifetimeValueDistribution
                                    .oneTime,
                                fill: "var(--color-oneTime)",
                              },
                              {
                                segment: "Repetidor (2-5)",
                                count:
                                  customerAnalytics.lifetimeValueDistribution
                                    .repeat,
                                fill: "var(--color-repeat)",
                              },
                              {
                                segment: "Leal (5+)",
                                count:
                                  customerAnalytics.lifetimeValueDistribution
                                    .loyal,
                                fill: "var(--color-loyal)",
                              },
                            ]}
                            dataKey="count"
                            nameKey="segment"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={120}
                          />
                          <ChartLegend
                            content={({ payload }) => (
                              <div className="mt-4 flex flex-wrap justify-center gap-2">
                                {payload?.map((entry) => (
                                  <div
                                    key={`legend-${entry.value}`}
                                    className="flex items-center gap-2"
                                  >
                                    <div
                                      className="h-3 w-3 rounded-sm"
                                      style={{ backgroundColor: entry.color }}
                                    />
                                    <span className="text-muted-foreground text-sm">
                                      {entry.value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          />
                        </PieChart>
                      </ChartContainer>
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      Cargando datos...
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Geographic Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Distribución Geográfica</CardTitle>
                </CardHeader>
                <CardContent>
                  {customerAnalytics?.geographicDistribution ? (
                    <div className="space-y-4">
                      {customerAnalytics.geographicDistribution.map(
                        (area, _index) => (
                          <div
                            key={area.area}
                            className="flex items-center justify-between"
                          >
                            <span className="font-medium text-sm">
                              {area.area}
                            </span>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-chart-1"
                                  style={{
                                    width: `${(area.count / Math.max(...customerAnalytics.geographicDistribution.map((a) => a.count))) * 100}%`,
                                  }}
                                />
                              </div>
                              <span className="w-8 text-right text-muted-foreground text-sm">
                                {area.count}
                              </span>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      Cargando datos...
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Customer Acquisition Trends */}
            {customerAnalytics?.customerAcquisitionData &&
              customerAnalytics.customerAcquisitionData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Tendencia de Adquisición de Clientes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex w-full justify-center">
                      <ChartContainer
                        config={{
                          newCustomers: {
                            label: "Nuevos Clientes",
                            color: "var(--chart-1)",
                          },
                        }}
                        className="h-64 w-full"
                      >
                        <BarChart
                          data={customerAnalytics.customerAcquisitionData}
                        >
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 10 }}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                          />
                          <ChartTooltip
                            content={<ChartTooltipContent />}
                            labelFormatter={(value) => `Fecha: ${value}`}
                          />
                          <Bar
                            dataKey="newCustomers"
                            fill="var(--color-newCustomers)"
                            radius={[2, 2, 0, 0]}
                          />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
          </TabsContent>

          {/* Sucursales Tab */}
          <TabsContent value="sucursales" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Total Sucursales
                  </CardTitle>
                  <ShoppingCartIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {locationMetrics?.totalLocations || 0}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      Ubicaciones activas
                    </p>
                    <TrendIndicator change={0} showPercentage={false} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Mejor Sucursal
                  </CardTitle>
                  <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="truncate font-bold text-lg">
                    {locationMetrics?.revenueByLocation?.[0]?.locationName ||
                      "N/A"}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      Por ingresos
                    </p>
                    <p className="font-medium text-primary text-xs">
                      {locationMetrics?.revenueByLocation?.[0]
                        ? formatCurrency(
                            locationMetrics.revenueByLocation[0].revenue
                          )
                        : "$0"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Más Activa
                  </CardTitle>
                  <ShoppingCartIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="truncate font-bold text-lg">
                    {locationMetrics?.revenueByLocation?.sort(
                      (a, b) => b.orderCount - a.orderCount
                    )?.[0]?.locationName || "N/A"}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      Por volumen de pedidos
                    </p>
                    <p className="font-medium text-primary text-xs">
                      {locationMetrics?.revenueByLocation?.sort(
                        (a, b) => b.orderCount - a.orderCount
                      )?.[0]?.orderCount || 0}{" "}
                      pedidos
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Ticket Promedio
                  </CardTitle>
                  <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {locationMetrics?.revenueByLocation
                      ? formatCurrency(
                          locationMetrics.revenueByLocation.reduce(
                            (sum, loc) => sum + loc.averageOrderValue,
                            0
                          ) / locationMetrics.revenueByLocation.length
                        )
                      : "$0"}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      Promedio general
                    </p>
                    <TrendIndicator change={0} showPercentage={false} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Location Performance Charts */}
            <div className="grid gap-4 xl:grid-cols-2">
              {/* Revenue by Location */}
              <Card>
                <CardHeader>
                  <CardTitle>Ingresos por Sucursal</CardTitle>
                </CardHeader>
                <CardContent>
                  {locationMetrics?.revenueByLocation &&
                  locationMetrics.revenueByLocation.length > 0 ? (
                    <div className="flex w-full justify-center">
                      <ChartContainer
                        config={{
                          revenue: {
                            label: "Ingresos",
                            color: "var(--chart-1)",
                          },
                        }}
                        className="h-64 w-full"
                      >
                        <BarChart data={locationMetrics.revenueByLocation}>
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="locationName"
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 10 }}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                          />
                          <ChartTooltip
                            content={<ChartTooltipContent />}
                            formatter={(value) => [
                              formatCurrency(value as number),
                              "Ingresos",
                            ]}
                          />
                          <Bar
                            dataKey="revenue"
                            fill="var(--color-revenue)"
                            radius={[2, 2, 0, 0]}
                          />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      No hay datos de sucursales disponibles
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Order Type Distribution by Location */}
              <Card>
                <CardHeader>
                  <CardTitle>Domicilio vs. Recoger por Sucursal</CardTitle>
                </CardHeader>
                <CardContent>
                  {locationMetrics?.orderTypeByLocation &&
                  locationMetrics.orderTypeByLocation.length > 0 ? (
                    <div className="flex w-full justify-center">
                      <ChartContainer
                        config={{
                          delivery: {
                            label: "Domicilio",
                            color: "var(--chart-1)",
                          },
                          pickup: { label: "Recoger", color: "var(--chart-2)" },
                        }}
                        className="h-64 w-full"
                      >
                        <BarChart data={locationMetrics.orderTypeByLocation}>
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="locationName"
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 10 }}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar
                            dataKey="delivery"
                            stackId="a"
                            fill="var(--color-delivery)"
                          />
                          <Bar
                            dataKey="pickup"
                            stackId="a"
                            fill="var(--color-pickup)"
                          />
                          <ChartLegend />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      No hay datos de tipos de pedido por sucursal
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Payment Methods by Location */}
            <Card>
              <CardHeader>
                <CardTitle>Métodos de Pago por Sucursal</CardTitle>
              </CardHeader>
              <CardContent>
                {locationMetrics?.paymentMethodByLocation &&
                locationMetrics.paymentMethodByLocation.length > 0 ? (
                  <div className="flex w-full justify-center">
                    <ChartContainer
                      config={{
                        cash: { label: "Efectivo", color: "var(--chart-1)" },
                        card: { label: "Datafono", color: "var(--chart-2)" },
                        transfer: {
                          label: "Transferencia",
                          color: "var(--chart-3)",
                        },
                      }}
                      className="h-64 w-full"
                    >
                      <BarChart data={locationMetrics.paymentMethodByLocation}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                          dataKey="locationName"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10 }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar
                          dataKey="cash"
                          stackId="a"
                          fill="var(--color-cash)"
                        />
                        <Bar
                          dataKey="card"
                          stackId="a"
                          fill="var(--color-card)"
                        />
                        <Bar
                          dataKey="transfer"
                          stackId="a"
                          fill="var(--color-transfer)"
                        />
                        <ChartLegend />
                      </BarChart>
                    </ChartContainer>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    No hay datos de métodos de pago por sucursal
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Removed: Actividad Reciente y Resumen del Negocio */}

      {/* Monthly Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Rendimiento del Mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                Ingresos del Período
              </p>
              <p className="font-bold text-2xl">
                {formatCurrency(metrics.totalRevenue)}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                Pedidos Pendientes
              </p>
              <p className="font-bold text-2xl">
                {metrics.ordersByStatus.pendiente || 0}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                Conversaciones Activas
              </p>
              <p className="font-bold text-2xl">
                {(metrics.conversationsByStatus.unresolved || 0) +
                  (metrics.conversationsByStatus.escalated || 0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Getting Started Guide - Only show if no data */}
      {metrics.totalOrders === 0 && metrics.totalConversations === 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Comenzar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  Parece que estás empezando. Aquí tienes algunas acciones para
                  comenzar:
                </p>
                <div className="grid gap-2">
                  <div className="flex items-center space-x-2">
                    <ChefHatIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Añade productos a tu menú</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Configura tu widget de chat</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <ShoppingCartIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Comienza a recibir pedidos</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Revisa tu rendimiento aquí</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
