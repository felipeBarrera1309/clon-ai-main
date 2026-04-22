"use client"

import { SidebarProvider } from "@workspace/ui/components/sidebar"
import { DashboardHeader } from "@/modules/dashboard/ui/components/dashboard-header"
import { DashboardScrollArea } from "@/modules/dashboard/ui/components/dashboard-scroll-area"
import { DashboardSidebar } from "@/modules/dashboard/ui/components/dashboard-sidebar"
import { NotificationManager } from "@/modules/dashboard/ui/components/notification-manager"
import { OnboardingCheck } from "@/modules/dashboard/ui/components/onboarding-check"

interface DashboardClientLayoutProps {
	children: React.ReactNode
	defaultOpen: boolean
}

export function DashboardClientLayout({
	children,
	defaultOpen,
}: DashboardClientLayoutProps) {
	return (
		<OnboardingCheck>
			<SidebarProvider defaultOpen={defaultOpen}>
				<NotificationManager />
				<DashboardSidebar />
				<div className="flex h-[100dvh] min-w-0 max-w-full flex-1 flex-col overflow-hidden">
					<DashboardHeader className="flex-[0] flex-shrink-0" />
					<DashboardScrollArea>{children}</DashboardScrollArea>
				</div>
			</SidebarProvider>
		</OnboardingCheck>
	)
}
