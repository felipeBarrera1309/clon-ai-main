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
import { RotateCcw, Save } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { handleConvexError } from "@/lib/error-handling"

interface OrgPermissionsTabProps {
  organizationId: string
}

type RolePermissions = {
  owner: string[]
  admin: string[]
  manager: string[]
  cashier: string[]
  kitchen: string[]
  viewer: string[]
}

export function OrgPermissionsTab({ organizationId }: OrgPermissionsTabProps) {
  const permissions = useQuery(
    api.superAdmin.organizations.getOrganizationPermissions,
    { organizationId }
  )

  const updateRolePermissions = useMutation(
    api.superAdmin.organizations.updateOrganizationRolePermissions
  )
  const resetPermissions = useMutation(
    api.superAdmin.organizations.resetOrganizationPermissions
  )

  const [rolePages, setRolePages] = useState<RolePermissions>({
    owner: [],
    admin: [],
    manager: [],
    cashier: [],
    kitchen: [],
    viewer: [],
  })
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState("owner")

  // Initialize state when permissions load
  useEffect(() => {
    if (permissions) {
      setRolePages({
        owner:
          permissions.permissions?.ownerAllowedPages ??
          permissions.defaults.owner,
        admin:
          permissions.permissions?.adminAllowedPages ??
          permissions.defaults.admin,
        manager:
          permissions.permissions?.managerAllowedPages ??
          permissions.defaults.manager,
        cashier:
          permissions.permissions?.cashierAllowedPages ??
          permissions.defaults.cashier,
        kitchen:
          permissions.permissions?.kitchenAllowedPages ??
          permissions.defaults.kitchen,
        viewer:
          permissions.permissions?.viewerAllowedPages ??
          permissions.defaults.viewer,
      })
    }
  }, [permissions])

  const handleSaveRole = async (role: keyof RolePermissions) => {
    setIsSaving(true)
    try {
      await updateRolePermissions({
        organizationId,
        role,
        allowedPages: rolePages[role],
      })
      toast.success(`Permisos de ${getRoleLabel(role)} actualizados`)
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    setIsSaving(true)
    try {
      await resetPermissions({ organizationId })
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

  const getRoleLabel = (role: string): string => {
    const roleData = permissions?.roles?.find((r) => r.value === role)
    return roleData?.labelEs ?? role
  }

  const canHaveAdminTeamPages = (role: string): boolean => {
    return role === "owner"
  }

  if (!permissions) {
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

  const isCustomized = !!permissions.permissions
  const adminTeamOnlySet = new Set<string>(permissions.adminTeamOnlyPages)
  const roles = permissions.roles ?? []

  const pageLabels: Record<string, string> = {
    "/": "Dashboard",
    "/conversations": "Conversaciones",
    "/quick-responses": "Respuestas rápidas",
    "/contacts": "Contactos",
    "/orders": "Pedidos",
    "/menu": "Menú",
    "/bulk-messaging": "Mensajes masivos",
    "/delivery-areas": "Zonas de entrega",
    "/restaurant-locations": "Ubicaciones",
    "/settings": "Configuración",
    "/customization": "Personalización IA",
    "/prompt-builder": "Constructor de prompts",
    "/whatsapp": "WhatsApp",
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Permisos de Páginas</CardTitle>
              <CardDescription>
                Configura qué páginas pueden ver los usuarios según su rol en
                esta organización
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
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 grid w-full grid-cols-6">
              {roles.map((role) => (
                <TabsTrigger key={role.value} value={role.value}>
                  {role.labelEs}
                </TabsTrigger>
              ))}
            </TabsList>

            {roles.map((role) => (
              <TabsContent key={role.value} value={role.value}>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{role.labelEs}</h3>
                      <p className="text-muted-foreground text-sm">
                        {role.descriptionEs}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        handleSaveRole(role.value as keyof RolePermissions)
                      }
                      disabled={isSaving}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Guardar {role.labelEs}
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {permissions.availablePages.map((page) => {
                      const isAdminTeamOnly = adminTeamOnlySet.has(page)
                      const canAccess =
                        canHaveAdminTeamPages(role.value) || !isAdminTeamOnly
                      const isChecked =
                        rolePages[
                          role.value as keyof RolePermissions
                        ]?.includes(page)

                      return (
                        <div
                          key={page}
                          className={`flex items-center space-x-2 ${
                            !canAccess ? "opacity-50" : ""
                          }`}
                        >
                          <Checkbox
                            id={`${role.value}-${page}`}
                            checked={isChecked}
                            onCheckedChange={() =>
                              canAccess &&
                              togglePage(
                                role.value as keyof RolePermissions,
                                page
                              )
                            }
                            disabled={!canAccess}
                          />
                          <Label
                            htmlFor={`${role.value}-${page}`}
                            className={`cursor-pointer text-sm ${
                              !canAccess ? "cursor-not-allowed" : ""
                            }`}
                          >
                            {pageLabels[page] || page}
                            {isAdminTeamOnly && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                Admin Team
                              </Badge>
                            )}
                          </Label>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          {/* Admin Team Only Pages Info */}
          {permissions.adminTeamOnlyPages.length > 0 && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <h4 className="font-medium text-amber-800 dark:text-amber-200">
                Páginas exclusivas de Admin Team
              </h4>
              <p className="mt-1 text-amber-700 text-sm dark:text-amber-300">
                Estas páginas solo pueden ser asignadas al rol Propietario
                (owner):
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {permissions.adminTeamOnlyPages.map((page) => (
                  <Badge key={page} variant="outline">
                    {pageLabels[page] || page}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
