import { api } from "@workspace/backend/_generated/api"
import { useQuery } from "convex/react"
import type { OrganizationRole } from "@/lib/rbac"
import { ADMIN_TEAM_ONLY_PAGES, PLATFORM_ADMIN_ROUTES } from "@/lib/rbac"
import {
	useIsImplementor,
	usePlatformAdmin,
	usePlatformSuperAdmin,
} from "./use-platform-admin"

type PermissionsResult = {
	allowedPages: string[]
	role: OrganizationRole | "platform_admin" | "platform_superadmin" | "unknown"
	isCustomized: boolean
	isLoading: boolean
	isPlatformAdmin: boolean
	isPlatformSuperAdmin: boolean
	/** True when the user is an implementor (subset of platform admin) */
	isImplementor: boolean
}

/**
 * Hook to get the current user's resolved permissions
 * Combines org-specific permissions with defaults and platform admin access
 */
export const usePermissions = (): PermissionsResult => {
	const resolvedPermissions = useQuery(
		api.private.organizationPermissions.getResolvedPermissions
	)
	const isPlatformAdmin = usePlatformAdmin()
	const isPlatformSuperAdmin = usePlatformSuperAdmin()
	const isImplementor = useIsImplementor()

	const isLoading =
		resolvedPermissions === undefined ||
		isPlatformAdmin === undefined ||
		isPlatformSuperAdmin === undefined ||
		isImplementor === undefined

	// Platform superadmin has access to all routes
	if (isPlatformSuperAdmin === true) {
		return {
			allowedPages: [...PLATFORM_ADMIN_ROUTES.allowed],
			role: "platform_superadmin",
			isCustomized: false,
			isLoading: false,
			isPlatformAdmin: true,
			isPlatformSuperAdmin: true,
			isImplementor: false,
		}
	}

	// Platform admin members have access to all routes
	if (isPlatformAdmin === true) {
		return {
			allowedPages: [...PLATFORM_ADMIN_ROUTES.allowed],
			role: "platform_admin",
			isCustomized: false,
			isLoading: false,
			isPlatformAdmin: true,
			isPlatformSuperAdmin: false,
			isImplementor: false,
		}
	}

	// Implementors: same org-level page access as platform admin + isImplementor flag
	// isPlatformAdmin is set to true so that sidebar sections and canEdit logic work
	if (isImplementor === true) {
		return {
			allowedPages: [...PLATFORM_ADMIN_ROUTES.allowed],
			role: "platform_admin",
			isCustomized: false,
			isLoading: false,
			isPlatformAdmin: true,
			isPlatformSuperAdmin: false,
			isImplementor: true,
		}
	}

	if (isLoading || !resolvedPermissions) {
		return {
			allowedPages: [],
			role: "unknown",
			isCustomized: false,
			isLoading: true,
			isPlatformAdmin: false,
			isPlatformSuperAdmin: false,
			isImplementor: false,
		}
	}

	return {
		allowedPages: resolvedPermissions.allowedPages,
		role: resolvedPermissions.role as OrganizationRole | "unknown",
		isCustomized: resolvedPermissions.isCustomized,
		isLoading: false,
		isPlatformAdmin: false,
		isPlatformSuperAdmin: false,
		isImplementor: false,
	}
}

/**
 * Check if the current user can access a specific page
 */
export const useCanAccessPage = (pathname: string): boolean | undefined => {
	const { allowedPages, isLoading, isPlatformAdmin, isPlatformSuperAdmin } =
		usePermissions()

	if (isLoading) {
		return undefined // Still loading
	}

	// Platform admin or superadmin has access to everything
	if (isPlatformAdmin || isPlatformSuperAdmin) {
		return true
	}

	// Check if the page is in the allowed list
	// Handle both exact matches and prefix matches (e.g., /orders matches /orders/123)
	return allowedPages.some((page) => {
		if (pathname === page) return true
		if (pathname.startsWith(`${page}/`)) return true
		return false
	})
}

/**
 * Get pages that can be configured for member permissions
 * Excludes platform-admin-only pages
 */
export const getConfigurablePages = () => {
	const allPages = [
		{
			path: "/",
			label: "Dashboard",
			description: "Panel principal con métricas",
		},
		{
			path: "/conversations",
			label: "Conversaciones",
			description: "Chat con clientes",
		},
		{
			path: "/quick-responses",
			label: "Respuestas rápidas",
			description: "Plantillas de respuesta",
		},
		{
			path: "/contacts",
			label: "Contactos",
			description: "Gestión de clientes",
		},
		{ path: "/orders", label: "Pedidos", description: "Gestión de pedidos" },
		{ path: "/menu", label: "Menú", description: "Productos y categorías" },
		{
			path: "/bulk-messaging",
			label: "Mensajes masivos",
			description: "Campañas de WhatsApp",
		},
		{
			path: "/delivery-areas",
			label: "Zonas de entrega",
			description: "Áreas de cobertura",
		},
		{
			path: "/restaurant-locations",
			label: "Ubicaciones",
			description: "Sedes del restaurante",
		},
		{
			path: "/settings",
			label: "Configuración",
			description: "Ajustes generales",
		},
	]

	// Filter out platform-admin-only pages
	return allPages.filter(
		(page) =>
			!ADMIN_TEAM_ONLY_PAGES.includes(
				page.path as (typeof ADMIN_TEAM_ONLY_PAGES)[number]
			)
	)
}
