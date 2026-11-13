import { describe, expect, it } from 'vitest'
import type { AuthUser, SetupStatus } from '@protobase/client'
import { loadStartCache, type CachedQueries, type CachedSession } from './start-cache'
import type { StartCacheStore } from './start-cache-store'

const memoryStore = (records: Record<string, unknown> = {}): StartCacheStore & { records: Record<string, unknown> } => ({
  records,
  read: async (key) => structuredClone(records[key]),
  write: async (key, value) => void (records[key] = structuredClone(value)),
  remove: async (keys) => keys.forEach((key) => delete records[key]),
})

const status = { needsAdmin: false, signInMethods: ['password'], passwordReset: false, socialProviders: [], samlProviders: [] } satisfies SetupStatus
const ada: CachedSession = { user: { id: 'u1', email: 'ada@example.com', name: 'Ada' } as AuthUser, status }
const bob: CachedSession = { user: { id: 'u2', email: 'bob@example.com', name: 'Bob' } as AuthUser, status }
const adasQueries: CachedQueries = { owner: 'user:u1', used: { '["meta"]': 1 }, state: { mutations: [], queries: [] } }

const saved = async (buster: string) => {
  const store = memoryStore()
  const cache = await loadStartCache(store, buster)
  await cache.saveSession(ada)
  await cache.saveQueries(adasQueries)
  return store
}

describe('the start cache', () => {
  it('gives the next start the session and its owner’s queries', async () => {
    const cache = await loadStartCache(await saved('1.2.0'), '1.2.0')
    expect(cache.session()).toEqual(ada)
    expect(cache.queries('user:u1')).toEqual(adasQueries)
  })

  it('never gives one owner’s queries to another', async () => {
    const cache = await loadStartCache(await saved('1.2.0'), '1.2.0')
    expect(cache.queries('user:u2')).toBeUndefined()
    expect(cache.queries('state:visitor')).toBeUndefined()
  })

  it('is removed when another shell version starts', async () => {
    const store = await saved('1.2.0')
    const cache = await loadStartCache(store, '1.3.0')
    expect(cache.session()).toBeUndefined()
    expect(cache.queries('user:u1')).toBeUndefined()
    expect(store.records).toEqual({})
  })

  it('drops queries whose owner is not the session’s', async () => {
    const store = await saved('1.2.0')
    store.records.queries = { buster: '1.2.0', value: { ...adasQueries, owner: 'user:u2' } }
    const cache = await loadStartCache(store, '1.2.0')
    expect(cache.queries('user:u2')).toBeUndefined()
    expect(store.records.queries).toBeUndefined()
  })

  it('forgets the previous person’s queries when someone else signs in', async () => {
    const cache = await loadStartCache(await saved('1.2.0'), '1.2.0')
    await cache.saveSession(bob)
    expect(cache.queries('user:u1')).toBeUndefined()
  })

  it('forgets everything when cleared, in memory and in the store', async () => {
    const store = await saved('1.2.0')
    const cache = await loadStartCache(store, '1.2.0')
    await cache.clear()
    expect(cache.session()).toBeUndefined()
    expect(cache.queries('user:u1')).toBeUndefined()
    expect(store.records).toEqual({})
  })
})
