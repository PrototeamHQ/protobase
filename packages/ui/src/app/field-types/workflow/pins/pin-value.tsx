import { Checkbox } from '../../../../primitives/checkbox'
import { Input } from '../../../../primitives/input'
import { Select } from '../../../../primitives/select'
import { text } from '../messages'
import { conditionKey, type InputPin } from './node-pins'

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

/**
 * What an input pin holds, on its row: an editor of its own value where it is text, a number, true or false or a
 * choice and no wire reads into it, a mark for an expression or an object, which the step's form edits, else nothing.
 */
export const PinValue = ({ pin, label, onChange }: { pin: InputPin; label: string; onChange?: (value: unknown) => void }) => {
  if (pin.state === 'wired' || pin.state === 'made') return null
  // A Condition is an expression, which the step's form edits; wired, it reads a yes or no
  if (pin.key === conditionKey && pin.state !== 'expression') return null
  if (pin.state === 'expression') {
    return (
      <span className="ml-auto shrink-0 rounded bg-muted px-1 font-mono text-xs text-muted-foreground" title={text('pinExpression', { expression: String(pin.value) })}>
        ƒ
      </span>
    )
  }
  const kind = inlineKind(pin)
  if (!kind || (pin.state === 'literal' && typeof pin.value === 'object')) {
    return pin.state === 'literal' ? <span className="ml-auto shrink-0 text-xs text-muted-foreground" title={text('pinObjectValue')}>{'{…}'}</span> : null
  }
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
            {option}
          </option>
        ))}
      </Select>
    )
  }
  return (
    <Input
      aria-label={name}
      wrapperClassName={`${editor} h-6 w-[55%] px-1.5`}
      className="text-xs"
      inputMode={kind === 'number' ? 'decimal' : undefined}
      value={pin.value === undefined ? '' : String(pin.value)}
      onChange={(event) => onChange(kind === 'number' ? numberOf(event.target.value) : event.target.value === '' ? undefined : event.target.value)}
    />
  )
}
