import {
	AlertTriangleIcon,
	BuildingIcon,
	ChefHatIcon,
	FileTextIcon,
	InboxIcon,
	LayoutDashboardIcon,
	MapPinIcon,
	MegaphoneIcon,
	MessageSquareIcon,
	PackageIcon,
	PaletteIcon,
	SettingsIcon,
	ShieldIcon,
	UserIcon,
	UsersIcon,
	UtensilsIcon,
} from "lucide-react"

export const STATUS_FILTER_KEY = "clon-ai-status-filter"
export const ORDER_EXISTENCE_FILTER_KEY = "clon-ai-order-existence-filter"
export const ORDER_STATUS_FILTER_KEY = "clon-ai-order-status-filter"
export const SEARCH_TEXT_FILTER_KEY = "clon-ai-search-text-filter"
export const WHATSAPP_CONFIGURATION_FILTER_KEY =
	"clon-ai-whatsapp-configuration-filter"
export const SIDEBAR_WRAPPER_CLASSNAME_KEY = "clon-ai-sidebar-wrapper-classname"

// Configuración centralizada de vistas del dashboard
export const DASHBOARD_VIEWS = {
	"/": {
		title: "Dashboard",
		icon: LayoutDashboardIcon,
		url: "/",
	},
	"/conversations": {
		title: "Conversaciones",
		icon: InboxIcon,
		url: "/conversations",
	},
	"/test": {
		title: "Pruebas",
		icon: InboxIcon,
		url: "/test",
	},
	"/quick-responses": {
		title: "Respuestas Rápidas",
		icon: MessageSquareIcon,
		url: "/quick-responses",
	},
	"/contacts": {
		title: "Contactos",
		icon: UsersIcon,
		url: "/contacts",
	},
	"/orders": {
		title: "Pedidos",
		icon: UtensilsIcon,
		url: "/orders",
	},
	"/menu": {
		title: "Menú",
		icon: ChefHatIcon,
		url: "/menu",
	},
	"/combos": {
		title: "Combos",
		icon: PackageIcon,
		url: "/combos",
	},
	"/bulk-messaging": {
		title: "Mensajería Masiva",
		icon: MegaphoneIcon,
		url: "/bulk-messaging",
	},
	"/delivery-areas": {
		title: "Áreas de Entrega",
		icon: MapPinIcon,
		url: "/delivery-areas",
	},
	"/restaurant-locations": {
		title: "Sucursales",
		icon: BuildingIcon,
		url: "/restaurant-locations",
	},
	"/customization": {
		title: "Personalización del Agente",
		icon: PaletteIcon,
		url: "/customization",
	},
	"/settings": {
		title: "Configuración de Restaurante",
		icon: SettingsIcon,
		url: "/settings",
	},
	"/prompt-builder": {
		title: "Constructor de Prompts",
		icon: FileTextIcon,
		url: "/prompt-builder",
	},
	"/whatsapp": {
		title: "WhatsApp",
		icon: MessageSquareIcon,
		url: "/whatsapp",
	},
	"/admin": {
		title: "Panel de Administración",
		icon: ShieldIcon,
		url: "/admin",
	},
	"/admin/organizations": {
		title: "Organizaciones",
		icon: BuildingIcon,
		url: "/admin/organizations",
	},
	"/admin/users": {
		title: "Usuarios",
		icon: UsersIcon,
		url: "/admin/users",
	},
	"/admin/platform-permissions": {
		title: "Permisos por Defecto",
		icon: ShieldIcon,
		url: "/admin/platform-permissions",
	},
	"/admin/escalations": {
		title: "Escalaciones",
		icon: AlertTriangleIcon,
		url: "/admin/escalations",
	},
	"/admin/conversations": {
		title: "Debug conversaciones",
		icon: MessageSquareIcon,
		url: "/admin/conversations",
	},
	"/account": {
		title: "Mi Cuenta",
		icon: UserIcon,
		url: "/account",
	},
} as const

export type DashboardViewKey = keyof typeof DASHBOARD_VIEWS
export type DashboardViewConfig = (typeof DASHBOARD_VIEWS)[DashboardViewKey]

// URLs agrupadas por sección del sidebar
export const DASHBOARD_URLS = [DASHBOARD_VIEWS["/"].url] as const

export const CUSTOMER_SUPPORT_URLS = [
	DASHBOARD_VIEWS["/conversations"].url,
	DASHBOARD_VIEWS["/test"].url,
	DASHBOARD_VIEWS["/quick-responses"].url,
	DASHBOARD_VIEWS["/contacts"].url,
	DASHBOARD_VIEWS["/orders"].url,
	DASHBOARD_VIEWS["/menu"].url,
	DASHBOARD_VIEWS["/combos"].url,
	DASHBOARD_VIEWS["/bulk-messaging"].url,
	DASHBOARD_VIEWS["/delivery-areas"].url,
	DASHBOARD_VIEWS["/restaurant-locations"].url,
] as const

export const CONFIGURATION_URLS = [
	DASHBOARD_VIEWS["/customization"].url,
	DASHBOARD_VIEWS["/settings"].url,
	DASHBOARD_VIEWS["/prompt-builder"].url,
	DASHBOARD_VIEWS["/whatsapp"].url,
] as const

export const ADMIN_URLS = [DASHBOARD_VIEWS["/admin"].url] as const

export const ADMIN_SUB_URLS = [
	DASHBOARD_VIEWS["/admin/organizations"].url,
	DASHBOARD_VIEWS["/admin/users"].url,
	DASHBOARD_VIEWS["/admin/platform-permissions"].url,
	DASHBOARD_VIEWS["/admin/conversations"].url,
	DASHBOARD_VIEWS["/admin/escalations"].url,
] as const
