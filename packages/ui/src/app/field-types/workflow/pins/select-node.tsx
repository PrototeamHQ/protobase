import { Handle, Position } from '@xyflow/react'
import { X } from 'lucide-react'
import { selectValue, type SelectPart, type SelectValue } from '@protobase/workflows'
import { Input } from '../../../../primitives/input'
import { text } from '../messages'
import type { SelectNode } from './data-graph'
import { usePinActions } from './pin-actions'
import { InputRow } from './pin-rows'
import { pinColour } from './pin-text'
import { selectOut } from './pure-ids'

// What was typed, as the kind of value it replaces: a number stays one while it reads as one, true and false stay
// true and false, and anything else is text
const typed = (next: string, before: SelectValue): SelectValue => {
  if (typeof before === 'number' && next.trim() !== '' && Number.isFinite(Number(next))) return Number(next)
  if (typeof before === 'boolean' && (next === 'true' || next === 'false')) return next === 'true'
  return next
}

const editor = 'nodrag nopan nowheel h-6 min-w-0 px-1.5'

// A value of the node's own, typed on its row
const ValueInput = ({ label, value, onChange, disabled }: { label: string; value: SelectValue; onChange: (value: SelectValue) => void; disabled: boolean }) => (
  <Input aria-label={label} wrapperClassName={`${editor} flex-1`} className="text-xs" value={String(value)} disabled={disabled} onChange={(event) => onChange(typed(event.target.value, value))} />
)

/**
 * A Select's rows: the value it looks at, a pin a wire reads into or a value of its own; then a row per case, the
 * value it can be and what the node gives then; what it gives for any other; and a button that adds a case. Its value
 * goes out on the right, to the argument it chooses.
 */
export const SelectRows = ({ node, editable }: { node: SelectNode; editable: boolean }) => {
  const actions = usePinActions()
  const disabled = !actions || !editable
  const write = (part: SelectPart) => actions?.setArgument(node.target, [node.key], selectValue(part))
  const { part } = node
  const setCase = (index: number, change: Partial<SelectPart['cases'][number]>) => write({ ...part, cases: part.cases.map((each, position) => (position === index ? { ...each, ...change } : each)) })
  return (
    <div className="relative pt-1">
      <Handle id={selectOut} type="source" position={Position.Right} isConnectable={false} className={`pb-pin pb-pin-${pinColour(node.type)}`} style={{ top: 13 }} />
      {node.inputs.map((pin) => (
        <InputRow key={pin.key} pin={pin} step={node.target} keys={[]} name={text('selectInput')} connectable={editable} onValue={(value) => write({ ...part, operand: { value: typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : '' } })} />
      ))}
      {part.cases.map((each, index) => (
        <div key={index} className="flex h-[26px] items-center gap-1 pr-2 pl-3">
          <ValueInput label={text('selectWhen', { case: index + 1 })} value={each.when} disabled={disabled} onChange={(when) => setCase(index, { when })} />
          <span aria-hidden="true" className="text-xs text-muted-foreground">
            →
          </span>
          <ValueInput label={text('selectThen', { case: index + 1 })} value={each.then} disabled={disabled} onChange={(then) => setCase(index, { then })} />
          <button
            type="button"
            className="nodrag shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label={text('selectRemoveCase', { case: index + 1 })}
            disabled={disabled || part.cases.length === 1}
            onClick={() => write({ ...part, cases: part.cases.filter((_, position) => position !== index) })}
          >
            <X className="size-3" aria-hidden />
          </button>
        </div>
      ))}
      <div className="flex h-[26px] items-center gap-1 pr-2 pl-3">
        <span className="shrink-0 text-xs text-body">{text('selectOtherwise')}</span>
        <ValueInput label={text('selectOtherwise')} value={part.otherwise} disabled={disabled} onChange={(otherwise) => write({ ...part, otherwise })} />
      </div>
      <button type="button" className="nodrag h-6 w-full px-3 text-left text-xs text-muted-foreground hover:text-foreground" disabled={disabled} onClick={() => write({ ...part, cases: [...part.cases, { when: '', then: '' }] })}>
        {text('selectAddCase')}
      </button>
    </div>
  )
}
