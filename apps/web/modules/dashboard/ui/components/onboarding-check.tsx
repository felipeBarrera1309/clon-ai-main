"use client"

import { api } from "@workspace/backend/_generated/api"
import { Button } from "@workspace/ui/components/button"
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card"
import { useMutation, useQuery } from "convex/react"
import { AlertCircle, ArrowRight, CheckCircle } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { Loader } from "@/components/loader"
import { useOrganization } from "@/hooks/use-organization"
import { usePlatformAdmin } from "@/hooks/use-platform-admin"

interface OnboardingCheckProps {
	children: React.ReactNode
}

export function OnboardingCheck({ children }: OnboardingCheckProps) {
	const router = useRouter()
	const pathname = usePathname()
	const { activeOrganizationId, activeOrganization } = useOrganization()
	const isPlatformAdmin = usePlatformAdmin()
	const [isSkipping, setIsSkipping] = useState(false)

	const isAdminPage = pathname?.startsWith("/admin")

	const progress = useQuery(
		api.private.onboarding.getOnboardingProgress,
		activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
	)

	const checkAndAutoComplete = useMutation(
		api.private.onboarding.checkAndAutoCompleteForExistingOrg
	)

	const isLoading =
		progress === undefined ||
		isPlatformAdmin === undefined ||
		!activeOrganizationId

	if (isLoading) {
		return (
			<div className="flex h-screen w-full items-center justify-center">
				<Loader />
			</div>
		)
	}

	const needsOnboarding = progress === null || !progress?.isCompleted

	if (needsOnboarding && isPlatformAdmin && !isAdminPage) {
		const handleStartOnboarding = () => {
			router.push(`/admin/onboarding/${activeOrganizationId}`)
		}

		const handleSkipOnboarding = async () => {
			setIsSkipping(true)
			try {
				await checkAndAutoComplete({
					organizationId: activeOrganizationId,
					forceComplete: true,
				})
			} finally {
				setIsSkipping(false)
			}
		}

		return (
			<div className="flex h-screen w-full items-center justify-center bg-muted/30 p-4">
				<Card className="w-full max-w-lg">
					<CardHeader className="text-center">
						<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
							<AlertCircle className="h-6 w-6 text-amber-600" />
						</div>
						<CardTitle className="text-xl">Configuración Pendiente</CardTitle>
						<CardDescription className="text-base">
							<span className="font-medium text-foreground">
								{activeOrganization?.name ?? "Esta empresa"}
							</span>{" "}
							no ha completado el proceso de configuración inicial.
						</CardDescription>
					</CardHeader>
					<CardFooter className="flex flex-col gap-3 sm:flex-row">
						<Button
							variant="outline"
							className="w-full sm:w-auto"
							onClick={handleSkipOnboarding}
							disabled={isSkipping}
						>
							{isSkipping ? (
								<>
									<div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
									Marcando...
								</>
							) : (
								<>
									<CheckCircle className="mr-2 h-4 w-4" />
									Marcar como completado
								</>
							)}
						</Button>
						<Button
							className="w-full sm:flex-1"
							onClick={handleStartOnboarding}
						>
							Iniciar configuración
							<ArrowRight className="ml-2 h-4 w-4" />
						</Button>
					</CardFooter>
				</Card>
			</div>
		)
	}

	return <>{children}</>
}
