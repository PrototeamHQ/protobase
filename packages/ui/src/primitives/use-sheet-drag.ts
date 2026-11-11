import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent, type RefObject } from 'react'
import { closesOnRelease, dragSlop, dragsInsteadOfScroll, releaseVelocity, sheetOffset, type DragSample } from './sheet-drag'

/** How long the sheet takes to rise, spring back or slide away, in milliseconds. */
export const sheetMotionMs = 300
const ease = 'cubic-bezier(0.32, 0.72, 0, 1)'

type Parts = {
  panel: RefObject<HTMLElement | null>
  backdrop: RefObject<HTMLElement | null>
  /** The sheet's scrolling content: a drag down from its top moves the sheet instead of the content. */
  content: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
}

type Drag = { x: number; y: number; samples: DragSample[]; dragging: boolean; scrolling: boolean }

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A bottom sheet that moves under the finger as a native one does: it rises when opened, follows a drag down on its
 * header, or on its content once that is scrolled to the top, and when let go closes or springs back by how far and how
 * fast it went (`closesOnRelease`). The backdrop fades as it goes down. It writes the panel's and the backdrop's styles
 * directly, so a drag draws no React render. With less motion asked for, it opens and closes at once.
 *
 * Returns `dismiss`, which slides the sheet away and then calls `onClose`, and the header's pointer handler.
 */
export const useSheetDrag = ({ panel, backdrop, content, open, onClose }: Parts) => {
  const drag = useRef<Drag>(undefined)
  const closing = useRef(false)
  const close = useRef(onClose)
  close.current = onClose

  const place = useCallback(
    (offset: number, animate: boolean) => {
      const sheet = panel.current
      if (!sheet) return
      const transition = animate && !reducedMotion() ? `${sheetMotionMs}ms ${ease}` : 'none'
      sheet.style.transition = transition === 'none' ? 'none' : `transform ${transition}`
      sheet.style.transform = offset === 0 ? '' : `translateY(${offset}px)`
      const shade = backdrop.current
      if (!shade) return
      shade.style.transition = transition === 'none' ? 'none' : `opacity ${transition}`
      shade.style.opacity = String(1 - Math.max(0, offset) / Math.max(1, sheet.offsetHeight))
    },
    [panel, backdrop],
  )

  // Rises from below the screen when it opens
  useLayoutEffect(() => {
    const sheet = panel.current
    if (!open || !sheet) return
    closing.current = false
    if (reducedMotion()) return
    place(sheet.offsetHeight, false)
    const frame = requestAnimationFrame(() => place(0, true))
    return () => cancelAnimationFrame(frame)
  }, [open, panel, place])

  const dismiss = useCallback(() => {
    const sheet = panel.current
    if (closing.current) return
    if (!sheet || reducedMotion()) return close.current()
    closing.current = true
    place(sheet.offsetHeight, true)
    setTimeout(() => close.current(), sheetMotionMs)
  }, [panel, place])

  const begin = (x: number, y: number) => {
    drag.current = { x, y, samples: [{ y, time: performance.now() }], dragging: false, scrolling: false }
  }
  const move = (y: number) => {
    const current = drag.current
    if (!current) return
    current.samples.push({ y, time: performance.now() })
    place(sheetOffset(y - current.y), false)
  }
  const end = () => {
    const current = drag.current
    drag.current = undefined
    const sheet = panel.current
    if (!current?.dragging || !sheet) return
    const last = current.samples.at(-1)!
    const offset = sheetOffset(last.y - current.y)
    if (closesOnRelease(offset, sheet.offsetHeight, releaseVelocity(current.samples))) return dismiss()
    place(0, true)
  }

  // The content scrolls until it is at its top and the finger moves down, then the sheet follows the finger instead.
  // Touch events, not pointer events: only a touchmove listener that is not passive can stop the scroll it hands over.
  useEffect(() => {
    const area = content.current
    if (!open || !area) return
    const start = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (event.touches.length !== 1 || !touch) return
      begin(touch.clientX, touch.clientY)
    }
    const moveTouch = (event: TouchEvent) => {
      const current = drag.current
      const touch = event.touches[0]
      if (!current || !touch || current.scrolling) return
      if (!current.dragging) {
        const dx = touch.clientX - current.x
        const dy = touch.clientY - current.y
        if (Math.abs(dx) < dragSlop && Math.abs(dy) < dragSlop) return
        if (!dragsInsteadOfScroll(area.scrollTop, dx, dy)) {
          current.scrolling = true
          return
        }
        // The drag starts from here, so the sheet does not jump by the slop
        current.dragging = true
        current.y = touch.clientY
      }
      event.preventDefault()
      move(touch.clientY)
    }
    area.addEventListener('touchstart', start, { passive: true })
    area.addEventListener('touchmove', moveTouch, { passive: false })
    area.addEventListener('touchend', end)
    area.addEventListener('touchcancel', end)
    return () => {
      area.removeEventListener('touchstart', start)
      area.removeEventListener('touchmove', moveTouch)
      area.removeEventListener('touchend', end)
      area.removeEventListener('touchcancel', end)
    }
  })

  // The header drags with any pointer, followed on the window so a mouse leaving it keeps dragging. A press that does
  // not move stays a press, so its buttons still click.
  const header = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      begin(event.clientX, event.clientY)
      const follow = (next: globalThis.PointerEvent) => {
        const current = drag.current
        if (!current || next.pointerId !== event.pointerId) return
        if (!current.dragging) {
          if (Math.abs(next.clientY - current.y) < dragSlop) return
          current.dragging = true
          current.y = next.clientY
        }
        move(next.clientY)
      }
      const stop = (next: globalThis.PointerEvent) => {
        if (next.pointerId !== event.pointerId) return
        // A swipe reported only where it lifted still counts, from where it started
        const current = drag.current
        if (current && !current.dragging && Math.abs(next.clientY - current.y) >= dragSlop) {
          current.dragging = true
          current.samples.push({ y: next.clientY, time: performance.now() })
        }
        window.removeEventListener('pointermove', follow)
        window.removeEventListener('pointerup', stop)
        window.removeEventListener('pointercancel', stop)
        end()
      }
      window.addEventListener('pointermove', follow)
      window.addEventListener('pointerup', stop)
      window.addEventListener('pointercancel', stop)
    },
  }

  return { dismiss, header }
}
