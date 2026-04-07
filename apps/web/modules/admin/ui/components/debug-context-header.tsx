"use client"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { Button } from "@workspace/ui/components/button"
import Link from "next/link"
import { Fragment } from "react"

type DebugBreadcrumb = {
  label: string
  href?: string
}

type DebugAction = {
  label: string
  href: string
  variant?: "default" | "outline" | "secondary" | "ghost"
}

type DebugContextHeaderProps = {
  title: string
  description: string
  breadcrumbs: DebugBreadcrumb[]
  actions?: DebugAction[]
}

export const DebugContextHeader = ({
  title,
  description,
  breadcrumbs,
  actions = [],
}: DebugContextHeaderProps) => {
  return (
    <div className="space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1
            return (
              <Fragment key={`${item.label}-${index}`}>
                <BreadcrumbItem>
                  {isLast || !item.href ? (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast ? <BreadcrumbSeparator /> : null}
              </Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">{title}</h1>
          <p className="mt-2 text-muted-foreground">{description}</p>
        </div>
        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={`${action.label}-${action.href}`}
                asChild
                size="sm"
                variant={action.variant ?? "outline"}
              >
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
