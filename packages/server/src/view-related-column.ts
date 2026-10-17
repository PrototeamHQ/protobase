import type { RelatedColumnModel, ResourceModel } from '@protobase/schema'
import { relatedErrors } from './view-related'

// The dots take their colours from an enum's values, which come with each record, so a sensitive one would show none.
const statusErrors = (target: ResourceModel, name: string) => {
  const field = Object.hasOwn(target.fields, name) ? target.fields[name]! : undefined
  if (!field) return [`status: unknown field "${name}" on ${target.name}`]
  if (field.type !== 'enum') return [`status: "${name}" on ${target.name} is not an enum field`]
  return field.sensitive ? [`status: "${name}" on ${target.name} is sensitive, so it cannot be shown`] : []
}

/**
 * What is wrong with a related records column of the list of `resource`, against these models; empty when it can be
 * shown. It finds its records as a related section does. Against the full models it checks the config; against a
 * caller's models, whether that caller can use it.
 */
export const relatedColumnErrors = (column: RelatedColumnModel, resource: string, models: Record<string, ResourceModel>): string[] => {
  const { name: _, label: __, status, ...match } = column
  const errors = relatedErrors({ kind: 'related', title: column.name, ...match }, resource, models)
  const target = models[column.resource]
  return target ? [...errors, ...statusErrors(target, status)] : errors
}
