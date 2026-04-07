"use client"

import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import {
  type ComboImportState,
  INITIAL_COMBO_IMPORT_STATE,
  INITIAL_MENU_IMPORT_STATE,
  type MenuImportState,
} from "@/modules/onboarding/types"

export const menuImportAtom = atomWithStorage<MenuImportState>(
  "echo-menu-import-v2",
  INITIAL_MENU_IMPORT_STATE
)

export const comboImportAtom = atomWithStorage<ComboImportState>(
  "echo-combo-import-v1",
  INITIAL_COMBO_IMPORT_STATE
)

export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | "complete"

export const onboardingStepAtom = atom<OnboardingStep>(1)

export const onboardingCompletedStepsAtom = atom<number[]>([])
