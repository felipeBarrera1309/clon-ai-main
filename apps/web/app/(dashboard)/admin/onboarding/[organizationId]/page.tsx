"use client"

import { useParams } from "next/navigation"
import { OnboardingView } from "@/modules/onboarding/ui/views/onboarding-view"

export default function AdminOnboardingPage() {
  const params = useParams()
  const organizationId = params.organizationId as string

  return <OnboardingView organizationId={organizationId} />
}
