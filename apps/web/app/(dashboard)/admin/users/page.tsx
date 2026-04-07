"use client"

import { api } from "@workspace/backend/_generated/api"
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
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import type { Column } from "@workspace/ui/components/data-table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { DataViewerLayout } from "@workspace/ui/layout/data-viewer-layout"
import { useMutation, useQuery } from "convex/react"
import { format, formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import {
  Ban,
  Building2,
  CheckCircle,
  LogOut,
  MoreHorizontal,
  Plus,
  Shield,
  UserCog,
  Users,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
import { useIsImplementor } from "@/hooks/use-platform-admin"
import { handleConvexError } from "@/lib/error-handling"
import { BanUserDialog } from "@/modules/admin/ui/components/ban-user-dialog"
import { CreateUserDialog } from "@/modules/admin/ui/components/create-user-dialog"
import { RoleChangeDialog } from "@/modules/admin/ui/components/role-change-dialog"
import type { PlatformRole } from "@/modules/admin/ui/utils/role-badge"
import { RoleBadge } from "@/modules/admin/ui/utils/role-badge"

type AdminUser = {
  _id: string
  name: string
  email: string
  image?: string | null
  role?: string | null
  banned?: boolean | null
  banReason?: string | null
  banExpires?: number | null
  createdAt: number
  updatedAt: number
  organizationCount: number
}

type StatusFilter = "all" | "active" | "banned"
type RoleFilter = "all" | "superadmin" | "admin" | "implementor" | "user"

export default function UsersPage() {
  const router = useRouter()

  // Pagination state
  const [pageSize, setPageSize] = useState(25)
  const [cursor, setCursor] = useState<string | null>(null)
  const [prevCursors, setPrevCursors] = useState<string[]>([])

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")

  // Search state
  const {
    value: searchValue,
    debouncedValue: searchQuery,
    setValue: setSearchValue,
  } = useDebouncedSearch("", 300)

  // View mode state
  const [viewMode, setViewMode] = useState<"table" | "cards">("table")
  const isMobile = useIsMobile()

  useEffect(() => {
    setViewMode(isMobile ? "cards" : "table")
  }, [isMobile])

  // Dialog states
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [banDialogOpen, setBanDialogOpen] = useState(false)
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false)

  // Mutations
  const setUserBanStatus = useMutation(api.superAdmin.users.setUserBanStatus)
  const updateUserRole = useMutation(api.superAdmin.users.updateUserRole)
  const deleteUserSessions = useMutation(
    api.superAdmin.users.deleteUserSessions
  )

  const isImplementor = useIsImplementor()

  // Offset state for implementor pagination (cursor-based not available)
  const [implOffset, setImplOffset] = useState(0)
  const [implPrevOffsets, setImplPrevOffsets] = useState<number[]>([])

  // Admin query — cursor based
  const adminUsersData = useQuery(
    api.superAdmin.users.listUsersPage,
    isImplementor === false
      ? {
          limit: pageSize,
          cursor: cursor ?? undefined,
          search: searchQuery || undefined,
          status: statusFilter === "all" ? undefined : statusFilter,
          role:
            roleFilter === "all"
              ? undefined
              : (roleFilter as typeof roleFilter extends "all"
                  ? never
                  : typeof roleFilter),
        }
      : "skip"
  )

  // Implementor query — offset based
  const implUsersData = useQuery(
    api.superAdmin.users.listImplementorUsers,
    isImplementor === true
      ? {
          limit: pageSize,
          offset: implOffset,
          search: searchQuery || undefined,
          role:
            roleFilter === "all"
              ? undefined
              : (roleFilter as typeof roleFilter extends "all"
                  ? never
                  : typeof roleFilter),
          banned:
            statusFilter === "all" ? undefined : statusFilter === "banned",
        }
      : "skip"
  )

  const users =
    isImplementor === true
      ? (implUsersData?.users ?? [])
      : (adminUsersData?.users ?? [])

  // Cursor-based pagination info (for admins)
  const continueCursor = adminUsersData?.continueCursor ?? null
  const isDone = adminUsersData?.isDone ?? false

  // Offset pagination info (for implementors)
  const implTotal = implUsersData?.total ?? 0
  const implHasMore = implUsersData?.hasMore ?? false

  // Pagination handlers — cursor based (admin) / offset based (implementor)
  const handleNext = () => {
    if (isImplementor === true) {
      if (implHasMore) {
        setImplPrevOffsets((prev) => [...prev, implOffset])
        setImplOffset((prev) => prev + pageSize)
      }
    } else {
      if (continueCursor) {
        setPrevCursors((prev) => [...prev, cursor ?? ""])
        setCursor(continueCursor)
      }
    }
  }

  const handlePrev = () => {
    if (isImplementor === true) {
      if (implPrevOffsets.length > 0) {
        const next = [...implPrevOffsets]
        const prev = next.pop() ?? 0
        setImplPrevOffsets(next)
        setImplOffset(prev)
      }
    } else {
      if (prevCursors.length > 0) {
        const newPrevCursors = [...prevCursors]
        const previousCursor = newPrevCursors.pop() ?? null
        setPrevCursors(newPrevCursors)
        setCursor(previousCursor || null)
      }
    }
  }

  const resetPagination = useCallback(() => {
    setCursor(null)
    setPrevCursors([])
    setImplOffset(0)
    setImplPrevOffsets([])
  }, [])

  // Reset pagination when filters change
  // biome-ignore lint/correctness/useExhaustiveDependencies: We want to reset pagination when filters change
  useEffect(() => {
    resetPagination()
  }, [searchQuery, statusFilter, roleFilter, resetPagination])

  // Action handlers
  const handleViewDetails = (user: AdminUser) => {
    router.push(`/admin/users/${user._id}`)
  }

  const handleBanUser = (user: AdminUser) => {
    setSelectedUser(user)
    setBanDialogOpen(true)
  }

  const handleChangeRole = (user: AdminUser) => {
    setSelectedUser(user)
    setRoleDialogOpen(true)
  }

  const handleForceLogout = async (user: AdminUser) => {
    try {
      const result = await deleteUserSessions({ userId: user._id })
      toast.success(
        `Se cerraron ${result.deletedCount} sesiones de ${user.name}`
      )
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleQuickUnban = async (user: AdminUser) => {
    try {
      await setUserBanStatus({ userId: user._id, banned: false })
      toast.success(`${user.name} ha sido desbloqueado`)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  // Define columns
  const columns: Column<AdminUser>[] = [
    {
      key: "user",
      header: "Usuario",
      render: (user) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.image ?? undefined} alt={user.name} />
            <AvatarFallback className="bg-primary/10">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{user.name}</div>
            <div className="text-muted-foreground text-sm">{user.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Rol",
      render: (user) => <RoleBadge role={user.role as PlatformRole} />,
    },
    {
      key: "status",
      header: "Estado",
      render: (user) =>
        user.banned ? (
          <Badge variant="destructive">
            <Ban className="mr-1 h-3 w-3" />
            Bloqueado
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-green-500 text-green-600 dark:text-green-400"
          >
            <CheckCircle className="mr-1 h-3 w-3" />
            Activo
          </Badge>
        ),
    },
    {
      key: "organizations",
      header: "Organizaciones",
      render: (user) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span>{user.organizationCount}</span>
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Registro",
      render: (user) => (
        <div className="text-muted-foreground text-sm">
          <div>
            {format(new Date(user.createdAt), "dd/MM/yyyy", { locale: es })}
          </div>
          <div className="text-xs">
            {formatDistanceToNow(new Date(user.createdAt), {
              addSuffix: true,
              locale: es,
            })}
          </div>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (user) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Abrir menú</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewDetails(user)}>
              <UserCog className="mr-2 h-4 w-4" />
              Ver detalles
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isImplementor === false && (
              <DropdownMenuItem onClick={() => handleChangeRole(user)}>
                <Shield className="mr-2 h-4 w-4" />
                Cambiar rol
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => handleForceLogout(user)}>
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesiones
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {user.banned ? (
              <DropdownMenuItem
                onClick={() => handleQuickUnban(user)}
                className="text-green-600"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Desbloquear
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => handleBanUser(user)}
                className="text-red-600"
              >
                <Ban className="mr-2 h-4 w-4" />
                Bloquear usuario
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  // Render card function
  const renderCard = (user: AdminUser) => (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={user.image ?? undefined} alt={user.name} />
              <AvatarFallback className="bg-primary/10 text-lg">
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{user.name}</CardTitle>
              <p className="text-muted-foreground text-sm">{user.email}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleViewDetails(user)}>
                <UserCog className="mr-2 h-4 w-4" />
                Ver detalles
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isImplementor === false && (
                <DropdownMenuItem onClick={() => handleChangeRole(user)}>
                  <Shield className="mr-2 h-4 w-4" />
                  Cambiar rol
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleForceLogout(user)}>
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar sesiones
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {user.banned ? (
                <DropdownMenuItem
                  onClick={() => handleQuickUnban(user)}
                  className="text-green-600"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Desbloquear
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => handleBanUser(user)}
                  className="text-red-600"
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Bloquear usuario
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Rol</p>
            <RoleBadge role={user.role as PlatformRole} />
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Estado</p>
            {user.banned ? (
              <Badge variant="destructive">Bloqueado</Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-green-500 text-green-600"
              >
                Activo
              </Badge>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Organizaciones</p>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{user.organizationCount}</span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Registro</p>
            <span className="text-sm">
              {formatDistanceToNow(new Date(user.createdAt), {
                addSuffix: true,
                locale: es,
              })}
            </span>
          </div>
        </div>
        {user.banned && user.banReason && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 dark:bg-red-950">
            <p className="text-red-800 text-xs dark:text-red-200">
              <strong>Razón del bloqueo:</strong> {user.banReason}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )

  // Filter components
  const filters = (
    <>
      <Select
        value={statusFilter}
        onValueChange={(value) => setStatusFilter(value as StatusFilter)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="active">Activos</SelectItem>
          <SelectItem value="banned">Bloqueados</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={roleFilter}
        onValueChange={(value) => setRoleFilter(value as RoleFilter)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Rol" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="superadmin">Super Admin</SelectItem>
          <SelectItem value="admin">Administradores</SelectItem>
          <SelectItem value="implementor">Implementadores</SelectItem>
          <SelectItem value="user">Usuarios</SelectItem>
        </SelectContent>
      </Select>
    </>
  )

  if (isImplementor === undefined) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">
            {isImplementor ? "Mis Usuarios" : "Usuarios"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {isImplementor
              ? "Usuarios en tus organizaciones"
              : "Gestiona usuarios, roles y permisos del sistema"}
          </p>
        </div>
        <Button onClick={() => setCreateUserDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Crear Usuario
        </Button>
      </div>

      <DataViewerLayout
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchProps={{
          value: searchValue,
          onChange: setSearchValue,
          placeholder: "Buscar por nombre o email...",
        }}
        filters={filters}
        data={users}
        tableColumns={columns}
        renderCard={renderCard}
        paginationProps={{
          state: {
            pageSize,
            cursor: isImplementor ? implOffset.toString() : cursor,
            prevCursors: isImplementor
              ? implPrevOffsets.map(String)
              : prevCursors,
          },
          actions: {
            setPageSize: (size) => {
              setPageSize(size)
              resetPagination()
            },
            handleNext,
            handlePrev,
            resetPagination,
          },
          info: {
            isDone: isImplementor ? !implHasMore : isDone,
            continueCursor: isImplementor
              ? implHasMore
                ? (implOffset + pageSize).toString()
                : null
              : continueCursor,
            totalItems: isImplementor ? implTotal : undefined,
          },
          pageSizeOptions: [10, 25, 50, 100],
        }}
        loading={
          isImplementor
            ? implUsersData === undefined
            : adminUsersData === undefined
        }
        emptyState={{
          icon: <Users className="h-12 w-12" />,
          title: searchQuery ? "No se encontraron usuarios" : "No hay usuarios",
          description: searchQuery
            ? `No hay usuarios que coincidan con "${searchQuery}"`
            : "Los usuarios aparecerán aquí cuando se registren",
        }}
        itemName={{ singular: "usuario", plural: "usuarios" }}
      />

      {/* Ban User Dialog */}
      <BanUserDialog
        user={selectedUser}
        open={banDialogOpen}
        onOpenChange={setBanDialogOpen}
      />

      {/* Role Change Dialog */}
      <RoleChangeDialog
        user={selectedUser}
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
      />

      {/* Create User Dialog */}
      <CreateUserDialog
        open={createUserDialogOpen}
        onOpenChange={setCreateUserDialogOpen}
      />
    </div>
  )
}
