import { buildEventModels } from './events/event-models'
import type { EventSpec } from './events/event-helpers'
import type { AnyField } from './field'
import type { FileOptions } from './files/file-options'
import type { FieldModel, ParentModel, PositionAfterModel, ResourceModel, SearchMatch } from './model'
import { promptFields } from './ai-prompt'
import { computedProblems } from './computed/computed-problems'
import { openExistingProblems } from './open-existing-problems'
import { snakeCase } from './naming'
import type { FieldsInput } from './refs'

export type ResourceState = {
  name: string
  table?: string
  fields?: FieldsInput
  primaryKey?: string[]
  softDelete?: string
  tenant?: string
  tenantAcross?: 'memberships'
  search?: string[]
  searchMatch?: Record<string, SearchMatch>
  owner?: string
  author?: string
  position?: { field: string; within?: string; after?: PositionAfterModel }
  parents?: ParentModel[]
  events?: EventSpec[]
  history?: boolean
  comments?: boolean
  live?: boolean
  openExisting?: string[]
}

export const parseTable = (table: string) => {
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
    ...(meta.encrypted && { encrypted: true as const }),
    ...(meta.strongSignIn && { strongSignIn: { minutes: meta.strongSignIn.minutes } }),
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
    ...(meta.ai && { ai: { prompt: meta.ai.prompt } }),
    ...(meta.rollup && { rollup: { ...meta.rollup } }),
    ...(meta.formula !== undefined && { formula: meta.formula }),
    ...((meta.rollup || meta.formula !== undefined) && meta.precision !== undefined && { decimal: { precision: meta.precision, scale: meta.scale! } }),
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
    ...(state.tenant && state.tenantAcross && { tenantAcross: state.tenantAcross }),
    ...(state.search && { search: [...state.search] }),
    ...(state.searchMatch && Object.keys(state.searchMatch).length > 0 && { searchMatch: { ...state.searchMatch } }),
    ...(state.owner && { owner: state.owner }),
    ...(state.author && { author: state.author }),
    ...(state.history && { history: true as const }),
    ...(state.comments && { comments: true as const }),
    ...(state.live && { live: true as const }),
    ...(state.position && { position: { ...state.position } }),
    ...(state.parents && { parents: state.parents.map((parent) => ({ ...parent })) }),
    ...(state.openExisting && { openExisting: [...state.openExisting] }),
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

// Only the API encrypts a value, so neither the database nor SQL may write one: no read-only field, no database default.
const encryptedProblems = (model: ResourceModel) =>
  Object.values(model.fields)
    .filter((field) => field.encrypted)
    .flatMap((field) => [
      ...(field.readOnly ? ['readOnly()'] : []),
      ...(field.default && 'db' in field.default ? ['given a database default'] : []),
    ].map((problem) => `encrypted field "${field.name}" cannot be ${problem}`))

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
    ...(model.position.after && model.primaryKey.length !== 1 ? [`position "${name}" ranks after other records, which needs a key of one field`] : []),
  ]
}

// A parent is a relation of one column; its access is checked at runtime too, as JS config is not type-checked and
// anything else must not fall back to a weaker check.
const parentProblems = (model: ResourceModel) =>
  (model.parents ?? []).flatMap(({ field: name, access }, index, parents) => {
    const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
    return [
      ...(!field ? ['is not a field'] : field.type !== 'relation' ? [`is ${field.type}, not a relation`] : []),
      ...(field?.relation && field.relation.columns.length !== 1 ? ['is a relation of several columns (not implemented)'] : []),
      ...(access === 'read' || access === 'update' ? [] : [`needs "${String(access)}", not "read" or "update"`]),
      ...(parents.findIndex((parent) => parent.field === name) !== index ? ['is given twice'] : []),
    ].map((problem) => `parent "${name}" ${problem}`)
  })

// A job writes an AI field through the API, after the write, from fields the model may see: text or an enum, empty until
// it is filled, and read from plain fields only, so that no fill feeds another or itself.
const aiProblems = (model: ResourceModel) =>
  Object.values(model.fields)
    .filter((field) => field.ai)
    .flatMap((field) => [
      ...(field.type === 'text' || field.type === 'enum' ? [] : [`is ${field.type}, not text or an enum`]),
      ...(field.nullable ? [] : ['must be optional(), empty until the job fills it']),
      ...(field.readOnly ? ['cannot be readOnly(), as the job writes it through the API'] : []),
      ...(field.sensitive ? ['cannot be sensitive'] : []),
      ...promptFields(field.ai!.prompt).flatMap((name) => {
        const read = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
        if (!read) return [`reads "${name}", which is not a field`]
        if (name === field.name) return [`reads "${name}", itself`]
        if (read.ai) return [`reads "${name}", which is an AI field too`]
        return read.sensitive ? [`reads "${name}", which is sensitive`] : []
      }),
    ].map((problem) => `AI field "${field.name}" ${problem}`))

export const buildResourceModel = (state: ResourceState): ResourceModel => {
  const model = assembleModel(state)
  const events = state.events && buildEventModels(model, state.events)
  const problems = [...sensitiveProblems(model), ...encryptedProblems(model), ...fileProblems(model), ...positionProblems(model), ...parentProblems(model), ...aiProblems(model), ...openExistingProblems(model), ...computedProblems(model), ...(events?.problems ?? [])]
  if (problems.length > 0) throw new Error(`Resource "${model.name}": ${problems.join('; ')}`)
  return events && events.events.length > 0 ? { ...model, events: events.events } : model
}

export const ignoredColumns = (fields: FieldsInput = {}) =>
  Object.entries(fields)
    .filter(([, field]) => field === null)
    .map(([key]) => snakeCase(key))
