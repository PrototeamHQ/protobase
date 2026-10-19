import { useState } from 'react'
import { Token } from '../primitives/token'
import { useAdminMeta } from './meta-gate'
import { RelationPicker } from './relation-picker'
import { usePickedLabels } from './use-picked-labels'

type One = {
  multiple?: false
  /** The chosen record's key, as text; `undefined` for none. */
  value: string | undefined
  onChange: (key: string) => void
}

type Several = {
  multiple: true
  /** The chosen records' keys, as text. */
  value: string[]
  onChange: (keys: string[]) => void
}

export type RecordPickerProps = (One | Several) & {
  /** The name of the resource whose records it picks. */
  resource: string
  invalid?: boolean
}

/**
 * Picks records of a resource of the app with the create form's relation picker: type to narrow them by their search
 * fields or title, scroll for more, choose with the mouse or the keyboard. With `multiple`, each choice is added as a
 * token that can be taken off again, and choosing a chosen record takes it off.
 */
export const RecordPicker = (props: RecordPickerProps) => {
  const { resources, views } = useAdminMeta()
  const target = resources[props.resource]
  if (!target) throw new Error(`RecordPicker: the app has no resource named "${props.resource}"`)
  if (target.primaryKey.length !== 1) throw new Error(`RecordPicker: "${props.resource}" has a composite key, which a picker cannot name`)
  const view = views[props.resource]
  const keys = props.multiple ? props.value : props.value === undefined ? [] : [props.value]
  // The names of records chosen here, so a choice shows its name before the names are fetched.
  const [known, setKnown] = useState<Record<string, string>>({})
  const fetched = usePickedLabels(target, view, keys)
  const labelOf = (key: string) => known[key] ?? fetched.get(key) ?? key
  const remember = (key: string, label: string) => setKnown((current) => ({ ...current, [key]: label }))

  if (!props.multiple) {
    const { value, onChange } = props
    return (
      <RelationPicker
        target={target}
        view={view}
        value={value ?? ''}
        label={value === undefined ? undefined : labelOf(value)}
        invalid={props.invalid}
        onChange={(key, label) => {
          remember(key, label)
          onChange(key)
        }}
      />
    )
  }

  const { value, onChange } = props
  return (
    <div className="flex flex-col gap-2">
      <RelationPicker
        target={target}
        view={view}
        value=""
        chosen={value}
        several
        invalid={props.invalid}
        onChange={(key, label) => {
          remember(key, label)
          onChange(value.includes(key) ? value.filter((chosen) => chosen !== key) : [...value, key])
        }}
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((key) => (
            <Token key={key} label={labelOf(key)} onRemove={() => onChange(value.filter((chosen) => chosen !== key))} />
          ))}
        </div>
      )}
    </div>
  )
}
