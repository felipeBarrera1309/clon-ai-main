import { cookies } from "next/headers"
import { AuthGuard } from "@/modules/auth/ui/components/auth-guard"
import { OrganizationGuard } from "@/modules/auth/ui/components/organization-guard"
import { RoleGuard } from "@/modules/auth/ui/components/role-guard"
import { DashboardClientLayout } from "@/modules/dashboard/ui/layouts/dashboard-client-layout"

export const DashboardLayout = async ({
	children,
}: {
	children: React.ReactNode
}) => {
	const cookieStore = await cookies()
	const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"

	return (
		<AuthGuard>
			<OrganizationGuard>
				<RoleGuard>
					<DashboardClientLayout defaultOpen={defaultOpen}>
						{children}
					</DashboardClientLayout>
				</RoleGuard>
			</OrganizationGuard>
		</AuthGuard>
	)
}
