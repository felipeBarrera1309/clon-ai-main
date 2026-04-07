/**
 * Admin module constants
 */

export const USER_ROLES = {
  admin: {
    label: "Administrador",
    description: "Acceso completo al sistema",
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  },
  user: {
    label: "Usuario",
    description: "Acceso estándar",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
} as const

export const USER_STATUS = {
  active: {
    label: "Activo",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  banned: {
    label: "Bloqueado",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
} as const

export const ADMIN_NAV_ITEMS = [
  {
    title: "Dashboard",
    href: "/admin",
    icon: "LayoutDashboard",
  },
  {
    title: "Organizaciones",
    href: "/admin/organizations",
    icon: "Building2",
  },
  {
    title: "Costos IA",
    href: "/admin/costs",
    icon: "ReceiptText",
  },
  {
    title: "Usuarios",
    href: "/admin/users",
    icon: "Users",
  },
] as const

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
