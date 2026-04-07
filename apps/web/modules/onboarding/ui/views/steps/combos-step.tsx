"use client"

import { ComboImportWizard } from "@/modules/onboarding/ui/components/combo-import"

interface CombosStepProps {
  organizationId: string
  onComplete: () => void
  onSkip: () => void
  onBack: () => void
}

export function CombosStep({
  organizationId,
  onComplete,
  onSkip,
  onBack,
}: CombosStepProps) {
  return (
    <ComboImportWizard
      organizationId={organizationId}
      onComplete={onComplete}
      onSkip={onSkip}
      onBack={onBack}
    />
  )
}
