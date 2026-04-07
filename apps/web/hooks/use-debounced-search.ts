import { useCallback, useEffect, useState } from "react"

/**
 * Custom hook for debounced search functionality
 * @param initialValue - Initial search value
 * @param delay - Debounce delay in milliseconds (default: 300ms)
 * @returns Object with current value, debounced value, and setter function
 */
export function useDebouncedSearch(initialValue = "", delay = 300) {
  const [value, setValue] = useState(initialValue)
  const [debouncedValue, setDebouncedValue] = useState(initialValue)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  const updateValue = useCallback((newValue: string) => {
    setValue(newValue)
  }, [])

  const clearSearch = useCallback(() => {
    setValue("")
    setDebouncedValue("")
  }, [])

  return {
    value,
    debouncedValue,
    setValue: updateValue,
    clearSearch,
    isSearching: value !== debouncedValue,
  }
}
