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
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useMutation } from "convex/react"
import { Shield, ShieldCheck, User, Wrench } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { usePlatformSuperAdmin } from "@/hooks/use-platform-admin"
import { handleConvexError } from "@/lib/error-handling"

interface RoleChangeDialogProps {
  user: {
    _id: string
    name: string
    email: string
    role?: string | null
  } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type UserRole = "superadmin" | "admin" | "user" | "implementor"

export function RoleChangeDialog({
  user,
  open,
  onOpenChange,
}: RoleChangeDialogProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>("user")
  const [isLoading, setIsLoading] = useState(false)
  const isSuperAdmin = usePlatformSuperAdmin()

  const updateUserRole = useMutation(api.superAdmin.users.updateUserRole)

  // Update selected role when user changes
  useEffect(() => {
    if (user) {
      if (user.role === "superadmin") setSelectedRole("superadmin")
      else if (user.role === "admin") setSelectedRole("admin")
      else if (user.role === "implementor") setSelectedRole("implementor")
      else setSelectedRole("user")
    }
  }, [user])

  const handleRoleChange = async () => {
    if (!user) return

    setIsLoading(true)
    try {
      await updateUserRole({
        userId: user._id,
        role: selectedRole,
      })

      const roleName =
        selectedRole === "superadmin"
          ? "Super Admin"
          : selectedRole === "admin"
            ? "Administrador"
            : selectedRole === "implementor"
              ? "Implementador"
              : "Usuario"

      toast.success(`El rol de ${user.name} ha sido actualizado a ${roleName}`)
      onOpenChange(false)
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsLoading(false)
    }
  }

  const currentRole =
    user?.role === "superadmin"
      ? "superadmin"
      : user?.role === "admin"
        ? "admin"
        : user?.role === "implementor"
          ? "implementor"
          : "user"

  const hasChanged = selectedRole !== currentRole

  const getRoleName = (role: string) => {
    if (role === "superadmin") return "Super Admin"
    if (role === "admin") return "Administrador"
    if (role === "implementor") return "Implementador"
    return "Usuario"
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Cambiar Rol de Usuario
          </AlertDialogTitle>
          <AlertDialogDescription>
            Cambia el rol de <strong>{user?.name}</strong> ({user?.email}).
            {selectedRole === "superadmin" && (
              <span className="mt-2 block text-red-600 dark:text-red-400">
                🚨 Los Super Admins tienen control total de la plataforma y
                acceso a operaciones destructivas.
              </span>
            )}
            {selectedRole === "admin" && (
              <span className="mt-2 block text-amber-600 dark:text-amber-400">
                ⚠️ Los administradores tienen acceso completo al sistema,
                incluyendo el panel de super admin.
              </span>
            )}
            {selectedRole === "implementor" && (
              <span className="mt-2 block text-blue-600 dark:text-blue-400">
                ℹ️ Los implementadores pueden crear y gestionar sus propias
                organizaciones.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="role">Nuevo rol</Label>
            <Select
              value={selectedRole}
              onValueChange={(value) => setSelectedRole(value as UserRole)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <div>
                      <div className="font-medium">Usuario</div>
                      <div className="text-muted-foreground text-xs">
                        Acceso estándar al sistema
                      </div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="implementor">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-blue-500" />
                    <div>
                      <div className="font-medium">Implementador</div>
                      <div className="text-muted-foreground text-xs">
                        Puede crear y gestionar organizaciones
                      </div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="admin">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-purple-500" />
                    <div>
                      <div className="font-medium">Administrador</div>
                      <div className="text-muted-foreground text-xs">
                        Acceso completo al sistema
                      </div>
                    </div>
                  </div>
                </SelectItem>
                {isSuperAdmin === true && (
                  <SelectItem value="superadmin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-red-500" />
                      <div>
                        <div className="font-medium">Super Admin</div>
                        <div className="text-muted-foreground text-xs">
                          Control total de la plataforma
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {hasChanged && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm">
                <strong>Cambio:</strong> {getRoleName(currentRole)} →{" "}
                {getRoleName(selectedRole)}
              </p>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRoleChange}
            disabled={isLoading || !hasChanged}
          >
            {isLoading ? "Guardando..." : "Guardar Cambios"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
