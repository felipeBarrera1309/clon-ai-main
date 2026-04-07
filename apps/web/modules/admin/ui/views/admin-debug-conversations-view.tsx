"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
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
import { useMutation, useQuery } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { Building2, MessageSquare, Plus, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { usePlatformSuperAdmin } from "@/hooks/use-platform-admin"
import type { DebugOrganizationRow } from "@/modules/admin/types"
import { DebugContextHeader } from "@/modules/admin/ui/components/debug-context-header"

export function AdminDebugConversationsView() {
  const router = useRouter()
  const isSuperAdmin = usePlatformSuperAdmin()
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [selectedConversation, setSelectedConversation] = useState<{
    _id: Id<"conversations">
    threadId: string
    organizationId: string
    contactDisplayName?: string
  } | null>(null)
  const [reason, setReason] = useState("")
  const [expectedResponse, setExpectedResponse] = useState("")

  const organizations = useQuery(
    api.superAdmin.debugConversations.listOrganizations,
    isSuperAdmin ? {} : "skip"
  )
  const searchResults = useQuery(
    api.superAdmin.debugConversations.search,
    isSuperAdmin && searchQuery.length >= 4 ? { query: searchQuery } : "skip"
  )

  const addToDebug = useMutation(api.superAdmin.debugConversations.add)
  const clearAll = useMutation(api.superAdmin.debugConversations.clearAll)

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    setIsSearching(value.length >= 4)
  }

  const handleAddDialogOpenChange = (open: boolean) => {
    setAddDialogOpen(open)
    if (!open) {
      setSelectedConversation(null)
      setReason("")
      setExpectedResponse("")
    }
  }

  const handleAddToDebug = async () => {
    if (!selectedConversation || !reason.trim()) return

    const trimmedReason = reason.trim()
    const trimmedExpectedResponse = expectedResponse.trim() || undefined

    try {
      await addToDebug({
        organizationId: selectedConversation.organizationId,
        conversationId: selectedConversation._id,
        reason: trimmedReason,
        expectedResponse: trimmedExpectedResponse,
      })

      toast.success("Conversación agregada a la lista de debug")
      handleAddDialogOpenChange(false)
      setSearchQuery("")
    } catch {
      toast.error("Error al agregar conversación")
    }
  }

  const handleClearAll = async () => {
    try {
      const result = await clearAll({})
      toast.success(`${result.deleted} conversaciones removidas`)
    } catch {
      toast.error("Error al limpiar lista")
    }
  }

  const isLoading = organizations === undefined
  const totalDebugConversations =
    organizations?.reduce((acc, item) => acc + item.debugCount, 0) ?? 0

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
        title="Debug conversaciones"
        description="Revisa organizaciones con actividad de debug y entra a sus conversaciones marcadas para análisis."
        breadcrumbs={[{ label: "Debug conversaciones" }]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar Conversación
          </CardTitle>
          <CardDescription>
            Ingresa al menos 4 caracteres del ID de conversación o threadId
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Buscar por ID de conversación o threadId..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="max-w-md"
              />
              {searchQuery.length > 0 && searchQuery.length < 4 && (
                <span className="self-center text-muted-foreground text-sm">
                  Mínimo 4 caracteres
                </span>
              )}
            </div>

            {isSearching && searchResults && searchResults.length > 0 && (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thread ID</TableHead>
                      <TableHead>Organización</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-[100px]">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchResults.map((conv) => (
                      <TableRow key={conv._id}>
                        <TableCell className="font-mono text-xs">
                          {conv.threadId.slice(0, 16)}...
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {conv.organizationId.slice(0, 12)}...
                        </TableCell>
                        <TableCell>
                          {conv.contactDisplayName || conv.contactPhone || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              conv.status === "resolved"
                                ? "secondary"
                                : "default"
                            }
                          >
                            {conv.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedConversation({
                                _id: conv._id,
                                threadId: conv.threadId,
                                organizationId: conv.organizationId,
                                contactDisplayName: conv.contactDisplayName,
                              })
                              setAddDialogOpen(true)
                            }}
                          >
                            <Plus className="mr-1 h-4 w-4" />
                            Agregar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {isSearching && searchResults && searchResults.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No se encontraron conversaciones
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organizaciones con Debug
            </CardTitle>
            <CardDescription>
              Selecciona una organización para ver sus conversaciones debug
            </CardDescription>
          </div>
          {totalDebugConversations > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Limpiar Todo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Limpiar toda la lista?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción eliminará las {totalDebugConversations}{" "}
                    conversaciones de debug compartidas. No se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearAll}>
                    Limpiar Todo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : organizations && organizations.length > 0 ? (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organización</TableHead>
                    <TableHead>Conversaciones debug</TableHead>
                    <TableHead>Última actividad</TableHead>
                    <TableHead className="w-[160px]">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(organizations as DebugOrganizationRow[]).map((item) => (
                    <TableRow key={item.organizationId}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">
                            {item.organizationName || "Organización"}
                          </p>
                          <p className="font-mono text-muted-foreground text-xs">
                            {item.organizationId}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.debugCount}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDistanceToNow(item.lastActivityAt, {
                          addSuffix: true,
                          locale: es,
                        })}
                      </TableCell>
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/admin/conversations/org/${item.organizationId}`}
                          >
                            Ver conversaciones
                          </Link>
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
                No hay organizaciones con conversaciones en debug
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addDialogOpen} onOpenChange={handleAddDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar a Lista de Debug</DialogTitle>
            <DialogDescription>
              Indica la razón por la que estás debuggeando esta conversación
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Conversación</Label>
              <p className="font-mono text-sm">
                {selectedConversation?.threadId.slice(0, 24)}...
              </p>
              {selectedConversation?.contactDisplayName && (
                <p className="text-muted-foreground text-sm">
                  Contacto: {selectedConversation.contactDisplayName}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Razón *</Label>
              <Textarea
                id="reason"
                placeholder="Ej: El usuario reportó que el bot no entendió su pedido..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedResponse">Cómo debería responder</Label>
              <Textarea
                id="expectedResponse"
                placeholder="Describe qué debería haber dicho el bot en este caso..."
                value={expectedResponse}
                onChange={(e) => setExpectedResponse(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleAddDialogOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleAddToDebug} disabled={!reason.trim()}>
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
