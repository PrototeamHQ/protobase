import { useEffect, useRef, type RefObject } from 'react'

const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * While `active`: moves focus into `container`, keeps Tab inside it, locks body scrolling,
 * calls `onEscape` on Escape, and returns focus to the previously focused element afterwards.
 */
export const useFocusTrap = (container: RefObject<HTMLElement | null>, active: boolean, onEscape: () => void) => {
  const escape = useRef(onEscape)
  escape.current = onEscape
  useEffect(() => {
    if (!active || !container.current) return
    const root = container.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const items = () => [...root.querySelectorAll<HTMLElement>(focusable)]
    ;(items()[0] ?? root).focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return escape.current()
      if (event.key !== 'Tab') return
      const list = items()
      if (list.length === 0) return event.preventDefault()
      const first = list[0]!
      const last = list[list.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      } else if (!root.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [active, container])
}
