import type { HistoryChange } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { displayValue } from '../../live/display-value'
import { humanize } from '../../live/naming'

/** A field an update changed: its values as the list shows them, none for a sensitive field, whose values are never kept. */
export type ChangedField = { name: string; label: string; before?: string; after?: string }

export type DescribedChange = { who: string; verb: string; fields: ChangedField[] }

const verbs: Record<HistoryChange['operation'], string> = { create: 'created this', update: 'changed', delete: 'deleted this', undelete: 'restored this' }

/** Who made a change: their name, else their id; a write from outside the app names the database role. */
export const changedBy = (change: HistoryChange) => {
  if (change.actor) return change.actor.name ?? change.actor.id
  return change.databaseRole ? `Database (${change.databaseRole})` : 'Database'
}

/**
 * A change as the record page tells it: who, what they did, and for an update each changed field the model still has,
 * before and after, as the view labels and formats it.
 */
export const describeChange = (change: HistoryChange, model: ResourceModel, view?: ViewModel): DescribedChange => {
  const fields = (change.operation === 'create' ? [] : change.changed).flatMap((name): ChangedField[] => {
    const field = model.fields[name]
    if (!field || name === model.softDelete) return []
    const hints = view?.fields[name]
    const label = hints?.label ?? humanize(name)
    if (field.sensitive || !change.before || !change.after) return [{ name, label }]
    return [{ name, label, before: displayValue(field, change.before[name], hints), after: displayValue(field, change.after[name], hints) }]
  })
  // An update of only fields the record page does not show, such as one gone from the model, is still a change
  const verb = change.operation === 'update' && fields.length === 0 ? 'changed this' : verbs[change.operation]
  return { who: changedBy(change), verb, fields }
}
