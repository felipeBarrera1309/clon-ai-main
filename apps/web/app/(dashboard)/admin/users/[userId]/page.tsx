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
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useMutation, useQuery } from "convex/react"
import { format, formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import {
  ArrowLeft,
  Ban,
  Building2,
  Calendar,
  CheckCircle,
  Clock,
  Globe,
  KeyRound,
  LogOut,
  Mail,
  Monitor,
  Plus,
  Shield,
  Trash2,
  User,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import {
  useIsImplementor,
  usePlatformAdmin,
  usePlatformSuperAdmin,
} from "@/hooks/use-platform-admin"
import { handleConvexError } from "@/lib/error-handling"
import { type OrganizationRole, ROLE_METADATA } from "@/lib/rbac"
import { AddToOrganizationDialog } from "@/modules/admin/ui/components/add-to-organization-dialog"
import { BanUserDialog } from "@/modules/admin/ui/components/ban-user-dialog"
import { ChangePasswordDialog } from "@/modules/admin/ui/components/change-password-dialog"
import { RoleChangeDialog } from "@/modules/admin/ui/components/role-change-dialog"
import type { PlatformRole } from "@/modules/admin/ui/utils/role-badge"
import { RoleBadge } from "@/modules/admin/ui/utils/role-badge"

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.userId as string

  const [banDialogOpen, setBanDialogOpen] = useState(false)
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [addToOrgDialogOpen, setAddToOrgDialogOpen] = useState(false)
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] =
    useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [orgToRemove, setOrgToRemove] = useState<{
    memberId: string
    name: string
  } | null>(null)

  // Fetch user details
  const isSuperAdmin = usePlatformSuperAdmin()
  const isImplementor = useIsImplementor()
  const isPlatformAdmin = usePlatformAdmin()

  const userDetails = useQuery(api.superAdmin.users.getUserDetails, { userId })

  const setUserBanStatus = useMutation(api.superAdmin.users.setUserBanStatus)
  const deleteUserSessions = useMutation(
    api.superAdmin.users.deleteUserSessions
  )
  const deleteSession = useMutation(api.superAdmin.users.deleteSession)
  const removeFromOrg = useMutation(
    api.superAdmin.users.removeUserFromOrganization
  )
  const deleteUser = useMutation(api.superAdmin.users.deleteUser)

  const handleUnban = async () => {
    if (!userDetails?.user) return
    try {
      await setUserBanStatus({ userId: userDetails.user._id, banned: false })
      toast.success(`${userDetails.user.name} ha sido desbloqueado`)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleForceLogout = async () => {
    if (!userDetails?.user) return
    try {
      const result = await deleteUserSessions({ userId: userDetails.user._id })
      toast.success(`Se cerraron ${result.deletedCount} sesiones`)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession({ sessionId })
      toast.success("Sesión cerrada")
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleRemoveFromOrg = async () => {
    if (!orgToRemove) return
    try {
      await removeFromOrg({ memberId: orgToRemove.memberId })
      toast.success(`Removido de ${orgToRemove.name}`)
      setOrgToRemove(null)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleDeleteUser = async () => {
    if (!userDetails?.user) return
    try {
      const result = await deleteUser({ userId: userDetails.user._id })
      toast.success(
        `Usuario eliminado (${result.deletedSessions} sesiones, ${result.deletedMemberships} membresías eliminadas)`
      )
      router.back()
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  if (userDetails === undefined) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  if (!userDetails?.user) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 font-semibold text-xl">Usuario no encontrado</h2>
        <p className="mt-2 text-muted-foreground">
          El usuario que buscas no existe o ha sido eliminado.
        </p>
        <Button asChild className="mt-4">
          <Link href="/admin/users">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a usuarios
          </Link>
        </Button>
      </div>
    )
  }

  const user = userDetails.user

  // Create a user object compatible with the dialogs
  const userForDialogs = {
    _id: user._id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    banned: user.banned,
    banReason: user.banReason,
    banExpires: user.banExpires,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    organizationCount: userDetails.organizations.length,
  }

  // Determine if the current user can modify the target user's role or password
  // Superadmins can modify everyone. Admins and implementors cannot modify users of equal or higher rank.
  const targetRole = user.role || "user"
  const canModifyRoleOrPassword =
    isSuperAdmin === true ||
    (isPlatformAdmin === true && targetRole === "user") ||
    (isImplementor === true && targetRole === "user")

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/admin/users">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.image ?? undefined} alt={user.name} />
              <AvatarFallback className="bg-primary/10 text-2xl">
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="font-bold text-2xl">{user.name}</h1>
              <p className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" />
                {user.email}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <RoleBadge role={user.role as PlatformRole} />
                {user.banned ? (
                  <Badge variant="destructive">
                    <Ban className="mr-1 h-3 w-3" />
                    Bloqueado
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-green-500 text-green-600"
                  >
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Activo
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Ban Info */}
        {user.banned && (
          <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-red-800 dark:text-red-200">
                <Ban className="h-5 w-5" />
                Información del Bloqueo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {user.banReason && (
                <p className="text-red-700 text-sm dark:text-red-300">
                  <strong>Razón:</strong> {user.banReason}
                </p>
              )}
              {user.banExpires && (
                <p className="text-red-700 text-sm dark:text-red-300">
                  <strong>Expira:</strong>{" "}
                  {format(new Date(user.banExpires), "PPP 'a las' p", {
                    locale: es,
                  })}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-2 border-red-300 text-red-700 hover:bg-red-100"
                onClick={handleUnban}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Desbloquear Usuario
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Acciones Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {canModifyRoleOrPassword && isImplementor === false && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRoleDialogOpen(true)}
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Cambiar Rol
                </Button>
              )}
              {canModifyRoleOrPassword && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChangePasswordDialogOpen(true)}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Cambiar Contraseña
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddToOrgDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Agregar a Organización
              </Button>
              <Button variant="outline" size="sm" onClick={handleForceLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar Todas las Sesiones
              </Button>
              {!user.banned && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setBanDialogOpen(true)}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Bloquear Usuario
                </Button>
              )}
              {isSuperAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar Usuario
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Account Info */}
          <Card>
            <CardHeader>
              <CardTitle>Información de la Cuenta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Calendar className="h-4 w-4" />
                  Fecha de registro
                </span>
                <span className="text-sm">
                  {format(new Date(user.createdAt), "PPP", { locale: es })}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Clock className="h-4 w-4" />
                  Última actualización
                </span>
                <span className="text-sm">
                  {formatDistanceToNow(new Date(user.updatedAt), {
                    addSuffix: true,
                    locale: es,
                  })}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Active Sessions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Monitor className="h-5 w-5" />
                  Sesiones Activas ({userDetails.sessions.length})
                </CardTitle>
                {userDetails.sessions.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={handleForceLogout}
                  >
                    Cerrar todas
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {userDetails.sessions.length > 0 ? (
                <div className="space-y-3">
                  {userDetails.sessions.map((session) => (
                    <div
                      key={session._id}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Globe className="h-3 w-3" />
                          {session.ipAddress || "IP desconocida"}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs">
                            Expira:{" "}
                            {formatDistanceToNow(new Date(session.expiresAt), {
                              addSuffix: true,
                              locale: es,
                            })}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => handleDeleteSession(session._id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {session.userAgent && (
                        <p className="mt-1 truncate text-muted-foreground text-xs">
                          {session.userAgent}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No hay sesiones activas
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Organizations */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Organizaciones ({userDetails.organizations.length})
                </CardTitle>
                <CardDescription>
                  Organizaciones a las que pertenece este usuario
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddToOrgDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Agregar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {userDetails.organizations.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {userDetails.organizations.map((org) => (
                  <div
                    key={org._id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div>
                      <div className="font-medium">{org.name}</div>
                      <div className="text-muted-foreground text-xs">
                        @{org.slug}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {ROLE_METADATA[org.role as OrganizationRole]?.labelEs ??
                          org.role}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() =>
                          setOrgToRemove({
                            memberId: org.memberId,
                            name: org.name,
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-muted-foreground text-sm">
                  Este usuario no pertenece a ninguna organización
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setAddToOrgDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar a Organización
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <BanUserDialog
        user={userForDialogs}
        open={banDialogOpen}
        onOpenChange={setBanDialogOpen}
      />
      <RoleChangeDialog
        user={userForDialogs}
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
      />
      <ChangePasswordDialog
        user={userForDialogs}
        open={changePasswordDialogOpen}
        onOpenChange={setChangePasswordDialogOpen}
      />
      <AddToOrganizationDialog
        user={userForDialogs}
        open={addToOrgDialogOpen}
        onOpenChange={setAddToOrgDialogOpen}
      />

      {/* Remove from Organization Confirmation */}
      <AlertDialog
        open={!!orgToRemove}
        onOpenChange={() => setOrgToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover de Organización</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres remover a{" "}
              <strong>{user.name}</strong> de{" "}
              <strong>{orgToRemove?.name}</strong>? Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveFromOrg}
              className="bg-red-600 hover:bg-red-700"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700">
              ⚠️ Eliminar Usuario Permanentemente
            </AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar a{" "}
              <strong>{userDetails?.user?.name}</strong> de forma permanente.
              Esta acción eliminará todas sus sesiones, cuentas vinculadas y
              membresías de organizaciones.
              <br />
              <br />
              <strong className="text-red-600">
                Esta acción es irreversible.
              </strong>{" "}
              Si el usuario es el único propietario de alguna organización, la
              eliminación será bloqueada automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-red-700 hover:bg-red-800"
            >
              Eliminar Usuario
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
