import { useEffect, useRef, type RefObject } from 'react'
import { lockPageScroll } from './page-scroll-lock'

const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// The active traps, the last opened last: only it takes the keys, so Escape in a sheet over a dialog closes the sheet alone
const stack: object[] = []

/**
 * While `active`: moves focus into `container`, keeps Tab inside it, locks page scrolling (see `lockPageScroll`),
 * calls `onEscape` on Escape, and returns focus to the previously focused element afterwards. A trap opened while
 * another is active takes Tab and Escape until it ends.
 */
export const useFocusTrap = (container: RefObject<HTMLElement | null>, active: boolean, onEscape: () => void) => {
  const escape = useRef(onEscape)
  escape.current = onEscape
  useEffect(() => {
    if (!active || !container.current) return
    const root = container.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const unlock = lockPageScroll()
    const token = {}
    stack.push(token)
    const items = () => [...root.querySelectorAll<HTMLElement>(focusable)]
    ;(items()[0] ?? root).focus()

    const onKey = (event: KeyboardEvent) => {
      if (stack.at(-1) !== token) return
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
      stack.splice(stack.indexOf(token), 1)
      unlock()
      previous?.focus()
    }
  }, [active, container])
}
