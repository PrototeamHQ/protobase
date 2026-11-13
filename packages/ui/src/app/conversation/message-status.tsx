import { Check, CircleAlert } from 'lucide-react'
import type { ToolCallState } from '@protobase/layout'
import { enumLabel, type FieldViewModel } from '@protobase/schema'
import { valueTone } from '../../live/value-color'
import { Spinner } from '../../primitives/spinner'

/**
 * A message's or tool call's status in its view's label; a value the view colours `red`, such as a failed send, reads
 * as a problem. A tool call's `mark` draws its state before the label: a check when done, a spinner while running, and
 * an error as a problem.
 */
export const MessageStatus = ({ value, hints, mark }: { value: string; hints: FieldViewModel | undefined; mark?: ToolCallState }) => {
  const label = enumLabel(value, hints?.valueLabels)
  if (mark === 'done') {
    return (
      <span className="inline-flex items-center gap-1">
        <Check aria-hidden className="size-3.5 shrink-0 text-success-text" />
        {label}
      </span>
    )
  }
  if (mark === 'running') {
    return (
      <span className="inline-flex items-center gap-1">
        <Spinner hidden className="size-3.5 shrink-0" />
        {label}
      </span>
    )
  }
  if (mark !== 'error' && valueTone(hints?.valueColors, value) !== 'red') return label
  return (
    <span className="inline-flex items-center gap-1 text-danger-text">
      <CircleAlert aria-hidden className="size-3.5 shrink-0" />
      {label}
    </span>
  )
}
