"use client"

import { api } from "@workspace/backend/_generated/api"
import { AIResponse } from "@workspace/ui/components/ai/response"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { usePaginatedQuery, useQuery } from "convex/react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  AlertTriangle,
  Bot,
  Brain,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquare,
  Settings,
  StopCircle,
  User,
  Wrench,
} from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { use, useEffect, useMemo, useState } from "react"
import { usePlatformSuperAdmin } from "@/hooks/use-platform-admin"
import { DebugContextHeader } from "@/modules/admin/ui/components/debug-context-header"
import { DebugOrgScopeSwitcher } from "@/modules/admin/ui/components/debug-org-scope-switcher"
import {
  extractDebugMessageText,
  normalizeDebugMessagesChronological,
} from "@/modules/admin/ui/utils/debug-message-utils"

type Props = {
  params: Promise<{ threadId: string }>
}

// Content part types for tool calls and results
type ToolCallPart = {
  type: "tool-call" | "tool_use"
  toolCallId?: string
  toolName?: string
  args?: unknown
  providerExecuted?: boolean
}

type ToolResultPart = {
  type: "tool-result" | "tool_result"
  toolCallId?: string
  toolName?: string
  result?: unknown
  isError?: boolean
  args?: unknown
  output?: {
    type: "text" | "json" | "error-text" | "error-json" | "content"
    value: unknown
  }
  experimental_content?: Array<{
    type: "text" | "image"
    text?: string
    data?: string
    mimeType?: string
  }>
}

type TextPart = {
  type: "text"
  text?: string
}

type ReasoningPart = {
  type: "reasoning"
  text?: string
  signature?: string
}

type RedactedReasoningPart = {
  type: "redacted-reasoning"
  data?: string
}

type SourcePart = {
  type: "source"
  sourceType: "url" | "document"
  id: string
  url?: string
  title?: string
  mediaType?: string
  filename?: string
}

type FilePart = {
  type: "file"
  mimeType: string
  data: string | ArrayBuffer
  filename?: string
}

type ContentPart =
  | ToolCallPart
  | ToolResultPart
  | TextPart
  | ReasoningPart
  | RedactedReasoningPart
  | SourcePart
  | FilePart
  | { type: string; [key: string]: unknown }

// Usage token counts - complete structure from @convex-dev/agent
type UsageStats = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
}

// Warning types from AI SDK
type Warning =
  | { type: "unsupported-setting"; setting: string; details?: string }
  | { type: "unsupported-tool"; tool: unknown; details?: string }
  | { type: "other"; message: string }

// Source types
type Source =
  | {
      type?: "source"
      sourceType: "url"
      id: string
      url: string
      title?: string
    }
  | {
      type: "source"
      sourceType: "document"
      id: string
      title: string
      mediaType: string
      filename?: string
    }

// Reasoning detail types
type ReasoningDetail =
  | { type: "reasoning"; text: string; signature?: string }
  | { type: "text"; text: string; signature?: string }
  | { type: "redacted"; data: string }

// Finish reason type
type FinishReason =
  | "stop"
  | "length"
  | "tool-calls"
  | "content-filter"
  | "error"
  | "other"
  | "unknown"

// MessageDoc structure from @convex-dev/agent - COMPLETE
type MessageDoc = {
  _id: string
  _creationTime: number
  threadId?: string
  // Nested message content
  message?: {
    role: "user" | "assistant" | "tool" | "system"
    content: string | ContentPart[]
    name?: string
    providerOptions?: Record<string, Record<string, unknown>>
  }
  // Top-level metadata
  status?: "pending" | "success" | "failed"
  order?: number
  stepOrder?: number
  agentName?: string
  text?: string // Convenience field - extracted text
  tool?: boolean
  model?: string
  provider?: string
  usage?: UsageStats
  error?: string
  // Additional fields from @convex-dev/agent MessageDoc
  userId?: string
  embeddingId?: string
  fileIds?: string[]
  reasoning?: string
  reasoningDetails?: ReasoningDetail[]
  sources?: Source[]
  warnings?: Warning[]
  finishReason?: FinishReason
  providerMetadata?: Record<string, Record<string, unknown>>
  providerOptions?: Record<string, Record<string, unknown>>
}

export function AdminDebugConversationDetailView({ params }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isSuperAdmin = usePlatformSuperAdmin()
  const { threadId } = use(params)
  const [messageFilter, setMessageFilter] = useState<
    "all" | "errors" | "tool-calls" | "tool-results" | "warnings"
  >("all")

  const conversationDetails = useQuery(
    api.superAdmin.debugConversations.getConversationDetails,
    isSuperAdmin ? { threadId } : "skip"
  )

  const { results, status, loadMore } = usePaginatedQuery(
    api.superAdmin.debugConversations.getThreadMessages,
    isSuperAdmin ? { threadId } : "skip",
    { initialNumItems: 50 }
  )

  const chronologicalMessages = useMemo(
    () =>
      normalizeDebugMessagesChronological(results as MessageDoc[] | undefined),
    [results]
  )

  const isLoadingDetails = conversationDetails === undefined
  const isLoadingMessages = status === "LoadingFirstPage"
  const canLoadMore = status === "CanLoadMore"
  const isLoadingMore = status === "LoadingMore"
  const organizationIdFromQuery = searchParams.get("organizationId")
  const scopedOrganizationId =
    organizationIdFromQuery ?? conversationDetails?.organizationId
  const backHref = scopedOrganizationId
    ? `/admin/conversations/org/${scopedOrganizationId}`
    : "/admin/conversations"
  const agentHref = scopedOrganizationId
    ? `/admin/conversations/org/${scopedOrganizationId}/agent`
    : null
  const orgInfo = useQuery(
    api.superAdmin.debugAgent.getOrganizationInfo,
    isSuperAdmin && scopedOrganizationId
      ? { organizationId: scopedOrganizationId }
      : "skip"
  )

  useEffect(() => {
    if (isSuperAdmin === false) {
      router.push("/admin")
    }
  }, [isSuperAdmin, router])

  const summary = useMemo(() => {
    if (chronologicalMessages.length === 0) {
      return {
        toolCalls: 0,
        toolResultErrors: 0,
        warnings: 0,
        nonStopFinishReasons: 0,
      }
    }

    let toolCalls = 0
    let toolResultErrors = 0
    let warnings = 0
    let nonStopFinishReasons = 0

    for (const message of chronologicalMessages) {
      if (Array.isArray(message.message?.content)) {
        for (const part of message.message.content) {
          if (part.type === "tool-call" || part.type === "tool_use") {
            toolCalls += 1
          }

          if (
            (part.type === "tool-result" || part.type === "tool_result") &&
            "isError" in part &&
            part.isError
          ) {
            toolResultErrors += 1
          }
        }
      }

      warnings += message.warnings?.length ?? 0
      if (message.finishReason && message.finishReason !== "stop") {
        nonStopFinishReasons += 1
      }
    }

    return {
      toolCalls,
      toolResultErrors,
      warnings,
      nonStopFinishReasons,
    }
  }, [chronologicalMessages])

  const filteredMessages = useMemo(() => {
    return chronologicalMessages.filter((message) => {
      const contentParts = Array.isArray(message.message?.content)
        ? message.message.content
        : []

      switch (messageFilter) {
        case "errors":
          return (
            message.status === "failed" ||
            contentParts.some(
              (part) =>
                (part.type === "tool-result" || part.type === "tool_result") &&
                "isError" in part &&
                !!part.isError
            )
          )
        case "tool-calls":
          return contentParts.some(
            (part) => part.type === "tool-call" || part.type === "tool_use"
          )
        case "tool-results":
          return contentParts.some(
            (part) => part.type === "tool-result" || part.type === "tool_result"
          )
        case "warnings":
          return (message.warnings?.length ?? 0) > 0
        default:
          return true
      }
    })
  }, [messageFilter, chronologicalMessages])

  if (isSuperAdmin === undefined || isSuperAdmin === false) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Error state
  if (conversationDetails === null) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
        <h2 className="mt-4 font-semibold text-xl">
          Conversación no encontrada
        </h2>
        <p className="mt-2 text-muted-foreground">
          No se encontró una conversación con el threadId especificado
        </p>
        <Button asChild className="mt-4">
          <Link href={backHref}>Volver a la lista</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <DebugContextHeader
        title="Detalle de conversación debug"
        description="Inspecciona mensajes, tool calls y señales técnicas para entender el caso y decidir acciones."
        breadcrumbs={[
          { label: "Debug conversaciones", href: "/admin/conversations" },
          ...(scopedOrganizationId
            ? [
                {
                  label:
                    orgInfo?.organizationName ??
                    `Org ${scopedOrganizationId.slice(0, 8)}...`,
                  href: `/admin/conversations/org/${scopedOrganizationId}`,
                },
              ]
            : []),
          { label: `Thread ${threadId.slice(0, 10)}...` },
        ]}
        actions={[
          {
            label: "Ver todas las organizaciones debug",
            href: "/admin/conversations",
          },
          ...(scopedOrganizationId
            ? [
                {
                  label: "Ver conversaciones de esta organización",
                  href: `/admin/conversations/org/${scopedOrganizationId}`,
                },
              ]
            : []),
          ...(agentHref
            ? [
                {
                  label: "Abrir agente debug de esta organización",
                  href: agentHref,
                },
              ]
            : []),
        ]}
      />

      {scopedOrganizationId ? (
        <DebugOrgScopeSwitcher
          organizationId={scopedOrganizationId}
          currentView="conversations"
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={backHref}>
            {scopedOrganizationId
              ? "Volver a conversaciones de la organización"
              : "Volver al listado global de debug"}
          </Link>
        </Button>
        {agentHref ? (
          <Button asChild variant="outline">
            <Link href={agentHref}>
              Ir al agente debug de esta organización
            </Link>
          </Button>
        ) : null}
      </div>

      {/* Conversation Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Detalles de la Conversación</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingDetails ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-muted-foreground text-sm">Organización</p>
                <p className="font-mono text-sm">
                  {conversationDetails?.organizationId}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Contacto</p>
                <p className="font-medium">
                  {conversationDetails?.contact?.displayName || "Sin nombre"}
                </p>
                <p className="text-muted-foreground text-sm">
                  {conversationDetails?.contact?.phoneNumber}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Estado</p>
                <Badge
                  variant={
                    conversationDetails?.status === "resolved"
                      ? "secondary"
                      : conversationDetails?.status === "escalated"
                        ? "destructive"
                        : "default"
                  }
                >
                  {conversationDetails?.status}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Creada</p>
                <p className="text-sm">
                  {conversationDetails?._creationTime &&
                    format(
                      new Date(conversationDetails._creationTime),
                      "PPpp",
                      { locale: es }
                    )}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Messages */}
      <Card>
        <CardHeader>
          <CardTitle>Mensajes ({chronologicalMessages.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground text-xs">Tool Calls</p>
              <p className="font-semibold text-xl">{summary.toolCalls}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground text-xs">Tool Errors</p>
              <p className="font-semibold text-xl">
                {summary.toolResultErrors}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground text-xs">Warnings</p>
              <p className="font-semibold text-xl">{summary.warnings}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground text-xs">Finish != stop</p>
              <p className="font-semibold text-xl">
                {summary.nonStopFinishReasons}
              </p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={messageFilter === "all" ? "default" : "outline"}
              onClick={() => setMessageFilter("all")}
            >
              Todos
            </Button>
            <Button
              size="sm"
              variant={messageFilter === "errors" ? "default" : "outline"}
              onClick={() => setMessageFilter("errors")}
            >
              Errores
            </Button>
            <Button
              size="sm"
              variant={messageFilter === "tool-calls" ? "default" : "outline"}
              onClick={() => setMessageFilter("tool-calls")}
            >
              Tool Calls
            </Button>
            <Button
              size="sm"
              variant={messageFilter === "tool-results" ? "default" : "outline"}
              onClick={() => setMessageFilter("tool-results")}
            >
              Tool Results
            </Button>
            <Button
              size="sm"
              variant={messageFilter === "warnings" ? "default" : "outline"}
              onClick={() => setMessageFilter("warnings")}
            >
              Warnings
            </Button>
          </div>

          {isLoadingMessages ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : filteredMessages.length > 0 ? (
            <div className="space-y-4">
              {/* Load More (at top for older messages) */}
              {canLoadMore && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadMore(50)}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Cargando...
                      </>
                    ) : (
                      "Cargar mensajes anteriores"
                    )}
                  </Button>
                </div>
              )}

              {/* Messages List */}
              {filteredMessages.map((message: MessageDoc) => (
                <DebugMessageItem key={message._id} message={message} />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                {chronologicalMessages.length > 0
                  ? "No hay mensajes que coincidan con el filtro actual"
                  : "No hay mensajes en esta conversación"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Individual message component with collapsible JSON for tool calls
function DebugMessageItem({ message }: { message: MessageDoc }) {
  const getRoleIcon = (role: string) => {
    switch (role) {
      case "user":
        return <User className="h-4 w-4" />
      case "assistant":
        return <Bot className="h-4 w-4" />
      case "tool":
        return <Wrench className="h-4 w-4" />
      case "system":
        return <Settings className="h-4 w-4" />
      default:
        return <MessageSquare className="h-4 w-4" />
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case "user":
        return "border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
      case "assistant":
        return "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
      case "tool":
        return "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
      case "system":
        return "border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-900/20"
      default:
        return "bg-gray-100 dark:bg-gray-800"
    }
  }

  const getRoleBadgeVariant = (
    role: string
  ): "default" | "secondary" | "destructive" | "outline" => {
    switch (role) {
      case "user":
        return "secondary"
      case "assistant":
        return "default"
      case "tool":
        return "outline"
      case "system":
        return "secondary"
      default:
        return "secondary"
    }
  }

  const hasToolCalls =
    Array.isArray(message.message?.content) &&
    message.message.content.some(
      (part) => part.type === "tool-call" || part.type === "tool_use"
    )

  const isToolResult = message.message?.role === "tool"

  const textContent = extractDebugMessageText(message)

  const toolCalls = Array.isArray(message.message?.content)
    ? message.message.content.filter(
        (part): part is ToolCallPart =>
          part.type === "tool-call" || part.type === "tool_use"
      )
    : []

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        getRoleColor(message.message?.role ?? "system")
      )}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getRoleIcon(message.message?.role ?? "system")}
          <Badge
            variant={getRoleBadgeVariant(message.message?.role ?? "system")}
          >
            {message.message?.role ?? "unknown"}
            {message.message?.name && ` (${message.message.name})`}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {format(new Date(message._creationTime), "HH:mm:ss", {
              locale: es,
            })}
          </span>
          {message.status && (
            <Badge
              variant={
                message.status === "success"
                  ? "default"
                  : message.status === "failed"
                    ? "destructive"
                    : "secondary"
              }
              className="text-xs"
            >
              {message.status}
            </Badge>
          )}
        </div>
      </div>

      {/* Text Content */}
      {textContent && (
        <AIResponse className="text-sm [&_code]:break-words">
          {textContent}
        </AIResponse>
      )}

      {/* Error Display (for failed messages) */}
      {message.status === "failed" && message.error && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-red-600 text-sm dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <strong>Error:</strong> {message.error}
        </div>
      )}

      {/* Tool Calls (collapsible) */}
      {hasToolCalls && toolCalls.length > 0 && (
        <div className="mt-3 space-y-2">
          {toolCalls.map(
            (
              toolCall: {
                toolCallId?: string
                toolName?: string
                args?: unknown
                providerExecuted?: boolean
              },
              index: number
            ) => (
              <Collapsible key={toolCall.toolCallId || index}>
                <CollapsibleTrigger className="flex items-center gap-2 font-medium text-amber-600 text-sm hover:underline dark:text-amber-400">
                  <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-90" />
                  <Wrench className="h-3 w-3" />
                  {toolCall.toolName || "Tool Call"}
                  {toolCall.toolCallId && (
                    <span className="font-mono text-muted-foreground text-xs">
                      ({toolCall.toolCallId.slice(0, 8)}...)
                    </span>
                  )}
                  {toolCall.providerExecuted && (
                    <Badge variant="outline" className="text-xs">
                      provider-executed
                    </Badge>
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  {toolCall.toolCallId && (
                    <div className="mb-2 text-muted-foreground text-xs">
                      <span className="font-medium">Call ID:</span>{" "}
                      <span className="font-mono">{toolCall.toolCallId}</span>
                    </div>
                  )}
                  <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
                    {JSON.stringify(toolCall.args, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )
          )}
        </div>
      )}

      {/* Tool Result (collapsible) */}
      {isToolResult && Array.isArray(message.message?.content) && (
        <div className="mt-2 space-y-2">
          {message.message?.content.map(
            (
              part: {
                type: string
                toolCallId?: string
                toolName?: string
                result?: unknown
                isError?: boolean
                args?: unknown
                output?: {
                  type: string
                  value: unknown
                }
                experimental_content?: Array<{
                  type: string
                  text?: string
                  data?: string
                  mimeType?: string
                }>
              },
              index: number
            ) => {
              if (part.type === "tool-result" || part.type === "tool_result") {
                return (
                  <Collapsible key={index} defaultOpen={part.isError}>
                    <CollapsibleTrigger className="flex items-center gap-2 font-medium text-sm hover:underline">
                      <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-90" />
                      <Wrench className="h-3 w-3" />
                      <span
                        className={
                          part.isError
                            ? "text-red-600 dark:text-red-400"
                            : "text-green-600 dark:text-green-400"
                        }
                      >
                        {part.toolName || "Tool"}{" "}
                        {part.isError ? "Error" : "Result"}
                      </span>
                      {part.toolCallId && (
                        <span className="font-mono text-muted-foreground text-xs">
                          ({part.toolCallId.slice(0, 8)}...)
                        </span>
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-2">
                      {part.args !== undefined && part.args !== null && (
                        <div>
                          <span className="text-muted-foreground text-xs">
                            Args:
                          </span>
                          <pre className="max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                            {JSON.stringify(part.args, null, 2)}
                          </pre>
                        </div>
                      )}
                      {/* Result */}
                      <div>
                        <span className="text-muted-foreground text-xs">
                          Result:
                        </span>
                        <pre
                          className={cn(
                            "max-h-64 overflow-auto rounded p-3 text-xs",
                            part.isError
                              ? "bg-red-50 dark:bg-red-900/20"
                              : "bg-muted"
                          )}
                        >
                          {JSON.stringify(part.result, null, 2)}
                        </pre>
                      </div>
                      {/* Output if present (newer format) */}
                      {part.output && (
                        <div>
                          <span className="text-muted-foreground text-xs">
                            Output ({part.output.type}):
                          </span>
                          <pre className="max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                            {JSON.stringify(part.output.value, null, 2)}
                          </pre>
                        </div>
                      )}
                      {/* Experimental content if present */}
                      {part.experimental_content &&
                        part.experimental_content.length > 0 && (
                          <div>
                            <span className="text-muted-foreground text-xs">
                              Content:
                            </span>
                            {part.experimental_content.map((content, cIdx) => (
                              <div
                                key={cIdx}
                                className="mt-1 rounded bg-muted p-2 text-xs"
                              >
                                {content.type === "text" && content.text}
                                {content.type === "image" && (
                                  <span className="text-muted-foreground">
                                    [Image: {content.mimeType}]
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                    </CollapsibleContent>
                  </Collapsible>
                )
              }
              return null
            }
          )}
        </div>
      )}

      {/* Reasoning (if present) */}
      {(message.reasoning ||
        (message.reasoningDetails && message.reasoningDetails.length > 0)) && (
        <Collapsible className="mt-3">
          <CollapsibleTrigger className="flex items-center gap-2 font-medium text-purple-600 text-sm hover:underline dark:text-purple-400">
            <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-90" />
            <Brain className="h-3 w-3" />
            AI Reasoning
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {message.reasoning && (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-purple-50 p-3 text-xs dark:bg-purple-900/20">
                {message.reasoning}
              </pre>
            )}
            {message.reasoningDetails?.map((detail, idx) => (
              <div
                key={idx}
                className="rounded bg-purple-50 p-2 text-xs dark:bg-purple-900/20"
              >
                <Badge variant="outline" className="mb-1 text-xs">
                  {detail.type}
                </Badge>
                {"text" in detail && detail.text && (
                  <pre className="whitespace-pre-wrap">{detail.text}</pre>
                )}
                {"data" in detail && detail.data && (
                  <span className="text-muted-foreground">[Redacted]</span>
                )}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Sources (if present) */}
      {message.sources && message.sources.length > 0 && (
        <Collapsible className="mt-3">
          <CollapsibleTrigger className="flex items-center gap-2 font-medium text-cyan-600 text-sm hover:underline dark:text-cyan-400">
            <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-90" />
            <ExternalLink className="h-3 w-3" />
            Sources ({message.sources.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1">
            {message.sources.map((source, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded bg-cyan-50 p-2 text-xs dark:bg-cyan-900/20"
              >
                {source.sourceType === "url" ? (
                  <>
                    <ExternalLink className="h-3 w-3" />
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-600 hover:underline"
                    >
                      {source.title || source.url}
                    </a>
                  </>
                ) : (
                  <>
                    <FileText className="h-3 w-3" />
                    <span>{source.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {source.mediaType}
                    </Badge>
                  </>
                )}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Warnings (if present) */}
      {message.warnings && message.warnings.length > 0 && (
        <Collapsible className="mt-3" defaultOpen>
          <CollapsibleTrigger className="flex items-center gap-2 font-medium text-sm text-yellow-600 hover:underline dark:text-yellow-400">
            <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-90" />
            <AlertTriangle className="h-3 w-3" />
            Warnings ({message.warnings.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1">
            {message.warnings.map((warning, idx) => (
              <div
                key={idx}
                className="rounded border border-yellow-200 bg-yellow-50 p-2 text-xs dark:border-yellow-800 dark:bg-yellow-900/20"
              >
                <Badge variant="outline" className="mb-1 text-xs">
                  {warning.type}
                </Badge>
                {"setting" in warning && (
                  <span className="ml-2">Setting: {warning.setting}</span>
                )}
                {"tool" in warning && (
                  <span className="ml-2">
                    Tool: {JSON.stringify(warning.tool)}
                  </span>
                )}
                {"message" in warning && (
                  <span className="ml-2">{warning.message}</span>
                )}
                {"details" in warning && warning.details && (
                  <p className="mt-1 text-muted-foreground">
                    {warning.details}
                  </p>
                )}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Finish Reason (if not 'stop') */}
      {message.finishReason && message.finishReason !== "stop" && (
        <div className="mt-2 flex items-center gap-2">
          <StopCircle className="h-3 w-3 text-muted-foreground" />
          <Badge
            variant={
              message.finishReason === "error" ? "destructive" : "outline"
            }
            className="text-xs"
          >
            Finish: {message.finishReason}
          </Badge>
        </div>
      )}

      {/* Debug Info (collapsible) - Enhanced */}
      <Collapsible className="mt-3">
        <CollapsibleTrigger className="flex items-center gap-2 text-muted-foreground text-xs hover:underline">
          <ChevronRight className="h-3 w-3 transition-transform [[data-state=open]>&]:rotate-90" />
          Debug Info
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="grid grid-cols-2 gap-2 rounded bg-muted/50 p-2 text-xs">
            <div>
              <span className="text-muted-foreground">ID:</span>{" "}
              <span className="font-mono">{message._id}</span>
            </div>
            {message.threadId && (
              <div>
                <span className="text-muted-foreground">Thread:</span>{" "}
                <span className="font-mono">
                  {message.threadId.slice(0, 12)}...
                </span>
              </div>
            )}
            {message.agentName && (
              <div>
                <span className="text-muted-foreground">Agent:</span>{" "}
                {message.agentName}
              </div>
            )}
            {message.model && (
              <div>
                <span className="text-muted-foreground">Model:</span>{" "}
                {message.model}
              </div>
            )}
            {message.provider && (
              <div>
                <span className="text-muted-foreground">Provider:</span>{" "}
                {message.provider}
              </div>
            )}
            {message.order !== undefined && (
              <div>
                <span className="text-muted-foreground">Order:</span>{" "}
                {message.order}.{message.stepOrder ?? 0}
              </div>
            )}
            {message.userId && (
              <div>
                <span className="text-muted-foreground">User ID:</span>{" "}
                <span className="font-mono">
                  {message.userId.slice(0, 12)}...
                </span>
              </div>
            )}
            {message.tool !== undefined && (
              <div>
                <span className="text-muted-foreground">Is Tool:</span>{" "}
                {message.tool ? "Yes" : "No"}
              </div>
            )}
            {message.finishReason && (
              <div>
                <span className="text-muted-foreground">Finish Reason:</span>{" "}
                {message.finishReason}
              </div>
            )}
            {message.embeddingId && (
              <div>
                <span className="text-muted-foreground">Embedding:</span>{" "}
                <span className="font-mono">
                  {message.embeddingId.slice(0, 12)}...
                </span>
              </div>
            )}
            {message.fileIds && message.fileIds.length > 0 && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Files:</span>{" "}
                {message.fileIds.map((id, i) => (
                  <span key={id} className="font-mono">
                    {i > 0 && ", "}
                    {id.slice(0, 8)}...
                  </span>
                ))}
              </div>
            )}
            {message.usage && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Tokens:</span>{" "}
                {message.usage.promptTokens ?? 0} prompt /{" "}
                {message.usage.completionTokens ?? 0} completion /{" "}
                {message.usage.totalTokens ?? 0} total
                {message.usage.reasoningTokens !== undefined &&
                  message.usage.reasoningTokens > 0 && (
                    <span> / {message.usage.reasoningTokens} reasoning</span>
                  )}
                {message.usage.cachedInputTokens !== undefined &&
                  message.usage.cachedInputTokens > 0 && (
                    <span> / {message.usage.cachedInputTokens} cached</span>
                  )}
              </div>
            )}
          </div>
          {/* Provider Metadata/Options */}
          {(message.providerMetadata || message.providerOptions) && (
            <Collapsible className="mt-2">
              <CollapsibleTrigger className="flex items-center gap-1 text-muted-foreground text-xs hover:underline">
                <ChevronRight className="h-3 w-3 transition-transform [[data-state=open]>&]:rotate-90" />
                Provider Data
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1">
                <pre className="max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(
                    {
                      metadata: message.providerMetadata,
                      options: message.providerOptions,
                    },
                    null,
                    2
                  )}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}
          {/* Raw Message (for debugging) */}
          <Collapsible className="mt-2">
            <CollapsibleTrigger className="flex items-center gap-1 text-muted-foreground text-xs hover:underline">
              <ChevronRight className="h-3 w-3 transition-transform [[data-state=open]>&]:rotate-90" />
              Raw Message Data
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1">
              <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(message, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
