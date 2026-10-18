import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const gap = 4

/** Below the button, or above it when the viewport has no room underneath; its right edge at the button's. */
const placeMenu = (button: DOMRect, menuHeight: number) => {
  const below = button.bottom + gap
  const top = below + menuHeight > window.innerHeight - gap ? Math.max(gap, button.top - gap - menuHeight) : below
  return { top, right: window.innerWidth - button.right }
}

/**
 * A menu opened by a button and drawn fixed, portalled to the body, under or over the button: it closes on a click
 * outside, Escape, and a scroll or resize, which would move the button away from it. `place` is undefined until the
 * menu is measured, so it is drawn hidden for that first frame.
 */
export const usePopoverMenu = () => {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<{ top: number; right: number }>()
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLUListElement>(null)

  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) {
      setPlace(undefined)
      return
    }
    setPlace(placeMenu(button.current.getBoundingClientRect(), menu.current.offsetHeight))
  }, [open])

  useEffect(() => {
    if (!open) return
    const inside = (target: EventTarget | null) => button.current?.contains(target as Node) || menu.current?.contains(target as Node)
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !inside(event.target)) setOpen(false)
    }
    // A fixed menu would drift away from its button
    const dismiss = () => setOpen(false)
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
