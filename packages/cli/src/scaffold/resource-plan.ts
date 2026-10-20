import { keyColumns } from '../db/keys'
import { tableKey, type DbTable } from '../db/model'
import { isTenantColumn } from '../infer/tenant'
import { proposeField, type Proposal, type ProposalContext } from '../infer/proposal'

export type Decision = {
  proposal: Proposal
  ignored: boolean
}

export type ResourcePlan = {
  name: string
  table: DbTable
  decisions: Decision[]
  // Field names.
  primaryKey: string[]
  softDelete?: string
  tenant?: string
  // Unique index column sets other than the primary key, recorded in the file's doc comment.
  unique: string[][]
  // The field that names a record, when a pg_trgm index serves it, so the search finds records by it.
  search?: string
  // Whether open pages and Realtime subscribers hear of its changes (`.live()`).
  live?: boolean
}

const softDeleteColumn = /^(deleted|removed|archived)_(at|on)$/

export const isSoftDeleteColumn = (table: DbTable, column: string) =>
  softDeleteColumn.test(column) &&
  table.columns.some((c) => c.name === column && !c.notNull && ['timestamp', 'timestamptz', 'date'].includes(c.typeName))

// The columns that name a record, best first, as the admin picks its title field
const titleCandidates = ['name', 'title', 'number', 'sku', 'email', 'code', 'description']
const trigramClasses = ['gin_trgm_ops', 'gist_trgm_ops']

const servesSearch = (table: DbTable, column: string) =>
  table.indexes.some((index) => !index.partial && index.columns.some((key, position) => key === column && trigramClasses.includes(index.opclasses[position] ?? '')))

// The text field a record is named by: one called as titles usually are, else the first text field
const titleOf = (kept: Proposal[], key: string[]) => {
  const texts = kept.filter((p) => p.type === 'text' && !key.includes(p.column) && !isTenantColumn(p.column))
  return titleCandidates.map((name) => texts.find((p) => p.name === name)).find(Boolean) ?? texts[0]
}

export const proposeAll = (table: DbTable, context: ProposalContext) =>
  table.columns.map((column) => proposeField(table, column, context))

export const planResource = (
  name: string,
  table: DbTable,
  decisions: Decision[],
): ResourcePlan | undefined => {
  const key = keyColumns(table)
  if (!key) return undefined
  const kept = decisions.filter((d) => !d.ignored).map((d) => d.proposal)
  const nameOf = (column: string) => kept.find((p) => p.column === column)?.name
  const find = (test: (column: string) => boolean) => {
    const match = kept.find((p) => test(p.column))
    return match?.name
  }
  const primaryKey = key.map(nameOf)
  if (primaryKey.some((n) => n === undefined)) throw new Error(`${tableKey(table)}: key columns cannot be ignored`)
  const primary = table.indexes.find((index) => index.primary)
  const title = titleOf(kept, key)
  return {
    name,
    table,
    decisions,
    primaryKey: primaryKey as string[],
    softDelete: find((c) => isSoftDeleteColumn(table, c)),
    tenant: find(isTenantColumn),
    unique: table.indexes
      .filter((index) => index.unique && !index.partial && index !== primary)
      .flatMap((index) => (index.columns.every((c) => c !== null) ? [index.columns as string[]] : [])),
    ...(title && servesSearch(table, title.column) && { search: title.name }),
  }
}
