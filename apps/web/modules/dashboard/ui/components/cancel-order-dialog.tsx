"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Doc } from "@workspace/backend/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { useMutation } from "convex/react"
import { useState } from "react"
import { toast } from "sonner"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"

interface CancelOrderDialogProps {
  order: Doc<"orders">
  children: React.ReactNode
}

export const CancelOrderDialog = ({
  order,
  children,
}: CancelOrderDialogProps) => {
  const { activeOrganizationId } = useOrganization()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const cancelOrder = useMutation(api.private.orders.updateStatus)

  const handleCancel = async () => {
    if (!reason.trim()) {
      toast.error("Debes proporcionar una razón para la cancelación")
      return
    }
    if (!activeOrganizationId) return

    setIsLoading(true)
    try {
      await cancelOrder({
        id: order._id,
        organizationId: activeOrganizationId,
        status: "cancelado",
      })

      toast.success("Pedido cancelado exitosamente")
      setOpen(false)
      setReason("")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Cancelar Pedido</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de que quieres cancelar el pedido #{order.orderNumber}
            ? Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="reason">Razón de la cancelación *</Label>
            <Textarea
              id="reason"
              placeholder="Ej: Producto agotado, Dirección incorrecta, Solicitud del cliente..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
            <p className="text-muted-foreground text-sm">
              Esta razón será enviada al cliente por mensaje.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={isLoading || !reason.trim()}
          >
            {isLoading ? "Cancelando..." : "Confirmar Cancelación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
