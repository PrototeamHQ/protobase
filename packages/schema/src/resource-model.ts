import type { AnyField } from './field'
import type { FieldModel, ResourceModel, SearchMatch } from './model'
import { snakeCase } from './naming'
import type { FieldsInput } from './refs'

export type ResourceState = {
  name: string
  table?: string
  fields?: FieldsInput
  primaryKey?: string[]
  softDelete?: string
  tenant?: string
  search?: string[]
  searchMatch?: Record<string, SearchMatch>
  owner?: string
}

const parseTable = (table: string) => {
  const parts = table.split('.')
  if (parts.length === 1) return { name: parts[0]! }
  if (parts.length === 2) return { schema: parts[0]!, name: parts[1]! }
  throw new Error(`Invalid table "${table}", expected "table" or "schema.table"`)
}

const fieldModel = (name: string, field: AnyField): FieldModel => {
  const { meta } = field
  const column = meta.column ?? snakeCase(name)
  return {
    name,
    column,
    type: meta.type,
    nullable: meta.nullable,
    readOnly: meta.readOnly,
    filterable: meta.filterable,
    sortable: meta.sortable,
    aliases: [...meta.aliases],
    ...(meta.hasDefault && { default: { value: meta.defaultValue } }),
    ...(meta.dbDefault && !meta.hasDefault && { default: { db: true as const } }),
    ...(meta.sensitive && { sensitive: true as const }),
    ...(meta.enumValues && { enumValues: [...meta.enumValues] }),
    ...(meta.relation && {
      relation: { resource: meta.relation.resource, columns: meta.relation.columns ?? [column] },
    }),
    ...(meta.file && {
      file: {
        accept: [...meta.file.accept],
        maxSize: meta.file.maxSize,
        provider: meta.file.provider,
        ...(meta.file.derive && Object.keys(meta.file.derive).length > 0 && { derive: Object.keys(meta.file.derive) }),
      },
    }),
  }
}

const assembleModel = (state: ResourceState): ResourceModel => {
  const { name, table, fields, primaryKey } = state
  if (!table) throw new Error(`Resource "${name}" has no table`)
  if (!fields) throw new Error(`Resource "${name}" has no fields`)
  if (!primaryKey) throw new Error(`Resource "${name}" has no primary key`)
  return {
    name,
    table: parseTable(table),
    fields: Object.fromEntries(
      Object.entries(fields)
        .filter((entry): entry is [string, AnyField] => entry[1] !== null)
        .map(([key, field]) => [key, fieldModel(key, field)]),
    ),
    primaryKey: [...primaryKey],
    ...(state.softDelete && { softDelete: state.softDelete }),
    ...(state.tenant && { tenant: state.tenant }),
    ...(state.search && { search: [...state.search] }),
    ...(state.searchMatch && Object.keys(state.searchMatch).length > 0 && { searchMatch: { ...state.searchMatch } }),
    ...(state.owner && { owner: state.owner }),
  }
}

// A sensitive value must not be findable through the list API either: no filter, sort, search or key may use it.
const sensitiveProblems = (model: ResourceModel) =>
  Object.values(model.fields)
    .filter((field) => field.sensitive)
    .flatMap((field) => [
      ...(field.filterable ? ['filterable'] : []),
      ...(field.sortable ? ['sortable'] : []),
      ...(field.aliases.length > 0 ? ['aliased'] : []),
      ...(model.search?.includes(field.name) ? ['searched'] : []),
      ...([...model.primaryKey, model.tenant, model.owner, model.softDelete].includes(field.name) ? ['a key, tenant, owner or soft delete field'] : []),
    ].map((problem) => `sensitive field "${field.name}" cannot be ${problem}`))

// A file value is opaque text the server writes: never a key, a filter, a sort or a search, and its derived fields are
// read-only fields of the same resource that are no files themselves.
const fileProblems = (model: ResourceModel) =>
  Object.values(model.fields)
    .filter((field) => field.file)
    .flatMap((field) => [
      ...(field.filterable ? ['cannot be filterable'] : []),
      ...(field.sortable ? ['cannot be sortable'] : []),
      ...(field.aliases.length > 0 ? ['cannot be aliased'] : []),
      ...(field.sensitive ? ['cannot be sensitive (not implemented)'] : []),
      ...(model.search?.includes(field.name) ? ['cannot be searched'] : []),
      ...([...model.primaryKey, model.tenant, model.owner, model.softDelete].includes(field.name) ? ['cannot be a key, tenant, owner or soft delete field'] : []),
      ...(field.file!.derive ?? []).flatMap((target) => {
        const derived = Object.hasOwn(model.fields, target) ? model.fields[target]! : undefined
        if (!derived) return [`derives "${target}", which is not a field`]
        if (target === field.name || derived.file) return [`derives "${target}", which is a file field`]
        return derived.readOnly ? [] : [`derives "${target}", which must be readOnly()`]
      }),
    ].map((problem) => `file field "${field.name}" ${problem}`))

export const buildResourceModel = (state: ResourceState): ResourceModel => {
  const model = assembleModel(state)
  const problems = [...sensitiveProblems(model), ...fileProblems(model)]
  if (problems.length > 0) throw new Error(`Resource "${model.name}": ${problems.join('; ')}`)
  return model
}

export const ignoredColumns = (fields: FieldsInput = {}) =>
  Object.entries(fields)
    .filter(([, field]) => field === null)
    .map(([key]) => snakeCase(key))
