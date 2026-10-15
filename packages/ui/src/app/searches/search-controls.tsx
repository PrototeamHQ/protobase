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
  /** The search's key, in the text form the record API takes, and its title, its name or its filters as words. */
  recordKey: string
  title: string
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

// What a control was set to, for the toast that says it is saved: "Email: Daily digest"
const changed = (model: ResourceModel, view: ViewModel, patch: Record<string, unknown>) =>
  Object.entries(patch)
    .map(([name, value]) => {
      const label = view.fields[name]?.label ?? humanize(name)
      const shown = model.fields[name]?.type === 'boolean' ? (value === true ? 'On' : 'Off') : enumLabel(String(value), view.fields[name]?.valueLabels)
      return `${label}: ${shown}`
    })
    .join(', ')

/**
 * A saved search's controls, each saved as soon as it changes, which a toast confirms; a refused change says why and shows
 * the search as stored.
 */
export const SearchControls = ({ model, view, recordKey, title, row, fields }: SearchControlsProps) => {
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const change = useMutation({
    mutationFn: (patch: Record<string, unknown>) => client.update(model.name, recordKey, patch, row.etag ?? '*'),
    onSuccess: (_, patch) => toast.show({ state: 'success', title: `${title} saved`, description: changed(model, view, patch) }),
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
