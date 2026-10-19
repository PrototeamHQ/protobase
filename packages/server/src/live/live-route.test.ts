import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { readEventStream } from '@protobase/schema/internal'
import { createErrorHandler } from '../error-handler'
import type { AdminEnv } from '../types'
import { liveRoutes, type LiveEvent } from './live-route'
import type { NoticeFeed } from './notice-feed'
import type { Notice } from './notices-sql'

const notice = (id: string, resource = 'orders', tenant: string | null = null): Notice => ({ id, resource, key: id, operation: 'update', tenant })

// A feed at `cursor` that keeps `kept` for replays and hands out what `push` sends.
const fakeFeed = (cursor: string, kept: Notice[] = []) => {
  const listeners = new Set<(notices: Notice[]) => void>()
  const feed: NoticeFeed = {
    subscribe: async (listener) => {
      listeners.add(listener)
      return { cursor, stop: () => void listeners.delete(listener) }
    },
    replay: async (after, upTo) => (kept.some((entry) => entry.id === after) ? kept.filter((entry) => BigInt(entry.id) > BigInt(after) && BigInt(entry.id) <= BigInt(upTo)) : undefined),
  }
  return { feed, listeners, push: (notices: Notice[]) => listeners.forEach((listener) => listener(notices)) }
}

const appOf = (feed: NoticeFeed) => {
  const app = new Hono<AdminEnv>()
  app.onError(createErrorHandler())
  app.use('*', async (c, next) => {
    c.set('session', { user: { id: 'u1', roles: ['admin'] } })
    await next()
  })
  app.route('/', liveRoutes(feed, async () => (entry) => entry.resource === 'orders'))
  return app
}

// The first `count` events of the stream, then hangs up.
const events = async (app: Hono<AdminEnv>, query: string, count: number, whileOpen: () => void = () => {}) => {
  const controller = new AbortController()
  const response = await app.request(`/live${query}`, { signal: controller.signal })
  const seen: LiveEvent[] = []
  await new Promise<void>((resolve) => {
    void readEventStream(response.body!, (data) => {
      seen.push(JSON.parse(data) as LiveEvent)
      if (seen.length === 1) whileOpen()
      if (seen.length === count) resolve()
    }, controller.signal)
  })
  controller.abort()
  return seen
}

describe('liveRoutes', () => {
  it('says where a new page starts, then sends the changes it may read as they come', async () => {
    const { feed, push } = fakeFeed('7')
    const seen = await events(appOf(feed), '', 2, () => push([notice('8', 'secrets'), notice('9'), notice('10')]))
    expect(seen).toEqual([
      { type: 'current', cursor: '7' },
      { type: 'changes', cursor: '10', changes: [{ resource: 'orders', key: '9', operation: 'update' }, { resource: 'orders', key: '10', operation: 'update' }] },
    ])
  })

  it('catches a page that connects again up on what it missed, or has it read everything again', async () => {
    const { feed } = fakeFeed('9', [notice('5'), notice('6', 'secrets'), notice('8'), notice('9')])
    expect(await events(appOf(feed), '?after=5', 1)).toEqual([{ type: 'changes', cursor: '9', changes: [{ resource: 'orders', key: '8', operation: 'update' }, { resource: 'orders', key: '9', operation: 'update' }] }])
    expect(await events(appOf(feed), '?after=8', 1)).toEqual([{ type: 'changes', cursor: '9', changes: [{ resource: 'orders', key: '9', operation: 'update' }] }])
    expect(await events(appOf(feed), '?after=9', 1)).toEqual([{ type: 'current', cursor: '9' }])
    expect(await events(appOf(feed), '?after=2', 1)).toEqual([{ type: 'resync', cursor: '9' }])
  })

  it('skips what a page already heard of on another process further along', async () => {
    const { feed, push } = fakeFeed('7', [notice('9')])
    const seen = await events(appOf(feed), '?after=9', 2, () => push([notice('8'), notice('9'), notice('11')]))
    expect(seen).toEqual([{ type: 'current', cursor: '9' }, { type: 'changes', cursor: '11', changes: [{ resource: 'orders', key: '11', operation: 'update' }] }])
  })

  it('stops listening once the page hangs up, and refuses a cursor that is no number', async () => {
    const { feed, listeners } = fakeFeed('1')
    const app = appOf(feed)
    await events(app, '', 1)
    await expect.poll(() => listeners.size).toBe(0)
    expect((await app.request('/live?after=abc')).status).toBe(400)
  })
})
