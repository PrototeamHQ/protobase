import type { ResourceModel } from '@protobase/schema'
import { countedResource, parseCondition } from './condition'
import { resolveFieldPath } from './field-path'
import { sampleSlots } from './filter-slots'
import { resolveScopePath } from './scope-lookup'
import type { Scope } from './walk'

type Models = Record<string, ResourceModel>

export type ConditionInput = { models: Models; scope: Scope; params: ReadonlySet<string> }

// Whether `name` is a field of any record around the condition, which a bare name in it may read.
const isScopeField = ({ models, scope }: ConditionInput) => (name: string) =>
  [scope.root, ...scope.stack.map((frame) => frame.resource)].some((resource) => resource !== undefined && Object.hasOwn(models[resource]?.fields ?? {}, name))

// The resource a path counts, when `resource` is the record around the condition and the path is no field of it.
const countedBy = (models: Models, resource: string | undefined, path: string) => countedResource(path, (first) => Object.hasOwn((resource === undefined ? undefined : models[resource])?.fields ?? {}, first))

/**
 * What a view's `when` condition names that the models do not have: a syntax error, a resource it counts that is not
 * one, a field path of `resource`, the record around it, that does not resolve. Without a record, it can only count records.
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
export const conditionReadable = (when: string, resource: string | undefined, models: Models): boolean => conditionProblems(when, resource, models).length === 0

/**
 * What a layout's `when` condition names that the records around it do not have: a syntax error, a resource it counts that is
 * not one, or a name the Mustache lookup finds in no record around it. Its `{{path}}` slots resolve like any
 * placeholder. Returns the problems, and the warnings of names a nearer record shadows.
 */
export const conditionFindings = (when: string, input: ConditionInput): { problems: string[]; warnings: string[] } => {
  const { text, slots } = sampleSlots(when)
  const parsed = parseCondition(text)
  if (!parsed.ok) return { problems: [`"when" is not a valid condition: ${parsed.message}`], warnings: [] }
  const problems: string[] = []
  const warnings: string[] = []
  const lookup = (path: string, mode: 'stored' | 'relations') => {
    const resolved = resolveScopePath(path, { models: input.models, scope: input.scope, params: input.params, mode })
    if (!resolved.ok) problems.push(`"when": ${resolved.message}`)
    else if (resolved.kind === 'field' && resolved.shadows) warnings.push(`"when": ${resolved.shadows}`)
  }
  for (const slot of slots) lookup(slot.path, 'stored')
  for (const name of parsed.paths) {
    const counted = countedResource(name, isScopeField(input))
    if (counted !== undefined) {
      if (!input.models[counted]) problems.push(`"when" counts "${counted}", which is not a resource`)
      continue
    }
    if (input.scope.stack.length === 0 && input.scope.root === undefined) problems.push(`"when" names "${name}", but outside a record it can only count records, as "<resource>.count"`)
    else lookup(name, 'relations')
  }
  return { problems, warnings }
}

/** Whether a caller whose `models` are all they may see can evaluate a layout's condition where it sits. */
export const scopedConditionReadable = (when: string, input: ConditionInput): boolean => conditionFindings(when, input).problems.length === 0
