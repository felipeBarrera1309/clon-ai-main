"use client"

import { api } from "@workspace/backend/_generated/api"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { useMutation, useQuery } from "convex/react"
import { AlertCircle, RotateCcw, Save, ShieldIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { getConfigurablePages } from "@/hooks/use-permissions"
import { authClient } from "@/lib/auth-client"
import { handleConvexError } from "@/lib/error-handling"
import { type OrganizationRole, ROLE_METADATA } from "@/lib/rbac"

type RolePermissions = {
  admin: string[]
  manager: string[]
  cashier: string[]
  kitchen: string[]
  viewer: string[]
}

// Roles that org owners can configure (excludes owner itself)
const CONFIGURABLE_ROLES: OrganizationRole[] = [
  "admin",
  "manager",
  "cashier",
  "kitchen",
  "viewer",
]

export function MemberPermissionsSettings() {
  const session = authClient.useSession()
  const organizations = useQuery(api.auth.getUserOrganizations)
  const permissions = useQuery(
    api.private.organizationPermissions.getPermissions
  )
  const updateRolePermissions = useMutation(
    api.private.organizationPermissions.updateRolePermissions
  )
  const resetPermissions = useMutation(
    api.private.organizationPermissions.resetToDefaults
  )

  const [rolePages, setRolePages] = useState<RolePermissions>({
    admin: [],
    manager: [],
    cashier: [],
    kitchen: [],
    viewer: [],
  })
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<OrganizationRole>("admin")

  // Get the user's role in the active organization
  const activeOrgId = session.data?.session?.activeOrganizationId
  const activeOrg = organizations?.find((org) => org._id === activeOrgId)
  const isOwner = activeOrg?.role === "owner"

  // Default permissions for each role
  const defaultPages: RolePermissions = {
    admin: [
      "/",
      "/conversations",
      "/quick-responses",
      "/contacts",
      "/orders",
      "/menu",
      "/bulk-messaging",
      "/delivery-areas",
      "/restaurant-locations",
      "/settings",
    ],
    manager: [
      "/",
      "/conversations",
      "/quick-responses",
      "/contacts",
      "/orders",
      "/menu",
      "/delivery-areas",
      "/restaurant-locations",
    ],
    cashier: ["/conversations", "/quick-responses", "/contacts", "/orders"],
    kitchen: ["/orders"],
    viewer: ["/", "/orders"],
  }

  // Initialize state when permissions load
  useEffect(() => {
    if (permissions !== undefined) {
      setRolePages({
        admin: permissions?.adminAllowedPages ?? defaultPages.admin,
        manager: permissions?.managerAllowedPages ?? defaultPages.manager,
        cashier: permissions?.cashierAllowedPages ?? defaultPages.cashier,
        kitchen: permissions?.kitchenAllowedPages ?? defaultPages.kitchen,
        viewer: permissions?.viewerAllowedPages ?? defaultPages.viewer,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissions])

  const handleSaveRole = async (role: keyof RolePermissions) => {
    setIsSaving(true)
    try {
      await updateRolePermissions({
        role,
        allowedPages: rolePages[role],
      })
      toast.success(
        `Permisos de ${ROLE_METADATA[role as OrganizationRole].labelEs} actualizados`
      )
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    setIsSaving(true)
    try {
      await resetPermissions({})
      toast.success("Permisos restablecidos a valores por defecto")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsSaving(false)
    }
  }

  const togglePage = (role: keyof RolePermissions, page: string) => {
    setRolePages((prev) => ({
      ...prev,
      [role]: prev[role].includes(page)
        ? prev[role].filter((p) => p !== page)
        : [...prev[role], page],
    }))
  }

  // Loading state
  if (permissions === undefined || organizations === undefined) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Not owner - show read-only view
  if (!isOwner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldIcon className="h-5 w-5" />
            Permisos por Rol
          </CardTitle>
          <CardDescription>
            Solo el propietario de la organización puede modificar los permisos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No tienes permisos para modificar la configuración de permisos.
              Contacta al propietario de la organización si necesitas cambios.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const isCustomized = !!permissions
  const configurablePages = getConfigurablePages()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldIcon className="h-5 w-5" />
              Permisos por Rol
            </CardTitle>
            <CardDescription>
              Configura qué páginas pueden ver los miembros de tu organización
              según su rol
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isCustomized && <Badge variant="secondary">Personalizado</Badge>}
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isSaving || !isCustomized}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restablecer todo
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as OrganizationRole)}
        >
          <TabsList className="mb-4 grid w-full grid-cols-5">
            {CONFIGURABLE_ROLES.map((role) => (
              <TabsTrigger key={role} value={role}>
                {ROLE_METADATA[role].labelEs}
              </TabsTrigger>
            ))}
          </TabsList>

          {CONFIGURABLE_ROLES.map((role) => (
            <TabsContent key={role} value={role}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {ROLE_METADATA[role].labelEs}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {ROLE_METADATA[role].descriptionEs}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() =>
                      handleSaveRole(role as keyof RolePermissions)
                    }
                    disabled={isSaving}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Guardar
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {configurablePages.map((page) => (
                    <div
                      key={page.path}
                      className="flex items-start space-x-3 rounded-lg border p-3"
                    >
                      <Checkbox
                        id={`${role}-${page.path}`}
                        checked={rolePages[
                          role as keyof RolePermissions
                        ]?.includes(page.path)}
                        onCheckedChange={() =>
                          togglePage(role as keyof RolePermissions, page.path)
                        }
                      />
                      <div className="space-y-1">
                        <Label
                          htmlFor={`${role}-${page.path}`}
                          className="cursor-pointer font-medium"
                        >
                          {page.label}
                        </Label>
                        <p className="text-muted-foreground text-xs">
                          {page.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {rolePages[role as keyof RolePermissions]?.length === 0 && (
                  <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800 dark:text-amber-200">
                      <strong>Advertencia:</strong> No has seleccionado ninguna
                      página. Los usuarios con este rol no podrán acceder a
                      ninguna sección del panel.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
          <h4 className="font-medium text-blue-800 dark:text-blue-200">
            Información sobre roles
          </h4>
          <ul className="mt-2 space-y-1 text-blue-700 text-sm dark:text-blue-300">
            <li>
              • <strong>Propietario:</strong> Acceso completo + gestión de
              permisos y configuración avanzada
            </li>
            <li>
              • <strong>Administrador:</strong> Acceso operacional completo,
              puede gestionar personal
            </li>
            <li>
              • <strong>Gerente:</strong> Operaciones diarias, menú, pedidos
            </li>
            <li>
              • <strong>Cajero:</strong> Gestión de pedidos y conversaciones
            </li>
            <li>
              • <strong>Cocina:</strong> Solo visualización de pedidos
            </li>
            <li>
              • <strong>Observador:</strong> Acceso de solo lectura
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
