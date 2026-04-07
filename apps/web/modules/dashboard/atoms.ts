import type { Doc } from "@workspace/backend/_generated/dataModel"
import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import type { LucideIcon } from "lucide-react"
import {
  ORDER_EXISTENCE_FILTER_KEY,
  ORDER_STATUS_FILTER_KEY,
  SEARCH_TEXT_FILTER_KEY,
  SIDEBAR_WRAPPER_CLASSNAME_KEY,
  STATUS_FILTER_KEY,
  WHATSAPP_CONFIGURATION_FILTER_KEY,
} from "./constants"

export const statusFilterAtom = atomWithStorage<
  Doc<"conversations">["status"][] | "all"
>(STATUS_FILTER_KEY, "all")

export const orderExistenceFilterAtom = atomWithStorage<
  ("with-order" | "without-order")[] | "all"
>(ORDER_EXISTENCE_FILTER_KEY, "all")

export const orderStatusFilterAtom = atomWithStorage<
  Doc<"orders">["status"][] | "all"
>(ORDER_STATUS_FILTER_KEY, "all")

export const searchTextFilterAtom = atomWithStorage<string>(
  SEARCH_TEXT_FILTER_KEY,
  ""
)

export const whatsappConfigurationFilterAtom = atomWithStorage<
  Doc<"whatsappConfigurations">["_id"][] | "all"
>(WHATSAPP_CONFIGURATION_FILTER_KEY, "all")

export const sidebarWrapperClassNameAtom = atomWithStorage<string>(
  SIDEBAR_WRAPPER_CLASSNAME_KEY,
  ""
)

// Átomo para el título e ícono de la vista actual del dashboard
export const currentViewAtom = atom<{
  title: string
  icon: LucideIcon | null
}>({
  title: "Dashboard",
  icon: null,
})
