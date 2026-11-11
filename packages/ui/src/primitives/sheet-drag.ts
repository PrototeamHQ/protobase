/** How far a finger moves before a press on the sheet counts as a drag, in pixels. */
export const dragSlop = 6

/** How far up the sheet gives when dragged above where it rests, in pixels: it stops there, as if held by a spring. */
const maxLift = 24

/** The share of its height a sheet must be dragged down to close when let go slowly. */
const closeShare = 0.3

/** How fast a downward fling closes the sheet from wherever it is let go, in pixels per millisecond. */
const flingSpeed = 0.5

/** How far back release speed is read, in milliseconds: the last stretch of the drag, not its whole. */
const velocityWindow = 100

/** Where the sheet sits for a finger `dy` pixels below where it started: down it follows, up it gives a little. */
export const sheetOffset = (dy: number) => (dy >= 0 ? dy : -maxLift * (1 - Math.exp(dy / maxLift)))

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
 * Whether a sheet let go `offset` pixels below where it rests, moving at `velocity`, closes: a fling down closes it, as
 * does letting go past `closeShare` of its height unless the finger was moving back up; otherwise it springs back.
 */
export const closesOnRelease = (offset: number, height: number, velocity: number) => {
  if (offset <= dragSlop) return false
  if (velocity >= flingSpeed) return true
  return offset >= height * closeShare && velocity > -flingSpeed / 2
}

/**
 * Whether a finger moving `dx`, `dy` in the sheet's scrolling content drags the sheet instead of scrolling: only down,
 * mostly down, and with the content scrolled to its top, so a scroll reaching the top hands over to the drag.
 */
export const dragsInsteadOfScroll = (scrollTop: number, dx: number, dy: number) => scrollTop <= 0 && dy > 0 && dy > Math.abs(dx)
