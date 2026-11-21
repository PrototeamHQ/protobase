import type { NavStartModel, ResourceModel } from './model'
import { filterErrors, orderByErrors } from './nav-recent'

/** What is wrong with a sidebar entry's start record for this model; empty when the app can look it up. */
export const navStartErrors = (start: NavStartModel, model: ResourceModel): string[] => [
  ...(typeof start.filter === 'string' && start.filter.trim() !== '' ? filterErrors(model, start.filter).map((error) => `filter: ${error.message}`) : ['needs a filter that finds the record']),
  ...(start.orderBy === undefined ? [] : orderByErrors(model, start.orderBy).map((error) => `orderBy: ${error.message}`)),
]
