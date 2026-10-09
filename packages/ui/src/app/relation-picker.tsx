import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { createWhere, printFilter, type ResourceModel, type ViewModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { Input } from '../primitives/input'
import { labelFieldOf } from '../live/model-helpers'

const where = createWhere()

export type RelationPickerProps = {
  target: ResourceModel
  view: ViewModel | undefined
  /** The chosen key, as text; empty for none. */
  value: string
  /** What to show for `value` while the box is closed. */
  label?: string
  invalid?: boolean
  onChange: (value: string, label: string) => void
}

/** Picks a record of another resource: type to search (when the target has search fields), choose from the first matches. */
export const RelationPicker = ({ target, view, value, label, invalid, onChange }: RelationPickerProps) => {
  const client = useClient()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const keyField = target.primaryKey[0]!
  const labelField = labelFieldOf(target, view)
  const options = useQuery({
    queryKey: ['relation-options', target.name, text],
    enabled: open,
    queryFn: () =>
      client.list(target.name, {
        filter: text && target.search?.length ? printFilter(where.search(text)) : undefined,
        fields: [keyField, labelField],
        pageSize: 8,
      }),
  })
  return (
    <div className="relative">
      <Input
        invalid={invalid}
        placeholder={`Search ${target.name}`}
        value={open ? text : (label ?? value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(event) => setText(event.target.value)}
      />
      {open && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-background py-1 text-[13px] shadow-pop">
          {options.data?.items.map((item) => (
            <li key={String(item[keyField])}>
              <button
                type="button"
                role="option"
                aria-selected={String(item[keyField]) === value}
                className="block w-full truncate px-3 py-1.5 text-left hover:bg-muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(String(item[keyField]), String(item[labelField]))
                  setText('')
                  setOpen(false)
                }}
              >
                {String(item[labelField])}
              </button>
            </li>
          ))}
          {options.data && options.data.items.length === 0 && <li className="px-3 py-1.5 text-muted-foreground">No matches</li>}
          {options.isPending && <li className="px-3 py-1.5 text-muted-foreground">Loading</li>}
        </ul>
      )}
    </div>
  )
}
