import { templatePlaceholders } from '@protobase/schema/internal'
import { isScopeField } from './check-condition'
import { countedResource, parseCondition } from './condition'
import { inlineFieldTypes } from './inline-fields'
import { dataProps, type LayoutNode, type LayoutValue } from './node'
import { reads, type PlanContext, type Rows } from './plan-draft'
import { sampleSlots } from './filter-slots'
import { resolveScopePath, type PathMode } from './scope-lookup'
import type { Scope } from './walk'

// The fields a read needs are the ones drawn in its scope: each path an element reads of a record around it adds its
// first name to the read that holds that record. A name that follows a relation (`company_id.city`) reads the key,
// and the record it points at is read by the client as a record page reads it.

const strings = (value: LayoutValue | undefined): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings)
  return []
}

// A table's row button reads the table's own rows, not the records around it
const ownRowProps = (node: LayoutNode) => (node.type === 'Table' && typeof node.props.resource === 'string' ? ['button'] : [])

/** The `<resource>.count`s a condition names, and the paths it reads of the records around it. */
export const conditionPaths = (when: string, isField: (name: string) => boolean) => {
  const { text, slots } = sampleSlots(when)
  const parsed = parseCondition(text)
  if (!parsed.ok) return { counts: [], paths: slots.map((slot) => slot.path), stored: slots.map((slot) => slot.path) }
  const counts = parsed.paths.flatMap((path) => countedResource(path, isField) ?? [])
  return { counts, paths: parsed.paths.filter((path) => countedResource(path, isField) === undefined), stored: slots.map((slot) => slot.path) }
}

const conditionProps = ['when', 'working']

/** Adds every field `node` reads of the records around it to the reads that hold them. */
export const readScopeFields = (node: LayoutNode, scope: Scope, rows: Rows, context: PlanContext) => {
  const add = (path: string, mode: PathMode) => {
    const resolved = resolveScopePath(path, { models: context.models, scope, params: context.params, mode })
    if (resolved.ok && resolved.kind === 'field' && resolved.context.at !== 'root') reads(rows[resolved.context.at], resolved.names[0]!)
  }
  if (node.custom) return
  const skipped = new Set([...ownRowProps(node), ...conditionProps])
  for (const [name, value] of Object.entries(dataProps(node))) {
    if (skipped.has(name)) continue
    for (const text of strings(value)) for (const path of templatePlaceholders(text)) add(path, 'stored')
  }
  const field = isScopeField({ models: context.models, scope, params: context.params })
  for (const name of conditionProps) {
    const when = node.props[name]
    if (typeof when !== 'string') continue
    const { paths, stored } = conditionPaths(when, field)
    for (const path of paths) add(path, 'relations')
    for (const path of stored) add(path, 'stored')
  }
  if (inlineFieldTypes.has(node.type) || node.type === 'Field' || node.type === 'ArrayField') add(String(node.props.source), 'relations')
  if (node.type === 'Stat' && node.props.resource === undefined && typeof node.props.field === 'string') add(node.props.field, 'relations')
  if (node.type === 'Progress') for (const value of [node.props.value, node.props.max]) if (typeof value === 'string') add(value, 'relations')
}

/** Whether `node` changes the record nearest around it, so that record's read asks for its ETag. */
export const changesRecord = (node: LayoutNode) => !node.custom && (node.type === 'Action' || (node.type === 'ModalForm' && node.props.mode === 'edit' && node.props.recordKey === undefined))
