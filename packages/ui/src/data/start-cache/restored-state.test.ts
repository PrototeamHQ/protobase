import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { restoredState } from './restored-state'

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
})
