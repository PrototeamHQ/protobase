import { checkOrderBy, parseOrderBy, type ResourceModel } from '@protobase/schema'
import { defaultSource } from './list-blocks'
import { filterText, sortText } from './list-query'
import type { LayoutNode } from './node'
import { sampledFilterErrors } from './sampled-filter'
import { resolveScopePath } from './scope-lookup'
import type { Scope } from './walk'

// What the list blocks name that the models do not have: the resource they read, the field it is tied by, the field of
// the record around them their `source` reads, and their filter and sort in either form.

type Models = Record<string, ResourceModel>

export type ListCheckInput = { models: Models; params: ReadonlySet<string> }

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

const sortProblems = (model: ResourceModel, sort: unknown): string[] => {
  const source = sortText(sort as never)
  if (source === undefined) return []
  const parsed = parseOrderBy(source)
  if (!parsed.ok) return parsed.errors.map((error) => `sort: ${error.message}`)
  const checked = checkOrderBy(model, parsed.items)
  return checked.ok ? [] : checked.errors.map((error) => `sort: ${error.message}`)
}

// A filter object reads as the AND of its equalities, so it is checked as that text, `{{path}}` slots included
const filterProblems = (model: ResourceModel, filter: unknown): string[] => {
  const source = filterText(filter as never)
  return source === undefined ? [] : sampledFilterErrors(model, source).map((error) => `filter: ${error}`)
}

/** The field of the record around a block its `source` names, when it is one; a problem otherwise. */
const sourceField = (node: LayoutNode, scope: Scope, { models, params }: ListCheckInput) => {
  const source = text(node.props.source) ?? defaultSource
  const resolved = resolveScopePath(source, { models, scope, params, mode: 'stored' })
  if (!resolved.ok) return { problem: `source: ${resolved.message}` }
  if (resolved.kind === 'item') return { item: true as const }
  if (resolved.kind !== 'field') return { problem: `source: "${source}" is no field of a record around it` }
  return { field: models[resolved.context.resource]!.fields[resolved.names[0]!]!, deep: resolved.names.length > 1 }
}

const targetProblems = (reference: ResourceModel, target: string): string[] => {
  const field = Object.hasOwn(reference.fields, target) ? reference.fields[target] : undefined
  if (!field) return [`target: "${target}" is no field of ${reference.name}`]
  return field.filterable ? [] : [`target: "${target}" of ${reference.name} is not filterable, so the list cannot be read by it`]
}

/** Problems of a `ReferenceManyField`, `ReferenceArrayField`, `ArrayField` or `ReferenceField` against the models. */
export const listModelProblems = (node: LayoutNode, scope: Scope, input: ListCheckInput): string[] => {
  const reference = text(node.props.reference)
  const model = reference === undefined ? undefined : input.models[reference]
  if (reference !== undefined && !model) return [`unknown resource "${reference}"`]
  // A reference block's source that resolves nowhere is reported by the placeholder check, which reads it as the
  // implicit equality; an ArrayField's reads nothing, so it is reported here
  const found = sourceField(node, scope, input)
  const field = 'field' in found && !found.deep ? found.field : undefined
  switch (node.type) {
    case 'ReferenceManyField':
      return [...targetProblems(model!, String(node.props.target)), ...filterProblems(model!, node.props.filter), ...sortProblems(model!, node.props.sort)]
    case 'ReferenceArrayField': {
      const kind = field && field.type !== 'json' ? [`source: "${node.props.source}" is a ${field.type} field; it must be a JSON list of ${reference}'s keys`] : []
      const key = model!.primaryKey.length === 1 ? [] : [`${reference} has a key of several fields, which a list of keys cannot hold`]
      return [...kind, ...key, ...filterProblems(model!, node.props.filter), ...sortProblems(model!, node.props.sort)]
    }
    case 'ReferenceField': {
      const kind = field?.type === 'relation' && field.relation?.resource !== reference ? [`source: "${node.props.source}" points at ${field.relation?.resource}, not ${reference}`] : []
      return [...kind, ...(model!.primaryKey.length === 1 ? [] : [`${reference} has a key of several fields, which one field cannot hold`])]
    }
    case 'ArrayField': {
      if ('problem' in found) return [found.problem!]
      return field && field.type !== 'json' ? [`source: "${node.props.source}" is a ${field.type} field; it must be a JSON list`] : []
    }
    default:
      return []
  }
}
