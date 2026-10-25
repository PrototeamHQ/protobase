import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const gap = 4

/**
 * Below the button, or above it when the viewport has no room underneath; its right edge at the button's, or further
 * right when that would push its left edge off the viewport, as for a button near the left edge. The viewport is the
 * page's width without its scrollbar, as a fixed element's `right` counts from there.
 */
const placeMenu = (button: DOMRect, menu: { width: number; height: number }) => {
  const width = document.documentElement.clientWidth
  const below = button.bottom + gap
  const top = below + menu.height > window.innerHeight - gap ? Math.max(gap, button.top - gap - menu.height) : below
  const right = Math.max(gap, Math.min(width - button.right, width - gap - menu.width))
  return { top, right }
}

/**
 * A menu opened by a button and drawn fixed, portalled to the body, under or over the button: it closes on a click
 * outside, Escape, and a scroll or resize, which would move the button away from it; a scroll inside the menu keeps it.
 * `place` is undefined until the menu is measured, so it is drawn hidden for that first frame. The menu is a `ul` unless
 * `T` names another element, such as a panel's `div`.
 */
export const usePopoverMenu = <T extends HTMLElement = HTMLUListElement>() => {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<{ top: number; right: number }>()
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<T>(null)

  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) {
      setPlace(undefined)
      return
    }
    setPlace(placeMenu(button.current.getBoundingClientRect(), { width: menu.current.offsetWidth, height: menu.current.offsetHeight }))
  }, [open])

  useEffect(() => {
    if (!open) return
    const inside = (target: EventTarget | null) => target instanceof Node && Boolean(button.current?.contains(target) || menu.current?.contains(target))
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !inside(event.target)) setOpen(false)
    }
    // A fixed menu would drift away from its button; the menu's own scroll moves nothing
    const dismiss = (event: Event) => {
      if (!inside(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    document.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
      document.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [open])

  return { open, setOpen, place, button, menu }
}
