import { useState } from 'react'
import { Checkbox } from '../../../../primitives/checkbox'
import { Input } from '../../../../primitives/input'
import { Select } from '../../../../primitives/select'
import { text } from '../messages'
import { conditionKey, type InputPin } from './node-pins'
import { statusLabel } from './pin-text'

// The one kind an inline editor writes, for a pin that takes text, a number or true and false
const inlineKind = (pin: InputPin) => {
  if (pin.options) return 'choice'
  if (pin.type.kinds === 'any') return
  const [kind, ...others] = pin.type.kinds.filter((each) => each !== 'null')
  if (kind === 'string' && others.every((other) => other === 'integer' || other === 'number')) return 'string'
  if (others.length > 0) return
  return kind === 'integer' || kind === 'number' ? 'number' : kind === 'boolean' ? 'boolean' : undefined
}

const numberOf = (typed: string) => (typed.trim() === '' ? undefined : Number.isNaN(Number(typed)) ? typed : Number(typed))

// A number's editor shows what was typed while it has the focus, such as "1." on the way to 1.5, which the value it
// gives, 1, would not; once the focus leaves, it shows the value again.
const NumberInput = ({ name, className, value, onChange }: { name: string; className: string; value: unknown; onChange: (value: unknown) => void }) => {
  const [typed, setTyped] = useState<string>()
  return (
    <Input
      aria-label={name}
      wrapperClassName={`${className} h-6 w-[55%] px-1.5`}
      className="text-xs"
      inputMode="decimal"
      value={typed ?? (value === undefined ? '' : String(value))}
      onChange={(event) => {
        setTyped(event.target.value)
        onChange(numberOf(event.target.value))
      }}
      onBlur={() => setTyped(undefined)}
    />
  )
}

/**
 * What an input pin holds, on its row: an editor of its own value where it is text, a number, true or false or a
 * choice and no wire reads into it, a mark for an expression or an object, which the step's form edits, else nothing.
 */
export const PinValue = ({ pin, label, onChange }: { pin: InputPin; label: string; onChange?: (value: unknown) => void }) => {
  if (pin.state === 'wired' || pin.state === 'made') return null
  // A Condition is an expression, which the step's form edits; wired, it reads a yes or no
  if (pin.key === conditionKey && pin.state !== 'expression') return null
  // An expression shows the values it reads as chips, whose wires show while its node is pointed at or chosen; one that
  // reads nothing, the ƒ mark. The whole expression is on hover.
  if (pin.state === 'expression') {
    const title = text('pinExpression', { expression: String(pin.value) })
    if (!pin.reads?.length) {
      return (
        <span className="ml-auto shrink-0 rounded bg-muted px-1 font-mono text-xs text-muted-foreground" title={title}>
          ƒ
        </span>
      )
    }
    return (
      <span className="ml-auto flex min-w-0 justify-end gap-0.5 overflow-hidden" title={title}>
        {pin.reads.map((read) => (
          <span key={read} className="min-w-0 shrink truncate rounded bg-muted px-1 font-mono text-[10px] leading-4 text-muted-foreground">
            {read}
          </span>
        ))}
      </span>
    )
  }
  const kind = inlineKind(pin)
  if (pin.state === 'literal' && typeof pin.value === 'object') return <span className="ml-auto shrink-0 text-xs text-muted-foreground" title={text('pinObjectValue')}>{'{…}'}</span>
  // A value of a type no editor here takes, such as a key that is text or a number, shows as it is
  if (!kind) return pin.state === 'literal' ? <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">{String(pin.value)}</span> : null
  const name = text('inputValue', { label })
  if (!onChange) return <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">{pin.value === undefined ? '' : String(pin.value)}</span>
  const editor = 'nodrag nopan nowheel ml-auto min-w-0'
  if (kind === 'boolean') return <Checkbox className={editor} checked={pin.value === true} label={name} onChange={(checked) => onChange(checked)} />
  if (kind === 'choice') {
    return (
      <Select aria-label={name} className={`${editor} h-6 max-w-[55%] px-1 py-0 text-xs`} value={typeof pin.value === 'string' ? pin.value : ''} onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}>
        <option value="" />
        {pin.options!.map((option) => (
          <option key={option} value={option}>
            {pin.statuses ? statusLabel(option) : option}
          </option>
        ))}
      </Select>
    )
  }
  if (kind === 'number') return <NumberInput name={name} className={editor} value={pin.value} onChange={onChange} />
  return (
    <Input
      aria-label={name}
      wrapperClassName={`${editor} h-6 w-[55%] px-1.5`}
      className="text-xs"
      value={pin.value === undefined ? '' : String(pin.value)}
      onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
    />
  )
}
