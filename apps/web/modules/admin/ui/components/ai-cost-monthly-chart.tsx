"use client"

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@workspace/ui/components/chart"
import { CartesianGrid, Line, LineChart, XAxis } from "recharts"
import { formatAiCost, formatAiCostPeriodMonth } from "@/lib/ai-cost"

type SeriesRow = {
  billedAmountUsd?: number
  estimatedCostUsd?: number
  periodMonth: string
  totalCostUsd: number
}

const chartConfig = {
  billedAmountUsd: {
    color: "var(--chart-3)",
    label: "Facturado",
  },
  estimatedCostUsd: {
    color: "var(--chart-5)",
    label: "Estimado",
  },
  totalCostUsd: {
    color: "var(--chart-1)",
    label: "Modelado",
  },
} satisfies ChartConfig

export const AiCostMonthlyChart = ({
  series,
  showBilled = false,
}: {
  series: SeriesRow[]
  showBilled?: boolean
}) => {
  const data = series.map((row) => ({
    ...row,
    label: formatAiCostPeriodMonth(row.periodMonth),
  }))

  return (
    <ChartContainer config={chartConfig} className="h-[280px] w-full">
      <LineChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => formatAiCost(Number(value))}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="totalCostUsd"
          stroke="var(--color-totalCostUsd)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="estimatedCostUsd"
          stroke="var(--color-estimatedCostUsd)"
          strokeWidth={2}
          dot={false}
        />
        {showBilled ? (
          <Line
            type="monotone"
            dataKey="billedAmountUsd"
            stroke="var(--color-billedAmountUsd)"
            strokeWidth={2}
            dot={false}
          />
        ) : null}
      </LineChart>
    </ChartContainer>
  )
}
