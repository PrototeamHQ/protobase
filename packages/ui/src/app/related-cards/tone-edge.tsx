import type { ViewModel } from '@protobase/schema'
import { cn } from '../../lib/cn'
import { edgeLook } from './edge-look'

/**
 * A card's left edge in the colour its `field`'s value has in the view's `valueColors`, over the card's own border. The
 * card shows the value in words among its values too, so the colour is never all that says it; the card is `relative`.
 */
export const ToneEdge = ({ view, field, record }: { view: ViewModel | undefined; field: string; record: Record<string, unknown> }) => {
  const look = edgeLook(view?.fields[field]?.valueColors, record[field])
  return <span aria-hidden data-tone-edge style={look.style} className={cn('absolute -inset-y-px -left-px w-1 rounded-l-lg', look.className)} />
}
