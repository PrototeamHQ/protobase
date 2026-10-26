import type { DbColumn, DbTable } from '../db/model'
import { indexServes } from '@protobase/query'
import { coverageIndexes } from '../db/keys'
import { isTenantColumn } from './tenant'
import { checkEnumValues } from './check-values'
import { defaultColumn } from './default-column'
import { columnDefault, type DefaultValue } from './defaults'
import { snakeName } from './names'
import { inferKind, type BaseType, type Kind } from './type-map'

export type FieldType = BaseType | 'relation' | 'currency' | 'country'

export type Proposal = {
  name: string
  column: string
  // The field type, which differs from `base` for relations.
  type: FieldType
  base: BaseType
  precision?: number
  scale?: number
  enumValues?: string[]
  relation?: { resource: string; columns?: string[] }
  optional: boolean
  defaultValue?: DefaultValue
  readOnly: boolean
  dbDefault?: boolean
  filterable: boolean
  sortable: boolean
}

export type ProposalContext = {
  table: DbTable
  // Resource name for a referenced table, keyed "schema.table".
  resourceNameOf: (schema: string, table: string) => string
}

// The server's scan guard decides, with the tenant column pinned as every query pins it: comparisons and sorts need a
// btree index, and a pg_trgm index serves patterns on a text column, so it alone makes the field filterable.
const columnIndexing = (table: DbTable, column: string, type: BaseType) => {
  const tenant = table.columns.find((c) => isTenantColumn(c.name))?.name
  const pinned = new Set(tenant ? [tenant] : [])
  const indexes = coverageIndexes(table)
  const sortable = indexes.some((index) => indexServes(index, column, 'btree', pinned))
  const trigram = type === 'text' && indexes.some((index) => indexServes(index, column, 'trigram', pinned))
  return { filterable: sortable || trigram, sortable }
}

// A composite foreign key becomes one relation on its first column, listing all columns.
const relationOf = (table: DbTable, column: string, context: ProposalContext) => {
  const fk = table.foreignKeys.find((candidate) => candidate.columns[0] === column)
  if (!fk) return undefined
  const resource = context.resourceNameOf(fk.refSchema, fk.refTable)
  return fk.columns.length === 1 ? { resource } : { resource, columns: fk.columns }
}

// snake_case or camelCase, as a table another tool made may name them.
export const auditColumn = /^(created|inserted|updated|modified)(_at|At)$/

// Computed defaults on identity, key and audit-timestamp columns are never meant to be typed in.
export const isServerManaged = (table: DbTable, column: DbColumn) =>
  column.identity ||
  auditColumn.test(column.name) ||
  table.indexes.some((index) => index.primary && index.columns.includes(column.name))

const defaultsOf = (table: DbTable, column: DbColumn, kind: Kind) => {
  const fallback = columnDefault(column, kind)
  if (fallback.kind === 'owned') return { readOnly: true }
  if (fallback.kind === 'db') return { readOnly: isServerManaged(table, column), dbDefault: true }
  if (fallback.kind === 'literal') return { readOnly: false, defaultValue: fallback.value }
  return { readOnly: false }
}

export const proposeField = (table: DbTable, column: DbColumn, context: ProposalContext): Proposal => {
  const kind = inferKind(column, checkEnumValues(table.checks, column.name))
  const relation = relationOf(table, column.name, context)
  const name = snakeName(column.name)
  const defaults = defaultsOf(table, column, kind)
  return {
    name,
    column: column.name,
    type: relation ? 'relation' : kind.type,
    base: kind.type,
    ...(kind.precision !== undefined && { precision: kind.precision, scale: kind.scale }),
    ...(kind.enumValues && { enumValues: kind.enumValues }),
    ...(relation && { relation }),
    optional: !column.notNull,
    ...defaults,
    readOnly: defaults.readOnly || Boolean(kind.unsupported),
    ...(kind.type === 'json' ? { filterable: false, sortable: false } : columnIndexing(table, column.name, kind.type)),
  }
}

export const needsColumnCall = (proposal: Proposal) => defaultColumn(proposal.name) !== proposal.column
