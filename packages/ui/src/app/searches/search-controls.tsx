import { useMutation } from '@tanstack/react-query'
import { useId } from 'react'
import { enumLabel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { humanize } from '../../live/naming'
import { Switch } from '../../primitives/switch'
import { useToast } from '../../toasts'
import { useRefreshResource } from '../pages/use-layout-data'
import type { SavedSearchRow } from './use-saved-searches'

const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong')

type SearchControlsProps = {
  model: ResourceModel
  view: ViewModel
  /** The search's key, in the text form the record API takes. */
  recordKey: string
  row: SavedSearchRow
  /** The fields changed in place: enums as a menu of their values, booleans as a switch. */
  fields: string[]
}

const Control = ({ model, view, name, value, onChange }: { model: ResourceModel; view: ViewModel; name: string; value: unknown; onChange: (value: unknown) => void }) => {
  const id = useId()
  const field = model.fields[name]
  const hints = view.fields[name]
  const label = hints?.label ?? humanize(name)
  if (field?.type === 'boolean') return <Switch checked={value === true} onChange={onChange} label={label} />
  if (field?.type !== 'enum') throw new Error(`Not implemented: "${name}" is ${field?.type ?? 'unknown'}, and a saved search's controls are enums or booleans`)
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-[13px] text-muted-foreground">
      {label}
      <select
        id={id}
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-md border border-border-strong bg-background px-2 text-[13px] text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        {(field.enumValues ?? []).map((option) => (
          <option key={option} value={option}>
            {enumLabel(option, hints?.valueLabels)}
          </option>
        ))}
      </select>
    </label>
  )
}

/** A saved search's controls, each saved as soon as it changes; a refused change says why and shows the search as stored. */
export const SearchControls = ({ model, view, recordKey, row, fields }: SearchControlsProps) => {
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const change = useMutation({
    mutationFn: (patch: Record<string, unknown>) => client.update(model.name, recordKey, patch, row.etag ?? '*'),
    onError: (error) => toast.show({ state: 'error', title: 'Could not change the search', description: message(error) }),
    onSettled: () => refresh(model.name),
  })
  return (
    <div className="flex flex-wrap items-center gap-3">
      {fields.map((name) => (
        <Control key={name} model={model} view={view} name={name} value={change.isPending && name in (change.variables ?? {}) ? change.variables![name] : row[name]} onChange={(value) => change.mutate({ [name]: value })} />
      ))}
    </div>
  )
}
