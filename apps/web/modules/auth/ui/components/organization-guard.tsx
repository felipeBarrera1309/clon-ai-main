"use client"

import { Button } from "@workspace/ui/components/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card"
import { LogOut } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Loader } from "@/components/loader"
import { useOrganization } from "@/hooks/use-organization"
import { authClient } from "@/lib/auth-client"
import { AuthLayout } from "@/modules/auth/ui/layouts/auth-layout"
import { OrgSelectionView } from "@/modules/auth/ui/views/org-selection-view"

const LOADING_TIMEOUT_MS = 15000 // 15 seconds

export const OrganizationGuard = ({
	children,
}: {
	children: React.ReactNode
}) => {
	const {
		activeOrganization: activeOrg,
		organizations,
		isLoading,
	} = useOrganization()
	const [isAutoSelecting, setIsAutoSelecting] = useState(false)
	const [loadingTimedOut, setLoadingTimedOut] = useState(false)
	const [isSigningOut, setIsSigningOut] = useState(false)
	const autoSelectAttempted = useRef(false)

	// Timeout for loading state to prevent infinite white screen
	useEffect(() => {
		const timer = setTimeout(() => {
			if (isLoading) {
				console.error("Loading timed out - showing recovery options")
				setLoadingTimedOut(true)
			}
		}, LOADING_TIMEOUT_MS)

		return () => clearTimeout(timer)
	}, [isLoading])

	// Auto-select organization if user has only one
	useEffect(() => {
		// Skip if we've already attempted auto-selection
		if (autoSelectAttempted.current) {
			return
		}

		// Wait for data to load
		if (isLoading) {
			return
		}

		// If user already has an active org, no need to auto-select
		if (activeOrg !== null) {
			return
		}

		// If user has exactly one organization, select it automatically
		if (organizations.length === 1) {
			const singleOrg = organizations[0]
			if (!singleOrg) return

			// Mark that we're attempting auto-selection to prevent re-renders
			autoSelectAttempted.current = true
			setIsAutoSelecting(true)

			authClient.organization
				.setActive({
					organizationId: singleOrg._id,
				})
				.then((result) => {
					if (result.error) {
						console.error("Auto-select organization error:", result.error)
						// Reset on error so user can see the selection screen
						setIsAutoSelecting(false)
						autoSelectAttempted.current = false
						return
					}
					// Use window.location to ensure full page reload and session sync
					window.location.reload()
				})
				.catch((error) => {
					console.error("Error auto-selecting organization:", error)
					// Reset on error so user can see the selection screen
					setIsAutoSelecting(false)
					autoSelectAttempted.current = false
				})
		}
	}, [activeOrg, organizations, isLoading])

	const handleSignOut = async () => {
		setIsSigningOut(true)
		try {
			await authClient.signOut()
			window.location.href = "/sign-in"
		} catch (error) {
			console.error("Sign out error:", error)
			window.location.href = "/sign-in"
		}
	}

	// Show timeout error with recovery options
	if (loadingTimedOut) {
		return (
			<AuthLayout>
				<div className="container mx-auto max-w-md p-6">
					<Card>
						<CardHeader>
							<CardTitle>Problema de conexión</CardTitle>
							<CardDescription>
								No pudimos cargar tu información. Esto puede deberse a un
								problema de conexión o de sesión.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<Button
								variant="outline"
								className="w-full"
								onClick={() => window.location.reload()}
							>
								Reintentar
							</Button>
							<Button
								variant="destructive"
								className="w-full"
								onClick={handleSignOut}
								disabled={isSigningOut}
							>
								{isSigningOut ? (
									<Loader size="sm" />
								) : (
									<>
										<LogOut className="mr-2 h-4 w-4" />
										Cerrar sesión e intentar de nuevo
									</>
								)}
							</Button>
						</CardContent>
					</Card>
				</div>
			</AuthLayout>
		)
	}

	// Show unified loading state while:
	// 1. Data is still loading
	// 2. Auto-selecting single organization
	if (isLoading || isAutoSelecting) {
		return (
			<div className="flex h-screen w-full items-center justify-center">
				<Loader />
			</div>
		)
	}

	// Only show organization selection if:
	// 1. No active org
	// 2. Not auto-selecting
	// 3. User has 0 or multiple organizations
	if (!activeOrg) {
		return (
			<AuthLayout>
				<OrgSelectionView />
			</AuthLayout>
		)
	}

	return <>{children}</>
}
