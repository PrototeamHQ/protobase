import { checkFilter, checkOrderBy, parseFilter, parseOrderBy } from './filter'
import type { NavRecentModel, ResourceModel, StatusTone } from './model'

export const statusTones = ['neutral', 'info', 'success', 'warning', 'danger'] as const satisfies readonly StatusTone[]

/** How many records a sidebar group shows when `limit` is not set. */
export const defaultRecentLimit = 3

const maxLimit = 20

const filterErrors = (model: ResourceModel, source: string) => {
  const parsed = parseFilter(source)
  if (!parsed.ok) return parsed.errors
  if (!parsed.ast) return []
  const checked = checkFilter(model, parsed.ast)
  return checked.ok ? [] : checked.errors
}

const orderByErrors = (model: ResourceModel, source: string) => {
  const parsed = parseOrderBy(source)
  if (!parsed.ok) return parsed.errors
  const checked = checkOrderBy(model, parsed.items)
  return checked.ok ? [] : checked.errors
}

/** What is wrong with a sidebar group's config for this model; empty when the group can be shown. */
export const navRecentErrors = (recent: NavRecentModel, model: ResourceModel): string[] => [
  ...(Object.hasOwn(model.fields, recent.status) ? [] : [`status field "${recent.status}" does not exist`]),
  ...Object.entries(recent.tones)
    .filter(([, tone]) => !(statusTones as readonly string[]).includes(tone))
    .map(([value, tone]) => `tone "${tone}" for "${value}" is not one of ${statusTones.join(', ')}`),
  ...(recent.limit === undefined || (Number.isInteger(recent.limit) && recent.limit >= 1 && recent.limit <= maxLimit) ? [] : [`limit must be a whole number from 1 to ${maxLimit}`]),
  ...(recent.filter === undefined ? [] : filterErrors(model, recent.filter).map((error) => `filter: ${error.message}`)),
  ...(recent.orderBy === undefined ? [] : orderByErrors(model, recent.orderBy).map((error) => `orderBy: ${error.message}`)),
]
