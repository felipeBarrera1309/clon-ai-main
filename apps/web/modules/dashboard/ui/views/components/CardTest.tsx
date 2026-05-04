import { cn } from "@workspace/ui/lib/utils"
import type * as React from "react"

export function CardTest({ className, ...props } : { className: string }) {
	return (
		<div
			data-slot="card"
			className={cn(
				"flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm",
				className
			)}
			{ ...props }
		/>
	)
}