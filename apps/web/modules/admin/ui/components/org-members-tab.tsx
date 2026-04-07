"use client"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import {
  Clock,
  Mail,
  MoreHorizontal,
  Shield,
  UserMinus,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react"
import { useState } from "react"
import { type OrganizationRole, ROLE_METADATA } from "@/lib/rbac"
import { AddMemberToOrgDialog } from "./add-member-to-org-dialog"

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

interface Invitation {
  _id: string
  email: string
  role?: string | null
  expiresAt: number
}

interface MembersTabProps {
  organizationId: string
  members: Member[]
  invitations: Invitation[]
  onRemoveMember: (id: string, name: string) => void
  onCancelInvitation: (id: string, email: string) => void
  onChangeRole?: (member: Member) => void
}

export function MembersTab({
  organizationId,
  members,
  invitations,
  onRemoveMember,
  onCancelInvitation,
  onChangeRole,
}: MembersTabProps) {
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Miembros ({members.length})
              </CardTitle>
              <CardDescription>
                Usuarios que pertenecen a esta organización
              </CardDescription>
            </div>
            <Button onClick={() => setAddMemberDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Añadir Usuario
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {members.length > 0 ? (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member._id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage
                        src={member.user?.image ?? undefined}
                        alt={member.user?.name}
                      />
                      <AvatarFallback>
                        {member.user?.name?.charAt(0).toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">
                        {member.user?.name ?? "Usuario desconocido"}
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {member.user?.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        member.role === "owner" ? "default" : "secondary"
                      }
                    >
                      {ROLE_METADATA[member.role as OrganizationRole]
                        ?.labelEs ?? member.role}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onChangeRole && (
                          <>
                            <DropdownMenuItem
                              onClick={() => onChangeRole(member)}
                            >
                              <Shield className="mr-2 h-4 w-4" />
                              Cambiar rol
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() =>
                            onRemoveMember(
                              member._id,
                              member.user?.name ?? "Usuario"
                            )
                          }
                        >
                          <UserMinus className="mr-2 h-4 w-4" />
                          Remover de organización
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No hay miembros en esta organización
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Invitaciones Pendientes ({invitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {invitations.map((invitation) => (
                <div
                  key={invitation._id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="font-medium">{invitation.email}</div>
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Clock className="h-3 w-3" />
                        Expira{" "}
                        {formatDistanceToNow(new Date(invitation.expiresAt), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {ROLE_METADATA[invitation.role as OrganizationRole]
                        ?.labelEs ??
                        invitation.role ??
                        "Cajero"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-600 hover:text-red-700"
                      onClick={() =>
                        onCancelInvitation(invitation._id, invitation.email)
                      }
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Member Dialog */}
      <AddMemberToOrgDialog
        organizationId={organizationId}
        open={addMemberDialogOpen}
        onOpenChange={setAddMemberDialogOpen}
      />
    </div>
  )
}
