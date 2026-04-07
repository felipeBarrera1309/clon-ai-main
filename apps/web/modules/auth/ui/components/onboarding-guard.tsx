"use client"

import { api } from "@workspace/backend/_generated/api"
import { useQuery } from "convex/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Loader } from "@/components/loader"
import { useOrganization } from "@/hooks/use-organization"

interface OnboardingGuardProps {
  children: React.ReactNode
}

export function OnboardingGuard({ children }: OnboardingGuardProps) {
  const router = useRouter()
  const { activeOrganizationId } = useOrganization()

  const progress = useQuery(
    api.private.onboarding.getOnboardingProgress,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )

  const needsOnboarding = progress === null || !progress?.isCompleted

  useEffect(() => {
    if (progress === undefined) return

    if (needsOnboarding && activeOrganizationId) {
      router.push(`/admin/onboarding/${activeOrganizationId}`)
    }
  }, [progress, needsOnboarding, router, activeOrganizationId])

  if (progress === undefined || needsOnboarding) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader />
      </div>
    )
  }

  return <>{children}</>
}
