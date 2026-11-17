import type { Account, BetterAuthOptions, DBAdapter, Where } from 'better-auth'

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

// The forms Postgres reads as a uuid: 32 hex digits, a hyphen after any group of four, within braces or not.
const uuid = /^(\{[0-9a-f]{4}(-?[0-9a-f]{4}){7}\}|[0-9a-f]{4}(-?[0-9a-f]{4}){7})$/i

/** Whether `key` may be the id of a row: where the ids are uuids, only one Postgres reads as a uuid, as it refuses others. */
export const mayBeId = (options: Pick<BetterAuthOptions, 'advanced'>, key: string) => options.advanced?.database?.generateId !== 'uuid' || uuid.test(key)

/** `key` as the store gives an id back: where the ids are uuids, one in lower case and hyphenated, as Postgres prints it. */
export const storedId = (options: Pick<BetterAuthOptions, 'advanced'>, key: string) => {
  if (options.advanced?.database?.generateId !== 'uuid' || !uuid.test(key)) return key
  const hex = key.replace(/[{}-]/g, '').toLowerCase()
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** The person's account of this id, read by its key; undefined when there is none, or it is someone else's. */
export const findAccount = async <T = Account>({ adapter, options }: { adapter: Pick<Reads, 'findMany'>; options: Pick<BetterAuthOptions, 'advanced'> }, userId: string, id: string) =>
  mayBeId(options, id) ? (await adapter.findMany<T>({ model: 'account', where: [{ field: 'id', value: id }, { field: 'userId', value: userId }], limit: 1 }))[0] : undefined
