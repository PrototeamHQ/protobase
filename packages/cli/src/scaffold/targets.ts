import type { DbTable } from '../db/model'

export type Target = { schema?: string; table?: string; column?: string }

// "all" | "schema" | "schema.table" | "schema.table.column"
export const parseTarget = (text: string | undefined): Target => {
  if (!text || text === 'all') return {}
  const [schema, table, column, ...extra] = text.split('.')
  if (extra.length > 0) throw new Error(`Invalid target "${text}", expected all, schema, schema.table or schema.table.column`)
  return { schema, table, column }
}

export const matchesTarget = (target: Target, table: DbTable) =>
  (!target.schema || target.schema === table.schema) && (!target.table || target.table === table.name)

// Excludes are "schema" or "schema.table".
export const isExcluded = (excludes: readonly string[], table: DbTable) =>
  excludes.includes(table.schema) || excludes.includes(`${table.schema}.${table.name}`)
