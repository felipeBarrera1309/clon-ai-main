import { Badge } from "@workspace/ui/components/badge"
import { Shield, ShieldCheck, User, Wrench } from "lucide-react"

export type PlatformRole =
  | "superadmin"
  | "admin"
  | "implementor"
  | "user"
  | null
  | undefined

const ROLE_CONFIG: Record<
  NonNullable<PlatformRole>,
  {
    label: string
    className: string
    Icon: React.ElementType
  }
> = {
  superadmin: {
    label: "Super Admin",
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    Icon: ShieldCheck,
  },
  admin: {
    label: "Administrador",
    className:
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    Icon: Shield,
  },
  implementor: {
    label: "Implementador",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    Icon: Wrench,
  },
  user: {
    label: "Usuario",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    Icon: User,
  },
}

export function RoleBadge({ role }: { role: PlatformRole }) {
  const config =
    ROLE_CONFIG[(role ?? "user") as NonNullable<PlatformRole>] ??
    ROLE_CONFIG.user
  const { label, className, Icon } = config

  return (
    <Badge className={className}>
      <Icon className="mr-1 h-3 w-3" />
      {label}
    </Badge>
  )
}
