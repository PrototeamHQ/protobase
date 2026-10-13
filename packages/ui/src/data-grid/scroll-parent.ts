/**
 * The element that scrolls `element` up and down: its nearest ancestor that scrolls vertically, or the page's
 * scrolling element when none does.
 */
export const scrollParent = (element: HTMLElement) => {
  const page = document.scrollingElement ?? document.documentElement
  for (let parent = element.parentElement; parent && parent !== page && parent !== document.body; parent = parent.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent
  }
  return page as HTMLElement
}

const isPage = (scroller: HTMLElement) => scroller === (document.scrollingElement ?? document.documentElement)

/** Where scroll events of `scroller` are sent: the window for the page. */
export const scrollEvents = (scroller: HTMLElement): EventTarget => (isPage(scroller) ? window : scroller)

const padding = (value: string) => Number.parseFloat(value) || 0

/**
 * The part of `scroller` content shows in, in viewport coordinates: its box less its scroll padding, which is where
 * sticky bars over it say they are.
 */
export const visibleArea = (scroller: HTMLElement) => {
  const style = getComputedStyle(scroller)
  const box = isPage(scroller) ? { top: 0, height: scroller.clientHeight } : { top: scroller.getBoundingClientRect().top + scroller.clientTop, height: scroller.clientHeight }
  const top = padding(style.scrollPaddingTop)
  return { top: box.top + top, height: Math.max(0, box.height - top - padding(style.scrollPaddingBottom)) }
}
