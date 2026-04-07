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
import { Loader2, Search, UserPlus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useIsImplementor } from "@/hooks/use-platform-admin"
import { handleConvexError } from "@/lib/error-handling"
import { getRolesArray, type OrganizationRole } from "@/lib/rbac"

interface AddMemberToOrgDialogProps {
  organizationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddMemberToOrgDialog({
  organizationId,
  open,
  onOpenChange,
}: AddMemberToOrgDialogProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<OrganizationRole>("cashier")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isImplementor = useIsImplementor()

  const roles = getRolesArray()

  // Search users based on role
  const adminUsersData = useQuery(
    api.superAdmin.users.listUsers,
    isImplementor === false && searchQuery.length >= 2
      ? {
          limit: 10,
          offset: 0,
          search: searchQuery,
        }
      : "skip"
  )

  const implUsersData = useQuery(
    api.superAdmin.users.listImplementorUsers,
    isImplementor === true && searchQuery.length >= 2
      ? {
          limit: 10,
          offset: 0,
          search: searchQuery,
        }
      : "skip"
  )

  const usersData = isImplementor === true ? implUsersData : adminUsersData

  const addUserToOrg = useMutation(api.superAdmin.users.addUserToOrganization)

  const handleSubmit = async () => {
    if (!selectedUserId) {
      toast.error("Selecciona un usuario")
      return
    }

    setIsSubmitting(true)
    try {
      await addUserToOrg({
        userId: selectedUserId,
        organizationId,
        role: selectedRole,
      })
      toast.success("Usuario añadido a la organización")
      onOpenChange(false)
      // Reset state
      setSearchQuery("")
      setSelectedUserId(null)
      setSelectedRole("cashier")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedUser = usersData?.users.find((u) => u._id === selectedUserId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Añadir Usuario a Organización
          </DialogTitle>
          <DialogDescription>
            Busca un usuario existente y asígnale un rol en esta organización.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search Input */}
          <div className="space-y-2">
            <Label htmlFor="search">Buscar Usuario</Label>
            <div className="relative">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Buscar por nombre o email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setSelectedUserId(null)
                }}
                className="pl-9"
              />
            </div>
            {searchQuery.length > 0 && searchQuery.length < 2 && (
              <p className="text-muted-foreground text-xs">
                Escribe al menos 2 caracteres para buscar
              </p>
            )}
          </div>

          {/* Search Results */}
          {searchQuery.length >= 2 && (
            <div className="space-y-2">
              <Label>Resultados</Label>
              <div className="max-h-48 overflow-y-auto rounded-md border">
                {usersData === undefined ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : usersData.users.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    No se encontraron usuarios
                  </div>
                ) : (
                  <div className="divide-y">
                    {usersData.users.map((user) => (
                      <button
                        key={user._id}
                        type="button"
                        className={`w-full p-3 text-left transition-colors hover:bg-muted ${
                          selectedUserId === user._id ? "bg-primary/10" : ""
                        }`}
                        onClick={() => setSelectedUserId(user._id)}
                      >
                        <div className="font-medium">{user.name}</div>
                        <div className="text-muted-foreground text-sm">
                          {user.email}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Selected User */}
          {selectedUser && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <Label className="text-muted-foreground text-xs">
                Usuario seleccionado
              </Label>
              <div className="mt-1 font-medium">{selectedUser.name}</div>
              <div className="text-muted-foreground text-sm">
                {selectedUser.email}
              </div>
            </div>
          )}

          {/* Role Selection */}
          <div className="space-y-2">
            <Label htmlFor="role">Rol en la Organización</Label>
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
                    {role.labelEs}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {roles.find((r) => r.value === selectedRole)?.descriptionEs}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedUserId || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Añadiendo...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Añadir Usuario
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
