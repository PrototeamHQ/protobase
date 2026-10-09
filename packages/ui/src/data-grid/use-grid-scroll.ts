import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { clampTop, gridGeometry, scrollFromTop, topFromScroll } from './geometry'

/**
 * Owns the scroll position of a grid whose true height may exceed what browsers can scroll.
 * The native scroller is a proxy: its position is mapped onto a virtual pixel offset `top`.
 */
export const useGridScroll = (total: number, rowHeight: number, initialIndex: number) => {
  const ref = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(0)
  const [top, setTop] = useState(initialIndex * rowHeight)
  const geometry = useMemo(() => gridGeometry(total, rowHeight, viewport), [total, rowHeight, viewport])
  const latest = useRef({ geometry, top })
  latest.current = { geometry, top }
  const ignoreScrollUntil = useRef(0)
  const positioned = useRef(false)

  const syncNative = useCallback((nextTop: number) => {
    const element = ref.current
    if (!element) return
    element.scrollTop = scrollFromTop(latest.current.geometry, nextTop)
    ignoreScrollUntil.current = performance.now() + 150
  }, [])

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => setViewport(element.clientHeight))
    observer.observe(element)
    setViewport(element.clientHeight)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (viewport === 0 || positioned.current) return
    positioned.current = true
    const next = clampTop(geometry, top)
    setTop(next)
    syncNative(next)
  }, [viewport, geometry, top, syncNative])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      const { geometry: current, top: currentTop } = latest.current
      if (!current.scaled || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
      event.preventDefault()
      const next = clampTop(current, currentTop + event.deltaY)
      setTop(next)
      syncNative(next)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [syncNative])

  const onScroll = useCallback(() => {
    const element = ref.current
    if (!element || performance.now() < ignoreScrollUntil.current) return
    setTop(topFromScroll(latest.current.geometry, element.scrollTop))
  }, [])

  return { ref, onScroll, viewport, top, geometry }
}
