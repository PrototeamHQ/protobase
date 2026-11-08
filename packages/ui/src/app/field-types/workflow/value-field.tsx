import { useState } from 'react'
import { Input } from '../../../primitives/input'
import { Select } from '../../../primitives/select'
import { Textarea } from '../../../primitives/textarea'
import { Field } from '../../../record-view/field'
import type { InputKind } from './type-inputs'
import { namesText, namesValue, textValue, valueText } from './value-text'
import { useValueInsert } from './value-insert-context'
import { text } from './messages'

export type ValueFieldProps = {
  label: string
  kind: InputKind
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

const reads = { text: readText, value: textValue, choice: readText, json: textValue, names: namesValue } satisfies Record<InputKind, (text: string) => unknown>

/**
 * A value of a state as a labelled field: text on one line, a value such as a number on one line, one of `options`, a
 * JSON value or expression on several lines, or names on one line separated by commas. Emptied, it is left out of the
 * definition.
 */
export const ValueField = ({ label, kind, options = [], required, help, value, error, onChange, disabled, read = reads[kind], write = kind === 'names' ? namesText : valueText }: ValueFieldProps) => {
  const [typed, setTyped] = useState<string>()
  // The text stays as it is typed while it writes the value the field holds, rather than written anew on every key
  const shown = typed !== undefined && JSON.stringify(read(typed)) === JSON.stringify(value) ? typed : write(value)
  const insert = useValueInsert()
  const type = (next: string) => {
    setTyped(next)
    onChange(read(next))
  }
  // A value is inserted into text, so a field holding an object, a number or a boolean is not offered it
  const holdsText = value === undefined || value === null || typeof value === 'string'
  const offersInsert = insert !== undefined && !disabled && holdsText && (kind === 'text' || kind === 'json' || kind === 'value')
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
      {offersInsert && (
        <button type="button" aria-label={text('insertValueInto', { field: label })} className="mt-1 text-xs font-medium text-primary-text hover:underline max-md:min-h-11" onClick={() => insert({ label, value, set: onChange })}>
          {text('insertValue')}
        </button>
      )}
    </Field>
  )
}
