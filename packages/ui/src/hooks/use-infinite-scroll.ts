import { useCallback, useEffect, useRef } from "react"

interface UseInfiniteScrollProps {
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted"
  loadMore: (numItems: number) => void
  observerEnabled?: boolean
  numItems?: number
}

export const useInfiniteScroll = ({
  status,
  loadMore,
  observerEnabled = true,
  numItems = 15,
}: UseInfiniteScrollProps) => {
  const topElementRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  const scrollPositionRef = useRef<number>(0)

  const handleLoadMore = useCallback(() => {
    if (status === "CanLoadMore") {
      // Save current scroll position before loading more
      const scrollContainer = scrollContainerRef.current
      if (scrollContainer) {
        scrollPositionRef.current = scrollContainer.scrollTop
      }
      loadMore(numItems)
    }
  }, [status, loadMore, numItems])

  // Find scroll container and restore position after loading
  useEffect(() => {
    if (status === "LoadingMore") {
      // Find the scroll container (ScrollArea viewport)
      const topElement = topElementRef.current
      if (topElement) {
        // Find the closest scrollable container
        let scrollContainer = topElement.closest(
          "[data-radix-scroll-area-viewport]"
        ) as HTMLElement
        if (!scrollContainer) {
          scrollContainer = topElement.closest(
            ".overflow-auto, .overflow-y-auto"
          ) as HTMLElement
        }
        scrollContainerRef.current = scrollContainer
      }
    } else if (status === "CanLoadMore" && scrollContainerRef.current) {
      // Restore scroll position after loading is complete
      const scrollContainer = scrollContainerRef.current
      if (scrollContainer && scrollPositionRef.current > 0) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          scrollContainer.scrollTop = scrollPositionRef.current
          scrollPositionRef.current = 0 // Reset
        })
      }
    }
  }, [status])

  useEffect(() => {
    const topElement = topElementRef.current
    if (!(topElement && observerEnabled)) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          handleLoadMore()
        }
      },
      { threshold: 0.5 }
    )

    observer.observe(topElement)

    return () => {
      observer.disconnect()
    }
  }, [handleLoadMore, observerEnabled])

  return {
    topElementRef,
    handleLoadMore,
    canLoadMore: status === "CanLoadMore",
    isLoadingMore: status === "LoadingMore",
    isLoadingFirstPage: status === "LoadingFirstPage",
    isExhausted: status === "Exhausted",
  }
}
