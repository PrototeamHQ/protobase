import { QueryClient, dehydrate } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { AuthUser, SetupStatus } from '@protobase/client'
import { keys } from '../query-keys'
import { cachedPlugins } from './cached-plugins'
import { loadStartCache } from './start-cache'
import type { StartCacheStore } from './start-cache-store'

const memoryStore = (): StartCacheStore => {
  const records: Record<string, unknown> = {}
  return {
    read: async (key) => structuredClone(records[key]),
    write: async (key, value) => void (records[key] = structuredClone(value)),
    remove: async (keys) => keys.forEach((key) => delete records[key]),
  }
}

const status = { needsAdmin: false, signInMethods: ['password'], passwordReset: false, socialProviders: [], samlProviders: [] } satisfies SetupStatus
const ada = { user: { id: 'u1', email: 'ada@example.com', name: 'Ada' } as AuthUser, status }
const plugins = [{ url: 'https://cdn.example.com/hello/plugin.json', settings: { greeting: 'hi' } }]

const kept = (owner: string) => {
  const client = new QueryClient()
  client.setQueryData(keys.meta, { etag: '"m"', appName: 'Orders', plugins })
  return { owner, used: {}, state: dehydrate(client) }
}

describe('the plugins the app loads before it draws', () => {
  it("are the ones the start cache's /meta names, for the person it was kept for", async () => {
    const cache = await loadStartCache(memoryStore(), '1.0.0')
    await cache.saveSession(ada)
    await cache.saveQueries(kept('user:u1'))
    expect(cachedPlugins(cache)).toEqual(plugins)
  })

  it('are none without a start cache, a session or a kept /meta', async () => {
    expect(cachedPlugins(undefined)).toEqual([])
    const cache = await loadStartCache(memoryStore(), '1.0.0')
    expect(cachedPlugins(cache)).toEqual([])
    await cache.saveSession(ada)
    expect(cachedPlugins(cache)).toEqual([])
    await cache.saveQueries(kept('user:someone-else'))
    expect(cachedPlugins(cache)).toEqual([])
  })
})
