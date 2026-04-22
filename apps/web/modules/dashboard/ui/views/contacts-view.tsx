"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Doc } from "@workspace/backend/_generated/dataModel"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card"
import type { Column } from "@workspace/ui/components/data-table"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { DataViewerLayout } from "@workspace/ui/layout/data-viewer-layout"
import { useConvex, useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { format, formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import {
	BanIcon,
	CheckCircleIcon,
	DownloadIcon,
	EditIcon,
	Loader2Icon,
	MapPinIcon,
	MessageCircleIcon,
	MoreHorizontalIcon,
	PhoneIcon,
	ShoppingCartIcon,
	UploadIcon,
	UserIcon,
} from "lucide-react"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"
import {
	type ContactForExport,
	downloadContactsCSV,
	generateContactsCSV,
} from "@/lib/export-contacts"
import { ContactsImportDialog } from "../components/contacts-import-dialog"
import { EditContactDialog } from "../components/edit-contact-dialog"

// Extended contact type with computed fields
type ContactWithDetails = Doc<"contacts"> & {
	conversationCount: number
	lastConversation?: {
		_id: string
		status: "unresolved" | "escalated" | "resolved"
	} | null
	orderCount: number
}

export const ContactsView = () => {
	const { activeOrganizationId } = useOrganization()
	const convexClient = useConvex()

	// Pagination state
	const [pageSize, setPageSize] = useState(10)
	const [cursor, setCursor] = useState<string | null>(null)
	const [prevCursors, setPrevCursors] = useState<string[]>([])

	// Search state
	const {
		value: searchValue,
		debouncedValue: searchQuery,
		setValue: setSearchValue,
		clearSearch,
		isSearching,
	} = useDebouncedSearch("", 300)

	// View mode state
	const [viewMode, setViewMode] = useState<"table" | "cards">("table")
	const isMobile = useIsMobile()

	useEffect(() => {
		setViewMode(isMobile ? "cards" : "table")
	}, [isMobile])

	// Dialog state
	const [editDialogOpen, setEditDialogOpen] = useState(false)
	const [selectedContact, setSelectedContact] =
		useState<Doc<"contacts"> | null>(null)

	// Confirmation dialog state
	const [blockDialogOpen, setBlockDialogOpen] = useState(false)
	const [contactToBlock, setContactToBlock] = useState<Doc<"contacts"> | null>(
		null
	)

	// Import dialog state
	const [importDialogOpen, setImportDialogOpen] = useState(false)

	// Export state
	const [isExporting, setIsExporting] = useState(false)

	// Mutations
	const updateContact = useMutation(api.private.contacts.update)

	// Get contacts with pagination and search
	const contactsResult = useQuery(
		api.private.contacts.getByOrganization,
		activeOrganizationId
			? {
				organizationId: activeOrganizationId,
				paginationOpts: { numItems: pageSize, cursor },
				searchQuery: searchQuery || undefined,
			}
			: "skip"
	)

	// Pagination handlers
	const handleNext = () => {
		if (contactsResult?.continueCursor) {
			setPrevCursors((prev) => [...prev, cursor || ""])
			setCursor(contactsResult.continueCursor)
		}
	}

	const handlePrev = () => {
		if (prevCursors.length > 0) {
			const newPrevCursors = [...prevCursors]
			const prevCursor = newPrevCursors.pop()
			setPrevCursors(newPrevCursors)
			setCursor(prevCursor || null)
		}
	}

	const resetPagination = useCallback(() => {
		setCursor(null)
		setPrevCursors([])
	}, [])

	// Reset pagination when search changes
	useEffect(() => {
		if (searchQuery) {
			resetPagination()
		}
	}, [searchQuery, resetPagination])

	// Dialog handlers
	const handleEditContact = (contact: Doc<"contacts">) => {
		setSelectedContact(contact)
		setEditDialogOpen(true)
	}

	const handleToggleBlock = (contact: Doc<"contacts">) => {
		setContactToBlock(contact)
		setBlockDialogOpen(true)
	}

	const handleConfirmBlock = async () => {
		if (!contactToBlock || !activeOrganizationId) return

		try {
			const newBlockedStatus = !contactToBlock.isBlocked
			await updateContact({
				organizationId: activeOrganizationId,
				contactId: contactToBlock._id,
				isBlocked: newBlockedStatus,
			})

			toast.success(
				newBlockedStatus
					? "Contacto bloqueado exitosamente"
					: "Contacto desbloqueado exitosamente"
			)

			setBlockDialogOpen(false)
			setContactToBlock(null)
		} catch (error) {
			toast.error(handleConvexError(error))
		}
	}

	const handleEditSuccess = () => {
		// Refresh the contacts data
		// The useQuery will automatically refetch when the mutation completes
	}

	const handleExport = useCallback(async () => {
		if (!activeOrganizationId) return

		setIsExporting(true)
		try {
			const contacts = await convexClient.query(
				api.private.contacts.getAllForExport,
				{
					organizationId: activeOrganizationId,
				}
			)

			if (!contacts || contacts.length === 0) {
				toast.info("No hay contactos para exportar")
				return
			}

			const csv = generateContactsCSV(contacts as ContactForExport[])
			const today = format(new Date(), "yyyy-MM-dd")
			downloadContactsCSV(csv, `contactos_${today}.csv`)
			toast.success("Contactos exportados exitosamente")
		} catch (error) {
			console.error("Error exporting contacts:", error)
			toast.error("Error al exportar contactos")
		} finally {
			setIsExporting(false)
		}
	}, [activeOrganizationId, convexClient])

	const {
		page: contacts,
		isDone,
		continueCursor,
	} = contactsResult || {
		page: [],
		isDone: true,
		continueCursor: null,
	}

	// Define columns for contacts
	const contactColumns: Column<ContactWithDetails>[] = [
		{
			key: "contact",
			header: "Contacto",
			render: (contact) => (
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
						<UserIcon className="h-4 w-4" />
					</div>
					<div>
						<div className="font-medium">
							{contact.displayName || "Sin nombre"}
						</div>
					</div>
				</div>
			),
		},
		{
			key: "phoneNumber",
			header: "Número de Teléfono",
			render: (contact) => (
				<div className="flex items-center gap-2">
					<PhoneIcon className="h-4 w-4 text-muted-foreground" />
					<span className="font-mono text-sm">{contact.phoneNumber}</span>
				</div>
			),
		},
		{
			key: "registrationDate",
			header: "Fecha de Registro",
			render: (contact) => (
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<div className="flex flex-col">
						<span>
							{format(new Date(contact._creationTime), "dd/MM/yyyy", {
								locale: es,
							})}
						</span>
						<span className="text-xs">
							{formatDistanceToNow(new Date(contact._creationTime), {
								addSuffix: true,
								locale: es,
							})}
						</span>
					</div>
				</div>
			),
		},
		{
			key: "status",
			header: "Estado",
			render: (contact) =>
				contact.isBlocked === true ? (
					<Badge variant="destructive">Bloqueado</Badge>
				) : (
					<Badge variant="secondary">Activo</Badge>
				),
		},
		{
			key: "conversations",
			header: "Conversaciones",
			render: (contact) => (
				<div className="flex items-center gap-2">
					<MessageCircleIcon className="h-4 w-4 text-muted-foreground" />
					<span>{contact.conversationCount}</span>
					{contact.lastConversation && (
						<Badge
							variant={
								contact.lastConversation.status === "unresolved"
									? "destructive"
									: contact.lastConversation.status === "escalated"
										? "default"
										: "secondary"
							}
						>
							{contact.lastConversation.status === "unresolved"
								? "Sin resolver"
								: contact.lastConversation.status === "escalated"
									? "Escalada"
									: "Resuelta"}
						</Badge>
					)}
				</div>
			),
		},
		{
			key: "orders",
			header: "Pedidos",
			render: (contact) => (
				<div className="flex items-center gap-2">
					<ShoppingCartIcon className="h-4 w-4 text-muted-foreground" />
					<span>{contact.orderCount || 0}</span>
				</div>
			),
		},
		{
			key: "lastAddress",
			header: "Última Dirección",
			render: (contact) =>
				contact.lastKnownAddress ? (
					<div className="flex max-w-[200px] items-center gap-2">
						<MapPinIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
						<span className="truncate text-muted-foreground text-sm">
							{contact.lastKnownAddress}
						</span>
					</div>
				) : (
					<span className="text-muted-foreground text-sm">Sin dirección</span>
				),
		},
		{
			key: "lastActivity",
			header: "Última Actividad",
			render: (contact) =>
				contact.lastMessageAt ? (
					<span className="text-muted-foreground text-sm">
						{formatDistanceToNow(new Date(contact.lastMessageAt), {
							addSuffix: true,
							locale: es,
						})}
					</span>
				) : (
					<span className="text-muted-foreground text-sm">Nunca</span>
				),
		},
		{
			key: "actions",
			header: "Acciones",
			render: (contact) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="h-8 w-8 p-0">
							<span className="sr-only">Abrir menú</span>
							<MoreHorizontalIcon className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => handleEditContact(contact)}>
							<EditIcon className="mr-2 h-4 w-4" />
							Editar
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => handleToggleBlock(contact)}
							className={contact.isBlocked ? "text-green-600" : "text-red-600"}
						>
							{contact.isBlocked ? (
								<>
									<CheckCircleIcon className="mr-2 h-4 w-4" />
									Desbloquear
								</>
							) : (
								<>
									<BanIcon className="mr-2 h-4 w-4" />
									Bloquear
								</>
							)}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	]

	// Render card function for contacts
	const renderContactCard = (contact: ContactWithDetails) => (
		<Card className="gap-2 transition-shadow hover:shadow-md">
			<CardHeader>
				<div className="flex items-start gap-2 overflow-hidden">
					<div className="min-w-0 flex-1">
						<CardTitle className="flex flex-1 items-center gap-2 text-lg">
							<div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
								<UserIcon className="h-4 w-4" />
							</div>
							<span className="ellipsis">
								{contact.displayName || "Sin nombre"}
							</span>
						</CardTitle>
						<div className="flex items-center gap-2">
							<PhoneIcon className="h-4 w-4 text-muted-foreground" />
							<span className="font-mono text-sm">{contact.phoneNumber}</span>
						</div>
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" className="h-8 w-8 p-0">
								<span className="sr-only">Abrir menú</span>
								<MoreHorizontalIcon className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => handleEditContact(contact)}>
								<EditIcon className="mr-2 h-4 w-4" />
								Editar
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => handleToggleBlock(contact)}
								className={
									contact.isBlocked ? "text-green-600" : "text-red-600"
								}
							>
								{contact.isBlocked ? (
									<>
										<CheckCircleIcon className="mr-2 h-4 w-4" />
										Desbloquear
									</>
								) : (
									<>
										<BanIcon className="mr-2 h-4 w-4" />
										Bloquear
									</>
								)}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</CardHeader>
			<CardContent className="space-y-2">
				<div className="flex justify-between gap-2">
					<div>
						<p className="mb-1 text-muted-foreground text-sm">Estado</p>
						{contact.isBlocked === true ? (
							<Badge variant="destructive">Bloqueado</Badge>
						) : (
							<Badge variant="secondary">Activo</Badge>
						)}
					</div>
					<div>
						<p className="mb-1 text-muted-foreground text-sm">Pedidos</p>
						<div className="flex items-center gap-2">
							<ShoppingCartIcon className="h-4 w-4 text-muted-foreground" />
							<span>{contact.orderCount || 0}</span>
						</div>
					</div>
				</div>

				<div className="flex justify-between gap-2">
					<div>
						<p className="mb-1 text-muted-foreground text-sm">Conversaciones</p>
						<div className="flex items-center gap-2">
							<MessageCircleIcon className="h-4 w-4 text-muted-foreground" />
							<span>{contact.conversationCount}</span>
							{contact.lastConversation && (
								<Badge
									variant={
										contact.lastConversation.status === "unresolved"
											? "destructive"
											: contact.lastConversation.status === "escalated"
												? "default"
												: "secondary"
									}
								>
									{contact.lastConversation.status === "unresolved"
										? "Sin resolver"
										: contact.lastConversation.status === "escalated"
											? "Escalada"
											: "Resuelta"}
								</Badge>
							)}
						</div>
					</div>
					<div>
						<p className="mb-1 text-muted-foreground text-sm">
							Última Actividad
						</p>
						{contact.lastMessageAt ? (
							<span className="text-sm capitalize">
								{formatDistanceToNow(new Date(contact.lastMessageAt), {
									addSuffix: true,
									locale: es,
								})}
							</span>
						) : (
							<span className="text-muted-foreground text-sm">Nunca</span>
						)}
					</div>
				</div>
				{contact.lastKnownAddress && (
					<div>
						<p className="mb-1 text-muted-foreground text-sm">
							Última Dirección
						</p>
						<div className="flex items-center gap-2">
							<MapPinIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
							<span className="ellipsis text-sm">
								{contact.lastKnownAddress}
							</span>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	)

	return (
		<>
			<DataViewerLayout
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				searchProps={{
					value: searchValue,
					onChange: setSearchValue,
					placeholder: "Buscar por nombre o teléfono...",
				}}
				actions={
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={handleExport}
							disabled={isExporting}
						>
							{isExporting ? (
								<>
									<Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
									Exportando...
								</>
							) : (
								<>
									<DownloadIcon className="mr-2 h-4 w-4" />
									Exportar
								</>
							)}
						</Button>
						<Link href="/contacts/import">
							<Button variant="outline" size="sm">
								<UploadIcon className="mr-2 h-4 w-4" />
								Importar
							</Button>
						</Link>
					</div>
				}
				data={contactsResult?.page || []}
				tableColumns={contactColumns}
				renderCard={renderContactCard}
				paginationProps={{
					state: { pageSize, cursor, prevCursors },
					actions: {
						setPageSize,
						handleNext,
						handlePrev,
						resetPagination,
					},
					info: { isDone, continueCursor },
					pageSizeOptions: [10, 20, 50],
				}}
				loading={contactsResult === undefined}
				error={
					contactsResult instanceof Error ||
						contactsResult instanceof ConvexError ||
						contactsResult === null
						? new Error("Error al cargar contactos")
						: null
				}
				emptyState={{
					icon: <UserIcon className="h-12 w-12" />,
					title: searchQuery
						? "No se encontraron contactos"
						: "No hay contactos",
					description: searchQuery
						? `No hay contactos que coincidan con "${searchQuery}". Intenta con otro término de búsqueda.`
						: "Los contactos aparecerán aquí cuando los clientes inicien conversaciones",
				}}
				itemName={{ singular: "contacto", plural: "contactos" }}
			/>

			{/* Edit Contact Dialog */}
			<EditContactDialog
				open={editDialogOpen}
				onOpenChange={setEditDialogOpen}
				contact={selectedContact}
				onSuccess={handleEditSuccess}
			/>

			{/* Block/Unblock Confirmation Dialog */}
			<AlertDialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{contactToBlock?.isBlocked
								? "Desbloquear Contacto"
								: "Bloquear Contacto"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{contactToBlock?.isBlocked
								? `¿Estás seguro de que quieres desbloquear a ${contactToBlock.displayName || contactToBlock.phoneNumber}? El contacto podrá iniciar nuevas conversaciones.`
								: `¿Estás seguro de que quieres bloquear a ${contactToBlock?.displayName || contactToBlock?.phoneNumber}? El contacto no podrá iniciar nuevas conversaciones.`}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleConfirmBlock}
							className={
								contactToBlock?.isBlocked
									? "bg-primary hover:bg-primary-200 hover:text-black"
									: "bg-red-600 hover:bg-red-700"
							}
						>
							{contactToBlock?.isBlocked ? "Desbloquear" : "Bloquear"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Import Contacts Dialog */}
			<ContactsImportDialog
				isOpen={importDialogOpen}
				onClose={() => setImportDialogOpen(false)}
				onImportComplete={() => {
					// Data will automatically refresh via Convex reactivity
				}}
			/>
		</>
	)
}
