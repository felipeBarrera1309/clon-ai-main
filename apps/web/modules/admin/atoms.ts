/**
 * Admin module Jotai atoms for state management
 */

import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import type { UserFilterRole, UserFilterStatus } from "./types"

// Users view filters
export const usersSearchAtom = atom<string>("")
export const usersStatusFilterAtom = atom<UserFilterStatus>("all")
export const usersRoleFilterAtom = atom<UserFilterRole>("all")
export const usersPageSizeAtom = atomWithStorage<number>(
  "admin-users-page-size",
  25
)

// Organizations view filters
export const orgsSearchAtom = atom<string>("")
export const orgsPageSizeAtom = atomWithStorage<number>(
  "admin-orgs-page-size",
  25
)

// Selected items for bulk actions
export const selectedUsersAtom = atom<string[]>([])
export const selectedOrgsAtom = atom<string[]>([])

// View mode preferences
export const usersViewModeAtom = atomWithStorage<"table" | "cards">(
  "admin-users-view",
  "table"
)
export const orgsViewModeAtom = atomWithStorage<"table" | "cards">(
  "admin-orgs-view",
  "table"
)
