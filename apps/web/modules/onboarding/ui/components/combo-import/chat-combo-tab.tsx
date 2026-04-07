"use client"

import { api } from "@workspace/backend/_generated/api"
import { Button } from "@workspace/ui/components/button"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"
import { useAction } from "convex/react"
import { BotIcon, Loader2Icon, SendIcon, UserIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { handleConvexError } from "@/lib/error-handling"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

interface ChatComboTabProps {
  organizationId: string
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "¡Hola! 👋 Soy tu asistente para crear combos. Puedo ayudarte a crear, editar y eliminar combos para tu restaurante.\n\nPor ejemplo, puedes decirme:\n• «Crea un combo almuerzo con precio base de $15.000»\n• «Muéstrame los productos del menú»\n• «Lista los combos que tenemos»\n\n¿Qué combo te gustaría crear?",
}

export function ChatComboTab({ organizationId }: ChatComboTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isCreatingThreadRef = useRef(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const messageCounterRef = useRef(0)

  const getOrCreateThread = useAction(
    api.system.ai.agents.comboBuilderAgent.getOrCreateComboBuilderThread
  )
  const sendMessage = useAction(
    api.system.ai.agents.comboBuilderAgent.sendComboBuilderMessage
  )

  useEffect(() => {
    if (isCreatingThreadRef.current || threadId) return
    isCreatingThreadRef.current = true

    getOrCreateThread({ organizationId })
      .then((result) => {
        setThreadId(result.threadId)
      })
      .catch((error) => {
        toast.error(handleConvexError(error))
      })
      .finally(() => {
        isCreatingThreadRef.current = false
        setIsInitializing(false)
      })
  }, [organizationId, getOrCreateThread, threadId])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    })
  }, [])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || !threadId || isLoading) return

    const userMsg: ChatMessage = {
      id: `user-${++messageCounterRef.current}`,
      role: "user",
      content: trimmed,
    }

    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsLoading(true)
    scrollToBottom()

    try {
      const result = await sendMessage({
        organizationId,
        threadId,
        message: trimmed,
      })

      const assistantMsg: ChatMessage = {
        id: `assistant-${++messageCounterRef.current}`,
        role: "assistant",
        content: result.response,
      }
      setMessages((prev) => [...prev, assistantMsg])
      scrollToBottom()
    } catch (error) {
      toast.error(handleConvexError(error))
      setInput(trimmed)
    } finally {
      setIsLoading(false)
    }
  }, [input, threadId, isLoading, sendMessage, organizationId, scrollToBottom])

  const isReady = threadId && !isInitializing

  return (
    <div className="flex h-[420px] flex-col">
      <ScrollArea ref={scrollAreaRef} className="flex-1 px-1">
        <div className="space-y-3 py-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex items-end gap-2",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <BotIcon className="h-3.5 w-3.5" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md bg-muted"
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              {msg.role === "user" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground/70">
                  <UserIcon className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-end gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BotIcon className="h-3.5 w-3.5" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground text-sm">
                    Procesando...
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="border-t pt-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={
              isReady
                ? "Escribe un mensaje..."
                : "Conectando con el asistente..."
            }
            disabled={!isReady || isLoading}
            className="max-h-[100px] min-h-[40px] flex-1 resize-none rounded-xl text-sm"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || !isReady || isLoading}
            className="h-10 w-10 shrink-0 rounded-xl"
          >
            {isLoading ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
