import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import { Hono } from 'hono'
import { defineWebSocketHelper, WSContext, type WSEvents } from 'hono/ws'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Caller } from '../api-keys/resolve-caller'
import type { ChangeHub } from './change-hub'
import { realtimeLimits } from './realtime-limits'
import { realtimeRoutes } from './realtime-routes'

// npm ws by its path: on Bun a bare `ws` is Bun's shim, which realtime refuses.
const require = createRequire(import.meta.url)
const ws: typeof import('ws') = require(path.join(path.dirname(require.resolve('ws/package.json')), 'index.js'))

const anon: Caller = { role: 'anon', claims: { role: 'anon' } }
const hub: ChangeHub = { add: () => () => {} }
const url = '/websocket?apikey=sb_publishable_x&vsn=2.0.0'
const joinWithPresence = (key: string) => JSON.stringify(['1', '1', 'realtime:room', 'phx_join', { config: { presence: { key, enabled: true } } }])

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

describe('realtimeRoutes', () => {
  it('closes a socket whose raw socket counts no unsent bytes with 1011, before it joins or sends anything', async () => {
    const opened: WSEvents[] = []
    const fake = defineWebSocketHelper((_c, events) => {
      opened.push(events)
      return new Response()
    })
    const report = vi.fn()
    const app = realtimeRoutes({ upgradeWebSocket: fake, caller: async () => anon, live: [], hub, report })
    const socket = (raw: unknown) => {
      const sent: unknown[] = []
      const close = vi.fn()
      const context = new WSContext({ send: (data) => sent.push(data), close, raw, readyState: 1 })
      return { sent, close, context }
    }

    await app.request(url)
    await app.request(url)
    const [shim, member] = [socket({ bufferedAmount: 0 }), socket({ _sender: {}, _socket: {}, bufferedAmount: 0 })]
    const [shimEvents, memberEvents] = opened as [WSEvents, WSEvents]
    shimEvents.onOpen!(new Event('open'), shim.context)
    memberEvents.onOpen!(new Event('open'), member.context)
    memberEvents.onMessage!(new MessageEvent('message', { data: joinWithPresence('member') }), member.context)
    shimEvents.onMessage!(new MessageEvent('message', { data: joinWithPresence('shim') }), shim.context)
    shimEvents.onMessage!(new MessageEvent('message', { data: JSON.stringify(['1', '2', 'realtime:room', 'presence', { type: 'presence', event: 'track', payload: {} }]) }), shim.context)
    shimEvents.onMessage!(new MessageEvent('message', { data: JSON.stringify(['1', '3', 'realtime:room', 'broadcast', { type: 'broadcast', event: 'hi', payload: {} }]) }), shim.context)
    await vi.waitFor(() => expect(member.sent).toHaveLength(2))
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(shim.close.mock.calls).toEqual([[1011, undefined]])
    expect(shim.sent).toEqual([])
    expect(report).toHaveBeenCalledTimes(1)
    expect(member.close).not.toHaveBeenCalled()
    expect(member.sent.map((frame) => JSON.parse(frame as string)[3])).toEqual(['phx_reply', 'presence_state'])
    expect(JSON.parse(member.sent[1] as string)[4]).toEqual({})
    memberEvents.onClose!(new CloseEvent('close'), member.context)
  })

  it('leaves the channels of a socket that ws closed for a frame over the cap, without waiting for its close', async () => {
    const app = new Hono().route('/', realtimeRoutes({ upgradeWebSocket, caller: async () => anon, live: [], hub, report: (error) => { throw error } }))
    const server = createAdaptorServer({ fetch: app.fetch, websocket: { server: new ws.WebSocketServer({ noServer: true, maxPayload: realtimeLimits.maxFrameBytes }) } })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    cleanups.push(() => server.close())
    const address = `ws://127.0.0.1:${(server.address() as AddressInfo).port}${url}`
    const connect = async (key: string) => {
      const client = new ws.WebSocket(address)
      cleanups.push(() => client.terminate())
      const frames: unknown[][] = []
      client.on('message', (data) => frames.push(JSON.parse(String(data))))
      await new Promise((resolve) => client.once('open', resolve))
      client.send(joinWithPresence(key))
      client.send(JSON.stringify(['1', '2', 'realtime:room', 'presence', { type: 'presence', event: 'track', payload: { key } }]))
      await vi.waitFor(() => expect(frames.filter((frame) => frame[3] === 'phx_reply')).toHaveLength(2))
      return { client, frames }
    }

    const watcher = await connect('watcher')
    const flooder = await connect('flooder')
    // It sends the frame and then reads nothing, so it never answers ws's close.
    flooder.client.send('x'.repeat(realtimeLimits.maxFrameBytes + 1), () => (flooder.client as unknown as { _socket: { pause: () => void } })._socket.pause())
    const started = Date.now()
    const leave = ['1', null, 'realtime:room', 'presence_diff', { joins: {}, leaves: { flooder: { metas: [expect.objectContaining({ key: 'flooder' })] } } }]
    await vi.waitFor(() => expect(watcher.frames.at(-1)).toEqual(leave), { timeout: 5000 })
    expect(Date.now() - started).toBeLessThan(2000)
  })
})
