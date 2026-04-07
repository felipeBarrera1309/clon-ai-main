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
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { useQuery } from "convex/react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { AlertTriangle, RefreshCw, Search } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
import { usePlatformSuperAdmin } from "@/hooks/use-platform-admin"

export function AdminEscalationsView() {
  const router = useRouter()
  const isSuperAdmin = usePlatformSuperAdmin()

  const {
    value: reasonText,
    debouncedValue: debouncedReasonText,
    setValue: setReasonText,
  } = useDebouncedSearch("", 300)
  const {
    value: organizationId,
    debouncedValue: debouncedOrganizationId,
    setValue: setOrganizationId,
  } = useDebouncedSearch("", 300)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  useEffect(() => {
    if (isSuperAdmin === false) {
      router.push("/admin")
    }
  }, [isSuperAdmin, router])

  const queryArgs = useMemo(
    () => ({
      paginationOpts: { numItems: 200, cursor: null },
      organizationId: debouncedOrganizationId.trim() || undefined,
      reasonCategories:
        selectedCategories.length > 0 ? selectedCategories : undefined,
      reasonText: debouncedReasonText.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      status: undefined,
    }),
    [
      dateFrom,
      dateTo,
      debouncedOrganizationId,
      debouncedReasonText,
      selectedCategories,
    ]
  )

  const escalations = useQuery(
    api.superAdmin.escalations.listEscalations,
    isSuperAdmin ? queryArgs : "skip"
  )

  const facets = useQuery(
    api.superAdmin.escalations.getEscalationReasonFacets,
    isSuperAdmin
      ? {
          organizationId: debouncedOrganizationId.trim() || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }
      : "skip"
  )

  if (isSuperAdmin === undefined || isSuperAdmin === false) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Verificando permisos...
        </div>
      </div>
    )
  }

  const rows = escalations?.page ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-3xl tracking-tight">
          Historial de Escalaciones
        </h1>
        <p className="mt-2 text-muted-foreground">
          Revisa por qué se escalan conversaciones y navega al detalle técnico.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Filtros
          </CardTitle>
          <CardDescription>
            Filtra por motivo, organización y rango de fechas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Buscar en motivo..."
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
            />
            <Input
              placeholder="organizationId"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
            />
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(facets ?? []).map((facet) => {
              const selected = selectedCategories.includes(facet.category)
              return (
                <Button
                  key={facet.category}
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  onClick={() => {
                    setSelectedCategories((current) =>
                      selected
                        ? current.filter(
                            (category) => category !== facet.category
                          )
                        : [...current, facet.category]
                    )
                  }}
                >
                  {facet.label ?? facet.category} ({facet.count})
                </Button>
              )
            })}

            {selectedCategories.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedCategories([])}
              >
                Limpiar motivos
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Escalaciones ({rows.length}
            {escalations && !escalations.isDone ? "+" : ""})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {escalations === undefined ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-16 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <AlertTriangle className="mx-auto mb-3 h-10 w-10 opacity-40" />
              No hay escalaciones para los filtros seleccionados.
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Organización</TableHead>
                    <TableHead>Estado actual</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Último mensaje</TableHead>
                    <TableHead>Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell className="text-sm">
                        {format(new Date(row.escalatedAt), "PPpp", {
                          locale: es,
                        })}
                      </TableCell>
                      <TableCell
                        className="max-w-[260px] truncate"
                        title={row.reason}
                      >
                        {row.reason}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {row.reasonCategoryLabel ?? row.reasonCategory}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.organizationId}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.conversationStatus === "resolved"
                              ? "secondary"
                              : row.conversationStatus === "escalated"
                                ? "destructive"
                                : "default"
                          }
                        >
                          {row.conversationStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.contactDisplayName || row.contactPhone || "—"}
                      </TableCell>
                      <TableCell
                        className="max-w-[280px] truncate text-muted-foreground text-sm"
                        title={row.lastCustomerMessage}
                      >
                        {row.lastCustomerMessage || "—"}
                      </TableCell>
                      <TableCell>
                        {row.threadId ? (
                          <Link
                            href={`/admin/conversations/${row.threadId}?organizationId=${row.organizationId}`}
                            className="text-primary text-sm hover:underline"
                          >
                            Ver conversación
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            N/A
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
