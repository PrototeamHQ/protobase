import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gatherMs, liveRefresh } from './live-refresh'
import { keys } from './query-keys'

afterEach(() => void vi.useRealTimers())

// A query client with each key on screen, counting how often each is read.
const shownQueries = async (...queryKeys: (readonly unknown[])[]) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  const reads = new Map<string, number>()
  for (const queryKey of queryKeys) {
    const name = JSON.stringify(queryKey)
    new QueryObserver(queryClient, { queryKey, queryFn: async () => reads.set(name, (reads.get(name) ?? 0) + 1).get(name) }).subscribe(() => {})
  }
  await vi.waitFor(() => expect(reads.size).toBe(queryKeys.length))
  return { queryClient, reads: (queryKey: readonly unknown[]) => reads.get(JSON.stringify(queryKey)) }
}

describe('liveRefresh', () => {
  it('reads again, once per burst, every query of the resources that changed', async () => {
    const orders = keys.list('orders', '', '', 50, '')
    const order = keys.record('orders', '1')
    const customers = keys.list('customers', '', '', 50, '')
    const { queryClient, reads } = await shownQueries(orders, order, customers)
    vi.useFakeTimers()
    const refresh = liveRefresh(queryClient, () => false)
    refresh.changed(['orders'])
    refresh.changed(['orders'])
    expect(reads(orders)).toBe(1)
    await vi.advanceTimersByTimeAsync(gatherMs)
    vi.useRealTimers()
    await vi.waitFor(() => expect([reads(orders), reads(order), reads(customers)]).toEqual([2, 2, 1]))
  })

  it('leaves a record under a form with unsaved changes as it is, only marked stale', async () => {
    const orders = keys.list('orders', '', '', 50, '')
    const order = keys.record('orders', '1')
    const { queryClient, reads } = await shownQueries(orders, order)
    vi.useFakeTimers()
    liveRefresh(queryClient, () => true).changed(['orders'])
    await vi.advanceTimersByTimeAsync(gatherMs)
    vi.useRealTimers()
    await vi.waitFor(() => expect(reads(orders)).toBe(2))
    expect(reads(order)).toBe(1)
    expect(queryClient.getQueryState(order)?.isInvalidated).toBe(true)
  })
})
