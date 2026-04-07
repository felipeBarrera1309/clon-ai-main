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
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowLeft,
  Bug,
  MapPin,
  MessageSquare,
  Settings,
  ShoppingCart,
  Trash2,
  Users,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  usePlatformAdmin,
  usePlatformSuperAdmin,
} from "@/hooks/use-platform-admin"
import { handleConvexError } from "@/lib/error-handling"
import { MemberRoleDialog } from "@/modules/admin/ui/components/member-role-dialog"
import { LocationsTab } from "@/modules/admin/ui/components/org-locations-tab"
import { MembersTab } from "@/modules/admin/ui/components/org-members-tab"
import { OrgPermissionsTab } from "@/modules/admin/ui/components/org-permissions-tab"
import { WhatsAppTab } from "@/modules/admin/ui/components/org-whatsapp-tab"
import { OrganizationAiCostsTab } from "@/modules/admin/ui/components/organization-ai-costs-tab"

interface Member {
  _id: string
  role: string
  user?: {
    _id: string
    name: string
    email: string
    image?: string | null
  }
}

type OrganizationDetailsTab =
  | "overview"
  | "members"
  | "permissions"
  | "locations"
  | "costs"
  | "customization"
  | "prompt-builder"
  | "whatsapp"
  | "debug"

const baseOrganizationTabs: OrganizationDetailsTab[] = [
  "overview",
  "members",
  "permissions",
  "locations",
  "customization",
  "prompt-builder",
  "whatsapp",
]

export default function OrganizationDetailsPage() {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const organizationId = params.organizationId as string
  const isPlatformAdmin = usePlatformAdmin()
  const isSuperAdmin = usePlatformSuperAdmin()

  const [memberToRemove, setMemberToRemove] = useState<{
    id: string
    name: string
  } | null>(null)
  const [invitationToCancel, setInvitationToCancel] = useState<{
    id: string
    email: string
  } | null>(null)
  const [memberToChangeRole, setMemberToChangeRole] = useState<Member | null>(
    null
  )
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState<OrganizationDetailsTab>("overview")

  useEffect(() => {
    const availableTabs = new Set<OrganizationDetailsTab>(baseOrganizationTabs)
    if (isPlatformAdmin) {
      availableTabs.add("costs")
    }
    if (isSuperAdmin) {
      availableTabs.add("debug")
    }

    const requestedTab = searchParams.get(
      "tab"
    ) as OrganizationDetailsTab | null
    const nextTab =
      requestedTab && availableTabs.has(requestedTab)
        ? requestedTab
        : "overview"

    setActiveTab((current) => (current !== nextTab ? nextTab : current))
  }, [isPlatformAdmin, isSuperAdmin, searchParams])

  const details = useQuery(
    api.superAdmin.organizations.getOrganizationDetails,
    { organizationId }
  )

  const removeMember = useMutation(
    api.superAdmin.organizations.removeMemberFromOrganization
  )
  const cancelInvitation = useMutation(
    api.superAdmin.organizations.cancelInvitation
  )
  const deleteOrganization = useMutation(
    api.superAdmin.organizations.deleteOrganization
  )

  const handleRemoveMember = async () => {
    if (!memberToRemove) return
    try {
      await removeMember({ memberId: memberToRemove.id })
      toast.success(
        `${memberToRemove.name} ha sido removido de la organización`
      )
      setMemberToRemove(null)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleCancelInvitation = async () => {
    if (!invitationToCancel) return
    try {
      await cancelInvitation({ invitationId: invitationToCancel.id })
      toast.success(`Invitación a ${invitationToCancel.email} cancelada`)
      setInvitationToCancel(null)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleDeleteOrganization = async () => {
    if (deleteConfirmation !== details?.name) return
    setIsDeleting(true)
    try {
      const result = await deleteOrganization({
        organizationId,
        confirmDelete: true,
      })
      const deletedRecordsCount = Object.values(
        result.deletionStats as Record<string, number>
      ).reduce((sum, count) => sum + count, 0)
      toast.success(
        `Organización eliminada. Se eliminaron ${deletedRecordsCount} registros.`
      )
      router.push("/admin/organizations")
    } catch (error) {
      toast.error(handleConvexError(error))
      setIsDeleting(false)
    }
  }

  if (!details) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {details.logo ? (
          <Image
            src={details.logo}
            alt={details.name ?? "Organization logo"}
            width={48}
            height={48}
            className="rounded-lg object-cover"
            unoptimized
          />
        ) : null}
        <div className="flex-1">
          <h1 className="font-bold text-3xl tracking-tight">
            {details.name ?? organizationId}
          </h1>
          <p className="text-muted-foreground">
            Detalles y configuración de la organización
          </p>
        </div>
        {isSuperAdmin && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar Organización
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Miembros</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {details.stats.membersCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Conversaciones
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {details.stats.conversationsCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Pedidos</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {details.stats.ordersCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Contactos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {details.stats.contactsCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Ubicaciones</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {details.stats.locationsCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as OrganizationDetailsTab)
          const params = new URLSearchParams(searchParams.toString())
          params.set("tab", value)
          router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        }}
        className="space-y-4"
      >
        <TabsList
          className={cn(
            "grid w-full",
            isSuperAdmin && isPlatformAdmin
              ? "grid-cols-9"
              : isPlatformAdmin
                ? "grid-cols-8"
                : isSuperAdmin
                  ? "grid-cols-8"
                  : "grid-cols-7"
          )}
        >
          <TabsTrigger value="overview">General</TabsTrigger>
          <TabsTrigger value="members">Miembros</TabsTrigger>
          <TabsTrigger value="permissions">Permisos</TabsTrigger>
          <TabsTrigger value="locations">Ubicaciones</TabsTrigger>
          {isPlatformAdmin ? (
            <TabsTrigger value="costs">Costos IA</TabsTrigger>
          ) : null}
          <TabsTrigger value="customization">IA</TabsTrigger>
          <TabsTrigger value="prompt-builder">Prompts</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          {isSuperAdmin ? <TabsTrigger value="debug">Debug</TabsTrigger> : null}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Información General</CardTitle>
              <CardDescription>
                Resumen de la actividad de la organización
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      ID Organización:
                    </span>
                    <span className="font-mono text-sm">{organizationId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Total Contactos:
                    </span>
                    <span>{details.stats.contactsCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Config. WhatsApp:
                    </span>
                    <Badge
                      variant={
                        details.whatsappConfig?.isActive
                          ? "default"
                          : "secondary"
                      }
                    >
                      {details.whatsappConfig?.isActive ? "Activa" : "Inactiva"}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Config. Agente IA:
                    </span>
                    <Badge
                      variant={details.agentConfig ? "default" : "secondary"}
                    >
                      {details.agentConfig ? "Configurado" : "Sin configurar"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Invitaciones Pendientes:
                    </span>
                    <span>{details.invitations?.length ?? 0}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-4">
          <MembersTab
            organizationId={organizationId}
            members={details.members ?? []}
            invitations={details.invitations ?? []}
            onRemoveMember={(id, name) => setMemberToRemove({ id, name })}
            onCancelInvitation={(id, email) =>
              setInvitationToCancel({ id, email })
            }
            onChangeRole={(member) => setMemberToChangeRole(member)}
          />
        </TabsContent>

        {/* Permissions Tab */}
        <TabsContent value="permissions" className="space-y-4">
          <OrgPermissionsTab organizationId={organizationId} />
        </TabsContent>

        {/* Locations Tab */}
        <TabsContent value="locations" className="space-y-4">
          <LocationsTab locations={details.locations} />
        </TabsContent>

        {/* AI Costs Tab */}
        {isPlatformAdmin ? (
          <TabsContent value="costs" className="space-y-4">
            {activeTab === "costs" ? (
              <OrganizationAiCostsTab organizationId={organizationId} />
            ) : null}
          </TabsContent>
        ) : null}

        {/* Customization Tab */}
        <TabsContent value="customization" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Personalización del Agente IA</CardTitle>
              <CardDescription>
                Configuración de voz de marca, modelos de IA y personalización
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={`/admin/organizations/${organizationId}/customization`}
              >
                <Button>
                  <Settings className="mr-2 h-4 w-4" />
                  Editar Personalización
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Prompt Builder Tab */}
        <TabsContent value="prompt-builder" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Constructor de Prompts</CardTitle>
              <CardDescription>
                Edición avanzada de las secciones principales del prompt del
                agente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={`/admin/organizations/${organizationId}/prompt-builder`}
              >
                <Button>
                  <Settings className="mr-2 h-4 w-4" />
                  Editar Prompts
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WhatsApp Tab */}
        <TabsContent value="whatsapp" className="space-y-4">
          <WhatsAppTab
            organizationId={organizationId}
            whatsappConfig={details.whatsappConfig}
          />
        </TabsContent>

        {/* Debug Agent Tab */}
        <TabsContent value="debug" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Agente de Debugging</CardTitle>
              <CardDescription>
                Analiza conversaciones fallidas y obtén sugerencias para mejorar
                los prompts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={`/admin/conversations/org/${organizationId}/agent`}>
                <Button>
                  <Bug className="mr-2 h-4 w-4" />
                  Abrir Debug Agent
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Remove Member Dialog */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={() => setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Miembro</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres remover a{" "}
              <strong>{memberToRemove?.name}</strong> de esta organización? Esta
              acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-red-600 hover:bg-red-700"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Invitation Dialog */}
      <AlertDialog
        open={!!invitationToCancel}
        onOpenChange={() => setInvitationToCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Invitación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres cancelar la invitación a{" "}
              <strong>{invitationToCancel?.email}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelInvitation}
              className="bg-red-600 hover:bg-red-700"
            >
              Cancelar Invitación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Member Role Dialog */}
      <MemberRoleDialog
        member={memberToChangeRole}
        open={!!memberToChangeRole}
        onOpenChange={(open) => !open && setMemberToChangeRole(null)}
      />

      {/* Delete Organization Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Eliminar Organización
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Esta acción es <strong>irreversible</strong>. Se eliminarán
                permanentemente:
              </p>
              <ul className="list-disc space-y-1 pl-4 text-sm">
                <li>Todas las conversaciones y mensajes</li>
                <li>Todos los pedidos y facturas electrónicas</li>
                <li>Todo el menú (categorías, productos, disponibilidad)</li>
                <li>Todas las promociones</li>
                <li>Todas las áreas de entrega y ubicaciones</li>
                <li>Todos los contactos</li>
                <li>Todas las campañas de mensajes</li>
                <li>Toda la configuración del agente IA</li>
                <li>Todos los miembros e invitaciones</li>
                <li>La organización misma</li>
              </ul>
              <p className="pt-2">
                Para confirmar, escribe el nombre de la organización:{" "}
                <strong>{details?.name}</strong>
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="delete-confirmation" className="sr-only">
              Nombre de la organización
            </Label>
            <Input
              id="delete-confirmation"
              placeholder="Escribe el nombre de la organización"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              disabled={isDeleting}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              onClick={() => setDeleteConfirmation("")}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOrganization}
              disabled={deleteConfirmation !== details?.name || isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Eliminando..." : "Eliminar Permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
