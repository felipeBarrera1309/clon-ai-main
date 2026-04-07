"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { useMutation, useQuery } from "convex/react"
import { MessageSquareIcon } from "lucide-react"
import { useState } from "react"
import { useOrganization } from "@/hooks/use-organization"

interface QuickResponseSelectorProps {
  onSelect: (content: string) => void
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  searchQuery?: string
  onSearchQueryChange?: (query: string) => void
}

export const QuickResponseSelector = ({
  onSelect,
  children,
  open: controlledOpen,
  onOpenChange,
  searchQuery: controlledSearchQuery,
  onSearchQueryChange,
}: QuickResponseSelectorProps) => {
  const { activeOrganizationId } = useOrganization()
  const [internalOpen, setInternalOpen] = useState(false)
  const [internalSearchQuery, setInternalSearchQuery] = useState("")

  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const searchQuery = controlledSearchQuery ?? internalSearchQuery
  const setSearchQuery = onSearchQueryChange ?? setInternalSearchQuery

  const quickResponses = useQuery(
    api.private.quickResponses.list,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  const incrementUsage = useMutation(api.private.quickResponses.incrementUsage)

  const filteredResponses = quickResponses?.filter(
    (response) =>
      response.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      response.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      response.category?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSelect = async (
    responseId: Id<"quickResponses">,
    content: string
  ) => {
    if (!activeOrganizationId) return

    try {
      await incrementUsage({
        organizationId: activeOrganizationId,
        quickResponseId: responseId,
      })
      onSelect(content)
      setOpen(false)
      setSearchQuery("")
    } catch (error) {
      console.error("Error incrementing usage:", error)
      // Still select the response even if usage tracking fails
      onSelect(content)
      setOpen(false)
      setSearchQuery("")
    }
  }

  // Group responses by category
  const groupedResponses = filteredResponses?.reduce(
    (acc, response) => {
      const category = response.category || "Sin categoría"
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category].push(response)
      return acc
    },
    {} as Record<string, typeof filteredResponses>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Buscar respuestas rápidas..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>No se encontraron respuestas rápidas.</CommandEmpty>
            {groupedResponses &&
              Object.entries(groupedResponses).map(([category, responses]) => (
                <CommandGroup key={category} heading={category}>
                  {responses?.map((response) => (
                    <CommandItem
                      key={response._id}
                      onSelect={() =>
                        handleSelect(response._id, response.content)
                      }
                      className="flex flex-col items-start gap-1 p-3"
                    >
                      <div className="flex w-full items-center">
                        <span className="font-medium">{response.title}</span>
                      </div>
                      <p className="flex items-center gap-2 truncate text-muted-foreground text-sm">
                        <MessageSquareIcon className="h-2 w-2 text-muted-foreground" />
                        {response.content}
                      </p>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
