/**
 * The drawer's numbers, as a native iOS side drawer tuned on a device has them, for every drawer and sheet of the
 * shell along either axis: in pure functions, so tests prove them.
 */

/** How far a touch moves before it is a drag of the drawer; below it, a lift is a tap, in pixels. */
export const drawerSlop = 10
/** How fast a release finishes in its own direction, however far the drawer moved, in pixels a second. */
export const drawerFlick = 500
/** The backdrop's dim at fully open. */
export const drawerDim = 0.35
/** The most the drawer goes past open, never reached, in pixels. */
export const drawerBandLimit = 40
/** The steepest angle from its axis a drag on the drawer may start at (30 degrees): tan 30. */
export const drawerSlope = 0.58
/** On the backdrop, with nothing to scroll (45 degrees). */
export const backdropSlope = 1
/** How long a release settles, in milliseconds. */
export const drawerSettleMs = 350
/** A critically damped spring, as a CSS curve: fast at first, coming to rest without overshoot. */
export const drawerSettleCurve = 'cubic-bezier(0.25, 1, 0.5, 1)'

/** A side drawer's width: 88% of the screen, at most 384 pixels. */
export const sideDrawerWidth = 'min(88vw, 384px)'

/** Whether the drawer ends open on release, at `progress` (0 closed, 1 open) moving `velocity` pixels a second, positive towards open. */
export const endsOpen = (progress: number, velocity: number) => (Math.abs(velocity) >= drawerFlick ? velocity > 0 : progress >= 0.5)

/** How far past open the drawer shows for a drag `over` pixels past it. */
export const rubberBand = (over: number) => (over > 0 ? drawerBandLimit * (1 - 1 / ((0.55 * over) / drawerBandLimit + 1)) : 0)

/** The backdrop's opacity at `progress`. */
export const backdropAlpha = (progress: number) => drawerDim * Math.min(Math.max(progress, 0), 1)

/** Whether a movement lies within `slope` of the axis, `along` its distance on the axis and `across` off it. */
export const withinAngle = (along: number, across: number, slope: number) => along !== 0 && Math.abs(across) <= slope * Math.abs(along)

/** Whether a first movement `along` and `across` the axis may start a drag: far enough, and within `slope` of the axis. */
export const startsDrag = (along: number, across: number, slope: number) => Math.hypot(along, across) >= drawerSlop && withinAngle(along, across, slope)

/**
 * Where the drawer stands for a finger `moved` pixels towards open from where it was at `from` (0 closed, 1 open),
 * across `size` pixels: following the finger, and past open as a rubber band.
 */
export const dragProgress = (from: number, moved: number, size: number) => {
  const raw = from + moved / Math.max(1, size)
  return raw <= 1 ? Math.max(raw, 0) : 1 + rubberBand((raw - 1) * size) / Math.max(1, size)
}
