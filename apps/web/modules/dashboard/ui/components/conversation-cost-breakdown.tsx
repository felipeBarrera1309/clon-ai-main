"use client"

import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  formatAiCost,
  formatTokenCount,
  getConversationRoleLabel,
  getConversationThreadPurposeLabel,
} from "@/lib/ai-cost"

type ConversationCostBreakdownData = {
  messages: Array<{
    cost: number
    isCustomerVisible: boolean
    messageId: string
    model?: string
    provider?: string
    role: string
    textPreview?: string
    threadId: string
    threadPurpose:
      | "support-agent"
      | "menu-context"
      | "combination-enrichment"
      | "combination-validation"
      | "debug-agent"
      | "combo-builder"
      | "unknown"
    timestamp: number
    usage?: {
      cachedInputTokens?: number
      completionTokens?: number
      promptTokens?: number
      reasoningTokens?: number
      totalTokens?: number
    }
  }>
  summary: {
    costUpdatedAt?: number
    messagesWithCost: number
    threadsCount: number
    totalCost: number
  }
}

export const ConversationCostBreakdown = ({
  costBreakdown,
  isLoading,
}: {
  costBreakdown?: ConversationCostBreakdownData
  isLoading: boolean
}) => {
  return (
    <div className="space-y-4 bg-muted/20 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">Costo AI</span>
        {costBreakdown && (
          <>
            <Badge variant="secondary">
              {formatAiCost(costBreakdown.summary.totalCost)}
            </Badge>
            <Badge variant="outline">
              {costBreakdown.summary.messagesWithCost} mensajes con costo
            </Badge>
            <Badge variant="outline">
              {costBreakdown.summary.threadsCount} threads
            </Badge>
            <span className="text-muted-foreground text-xs">
              Incluye todos los threads AI registrados para esta conversación.
            </span>
          </>
        )}
        {costBreakdown?.summary.costUpdatedAt && (
          <span className="text-muted-foreground text-xs">
            Actualizado{" "}
            {format(costBreakdown.summary.costUpdatedAt, "d MMM, h:mm a", {
              locale: es,
            })}
          </span>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Tokens: <span className="font-medium">P</span> = entrada al modelo,{" "}
        <span className="font-medium">C</span> = salida generada,{" "}
        <span className="font-medium">T</span> = total consumido.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : !costBreakdown || costBreakdown.messages.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Esta conversación todavía no tiene mensajes AI con costo registrado.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Fecha</TableHead>
                <TableHead className="min-w-[360px]">Contexto</TableHead>
                <TableHead className="w-[220px]">Modelo</TableHead>
                <TableHead className="w-[140px]">Tokens</TableHead>
                <TableHead className="text-right">Costo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costBreakdown.messages.map((message) => (
                <TableRow key={message.messageId}>
                  <TableCell className="whitespace-nowrap align-top text-xs">
                    {format(message.timestamp, "d MMM, h:mm a", { locale: es })}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="secondary">
                          {getConversationThreadPurposeLabel(
                            message.threadPurpose
                          )}
                        </Badge>
                        <Badge variant="outline">
                          {getConversationRoleLabel(message.role)}
                        </Badge>
                        {message.isCustomerVisible && (
                          <Badge variant="outline">Visible</Badge>
                        )}
                      </div>
                      {message.textPreview && (
                        <p className="max-w-2xl whitespace-normal break-words text-muted-foreground text-xs leading-5">
                          {message.textPreview}
                        </p>
                      )}
                      <p className="break-all font-mono text-[11px] text-muted-foreground">
                        {message.threadId}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-xs">
                    <div className="flex flex-col break-words">
                      <span>{message.model || "Sin modelo"}</span>
                      <span className="text-muted-foreground">
                        {message.provider || "Sin provider"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top text-xs">
                    <div className="flex flex-col text-muted-foreground">
                      <span>
                        P {formatTokenCount(message.usage?.promptTokens)}
                      </span>
                      <span>
                        C {formatTokenCount(message.usage?.completionTokens)}
                      </span>
                      <span>
                        T {formatTokenCount(message.usage?.totalTokens)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right align-top font-medium text-xs">
                    {formatAiCost(message.cost)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
