import { buildEventModels } from './events/event-models'
import type { EventSpec } from './events/event-helpers'
import type { AnyField } from './field'
import type { FileOptions } from './files/file-options'
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
  position?: { field: string; within?: string }
  events?: EventSpec[]
  history?: boolean
  comments?: boolean
}

const parseTable = (table: string) => {
  const parts = table.split('.')
  if (parts.length === 1) return { name: parts[0]! }
  if (parts.length === 2) return { schema: parts[0]!, name: parts[1]! }
  throw new Error(`Invalid table "${table}", expected "table" or "schema.table"`)
}

// The fields an upload writes besides the file: those of `.derive()`, then the placeholder's.
const writtenFields = (file: FileOptions) => [...Object.keys(file.derive ?? {}), ...(file.placeholder === undefined ? [] : [file.placeholder])]

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
        ...(writtenFields(meta.file).length > 0 && { derive: writtenFields(meta.file) }),
        ...(meta.file.placeholder !== undefined && { placeholder: meta.file.placeholder }),
        ...(meta.file.variants && Object.keys(meta.file.variants).length > 0 && { variants: structuredClone(meta.file.variants) }),
        ...(meta.file.original && { original: { ...meta.file.original } }),
        ...(meta.file.external && { external: true as const }),
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
    ...(state.history && { history: true as const }),
    ...(state.comments && { comments: true as const }),
    ...(state.position && { position: { ...state.position } }),
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
      ...placeholderProblems(model, field),
    ].map((problem) => `file field "${field.name}" ${problem}`))

// The placeholder's field is derived like any other (see above), holds text, and is not also a `.derive()` target.
const placeholderProblems = (model: ResourceModel, field: FieldModel) => {
  const target = field.file!.placeholder
  if (target === undefined) return []
  const derive = field.file!.derive ?? []
  if (derive.indexOf(target) !== derive.lastIndexOf(target)) return [`has "${target}" as its placeholder and derives it as well`]
  const placeholder = Object.hasOwn(model.fields, target) ? model.fields[target]! : undefined
  return placeholder && !placeholder.file && placeholder.type !== 'text' ? [`has "${target}" as its placeholder, which must be a text field`] : []
}

// The order is an integer the lists sort by; each parent's records are found by filtering on `within`.
const positionProblems = (model: ResourceModel) => {
  if (!model.position) return []
  const { field: name, within } = model.position
  const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
  if (!field) return [`position "${name}" is not a field`]
  const parent = within !== undefined && Object.hasOwn(model.fields, within) ? model.fields[within]! : undefined
  if (within !== undefined && !parent) return [`position "${name}" is within "${within}", which is not a field`]
  return [
    ...(field.type !== 'integer' && field.type !== 'bigint' ? [`position "${name}" is ${field.type}, not an integer`] : []),
    ...(field.sortable ? [] : [`position "${name}" is not sortable, and the list in its order sorts by it`]),
    ...(model.primaryKey.includes(name) ? [`position "${name}" is part of the key, which a move would change`] : []),
    ...(within === name ? [`position "${name}" cannot be within itself`] : []),
    ...(parent && parent.type !== 'relation' ? [`position "${name}" is within "${within}", which is ${parent.type}, not a relation`] : []),
    ...(parent && !parent.filterable ? [`position "${name}" is within "${within}", which is not filterable, and each parent's records are found by it`] : []),
  ]
}

export const buildResourceModel = (state: ResourceState): ResourceModel => {
  const model = assembleModel(state)
  const events = state.events && buildEventModels(model, state.events)
  const problems = [...sensitiveProblems(model), ...fileProblems(model), ...positionProblems(model), ...(events?.problems ?? [])]
  if (problems.length > 0) throw new Error(`Resource "${model.name}": ${problems.join('; ')}`)
  return events && events.events.length > 0 ? { ...model, events: events.events } : model
}

export const ignoredColumns = (fields: FieldsInput = {}) =>
  Object.entries(fields)
    .filter(([, field]) => field === null)
    .map(([key]) => snakeCase(key))
