import { CircleAlert } from 'lucide-react'
import { enumLabel, type FieldViewModel } from '@protobase/schema'
import { valueTone } from '../../live/value-color'

/** A message's status in its view's label; a value the view colours `red`, such as a failed send, reads as a problem. */
export const MessageStatus = ({ value, hints }: { value: string; hints: FieldViewModel | undefined }) => {
  const label = enumLabel(value, hints?.valueLabels)
  if (valueTone(hints?.valueColors, value) !== 'red') return label
  return (
    <span className="inline-flex items-center gap-1 text-danger-text">
      <CircleAlert aria-hidden className="size-3.5 shrink-0" />
      {label}
    </span>
  )
}
