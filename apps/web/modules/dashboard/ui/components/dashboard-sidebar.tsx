"use client"

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { OrganizationSwitcher } from "@/components/organization-switcher"
import { UserButton } from "@/components/user-button"
import { usePermissions } from "@/hooks/use-permissions"
import {
	ADMIN_SUB_URLS,
	ADMIN_URLS,
	CONFIGURATION_URLS,
	CUSTOMER_SUPPORT_URLS,
	DASHBOARD_URLS,
	DASHBOARD_VIEWS,
} from "@/modules/dashboard/constants"
import { useCurrentView } from "@/modules/dashboard/hooks/use-current-view"

export const DashboardSidebar = () => {
	const pathname = usePathname()
	const {
		allowedPages,
		role,
		isPlatformAdmin,
		isPlatformSuperAdmin,
		isImplementor,
		isLoading,
	} = usePermissions()

	// Usar el hook para mantener sincronizado el estado actual y obtener función de navegación
	const { navigateAndCollapse } = useCurrentView()

	const isActive = (url: string) => {
		if (url === "/") {
			return pathname === "/"
		}
		// For admin routes, be more specific to avoid /admin matching /admin/organizations
		if (url === "/admin") {
			return pathname === "/admin"
		}
		return pathname.startsWith(url)
	}

	// Check if a URL is allowed based on permissions
	const isUrlAllowed = (url: string) => {
		if (isPlatformAdmin) return true
		return allowedPages.includes(url)
	}

	// Show dashboard if "/" is in allowed pages
	const showDashboard = isUrlAllowed("/")

	// Filter URLs based on permissions
	const filteredCustomerSupportUrls = CUSTOMER_SUPPORT_URLS.filter(isUrlAllowed)
	const filteredConfigurationUrls = CONFIGURATION_URLS.filter(isUrlAllowed)

	// Add admin-only routes for normal admins (read-only access)
	// Only customization is read-only, prompt-builder and whatsapp are completely hidden
	const adminOnlyConfiguration =
		role === "admin" && !isPlatformAdmin ? ["/customization"] : []

	const filteredAdminOnlyUrls = CONFIGURATION_URLS.filter(
		(url) =>
			adminOnlyConfiguration.includes(url) &&
			!filteredConfigurationUrls.includes(url)
	)

	// Admin routes — filter for implementors: no root /admin, no permissions/escalations
	const IMPLEMENTOR_BLOCKED_ADMIN_URLS = new Set(["/admin"])
	const IMPLEMENTOR_BLOCKED_ADMIN_SUB_URLS = new Set([
		"/admin/platform-permissions",
		"/admin/escalations",
		"/admin/conversations",
	])
	const superAdminOnlyRoutes = new Set([
		"/admin/escalations",
		"/admin/conversations",
	])

	const filteredAdminSubUrls = ADMIN_SUB_URLS.filter((url) => {
		if (isImplementor && IMPLEMENTOR_BLOCKED_ADMIN_SUB_URLS.has(url))
			return false
		if (superAdminOnlyRoutes.has(url)) return isPlatformSuperAdmin
		return true
	})

	const filteredAdminUrls = ADMIN_URLS.filter(
		(url) => !isImplementor || !IMPLEMENTOR_BLOCKED_ADMIN_URLS.has(url)
	)

	if (isLoading) {
		return (
			<Sidebar className="group no-print" collapsible="icon">
				<SidebarHeader>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton asChild size="lg">
								<OrganizationSwitcher />
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarHeader>
				<SidebarContent />
				<SidebarFooter>
					<SidebarMenu>
						<SidebarMenuItem>
							<UserButton showName />
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>
		)
	}

	return (
		<Sidebar className="group no-print" collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild size="lg">
							<OrganizationSwitcher />
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				{showDashboard && (
					<SidebarGroup>
						<SidebarGroupContent>
							<SidebarMenu>
								{DASHBOARD_URLS.map((url) => {
									const config = DASHBOARD_VIEWS[url]
									return (
										<SidebarMenuItem key={config.title}>
											<SidebarMenuButton
												asChild
												isActive={isActive(url)}
												className={cn(
													isActive(url) &&
													"bg-sidebar-primary! text-sidebar-primary-foreground!"
												)}
												tooltip={config.title}
											>
												<Link
													href={url}
													onClick={(e) => {
														e.preventDefault()
														navigateAndCollapse(url)
													}}
												>
													<config.icon className="size-4" />
													<span>{config.title}</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									)
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}

				{filteredCustomerSupportUrls.length > 0 && (
					<SidebarGroup>
						<SidebarGroupLabel>Soporte al Cliente</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{filteredCustomerSupportUrls.map((url) => {
									const config = DASHBOARD_VIEWS[url]
									return (
										<SidebarMenuItem key={config.title}>
											<SidebarMenuButton
												asChild
												isActive={isActive(url)}
												className={cn(
													isActive(url) &&
													"bg-sidebar-primary! text-sidebar-primary-foreground!"
												)}
												tooltip={config.title}
											>
												<Link
													href={url}
													onClick={(e) => {
														e.preventDefault()
														navigateAndCollapse(url)
													}}
												>
													<config.icon className="size-4" />
													<span>{config.title}</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									)
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}

				{filteredConfigurationUrls.length > 0 && (
					<SidebarGroup>
						<SidebarGroupLabel>Configuración</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{filteredConfigurationUrls.map((url) => {
									const config = DASHBOARD_VIEWS[url]
									return (
										<SidebarMenuItem key={config.title}>
											<SidebarMenuButton
												asChild
												isActive={isActive(url)}
												className={cn(
													isActive(url) &&
													"bg-sidebar-primary! text-sidebar-primary-foreground!"
												)}
												tooltip={config.title}
											>
												<Link
													href={url}
													onClick={(e) => {
														e.preventDefault()
														navigateAndCollapse(url)
													}}
												>
													<config.icon className="size-4" />
													<span>{config.title}</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									)
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}

				{filteredAdminOnlyUrls.length > 0 && (
					<SidebarGroup>
						<SidebarGroupLabel>Configuración Avanzada</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{filteredAdminOnlyUrls.map((url) => {
									const config = DASHBOARD_VIEWS[url]
									return (
										<SidebarMenuItem key={config.title}>
											<SidebarMenuButton
												asChild
												isActive={isActive(url)}
												className={cn(
													isActive(url) &&
													"bg-sidebar-primary! text-sidebar-primary-foreground!"
												)}
												tooltip={`${config.title} (Solo lectura)`}
											>
												<Link
													href={url}
													onClick={(e) => {
														e.preventDefault()
														navigateAndCollapse(url)
													}}
												>
													<config.icon className="size-4" />
													<span>{config.title}</span>
													<span className="ml-auto text-muted-foreground text-xs">
														👁️
													</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									)
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}

				{isPlatformAdmin && (
					<SidebarGroup>
						<SidebarGroupLabel>Gestión de Plataforma</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{/* Admin Dashboard */}
								{filteredAdminUrls.map((url) => {
									const config = DASHBOARD_VIEWS[url]
									return (
										<SidebarMenuItem key={config.title}>
											<SidebarMenuButton
												asChild
												isActive={isActive(url)}
												className={cn(
													isActive(url) &&
													"bg-sidebar-primary! text-sidebar-primary-foreground!"
												)}
												tooltip={config.title}
											>
												<Link href={url}>
													<config.icon className="size-4" />
													<span>{config.title}</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									)
								})}
								{/* Admin Sub-pages */}
								{filteredAdminSubUrls.map((url) => {
									const config = DASHBOARD_VIEWS[url]
									return (
										<SidebarMenuItem key={config.title}>
											<SidebarMenuButton
												asChild
												isActive={isActive(url)}
												className={cn(
													isActive(url) &&
													"bg-sidebar-primary! text-sidebar-primary-foreground!"
												)}
												tooltip={config.title}
											>
												<Link href={url}>
													<config.icon className="size-4" />
													<span>{config.title}</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									)
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<UserButton showName />
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	)
}
