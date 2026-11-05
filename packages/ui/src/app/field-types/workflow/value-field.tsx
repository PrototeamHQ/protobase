import { useState } from 'react'
import type { StepInputKind } from '@protobase/schema/internal'
import { Input } from '../../../primitives/input'
import { Select } from '../../../primitives/select'
import { Textarea } from '../../../primitives/textarea'
import { Field } from '../../../record-view/field'
import { namesText, namesValue, textValue, valueText } from './value-text'
import { text } from './messages'

export type ValueFieldProps = {
  label: string
  kind: StepInputKind
  options?: readonly string[]
  required?: boolean
  help?: string
  value: unknown
  /** What the check says is wrong with it. */
  error?: string
  /** Undefined when emptied: the field is left out. */
  onChange: (value: unknown) => void
  disabled?: boolean
  /** How typed text becomes the value, and the value text, when not as `kind` says; such as names separated by commas. */
  read?: (text: string) => unknown
  write?: (value: unknown) => string
}

// Text on one line is the value, and emptied it is none; JSON is parsed when it parses.
const readText = (text: string) => (text === '' ? undefined : text)

const reads = { text: readText, choice: readText, json: textValue, names: namesValue } satisfies Record<StepInputKind, (text: string) => unknown>

/**
 * A value of a state as a labelled field: text on one line, one of `options`, a JSON value or expression on several
 * lines, or names on one line separated by commas. Emptied, it is left out of the definition.
 */
export const ValueField = ({ label, kind, options = [], required, help, value, error, onChange, disabled, read = reads[kind], write = kind === 'names' ? namesText : valueText }: ValueFieldProps) => {
  const [typed, setTyped] = useState<string>()
  // The text stays as it is typed while it writes the value the field holds, rather than written anew on every key
  const shown = typed !== undefined && JSON.stringify(read(typed)) === JSON.stringify(value) ? typed : write(value)
  const type = (next: string) => {
    setTyped(next)
    onChange(read(next))
  }
  return (
    <Field label={label} required={required} help={help} error={error} wide={kind === 'json'}>
      {kind === 'choice' ? (
        <Select invalid={Boolean(error)} value={shown} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}>
          <option value="">{text('defaultChoice')}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      ) : kind === 'json' ? (
        <Textarea
          invalid={Boolean(error)}
          rows={2}
          className="font-mono text-xs"
          value={shown}
          disabled={disabled}
          onChange={(event) => type(event.target.value)}
        />
      ) : (
        <Input invalid={Boolean(error)} value={shown} disabled={disabled} onChange={(event) => type(event.target.value)} />
      )}
    </Field>
  )
}
