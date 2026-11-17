import type { DBAdapter, Where } from 'better-auth'

// Questions about rows, put to the store as they are asked: Postgres answers them, so the answer never depends on
// which rows a read would have returned.

type Reads = Pick<DBAdapter, 'findOne' | 'count'>

/** Whether a row of `model` matches `where`: the store looks for one. */
export const exists = async (adapter: Pick<Reads, 'findOne'>, model: string, where: Where[]) => (await adapter.findOne({ model, where })) !== null

/** How many rows of `model` match `where`, counted by the store. */
export const countWhere = (adapter: Pick<Reads, 'count'>, model: string, where: Where[]) => adapter.count({ model, where })
