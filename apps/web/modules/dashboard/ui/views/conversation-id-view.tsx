/** biome-ignore-all lint/suspicious/noArrayIndexKey: Array index used for skeleton loading */
/** biome-ignore-all lint/style/noNonNullAssertion: Non-null assertion needed for optional chaining */
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import {
	AIConversation,
	AIConversationContent,
	AIConversationScrollButton,
} from "@workspace/ui/components/ai/conversation"
import {
	AIInput,
	AIInputButton,
	AIInputSubmit,
	AIInputTextarea,
	AIInputToolbar,
	AIInputTools,
} from "@workspace/ui/components/ai/input"
import {
	AIMessage,
	AIMessageContent,
	AudioAttachment,
	FileAttachment,
	ImageAttachment,
	InteractiveMessage,
	type InteractiveMessageData,
	LocationAttachment,
} from "@workspace/ui/components/ai/message"

import { AIResponse } from "@workspace/ui/components/ai/response"
import { Button } from "@workspace/ui/components/button"
import { Form, FormField } from "@workspace/ui/components/form"
import { InfiniteScrollTrigger } from "@workspace/ui/components/infinite-scroll-trigger"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useInfiniteScroll } from "@workspace/ui/hooks/use-infinite-scroll"
import { cn } from "@workspace/ui/lib/utils"
import {
	useAction,
	useMutation,
	usePaginatedQuery,
	useQuery,
} from "convex/react"
import {
	ArrowLeftIcon,
	ImageIcon,
	MessageSquareIcon,
	Wand2Icon,
	XIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"
import { ConversationStatusButton } from "../components/conversation-status-button"
import { OrderStatusBadge } from "../components/order-status-badge"
import { QuickResponseSelector } from "../components/quick-response-selector"

const formSchema = z.object({
	message: z.string().optional(),
})

export const ConversationIdView = ({
	conversationId,
	onBack,
	isMobile,
}: {
	conversationId: Id<"conversations">
	onBack?: () => void
	isMobile?: boolean
}) => {
	const { activeOrganizationId } = useOrganization()
	const router = useRouter()

	// Debug report mutation and existing debug query
	const addToDebug = useMutation(api.superAdmin.debugConversations.add)
	const existingDebugEntry = useQuery(
		api.superAdmin.debugConversations.getByConversation,
		activeOrganizationId
			? { organizationId: activeOrganizationId, conversationId }
			: "skip"
	)

	// Validate conversationId format and redirect if invalid
	useEffect(() => {
		if (!/^[a-z0-9]{16,}$/.test(conversationId)) {
			router.push("/conversations")
		}
	}, [conversationId, router])

	const conversation = useQuery(
		api.private.conversations.getOne,
		activeOrganizationId
			? { organizationId: activeOrganizationId, conversationId }
			: "skip"
	)

	// Use the new conversationMessages table for dashboard display
	const messagesQuery = usePaginatedQuery(
		api.private.conversationMessages.listByConversation,
		activeOrganizationId
			? { organizationId: activeOrganizationId, conversationId }
			: "skip",
		{ initialNumItems: 50 }
	)

	// Messages come in descending order (newest first), so reverse to show oldest->newest
	const messages = [...(messagesQuery.results ?? [])].reverse()

	// Infinite scroll hook for loading older messages
	const { topElementRef, handleLoadMore, canLoadMore, isLoadingMore } =
		useInfiniteScroll({
			status: messagesQuery.status,
			loadMore: messagesQuery.loadMore,
			numItems: 20,
		})

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			message: "",
		},
	})

	const [selectedImage, setSelectedImage] = useState<File | null>(null)
	const [imagePreview, setImagePreview] = useState<string | null>(null)
	const [showQuickResponses, setShowQuickResponses] = useState(false)
	const [quickResponseSearchQuery, setQuickResponseSearchQuery] = useState("")
	const fileInputRef = useRef<HTMLInputElement>(null)

	const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (file) {
			processImageFile(file)
		}
	}

	const processImageFile = (file: File) => {
		// Validate file type
		if (!file.type.startsWith("image/")) {
			toast.error("Por favor selecciona un archivo de imagen válido")
			return
		}

		// Validate file size (max 5MB)
		if (file.size > 5 * 1024 * 1024) {
			toast.error("La imagen no debe superar los 5MB")
			return
		}

		setSelectedImage(file)
		const reader = new FileReader()
		reader.onloadend = () => {
			setImagePreview(reader.result as string)
		}
		reader.readAsDataURL(file)
	}

	const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
		const items = e.clipboardData?.items
		if (!items) return

		for (let i = 0; i < items.length; i++) {
			const item = items[i]
			if (item?.type.startsWith("image/")) {
				e.preventDefault()
				const file = item.getAsFile()
				if (file) {
					processImageFile(file)
				}
				break // Only process the first image
			}
		}
	}

	const handleQuickResponseSelect = (content: string) => {
		const currentValue = form.getValues("message") || ""
		const slashIndex = currentValue.lastIndexOf("/")

		if (slashIndex !== -1) {
			// Replace everything from the last "/" to the end with the selected content
			const beforeSlash = currentValue.substring(0, slashIndex)
			const newValue = beforeSlash ? `${beforeSlash} ${content}` : content
			form.setValue("message", newValue)
		} else {
			// Fallback: append to current value
			const newValue = currentValue ? `${currentValue} ${content}` : content
			form.setValue("message", newValue)
		}

		setShowQuickResponses(false)
		setQuickResponseSearchQuery("")
	}

	const handleRemoveImage = () => {
		setSelectedImage(null)
		setImagePreview(null)
		if (fileInputRef.current) {
			fileInputRef.current.value = ""
		}
	}

	const [isEnhancing, setIsEnhancing] = useState(false)
	const enhanceResponse = useAction(api.private.messages.enhanceResponse)
	const handleEnhanceResponse = async () => {
		setIsEnhancing(true)
		const currentValue = form.getValues("message")

		try {
			const response = await enhanceResponse({ prompt: currentValue || "" })

			form.setValue("message", response)
		} catch (error) {
			toast.error(handleConvexError(error))
		} finally {
			setIsEnhancing(false)
		}
	}

	const uploadOperatorFile = useAction(api.public.files.uploadOperatorFile)
	const createMessage = useMutation(api.private.messages.create)
	const createMessageWithImage = useMutation(
		api.private.messages.createWithImage
	)
	const sendTypingIndicator = useAction(
		api.private.messages.sendOperatorTypingIndicator
	)

	// Typing indicator logic - send when operator is typing in escalated conversations
	const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const lastTypingSentRef = useRef<number>(0)
	const TYPING_DEBOUNCE_MS = 3000 // Send typing indicator every 3 seconds while typing

	const handleOperatorTyping = useCallback(() => {
		// Only send typing indicator for escalated conversations
		if (conversation?.status !== "escalated") return

		const now = Date.now()
		// Only send if enough time has passed since last send
		if (now - lastTypingSentRef.current < TYPING_DEBOUNCE_MS) return

		lastTypingSentRef.current = now
		sendTypingIndicator({ conversationId }).catch((error) => {
			// Silent fail - typing indicator is non-critical
			console.error("Error sending typing indicator:", error)
		})

		// Clear any existing timeout
		if (typingTimeoutRef.current) {
			clearTimeout(typingTimeoutRef.current)
		}

		// Set timeout to allow sending again after debounce period
		typingTimeoutRef.current = setTimeout(() => {
			typingTimeoutRef.current = null
		}, TYPING_DEBOUNCE_MS)
	}, [conversation?.status, conversationId, sendTypingIndicator])

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current)
			}
		}
	}, [])

	const onSubmit = async (values: z.infer<typeof formSchema>) => {
		if (!activeOrganizationId) return
		try {
			// If there's an image, upload it first to R2
			if (selectedImage) {
				// Convert File to ArrayBuffer for Convex bytes compatibility
				const arrayBuffer = await selectedImage.arrayBuffer()

				const storageId = await uploadOperatorFile({
					file: arrayBuffer,
					fileType: "image",
					contentType: selectedImage.type || "image/jpeg",
				})

				// Send message with image
				await createMessageWithImage({
					conversationId,
					storageId,
					caption: values.message,
				})

				// Clear image selection
				handleRemoveImage()
			} else if (values.message) {
				// Send text-only message
				await createMessage({
					conversationId,
					prompt: values.message,
				})
			} else {
				toast.error("Debes escribir un mensaje o seleccionar una imagen")
				return
			}

			form.reset()
		} catch (error) {
			toast.error(handleConvexError(error))
		}
	}

	const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
	const updateConversationStatus = useMutation(
		api.private.conversations.updateStatus
	)
	const handleStatusChange = async (
		newStatus: "unresolved" | "resolved" | "escalated"
	) => {
		if (
			!activeOrganizationId ||
			!conversation ||
			conversation.status === newStatus
		) {
			return
		}

		setIsUpdatingStatus(true)

		try {
			await updateConversationStatus({
				organizationId: activeOrganizationId,
				conversationId,
				status: newStatus,
			})
		} catch (error) {
			toast.error(handleConvexError(error))
		} finally {
			setIsUpdatingStatus(false)
		}
	}

	// Handle debug report submission
	const handleDebugReport = async (reason: string, expectedResponse?: string) => {
		if (!conversation || !activeOrganizationId) return

		const trimmedReason = reason.trim()
		const trimmedExpectedResponse = expectedResponse?.trim() || undefined

		try {
			const result = await addToDebug({
				organizationId: activeOrganizationId,
				conversationId,
				reason: trimmedReason,
				expectedResponse: trimmedExpectedResponse,
			})

			if (result.updated) {
				toast.success("Reporte de debug actualizado")
			} else {
				toast.success("Conversación agregada a la lista de debug")
			}
		} catch (error) {
			toast.error(handleConvexError(error))
			throw error // Re-throw to let the button know submission failed
		}
	}

	// Redirect if conversation doesn't exist
	useEffect(() => {
		if (conversation === null) {
			router.push("/conversations")
		}
	}, [conversation, router])

	if (conversation === undefined) {
		return <ConversationIdViewLoading />
	}

	if (conversation === null) {
		// Redirecting to /conversations
		return null
	}

	const displayName = conversation.contact.displayName ?? "Sin nombre"

	return (
		<div className="flex h-full flex-col">
			<header className="flex items-center justify-between border-b bg-background p-2.5">
				<div className="flex flex-wrap items-center gap-2">
					<div className="flex items-center gap-1">
						{isMobile && onBack && (
							<Button
								variant="ghost"
								size="icon"
								onClick={onBack}
								className="flex-shrink-0"
							>
								<ArrowLeftIcon className="h-5 w-5" />
							</Button>
						)}
						<div className="flex flex-col md:flex-row md:items-center md:gap-1">
							<span className="truncate font-bold">
								{displayName.length > 15
									? `${displayName.substring(0, 15)}...`
									: displayName}
							</span>
							<span className="truncate font-light text-sm">
								({conversation.contact.phoneNumber})
							</span>
						</div>
					</div>
					{conversation?.order && (
						<OrderStatusBadge
							status={conversation.order.status}
							orderNumber={conversation.order.orderNumber}
							onViewOrder={() =>
								router.push(`/orders/${conversation.order?._id}`)
							}
							{...(isMobile && { classNames: "py-0.5 px-1.5" })}
							noLabel
						/>
					)}
					{conversation?.whatsappConfiguration && isMobile && (
						<div className="flex items-center gap-1 rounded bg-alternative/20 px-1.5 py-0.5 font-medium text-primary text-sm">
							<span>{conversation.whatsappConfiguration.displayName}</span>
						</div>
					)}
				</div>
				<div className="flex gap-1">
					{conversation?.whatsappConfiguration && !isMobile && (
						<div className="flex items-center gap-1 rounded bg-alternative/20 px-2 py-1 font-medium text-primary text-sm">
							<span>{conversation.whatsappConfiguration.displayName}</span>
						</div>
					)}
					{!!conversation && (
						<ConversationStatusButton
							onStatusChange={handleStatusChange}
							status={conversation.status}
							disabled={isUpdatingStatus}
							showDebugReport
							conversationId={conversationId}
							threadId={conversation.threadId}
							contactDisplayName={conversation.contact?.displayName}
							onDebugReport={handleDebugReport}
							existingDebugReason={existingDebugEntry?.reason}
							existingExpectedResponse={existingDebugEntry?.expectedResponse}
						/>
					)}
				</div>
			</header>
			<AIConversation className="max-h-[calc(100vh-180px)]">
				<AIConversationContent>
					{/* Infinite scroll trigger at top for older messages */}
					<InfiniteScrollTrigger
						canLoadMore={canLoadMore}
						isLoadingMore={isLoadingMore}
						onLoadMore={handleLoadMore}
						loadMoreText="Cargar mensajes antiguos"
						noMoreText="No hay más mensajes"
						ref={topElementRef}
					/>
					{messages.map((message) => {
						const isInbound = message.direction === "inbound"
						const messageType = message.type
						const content = message.content

						// Determine the sender type for styling
						// user = cliente, advisor = operador humano (verde), assistant = AI/sistema (blanco por defecto)
						const getMessageFrom = (): "user" | "assistant" | "advisor" => {
							if (isInbound) return "user"
							// Use sender field if available, otherwise fallback to direction
							if (message.sender === "operator") return "advisor" // Operador = verde
							// agent and system messages show as assistant (blanco por defecto)
							return "assistant"
						}

						const messageFrom = getMessageFrom()

						return (
							<AIMessage from={messageFrom} key={message._id}>
								<AIMessageContent
									timestamp={message._creationTime}
									from={messageFrom}
								>
									{/* WhatsApp checkmarks for delivered/read status */}
									{message.status === "delivered" && (
										<span
											title="Entregado"
											style={{ position: "absolute", right: 8, bottom: 4 }}
										>
											<svg
												width="18"
												height="12"
												viewBox="0 0 18 12"
												fill="none"
												xmlns="http://www.w3.org/2000/svg"
											>
												<title>Entregado</title>
												<path
													d="M1 6.5L6 11L17 1"
													stroke="#A0A0A0"
													strokeWidth="2"
													fill="none"
												/>
											</svg>
										</span>
									)}
									{message.status === "read" && (
										<span
											title="Leído"
											style={{ position: "absolute", right: 8, bottom: 4 }}
										>
											<svg
												width="18"
												height="12"
												viewBox="0 0 18 12"
												fill="none"
												xmlns="http://www.w3.org/2000/svg"
											>
												<title>Leído</title>
												<path
													d="M1 6.5L6 11L17 1"
													stroke="#1976D2"
													strokeWidth="2"
													fill="none"
												/>
												<path
													d="M5 6.5L10 11L17 1"
													stroke="#1976D2"
													strokeWidth="2"
													fill="none"
												/>
											</svg>
										</span>
									)}
									{/* Audio messages */}
									{messageType === "audio" && content.media && (
										<AudioAttachment
											audioUrl={content.media.url}
											mimeType={content.media.mimeType}
											transcription={content.text}
											className="mb-3"
										/>
									)}

									{/* Image messages */}
									{messageType === "image" && content.media && (
										<ImageAttachment
											imageUrl={content.media.url}
											mimeType={content.media.mimeType}
											caption={content.media.caption || content.text}
											className="mb-3"
										/>
									)}

									{/* Document messages */}
									{messageType === "document" && content.media && (
										<FileAttachment
											fileUrl={content.media.url}
											mimeType={content.media.mimeType}
											fileName={content.media.filename}
											caption={content.media.caption || content.text}
											className="mb-3"
										/>
									)}

									{/* Location messages */}
									{messageType === "location" && content.location && (
										<LocationAttachment
											latitude={content.location.latitude}
											longitude={content.location.longitude}
											name={content.location.name}
											address={content.location.address}
											className="mb-3"
										/>
									)}

									{/* Text messages - show text if it's a text type or if there's text content without media/location */}
									{(messageType === "text" ||
										(content.text &&
											![
												"audio",
												"image",
												"document",
												"video",
												"location",
												"interactive",
											].includes(messageType))) && (
											<AIResponse>{content.text}</AIResponse>
										)}

									{/* Video messages - treat as file for now */}
									{messageType === "video" && content.media && (
										<FileAttachment
											fileUrl={content.media.url}
											mimeType={content.media.mimeType}
											fileName={content.media.filename || "video"}
											className="mb-3"
										/>
									)}

									{/* Interactive messages (buttons, lists, locations, etc.) */}
									{messageType === "interactive" && content.interactive && (
										<InteractiveMessage
											data={
												content.interactive as unknown as InteractiveMessageData
											}
										/>
									)}

									{/* Sticker messages - treat as image */}

									{messageType === "sticker" && content.media && (
										<ImageAttachment
											imageUrl={content.media.url}
											mimeType={content.media.mimeType}
											className="mb-3"
										/>
									)}
								</AIMessageContent>
							</AIMessage>
						)
					})}
				</AIConversationContent>
				<AIConversationScrollButton />
			</AIConversation>

			<div className="p-2">
				<Form {...form}>
					<AIInput onSubmit={form.handleSubmit(onSubmit)}>
						{imagePreview && (
							<div className="relative m-3 mb-2 inline-block">
								{/* biome-ignore lint/performance/noImgElement: Preview image from FileReader */}
								<img
									src={imagePreview}
									alt="Preview"
									className="h-32 w-auto rounded-lg border object-cover"
								/>
								<button
									type="button"
									onClick={handleRemoveImage}
									className="-right-2 -top-2 absolute rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
								>
									<XIcon className="h-4 w-4" />
								</button>
							</div>
						)}
						<FormField
							control={form.control}
							disabled={conversation?.status === "resolved"}
							name="message"
							render={({ field }) => (
								<AIInputTextarea
									disabled={
										conversation?.status === "resolved" ||
										form.formState.isSubmitting ||
										isEnhancing
									}
									onChange={(e) => {
										field.onChange(e)
										const value = e.target.value
										const hasSlash = value.includes("/")
										const afterLastSlash = value.substring(
											value.lastIndexOf("/") + 1
										)

										if (hasSlash) {
											setShowQuickResponses(true)
											setQuickResponseSearchQuery(afterLastSlash)
										} else {
											setShowQuickResponses(false)
											setQuickResponseSearchQuery("")
										}

										// Send typing indicator when operator is typing
										if (value.length > 0) {
											handleOperatorTyping()
										} else {
											// Reset debounce when text is cleared so next typing sends immediately
											lastTypingSentRef.current = 0
										}
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" && !e.shiftKey) {
											e.preventDefault()
											form.handleSubmit(onSubmit)()
										}
									}}
									onPaste={handlePaste}
									placeholder={
										conversation?.status === "resolved"
											? "Esta conversación ha sido resuelta"
											: selectedImage
												? "Escribe un mensaje opcional para la imagen..."
												: "Escribe tu respuesta como operador..."
									}
									value={field.value}
								/>
							)}
						/>
						<AIInputToolbar>
							<AIInputTools>
								<input
									ref={fileInputRef}
									type="file"
									accept="image/*"
									onChange={handleImageSelect}
									className="hidden"
								/>
								<QuickResponseSelector
									onSelect={handleQuickResponseSelect}
									open={showQuickResponses}
									onOpenChange={setShowQuickResponses}
									searchQuery={quickResponseSearchQuery}
									onSearchQueryChange={setQuickResponseSearchQuery}
								>
									<AIInputButton
										onClick={() => setShowQuickResponses(true)}
										disabled={
											conversation?.status === "resolved" ||
											form.formState.isSubmitting ||
											isEnhancing
										}
										type="button"
									>
										<MessageSquareIcon className="h-4 w-4" />
										Plantillas
									</AIInputButton>
								</QuickResponseSelector>
								<AIInputButton
									onClick={() => fileInputRef.current?.click()}
									disabled={
										conversation?.status === "resolved" ||
										form.formState.isSubmitting ||
										!!selectedImage
									}
									type="button"
								>
									<ImageIcon />
									Imagen
								</AIInputButton>
								<AIInputButton
									onClick={handleEnhanceResponse}
									disabled={
										conversation?.status === "resolved" ||
										isEnhancing ||
										!form.getValues("message") ||
										selectedImage !== null
									}
									type="button"
								>
									<Wand2Icon />
									{isEnhancing ? "Mejorando..." : "Mejorar"}
								</AIInputButton>
							</AIInputTools>
							<AIInputSubmit
								disabled={
									conversation?.status === "resolved" ||
									form.formState.isSubmitting ||
									isEnhancing ||
									(!form.getValues("message") && !selectedImage)
								}
								status="ready"
								type="submit"
							/>
						</AIInputToolbar>
					</AIInput>
				</Form>
			</div>
		</div>
	)
}

export const ConversationIdViewLoading = () => {
	return (
		<div className="flex h-full flex-col bg-muted">
			<header className="flex items-center justify-between border-b bg-background p-2.5"></header>
			<AIConversation className="max-h-[calc(100vh-180px)]">
				<AIConversationContent>
					{Array.from({ length: 8 }, (_, index) => {
						const isUser = index % 2 === 0
						const widths = ["w-48", "w-60", "w-72"]
						const width = widths[index % widths.length]

						return (
							<div
								className={cn(
									"group flex w-full items-end gap-2 py-2 [&>div]:max-w-[80%]",
									isUser ? "justify-start" : "flex-row-reverse justify-end"
								)}
								key={index}
							>
								<Skeleton
									className={`h-9 ${width} rounded-lg bg-neutral-200`}
								/>
								<Skeleton className="size-8 rounded-full bg-neutral-200" />
							</div>
						)
					})}
				</AIConversationContent>
			</AIConversation>

			<div className="p-2">
				<AIInput>
					<AIInputTextarea
						disabled
						placeholder="Escribe tu respuesta como operador..."
					/>
					<AIInputToolbar>
						<AIInputTools />
						<AIInputSubmit disabled status="ready" />
					</AIInputToolbar>
				</AIInput>
			</div>
		</div>
	)
}
