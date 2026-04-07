"use client"

import type { Doc } from "@workspace/backend/_generated/dataModel"
import { cn } from "@workspace/ui/lib/utils"
import { ArrowRightIcon, ArrowUpIcon, CheckIcon } from "lucide-react"

export const ConversationStatusBadge = ({
  status,
  className,
}: {
  status: Doc<"conversations">["status"]
  className?: string
}) => {
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
  if (!currentStatus) {
    return null
  }
  const Icon = currentStatus.icon

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-semibold text-white text-xs transition-colors",
        currentStatus.variant === "destructive"
          ? "bg-destructive"
          : currentStatus.variant === "warning"
            ? "bg-yellow-500"
            : "bg-primary",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{currentStatus.label}</span>
    </span>
  )
}
