import { Select } from '../../../primitives/select'
import { Field } from '../../../record-view/field'

type TargetFieldProps = {
  label: string
  /** The state's name it leads to, or undefined. */
  value: string | undefined
  /** The names of the states of the same machine, the only ones it may lead to. */
  names: readonly string[]
  /** What no state means here, such as "Ends here". */
  none: string
  error?: string
  disabled?: boolean
  onChange: (name: string | undefined) => void
}

/** Where a state leads, chosen among the states of its machine: the same edge the canvas draws from a handle. */
export const TargetField = ({ label, value, names, none, error, disabled, onChange }: TargetFieldProps) => (
  <Field label={label} error={error}>
    <Select invalid={Boolean(error)} value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}>
      <option value="">{none}</option>
      {/* A name the machine no longer has stays chosen, so the check's problem with it shows */}
      {value !== undefined && !names.includes(value) && <option value={value}>{value}</option>}
      {names.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </Select>
  </Field>
)
