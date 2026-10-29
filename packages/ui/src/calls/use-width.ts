import { useCallback, useState } from 'react'

/** The width of the element the returned ref is put on, followed as it changes; 0 until it is drawn. */
export const useWidth = <T extends HTMLElement>() => {
  const [width, setWidth] = useState(0)
  const ref = useCallback((element: T | null) => {
    if (!element) return
    setWidth(element.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}
