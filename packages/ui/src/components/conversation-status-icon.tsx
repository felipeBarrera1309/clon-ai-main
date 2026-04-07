import { cn } from "@workspace/ui/lib/utils"
import { ArrowRightIcon, ArrowUpIcon, CheckIcon } from "lucide-react"

interface ConversationStatusIconProps {
  status: "unresolved" | "escalated" | "resolved"
  className?: string
}

const statusConfig = {
  resolved: {
    icon: CheckIcon,
    bgColor: "bg-primary",
  },
  unresolved: {
    icon: ArrowRightIcon,
    bgColor: "bg-destructive",
  },
  escalated: {
    icon: ArrowUpIcon,
    bgColor: "bg-yellow-500",
  },
} as const

export const ConversationStatusIcon = ({
  status,
  className,
}: ConversationStatusIconProps) => {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <div
      className={cn(
        "flex size-4 items-center justify-center rounded-full",
        config.bgColor,
        className
      )}
    >
      <Icon className="size-3 stroke-3 text-white" />
    </div>
  )
}
