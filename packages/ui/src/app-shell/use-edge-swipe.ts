import { useEffect, useRef, type RefObject } from 'react'
import { drawerSettleCurve, drawerSettleMs, drawerSlope, drawerSlop, endsOpen, startsDrag } from '../primitives/drawer-math'
import type { DrawerControl } from './drawer'
import type { DeclaredEdgeSwipe } from './edge-swipe'

/** How far from the screen's left edge a touch counts as a swipe from it, in CSS pixels, as iOS's own edge. */
export const edgeZone = 24

type Parts = {
  /** As the host app is told (`declaredEdgeSwipe`): this page does `sidebar` and `page`, its own way back. */
  action: DeclaredEdgeSwipe
  /** Goes back a page, once the page has slid away. */
  onBack: () => void
  /** Opens the drawer under the finger, which `drawer` then moves. */
  openDrawer: () => void
  drawer: RefObject<DrawerControl | null>
}

// The action is the one at the swipe's start, kept to its end: opening the drawer changes the page's own to none
type Swipe = { action: 'back' | 'sidebar'; x: number; y: number; dragging: boolean; dx: number; samples: Array<{ dx: number; time: number }>; mark?: HTMLElement }

/** How far the finger goes for a full way back, in CSS pixels: let go past half of it, or flicked, it goes back. */
const backReach = 120

// The round mark with a chevron that comes in from the edge beside the finger on the way back, while the page stays
const backMark = (y: number) => {
  const mark = document.createElement('div')
  mark.setAttribute('aria-hidden', 'true')
  mark.style.cssText = `position:fixed;left:0;top:${y - 22}px;z-index:90;width:44px;height:44px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:var(--background);color:var(--foreground);box-shadow:var(--shadow-pop);pointer-events:none;transform:translateX(-48px);opacity:0`
  mark.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>'
  document.body.append(mark)
  return mark
}

// The mark at `progress` of the way back, up to a little past full, stronger as it goes
const placeMark = (mark: HTMLElement, progress: number, animate: boolean) => {
  const shown = Math.min(progress, 1.15)
  mark.style.transition = animate && !reducedMotion() ? `transform ${drawerSettleMs}ms ${drawerSettleCurve}, opacity ${drawerSettleMs}ms` : 'none'
  mark.style.transform = `translateX(${-48 + shown * 64}px) scale(${0.8 + 0.2 * Math.min(progress, 1)})`
  mark.style.opacity = String(Math.min(progress * 1.5, 1))
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// The finger's speed rightwards over the stretch before it let go at `released`, in pixels a second: none once it rested
const velocityOf = (samples: Swipe['samples'], released: number) => {
  const last = samples.at(-1)
  if (!last) return 0
  const first = samples.find((sample) => released - sample.time <= 100) ?? last
  const elapsed = last.time - first.time
  return elapsed > 0 ? ((last.dx - first.dx) / elapsed) * 1000 : 0
}

/**
 * A swipe from the left edge as `action` says (`edgeSwipeAction`), with the drawer engine's numbers: once past the slop
 * and within its angle, `sidebar` opens the drawer under the finger and lets go as a drag on it does, and `back` brings
 * a round back mark in from the edge beside the finger while the page stays where it is, and goes back when let go past
 * half way or flicked, or the mark goes again. `none` leaves the edge alone, to whatever is around the page.
 */
export const useEdgeSwipe = ({ action, onBack, openDrawer, drawer }: Parts) => {
  // What this page does itself: the host app's own back swipe is the app's
  const own: 'back' | 'sidebar' | 'none' = action === 'sidebar' ? 'sidebar' : action === 'page' ? 'back' : 'none'
  const latest = useRef({ action: own, onBack, openDrawer })
  latest.current = { action: own, onBack, openDrawer }

  useEffect(() => {
    let swipe: Swipe | undefined
    const width = () => window.innerWidth

    // Out again, after going back or not
    const dropMark = (mark: HTMLElement) => {
      placeMark(mark, 0, true)
      setTimeout(() => mark.remove(), reducedMotion() ? 0 : drawerSettleMs)
    }
    // A swipe that stops without being let go, as when a second finger comes or the browser stops tracking the touch:
    // the mark goes and the drawer closes, without going anywhere
    const cancel = () => {
      const done = swipe
      swipe = undefined
      if (!done?.dragging) return
      if (done.action === 'sidebar') drawer.current?.settle(0, 0)
      else if (done.mark) dropMark(done.mark)
    }

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      const action = latest.current.action
      cancel()
      swipe = action !== 'none' && event.touches.length === 1 && touch && touch.clientX <= edgeZone ? { action, x: touch.clientX, y: touch.clientY, dragging: false, dx: 0, samples: [] } : undefined
    }
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!swipe || !touch) return
      const dx = touch.clientX - swipe.x
      const dy = touch.clientY - swipe.y
      if (!swipe.dragging) {
        if (Math.hypot(dx, dy) < drawerSlop) return
        if (dx <= 0 || !startsDrag(dx, dy, drawerSlope)) {
          swipe = undefined
          return
        }
        swipe.dragging = true
        swipe.x = touch.clientX
        if (swipe.action === 'sidebar') latest.current.openDrawer()
        else swipe.mark = backMark(touch.clientY)
        return
      }
      swipe.dx = Math.max(0, dx)
      swipe.samples.push({ dx: swipe.dx, time: event.timeStamp })
      if (swipe.action === 'sidebar') drawer.current?.follow(swipe.dx / Math.min(width() * 0.88, 384))
      else if (swipe.mark) placeMark(swipe.mark, swipe.dx / backReach, false)
    }
    const onEnd = (event: TouchEvent) => {
      const done = swipe
      swipe = undefined
      if (!done?.dragging) return
      const velocity = velocityOf(done.samples, event.timeStamp)
      if (done.action === 'sidebar') return drawer.current?.settle(done.dx / Math.min(width() * 0.88, 384), velocity)
      const mark = done.mark
      if (!mark) return
      if (endsOpen(done.dx / backReach, velocity)) latest.current.onBack()
      dropMark(mark)
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    // Passive, as every touch listener of the page's, so no scroll ever waits on it; a swipe from the edge moves sideways,
    // within the drawer's angle, which scrolls the page little if at all
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', cancel)
    return () => {
      cancel()
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', cancel)
    }
  }, [drawer])
}
