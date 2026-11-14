import type { Definition } from '@protobase/workflows'
import { machineAt, splitPath, type StatePath } from '../definition'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The definition with the Task at `path` holding `value` at `keys` of its Arguments, such as `['data', 'name']`: an
 * object on the way that is missing, or not an object, is made one; undefined removes the value. The definition it is
 * given stays as it was.
 */
export const setArgument = (definition: Definition, path: StatePath, keys: readonly string[], value: unknown): Definition => {
  const copy = structuredClone(definition)
  const { scope, name } = splitPath(path)
  const state = machineAt(copy, scope)?.States[name] as { Type: string; Arguments?: unknown } | undefined
  if (!state || state.Type !== 'Task') return definition
  if (!isObject(state.Arguments)) state.Arguments = {}
  let holder = state.Arguments as Record<string, unknown>
  for (const key of keys.slice(0, -1)) {
    if (!isObject(holder[key])) holder[key] = {}
    holder = holder[key] as Record<string, unknown>
  }
  const last = keys.at(-1)!
  if (value === undefined) delete holder[last]
  else holder[last] = value
  return copy
}
