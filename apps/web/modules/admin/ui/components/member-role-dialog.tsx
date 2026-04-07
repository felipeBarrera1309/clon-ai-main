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
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useMutation } from "convex/react"
import { Shield } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { handleConvexError } from "@/lib/error-handling"
import { getRolesArray, type OrganizationRole } from "@/lib/rbac"

interface MemberRoleDialogProps {
  member: {
    _id: string
    role: string
    user?: {
      name: string
      email: string
    }
  } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MemberRoleDialog({
  member,
  open,
  onOpenChange,
}: MemberRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState<OrganizationRole>(
    (member?.role as OrganizationRole) ?? "cashier"
  )
  const roles = getRolesArray()
  const [isLoading, setIsLoading] = useState(false)

  const updateMemberRole = useMutation(api.superAdmin.users.updateMemberRole)

  const handleUpdateRole = async () => {
    if (!member) return

    setIsLoading(true)
    try {
      await updateMemberRole({
        memberId: member._id,
        role: selectedRole,
      })
      toast.success(
        `Rol de ${member.user?.name ?? "usuario"} actualizado a ${selectedRole}`
      )
      onOpenChange(false)
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsLoading(false)
    }
  }

  // Update selected role when member changes
  if (member && selectedRole !== member.role && !open) {
    setSelectedRole(member.role as OrganizationRole)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Cambiar Rol de Miembro
          </DialogTitle>
          <DialogDescription>
            Cambia el rol de <strong>{member?.user?.name}</strong> (
            {member?.user?.email}) en esta organización.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
                    <div className="flex flex-col">
                      <span className="font-medium">{role.labelEs}</span>
                      <span className="text-muted-foreground text-xs">
                        {role.descriptionEs}
                      </span>
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
          <Button
            onClick={handleUpdateRole}
            disabled={isLoading || selectedRole === member?.role}
          >
            {isLoading ? "Actualizando..." : "Actualizar Rol"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
