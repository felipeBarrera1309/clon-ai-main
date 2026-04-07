import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import SearchInput from "@workspace/ui/components/search-input"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { cn } from "@workspace/ui/lib/utils"
import { CheckIcon, X } from "lucide-react"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"

export interface FilterOption {
  id: string
  label: string
  icon?: React.ReactNode
}

interface MultiFilterProps {
  options: FilterOption[]
  value: string[]
  onValueChange: (value: string[]) => void
  placeholder: string
  triggerClassName?: string
  contentClassName?: string
  showSearch?: boolean
  icon?: React.ReactNode
  showIndividualBadges?: boolean
}

interface FilterState {
  registerFilter: (id: string, hasValue: boolean) => void
  unregisterFilter: (id: string) => void
}

const FilterContext = createContext<FilterState | null>(null)

// Custom hook that provides a default value when not in context
export function useFilterRegistration() {
  const context = useContext(FilterContext)
  if (!context) {
    // Return a no-op implementation when not within a MultiOptionsGroup
    return {
      registerFilter: () => {},
      unregisterFilter: () => {},
    }
  }
  return context
}

interface MultiOptionsGroupProps {
  children: ReactNode
  onClearAll: () => void
}

export function MultiOptionsGroup({
  children,
  onClearAll,
}: MultiOptionsGroupProps) {
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())

  const registerFilter = useCallback((id: string, hasValue: boolean) => {
    setActiveFilters((prev) => {
      if (hasValue) {
        return new Set([...prev, id])
      } else {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      }
    })
  }, [])

  const unregisterFilter = useCallback((id: string) => {
    setActiveFilters((prev) => {
      const newSet = new Set(prev)
      newSet.delete(id)
      return newSet
    })
  }, [])

  const hasAnyFilter = activeFilters.size > 0

  return (
    <FilterContext.Provider value={{ registerFilter, unregisterFilter }}>
      <div className="flex flex-wrap gap-1">
        {children}
        {hasAnyFilter && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAll}
            className="h-7 px-1! text-xs shadow-none ring-0 hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-3 w-3" />
            Limpiar
          </Button>
        )}
      </div>
    </FilterContext.Provider>
  )
}

export function MultiOptions({
  options,
  value,
  onValueChange,
  placeholder,
  triggerClassName,
  contentClassName,
  showSearch = true,
  icon,
  showIndividualBadges = true,
}: MultiFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const isMobile = useIsMobile()

  // Always call the hook at the top level - this is required by React rules
  const filterRegistration = useFilterRegistration()

  // Register/unregister filter state
  useEffect(() => {
    const hasValue = value.length > 0
    filterRegistration.registerFilter(placeholder, hasValue)
    return () => {
      filterRegistration.unregisterFilter(placeholder)
    }
  }, [
    filterRegistration.registerFilter,
    filterRegistration.unregisterFilter,
    placeholder,
    value.length,
  ])

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleToggleOption = (optionId: string) => {
    const newValue = value.includes(optionId)
      ? value.filter((id) => id !== optionId)
      : [...value, optionId]

    onValueChange(newValue)
  }

  const handleRemoveFilter = (optionId: string) => {
    onValueChange(value.filter((id) => id !== optionId))
  }

  const handleClearFilters = () => {
    onValueChange([])
    setSearchQuery("")
  }

  const getSelectedOptions = () => {
    return options.filter((option) => value.includes(option.id))
  }

  const getDisplayText = () => {
    return placeholder
  }

  const allOptions = options

  const selectedOptions = getSelectedOptions()

  return (
    <div className="flex items-center gap-1">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-7 justify-start overflow-clip border-dashed px-2 text-xs shadow-none ring-0 hover:bg-accent hover:text-accent-foreground focus-visible:ring-0",
              triggerClassName
            )}
            onClick={(e) => {
              // Prevent opening popover when clicking on remove buttons
              if ((e.target as HTMLElement).closest("[data-remove-filter]")) {
                e.stopPropagation()
                return
              }
              setIsOpen(!isOpen)
            }}
          >
            <div className="flex items-center gap-1">
              <div
                className={cn(
                  selectedOptions.length > 0 && "border-r-1",
                  "flex items-center gap-1 self-stretch pr-1"
                )}
              >
                {icon && (
                  <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                    {icon}
                  </div>
                )}
                <span>{getDisplayText()}</span>
              </div>
              {/* Selected filters display - inside trigger */}
              {selectedOptions.length > 0 && (
                <>
                  {/* Desktop: show individual badges only if 2 or fewer filters and showIndividualBadges is true */}
                  {!isMobile &&
                    showIndividualBadges &&
                    selectedOptions.length <= 2 &&
                    selectedOptions.slice(0, 2).map((option) => (
                      <Badge
                        key={option.id}
                        variant="secondary"
                        className="flex h-5 items-center gap-1 px-1.5 text-xs"
                      >
                        {option.label}
                        <span
                          role="button"
                          tabIndex={0}
                          className="flex h-3 w-3 cursor-pointer items-center justify-center rounded-sm hover:bg-accent"
                          data-remove-filter
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveFilter(option.id)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              e.stopPropagation()
                              handleRemoveFilter(option.id)
                            }
                          }}
                        >
                          <X className="h-2 w-2" />
                        </span>
                      </Badge>
                    ))}

                  {/* Show counter badge if more than 2 filters or if showIndividualBadges is false */}
                  {((selectedOptions.length > 2 && showIndividualBadges) ||
                    !showIndividualBadges) && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                      {selectedOptions.length}
                    </Badge>
                  )}
                </>
              )}
            </div>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className={cn(
            "flex h-full w-64 flex-col overflow-hidden p-0",
            contentClassName
          )}
          align="start"
        >
          {/* Search */}
          {showSearch && (
            <SearchInput
              inputProps={{
                placeholder: "Buscar...",
                value: searchQuery,
                onChange: (e) => setSearchQuery(e.target.value),
              }}
              clearButtonProps={{
                onClick: () => setSearchQuery(""),
              }}
              styleConfigs={{
                input: "focus-visible:ring-0 rounded-b-none",
              }}
            />
          )}

          {/* Options List */}
          <ScrollArea
            className="h-full overflow-hidden"
            viewportClassName="max-h-96"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => {
                const isSelected = value.includes(option.id)

                return (
                  <div
                    key={option.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-start gap-2 border-gray-200 border-b px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 focus:outline-none",
                      index < filteredOptions.length - 1 ? "" : "border-b-0",
                      isSelected && "bg-accent"
                    )}
                    onClick={() => handleToggleOption(option.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleToggleOption(option.id)
                      }
                    }}
                  >
                    {/* Checkbox */}
                    <Checkbox
                      checked={isSelected}
                      onChange={() => handleToggleOption(option.id)}
                      className="h-4 w-4"
                    />

                    {/* Icon if provided */}
                    {option.icon && (
                      <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                        {option.icon}
                      </div>
                    )}

                    {/* Label */}
                    <span className="flex-1 text-gray-700">{option.label}</span>

                    {/* Check icon for selected */}
                    {isSelected && (
                      <CheckIcon className="h-4 w-4 text-primary" />
                    )}
                  </div>
                )
              })
            ) : (
              <div className="px-3 py-4 text-center text-gray-500 text-sm">
                No se encontraron opciones
              </div>
            )}
          </ScrollArea>

          {/* Clear Filters Button */}
          {value.length > 0 && (
            <Button
              variant="ghost"
              onClick={handleClearFilters}
              className="w-full flex-shrink-0 rounded-none border-gray-300 border-t py-2 text-center text-gray-700 text-sm transition-colors hover:bg-gray-50"
            >
              Limpiar filtros
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
