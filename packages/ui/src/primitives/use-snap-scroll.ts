import { useLayoutEffect, useRef, useState } from 'react'

/** The part of a row in view: how far it is scrolled and how wide the view is, in pixels. */
export type SnapView = { left: number; width: number }

type Scrolled = SnapView & { back: boolean; on: boolean; watched: string }

const measure = (list: HTMLUListElement, watch: (view: SnapView) => string): Scrolled => {
  const view = { left: list.scrollLeft, width: list.clientWidth }
  return { ...view, back: view.left > 0, on: view.left + view.width < list.scrollWidth - 1, watched: watch(view) }
}

const same = (a: Scrolled, b: Scrolled) => a.width === b.width && a.back === b.back && a.on === b.on && a.watched === b.watched

/**
 * A `SnapRow`'s sideways scroll: `ref` goes on its list. Gives the part of the row in `view`, whether it can scroll
 * `back` or `on`, and `page`, which scrolls a view's width either way. It draws again only when the view's width, an end
 * reached or what `watch` makes of the view changes, such as the cards a windowed row draws.
 */
export const useSnapScroll = (watch: (view: SnapView) => string = () => '') => {
  const [list, setList] = useState<HTMLUListElement | null>(null)
  const [scrolled, setScrolled] = useState<Scrolled>({ left: 0, width: 0, back: false, on: false, watched: '' })
  const read = () => {
    if (!list) return
    const next = measure(list, watch)
    setScrolled((current) => (same(current, next) ? current : next))
  }

  // After every draw, since the row's content may have grown without a scroll or resize
  const latest = useRef(read)
  useLayoutEffect(() => {
    latest.current = read
    read()
  })
  useLayoutEffect(() => {
    if (!list) return
    const changed = () => latest.current()
    const observer = new ResizeObserver(changed)
    observer.observe(list)
    list.addEventListener('scroll', changed, { passive: true })
    return () => {
      observer.disconnect()
      list.removeEventListener('scroll', changed)
    }
  }, [list])

  const page = (direction: 1 | -1) => {
    if (!list) return
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0
    list.scrollBy({ left: direction * Math.max(1, list.clientWidth - gap), behavior: 'smooth' })
  }
  return { ref: setList, view: { left: scrolled.left, width: scrolled.width }, back: scrolled.back, on: scrolled.on, page }
}

export type SnapScroll = ReturnType<typeof useSnapScroll>
