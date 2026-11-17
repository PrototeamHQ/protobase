import type { DBAdapter, Where } from 'better-auth'

// Questions about rows, put to the store as they are asked: Postgres answers them, so the answer never depends on
// which rows a read would have returned.

type Reads = Pick<DBAdapter, 'findMany' | 'count'>

/**
 * Whether a row of `model` matches `where`: the store looks for one, and stops at the first. Not `findOne`, which reads
 * every matching row and keeps the first.
 */
export const exists = async (adapter: Pick<Reads, 'findMany'>, model: string, where: Where[]) => (await adapter.findMany({ model, where, limit: 1 })).length > 0

/** How many rows of `model` match `where`, counted by the store. */
export const countWhere = (adapter: Pick<Reads, 'count'>, model: string, where: Where[]) => adapter.count({ model, where })
