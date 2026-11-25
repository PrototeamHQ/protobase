import { droppedTables } from '../steps'
import type { ModelTable, StoreModel } from './store-model'

// What a migration of Protobase's steps cannot write: a name or a type the store has already, changed in the config.
// A module or table a newer Protobase adds, or a column or index a later step adds, is new rather than changed; a
// table a step drops (`Step.drops`) is gone by that step.

type Value = string | number | boolean | null | { [key: string]: Value }

const changes = (before: Value, after: Value | undefined, at: string, source: string): string[] => {
  if (after === undefined) return [`${at} is gone`]
  if (typeof before !== 'object' || before === null || typeof after !== 'object' || after === null) {
    return before === after ? [] : [`${at} is ${JSON.stringify(before)} in ${source} and ${JSON.stringify(after)} now`]
  }
  return Object.entries(before).flatMap(([key, value]) => changes(value, after[key], at === '' ? key : `${at}.${key}`, source))
}

/**
 * How `after` changes what `before`, from `source`, has, one line each, the last steps, the tables' scopes and the
 * tables a step drops aside: a scope is Protobase's to declare, not a name the store has; none when it only adds.
 */
export const nameChanges = (before: StoreModel, after: StoreModel, source = 'the snapshot') => {
  const kept = (tables: Record<string, ModelTable>) => Object.entries(tables).filter(([internal]) => !droppedTables.includes(internal))
  const withoutSteps = (model: StoreModel) => ({
    ...model,
    modules: Object.fromEntries(Object.entries(model.modules).map(([module, entry]) => [module, Object.fromEntries(kept(entry!.tables).map(([internal, { scope: _, ...table }]) => [internal, table]))])),
  })
  return changes(withoutSteps(before) as Value, withoutSteps(after) as Value, '', source)
}
