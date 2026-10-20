import type { RawResult } from './values'

// Postgres answers a query without an order by in the order its rows sit in the tables, and the catalog's tables reuse
// the room that DDL and vacuum free on the same server, so such a read of the catalog, such as Better Auth's read of the
// store's indexes, may answer in another order on each recording. The recording keeps its rows sorted. Only reads of
// pg_index count: their rows are names, while other catalog reads may hold OIDs, whose tokens are numbered in the
// order they first came back.

/** Whether `sql` reads the indexes in the catalog in no order of its own. */
export const readsIndexesUnordered = (sql: string) => /\bpg_index\b/.test(sql) && !/\border\s+by\b/i.test(sql)

const text = (row: (string | null)[]) => JSON.stringify(row)

/** `result` with its rows sorted by their text. */
export const sortedRows = (result: RawResult): RawResult => ({ ...result, rows: [...result.rows].sort((a, b) => (text(a) < text(b) ? -1 : text(a) > text(b) ? 1 : 0)) })
