import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import type { Row } from '../types'
import { quoteIdent } from './capture-sql'
import type { CapturedRow } from './coalesce'

// A number as the database wrote it, so 64-bit integers and decimals keep every digit.
class ExactNumber {
  constructor(readonly source: string) {}
}

type Reviver = (key: string, value: unknown, context?: { source?: string }) => unknown

const exact: Reviver = (_key, value, context) => (typeof value === 'number' && context?.source !== undefined ? new ExactNumber(context.source) : value)

const plain = (value: unknown): unknown => {
  if (value instanceof ExactNumber) return Number(value.source)
  if (Array.isArray(value)) return value.map(plain)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]))
  return value
}

const textTypes = new Set(['bigint', 'decimal'])

/**
 * A captured row's columns from the JSON text the database stores: the columns of 64-bit integer and decimal fields as
 * their exact digits, other numbers as numbers. Needs a runtime that passes JSON.parse revivers the source text
 * (Node 21 and later, Bun).
 */
export const parseColumns = (text: string | null, model?: ResourceModel): Row | null => {
  if (text === null) return null
  const parsed = JSON.parse(text, exact as (key: string, value: unknown) => unknown) as Row
  const types = new Map(Object.values(model?.fields ?? {}).map((field) => [field.column, field.type]))
  return Object.fromEntries(
    Object.entries(parsed).map(([column, value]) => [column, value instanceof ExactNumber && textTypes.has(types.get(column) ?? '') ? value.source : plain(value)]),
  )
}

type OutboxRow = { id: string; transaction: string; resource: string; op: CapturedRow['op']; old: string | null; new: string | null; changed: string[] | null; actor: string | null; at: string }

/** The oldest `limit` rows of the outbox that committed, in id order. */
export const readOutbox = async (db: Db, schema: string, models: readonly ResourceModel[], limit: number): Promise<CapturedRow[]> => {
  const byName = new Map(models.map((model) => [model.name, model]))
  const { rows } = await sql<OutboxRow>`select "id"::text as id, "transaction"::text as transaction, "resource", "op", "old"::text as old, "new"::text as new, "changed",
      "actor"::text as actor, to_char("created_at" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at
    from ${sql.raw(`${quoteIdent(schema)}."outbox"`)} where "dispatch_after" <= now() order by "id" limit ${limit}`.execute(db)
  return rows.map((row) => {
    const model = byName.get(row.resource)
    return { ...row, old: parseColumns(row.old, model), new: parseColumns(row.new, model), actor: row.actor === null ? null : JSON.parse(row.actor) }
  })
}

/** Removes dispatched rows from the outbox. */
export const deleteOutbox = async (db: Db, schema: string, ids: readonly string[]) => {
  if (ids.length === 0) return
  await sql`delete from ${sql.raw(`${quoteIdent(schema)}."outbox"`)} where "id" = any(${ids}::bigint[])`.execute(db)
}
