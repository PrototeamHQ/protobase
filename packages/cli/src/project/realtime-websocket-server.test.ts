import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import { Hono } from 'hono'
import { createRequire } from 'node:module'
import net, { type AddressInfo } from 'node:net'
import path from 'node:path'
import { realtimeLimits } from '@protobase/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer as BareWebSocketServer } from 'ws'
import { realtimeWebSocketServer } from './realtime-websocket-server'

const require = createRequire(import.meta.url)
const { WebSocket } = require(path.join(path.dirname(require.resolve('ws/package.json')), 'index.js')) as typeof import('ws')

type Raw = { bufferedAmount: number; _sender?: unknown; _socket?: unknown }

// What realtime's guard reads (`bufferedOf`): npm ws's sender and socket.
const isNpmWs = (raw: Raw) => typeof raw._sender === 'object' && raw._sender !== null && typeof raw._socket === 'object' && raw._socket !== null

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

// A route that records what it is sent and its raw socket, served on the given ws server, and on open runs `onOpen`.
const serve = async (server: InstanceType<typeof BareWebSocketServer>, onOpen: (send: (frame: ArrayBuffer) => void, raw: Raw) => Promise<void> | void = () => {}) => {
  const received: number[] = []
  const raws: Raw[] = []
  const app = new Hono().get(
    '/ws',
    upgradeWebSocket(() => ({
      onOpen: (_event, ws) => {
        const raw = ws.raw as unknown as Raw
        raws.push(raw)
        return onOpen((frame) => ws.send(frame), raw)
      },
      onMessage: (event) => {
        received.push(typeof event.data === 'string' ? Buffer.byteLength(event.data) : (event.data as ArrayBuffer).byteLength)
      },
    })),
  )
  const http = createAdaptorServer({ fetch: app.fetch, websocket: { server } })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => http.close())
  return { received, raws, port: (http.address() as AddressInfo).port }
}

const connect = async (port: number) => {
  const client = new WebSocket(`ws://127.0.0.1:${port}/ws`)
  cleanups.push(() => client.terminate())
  await new Promise((resolve) => client.once('open', resolve))
  return client
}

describe('realtimeWebSocketServer', () => {
  it('takes a frame of the cap and closes with 1009 for a larger one before the route reads it', async () => {
    const { received, raws, port } = await serve(realtimeWebSocketServer())
    const fits = await connect(port)
    fits.send('x'.repeat(realtimeLimits.maxFrameBytes))
    await vi.waitFor(() => expect(received).toEqual([realtimeLimits.maxFrameBytes]))

    const over = await connect(port)
    const closed = new Promise((resolve) => over.once('close', resolve))
    over.send('x'.repeat(realtimeLimits.maxFrameBytes + 1))
    expect(await closed).toBe(1009)
    expect(received).toEqual([realtimeLimits.maxFrameBytes])
    expect(raws.map(isNpmWs)).toEqual([true, true])
  })

  it('counts the unsent bytes of a client that stops reading', async () => {
    const amounts: number[] = []
    let done: () => void
    const finished = new Promise<void>((resolve) => (done = resolve))
    const { port } = await serve(realtimeWebSocketServer(), async (send, raw) => {
      for (let n = 0; n < 64; n++) {
        send(new ArrayBuffer(256 * 1024))
        amounts.push(raw.bufferedAmount)
        await new Promise((resolve) => setTimeout(resolve, 2))
      }
      done()
    })
    // A raw client that does the handshake and then reads nothing more.
    const client = net.connect(port, '127.0.0.1')
    cleanups.push(() => client.destroy())
    client.write(`GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`)
    client.once('data', () => client.pause())
    await finished
    expect(Math.max(...amounts)).toBeGreaterThan(realtimeLimits.maxUnsentBytes)
  })

  it.runIf(process.versions.bun !== undefined)('hands realtime no socket of Bun\'s ws shim, which a bare import gives', async () => {
    const { raws, port } = await serve(new BareWebSocketServer({ noServer: true }))
    await connect(port)
    await vi.waitFor(() => expect(raws).toHaveLength(1))
    expect(isNpmWs(raws[0]!)).toBe(false)
  })
})
