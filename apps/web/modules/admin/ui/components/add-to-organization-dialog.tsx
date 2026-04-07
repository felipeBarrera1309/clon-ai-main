"use client"

import { api } from "@workspace/backend/_generated/api"
import { Button } from "@workspace/ui/components/button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useMutation, useQuery } from "convex/react"
import { Building2, Search, UserPlus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useIsImplementor } from "@/hooks/use-platform-admin"
import { handleConvexError } from "@/lib/error-handling"
import { getRolesArray, type OrganizationRole } from "@/lib/rbac"

interface AddToOrganizationDialogProps {
  user: {
    _id: string
    name: string
    email: string
  } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Organization {
  organizationId: string
  name?: string
  slug?: string
  logo?: string | null
  existsInBetterAuth: boolean
  conversationsCount: number
  contactsCount: number
  ordersCount: number
  menuProductsCount: number
  locationsCount: number
  deliveryAreasCount: number
  agentConfigId?: string
  whatsappConfigId?: string
}

export function AddToOrganizationDialog({
  user,
  open,
  onOpenChange,
}: AddToOrganizationDialogProps) {
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [selectedRole, setSelectedRole] = useState<OrganizationRole>("cashier")
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const isImplementor = useIsImplementor()

  const roles = getRolesArray()

  // Fetch organizations based on user role
  const adminOrgsResult = useQuery(
    api.superAdmin.organizations.listAllOrganizations,
    isImplementor === false ? { limit: 100 } : "skip"
  )

  const implementorOrgsResult = useQuery(
    api.superAdmin.organizations.listImplementorOrganizations,
    isImplementor === true ? { limit: 100 } : "skip"
  )

  const organizationsResult =
    isImplementor === true ? implementorOrgsResult : adminOrgsResult

  const organizations = organizationsResult?.organizations

  const addUserToOrganization = useMutation(
    api.superAdmin.users.addUserToOrganization
  )

  // Filter organizations based on search
  const filteredOrgs = organizations?.filter((org) => {
    // Also use the specialized search query logic if needed,
    // but the API already supports search. Here we filter the *loaded* set.
    // For a simple dialog, client-side filtering 100 items is fine.
    const searchLower = searchQuery.toLowerCase()

    // Safety check for properties
    const orgId = org.organizationId || ""
    const name = org.name || ""
    const slug = org.slug || ""

    return (
      orgId.toLowerCase().includes(searchLower) ||
      name.toLowerCase().includes(searchLower) ||
      slug.toLowerCase().includes(searchLower)
    )
  })

  const handleAdd = async () => {
    if (!user || !selectedOrgId) return

    setIsLoading(true)
    try {
      await addUserToOrganization({
        userId: user._id,
        organizationId: selectedOrgId,
        role: selectedRole,
      })

      toast.success(`${user.name} ha sido agregado a ${selectedOrgId}`)
      onOpenChange(false)
      // Reset form
      setSelectedOrgId("")
      setSelectedRole("cashier")
      setSearchQuery("")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Agregar a Organización
          </DialogTitle>
          <DialogDescription>
            Agregar a <strong>{user?.name}</strong> ({user?.email}) a una
            organización existente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search Organizations */}
          <div className="space-y-2">
            <Label>Buscar Organización</Label>
            <div className="relative">
              <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por ID, nombre o slug..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Organization Selection */}
          <div className="space-y-2">
            <Label>Organización</Label>
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una organización" />
              </SelectTrigger>
              <SelectContent>
                {filteredOrgs && filteredOrgs.length > 0 ? (
                  filteredOrgs.map((org: Organization) => (
                    <SelectItem
                      key={org.organizationId}
                      value={org.organizationId}
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="font-medium">
                            {org.name || org.organizationId}
                          </span>
                          {org.name && (
                            <span className="ml-2 text-muted-foreground text-xs">
                              {org.slug || org.organizationId}
                            </span>
                          )}
                          {!org.name && (
                            <span className="ml-2 text-muted-foreground text-xs">
                              {org.locationsCount} ubicaciones
                            </span>
                          )}
                        </div>
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-2 text-center text-muted-foreground text-sm">
                    {searchQuery
                      ? "No se encontraron organizaciones"
                      : "Cargando organizaciones..."}
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Role Selection */}
          <div className="space-y-2">
            <Label>Rol en la Organización</Label>
            <Select
              value={selectedRole}
              onValueChange={(value) =>
                setSelectedRole(value as OrganizationRole)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    <div>
                      <div className="font-medium">{role.labelEs}</div>
                      <div className="text-muted-foreground text-xs">
                        {role.descriptionEs}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button onClick={handleAdd} disabled={isLoading || !selectedOrgId}>
            {isLoading ? "Agregando..." : "Agregar a Organización"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
