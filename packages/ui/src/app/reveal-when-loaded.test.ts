import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { startsFromCache } from './reveal-when-loaded'

describe('a composed page drawn from the start cache', () => {
  const startedAt = 2000
  const queries = (client: QueryClient) => client.getQueryCache().getAll()

  it('shows at once when the app starts with restored answers and has fetched nothing yet', () => {
    const client = new QueryClient()
    client.setQueryData(['meta'], {}, { updatedAt: 1000 })
    expect(startsFromCache(queries(client), startedAt)).toBe(true)
  })

  it('waits for its data on a cold start, or once the app has fetched since it started', () => {
    expect(startsFromCache(queries(new QueryClient()), startedAt)).toBe(false)
    const client = new QueryClient()
    client.setQueryData(['meta'], {}, { updatedAt: 1000 })
    client.setQueryData(['list', 'tasks'], [], { updatedAt: 2500 })
    expect(startsFromCache(queries(client), startedAt)).toBe(false)
  })
})
