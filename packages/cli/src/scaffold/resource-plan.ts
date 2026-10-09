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
}

const softDeleteColumn = /^(deleted|removed|archived)_(at|on)$/

export const isSoftDeleteColumn = (table: DbTable, column: string) =>
  softDeleteColumn.test(column) &&
  table.columns.some((c) => c.name === column && !c.notNull && ['timestamp', 'timestamptz', 'date'].includes(c.typeName))

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
  }
}
