import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { isAnsweredNow, keepCachedOnFailure, lastFetchFailed, restoredState } from './restored-state'

const restoredClient = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['list', 'tasks'], { rows: [1] }, { updatedAt: 1000 })
  return client
}

const onScreen = (client: QueryClient) => client.getQueryCache().findAll({ type: 'active' })

describe('how a page shows data from the start cache', () => {
  it('is fresh with nothing restored on screen', () => {
    const client = restoredClient()
    expect(restoredState(onScreen(client), 2000)).toBe('fresh')
  })

  it('shows as stale and refreshing until the refetch lands, then fresh', async () => {
    const client = restoredClient()
    let land: (value: unknown) => void = () => {}
    const observer = new QueryObserver(client, { queryKey: ['list', 'tasks'], queryFn: () => new Promise((resolve) => (land = resolve)) })
    const stop = observer.subscribe(() => {})
    const startedAt = 2000
    expect(restoredState(onScreen(client), startedAt)).toBe('refreshing')
    land({ rows: [1, 2] })
    await observer.refetch({ cancelRefetch: false })
    expect(restoredState(onScreen(client), startedAt)).toBe('fresh')
    stop()
  })

  it('stays stale and says so once the refetch failed', async () => {
    const client = restoredClient()
    const observer = new QueryObserver(client, { queryKey: ['list', 'tasks'], queryFn: () => Promise.reject(new Error('offline')) })
    const stop = observer.subscribe(() => {})
    await observer.refetch({ cancelRefetch: false })
    expect(client.getQueryData(['list', 'tasks'])).toEqual({ rows: [1] })
    expect(restoredState(onScreen(client), 2000)).toBe('failed')
    stop()
  })

  it('keeps the cached answer on screen when its refetch failed, and says so beside the title', async () => {
    const client = restoredClient()
    const stop = keepCachedOnFailure(client, 2000)
    const observer = new QueryObserver(client, { queryKey: ['list', 'tasks'], queryFn: () => Promise.reject(new Error('offline')) })
    const unsubscribe = observer.subscribe(() => {})
    const result = await observer.refetch({ cancelRefetch: false })
    expect(result.isError).toBe(false)
    expect(result.data).toEqual({ rows: [1] })
    expect(restoredState(onScreen(client), 2000)).toBe('failed')
    expect(client.getQueryCache().find({ queryKey: ['list', 'tasks'] })?.isStale()).toBe(true)
    unsubscribe()
    stop()
  })

  it('leaves a failure of data fetched this time as it is', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = keepCachedOnFailure(client, 2000)
    const observer = new QueryObserver(client, { queryKey: ['list', 'tasks'], queryFn: () => Promise.reject(new Error('offline')) })
    const unsubscribe = observer.subscribe(() => {})
    expect((await observer.refetch({ cancelRefetch: false })).isError).toBe(true)
    unsubscribe()
    stop()
  })
})

describe('whether a query was answered in this page load', () => {
  it('is not answered by the start cache, until a refetch lands', async () => {
    const client = restoredClient()
    const observer = new QueryObserver(client, { queryKey: ['list', 'tasks'], queryFn: async () => ({ rows: [] }) })
    expect(isAnsweredNow(observer.getCurrentResult(), Date.now())).toBe(false)
    const unsubscribe = observer.subscribe(() => {})
    await observer.refetch({ cancelRefetch: false })
    expect(isAnsweredNow(observer.getCurrentResult(), 2000)).toBe(true)
    unsubscribe()
  })

  it('is not answered with nothing yet', () => {
    expect(isAnsweredNow({ data: undefined, dataUpdatedAt: 0 }, 0)).toBe(false)
  })

  it('says the last fetch failed while the cached answer stays a success', async () => {
    const client = restoredClient()
    const stop = keepCachedOnFailure(client, 2000)
    const observer = new QueryObserver(client, { queryKey: ['list', 'tasks'], queryFn: () => Promise.reject(new Error('offline')) })
    const unsubscribe = observer.subscribe(() => {})
    await observer.refetch({ cancelRefetch: false })
    const result = observer.getCurrentResult()
    expect(result.isError).toBe(false)
    expect(isAnsweredNow(result, 2000)).toBe(false)
    expect(lastFetchFailed(result)).toBe(true)
    unsubscribe()
    stop()
  })

  it('no longer says so once a later fetch lands', async () => {
    const client = restoredClient()
    let fail = true
    const observer = new QueryObserver(client, { queryKey: ['list', 'tasks'], queryFn: () => (fail ? Promise.reject(new Error('offline')) : Promise.resolve({ rows: [2] })) })
    const unsubscribe = observer.subscribe(() => {})
    await observer.refetch({ cancelRefetch: false })
    expect(lastFetchFailed(observer.getCurrentResult())).toBe(true)
    fail = false
    await observer.refetch({ cancelRefetch: false })
    expect(lastFetchFailed(observer.getCurrentResult())).toBe(false)
    unsubscribe()
  })
})
