import { useLayoutEffect, useState, type RefObject } from 'react'

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
    setRight(triggerRight - menuRightEdge(triggerRight, menu.current.offsetWidth, document.documentElement.clientWidth))
  }, [open])

  return right === undefined ? undefined : { right }
}
