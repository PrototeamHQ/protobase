import type { BatchOp } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { humanize } from '../../live/naming'
import { convertCell, type ConvertOptions } from './convert'
import type { Lookups } from './lookups'
import { fieldLabel, relationModel, type ColumnMapping, type ImportMode } from './mapping'
import { cellText, isEmptyCell, type SheetCell, type SheetRow } from './sheet-cell'
import { text } from './messages'

/** What an import does: its mode, which column fills which field, the column records are found by, and how the file writes numbers and dates. */
export type ImportPlan = {
  mode: ImportMode
  columns: ColumnMapping[]
  /** For an update or create-or-update: the column whose value finds the record, by the field it holds. */
  match?: { column: number; field: string }
  options: ConvertOptions
}

/** The app's models, and the lookups that find related and updated records. */
export type ImportContext = {
  model: ResourceModel
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  lookups: Lookups
}

/**
 * A row as the import will write it: the write, or the problems that keep it from being written. `values` are the
 * converted values by field, a relation's as the file names the record, for the preview.
 */
export type PreparedRow = { line: number; cells: SheetCell[]; values: Record<string, unknown>; problems: string[]; op?: BatchOp }

const singularOf = (views: Record<string, ViewModel>, resource: string) => views[resource]?.names?.singular ?? humanize(resource)
const pluralOf = (views: Record<string, ViewModel>, resource: string) => views[resource]?.names?.plural ?? humanize(resource)

type Finding = { model: ResourceModel; field: string; value: unknown }

// A row's converted values and the records it needs found, before any lookup
const convertRow = (row: SheetRow, plan: ImportPlan, context: ImportContext) => {
  const { model, resources, views } = context
  const view = views[model.name]
  const values: Record<string, unknown> = {}
  const data: Record<string, unknown> = {}
  const problems: string[] = []
  const relations: Array<{ field: string; finding: Finding }> = []
  for (const { column, field: name, matchBy } of plan.columns) {
    const field = model.fields[name]!
    const cell = row.cells[column] ?? null
    const label = fieldLabel(view, name)
    const target = relationModel(field, resources)
    if (target && !isEmptyCell(cell)) {
      const by = matchBy ?? target.primaryKey[0]!
      const converted = convertCell(target.fields[by]!, views[target.name]?.fields[by], cell, plan.options)
      if (!converted.ok) problems.push(`${label}: ${converted.problem}`)
      else relations.push({ field: name, finding: { model: target, field: by, value: converted.value } })
      values[name] = cellText(cell)
      continue
    }
    const converted = convertCell(field, view?.fields[name], cell, plan.options)
    if (!converted.ok) problems.push(`${label}: ${converted.problem}`)
    else data[name] = values[name] = converted.value
  }
  let match: Finding | undefined
  if (plan.match && plan.mode !== 'create') {
    const field = model.fields[plan.match.field]!
    const converted = convertCell({ ...field, nullable: false }, view?.fields[field.name], row.cells[plan.match.column] ?? null, plan.options)
    if (!converted.ok) problems.push(`${fieldLabel(view, field.name)}: ${converted.problem}`)
    else match = { model, field: field.name, value: converted.value }
  }
  return { values, data, problems, relations, match }
}

// What a lookup found for a value: the one record's key, or why there is none: "no customer has email “x”", "2
// customers have email “x”"
const foundOne = (context: ImportContext, finding: Finding) => {
  const keys = context.lookups.keysOf(finding.model.name, finding.field, finding.value)
  const named = `${fieldLabel(context.views[finding.model.name], finding.field).toLowerCase()} “${String(finding.value)}”`
  if (keys.length === 1) return { key: keys[0] }
  if (keys.length === 0) return { none: text('noneHas', { singular: singularOf(context.views, finding.model.name), named }) }
  return { several: text('severalHave', { count: keys.length, plural: pluralOf(context.views, finding.model.name), named }) }
}

const isBlank = (row: SheetRow) => row.cells.every(isEmptyCell)

/**
 * The rows of a chunk as writes: each mapped cell converted, related records and the records to update found (asked
 * for together), and the write each row makes, or the problems that keep it out. Rows with no value at all are left
 * out.
 */
export const prepareRows = async (rows: SheetRow[], plan: ImportPlan, context: ImportContext): Promise<PreparedRow[]> => {
  const { model, views } = context
  const converted = rows.filter((row) => !isBlank(row)).map((row) => ({ row, ...convertRow(row, plan, context) }))

  const wanted = new Map<string, { model: ResourceModel; field: string; values: unknown[] }>()
  for (const finding of converted.flatMap((entry) => [...entry.relations.map((relation) => relation.finding), ...(entry.match ? [entry.match] : [])])) {
    const id = `${finding.model.name}.${finding.field}`
    if (!wanted.has(id)) wanted.set(id, { model: finding.model, field: finding.field, values: [] })
    wanted.get(id)!.values.push(finding.value)
  }
  for (const { model: target, field, values } of wanted.values()) await context.lookups.load(target, field, values)

  return converted.map(({ row, values, data, problems, relations, match }) => {
    const written = { ...data }
    for (const { field, finding } of relations) {
      const found = foundOne(context, finding)
      if ('key' in found) written[field] = found.key
      else problems.push(`${fieldLabel(views[model.name], field)}: ${found.none ?? found.several}`)
    }
    // An update needs its record; a create-or-update creates one when none matches
    const existing = match && foundOne(context, match)
    if (existing?.several) problems.push(text('notOneRecord', { found: existing.several }))
    if (existing?.none && plan.mode === 'update') problems.push(text('nothingToUpdate', { found: existing.none }))
    const prepared = { line: row.line, cells: row.cells, values, problems }
    if (problems.length > 0) return prepared
    if (existing && 'key' in existing) return { ...prepared, op: { op: 'update', resource: model.name, key: existing.key as string | number, etag: '*', data: written } satisfies BatchOp }
    return { ...prepared, op: { op: 'create', resource: model.name, data: written } satisfies BatchOp }
  })
}
