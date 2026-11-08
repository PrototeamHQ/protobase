import { useCallback, useRef, useState } from 'react'

/** A ref callback for an element and its width, which follows it as it resizes; 0 until it is measured. */
export const useElementWidth = () => {
  const [width, setWidth] = useState(0)
  const observer = useRef<ResizeObserver>(undefined)
  const ref = useCallback((element: HTMLElement | null) => {
    observer.current?.disconnect()
    if (!element) return
    setWidth(element.getBoundingClientRect().width)
    observer.current = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    observer.current.observe(element)
  }, [])
  return [ref, width] as const
}
