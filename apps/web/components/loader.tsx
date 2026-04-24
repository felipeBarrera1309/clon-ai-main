import { cn } from "@workspace/ui/lib/utils"
import { Loader2 } from "lucide-react"

interface LoaderProps {
	className?: string
	size?: "sm" | "md" | "lg"
}

export function Loader({ className, size = "md" }: LoaderProps) {
	const sizeClasses = {
		sm: "h-4 w-4",
		md: "h-8 w-8",
		lg: "h-12 w-12",
	}

	return (
		<Loader2
			className={cn(
				"animate-spin text-muted-foreground",
				sizeClasses[size],
				className
			)}
		/>
	)
}
