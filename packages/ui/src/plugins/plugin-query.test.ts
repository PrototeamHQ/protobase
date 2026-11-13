import { QueryClient } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@protobase/client'
import { ApiProvider } from '../data/api-provider'
import { createQueryPersistence, saveDelayMs } from '../data/start-cache/query-persistence'
import type { CachedQueries, StartCache } from '../data/start-cache/start-cache'
// What a plugin imports: @protobase/ui's own entry, which it shares with the app
import { useQuery, useQueryClient } from '../index'

const planKey = ['plugin', 'plan']

const fakeCache = (stored?: CachedQueries) => {
  const saves: CachedQueries[] = []
  const cache: StartCache = {
    session: () => undefined,
    queries: (owner) => (stored?.owner === owner ? stored : undefined),
    saveSession: async () => {},
    saveQueries: async (queries) => void saves.push(queries),
    clear: async () => {},
  }
  return { cache, saves }
}

// A plugin's component, such as one showing the workspace's plan, reading it with @protobase/ui's query hooks.
const Plan = ({ onClient }: { onClient?: (client: QueryClient) => void }) => {
  onClient?.(useQueryClient())
  const plan = useQuery({ queryKey: planKey, queryFn: async () => ({ plan: 'pro' }) })
  return createElement('span', null, plan.data?.plan ?? 'none')
}

const render = (cache: StartCache, onClient?: (client: QueryClient) => void) => {
  const persistence = createQueryPersistence({ cache, owner: 'user:u1' })
  const markup = renderToStaticMarkup(createElement(ApiProvider, { client: createClient(), persistence, children: createElement(Plan, { ...(onClient && { onClient }) }) }))
  return { markup, persistence }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("a plugin's queries", () => {
  it('draw from the start cache on the first render', () => {
    const earlier = new QueryClient()
    earlier.setQueryData(planKey, { plan: 'pro' })
    const queries = earlier.getQueryCache().getAll().map((query) => ({ queryKey: query.queryKey, queryHash: query.queryHash, state: query.state, dehydratedAt: 0 }))
    const { markup } = render(fakeCache({ owner: 'user:u1', used: {}, state: { mutations: [], queries } }).cache)
    expect(markup).toBe('<span>pro</span>')
  })

  it('are saved to the start cache with the app’s', async () => {
    const { cache, saves } = fakeCache()
    let client: QueryClient | undefined
    const { persistence } = render(cache, (given) => (client = given))
    // A server render runs no effects: subscribe and fetch as the app's provider and the mounted hook would
    const stop = persistence.subscribe(client!)
    await client!.getQueryCache().find({ queryKey: planKey })!.fetch()
    await vi.advanceTimersByTimeAsync(saveDelayMs)
    expect(saves.at(-1)?.state.queries.find((query) => query.queryHash === JSON.stringify(planKey))?.state.data).toEqual({ plan: 'pro' })
    stop()
  })
})
