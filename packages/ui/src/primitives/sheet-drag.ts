import { drawerSlope, drawerSlop, endsOpen, rubberBand, withinAngle } from './drawer-math'

/** How far a finger moves before a press on the sheet counts as a drag, in pixels: the drawers' own (`drawer-math`). */
export const dragSlop = drawerSlop

/** How far back release speed is read, in milliseconds: the last stretch of the drag, not its whole. */
const velocityWindow = 100

/** Where the sheet sits for a finger `dy` pixels below where it started: down it follows, up it gives as a rubber band. */
export const sheetOffset = (dy: number) => (dy >= 0 ? dy : -rubberBand(-dy))

export type DragSample = { y: number; time: number }

/** The finger's speed downwards over the last stretch of a drag, in pixels per millisecond; negative is upwards. */
export const releaseVelocity = (samples: DragSample[]) => {
  const last = samples.at(-1)
  if (!last) return 0
  const first = samples.find((sample) => last.time - sample.time <= velocityWindow) ?? last
  const elapsed = last.time - first.time
  return elapsed > 0 ? (last.y - first.y) / elapsed : 0
}

/**
 * Whether a sheet let go `offset` pixels below where it rests, moving at `velocity` pixels a millisecond downwards,
 * closes, by the drawers' rule (`endsOpen`): a fast release heads its way, a slow one closes past half its height.
 */
export const closesOnRelease = (offset: number, height: number, velocity: number) => {
  if (offset <= dragSlop) return false
  return !endsOpen(1 - offset / Math.max(1, height), -velocity * 1000)
}

/**
 * Whether a finger moving `dx`, `dy` in the sheet's scrolling content drags the sheet instead of scrolling: only down,
 * mostly down, and with the content scrolled to its top, so a scroll reaching the top hands over to the drag.
 */
export const dragsInsteadOfScroll = (scrollTop: number, dx: number, dy: number) => scrollTop <= 0 && dy > 0 && withinAngle(dy, dx, drawerSlope)
