import { useLayoutEffect, useRef, useState } from 'react'
import { rowCardGap, rowOffset, rowWindow } from './row-window'

type View = { left: number; width: number }

/**
 * A record row's sideways scroll: `ref` goes on the scrolling list. Gives the cards to draw (`start` to `end`), whether
 * it can scroll back or on, and `page`, which scrolls a view's width of cards either way.
 */
export const useRowScroll = (total: number) => {
  const ref = useRef<HTMLUListElement>(null)
  const [view, setView] = useState<View>({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const list = ref.current
    if (!list) return
    // Only a scroll that changes the cards drawn or an end reached draws again
    const read = () =>
      setView((current) => {
        const next = { left: list.scrollLeft, width: list.clientWidth }
        const same = (a: View, b: View) => {
          const [x, y] = [rowWindow(a.left, a.width, total), rowWindow(b.left, b.width, total)]
          return x.start === y.start && x.end === y.end && a.width === b.width && (a.left > 0) === (b.left > 0) && Math.abs(a.left - b.left) < 1
        }
        return same(current, next) ? current : next
      })
    read()
    const observer = new ResizeObserver(read)
    observer.observe(list)
    list.addEventListener('scroll', read, { passive: true })
    return () => {
      observer.disconnect()
      list.removeEventListener('scroll', read)
    }
  }, [total])

  const contentWidth = Math.max(0, rowOffset(total) - rowCardGap)
  const page = (direction: 1 | -1) => ref.current?.scrollBy({ left: direction * Math.max(rowOffset(1), view.width - rowCardGap), behavior: 'smooth' })
  return { ref, ...rowWindow(view.left, view.width, total), back: view.left > 0, on: view.left + view.width < contentWidth - 1, page }
}
