import { useEffect, useState, type RefObject } from 'react'

/** Whether the element `ref` holds is within a screen's height of being shown, kept as the page scrolls. */
export const useNearScreen = (ref: RefObject<HTMLElement | null>) => {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setNear(entry!.isIntersecting), { rootMargin: '100% 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return near
}
