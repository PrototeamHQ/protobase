import { useEffect, useRef, type PointerEvent, type RefObject } from 'react'
import { backdropAlpha, backdropSlope, dragProgress, drawerDim, drawerSettleCurve, drawerSettleMs, drawerSlope, endsOpen, startsDrag } from './drawer-math'

/** Which way the drawer opens: `x` from the left edge, `y` from the bottom. */
export type DrawerAxis = 'x' | 'y'

type Parts = {
  axis: DrawerAxis
  panel: RefObject<HTMLElement | null>
  backdrop: RefObject<HTMLElement | null>
  /** Closes the drawer once a drag has taken it away; the drawer is then off the screen already. */
  onDraggedClosed: () => void
}

type Drag = { x: number; y: number; from: number; along: number; dragging: boolean; onBackdrop: boolean; samples: Array<{ along: number; time: number }>; ignored: boolean }

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// How far a finger moved towards open, along the axis: rightwards for a side drawer, upwards for a sheet
const alongOf = (axis: DrawerAxis, dx: number, dy: number) => (axis === 'x' ? dx : -dy)
const acrossOf = (axis: DrawerAxis, dx: number, dy: number) => (axis === 'x' ? dy : dx)

// The finger's speed towards open over the last stretch of the drag, in pixels a second
const velocityOf = (samples: Drag['samples']) => {
  const last = samples.at(-1)
  if (!last) return 0
  const first = samples.find((sample) => last.time - sample.time <= 100) ?? last
  const elapsed = last.time - first.time
  return elapsed > 0 ? ((last.along - first.along) / elapsed) * 1000 : 0
}

/**
 * A drawer that moves under the finger as the native one does (`drawer-math`), along either axis: a drag on it or on
 * the dim beside it, once past the slop and within its angle, moves it one to one, past open as a rubber band, the dim
 * following; let go, it settles open or closes by where it is and how fast it went, with a critically damped curve.
 * It writes the panel's and the backdrop's styles directly, so a drag draws no React render. Returns the pointer
 * handlers for the panel and for the backdrop.
 */
export const useDrawerDrag = ({ axis, panel, backdrop, onDraggedClosed }: Parts) => {
  const drag = useRef<Drag>(undefined)
  // Whether the last touch was a drag, whose release then is no tap
  const wasDrag = useRef(false)
  // The close that follows a drag let go closed, which a drag that takes the drawer again calls off
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined)
  const cancelClosing = () => clearTimeout(closing.current)
  useEffect(() => () => clearTimeout(closing.current), [])

  const size = () => {
    const element = panel.current
    return element ? (axis === 'x' ? element.offsetWidth : element.offsetHeight) : 1
  }

  const place = (progress: number, animate: boolean) => {
    const element = panel.current
    if (!element) return
    const transition = animate && !reducedMotion() ? `${drawerSettleMs}ms ${drawerSettleCurve}` : 'none'
    const offset = (progress - 1) * size()
    element.style.transition = transition === 'none' ? 'none' : `transform ${transition}`
    element.style.transform = progress === 1 ? '' : axis === 'x' ? `translateX(${offset}px)` : `translateY(${-offset}px)`
    const shade = backdrop.current
    if (!shade) return
    shade.style.transition = transition === 'none' ? 'none' : `opacity ${transition}`
    shade.style.opacity = String(backdropAlpha(progress) / drawerDim)
  }

  // Let go at `progress` and `velocity`: open, or closed and then gone
  const settle = (progress: number, velocity: number) => {
    cancelClosing()
    if (endsOpen(Math.min(progress, 1), velocity)) return place(1, true)
    place(0, true)
    closing.current = setTimeout(onDraggedClosed, reducedMotion() ? 0 : drawerSettleMs)
  }

  const handlers = (onBackdrop: boolean) => ({
    onPointerDown: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return
      wasDrag.current = false
      drag.current = { x: event.clientX, y: event.clientY, from: 1, along: 0, dragging: false, onBackdrop, samples: [], ignored: false }
    },
    onPointerMove: (event: PointerEvent) => {
      const current = drag.current
      if (!current || current.ignored) return
      const dx = event.clientX - current.x
      const dy = event.clientY - current.y
      const along = alongOf(axis, dx, dy)
      if (!current.dragging) {
        const across = acrossOf(axis, dx, dy)
        if (Math.hypot(along, across) < 10) return
        if (!startsDrag(along, across, current.onBackdrop ? backdropSlope : drawerSlope)) {
          current.ignored = true
          return
        }
        current.dragging = true
        cancelClosing()
        // From here, so the drawer does not jump by the slop
        current.x = event.clientX
        current.y = event.clientY
        ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
        return
      }
      current.along = along
      current.samples.push({ along, time: event.timeStamp })
      place(dragProgress(current.from, along, size()), false)
    },
    onPointerUp: () => {
      const current = drag.current
      drag.current = undefined
      if (!current?.dragging) return
      wasDrag.current = true
      settle(dragProgress(current.from, current.along, size()), velocityOf(current.samples))
    },
    onPointerCancel: () => {
      if (drag.current?.dragging) place(1, true)
      drag.current = undefined
    },
  })

  return {
    panelHandlers: handlers(false),
    backdropHandlers: handlers(true),
    dragged: () => wasDrag.current,
    // For a drag that starts elsewhere, such as from the screen's edge: the drawer under the finger, then let go
    follow: (progress: number) => {
      cancelClosing()
      place(progress, false)
    },
    settle,
  }
}
