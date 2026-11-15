import { keyOf, type TimelineBar, type TimelineShape } from './timeline-layout'

/** Which bar of a timeline one is, by its lane's key and its own, so it is found again in a newer shape. */
export type BarId = { lane: string; bar: string }

export const barIdOf = (bar: TimelineBar): BarId => ({ lane: keyOf(bar.lane), bar: bar.key })

/** The bar `id` names in `shape`, as the current data places it, or `null` when it is no longer there. */
export const barIn = (shape: TimelineShape, id: BarId | null) => {
  if (!id) return null
  const lane = shape.lanes.find((candidate) => candidate.key === id.lane)
  return lane?.rows.flat().find((bar) => bar.key === id.bar) ?? null
}
