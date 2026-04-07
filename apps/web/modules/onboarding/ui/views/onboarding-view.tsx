"use client"

import { api } from "@workspace/backend/_generated/api"
import { useMutation, useQuery } from "convex/react"
import { useAtom } from "jotai"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Loader } from "@/components/loader"
import {
  type OnboardingStep,
  onboardingCompletedStepsAtom,
  onboardingStepAtom,
} from "@/modules/onboarding/atoms"
import { OnboardingLayout } from "@/modules/onboarding/ui/layouts/onboarding-layout"
import { BotCalibrationStep } from "./steps/bot-calibration-step"
import { BusinessRulesStep } from "./steps/business-rules-step"
import { CombosStep } from "./steps/combos-step"
import { CompletionStep } from "./steps/completion-step"
import { DeliveryZonesStep } from "./steps/delivery-zones-step"
import { LocationsStep } from "./steps/locations-step"
import { MenuUploadStep } from "./steps/menu-upload-step"

interface OnboardingViewProps {
  organizationId: string
}

export function OnboardingView({ organizationId }: OnboardingViewProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useAtom(onboardingStepAtom)
  const [completedSteps, setCompletedSteps] = useAtom(
    onboardingCompletedStepsAtom
  )

  const progress = useQuery(
    api.private.onboarding.getOnboardingProgress,
    organizationId ? { organizationId } : "skip"
  )

  const initializeOnboarding = useMutation(
    api.private.onboarding.initializeOnboarding
  )

  useEffect(() => {
    const init = async () => {
      if (organizationId && progress === null) {
        await initializeOnboarding({ organizationId })
      }
    }
    init()
  }, [organizationId, progress, initializeOnboarding])

  useEffect(() => {
    if (progress) {
      if (progress.isCompleted) {
        router.push("/admin/organizations")
        return
      }
      const step =
        progress.currentStep >= 7
          ? "complete"
          : (progress.currentStep as OnboardingStep)
      setCurrentStep(step)
      setCompletedSteps(progress.completedSteps)
    }
  }, [progress, router, setCurrentStep, setCompletedSteps])

  const handleStepComplete = (step: number) => {
    setCompletedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]))
    const nextStep = Math.min(step + 1, 6) as OnboardingStep
    if (step === 6) {
      setCurrentStep("complete")
    } else {
      setCurrentStep(nextStep)
    }
  }

  const handleStepSkip = (step: number) => {
    const nextStep = Math.min(step + 1, 6) as OnboardingStep
    if (step === 6) {
      setCurrentStep("complete")
    } else {
      setCurrentStep(nextStep)
    }
  }

  const handleBack = () => {
    if (currentStep === "complete") {
      setCurrentStep(6)
    } else if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as OnboardingStep)
    }
  }

  const handleGoToDashboard = () => {
    router.push("/admin/organizations")
  }

  if (progress === undefined) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader />
      </div>
    )
  }

  if (currentStep === "complete") {
    return (
      <CompletionStep
        organizationId={organizationId}
        onGoToDashboard={handleGoToDashboard}
      />
    )
  }

  const numericStep = currentStep as number

  return (
    <OnboardingLayout currentStep={numericStep} completedSteps={completedSteps}>
      {currentStep === 1 && (
        <MenuUploadStep
          organizationId={organizationId}
          onComplete={() => handleStepComplete(1)}
          onSkip={() => handleStepSkip(1)}
        />
      )}
      {currentStep === 2 && (
        <CombosStep
          organizationId={organizationId}
          onComplete={() => handleStepComplete(2)}
          onSkip={() => handleStepSkip(2)}
          onBack={handleBack}
        />
      )}
      {currentStep === 3 && (
        <LocationsStep
          organizationId={organizationId}
          onComplete={() => handleStepComplete(3)}
          onSkip={() => handleStepSkip(3)}
          onBack={handleBack}
        />
      )}
      {currentStep === 4 && (
        <DeliveryZonesStep
          organizationId={organizationId}
          onComplete={() => handleStepComplete(4)}
          onSkip={() => handleStepSkip(4)}
          onBack={handleBack}
        />
      )}
      {currentStep === 5 && (
        <BotCalibrationStep
          organizationId={organizationId}
          onComplete={() => handleStepComplete(5)}
          onSkip={() => handleStepSkip(5)}
          onBack={handleBack}
        />
      )}
      {currentStep === 6 && (
        <BusinessRulesStep
          organizationId={organizationId}
          onComplete={() => handleStepComplete(6)}
          onSkip={() => handleStepSkip(6)}
          onBack={handleBack}
        />
      )}
    </OnboardingLayout>
  )
}
