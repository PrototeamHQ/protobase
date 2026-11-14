/**
 * How tall an `HtmlFrame` is for its page: `measured`, the height its page last reported, with the frame's own height
 * when it did, or `fixed`, for a page sized by the frame's viewport, such as one `100vh` tall or `height: 100%` with a
 * margin, which reports a taller page each time the frame takes its last height.
 */
export type FrameHeight = { kind: 'measured'; height: number; viewport: number } | { kind: 'fixed' }

// Reported heights are rounded up to whole pixels.
const rounding = 1

/**
 * The frame's height after its page reports `height` while the frame is `viewport` tall. A page whose height changed by
 * as much as the frame did since its last report is sized by the frame, and the frame stays fixed for it.
 */
export const nextFrameHeight = (previous: FrameHeight | undefined, height: number, viewport: number): FrameHeight => {
  if (previous?.kind === 'fixed') return previous
  if (previous && viewport !== previous.viewport && Math.abs(height - previous.height - (viewport - previous.viewport)) <= rounding) return { kind: 'fixed' }
  return { kind: 'measured', height, viewport }
}

/**
 * The frame's box: as tall as its page's measured height, or a fixed minimum while nothing is measured, for a page
 * measured 0 tall, and for a page sized by the frame. That page scrolls inside the frame, the one inner scroll box here:
 * the app's page cannot scroll content whose height depends on the frame's own.
 */
export const frameBox = (size: FrameHeight | undefined) =>
  size?.kind === 'measured' && size.height > 0 ? { style: { height: size.height } } : { className: 'min-h-[60vh]' }
