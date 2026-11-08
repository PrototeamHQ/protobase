import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

/** The room a menu keeps from the viewport's edges. */
export const viewportGap = 4

/**
 * Where a menu aligned to its trigger's right edge puts its own right edge: at the trigger's, or further right when that
 * would push its left edge off the viewport, as for a trigger near the left edge, yet never past the viewport's right.
 */
export const menuRightEdge = (triggerRight: number, menuWidth: number, viewportWidth: number) =>
  Math.min(viewportWidth - viewportGap, Math.max(triggerRight, viewportGap + menuWidth))

/**
 * The `right` of a menu drawn `absolute right-0` in its trigger's positioned wrapper `anchor`, placed by `menuRightEdge`
 * once the open menu is measured; undefined before, which leaves it at `right-0`.
 */
export const useMenuRight = (open: boolean, anchor: RefObject<HTMLElement | null>, menu: RefObject<HTMLElement | null>) => {
  const [right, setRight] = useState<number>()

  useLayoutEffect(() => {
    if (!open || !anchor.current || !menu.current) {
      setRight(undefined)
      return
    }
    const triggerRight = anchor.current.getBoundingClientRect().right
    // The box's exact width: offsetWidth rounds, which can put a fractional-width menu's left edge inside the gap
    const menuWidth = menu.current.getBoundingClientRect().width
    setRight(triggerRight - menuRightEdge(triggerRight, menuWidth, document.documentElement.clientWidth))
  }, [open])

  return right === undefined ? undefined : { right }
}

/** The part of the layout viewport the user sees: the visual viewport, which an on-screen keyboard shrinks. */
export const visibleViewport = () => {
  const visual = window.visualViewport
  return visual ? { top: visual.offsetTop, height: visual.height } : { top: 0, height: window.innerHeight }
}

/**
 * Whether a menu that opens under its trigger opens above it instead: only when the room below, between the trigger
 * and the visible viewport's bottom, is too small for the menu and its `offset` from the trigger, and the room above
 * is larger.
 */
export const menuOpensAbove = (trigger: { top: number; bottom: number }, menuHeight: number, offset: number, viewport: { top: number; height: number }) => {
  const below = viewport.top + viewport.height - viewportGap - trigger.bottom
  const above = trigger.top - viewport.top - viewportGap
  return offset + menuHeight > below && above > below
}

/**
 * The `top` of a menu drawn `absolute top-full` with a top margin in its trigger's positioned wrapper `anchor`: undefined,
 * which leaves it below, unless `menuOpensAbove` puts it above, the margin's distance over the anchor. It is measured
 * when the menu opens, when `layout` changes, such as content that sets its size, and when the visible viewport resizes,
 * as an on-screen keyboard does.
 */
export const useMenuTop = (open: boolean, anchor: RefObject<HTMLElement | null>, menu: RefObject<HTMLElement | null>, layout?: unknown) => {
  const [top, setTop] = useState<number>()
  const [resized, setResized] = useState(0)

  useEffect(() => {
    const visual = window.visualViewport
    if (!open || !visual) return
    const resize = () => setResized((count) => count + 1)
    visual.addEventListener('resize', resize)
    return () => visual.removeEventListener('resize', resize)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !anchor.current || !menu.current) {
      setTop(undefined)
      return
    }
    const trigger = anchor.current.getBoundingClientRect()
    const height = menu.current.getBoundingClientRect().height
    // The margin keeps the same gap whichever side the menu opens on
    const offset = parseFloat(getComputedStyle(menu.current).marginTop)
    setTop(menuOpensAbove(trigger, height, offset, visibleViewport()) ? -(height + 2 * offset) : undefined)
  }, [open, layout, resized])

  return top === undefined ? undefined : { top }
}
