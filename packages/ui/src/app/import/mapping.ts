import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { humanize } from '../../live/naming'

/** What an import does with each row: create a record, update the one it matches, or update it when there is one and create it when not. */
export type ImportMode = 'create' | 'update' | 'upsert'

/** A column of the file and the field it fills; `matchBy` names the field of the related record a relation is found by. */
export type ColumnMapping = { column: number; field: string; matchBy?: string }

/** How a field reads in the import: its view's label, as everywhere else in the app. */
export const fieldLabel = (view: ViewModel | undefined, name: string) => view?.fields[name]?.label ?? humanize(name)

// Types whose values a cell can hold: not structured data or files
const importableTypes = new Set<FieldModel['type']>(['text', 'integer', 'bigint', 'decimal', 'boolean', 'date', 'timestamp', 'uuid', 'enum', 'relation', 'currency', 'country'])

// A relation an import can fill: one whose target is a resource the app knows, with a key of one field
const relationTarget = (field: FieldModel, resources: Record<string, ResourceModel>) => {
  const target = field.relation ? resources[field.relation.resource] : undefined
  return target?.primaryKey.length === 1 ? target : undefined
}

/** The fields an import may write: not read-only, not the tenant, and of a type a cell can hold. */
export const importableFields = (model: ResourceModel, resources: Record<string, ResourceModel>) =>
  Object.values(model.fields).filter((field) => {
    if (field.readOnly || field.name === model.tenant || !importableTypes.has(field.type)) return false
    return field.type !== 'relation' || relationTarget(field, resources) !== undefined
  })

// Types a record can be found by, with an equality filter on the value
const matchableTypes = new Set<FieldModel['type']>(['text', 'integer', 'bigint', 'uuid', 'date', 'currency', 'country', 'enum'])

/**
 * The fields records of `model` can be found by: its key when it is one field, then the filterable fields whose values
 * single records out, such as an email or an order number. The user says which is unique; a value that matches several
 * records is an error on its row.
 */
export const matchFields = (model: ResourceModel) => {
  const key = model.primaryKey.length === 1 ? [model.fields[model.primaryKey[0]!]!] : []
  const others = Object.values(model.fields).filter((field) => field.filterable && !field.sensitive && matchableTypes.has(field.type) && !model.primaryKey.includes(field.name))
  return [...key, ...others]
}

/** The resource a relation field points at, when an import can fill it. */
export const relationModel = (field: FieldModel, resources: Record<string, ResourceModel>) => relationTarget(field, resources)

/** Whether a new record needs the field: it can be neither empty nor filled in by a default. */
export const requiredOnCreate = (field: FieldModel) => !field.nullable && !field.default

// Lower case without spaces, underscores or dashes: "Customer email", "customer_email" and "CustomerEmail" are one
const normalized = (text: string) => text.toLowerCase().replace(/[\s_-]+/g, '')

/**
 * Each column whose header is a field's label or name, ignoring case and spacing, mapped to that field; a field takes
 * the first column that matches it, and a column that matches none is skipped.
 */
export const autoMapping = (headers: string[], fields: FieldModel[], view: ViewModel | undefined): ColumnMapping[] => {
  const taken = new Set<string>()
  return headers.flatMap((header, column) => {
    const text = normalized(header)
    if (text === '') return []
    const field = fields.find((candidate) => !taken.has(candidate.name) && (normalized(fieldLabel(view, candidate.name)) === text || normalized(candidate.name) === text))
    if (!field) return []
    taken.add(field.name)
    return [{ column, field: field.name }]
  })
}

/** The fields a new record needs that no column fills, which a create, or a create-or-update, must have. */
export const unmappedRequired = (mode: ImportMode, fields: FieldModel[], mapping: ColumnMapping[]) => {
  if (mode === 'update') return []
  const mapped = new Set(mapping.map((entry) => entry.field))
  return fields.filter((field) => requiredOnCreate(field) && !mapped.has(field.name))
}
