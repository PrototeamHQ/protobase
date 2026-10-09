import { useCallback, useRef, useState } from 'react'

/** Tracks whether the grid is scrolled sideways (`scrolled`) and whether more lies to the right (`more`). */
export const useHorizontalScroll = () => {
  const ref = useRef<HTMLDivElement | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const [edges, setEdges] = useState({ scrolled: false, more: false })

  const measure = useCallback(() => {
    const element = ref.current
    if (!element) return
    const next = { scrolled: element.scrollLeft > 1, more: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 }
    setEdges((current) => (current.scrolled === next.scrolled && current.more === next.more ? current : next))
  }, [])

  // Observe once per mounted element rather than on every render: re-subscribing each render made the observer's
  // initial callback schedule another render, which re-subscribed again, looping until React bailed out.
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      observer.current?.disconnect()
      observer.current = null
      ref.current = element
      if (!element) return
      const next = new ResizeObserver(measure)
      next.observe(element)
      for (const child of Array.from(element.children)) next.observe(child)
      observer.current = next
      measure()
    },
    [measure],
  )

  return { ref, attach, onScroll: measure, ...edges }
}
