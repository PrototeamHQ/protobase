import { expect, test } from 'vitest'
import type { Db } from '@protobase/query'
import { once, type IdempotencyStore } from './idempotency'

// Keeps keys as a committed table would: a result once kept is what a later claim finds.
const memoryStore = () => {
  const kept = new Map<string, unknown>()
  const store: IdempotencyStore = {
    claim: async (_, key) => (kept.has(key) ? { result: kept.get(key) } : undefined),
    keep: async (_, key, result) => void kept.set(key, result),
  }
  return { store, kept }
}

const trx = {} as Db

test('a write repeated with its key writes nothing and returns the first result', async () => {
  const { store } = memoryStore()
  let writes = 0
  const write = async () => ({ id: ++writes })
  expect(await once(trx, { key: 'run/0', store }, write)).toEqual({ id: 1 })
  expect(await once(trx, { key: 'run/0', store }, write)).toEqual({ id: 1 })
  expect(writes).toBe(1)
})

test('another key writes again', async () => {
  const { store, kept } = memoryStore()
  let writes = 0
  const write = async () => ++writes
  await once(trx, { key: 'run/0', store }, write)
  await once(trx, { key: 'run/1', store }, write)
  expect(writes).toBe(2)
  expect([...kept.entries()]).toEqual([['run/0', 1], ['run/1', 2]])
})

test('a write that fails keeps nothing, so its retry writes', async () => {
  const { store, kept } = memoryStore()
  await expect(once(trx, { key: 'run/0', store }, () => Promise.reject(new Error('refused')))).rejects.toThrow('refused')
  expect(kept.size).toBe(0)
  expect(await once(trx, { key: 'run/0', store }, async () => 'written')).toBe('written')
})

test('without a key every write writes', async () => {
  let writes = 0
  await once(trx, undefined, async () => ++writes)
  await once(trx, undefined, async () => ++writes)
  expect(writes).toBe(2)
})
