import type { Doc } from "@workspace/backend/_generated/dataModel"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  PackageIcon,
  TruckIcon,
  UtensilsIcon,
  XCircleIcon,
} from "lucide-react"

export const statusConfig = {
  pendiente: {
    icon: ClockIcon,
    label: "Pendiente",
    variant: "secondary" as const,
    className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
  },
  preparando: {
    icon: UtensilsIcon,
    label: "Preparando",
    variant: "secondary" as const,
    className: "bg-blue-100 text-blue-800 hover:bg-blue-200",
  },
  listo_para_recoger: {
    icon: PackageIcon,
    label: "Listo para Recoger",
    variant: "secondary" as const,
    className: "bg-green-100 text-green-800 hover:bg-green-200",
  },
  en_camino: {
    icon: TruckIcon,
    label: "En Camino",
    variant: "secondary" as const,
    className: "bg-orange-100 text-orange-800 hover:bg-orange-200",
  },
  entregado: {
    icon: CheckCircleIcon,
    label: "Entregado",
    variant: "secondary" as const,
    className: "bg-gray-100 text-gray-800 hover:bg-gray-200",
  },
  cancelado: {
    icon: XCircleIcon,
    label: "Cancelado",
    variant: "destructive" as const,
    className: "bg-red-100 text-red-800 hover:bg-red-200",
  },
  programado: {
    icon: CalendarIcon,
    label: "Programado",
    variant: "secondary" as const,
    className: "bg-purple-100 text-purple-800 hover:bg-purple-200",
  },
}

export const OrderStatusBadge = ({
  status,
  orderNumber,
  classNames,
  onViewOrder,
  noLabel = false,
}: {
  status: Doc<"orders">["status"]
  orderNumber?: string
  classNames?: string
  onViewOrder?: (e: React.MouseEvent) => void
  noLabel?: boolean
}) => {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <Badge
      variant={config.variant}
      className={`cursor-pointer gap-1.5 px-3 py-1.5 ${config.className} ${classNames}`}
      {...(onViewOrder && { onClick: onViewOrder })}
    >
      <Icon className="h-3 w-3" />
      <span className="font-medium text-xs">
        {!noLabel && config.label}
        {!noLabel && orderNumber && " - "}
        {orderNumber && `#${orderNumber}`}
      </span>
    </Badge>
  )
}

// Compact order status component
export const CompactOrderStatus = ({
  status,
  orderNumber,
  onClick,
}: {
  status: string
  orderNumber: string
  onClick?: () => void
}) => {
  const statusLabels = {
    programado: "Programado",
    pendiente: "Pendiente",
    preparando: "Preparando",
    listo_para_recoger: "Listo para Recoger",
    en_camino: "En Camino",
    entregado: "Entregado",
    cancelado: "Cancelado",
  }

  const statusConfig = {
    programado: { icon: "🕐", color: "text-purple-600" },
    pendiente: { icon: "⏳", color: "text-yellow-600" },
    preparando: { icon: "👨‍🍳", color: "text-blue-600" },
    listo_para_recoger: { icon: "📦", color: "text-green-600" },
    en_camino: { icon: "🚚", color: "text-orange-600" },
    entregado: { icon: "✅", color: "text-gray-600" },
    cancelado: { icon: "❌", color: "text-red-600" },
  }

  const config = statusConfig[status as keyof typeof statusConfig] || {
    icon: "📋",
    color: "text-gray-600",
  }
  const label = statusLabels[status as keyof typeof statusLabels] || status

  return (
    <button
      type="button"
      className={cn(
        "m-0 inline-flex cursor-pointer items-center border-0 bg-transparent p-0 font-medium text-xs hover:underline",
        config.color
      )}
      onClick={(e) => {
        e.preventDefault()
        onClick?.()
      }}
      title={`Pedido ${orderNumber} - ${label}`}
      tabIndex={0}
    >
      <span aria-hidden="true">{config.icon}</span> {label}
    </button>
  )
}
