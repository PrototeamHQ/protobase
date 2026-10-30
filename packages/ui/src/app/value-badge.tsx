import type { ReactNode } from 'react'
import type { FieldViewModel } from '@protobase/schema'
import { valueColor, valueTone } from '../live/value-color'
import { Badge } from '../primitives/badge'

/** A stored value as a badge: in its badge shape, filled with the colour the view gives it or in the tone it gives it. */
export const ValueBadge = ({ value, hints, children }: { value: unknown; hints: FieldViewModel | undefined; children: ReactNode }) => (
  <Badge tone={valueTone(hints?.valueColors, value)} color={valueColor(hints?.valueColors, value)} shape={hints?.badgeShape}>
    {children}
  </Badge>
)
