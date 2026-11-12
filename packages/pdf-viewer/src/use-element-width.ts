import { useEffect, useState, type RefObject } from 'react'

/** The width of the element `ref` holds, in CSS pixels, kept as it changes; `undefined` until it is measured. */
export const useElementWidth = (ref: RefObject<HTMLElement | null>) => {
  const [width, setWidth] = useState<number>()
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return width
}
