"use client"

import { Button } from "@workspace/ui/components/button"
import { ShieldIcon } from "lucide-react"
import Link from "next/link"
import { PlatformPermissionsDefaults } from "@/modules/admin/ui/components/platform-permissions-defaults"

export default function PlatformPermissionsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">
            Permisos por Defecto
          </h1>
          <p className="mt-2 text-muted-foreground">
            Configura los permisos por defecto que heredan las organizaciones.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/admin">
              <ShieldIcon className="mr-2 h-4 w-4" />
              Volver a Admin
            </Link>
          </Button>
        </div>
      </div>

      <PlatformPermissionsDefaults />
    </div>
  )
}
