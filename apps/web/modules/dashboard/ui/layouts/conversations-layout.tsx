"use client"

import type { Id } from "@workspace/backend/_generated/dataModel"
import { DetailsListLayout } from "@workspace/ui/layout/detail-list-layout"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { ConversationsPanel } from "../components/conversations-panel"
import { ConversationIdView } from "../views/conversation-id-view"

export interface ConversationWithDetails {
	_id: string
	_creationTime: number
	status: "unresolved" | "escalated" | "resolved"
	contact?: {
		_id: string
		phoneNumber: string
		displayName?: string
	}
	whatsappConfiguration?: {
		_id: string
		displayName?: string
		phoneNumber: string
	}
	order?: {
		_id: string
		orderNumber: string
		status:
		| "programado"
		| "pendiente"
		| "preparando"
		| "listo_para_recoger"
		| "en_camino"
		| "entregado"
		| "cancelado"
	}
	lastMessageAt?: number
	lastMessage?: {
		text?: string
		message?: {
			role: "user" | "assistant"
		}
	}
	threadId?: string
	organizationId: string
}

interface ConversationsLayoutProps {
	children: React.ReactNode
	selectedConversationId?: string
}

export function ConversationsLayout({
	selectedConversationId,
}: ConversationsLayoutProps & { children: React.ReactNode }) {
	const router = useRouter()

	// Create a stub conversation object for real conversations so MasterDetailLayout has something to work with
	const finalSelectedConversation = useMemo(() => {
		if (!selectedConversationId) return null

		// For real conversations, create a stub object with just the ID
		// The ConversationIdView will handle the actual fetching
		return {
			_id: selectedConversationId,
			_creationTime: 0,
			status: "unresolved" as const,
			contact: {
				_id: "",
				phoneNumber: "",
			},
			organizationId: "",
		} as ConversationWithDetails
	}, [selectedConversationId])

	// Handle item selection - navigate to the conversation URL
	const handleSelectedItemChange = (item: ConversationWithDetails | null) => {
		if (item) {
			router.push(`/conversations/${item._id}`)
		} else {
			router.push("/conversations")
		}
	}

	return (
		<DetailsListLayout<ConversationWithDetails>
			selectedItem={finalSelectedConversation}
			onSelectedItemChange={handleSelectedItemChange}
			sidebarContent={({ onSelectItem }) => (
				<ConversationsPanel
					onSelectConversation={(conversation) => {
						// Cast the conversation to ConversationWithDetails
						// The actual data from the query includes all required fields
						onSelectItem(conversation)
					}}
				/>
			)}
			detailContent={({ selectedItem, onBack, isMobile }) => {
				if (!selectedItem) {
					return (
						<div className="flex h-full flex-col items-center justify-center p-6 text-center">
							<div className="max-w-md">
								<h3 className="mb-2 font-semibold text-lg">
									Selecciona una conversación
								</h3>
								<p className="text-muted-foreground">
									Haz clic en una conversación de la lista para ver sus detalles
									completos.
								</p>
							</div>
						</div>
					)
				}

				// Render the ConversationIdView directly in the layout
				return (
					<ConversationIdView
						conversationId={selectedItem._id as Id<"conversations">}
						onBack={onBack}
						isMobile={isMobile}
					/>
				)
			}}
			config={{
				showSidebarOnMobile: false,
			}}
		/>
	)
}
