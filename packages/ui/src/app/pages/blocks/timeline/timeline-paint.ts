import { isBadgeTone, type FieldModel, type FieldViewModel } from '@protobase/schema'
import { toneDots } from '../../../../primitives/badge'
import { colorOf } from '../../../charts/chart-groups'

/** How a segment is filled: a tone's class or a colour, striped while its value waits. */
export type SegmentPaint = { className?: string; color?: string; striped: boolean }

// A wait reads apart from work at a glance, in any colour: the background shows through every other stripe
export const stripes = 'repeating-linear-gradient(-45deg, transparent 0 4px, color-mix(in srgb, var(--background) 55%, transparent) 4px 6px)'

/**
 * A segment's fill by its `color` value: the tone or hex colour its view's `valueColors` gives it, else the chart
 * colour of its place among the enum's values, as a chart colours it; striped when the view marks it waiting.
 */
export const segmentPaint = (field: FieldModel, hints: FieldViewModel | undefined, value: unknown): SegmentPaint => {
  const key = String(value)
  const striped = hints?.waitingValues?.includes(key) ?? false
  const declared = hints?.valueColors && Object.hasOwn(hints.valueColors, key) ? hints.valueColors[key] : undefined
  if (declared !== undefined && isBadgeTone(declared)) return { className: toneDots[declared], striped }
  return { color: colorOf(field, hints, value === undefined ? null : (value as string | null), -1), striped }
}
