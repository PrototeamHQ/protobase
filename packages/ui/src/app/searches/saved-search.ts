import { createWhere, enumLabel, parseFilter, printFilter, type ResourceModel, type ViewModel } from '@protobase/schema'
import { activeChips, type FilterChip, type FilterConfig } from '../../filter-panel'
import { textToState } from '../../live/filter-string'
import { humanize } from '../../live/naming'
import { rangeFormat, widgetFields } from '../../live/view-fields'
import { text as message } from './messages'

const where = createWhere()
const span = { start: 0, end: 0 }

/** Names of relation values, by field and then by value, such as `{ place_id: { '1': 'Amsterdam' } }`. */
export type ValueNames = Record<string, Record<string, string>>

/** The relation fields a filter chooses values of through its facets, each with the values it chooses. */
export const chosenRelations = (model: ResourceModel, view: ViewModel | undefined, text: string): Record<string, string[]> => {
  const parsed = textToState(widgetFields(view, model), text)
  if (!parsed.ok) return {}
  return Object.fromEntries(Object.entries(parsed.state.facets).filter(([field, values]) => model.fields[field]?.type === 'relation' && values.length > 0))
}

/**
 * The panel's widgets named as the list page names them, without counts: what reading a saved filter back into chips
 * needs. Enum values take the view's value labels, relation values the names in `names`.
 */
const namedConfig = (model: ResourceModel, view: ViewModel | undefined, names: ValueNames): FilterConfig => {
  const label = (name: string) => view?.fields[name]?.label ?? humanize(name)
  const skeleton = widgetFields(view, model)
  return {
    ...skeleton,
    facets: skeleton.facets.map((group) => {
      if (group.flags) return { ...group, options: group.options.map((option) => ({ ...option, label: label(option.value) })) }
      const values = model.fields[group.id]?.enumValues ?? []
      const labels = model.fields[group.id]?.type === 'enum' ? Object.fromEntries(values.map((value) => [value, enumLabel(value, view?.fields[group.id]?.valueLabels)])) : (names[group.id] ?? {})
      return { ...group, label: label(group.id), labels }
    }),
    ranges: (skeleton.ranges ?? []).map((range) => ({ ...range, label: label(range.id), format: rangeFormat(view, range.id) })),
    toggles: skeleton.toggles?.map((toggle) => ({ ...toggle, label: label(toggle.id) })),
  }
}

/**
 * A saved filter as the chips the list page shows for it, then a chip per condition no widget holds: the search text
 * in quotes, or the condition as written. One chip saying so when the filter cannot be read.
 */
export const filterChips = (model: ResourceModel, view: ViewModel | undefined, text: string, names: ValueNames = {}): FilterChip[] => {
  const config = namedConfig(model, view, names)
  const parsed = textToState(config, text)
  if (!parsed.ok) return [{ key: 'unreadable', label: message('unreadableFilter') }]
  const extras = parsed.extras.map((clause, index) => ({ key: `extra:${index}`, label: clause.kind === 'search' ? `"${clause.text}"` : printFilter(clause) }))
  return [...activeChips(config, parsed.state), ...extras]
}

/** The names the list page's panel knows for its facets' values, to name a search saved from it. */
export const facetNames = (config: FilterConfig): ValueNames =>
  Object.fromEntries(config.facets.filter((group) => !group.flags).map((group) => [group.id, { ...group.labels, ...Object.fromEntries(group.options.map((option) => [option.value, option.label])) }]))

/**
 * The search's filter narrowed to the records new since the user last opened its results: those whose `field` is after
 * `seenAt`. Without a `seenAt` every record is new.
 */
export const unseenFilter = (text: string, field: string, seenAt: unknown) => {
  if (typeof seenAt !== 'string' || seenAt === '') return text
  const after = where.gt(field, { kind: 'timestamp', value: new Date(seenAt).toISOString(), span })
  const parsed = parseFilter(text)
  if (!parsed.ok) throw new Error(`The saved filter cannot be read: ${parsed.errors.map((error) => error.message).join('; ')}`)
  return printFilter(parsed.ast ? where.and(parsed.ast, after) : after)
}

/** Whether a record whose `field` holds `value` is new to the user, as `unseenFilter` finds it: after `seenAt`, or any. */
export const isUnseen = (value: unknown, seenAt: unknown) => {
  if (typeof seenAt !== 'string' || seenAt === '') return true
  if (typeof value !== 'string' || value === '') return false
  return new Date(value).getTime() > new Date(seenAt).getTime()
}
