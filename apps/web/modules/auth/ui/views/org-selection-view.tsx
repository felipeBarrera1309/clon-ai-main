"use client"

import { api } from "@workspace/backend/_generated/api"
import { Button } from "@workspace/ui/components/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { useQuery } from "convex/react"
import { LogOut } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Loader } from "@/components/loader"
import { authClient } from "@/lib/auth-client"

export const OrgSelectionView = () => {
	const organizations = useQuery(api.auth.getUserOrganizations)
	const isPlatformAdmin = useQuery(api.auth.isPlatformAdmin)
	const isImplementor = useQuery(api.auth.isImplementor)
	const [isCreating, setIsCreating] = useState(false)
	const [isSigningOut, setIsSigningOut] = useState(false)
	const [orgName, setOrgName] = useState("")
	const [orgSlug, setOrgSlug] = useState("")

	const handleSignOut = async () => {
		setIsSigningOut(true)
		try {
			await authClient.signOut()
			window.location.href = "/sign-in"
		} catch (error) {
			console.error("Sign out error:", error)
			// Force redirect even on error
			window.location.href = "/sign-in"
		}
	}

	const handleSelectOrganization = async (orgId: string) => {
		try {
			const result = await authClient.organization.setActive({
				organizationId: orgId,
			})

			if (result.error) {
				// Log detailed error for debugging
				console.error("setActive error:", result.error)

				// Check if it's a membership issue
				if (result.error.status === 403) {
					toast.error(
						"No tienes permiso para acceder a esta organización. Por favor, contacta al administrador."
					)
					return
				}

				toast.error(result.error.message || "Error al seleccionar organización")
				return
			}

			toast.success("Organización seleccionada")
			// Use window.location to ensure full page reload and session sync
			window.location.href = "/dashboard"
		} catch (error) {
			console.error("setActive exception:", error)
			toast.error(
				"Error al seleccionar organización. Intenta cerrar sesión y volver a iniciar."
			)
		}
	}

	const handleCreateOrganization = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!orgName.trim() || !orgSlug.trim()) {
			toast.error("Por favor completa todos los campos")
			return
		}

		setIsCreating(true)
		try {
			const result = await authClient.organization.create({
				name: orgName,
				slug: orgSlug,
			})

			if (result?.data?.id) {
				await authClient.organization.setActive({
					organizationId: result.data.id,
				})
				toast.success("Organización creada y seleccionada")
				// Use window.location to ensure full page reload and session sync
				window.location.href = "/dashboard"
			}
		} catch (error: unknown) {
			const errorMessage =
				error instanceof Error ? error.message : "Error al crear organización"
			toast.error(errorMessage)
			console.error(error)
		} finally {
			setIsCreating(false)
		}
	}

	// This loading state should rarely be shown since OrganizationGuard
	// already handles the initial loading, but we keep it for safety
	if (
		organizations === undefined ||
		isPlatformAdmin === undefined ||
		isImplementor === undefined
	) {
		return (
			<div className="flex h-screen w-full items-center justify-center">
				<Loader />
			</div>
		)
	}

	const canCreateOrgs = isPlatformAdmin || isImplementor

	return (
		<div className="flex min-h-screen items-center justify-center p-6">
			<Card
				className="flex w-full max-w-2xl flex-col"
				style={{ maxHeight: "90vh" }}
			>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>Seleccionar Organización</CardTitle>
							<CardDescription>
								{organizations.length > 0
									? "Selecciona una organización para continuar"
									: canCreateOrgs
										? "Crea una nueva organización para continuar"
										: "No tienes organizaciones asignadas"}
							</CardDescription>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={handleSignOut}
							disabled={isSigningOut}
							className="text-muted-foreground hover:text-foreground"
						>
							{isSigningOut ? (
								<Loader size="sm" />
							) : (
								<>
									<LogOut className="mr-2 h-4 w-4" />
									Cerrar sesión
								</>
							)}
						</Button>
					</div>
				</CardHeader>
				<CardContent className="flex-1 space-y-4 overflow-y-auto">
					{organizations.length > 0 ? (
						<div className="space-y-2">
							<h3 className="font-semibold">Tus organizaciones:</h3>
							<div className="max-h-80 space-y-2 overflow-y-auto pr-1">
								{organizations.map((org) => (
									<Button
										key={org._id}
										variant="outline"
										className="w-full justify-start"
										onClick={() => handleSelectOrganization(org._id)}
									>
										<div className="flex w-full items-center justify-between">
											<span>{org.name}</span>
										</div>
									</Button>
								))}
							</div>
						</div>
					) : (
						<div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
							<p className="text-yellow-800 dark:text-yellow-200">
								{canCreateOrgs
									? "No tienes organizaciones. Crea una nueva para continuar."
									: "No tienes organizaciones asignadas. Por favor, contacta con un administrador para que te asigne a una organización."}
							</p>
						</div>
					)}

					{canCreateOrgs && (
						<div className="border-t pt-4">
							<h3 className="mb-4 font-semibold">Crear nueva organización</h3>
							<form onSubmit={handleCreateOrganization} className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="orgName">Nombre</Label>
									<Input
										id="orgName"
										value={orgName}
										onChange={(e) => setOrgName(e.target.value)}
										placeholder="Mi Organización"
										disabled={isCreating}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="orgSlug">Slug (identificador único)</Label>
									<Input
										id="orgSlug"
										value={orgSlug}
										onChange={(e) =>
											setOrgSlug(
												e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")
											)
										}
										placeholder="mi-organizacion"
										disabled={isCreating}
									/>
								</div>
								<Button type="submit" disabled={isCreating} className="w-full">
									{isCreating ? (
										<>
											<Loader className="mr-2" size="sm" />
											Creando...
										</>
									) : (
										"Crear Organización"
									)}
								</Button>
							</form>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
