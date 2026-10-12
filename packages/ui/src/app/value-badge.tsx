import type { ReactNode } from 'react'
import type { FieldViewModel } from '@protobase/schema'
import { toneFor } from '../live/columns-from-model'
import { valueColor } from '../live/value-color'
import { Badge } from '../primitives/badge'

/** A stored value as a badge: filled with the colour the view gives it and in its badge shape, else in its tone. */
export const ValueBadge = ({ value, hints, children }: { value: unknown; hints: FieldViewModel | undefined; children: ReactNode }) => (
  <Badge tone={toneFor(String(value))} color={valueColor(hints?.valueColors, value)} shape={hints?.badgeShape}>
    {children}
  </Badge>
)
