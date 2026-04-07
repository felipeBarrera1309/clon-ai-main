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
import { useMutation } from "convex/react"
import { useState } from "react"
import { toast } from "sonner"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"

interface ToggleOrderStatusDialogProps {
  order: Doc<"orders">
  type: "printed" | "paid"
  children: React.ReactNode
  onToggle?: (active: boolean) => void
}

export const ToggleOrderStatusDialog = ({
  order,
  type,
  children,
  onToggle,
}: ToggleOrderStatusDialogProps) => {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { activeOrganizationId } = useOrganization()

  const markAsPrinted = useMutation(api.private.orders.markAsPrinted)
  const unmarkAsPrinted = useMutation(api.private.orders.unmarkAsPrinted)
  const markAsPaid = useMutation(api.private.orders.markAsPaid)
  const unmarkAsPaid = useMutation(api.private.orders.unmarkAsPaid)

  const isCurrentlyActive =
    type === "printed" ? !!order.printedAt : !!order.paidAt
  const actionType = isCurrentlyActive ? "unmark" : "mark"

  const getDialogContent = () => {
    if (type === "printed") {
      if (isCurrentlyActive) {
        return {
          title: "Desmarcar como Impreso",
          description: `¿Estás seguro de que quieres desmarcar el pedido #${order.orderNumber} como impreso? Esto indicará que el pedido no ha sido impreso aún.`,
          confirmText: "Desmarcar como Impreso",
          confirmVariant: "destructive" as const,
        }
      } else {
        return {
          title: "Marcar como Impreso",
          description: `¿Estás seguro de que quieres marcar el pedido #${order.orderNumber} como impreso? Esto indicará que el pedido ya fue impreso.`,
          confirmText: "Marcar como Impreso",
          confirmVariant: "default" as const,
        }
      }
    } else {
      if (isCurrentlyActive) {
        return {
          title: "Desmarcar como Pagado",
          description: `¿Estás seguro de que quieres desmarcar el pedido #${order.orderNumber} como pagado? Esto indicará que el pedido no ha sido pagado aún.`,
          confirmText: "Desmarcar como Pagado",
          confirmVariant: "destructive" as const,
        }
      } else {
        return {
          title: "Marcar como Pagado",
          description: `¿Estás seguro de que quieres marcar el pedido #${order.orderNumber} como pagado? Esto indicará que el pedido ya fue pagado.`,
          confirmText: "Marcar como Pagado",
          confirmVariant: "default" as const,
        }
      }
    }
  }

  const handleToggle = async () => {
    if (!activeOrganizationId) return
    setIsLoading(true)
    try {
      if (type === "printed") {
        if (isCurrentlyActive) {
          await unmarkAsPrinted({
            id: order._id,
            organizationId: activeOrganizationId,
          })
          toast.success("Pedido desmarcado como impreso")
        } else {
          await markAsPrinted({
            id: order._id,
            organizationId: activeOrganizationId,
          })
          toast.success("Pedido marcado como impreso")
        }
      } else {
        if (isCurrentlyActive) {
          await unmarkAsPaid({
            id: order._id,
            organizationId: activeOrganizationId,
          })
          toast.success("Pedido desmarcado como pagado")
        } else {
          await markAsPaid({
            id: order._id,
            organizationId: activeOrganizationId,
          })
          toast.success("Pedido marcado como pagado")
        }
      }

      setOpen(false)
      // Call onToggle callback if provided
      onToggle?.(isCurrentlyActive)
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsLoading(false)
    }
  }

  const { title, description, confirmText, confirmVariant } = getDialogContent()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            variant={confirmVariant}
            onClick={handleToggle}
            disabled={isLoading}
          >
            {isLoading ? "Procesando..." : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
