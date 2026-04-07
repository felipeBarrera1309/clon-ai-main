"use client"

import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  dashboardScrollAreaChildPropsAtom,
  dashboardScrollAreaDivPropsAtom,
} from "@workspace/ui/lib/atoms"
import { useAtom } from "jotai"

interface DashboardScrollAreaProps {
  children: React.ReactNode
}

export function DashboardScrollArea({ children }: DashboardScrollAreaProps) {
  const [childProps] = useAtom(dashboardScrollAreaChildPropsAtom)
  const [divProps] = useAtom(dashboardScrollAreaDivPropsAtom)

  return (
    <ScrollArea
      key={JSON.stringify(childProps)}
      className="h-0 flex-1"
      childProps={childProps}
    >
      <div key={JSON.stringify(divProps)} {...divProps}>
        {children}
      </div>
    </ScrollArea>
  )
}
