import { useEffect, useState, type RefObject } from 'react'

/** Whether the element `ref` holds has come within a screen's height of being shown; once it has, it stays true. */
export const useNearScreen = (ref: RefObject<HTMLElement | null>) => {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element || near) return
    const observer = new IntersectionObserver(([entry]) => entry!.isIntersecting && setNear(true), { rootMargin: '100% 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, near])
  return near
}
