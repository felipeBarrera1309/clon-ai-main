/** biome-ignore-all lint/suspicious/noArrayIndexKey: intentional use of array index as key */
"use client"

// import { getCountryFlagUrl, getCountryFromTimezone } from "@/lib/country-utils";
import { api } from "@workspace/backend/_generated/api"
import type { Doc, Id } from "@workspace/backend/_generated/dataModel"
import { Card } from "@workspace/ui/components/card"
import { ConversationStatusIcon } from "@workspace/ui/components/conversation-status-icon"
import { DicebearAvatar } from "@workspace/ui/components/dicebear-avatar"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import SearchInput from "@workspace/ui/components/search-input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useInfiniteScroll } from "@workspace/ui/hooks/use-infinite-scroll"
import { cn } from "@workspace/ui/lib/utils"
import { usePaginatedQuery, useQuery } from "convex/react"
import { format, isToday } from "date-fns"
import { es } from "date-fns/locale"
import { useAtomValue, useSetAtom } from "jotai/react"
import {
  AlertTriangle,
  ArrowRightIcon,
  ArrowUpIcon,
  CheckIcon,
  Circle,
  Columns3,
  CornerUpLeftIcon,
  PackageIcon,
  PackageXIcon,
  Smartphone,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useOrganization } from "@/hooks/use-organization"
import { formatExactTime } from "@/lib/date"
import {
  orderExistenceFilterAtom,
  orderStatusFilterAtom,
  searchTextFilterAtom,
  statusFilterAtom,
  whatsappConfigurationFilterAtom,
} from "../../atoms"
import { MultiOptions, MultiOptionsGroup } from "./multioptions"
import { OrderStatusBadge, statusConfig } from "./order-status-badge"

interface ConversationsPanelProps {
  // Accept conversation with optional additional fields (like contact from enriched queries)
  onSelectConversation?: (
    conversation: Doc<"conversations"> & Record<string, unknown>
  ) => void
}

export const ConversationsPanel = ({
  onSelectConversation,
}: ConversationsPanelProps) => {
  const { activeOrganizationId } = useOrganization()
  const pathname = usePathname()
  const router = useRouter()

  const statusFilter = useAtomValue(statusFilterAtom)
  const setStatusFilter = useSetAtom(statusFilterAtom)
  const orderExistenceFilter = useAtomValue(orderExistenceFilterAtom)
  const setOrderExistenceFilter = useSetAtom(orderExistenceFilterAtom)
  const orderStatusFilter = useAtomValue(orderStatusFilterAtom)
  const setOrderStatusFilter = useSetAtom(orderStatusFilterAtom)
  const searchTextFilter = useAtomValue(searchTextFilterAtom)
  const setSearchTextFilter = useSetAtom(searchTextFilterAtom)
  const whatsappConfigurationFilter = useAtomValue(
    whatsappConfigurationFilterAtom
  )
  const setWhatsappConfigurationFilter = useSetAtom(
    whatsappConfigurationFilterAtom
  )

  const [debouncedSearchText, setDebouncedSearchText] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchTextFilter)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTextFilter])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTextFilter(e.target.value)
  }

  const whatsappConfigurations = useQuery(
    api.private.whatsappConfigurations.getConfigurations,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )

  // Validate statusFilter to prevent invalid conversation statuses
  const validConversationStatuses = ["unresolved", "escalated", "resolved"]
  const filteredStatusFilter = Array.isArray(statusFilter)
    ? statusFilter.filter((status) =>
        validConversationStatuses.includes(status)
      )
    : statusFilter === "all"
      ? undefined
      : statusFilter

  const conversations = usePaginatedQuery(
    api.private.conversations.getMany,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          status: filteredStatusFilter,
          orderExistence:
            orderExistenceFilter === "all" ? undefined : orderExistenceFilter,
          orderStatus:
            orderStatusFilter === "all" ? undefined : orderStatusFilter,
          searchText: debouncedSearchText || undefined,
          whatsappConfigurationIds:
            whatsappConfigurationFilter === "all"
              ? undefined
              : whatsappConfigurationFilter,
        }
      : "skip",
    {
      initialNumItems: 15,
    }
  )

  const { topElementRef, canLoadMore, isLoadingMore } = useInfiniteScroll({
    status: conversations.status,
    loadMore: conversations.loadMore,
    numItems: 15,
  })

  const isLoading = conversations.status === "LoadingFirstPage"
  return (
    <div className="flex h-full w-full flex-col bg-background text-sidebar-foreground">
      <div className="flex flex-col gap-2 border-b p-2">
        <SearchInput
          inputProps={{
            placeholder: "Buscar por nombre o teléfono...",
            value: searchTextFilter,
            onChange: handleSearchChange,
          }}
          clearButtonProps={{
            onClick: () => {
              setSearchTextFilter("")
            },
          }}
        />
        <MultiOptionsGroup
          onClearAll={() => {
            setStatusFilter("all")
            setOrderExistenceFilter("all")
            setOrderStatusFilter("all")
            setWhatsappConfigurationFilter("all")
          }}
        >
          <MultiOptions
            options={[
              {
                id: "unresolved",
                label: "No resuelto",
                icon: <ArrowRightIcon className="size-4" />,
              },
              {
                id: "escalated",
                label: "Escalado",
                icon: <ArrowUpIcon className="size-4" />,
              },
              {
                id: "resolved",
                label: "Resuelto",
                icon: <CheckIcon className="size-4" />,
              },
            ]}
            value={statusFilter === "all" ? [] : statusFilter}
            onValueChange={(value) => {
              setStatusFilter(
                value.length === 0
                  ? "all"
                  : (value as ("unresolved" | "escalated" | "resolved")[])
              )
            }}
            placeholder="Gestión"
            icon={<Circle />}
            showSearch={false}
            showIndividualBadges={false}
          />

          <MultiOptions
            options={[
              {
                id: "with-order",
                label: "Con pedido",
                icon: <PackageIcon className="size-4" />,
              },
              {
                id: "without-order",
                label: "Sin pedido",
                icon: <PackageXIcon className="size-4" />,
              },
            ]}
            value={orderExistenceFilter === "all" ? [] : orderExistenceFilter}
            onValueChange={(value) => {
              setOrderExistenceFilter(
                value.length === 0
                  ? "all"
                  : (value as ("with-order" | "without-order")[])
              )
            }}
            placeholder="Pedido"
            icon={<PackageIcon />}
            showSearch={false}
            showIndividualBadges={false}
          />

          <MultiOptions
            options={Object.entries(statusConfig).map(([key, config]) => ({
              id: key,
              label: config.label,
              icon: <config.icon className="h-4 w-4" />,
            }))}
            value={orderStatusFilter === "all" ? [] : orderStatusFilter}
            onValueChange={(value) => {
              setOrderStatusFilter(
                value.length === 0
                  ? "all"
                  : (value as (
                      | "programado"
                      | "pendiente"
                      | "preparando"
                      | "listo_para_recoger"
                      | "en_camino"
                      | "entregado"
                      | "cancelado"
                    )[])
              )
            }}
            placeholder="Seguimiento"
            icon={<Columns3 />}
            showSearch={false}
            showIndividualBadges={false}
          />

          {whatsappConfigurations && whatsappConfigurations?.length > 1 && (
            <MultiOptions
              options={
                whatsappConfigurations?.map(
                  (config: {
                    _id: string
                    displayName?: string
                    phoneNumber: string
                  }) => ({
                    id: config._id,
                    label: config.displayName || config.phoneNumber,
                  })
                ) || []
              }
              value={
                whatsappConfigurationFilter === "all"
                  ? []
                  : whatsappConfigurationFilter
              }
              onValueChange={(value) => {
                setWhatsappConfigurationFilter(
                  value.length === 0
                    ? "all"
                    : (value as Id<"whatsappConfigurations">[])
                )
              }}
              placeholder="WhatsApp"
              icon={<Smartphone />}
              showSearch={false}
              showIndividualBadges={false}
            />
          )}
        </MultiOptionsGroup>
      </div>
      {isLoading ? (
        <SkeletonConversations />
      ) : conversations.results?.length < 1 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 text-muted-foreground">
            <Circle className="h-8 w-8" />
          </div>
          <h3 className="mb-2 font-medium text-lg">
            No hay conversaciones para mostrar
          </h3>
          <p className="text-muted-foreground">
            No se encontraron conversaciones que coincidan con los filtros
            seleccionados.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="flex w-full flex-1 flex-col text-sm">
              {conversations.results?.map((conversation, _index) => {
                const isLastMessageFromOperator =
                  conversation.lastMessage?.message?.role !== "user"

                const lastMessageTime =
                  conversation.lastMessageAt ?? conversation._creationTime

                const formattedTime = formatExactTime(lastMessageTime)

                return (
                  <div
                    key={conversation._id}
                    className={cn(
                      "relative flex cursor-pointer items-center gap-3 border-b p-4 text-sm leading-tight hover:bg-accent hover:text-accent-foreground",
                      pathname === `/conversations/${conversation._id}` &&
                        "bg-accent text-accent-foreground",
                      conversation.status === "escalated" &&
                        (conversation.order
                          ? "border-l-4 border-l-orange-500 bg-orange-100/70 hover:bg-orange-100/90"
                          : "border-l-4 border-l-yellow-500 bg-yellow-50/50 hover:bg-yellow-50/75")
                    )}
                    onClick={() => {
                      if (onSelectConversation) {
                        onSelectConversation(conversation)
                      } else {
                        router.push(`/conversations/${conversation._id}`)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        if (onSelectConversation) {
                          onSelectConversation(conversation)
                        } else {
                          router.push(`/conversations/${conversation._id}`)
                        }
                      }
                    }}
                  >
                    <div
                      className={cn(
                        "-translate-y-1/2 absolute top-1/2 left-0 h-[64%] w-1 rounded-r-full bg-neutral-300 opacity-0 transition-opacity",
                        pathname === `/conversations/${conversation._id}` &&
                          "opacity-100"
                      )}
                    />
                    {conversation.status === "escalated" && (
                      <div className="absolute top-2 right-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      </div>
                    )}

                    <DicebearAvatar
                      seed={conversation.contact._id}
                      // badgeImageUrl={countryFlagUrl}
                      size={40}
                      containerClassName="hidden lg:inline"
                      avatarClassName="shrink-0"
                    />
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="flex justify-between">
                        {conversation.whatsappConfiguration && (
                          <span className="w-fit rounded bg-alternative/20 px-1 py-0.5 font-medium text-primary text-xs">
                            {conversation.whatsappConfiguration.displayName}
                          </span>
                        )}
                        {conversation.twilioConfiguration && (
                          <span className="w-fit rounded bg-alternative/20 px-1 py-0.5 font-medium text-primary text-xs">
                            {conversation.twilioConfiguration.displayName}
                          </span>
                        )}
                        <div className="flex items-center gap-2">
                          {conversation.order && (
                            <OrderStatusBadge
                              status={conversation.order.status}
                              classNames="py-0.5 px-1.5"
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex w-full items-center gap-2">
                        <div className="flex flex-wrap gap-1">
                          <span className="truncate font-bold">
                            {conversation.contact.displayName &&
                            conversation.contact.displayName.length > 13
                              ? `${conversation.contact.displayName.substring(
                                  0,
                                  13
                                )}...`
                              : (conversation.contact.displayName ??
                                conversation.contact.phoneNumber)}
                          </span>
                          <span className="truncate font-light text-muted-foreground text-xs">
                            ({conversation.contact.phoneNumber})
                          </span>
                        </div>
                        <span className="ml-auto shrink-0 text-muted-foreground text-xs">
                          {formattedTime}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex w-0 grow items-center gap-1">
                          {isLastMessageFromOperator && (
                            <CornerUpLeftIcon className="size-3 shrink-0 text-muted-foreground" />
                          )}
                          <span
                            className={cn(
                              "line-clamp-1 text-muted-foreground text-xs",
                              !isLastMessageFromOperator &&
                                "font-bold text-black"
                            )}
                          >
                            {conversation.lastMessage?.text}
                          </span>
                        </div>
                        {!isToday(lastMessageTime) && (
                          <span className="line-clamp-1 text-muted-foreground text-xs">
                            {format(lastMessageTime, "h:mm a", { locale: es })}
                          </span>
                        )}
                        <ConversationStatusIcon status={conversation.status} />
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={topElementRef} className="h-4" />
              {isLoadingMore && (
                <div className="flex flex-col">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Card
                      key={`loading-${index}`}
                      className="gap-1 rounded-none border-muted border-l-2 p-4 text-sm shadow-none"
                    >
                      <div className="flex items-center justify-between">
                        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                        <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

export const SkeletonConversations = () => {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
      <div className="relative flex w-full min-w-0 flex-col">
        <div className="w-full space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="flex items-start gap-3 rounded-lg p-3" key={index}>
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="flex w-full items-center gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="ml-auto h-3 w-12 shrink-0" />
                </div>
                <div className="mt-2">
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
