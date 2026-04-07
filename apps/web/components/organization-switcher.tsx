"use client"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Building2, Check, ChevronDown } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useOrganization } from "@/hooks/use-organization"
import { authClient } from "@/lib/auth-client"
import { type OrganizationRole, ROLE_METADATA } from "@/lib/rbac"

export function OrganizationSwitcher() {
  const { organizations, activeOrganization, activeOrganizationId, isLoading } =
    useOrganization()
  const [isOpen, setIsOpen] = useState(false)
  const [isChangingOrg, setIsChangingOrg] = useState(false)

  const handleSelectOrganization = async (orgId: string) => {
    try {
      setIsChangingOrg(true)
      await authClient.organization.setActive({
        organizationId: orgId,
      })
      setIsOpen(false)
      // Reload to sync session
      window.location.reload()
    } catch (error) {
      toast.error("Error al cambiar de organización")
      console.error(error)
      setIsChangingOrg(false)
    }
  }

  if (isLoading) {
    return (
      <Button variant="ghost" className="w-full justify-start" disabled>
        <Building2 className="mr-2 h-4 w-4" />
        <span className="truncate">Cargando...</span>
      </Button>
    )
  }

  // If only one organization, show as static text (no dropdown)
  if (organizations.length === 1) {
    return (
      <Button
        variant="ghost"
        className="w-full cursor-default justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2"
        disabled
      >
        <Building2 className="h-4 w-4 shrink-0" />
        <span className="ml-2 truncate group-data-[collapsible=icon]:hidden">
          {activeOrganization?.name || "Sin organización"}
        </span>
      </Button>
    )
  }

  // Multiple organizations - show dropdown
  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2"
          disabled={isChangingOrg}
        >
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="ml-2 truncate group-data-[collapsible=icon]:hidden">
            {isChangingOrg
              ? "Cambiando..."
              : activeOrganization?.name || "Seleccionar"}
          </span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 group-data-[collapsible=icon]:hidden" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Organizaciones</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org._id}
            onClick={() => handleSelectOrganization(org._id)}
            className="cursor-pointer"
          >
            <Building2 className="mr-2 h-4 w-4" />
            <span className="truncate">{org.name}</span>
            {org.role && (
              <span className="ml-2 text-muted-foreground text-xs">
                {ROLE_METADATA[org.role as OrganizationRole]?.labelEs ??
                  org.role}
              </span>
            )}
            {org._id === activeOrganizationId && (
              <Check className="ml-auto h-4 w-4" />
            )}
          </DropdownMenuItem>
        ))}
        {organizations.length === 0 && (
          <DropdownMenuItem disabled>
            No hay organizaciones disponibles
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
