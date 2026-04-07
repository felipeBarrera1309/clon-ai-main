"use client"

import { MenuImportWizard } from "@/modules/onboarding/ui/components/menu-import"

interface MenuUploadStepProps {
  organizationId: string
  onComplete: () => void
  onSkip: () => void
}

export function MenuUploadStep({
  organizationId,
  onComplete,
  onSkip,
}: MenuUploadStepProps) {
  return (
    <MenuImportWizard
      organizationId={organizationId}
      onComplete={onComplete}
      onSkip={onSkip}
    />
  )
}
