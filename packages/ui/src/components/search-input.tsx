import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"
import { SearchIcon, XIcon } from "lucide-react"
import React, { useEffect, useRef, useState } from "react"

interface StyleConfigs {
  container?: string
  searchIcon?: string
  input?: string
  clearButton?: string
  clearButtonIcon?: string
}

interface SearchInputProps {
  styleConfigs?: StyleConfigs
  inputProps?: React.ComponentProps<"input">
  clearButtonProps?: React.ComponentProps<"button">
}

const SearchInput = React.forwardRef<
  HTMLInputElement,
  SearchInputProps & {
    debounce?: {
      delay: number
      handler: () => void
    }
  }
>(({ styleConfigs, inputProps, clearButtonProps, debounce }, ref) => {
  const [isTiming, setIsTiming] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const handlerRef = useRef(debounce?.handler)

  // Update handler ref when it changes, to avoid restarting the timer just continuously
  useEffect(() => {
    handlerRef.current = debounce?.handler
  }, [debounce?.handler])

  useEffect(() => {
    // Only set up timer if debounce config is provided
    if (!debounce) return

    // Clear existing timer and reset visual state
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    setIsTiming(false)

    // Verify there is a value to act on
    if (!inputProps?.value) return

    // Start new timer
    // We use a small delay to allow the React render cycle to flush the "false" state (resetting the bar),
    // then set "true" to trigger the CSS transition.
    const startObj = setTimeout(() => {
      setIsTiming(true)
    }, 10)

    timerRef.current = setTimeout(() => {
      setIsTiming(false) // Hide bar when done
      handlerRef.current?.()
    }, debounce.delay)

    return () => {
      clearTimeout(startObj)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [inputProps?.value, debounce?.delay]) // Depend on delay value, not object identity

  return (
    <div
      className={cn(
        "relative flex-1 overflow-hidden rounded-md",
        styleConfigs?.container
      )}
    >
      <SearchIcon
        className={cn(
          "-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground",
          styleConfigs?.searchIcon
        )}
      />
      <Input
        ref={ref}
        {...inputProps}
        className={cn("pr-9 pl-9 text-sm", styleConfigs?.input)}
      />
      {inputProps?.value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          {...clearButtonProps}
          className={cn(
            "-translate-y-1/2 absolute top-1/2 right-1 h-6 w-6 p-0 hover:bg-muted",
            styleConfigs?.clearButton
          )}
        >
          <XIcon className={cn("h-3 w-3", styleConfigs?.clearButtonIcon)} />
        </Button>
      )}

      {/* Progress Bar Indicator */}
      {debounce && (
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-transparent">
          <div
            className={cn(
              "h-full bg-primary transition-all ease-linear",
              isTiming ? "w-full" : "w-0"
            )}
            style={{
              transitionDuration: isTiming ? `${debounce.delay}ms` : "0ms",
            }}
          />
        </div>
      )}
    </div>
  )
})
SearchInput.displayName = "SearchInput"

export default SearchInput
