import type { CallRing } from '@protobase/client'

/** A ring as a page shows it: until when it rings by this browser's clock, from the server's time left when it was read. */
export type ShownRing = CallRing & { until: number }

/** The rings as read at `readAt`, each with the time it stops ringing here. */
export const ringsUntil = (rings: readonly CallRing[], readAt: number): ShownRing[] => rings.map((ring) => ({ ...ring, until: readAt + ring.remaining_ms }))

/** The rings still ringing at `now`, and the next time one stops, to look again then. */
export const ringingAt = (rings: readonly ShownRing[], now: number) => {
  const ringing = rings.filter((ring) => ring.until > now)
  const next = ringing.length === 0 ? undefined : Math.min(...ringing.map((ring) => ring.until))
  return { ringing, next }
}
