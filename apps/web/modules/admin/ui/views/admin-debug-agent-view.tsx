"use client";

import { api } from "@workspace/backend/_generated/api";
import {
	AIConversation,
	AIConversationContent,
	AIConversationScrollButton,
} from "@workspace/ui/components/ai/conversation";
import {
	AIInput,
	AIInputSubmit,
	AIInputTextarea,
	AIInputToolbar,
	AIInputTools,
} from "@workspace/ui/components/ai/input";
import {
	AIMessage,
	AIMessageContent,
} from "@workspace/ui/components/ai/message";
import { AIResponse } from "@workspace/ui/components/ai/response";
import {
	AITool,
	AIToolContent,
	AIToolHeader,
	AIToolParameters,
	AIToolResult,
} from "@workspace/ui/components/ai/tool";
import { Button } from "@workspace/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { useAction, usePaginatedQuery, useQuery } from "convex/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
	Loader2,
	MessageSquare,
	Plus,
	Settings,
	Trash2,
	User,
	Wrench,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { usePlatformSuperAdmin } from "@/hooks/use-platform-admin";
import { handleConvexError } from "@/lib/error-handling";
import type { DebugAgentThreadSummary } from "@/modules/admin/types";
import { DebugContextHeader } from "@/modules/admin/ui/components/debug-context-header";
import { DebugOrgScopeSwitcher } from "@/modules/admin/ui/components/debug-org-scope-switcher";
import {
	type DebugMessageDoc,
	extractDebugMessageText,
	normalizeDebugMessagesChronological,
} from "@/modules/admin/ui/utils/debug-message-utils";

const normalizeMessage = (value: string) =>
	value.trim().toLowerCase().replace(/\s+/g, " ");

function dedupeVisibleMessages(messages: DebugMessageDoc[]) {
	const deduped: DebugMessageDoc[] = [];

	for (const message of messages) {
		const currentRole = message.message?.role;
		const prev = deduped[deduped.length - 1];
		if (!currentRole) continue;

		if (!prev) {
			deduped.push(message);
			continue;
		}

		// Only dedupe immediate user echoes to avoid dropping tool/system events.
		if (currentRole !== "user" || prev.message?.role !== "user") {
			deduped.push(message);
			continue;
		}

		const currentText = normalizeMessage(extractDebugMessageText(message));
		const prevText = normalizeMessage(extractDebugMessageText(prev));
		const isNearDuplicate =
			prevText.length > 0 &&
			prevText === currentText &&
			Math.abs(message._creationTime - prev._creationTime) < 4_000;

		if (!isNearDuplicate) {
			deduped.push(message);
		}
	}

	return deduped;
}

type ToolPart = {
	type: "tool-call" | "tool_use" | "tool-result" | "tool_result" | string;
	toolName?: string;
	toolCallId?: string;
	args?: unknown;
	result?: unknown;
	isError?: boolean;
	output?: { type?: string; value?: unknown };
};

const getContentParts = (message: DebugMessageDoc): ToolPart[] =>
	Array.isArray(message.message?.content)
		? (message.message.content as ToolPart[])
		: [];

const getToolCalls = (message: DebugMessageDoc): ToolPart[] =>
	getContentParts(message).filter(
		(part) => part.type === "tool-call" || part.type === "tool_use",
	);

const getToolResults = (message: DebugMessageDoc): ToolPart[] =>
	getContentParts(message).filter(
		(part) => part.type === "tool-result" || part.type === "tool_result",
	);

const getToolDisplayName = (part: ToolPart, index: number): string => {
	const toolName = part.toolName?.trim();
	if (toolName) return toolName;
	if (part.toolCallId?.trim()) {
		return `Tool ${part.toolCallId.slice(0, 8)}...`;
	}
	return `Tool #${index + 1}`;
};

const getToolResultPayload = (part: ToolPart): unknown =>
	part.result ?? part.output?.value ?? {};

const toRecord = (value: unknown): Record<string, unknown> => {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return { value };
};

export function AdminDebugAgentView() {
	const router = useRouter();
	const params = useParams();
	const organizationId = params.organizationId as string;
	const isSuperAdmin = usePlatformSuperAdmin();

	const [message, setMessage] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [threadId, setThreadId] = useState<string | null>(null);
	const [sendingThreadId, setSendingThreadId] = useState<string | null>(null);
	const [isCreatingNewThread, setIsCreatingNewThread] = useState(false);
	const [isDeletingThread, setIsDeletingThread] = useState(false);
	const [optimisticMessage, setOptimisticMessage] = useState<string | null>(
		null,
	);

	const isCreatingThreadRef = useRef(false);
	const isSendingRef = useRef(false);
	const prevOrgIdRef = useRef<string | null>(null);
	const recentlyCreatedThreadIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (isSuperAdmin === false) {
			router.push("/admin");
		}
	}, [isSuperAdmin, router]);

	const orgInfo = useQuery(
		api.superAdmin.debugAgent.getOrganizationInfo,
		isSuperAdmin ? { organizationId } : "skip",
	);

	const threads = useQuery(
		api.superAdmin.debugAgent.listThreads,
		isSuperAdmin ? { organizationId } : "skip",
	);

	const getOrCreateThread = useAction(
		api.superAdmin.debugAgent.getOrCreateThread,
	);
	const createNewThreadAction = useAction(
		api.superAdmin.debugAgent.createNewThread,
	);
	const sendMessageAction = useAction(api.superAdmin.debugAgent.sendMessage);
	const deleteThreadAction = useAction(api.superAdmin.debugAgent.deleteThread);

	const messagesQuery = usePaginatedQuery(
		api.superAdmin.debugAgent.getMessages,
		threadId && isSuperAdmin ? { organizationId, threadId } : "skip",
		{ initialNumItems: 50 },
	);

	const normalizedMessages = useMemo(
		() =>
			normalizeDebugMessagesChronological(
				messagesQuery.results as DebugMessageDoc[] | undefined,
			),
		[messagesQuery.results],
	);

	const visibleMessages = useMemo(() => {
		const timeline = normalizedMessages.filter((msg) => {
			const role = msg.message?.role;
			if (!role) return false;
			const text = extractDebugMessageText(msg).trim();
			const hasToolCalls = getToolCalls(msg).length > 0;
			const hasToolResults = getToolResults(msg).length > 0;

			return (
				text.length > 0 ||
				hasToolCalls ||
				hasToolResults ||
				role === "tool" ||
				role === "system"
			);
		});

		return dedupeVisibleMessages(timeline);
	}, [normalizedMessages]);

	const hasOptimisticEcho = useMemo(() => {
		if (!optimisticMessage) return false;
		const normalizedOptimistic = normalizeMessage(optimisticMessage);
		if (!normalizedOptimistic) return false;

		return visibleMessages.some(
			(msg) =>
				msg.message?.role === "user" &&
				normalizeMessage(extractDebugMessageText(msg)) === normalizedOptimistic,
		);
	}, [optimisticMessage, visibleMessages]);

	useEffect(() => {
		if (
			prevOrgIdRef.current !== null &&
			prevOrgIdRef.current !== organizationId
		) {
			setThreadId(null);
			setMessage("");
			setOptimisticMessage(null);
			isCreatingThreadRef.current = false;
			isSendingRef.current = false;
			recentlyCreatedThreadIdRef.current = null;
			setIsSending(false);
		}
		prevOrgIdRef.current = organizationId;
	}, [organizationId]);

	useEffect(() => {
		if (!isSuperAdmin) return;
		if (threads === undefined) return;

		if (threadId && threads.some((thread) => thread.threadId === threadId)) {
			if (recentlyCreatedThreadIdRef.current === threadId) {
				recentlyCreatedThreadIdRef.current = null;
			}
			return;
		}

		if (threadId && recentlyCreatedThreadIdRef.current === threadId) {
			return;
		}

		if (threadId) {
			return;
		}

		if (threads.length > 0 && !threadId) {
			setThreadId(threads[0]?.threadId ?? null);
			return;
		}

		if (!isCreatingThreadRef.current) {
			isCreatingThreadRef.current = true;
			getOrCreateThread({ organizationId })
				.then((result) => {
					setThreadId(result.threadId);
				})
				.catch((error) => {
					toast.error(handleConvexError(error));
				})
				.finally(() => {
					isCreatingThreadRef.current = false;
				});
		}
	}, [organizationId, getOrCreateThread, isSuperAdmin, threadId, threads]);

	const handleSend = async (messageOverride?: string) => {
		const messageToSend = (messageOverride ?? message).trim();
		const activeThreadId = threadId;

		if (!messageToSend || !activeThreadId) return;
		if (isSendingRef.current) return;

		isSendingRef.current = true;
		setIsSending(true);
		setSendingThreadId(activeThreadId);
		setOptimisticMessage(messageToSend);

		if (!messageOverride) {
			setMessage("");
		}

		try {
			const sendTimeoutMs = 45_000;

			const result = await Promise.race([
				sendMessageAction({
					organizationId,
					threadId: activeThreadId,
					message: messageToSend,
				}),
				new Promise<never>((_, reject) => {
					setTimeout(() => reject(new Error("SEND_TIMEOUT")), sendTimeoutMs);
				}),
			]);

			if (result.fallbackUsed) {
				toast.warning(
					"El agente respondió con fallback de recuperación. Puedes reenviar para reintentar el análisis.",
				);
			} else if (result.retried) {
				toast.info(
					"Se aplicó reintento automático para completar la respuesta.",
				);
			}
		} catch (error) {
			if (error instanceof Error && error.message === "SEND_TIMEOUT") {
				toast.error(
					"El agente está tardando más de lo esperado. Recarga la página o intenta nuevamente.",
				);
			} else {
				toast.error(handleConvexError(error));
			}

			if (!messageOverride) {
				setMessage(messageToSend);
			}
		} finally {
			setTimeout(() => {
				setOptimisticMessage(null);
			}, 300);
			setIsSending(false);
			setSendingThreadId(null);
			isSendingRef.current = false;
		}
	};

	const handleCreateNewThread = async () => {
		if (isCreatingNewThread) return;

		setIsCreatingNewThread(true);
		try {
			const result = await createNewThreadAction({ organizationId });
			recentlyCreatedThreadIdRef.current = result.threadId;
			setThreadId(result.threadId);
			setMessage("");
			setOptimisticMessage(null);
			toast.success("Nueva conversación creada");
		} catch (error) {
			toast.error(handleConvexError(error));
		} finally {
			setIsCreatingNewThread(false);
		}
	};

	const handleDeleteThread = async () => {
		if (!threadId || isDeletingThread || isSending) return;

		const confirmation = window.confirm(
			"¿Seguro que quieres borrar esta conversación de debug? Se eliminará el hilo completo con sus mensajes y no se podrá recuperar.",
		);

		if (!confirmation) return;

		setIsDeletingThread(true);
		try {
			const result = await deleteThreadAction({
				organizationId,
				threadId,
			});

			recentlyCreatedThreadIdRef.current = null;
			setThreadId(result.nextThreadId);
			setMessage("");
			setOptimisticMessage(null);
			toast.success("Conversación eliminada");
		} catch (error) {
			toast.error(handleConvexError(error));
		} finally {
			setIsDeletingThread(false);
		}
	};

	if (isSuperAdmin === undefined || isSuperAdmin === false) {
		return (
			<div className="flex h-[50vh] items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (!orgInfo) {
		return <LoadingSkeleton />;
	}

	return (
		<div className="space-y-4">
			<DebugContextHeader
				title="Agente debug"
				description="Analiza conversaciones marcadas para debug en un chat dedicado y define mejoras accionables para el prompt."
				breadcrumbs={[
					{ label: "Debug conversaciones", href: "/admin/conversations" },
					{
						label: orgInfo.organizationName,
						href: `/admin/conversations/org/${organizationId}`,
					},
					{ label: "Agente debug" },
				]}
				actions={[
					{
						label: "Ver todas las organizaciones debug",
						href: "/admin/conversations",
					},
					{
						label: "Ver conversaciones de esta organización",
						href: `/admin/conversations/org/${organizationId}`,
					},
				]}
			/>

			<DebugOrgScopeSwitcher
				organizationId={organizationId}
				currentView="agent"
			/>

			<div className="flex h-[calc(100vh-14rem)] flex-col overflow-hidden rounded-lg border bg-background">
				<div className="flex flex-wrap items-center gap-2 border-b p-3">
					<Select
						value={threadId ?? undefined}
						onValueChange={(value) => setThreadId(value)}
						disabled={
							!threads || threads.length === 0 || isSending || isDeletingThread
						}
					>
						<SelectTrigger className="w-full min-w-[240px] max-w-[420px]">
							<SelectValue placeholder="Selecciona una conversación" />
						</SelectTrigger>
						<SelectContent>
							{(threads as DebugAgentThreadSummary[] | undefined)?.map(
								(thread) => (
									<SelectItem key={thread.threadId} value={thread.threadId}>
										{thread.threadId.slice(0, 18)}... ·{" "}
										{format(new Date(thread.lastMessageAt), "dd/MM HH:mm", {
											locale: es,
										})}
									</SelectItem>
								),
							)}
						</SelectContent>
					</Select>

					<Button
						variant="outline"
						onClick={handleCreateNewThread}
						disabled={isCreatingNewThread || isSending || isDeletingThread}
					>
						{isCreatingNewThread ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Plus className="mr-2 h-4 w-4" />
						)}
						Nueva conversación
					</Button>

					<Button
						variant="outline"
						onClick={handleDeleteThread}
						disabled={!threadId || isDeletingThread || isSending}
					>
						{isDeletingThread ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Trash2 className="mr-2 h-4 w-4" />
						)}
						Borrar conversación
					</Button>
				</div>

				<AIConversation className="flex-1">
					<AIConversationContent>
						{messagesQuery.status === "CanLoadMore" && (
							<div className="flex justify-center py-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => messagesQuery.loadMore(50)}
								>
									Cargar más mensajes
								</Button>
							</div>
						)}

						{messagesQuery.status === "LoadingFirstPage" && (
							<div className="flex h-full min-h-[220px] items-center justify-center">
								<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
							</div>
						)}

						{messagesQuery.status !== "LoadingFirstPage" &&
							visibleMessages.length === 0 &&
							!isSending &&
							!optimisticMessage && (
								<div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 text-center">
									<MessageSquare className="h-12 w-12 text-muted-foreground" />
									<div className="space-y-1">
										<h3 className="font-semibold text-lg">Agente debug</h3>
										<p className="max-w-md text-muted-foreground text-sm">
											Usa este chat para analizar conversaciones de debug y
											proponer cambios concretos del prompt del agente.
										</p>
									</div>
								</div>
							)}

						{visibleMessages.map((msg) => {
							const role = msg.message?.role;
							if (!role) return null;

							const text = extractDebugMessageText(msg).trim();
							const toolCalls = getToolCalls(msg);
							const toolResults = getToolResults(msg);
							const hasContent =
								text.length > 0 ||
								toolCalls.length > 0 ||
								toolResults.length > 0;

							const isSystem = role === "system";
							const isTool = role === "tool";
							const isUserMessage = role === "user";
							const from = isUserMessage ? "user" : "assistant";

							if (!hasContent && !isSystem && !isTool) return null;

							return (
								<AIMessage
									from={from}
									key={msg._id}
									className={cn(
										isUserMessage ? "justify-end" : "justify-start",
										"[&_[data-icon='tail-out']]:hidden",
									)}
								>
									<AIMessageContent
										from={from}
										timestamp={msg._creationTime}
										className={cn(
											isUserMessage &&
											"border-transparent bg-primary text-primary-foreground",
											isSystem && "bg-secondary/40",
											isTool &&
											"border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20",
										)}
									>
										{isSystem && (
											<div className="mb-1 flex items-center gap-1 text-muted-foreground text-xs">
												<Settings className="h-3 w-3" />
												<span>Sistema</span>
											</div>
										)}

										{isTool && (
											<div className="mb-2 flex items-center gap-1 text-muted-foreground text-xs">
												<Wrench className="h-3 w-3" />
												<span>Tool message</span>
											</div>
										)}

										{text && (
											<AIResponse className="break-words [overflow-wrap:anywhere] [&_code]:break-all [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
												{text}
											</AIResponse>
										)}

										{(toolCalls.length > 0 || toolResults.length > 0) && (
											<div className="mt-3 space-y-2">
												{toolCalls.map((toolCall, index) => (
													<AITool
														key={`${msg._id}-tool-call-${toolCall.toolCallId ?? index}`}
													>
														<AIToolHeader
															name={getToolDisplayName(toolCall, index)}
															status="running"
														/>
														<AIToolContent>
															{toolCall.toolCallId && (
																<p className="font-mono text-muted-foreground text-xs">
																	callId: {toolCall.toolCallId}
																</p>
															)}
															<AIToolParameters
																parameters={toRecord(toolCall.args)}
															/>
														</AIToolContent>
													</AITool>
												))}

												{toolResults.map((toolResult, index) => (
													<AITool
														key={`${msg._id}-tool-result-${toolResult.toolCallId ?? index}`}
														defaultOpen={Boolean(toolResult.isError)}
													>
														<AIToolHeader
															name={getToolDisplayName(toolResult, index)}
															status={
																toolResult.isError ? "error" : "completed"
															}
														/>
														<AIToolContent>
															{toolResult.toolCallId && (
																<p className="font-mono text-muted-foreground text-xs">
																	callId: {toolResult.toolCallId}
																</p>
															)}
															{toolResult.args !== undefined &&
																toolResult.args !== null && (
																	<AIToolParameters
																		parameters={toRecord(toolResult.args)}
																	/>
																)}
															<AIToolResult
																error={
																	toolResult.isError
																		? JSON.stringify(
																			getToolResultPayload(toolResult),
																			null,
																			2,
																		)
																		: undefined
																}
																result={
																	<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words">
																		{JSON.stringify(
																			getToolResultPayload(toolResult),
																			null,
																			2,
																		)}
																	</pre>
																}
															/>
														</AIToolContent>
													</AITool>
												))}
											</div>
										)}
										{!text &&
											toolCalls.length === 0 &&
											toolResults.length === 0 && (
												<div className="text-muted-foreground text-sm">
													Mensaje sin contenido textual
												</div>
											)}
									</AIMessageContent>
								</AIMessage>
							);
						})}

						{optimisticMessage && !hasOptimisticEcho && (
							<AIMessage
								from="user"
								className="justify-end [&_[data-icon='tail-out']]:hidden"
							>
								<AIMessageContent
									from="user"
									className="border-transparent bg-primary text-primary-foreground opacity-70"
								>
									<AIResponse className="break-words [overflow-wrap:anywhere] [&_code]:break-all [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
										{optimisticMessage}
									</AIResponse>
								</AIMessageContent>
							</AIMessage>
						)}

						{isSending && (
							<AIMessage
								from="assistant"
								className="justify-start [&_[data-icon='tail-out']]:hidden"
							>
								<AIMessageContent
									from="assistant"
									className="bg-background text-foreground"
								>
									<div className="flex items-center gap-2 text-muted-foreground">
										<Loader2 className="h-4 w-4 animate-spin" />
										<span className="text-sm">
											El agente está pensando
											{sendingThreadId ? " en este hilo..." : "..."}
										</span>
									</div>
								</AIMessageContent>
							</AIMessage>
						)}
					</AIConversationContent>
					<AIConversationScrollButton />
				</AIConversation>

				<div className="border-t p-3">
					<AIInput
						onSubmit={(event) => {
							event.preventDefault();
							handleSend();
						}}
						onKeyDownCapture={(event) => {
							const target = event.target as HTMLElement;
							if (
								target instanceof HTMLTextAreaElement &&
								event.key === "Enter" &&
								!event.shiftKey
							) {
								event.preventDefault();
								handleSend();
							}
						}}
					>
						<AIInputTextarea
							value={message}
							onChange={(event) => setMessage(event.target.value)}
							placeholder="Escribe un mensaje para el agente de debug..."
							disabled={isSending || !threadId}
							maxHeight={220}
						/>
						<AIInputToolbar>
							<AIInputTools>
								<div className="flex items-center gap-1 pl-2 text-muted-foreground text-xs">
									<Wrench className="h-3.5 w-3.5" />
									<span>Debug de conversaciones</span>
								</div>
							</AIInputTools>
							<AIInputSubmit
								disabled={!message.trim() || isSending || !threadId}
								status={isSending ? "submitted" : "ready"}
							/>
						</AIInputToolbar>
					</AIInput>
					<div className="mt-2 flex items-center gap-1 text-muted-foreground text-xs">
						<User className="h-3.5 w-3.5" />
						<span>Enter para enviar, Shift+Enter para salto de línea</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function LoadingSkeleton() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-20 w-full" />
			<Skeleton className="h-20 w-full" />
			<Skeleton className="h-20 w-full" />
		</div>
	);
}
