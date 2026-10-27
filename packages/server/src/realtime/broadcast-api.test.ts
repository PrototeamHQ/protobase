import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { Caller } from '../api-keys/resolve-caller'
import { createErrorHandler } from '../error-handler'
import { unauthorized } from '../problem'
import { broadcastApi } from './broadcast-api'
import { broadcastHub, type BroadcastMember } from './broadcast-hub'
import type { ChannelAccess } from './channel-access'
import { realtimeLimits } from './realtime-limits'

const anon: Caller = { role: 'anon', claims: { role: 'anon' } }

// A caller with the key `app`; the access lets it send on the private topic `open` alone, and `broken`'s policy fails.
const setup = () => {
  const reported: unknown[] = []
  const checked: string[] = []
  const broadcasts = broadcastHub({ now: () => 0 })
  const access: ChannelAccess = {
    read: async () => new Map(),
    write: async (_caller, topic) => {
      checked.push(topic)
      if (topic === 'broken') throw Object.assign(new Error('policy raised'), { code: 'P0001' })
      return topic === 'open'
    },
  }
  const caller = async (request: Request) => {
    if (request.headers.get('apikey') !== 'app') throw unauthorized('The apikey header holds no key of this app')
    return anon
  }
  const app = new Hono().route('/api/broadcast', broadcastApi({ caller, broadcasts, access, report: (error) => void reported.push(error) }))
  app.onError(createErrorHandler((error) => { throw error }))
  const heard = (topic: string, isPrivate = false) => {
    const events: unknown[] = []
    const member: BroadcastMember = { self: false, private: isPrivate, receive: (event, payload) => events.push([event, payload]) }
    broadcasts.join(`realtime:${topic}`, member)
    return { events, member }
  }
  const post = (path: string, body: BodyInit, type = 'application/json', apikey = 'app') => app.request(path, { method: 'POST', headers: { apikey, 'content-type': type }, body })
  const batch = (messages: unknown[], apikey?: string) => post('/api/broadcast', JSON.stringify({ messages }), 'application/json', apikey)
  return { broadcasts, reported, checked, heard, post, batch }
}

describe('broadcastApi', () => {
  it('sends a batch to the channels joined on each topic, and answers 202', async () => {
    const { heard, batch } = setup()
    const [room, other] = [heard('room'), heard('other')]
    const response = await batch([{ topic: 'room', event: 'hi', payload: { n: 1 } }, { topic: 'other', event: 'yo', payload: {} }])
    expect(response.status).toBe(202)
    expect(await response.text()).toBe('')
    expect([room.events, other.events]).toEqual([[['hi', { n: 1 }]], [['yo', {}]]])
  })

  it('refuses a request without a key of the app with 401, and sends nothing', async () => {
    const { heard, batch } = setup()
    const room = heard('room')
    expect((await batch([{ topic: 'room', event: 'hi', payload: {} }], 'other')).status).toBe(401)
    expect(room.events).toEqual([])
  })

  it('refuses a batch over the topic\'s rate with 429, a body over a frame with 413 and a bad message with 422, sending none of them', async () => {
    const { broadcasts, heard, batch, post } = setup()
    const [room, other] = [heard('room'), heard('other')]
    for (let n = 1; n < realtimeLimits.topicBroadcastsPerSecond; n++) broadcasts.send('realtime:room', other.member, 'fill', n)
    const over = await batch([{ topic: 'other', event: 'hi', payload: {} }, { topic: 'room', event: 'a', payload: {} }, { topic: 'room', event: 'b', payload: {} }])
    expect([over.status, (await over.json()).message]).toEqual([429, 'Too many messages per second on this topic'])
    const big = await batch([{ topic: 'other', event: 'hi', payload: { text: 'x'.repeat(realtimeLimits.maxFrameBytes) } }])
    expect(big.status).toBe(413)
    expect((await batch([{ topic: 'other', event: 'hi', payload: {} }, { topic: 'other', payload: {} }])).status).toBe(422)
    expect((await post('/api/broadcast', 'not json')).status).toBe(400)
    expect((await post('/api/broadcast', '{}', 'text/plain')).status).toBe(415)
    expect(other.events).toEqual([])
    expect(room.events).toHaveLength(realtimeLimits.topicBroadcastsPerSecond - 1)
  })

  it('sends a private message to the private channels of a topic the caller may send on, a public one to the public channels, and drops the others', async () => {
    const { heard, batch, checked, reported } = setup()
    const [open, openPrivate, closed, closedPrivate, brokenPrivate] = [heard('open'), heard('open', true), heard('closed'), heard('closed', true), heard('broken', true)]
    const response = await batch([
      { topic: 'open', event: 'a', payload: {}, private: true },
      { topic: 'open', event: 'b', payload: {}, private: true },
      { topic: 'closed', event: 'c', payload: {}, private: true },
      { topic: 'broken', event: 'd', payload: {}, private: true },
      { topic: 'closed', event: 'e', payload: {} },
    ])
    expect(response.status).toBe(202)
    expect(openPrivate.events).toEqual([['a', {}], ['b', {}]])
    expect(open.events).toEqual([])
    expect(closed.events).toEqual([['e', {}]])
    expect(closedPrivate.events).toEqual([])
    expect(brokenPrivate.events).toEqual([])
    expect(checked).toEqual(['open', 'closed', 'broken'])
    expect(reported).toEqual([expect.objectContaining({ code: 'P0001' })])
  })

  it('sends one message by its path, JSON or binary, and refuses a private one the caller may not send with 403', async () => {
    const { heard, post } = setup()
    const [room, closed] = [heard('room'), heard('closed', true)]
    expect((await post('/api/broadcast/room/events/hi', JSON.stringify({ n: 1 }))).status).toBe(202)
    const bytes = new Uint8Array([1, 2, 3])
    expect((await post('/api/broadcast/room/events/bin', bytes, 'application/octet-stream')).status).toBe(202)
    expect(room.events).toEqual([['hi', { n: 1 }], ['bin', bytes.buffer]])
    const refused = await post('/api/broadcast/closed/events/hi?private=true', '{}')
    expect([refused.status, (await refused.json()).message]).toEqual([403, 'Unauthorized'])
    expect((await post('/api/broadcast/room/events/hi', '[1]')).status).toBe(422)
    expect((await post('/api/broadcast/room/events/hi', 'hi', 'text/plain')).status).toBe(415)
    expect(closed.events).toEqual([])
    expect(room.events).toHaveLength(2)
  })
})
