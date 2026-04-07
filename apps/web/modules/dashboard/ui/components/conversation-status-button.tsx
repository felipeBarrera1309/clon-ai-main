import type { Doc, Id } from "@workspace/backend/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import { ArrowRightIcon, ArrowUpIcon, BugIcon, CheckIcon } from "lucide-react"
import { useState } from "react"

export const ConversationStatusButton = ({
  status,
  onStatusChange,
  disabled,
  showDebugReport,
  conversationId,
  threadId,
  contactDisplayName,
  onDebugReport,
  existingDebugReason,
  existingExpectedResponse,
}: {
  status: Doc<"conversations">["status"]
  onStatusChange: (status: Doc<"conversations">["status"]) => void
  disabled?: boolean
  showDebugReport?: boolean
  conversationId?: Id<"conversations">
  threadId?: string
  contactDisplayName?: string
  onDebugReport?: (reason: string, expectedResponse?: string) => Promise<void>
  existingDebugReason?: string | null
  existingExpectedResponse?: string | null
}) => {
  const [debugDialogOpen, setDebugDialogOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [expectedResponse, setExpectedResponse] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // When dialog opens, start with empty fields (new info will be appended)
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setReason("")
      setExpectedResponse("")
    }
    setDebugDialogOpen(open)
  }

  const statusConfig = {
    unresolved: {
      icon: ArrowRightIcon,
      label: "No resuelto",
      variant: "destructive" as const,
    },
    escalated: {
      icon: ArrowUpIcon,
      label: "Escalado",
      variant: "warning" as const,
    },
    resolved: {
      icon: CheckIcon,
      label: "Resuelto",
      variant: "tertiary" as const,
    },
  }

  const currentStatus = statusConfig[status]
  const Icon = currentStatus.icon

  const handleValueChange = (value: string) => {
    if (value === "debug") {
      handleOpenChange(true)
      return
    }
    onStatusChange(value as Doc<"conversations">["status"])
  }

  const handleDebugSubmit = async () => {
    if (!reason.trim() || !onDebugReport) return

    setIsSubmitting(true)
    try {
      await onDebugReport(reason.trim(), expectedResponse.trim() || undefined)
      setDebugDialogOpen(false)
      setReason("")
      setExpectedResponse("")
    } catch {
      // Error handled by parent
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Select
        value={status}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger
          className={`h-8 gap-2 border px-3 text-white transition-colors ${
            currentStatus.variant === "destructive"
              ? "bg-destructive hover:bg-destructive/90"
              : currentStatus.variant === "warning"
                ? "bg-yellow-500 hover:bg-yellow-600"
                : "bg-primary hover:bg-green-600"
          }`}
          chevronClassName="text-white"
        >
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-white" />
            <span className="font-medium text-sm">{currentStatus.label}</span>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unresolved">
            <div className="flex items-center gap-2">
              <ArrowRightIcon className="h-4 w-4 text-white" />
              <span>No resuelto</span>
            </div>
          </SelectItem>
          <SelectItem value="escalated">
            <div className="flex items-center gap-2">
              <ArrowUpIcon className="h-4 w-4 text-white" />
              <span>Escalado</span>
            </div>
          </SelectItem>
          <SelectItem value="resolved">
            <div className="flex items-center gap-2">
              <CheckIcon className="h-4 w-4 text-white" />
              <span>Resuelto</span>
            </div>
          </SelectItem>
          {showDebugReport && (
            <SelectItem value="debug">
              <div className="flex items-center gap-2">
                <BugIcon className="h-4 w-4" />
                <span>Report Debug</span>
              </div>
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      {/* Debug Report Dialog */}
      <Dialog open={debugDialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {existingDebugReason
                ? "Actualizar Reporte de Debug"
                : "Agregar a Lista de Debug"}
            </DialogTitle>
            <DialogDescription>
              {existingDebugReason
                ? "Esta conversación ya tiene un reporte. La nueva información se agregará al historial existente."
                : "Indica la razón por la que estás reportando esta conversación para debug."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Conversación</Label>
              <p className="font-mono text-sm">
                {threadId ? `${threadId.slice(0, 24)}...` : conversationId}
              </p>
              {contactDisplayName && (
                <p className="text-muted-foreground text-sm">
                  Contacto: {contactDisplayName}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="debug-reason">Razón *</Label>
              <Textarea
                id="debug-reason"
                placeholder={
                  existingDebugReason
                    ? "Agrega información adicional al reporte..."
                    : "Ej: El agente se inventó una respuesta, la información proporcionada es incorrecta, etc."
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="max-h-[150px] resize-y overflow-auto break-all"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expected-response">Cómo debería responder</Label>
              <Textarea
                id="expected-response"
                placeholder={
                  existingExpectedResponse
                    ? "Agrega más detalles sobre cómo debería haber respondido el agente..."
                    : "Describe qué debería haber dicho el bot en este caso..."
                }
                value={expectedResponse}
                onChange={(e) => setExpectedResponse(e.target.value)}
                className="max-h-[150px] resize-y overflow-auto break-all"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleDebugSubmit}
              disabled={!reason.trim() || isSubmitting}
            >
              {isSubmitting
                ? existingDebugReason
                  ? "Actualizando..."
                  : "Agregando..."
                : existingDebugReason
                  ? "Actualizar"
                  : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
