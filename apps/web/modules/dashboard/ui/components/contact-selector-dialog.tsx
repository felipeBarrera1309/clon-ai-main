"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import {
  CheckIcon,
  Loader2Icon,
  PhoneIcon,
  SearchIcon,
  ShoppingCartIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useOrganization } from "@/hooks/use-organization"

type ContactForSelection = {
  _id: Id<"contacts">
  displayName?: string
  phoneNumber: string
  lastMessageAt?: number
  lastKnownAddress?: string
  isBlocked?: boolean
  orderCount: number
  _creationTime: number
}

interface ContactSelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedContactIds: Id<"contacts">[]
  onSelectionChange: (contactIds: Id<"contacts">[]) => void
  title?: string
  description?: string
}

export const ContactSelectorDialog = ({
  open,
  onOpenChange,
  selectedContactIds,
  onSelectionChange,
  title = "Seleccionar Contactos",
  description = "Selecciona los contactos que recibirán el mensaje",
}: ContactSelectorDialogProps) => {
  const { activeOrganizationId } = useOrganization()
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [localSelection, setLocalSelection] = useState<Set<Id<"contacts">>>(
    new Set(selectedContactIds)
  )
  const [cursor, setCursor] = useState<string | null>(null)
  const [allLoadedContacts, setAllLoadedContacts] = useState<
    ContactForSelection[]
  >([])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setCursor(null)
      setAllLoadedContacts([])
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setLocalSelection(new Set(selectedContactIds))
      setSearchQuery("")
      setDebouncedSearch("")
      setCursor(null)
      setAllLoadedContacts([])
    }
    prevOpenRef.current = open
  }, [open, selectedContactIds])

  // Fetch contacts
  const contactsResult = useQuery(
    api.private.contacts.listForCampaignSelection,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          searchQuery: debouncedSearch || undefined,
          limit: 50,
          cursor: cursor || undefined,
          excludeBlocked: true,
        }
      : "skip"
  )

  // Accumulate loaded contacts
  useEffect(() => {
    if (contactsResult?.contacts) {
      if (cursor === null) {
        setAllLoadedContacts(contactsResult.contacts)
      } else {
        setAllLoadedContacts((prev) => {
          const existingIds = new Set(prev.map((c) => c._id))
          const newContacts = contactsResult.contacts.filter(
            (c) => !existingIds.has(c._id)
          )
          return [...prev, ...newContacts]
        })
      }
    }
  }, [contactsResult, cursor])

  const handleToggleContact = useCallback((contactId: Id<"contacts">) => {
    setLocalSelection((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(contactId)) {
        newSet.delete(contactId)
      } else {
        newSet.add(contactId)
      }
      return newSet
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (allLoadedContacts.length > 0) {
      setLocalSelection((prev) => {
        const newSet = new Set(prev)
        for (const contact of allLoadedContacts) {
          newSet.add(contact._id)
        }
        return newSet
      })
    }
  }, [allLoadedContacts])

  const handleDeselectAll = useCallback(() => {
    setLocalSelection(new Set())
  }, [])

  const handleLoadMore = useCallback(() => {
    if (contactsResult?.nextCursor) {
      setCursor(contactsResult.nextCursor)
    }
  }, [contactsResult?.nextCursor])

  const handleConfirm = useCallback(() => {
    onSelectionChange(Array.from(localSelection))
    onOpenChange(false)
  }, [localSelection, onSelectionChange, onOpenChange])

  const isLoading = contactsResult === undefined
  const hasMore = contactsResult?.hasMore ?? false
  const totalCount = contactsResult?.totalCount ?? 0

  // Check if all loaded contacts are selected
  const allLoadedSelected = useMemo(() => {
    if (allLoadedContacts.length === 0) return false
    return allLoadedContacts.every((c) => localSelection.has(c._id))
  }, [allLoadedContacts, localSelection])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Search and selection info */}
        <div className="space-y-3">
          <div className="relative">
            <SearchIcon className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o teléfono..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="-translate-y-1/2 absolute top-1/2 right-1 h-7 w-7"
                onClick={() => setSearchQuery("")}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {localSelection.size} seleccionados
              </Badge>
              {totalCount > 0 && (
                <span className="text-muted-foreground text-sm">
                  de {totalCount} contactos
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={isLoading || allLoadedSelected}
              >
                <CheckIcon className="mr-1 h-3 w-3" />
                Seleccionar todos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
                disabled={localSelection.size === 0}
              >
                <XIcon className="mr-1 h-3 w-3" />
                Limpiar
              </Button>
            </div>
          </div>
        </div>

        {/* Contact list */}
        <ScrollArea className="h-[50vh] rounded-md border">
          <div className="p-2">
            {isLoading && allLoadedContacts.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg p-3"
                  >
                    <Skeleton className="h-5 w-5" />
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : allLoadedContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <UserIcon className="mb-3 h-12 w-12 text-muted-foreground/50" />
                <p className="font-medium text-muted-foreground">
                  {debouncedSearch
                    ? "No se encontraron contactos"
                    : "No hay contactos disponibles"}
                </p>
                {debouncedSearch && (
                  <p className="mt-1 text-muted-foreground text-sm">
                    Intenta con otro término de búsqueda
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {allLoadedContacts.map((contact) => (
                  <ContactRow
                    key={contact._id}
                    contact={contact}
                    isSelected={localSelection.has(contact._id)}
                    onToggle={() => handleToggleContact(contact._id)}
                  />
                ))}

                {hasMore && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLoadMore}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                          Cargando...
                        </>
                      ) : (
                        "Cargar más"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={localSelection.size === 0}>
            Confirmar ({localSelection.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Separate component for contact row to optimize re-renders
const ContactRow = ({
  contact,
  isSelected,
  onToggle,
}: {
  contact: ContactForSelection
  isSelected: boolean
  onToggle: () => void
}) => {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/50 ${
        isSelected ? "bg-primary/5 ring-1 ring-primary/20" : ""
      }`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onToggle()
        }
      }}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggle}
        onClick={(e) => e.stopPropagation()}
      />

      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <UserIcon className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">
            {contact.displayName || "Sin nombre"}
          </span>
          {contact.orderCount > 0 && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              <ShoppingCartIcon className="mr-1 h-3 w-3" />
              {contact.orderCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <PhoneIcon className="h-3 w-3" />
          <span className="font-mono text-xs">{contact.phoneNumber}</span>
          {contact.lastMessageAt && (
            <>
              <span>•</span>
              <span className="text-xs">
                {formatDistanceToNow(new Date(contact.lastMessageAt), {
                  addSuffix: true,
                  locale: es,
                })}
              </span>
            </>
          )}
        </div>
      </div>

      {isSelected && <CheckIcon className="h-5 w-5 shrink-0 text-primary" />}
    </div>
  )
}
