import { sql, type OperationNode } from 'kysely'
import type { StoreSql } from './store-sql'

/** A table, a column or another fragment of SQL. */
type SqlPart = { toOperationNode: () => OperationNode }

/** A keyset page of a table, as `pageOf` asks Postgres for it. */
export type PageQuery = {
  from: SqlPart
  /** Each column the rows hold, under the name they hold it. */
  select: Record<string, SqlPart>
  /** The columns the page is ordered by, the last one unique, such as `(created_at, id)`; an index on them serves it. */
  key: SqlPart[]
  /** The `next` of the page before; the first page without it. */
  after?: readonly string[]
  size: number
}

/**
 * One page of rows, ordered by `key` and paged by Postgres: the rows past `after`, at most `size` of them, and the key
 * the next page starts after, which a page that reaches the end has none of. The key travels as Postgres's text of each
 * value, so a timestamp keeps its microseconds.
 */
export const pageOf = async <Row>({ db }: StoreSql, { from, select, key, after, size }: PageQuery) => {
  const columns = sql.join([...Object.entries(select).map(([name, column]) => sql`${column} as ${sql.id(name)}`), ...key.map((column, i) => sql`${column}::text as ${sql.id(`key_${i}`)}`)])
  const past = after ? sql`where (${sql.join(key)}) > (${sql.join(after.map((value) => sql`${value}`))})` : sql``
  const { rows } = await sql<Row & Record<string, string>>`select ${columns} from ${from} ${past} order by ${sql.join(key)} limit ${size + 1}`.execute(db)
  const page = rows.slice(0, size)
  const last = rows.length > size ? page.at(-1) : undefined
  return { rows: page as Row[], ...(last && { next: key.map((_, i) => last[`key_${i}`]!) }) }
}
