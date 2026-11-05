import type { Db } from '@protobase/query'

/** Where a write keeps its result under its key, in the write's own transaction, so the key commits with the write or not at all. */
export type IdempotencyStore = {
  /**
   * Claims the key in the transaction: undefined when it is new, the result kept under it when a write with the key
   * committed. A transaction that holds the key and has not ended yet makes it wait until it does.
   */
  claim: (trx: Db, key: string) => Promise<{ result: unknown } | undefined>
  /** Keeps the result under the key the transaction claimed. */
  keep: (trx: Db, key: string, result: unknown) => Promise<void>
}

/** A write's key and the store that keeps it: a write repeated with the key returns its first result and writes nothing. */
export type Idempotency = { key: string; store: IdempotencyStore }

/** Runs `write` in `trx` once per key: a repeat returns the result the first write kept, as JSON keeps it. */
export const once = async <T>(trx: Db, idempotency: Idempotency | undefined, write: () => Promise<T>): Promise<T> => {
  if (!idempotency) return write()
  const first = await idempotency.store.claim(trx, idempotency.key)
  if (first) return first.result as T
  const result = await write()
  await idempotency.store.keep(trx, idempotency.key, result)
  return result
}
