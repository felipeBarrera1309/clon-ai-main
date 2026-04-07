/**
 * Organization roles with hierarchy
 * These match the roles defined in the backend
 */
export const ORGANIZATION_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MANAGER: "manager",
  CASHIER: "cashier",
  KITCHEN: "kitchen",
  VIEWER: "viewer",
  // Legacy mappings for backward compatibility
  "org:admin": "admin",
  "org:member": "cashier",
} as const

export const PLATFORM_ADMIN_ROLE = "platform_admin" as const
export const PLATFORM_SUPERADMIN_ROLE = "platform_superadmin" as const

export type OrganizationRole =
  | "owner"
  | "admin"
  | "manager"
  | "cashier"
  | "kitchen"
  | "viewer"

export type PlatformAdminRole = typeof PLATFORM_ADMIN_ROLE
export type PlatformSuperAdminRole = typeof PLATFORM_SUPERADMIN_ROLE

export type UserRole =
  | OrganizationRole
  | PlatformAdminRole
  | PlatformSuperAdminRole

/**
 * Role metadata for UI display
 */
export const ROLE_METADATA: Record<
  OrganizationRole,
  {
    labelEn: string
    labelEs: string
    level: number
    description: string
    descriptionEs: string
  }
> = {
  owner: {
    labelEn: "Owner",
    labelEs: "Propietario",
    level: 0,
    description: "Full access including AI config and WhatsApp setup",
    descriptionEs: "Acceso completo incluyendo configuración de IA y WhatsApp",
  },
  admin: {
    labelEn: "Administrator",
    labelEs: "Administrador",
    level: 1,
    description: "Full operational access, can manage staff and settings",
    descriptionEs:
      "Acceso operacional completo, puede gestionar personal y configuración",
  },
  manager: {
    labelEn: "Manager",
    labelEs: "Gerente",
    level: 2,
    description: "Day-to-day operations, menu, orders, staff schedules",
    descriptionEs: "Operaciones diarias, menú, pedidos, horarios de personal",
  },
  cashier: {
    labelEn: "Cashier",
    labelEs: "Cajero",
    level: 3,
    description: "Order management, conversations, contacts",
    descriptionEs: "Gestión de pedidos, conversaciones, contactos",
  },
  kitchen: {
    labelEn: "Kitchen",
    labelEs: "Cocina",
    level: 4,
    description: "View-only access to orders",
    descriptionEs: "Acceso de solo lectura a pedidos",
  },
  viewer: {
    labelEn: "Viewer",
    labelEs: "Observador",
    level: 5,
    description: "Read-only access to orders and basic stats",
    descriptionEs: "Acceso de solo lectura a pedidos y estadísticas básicas",
  },
}

/**
 * Get all roles as an array for UI selects
 */
export const getRolesArray = () => {
  return Object.entries(ROLE_METADATA).map(([value, meta]) => ({
    value: value as OrganizationRole,
    ...meta,
  }))
}

/**
 * Default permissions for each role (fallback when not using backend)
 * These should match the backend DEFAULT_PERMISSIONS
 */
export const ROUTES_BY_ROLE: Record<
  OrganizationRole,
  {
    allowed: string[]
    sidebarSections: {
      dashboard?: boolean
      customerSupport?: string[]
      configuration?: string[]
    }
  }
> = {
  owner: {
    allowed: [
      "/",
      "/conversations",
      "/quick-responses",
      "/contacts",
      "/orders",
      "/menu",
      "/bulk-messaging",
      "/delivery-areas",
      "/restaurant-locations",
      "/customization",
      "/settings",
      "/prompt-builder",
      "/whatsapp",
    ],
    sidebarSections: {
      dashboard: true,
      customerSupport: [
        "/conversations",
        "/quick-responses",
        "/contacts",
        "/orders",
        "/menu",
        "/bulk-messaging",
        "/delivery-areas",
        "/restaurant-locations",
      ],
      configuration: [
        "/customization",
        "/settings",
        "/prompt-builder",
        "/whatsapp",
      ],
    },
  },
  admin: {
    allowed: [
      "/",
      "/conversations",
      "/quick-responses",
      "/contacts",
      "/orders",
      "/menu",
      "/bulk-messaging",
      "/delivery-areas",
      "/restaurant-locations",
      "/settings",
    ],
    sidebarSections: {
      dashboard: true,
      customerSupport: [
        "/conversations",
        "/quick-responses",
        "/contacts",
        "/orders",
        "/menu",
        "/bulk-messaging",
        "/delivery-areas",
        "/restaurant-locations",
      ],
      configuration: ["/settings"],
    },
  },
  manager: {
    allowed: [
      "/",
      "/conversations",
      "/quick-responses",
      "/contacts",
      "/orders",
      "/menu",
      "/delivery-areas",
      "/restaurant-locations",
    ],
    sidebarSections: {
      dashboard: true,
      customerSupport: [
        "/conversations",
        "/quick-responses",
        "/contacts",
        "/orders",
        "/menu",
        "/delivery-areas",
        "/restaurant-locations",
      ],
      configuration: [],
    },
  },
  cashier: {
    allowed: ["/conversations", "/quick-responses", "/contacts", "/orders"],
    sidebarSections: {
      dashboard: false,
      customerSupport: [
        "/conversations",
        "/quick-responses",
        "/contacts",
        "/orders",
      ],
      configuration: [],
    },
  },
  kitchen: {
    allowed: ["/orders"],
    sidebarSections: {
      dashboard: false,
      customerSupport: ["/orders"],
      configuration: [],
    },
  },
  viewer: {
    allowed: ["/", "/orders"],
    sidebarSections: {
      dashboard: true,
      customerSupport: ["/orders"],
      configuration: [],
    },
  },
}

// Platform admin has access to all routes plus additional admin-only routes
export const PLATFORM_ADMIN_ROUTES = {
  allowed: [
    "/",
    "/conversations",
    "/quick-responses",
    "/contacts",
    "/orders",
    "/menu",
    "/bulk-messaging",
    "/delivery-areas",
    "/restaurant-locations",
    "/customization",
    "/settings",
    "/prompt-builder",
    "/whatsapp",
    // Add any additional platform-admin-only routes here
  ],
  sidebarSections: {
    dashboard: true,
    customerSupport: [
      "/conversations",
      "/quick-responses",
      "/contacts",
      "/orders",
      "/menu",
      "/bulk-messaging",
      "/delivery-areas",
      "/restaurant-locations",
    ],
    configuration: [
      "/customization",
      "/settings",
      "/prompt-builder",
      "/whatsapp",
    ],
  },
}

export const canAccessRoute = (
  role: OrganizationRole | undefined,
  pathname: string,
  isPlatformAdmin?: boolean
): boolean => {
  // Platform admin members have access to all routes
  if (isPlatformAdmin) {
    if (pathname === "/") {
      return PLATFORM_ADMIN_ROUTES.sidebarSections.dashboard === true
    }
    return PLATFORM_ADMIN_ROUTES.allowed.some((route) =>
      pathname.startsWith(route)
    )
  }

  if (!role) return false

  const config = ROUTES_BY_ROLE[role]
  if (!config) return false

  if (pathname === "/") {
    return config.sidebarSections.dashboard === true
  }

  return config.allowed.some((route) => pathname.startsWith(route))
}

export const getDefaultRoute = (
  role: OrganizationRole | undefined,
  isPlatformAdmin?: boolean
): string => {
  // Platform admin members default to dashboard
  if (isPlatformAdmin) {
    return "/"
  }

  if (!role) return "/conversations"

  const config = ROUTES_BY_ROLE[role]
  if (!config) return "/conversations"

  if (config.sidebarSections.dashboard) {
    return "/"
  }

  return config.allowed[0] || "/conversations"
}

// Platform-admin-only features that require platform admin for editing
export const PLATFORM_ADMIN_EDIT_FEATURES = [
  "/customization",
  "/prompt-builder",
  "/whatsapp",
] as const

// Pages that only platform admin can access
// These cannot be granted to regular org members
export const ADMIN_TEAM_ONLY_PAGES = [
  "/customization",
  "/prompt-builder",
  "/whatsapp",
] as const

export const canEditAdminFeature = (
  pathname: string,
  isPlatformAdmin?: boolean
): boolean => {
  // Only platform admin members can edit admin-only features
  if (
    PLATFORM_ADMIN_EDIT_FEATURES.some((feature) => pathname.startsWith(feature))
  ) {
    return isPlatformAdmin === true
  }

  // Other features can be edited by normal admins
  return true
}
