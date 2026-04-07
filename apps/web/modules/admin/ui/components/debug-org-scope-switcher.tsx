"use client"

import { Button } from "@workspace/ui/components/button"
import Link from "next/link"

type DebugOrgScopeSwitcherProps = {
  organizationId: string
  currentView: "conversations" | "agent"
}

export const DebugOrgScopeSwitcher = ({
  organizationId,
  currentView,
}: DebugOrgScopeSwitcherProps) => {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        asChild
        size="sm"
        variant={currentView === "conversations" ? "default" : "outline"}
      >
        <Link href={`/admin/conversations/org/${organizationId}`}>
          Conversaciones debug
        </Link>
      </Button>
      <Button
        asChild
        size="sm"
        variant={currentView === "agent" ? "default" : "outline"}
      >
        <Link href={`/admin/conversations/org/${organizationId}/agent`}>
          Agente debug
        </Link>
      </Button>
    </div>
  )
}
