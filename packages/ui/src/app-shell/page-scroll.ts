import { createContext, useContext, useLayoutEffect, type RefObject } from 'react'

/** Turns the shell's page scrolling on or off, or back to its `pageScroll` with `undefined`; pages use `usePageScroll`. */
export const PageScrollContext = createContext<(on: boolean | undefined) => void>(() => {})

/**
 * While the calling page is shown and `on`, the document scrolls instead of a box of the screen's height: the top and
 * bottom bars and the sidebar stick, and the page grows with its content, so the browser's own scrolling applies
 * throughout, scrolling to the top included, as tapping the status bar on an iPhone does. Sticky content in the page
 * stays clear of the bars with `--pb-sticky-top` and `--pb-sticky-bottom`. Not `on`, the page fills the box instead,
 * as a map does. Once the page is gone the shell's `pageScroll` applies again.
 */
export const usePageScroll = (on: boolean) => {
  const set = useContext(PageScrollContext)
  useLayoutEffect(() => {
    set(on)
    return () => set(undefined)
  }, [set, on])
}

/**
 * While the page scrolls, keeps room for its scrollbar whether or not the page overflows, where scrollbars take room
 * (Windows, Linux, or a Mac set to always show them). Otherwise a page whose height follows its width, such as the
 * cards, can be just too tall with the width without a scrollbar and short enough with the width beside one: the
 * scrollbar narrows the cards, they get shorter, the page fits, the scrollbar goes, they widen again, every frame.
 */
export const usePageGutter = (on: boolean) => {
  useLayoutEffect(() => {
    if (!on) return
    const root = document.documentElement
    root.style.setProperty('scrollbar-gutter', 'stable')
    return () => {
      root.style.removeProperty('scrollbar-gutter')
    }
  }, [on])
}

const properties = ['--pb-sticky-top', '--pb-sticky-bottom', 'scroll-padding-top', 'scroll-padding-bottom']

/**
 * While the page scrolls, says how tall its sticky bars are, on the root element: as `--pb-sticky-top` and
 * `--pb-sticky-bottom` for content that sticks inside them, and as the page's scroll padding, which the browser keeps
 * focused and scrolled-to content clear of, and which a virtual list reads as the part of the page it shows in.
 */
export const usePageInsets = (on: boolean, top: RefObject<HTMLElement | null>, bottom: RefObject<HTMLElement | null>, bottomShown: boolean) => {
  useLayoutEffect(() => {
    if (!on) return
    const root = document.documentElement
    const update = () => {
      const above = `${top.current?.offsetHeight ?? 0}px`
      const below = bottom.current ? `${bottom.current.offsetHeight}px` : 'var(--pb-safe-bottom)'
      root.style.setProperty('--pb-sticky-top', above)
      root.style.setProperty('--pb-sticky-bottom', below)
      root.style.setProperty('scroll-padding-top', above)
      root.style.setProperty('scroll-padding-bottom', below)
    }
    const observer = new ResizeObserver(update)
    for (const bar of [top.current, bottom.current]) if (bar) observer.observe(bar)
    update()
    return () => {
      observer.disconnect()
      for (const property of properties) root.style.removeProperty(property)
    }
  }, [on, top, bottom, bottomShown])
}
