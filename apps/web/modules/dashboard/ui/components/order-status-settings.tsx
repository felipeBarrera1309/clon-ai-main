"use client"

import { DEFAULT_ORDER_STATUS_MESSAGES } from "@workspace/backend/lib/orderStatusConstants"
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
import { BellIcon, BikeIcon, ShoppingBagIcon } from "lucide-react"

type OrderStatusMessageGroup = Partial<
  typeof DEFAULT_ORDER_STATUS_MESSAGES.delivery
>

interface OrderStatusSettingsProps {
  messages: {
    delivery?: OrderStatusMessageGroup
    pickup?: OrderStatusMessageGroup
  }
  onUpdate: (newMessages: {
    delivery?: OrderStatusMessageGroup
    pickup?: OrderStatusMessageGroup
  }) => void
}

export function OrderStatusSettings({
  messages,
  onUpdate,
}: OrderStatusSettingsProps) {
  // Ensure we have an object to work with
  const currentMessages = messages || { delivery: {}, pickup: {} }
  const deliveryMessages = currentMessages.delivery || {}
  const pickupMessages = currentMessages.pickup || {}

  const updateDeliveryMessage = (key: string, value: string) => {
    onUpdate({
      ...currentMessages,
      delivery: {
        ...deliveryMessages,
        [key]: value || undefined, // Set to undefined if empty to fallback to default
      },
    })
  }

  const updatePickupMessage = (key: string, value: string) => {
    onUpdate({
      ...currentMessages,
      pickup: {
        ...pickupMessages,
        [key]: value || undefined, // Set to undefined if empty to fallback to default
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellIcon className="h-5 w-5" />
          Cambios de Estado
        </CardTitle>
        <p className="mt-1 text-muted-foreground text-sm">
          Personaliza los mensajes que reciben tus clientes cuando cambia el
          estado de su pedido. Si dejas un campo vacío, se usará el mensaje por
          defecto.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="delivery" className="space-y-4">
          <TabsList>
            <TabsTrigger value="delivery" className="flex items-center gap-2">
              <BikeIcon className="h-4 w-4" />
              Domicilio
            </TabsTrigger>
            <TabsTrigger value="pickup" className="flex items-center gap-2">
              <ShoppingBagIcon className="h-4 w-4" />
              Recoger en Tienda
            </TabsTrigger>
          </TabsList>

          <TabsContent value="delivery" className="space-y-4">
            <MessageInput
              id="delivery-programado"
              label="Pedido Programado"
              value={deliveryMessages.programado}
              defaultValue={DEFAULT_ORDER_STATUS_MESSAGES.delivery.programado}
              onChange={(val) => updateDeliveryMessage("programado", val)}
            />
            <MessageInput
              id="delivery-pendiente"
              label="Pedido Pendiente"
              value={deliveryMessages.pendiente}
              defaultValue={DEFAULT_ORDER_STATUS_MESSAGES.delivery.pendiente}
              onChange={(val) => updateDeliveryMessage("pendiente", val)}
            />
            <MessageInput
              id="delivery-preparando"
              label="Preparando Pedido"
              value={deliveryMessages.preparando}
              defaultValue={DEFAULT_ORDER_STATUS_MESSAGES.delivery.preparando}
              onChange={(val) => updateDeliveryMessage("preparando", val)}
            />
            <MessageInput
              id="delivery-listo"
              label="Listo (Esperando Repartidor)"
              value={deliveryMessages.listo_para_recoger}
              defaultValue={
                DEFAULT_ORDER_STATUS_MESSAGES.delivery.listo_para_recoger
              }
              onChange={(val) =>
                updateDeliveryMessage("listo_para_recoger", val)
              }
            />
            <MessageInput
              id="delivery-en-camino"
              label="En Camino"
              value={deliveryMessages.en_camino}
              defaultValue={DEFAULT_ORDER_STATUS_MESSAGES.delivery.en_camino}
              onChange={(val) => updateDeliveryMessage("en_camino", val)}
            />
            <MessageInput
              id="delivery-entregado"
              label="Entregado"
              value={deliveryMessages.entregado}
              defaultValue={DEFAULT_ORDER_STATUS_MESSAGES.delivery.entregado}
              onChange={(val) => updateDeliveryMessage("entregado", val)}
              note="Nota: A este mensaje se le añade automáticamente la información sobre el tiempo que tiene el cliente para reportar novedades."
            />
            <MessageInput
              id="delivery-cancelado"
              label="Cancelado"
              value={deliveryMessages.cancelado}
              defaultValue={DEFAULT_ORDER_STATUS_MESSAGES.delivery.cancelado}
              onChange={(val) => updateDeliveryMessage("cancelado", val)}
            />
          </TabsContent>

          <TabsContent value="pickup" className="space-y-4">
            <MessageInput
              id="pickup-programado"
              label="Pedido Programado"
              value={pickupMessages.programado}
              defaultValue={DEFAULT_ORDER_STATUS_MESSAGES.pickup.programado}
              onChange={(val) => updatePickupMessage("programado", val)}
            />
            <MessageInput
              id="pickup-pendiente"
              label="Pedido Pendiente"
              value={pickupMessages.pendiente}
              defaultValue={DEFAULT_ORDER_STATUS_MESSAGES.pickup.pendiente}
              onChange={(val) => updatePickupMessage("pendiente", val)}
            />
            <MessageInput
              id="pickup-preparando"
              label="Preparando Pedido"
              value={pickupMessages.preparando}
              defaultValue={DEFAULT_ORDER_STATUS_MESSAGES.pickup.preparando}
              onChange={(val) => updatePickupMessage("preparando", val)}
            />
            <MessageInput
              id="pickup-listo"
              label="Listo para Recoger"
              value={pickupMessages.listo_para_recoger}
              defaultValue={
                DEFAULT_ORDER_STATUS_MESSAGES.pickup.listo_para_recoger
              }
              onChange={(val) => updatePickupMessage("listo_para_recoger", val)}
            />
            <MessageInput
              id="pickup-entregado"
              label="Entregado / Completado"
              value={pickupMessages.entregado}
              defaultValue={DEFAULT_ORDER_STATUS_MESSAGES.pickup.entregado}
              onChange={(val) => updatePickupMessage("entregado", val)}
              note="Nota: A este mensaje se le añade automáticamente la información sobre el tiempo que tiene el cliente para reportar novedades."
            />
            <MessageInput
              id="pickup-cancelado"
              label="Cancelado"
              value={pickupMessages.cancelado}
              defaultValue={DEFAULT_ORDER_STATUS_MESSAGES.pickup.cancelado}
              onChange={(val) => updatePickupMessage("cancelado", val)}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function MessageInput({
  id,
  label,
  value,
  defaultValue,
  onChange,
  note,
}: {
  id: string
  label: string
  value?: string
  defaultValue: string
  onChange: (value: string) => void
  note?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="font-medium">
        {label}
      </Label>
      <div className="relative">
        <Textarea
          id={id}
          value={value || ""}
          placeholder={defaultValue}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="resize-none pr-8"
        />
      </div>
      {note && <p className="text-muted-foreground text-xs">{note}</p>}
    </div>
  )
}
