"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { useMutation, useQuery } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { MessageSquare, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { toast } from "sonner"
import { usePlatformSuperAdmin } from "@/hooks/use-platform-admin"
import type { DebugConversationRow } from "@/modules/admin/types"
import { DebugContextHeader } from "@/modules/admin/ui/components/debug-context-header"
import { DebugOrgScopeSwitcher } from "@/modules/admin/ui/components/debug-org-scope-switcher"

type Props = {
  organizationId: string
}

export function AdminDebugConversationsByOrgView({ organizationId }: Props) {
  const router = useRouter()
  const isSuperAdmin = usePlatformSuperAdmin()

  const debugList = useQuery(
    api.superAdmin.debugConversations.listByOrganization,
    isSuperAdmin ? { organizationId } : "skip"
  )

  const removeFromDebug = useMutation(api.superAdmin.debugConversations.remove)

  const handleRemove = async (id: Id<"adminDebugConversations">) => {
    try {
      await removeFromDebug({ id })
      toast.success("Conversación removida de la lista")
    } catch {
      toast.error("Error al remover conversación")
    }
  }

  useEffect(() => {
    if (isSuperAdmin === false) {
      router.push("/admin")
    }
  }, [isSuperAdmin, router])

  if (isSuperAdmin === undefined || isSuperAdmin === false) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <DebugContextHeader
        title="Conversaciones debug de organización"
        description="Explora las conversaciones marcadas para debug dentro de esta organización y salta al agente de análisis."
        breadcrumbs={[
          { label: "Debug conversaciones", href: "/admin/conversations" },
          { label: organizationId },
        ]}
        actions={[
          {
            label: "Ver todas las organizaciones debug",
            href: "/admin/conversations",
          },
          {
            label: "Abrir agente debug de esta organización",
            href: `/admin/conversations/org/${organizationId}/agent`,
          },
        ]}
      />
      <DebugOrgScopeSwitcher
        organizationId={organizationId}
        currentView="conversations"
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Lista de Conversaciones
          </CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link href={`/admin/conversations/org/${organizationId}/agent`}>
              Abrir agente debug
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <CardDescription className="mb-4">
            Conversaciones marcadas para debugging en esta organización
          </CardDescription>
          {debugList === undefined ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : debugList.length > 0 ? (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Thread ID</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Razón</TableHead>
                    <TableHead>Agregada por</TableHead>
                    <TableHead>Última actualización</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(debugList as DebugConversationRow[]).map((item) => (
                    <TableRow key={item._id} className="hover:bg-muted/50">
                      <TableCell>
                        <Link
                          href={`/admin/conversations/${item.threadId}?organizationId=${organizationId}`}
                          className="font-mono text-xs hover:underline"
                        >
                          {item.threadId.slice(0, 16)}...
                        </Link>
                      </TableCell>
                      <TableCell>
                        {item.contactDisplayName || item.contactPhone || "—"}
                      </TableCell>
                      <TableCell className="max-w-[340px]">
                        <p className="whitespace-pre-wrap text-sm">
                          {item.reason}
                        </p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.addedBy.slice(0, 12)}...
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDistanceToNow(
                          item.lastUpdatedAt ?? item.addedAt,
                          {
                            addSuffix: true,
                            locale: es,
                          }
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            handleRemove(
                              item._id as Id<"adminDebugConversations">
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                No hay conversaciones en la lista de debug para esta
                organización
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
