import type { ResourceModel } from '@protobase/schema'
import { countedResource, parseCondition } from './condition'
import { resolveFieldPath } from './field-path'

type Models = Record<string, ResourceModel>

// The resource a path counts, when `resource` is the record around the condition and the path is no field of it.
const countedBy = (models: Models, resource: string | undefined, path: string) => countedResource(path, (first) => Object.hasOwn((resource === undefined ? undefined : models[resource])?.fields ?? {}, first))

/**
 * What a `when` condition names that the models do not have: a syntax error, a resource it counts that is not one, a
 * field path of `resource`, the record around it, that does not resolve. Without a record, it can only count records.
 */
export const conditionProblems = (when: string, resource: string | undefined, models: Models): string[] => {
  const parsed = parseCondition(when)
  if (!parsed.ok) return [`"when" is not a valid condition: ${parsed.message}`]
  return parsed.paths.flatMap((name) => {
    const counted = countedBy(models, resource, name)
    if (counted !== undefined) return models[counted] ? [] : [`"when" counts "${counted}", which is not a resource`]
    if (resource === undefined) return [`"when" names "${name}", but outside a record it can only count records, as "<resource>.count"`]
    const resolved = resolveFieldPath(models, resource, name)
    return resolved.ok ? [] : [resolved.message]
  })
}

/** Whether a caller whose `models` are all they may see can evaluate the condition: it parses and every name it uses is theirs. */
export const conditionReadable = (when: string, resource: string | undefined, models: Models): boolean => {
  const parsed = parseCondition(when)
  if (!parsed.ok) return false
  return parsed.paths.every((name) => {
    const counted = countedBy(models, resource, name)
    if (counted !== undefined) return Boolean(models[counted])
    return resource !== undefined && resolveFieldPath(models, resource, name).ok
  })
}
