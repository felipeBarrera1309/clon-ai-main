"use client"

import { Button } from "@workspace/ui/components/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table"
import {
	AlertCircle,
	ArrowLeft,
	CheckCircle,
	Download,
	FileSpreadsheet,
	Info,
	Phone,
	Upload,
	UserPlus,
	XCircle,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { ContactsImportDialog } from "@/modules/dashboard/ui/components/contacts-import-dialog"

const ContactsImportPage = () => {
	const [importDialogOpen, setImportDialogOpen] = useState(false)

	return (
		<div className="container mx-auto max-w-4xl space-y-8 p-6">
			<div className="flex items-center gap-4">
				<Link href="/contacts">
					<Button variant="ghost" size="sm">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Volver
					</Button>
				</Link>
				<div>
					<h1 className="font-bold text-3xl">Importar Contactos</h1>
					<p className="text-muted-foreground">
						Importa contactos masivamente desde un archivo CSV
					</p>
				</div>
			</div>

			<Card className="border-primary/20 bg-primary/5">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Upload className="h-5 w-5" />
						Importar desde CSV
					</CardTitle>
					<CardDescription>
						Sube tu archivo CSV con los contactos a importar
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col items-center gap-4 sm:flex-row">
						<a
							href="/contacts-import-template.csv"
							download="plantilla-contactos.csv"
						>
							<Button variant="outline" className="flex items-center gap-2">
								<Download className="h-4 w-4" />
								Descargar Plantilla
							</Button>
						</a>
						<Button
							size="lg"
							className="flex items-center gap-2"
							onClick={() => setImportDialogOpen(true)}
						>
							<Upload className="h-4 w-4" />
							Seleccionar Archivo CSV
						</Button>
					</div>
				</CardContent>
			</Card>

			<div className="border-t pt-8">
				<h2 className="mb-6 font-semibold text-muted-foreground text-xl">
					Guía de Importación
				</h2>

				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg">
								<FileSpreadsheet className="h-5 w-5" />
								Pasos para Importar
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<div className="space-y-2 text-center">
									<div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600">
										1
									</div>
									<h3 className="font-medium">Descargar Plantilla</h3>
									<p className="text-muted-foreground text-sm">
										Obtén el archivo CSV con el formato correcto
									</p>
								</div>
								<div className="space-y-2 text-center">
									<div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-green-100 font-semibold text-green-600">
										2
									</div>
									<h3 className="font-medium">Completar Datos</h3>
									<p className="text-muted-foreground text-sm">
										Agrega los números y datos de tus contactos
									</p>
								</div>
								<div className="space-y-2 text-center">
									<div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 font-semibold text-purple-600">
										3
									</div>
									<h3 className="font-medium">Importar</h3>
									<p className="text-muted-foreground text-sm">
										Sube el archivo y revisa antes de confirmar
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-lg">Estructura del Archivo</CardTitle>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Columna</TableHead>
										<TableHead>Requerida</TableHead>
										<TableHead>Descripción</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									<TableRow>
										<TableCell className="font-mono">telefono</TableCell>
										<TableCell>
											<CheckCircle className="h-4 w-4 text-green-600" />
										</TableCell>
										<TableCell>Número de teléfono (ej: 573001234567)</TableCell>
									</TableRow>
									<TableRow>
										<TableCell className="font-mono">nombre</TableCell>
										<TableCell>
											<XCircle className="h-4 w-4 text-gray-400" />
										</TableCell>
										<TableCell>Nombre del contacto</TableCell>
									</TableRow>
									<TableRow>
										<TableCell className="font-mono">direccion</TableCell>
										<TableCell>
											<XCircle className="h-4 w-4 text-gray-400" />
										</TableCell>
										<TableCell>Dirección del contacto</TableCell>
									</TableRow>
								</TableBody>
							</Table>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg">
								<Phone className="h-5 w-5" />
								Formato de Teléfonos
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<h4 className="font-medium text-green-600">
										✅ Formatos Aceptados
									</h4>
									<ul className="space-y-1 text-sm">
										<li>
											<code className="rounded bg-muted px-1">
												573001234567
											</code>{" "}
											- Internacional sin +
										</li>
										<li>
											<code className="rounded bg-muted px-1">
												+573001234567
											</code>{" "}
											- Internacional con +
										</li>
										<li>
											<code className="rounded bg-muted px-1">3001234567</code>{" "}
											- Colombiano (se agrega 57)
										</li>
									</ul>
								</div>
								<div className="space-y-2">
									<h4 className="font-medium text-red-600">❌ Evitar</h4>
									<ul className="space-y-1 text-sm">
										<li>• Espacios o guiones</li>
										<li>• Letras o caracteres especiales</li>
										<li>• Menos de 10 o más de 15 dígitos</li>
									</ul>
								</div>
							</div>

							<div className="rounded-lg bg-blue-50 p-3">
								<div className="flex items-start gap-2">
									<Info className="mt-0.5 h-4 w-4 text-blue-600" />
									<p className="text-blue-700 text-sm">
										Los números se normalizan automáticamente al formato
										colombiano (57XXXXXXXXXX).
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-lg">Ejemplo de Datos</CardTitle>
						</CardHeader>
						<CardContent>
							<pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
								{`telefono,nombre,direccion
"573001234567","Juan Perez","Calle 100 #15-20 Bogota"
"573009876543","Maria Garcia",""
"3007778899","Ana Rodriguez","Avenida 68 #23-45"`}
							</pre>
							<p className="mt-3 text-muted-foreground text-sm">
								Solo <strong>telefono</strong> es obligatorio. Usa comillas para
								evitar problemas con Excel.
							</p>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-lg">Errores Comunes</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
								<div className="rounded-lg border border-red-200 bg-red-50 p-3">
									<div className="mb-1 flex items-center gap-2">
										<AlertCircle className="h-4 w-4 text-red-600" />
										<h4 className="font-medium text-red-800 text-sm">
											Teléfono Inválido
										</h4>
									</div>
									<p className="text-red-600 text-xs">
										Verifica que tenga 10-15 dígitos sin letras.
									</p>
								</div>

								<div className="rounded-lg border border-red-200 bg-red-50 p-3">
									<div className="mb-1 flex items-center gap-2">
										<AlertCircle className="h-4 w-4 text-red-600" />
										<h4 className="font-medium text-red-800 text-sm">
											Columna No Encontrada
										</h4>
									</div>
									<p className="text-red-600 text-xs">
										Asegúrate de tener el encabezado &quot;telefono&quot;.
									</p>
								</div>

								<div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
									<div className="mb-1 flex items-center gap-2">
										<Info className="h-4 w-4 text-yellow-600" />
										<h4 className="font-medium text-sm text-yellow-800">
											Duplicados
										</h4>
									</div>
									<p className="text-xs text-yellow-600">
										Puedes omitir o actualizar contactos existentes.
									</p>
								</div>

								<div className="rounded-lg border border-red-200 bg-red-50 p-3">
									<div className="mb-1 flex items-center gap-2">
										<AlertCircle className="h-4 w-4 text-red-600" />
										<h4 className="font-medium text-red-800 text-sm">
											Archivo Vacío
										</h4>
									</div>
									<p className="text-red-600 text-xs">
										Debe tener encabezados y al menos una fila de datos.
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg">
								<UserPlus className="h-5 w-5" />
								Mejores Prácticas
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<ul className="space-y-1 text-sm">
									<li>• Verifica que los números sean válidos</li>
									<li>• Elimina filas vacías o incompletas</li>
									<li>• Prueba con un archivo pequeño primero</li>
								</ul>
								<ul className="space-y-1 text-sm">
									<li>• Guarda el archivo en UTF-8</li>
									<li>• Usa comas como separador</li>
									<li>• Máximo 5MB por archivo</li>
								</ul>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>

			<ContactsImportDialog
				isOpen={importDialogOpen}
				onClose={() => setImportDialogOpen(false)}
				onImportComplete={() => { }}
			/>
		</div>
	)
}

export default ContactsImportPage
