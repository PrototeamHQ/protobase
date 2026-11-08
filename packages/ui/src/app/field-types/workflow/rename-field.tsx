import { useState } from 'react'
import { Input } from '../../../primitives/input'
import { Field } from '../../../record-view/field'
import { text } from './messages'

type RenameFieldProps = {
  name: string
  /** Every state name of the workflow: names are unique across Maps too. */
  taken: readonly string[]
  disabled?: boolean
  onRename: (name: string) => void
}

/** A state's name, renamed when the field is left or Enter is pressed, unless it is empty or another state's. */
export const RenameField = ({ name, taken, disabled, onRename }: RenameFieldProps) => {
  const [typed, setTyped] = useState(name)
  const trimmed = typed.trim()
  const error = trimmed === '' ? text('nameNeeded') : trimmed !== name && taken.includes(trimmed) ? text('nameTaken') : undefined
  const commit = () => {
    if (!error && trimmed !== name) onRename(trimmed)
  }
  return (
    <Field label={text('name')} error={error}>
      <Input
        value={typed}
        invalid={Boolean(error)}
        disabled={disabled}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
      />
    </Field>
  )
}
