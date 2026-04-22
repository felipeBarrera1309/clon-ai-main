"use client"

import { api } from "@workspace/backend/_generated/api"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import { useMutation, useQuery } from "convex/react"
import {
	AlertCircleIcon,
	ArrowLeft,
	BookOpenIcon,
	BotIcon,
	CheckCircleIcon,
	CopyIcon,
	RotateCcwIcon,
	SaveIcon,
	SettingsIcon,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

const CORE_SECTIONS = [
	{
		key: "identity" as const,
		title: "Identidad y Propósito",
		description: "Define la identidad principal del asistente de IA",
		placeholder:
			"Ejemplo: Eres un asistente de IA especializado en atención al cliente...",
	},
	{
		key: "tools" as const,
		title: "Herramientas y Capacidades",
		description: "Describe las herramientas disponibles y sus funciones",
		placeholder: "Ejemplo: Tienes acceso a las siguientes herramientas...",
	},
	{
		key: "conversation" as const,
		title: "Flujo de Conversación",
		description: "Define cómo debe fluir la conversación",
		placeholder:
			"Ejemplo: Siempre inicia obteniendo información del contacto...",
	},
	{
		key: "operations" as const,
		title: "Operaciones y Reglas",
		description: "Reglas críticas de operación que no pueden modificarse",
		placeholder: "Ejemplo: Reglas críticas que no pueden modificarse...",
	},
]

export default function SuperAdminPromptBuilderPage() {
	const params = useParams()
	const router = useRouter()
	const organizationId = params.organizationId as string

	const [coreSections, setCoreSections] = useState({
		identity: "",
		tools: "",
		conversation: "",
		operations: "",
	})
	const [hasChanges, setHasChanges] = useState(false)
	const [saveStatus, setSaveStatus] = useState<
		"idle" | "saving" | "success" | "error"
	>("idle")

	const promptParts = useQuery(api.superAdmin.promptBuilder.getPromptParts, {
		organizationId,
	})

	const updateSection = useMutation(
		api.superAdmin.promptBuilder.updateCorePromptSection
	)
	const resetSection = useMutation(
		api.superAdmin.promptBuilder.resetCorePromptSection
	)

	useEffect(() => {
		if (promptParts) {
			setCoreSections({
				identity: promptParts.coreSections.identity,
				tools: promptParts.coreSections.tools,
				conversation: promptParts.coreSections.conversation,
				operations: promptParts.coreSections.operations,
			})
		}
	}, [promptParts])

	useEffect(() => {
		if (promptParts) {
			const originalSections = {
				identity: promptParts.coreSections.identity,
				tools: promptParts.coreSections.tools,
				conversation: promptParts.coreSections.conversation,
				operations: promptParts.coreSections.operations,
			}

			setHasChanges(
				JSON.stringify(coreSections) !== JSON.stringify(originalSections)
			)
		}
	}, [coreSections, promptParts])

	const handleSave = async () => {
		if (!hasChanges) return

		setSaveStatus("saving")
		try {
			const promises = Object.entries(coreSections).map(([section, content]) =>
				updateSection({
					organizationId,
					section,
					content: content.trim(),
				})
			)

			await Promise.all(promises)
			setSaveStatus("success")
			setTimeout(() => setSaveStatus("idle"), 3000)
		} catch {
			setSaveStatus("error")
			setTimeout(() => setSaveStatus("idle"), 3000)
		}
	}

	const handleResetSection = async (section: string) => {
		if (
			!confirm(
				`¿Estás seguro de que quieres restablecer la sección "${section}"?`
			)
		)
			return

		try {
			await resetSection({ organizationId, section })
			setSaveStatus("success")
			setTimeout(() => setSaveStatus("idle"), 3000)
		} catch {
			setSaveStatus("error")
			setTimeout(() => setSaveStatus("idle"), 3000)
		}
	}

	if (!promptParts) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<AlertCircleIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
					<p className="text-muted-foreground">
						Cargando configuración del prompt...
					</p>
				</div>
			</div>
		)
	}

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text)
	}

	return (
		<div className="flex h-full flex-col space-y-6 p-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Button variant="ghost" size="icon" onClick={() => router.back()}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div>
						<h1 className="flex items-center gap-2 font-bold text-3xl tracking-tight">
							Constructor de Prompts
						</h1>
						<p className="text-muted-foreground">
							Visualiza y modifica todas las partes del prompt del agente IA
						</p>
					</div>
				</div>
				<Button
					onClick={handleSave}
					disabled={!hasChanges || saveStatus === "saving"}
					className="flex items-center gap-2"
				>
					<SaveIcon className="h-4 w-4" />
					{saveStatus === "saving" ? "Guardando..." : "Guardar Cambios"}
				</Button>
			</div>

			{/* Status alerts */}
			{saveStatus === "success" && (
				<Alert className="border-green-200 bg-green-50">
					<CheckCircleIcon className="h-4 w-4 text-green-600" />
					<AlertDescription className="text-green-800">
						Cambios guardados exitosamente
					</AlertDescription>
				</Alert>
			)}

			{saveStatus === "error" && (
				<Alert className="border-red-200 bg-red-50">
					<AlertCircleIcon className="h-4 w-4 text-red-600" />
					<AlertDescription className="text-red-800">
						Error al guardar los cambios. Inténtalo de nuevo.
					</AlertDescription>
				</Alert>
			)}

			<div className="grid gap-6">
				{/* Context Information */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<BookOpenIcon className="h-5 w-5" />
							Información del Contexto
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-3 gap-4">
							<div className="text-center">
								<div className="font-bold text-2xl text-blue-600">
									{promptParts.contextInfo.menuItemsCount}
								</div>
								<div className="text-muted-foreground text-sm">
									Productos en Menú
								</div>
							</div>
							<div className="text-center">
								<div className="font-bold text-2xl text-green-600">
									{promptParts.contextInfo.restaurantLocationsCount}
								</div>
								<div className="text-muted-foreground text-sm">Ubicaciones</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Prompt Parts Display */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<SettingsIcon className="h-5 w-5" />
							Partes del Prompt
						</CardTitle>
					</CardHeader>
					<CardContent>
						<Tabs defaultValue="core-sections" className="w-full">
							<TabsList className="grid w-full grid-cols-3">
								<TabsTrigger value="core-sections">Secciones Core</TabsTrigger>
								<TabsTrigger value="custom-sections">
									Secciones Personalizadas
								</TabsTrigger>
								<TabsTrigger value="complete-prompt">
									Prompt Completo
								</TabsTrigger>
							</TabsList>

							<TabsContent value="core-sections" className="space-y-6">
								<div className="space-y-6">
									{CORE_SECTIONS.map((section) => (
										<div key={section.key} className="space-y-4">
											<div className="flex items-center justify-between">
												<h3 className="font-semibold text-lg">
													{section.title}
												</h3>
												<div className="flex gap-2">
													<Button
														size="sm"
														variant="outline"
														onClick={() => handleResetSection(section.key)}
														disabled={saveStatus === "saving"}
													>
														<RotateCcwIcon className="mr-1 h-4 w-4" />
														Resetear
													</Button>
												</div>
											</div>
											<Textarea
												value={coreSections[section.key]}
												onChange={(e) =>
													setCoreSections({
														...coreSections,
														[section.key]: e.target.value,
													})
												}
												placeholder={section.placeholder}
												rows={
													section.key === "conversation"
														? 20
														: section.key === "tools"
															? 12
															: 8
												}
												className="font-mono text-sm"
												maxLength={10000}
											/>
											<p className="text-muted-foreground text-xs">
												{coreSections[section.key].length}/10,000 caracteres
											</p>
										</div>
									))}
								</div>
							</TabsContent>

							<TabsContent value="custom-sections" className="space-y-6">
								<div className="space-y-6">
									<div>
										<h3 className="mb-4 font-semibold text-lg">
											Secciones Personalizadas
										</h3>
										<p className="mb-4 text-muted-foreground text-sm">
											Estas secciones se configuran desde la página de
											personalización del agente
										</p>
									</div>

									{/* Brand Voice */}
									<div className="space-y-2">
										<Label>Personalidad y Estilo</Label>
										<div className="rounded-lg bg-gray-50 p-4">
											<pre className="whitespace-pre-wrap font-mono text-sm">
												{promptParts.customSections.brandVoice ||
													"No configurado"}
											</pre>
										</div>
									</div>

									{/* Restaurant Context */}
									<div className="space-y-2">
										<Label>Contexto del Restaurante</Label>
										<div className="rounded-lg bg-gray-50 p-4">
											<pre className="whitespace-pre-wrap font-mono text-sm">
												{promptParts.customSections.restaurantContext ||
													"No configurado"}
											</pre>
										</div>
									</div>

									{/* Business Rules */}
									<div className="space-y-2">
										<Label>Reglas del Negocio</Label>
										<div className="rounded-lg bg-gray-50 p-4">
											<pre className="whitespace-pre-wrap font-mono text-sm">
												{promptParts.customSections.businessRules ||
													"No configurado"}
											</pre>
										</div>
									</div>

									{/* Custom Greeting */}
									<div className="space-y-2">
										<Label>Saludo Personalizado</Label>
										<div className="rounded-lg bg-gray-50 p-4">
											<pre className="whitespace-pre-wrap font-mono text-sm">
												{promptParts.customSections.customGreeting ||
													"No configurado"}
											</pre>
										</div>
									</div>

									{/* Special Instructions */}
									<div className="space-y-2">
										<Label>Instrucciones Especiales</Label>
										<div className="rounded-lg bg-gray-50 p-4">
											<pre className="whitespace-pre-wrap font-mono text-sm">
												{promptParts.customSections.specialInstructions ||
													"No configurado"}
											</pre>
										</div>
									</div>
								</div>
							</TabsContent>

							<TabsContent value="complete-prompt" className="space-y-4">
								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<h3 className="font-semibold text-lg">
											Prompt Completo del Agente
										</h3>
										<Button
											size="sm"
											variant="outline"
											onClick={() =>
												copyToClipboard(promptParts?.completePrompt || "")
											}
										>
											<CopyIcon className="mr-1 h-4 w-4" />
											Copiar
										</Button>
									</div>

									<div className="max-h-96 overflow-y-auto rounded-lg border bg-gray-50 p-6">
										{promptParts?.completePrompt ? (
											<pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
												{promptParts.completePrompt}
											</pre>
										) : (
											<div className="text-center text-muted-foreground">
												<BotIcon className="mx-auto mb-4 h-12 w-12 opacity-50" />
												<p>No hay prompt completo disponible</p>
											</div>
										)}
									</div>
								</div>
							</TabsContent>
						</Tabs>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
