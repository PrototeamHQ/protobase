import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import { Hono } from 'hono'
import { createRequire } from 'node:module'
import net, { type AddressInfo } from 'node:net'
import path from 'node:path'
import { capSocketMessages, realtimeLimits } from '@protobase/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer as BareWebSocketServer } from 'ws'
import { apiWebSocketServer, maxPayloadOf } from './api-websocket-server'

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

// A route for realtime's socket and one for a function's, which record the bytes of each message they are sent. The
// function `small` caps its messages at 1024 bytes, and `slow` does too after 100 ms; `?cap=` caps any socket with
// `capSocketMessages`, and `?raw=` writes a number under the cap's symbol as it is.
const serveApi = async () => {
  const received: Record<'realtime' | 'function', number[]> = { realtime: [], function: [] }
  const record = (kind: 'realtime' | 'function') =>
    upgradeWebSocket(() => ({ onMessage: (event) => void received[kind].push(typeof event.data === 'string' ? Buffer.byteLength(event.data) : (event.data as ArrayBuffer).byteLength) }))
  const app = new Hono<{ Bindings: { incoming: Record<symbol, unknown> } }>()
    .use(async (c, next) => {
      const cap = c.req.query('cap')
      const raw = c.req.query('raw')
      if (cap !== undefined) capSocketMessages(c.env.incoming, Number(cap))
      if (raw !== undefined) c.env.incoming[Symbol.for('protobase.socketMessageCap')] = Number(raw)
      if (c.req.path === '/api/functions/slow') await new Promise((resolve) => setTimeout(resolve, 100))
      if (c.req.path === '/api/functions/small' || c.req.path === '/api/functions/slow') capSocketMessages(c.env.incoming, 1024)
      await next()
    })
    .get('/api/sb/realtime/v1/websocket', record('realtime'))
    .get('/api/functions/:name', record('function'))
    .get('/health', (c) => c.text('ok'))
  const http = createAdaptorServer({ fetch: app.fetch, websocket: { server: apiWebSocketServer() } })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => http.close())
  return { received, port: (http.address() as AddressInfo).port }
}

const connectTo = async (port: number, target: string) => {
  const client = new WebSocket(`ws://127.0.0.1:${port}${target}`)
  cleanups.push(() => client.terminate())
  await new Promise((resolve) => client.once('open', resolve))
  return client
}

const upgradeRequest = (target: string) =>
  `GET ${target} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`

// A masked frame (the mask is zero, so the payload is sent as it is) announcing `length` bytes, with `payload` bytes
// of them: a header only unless given.
const frame = (opcode: number, fin: boolean, length: number, payload = 0) => {
  const header = Buffer.alloc(14)
  header[0] = (fin ? 0x80 : 0) | opcode
  header[1] = 0x80 | 127
  header.writeBigUInt64BE(BigInt(length), 2)
  return Buffer.concat([header, Buffer.alloc(payload, 'x')])
}

// Upgrades at `target` over a raw socket, sends `frames` once it is upgraded, or with the upgrade request in one write
// when `early`, and resolves with the code of the close frame the server answers with.
const closeCodeOfRawFrames = (port: number, target: string, frames: Buffer[], early = false) =>
  new Promise<number>((resolve, reject) => {
    const client = net.connect(port, '127.0.0.1')
    cleanups.push(() => client.destroy())
    client.write(early ? Buffer.concat([Buffer.from(upgradeRequest(target)), ...frames]) : upgradeRequest(target))
    let data = Buffer.alloc(0)
    let sent = early
    client.on('data', (chunk) => {
      data = Buffer.concat([data, chunk])
      const end = data.indexOf('\r\n\r\n')
      if (end === -1) return
      if (!data.subarray(0, end).toString().startsWith('HTTP/1.1 101')) return reject(new Error(data.subarray(0, end).toString()))
      if (!sent) {
        sent = true
        frames.forEach((each) => client.write(each))
      }
      const reply = data.subarray(end + 4)
      if (reply.length >= 4 && reply[0] === 0x88) resolve(reply.readUInt16BE(2))
    })
  })

// The header of a text frame of `length` bytes, sent once upgraded at `target`: the code the server closes with.
const closeCodeOfRawFrame = (port: number, target: string, length: number) => closeCodeOfRawFrames(port, target, [frame(1, true, length)])

describe('maxPayloadOf', () => {
  it.each([
    ['/api/functions/echo', 100 * 1024 * 1024],
    ['/api/functions/echo/more?token=x', 100 * 1024 * 1024],
    ['http://x/api/functions/echo', 100 * 1024 * 1024],
    ['/api/sb/realtime/v1/websocket?apikey=x&vsn=1.0.0', realtimeLimits.maxFrameBytes],
    ['/api/functions/../sb/realtime/v1/websocket', realtimeLimits.maxFrameBytes],
    ['/api/functions/%2e%2e/sb/realtime/v1/websocket', realtimeLimits.maxFrameBytes],
    ['/api/%66unctions/echo', realtimeLimits.maxFrameBytes],
    ['/api/functions', realtimeLimits.maxFrameBytes],
    ['http://[', realtimeLimits.maxFrameBytes],
    ['', realtimeLimits.maxFrameBytes],
  ])('gives %s a cap of %i bytes', (url, cap) => {
    expect(maxPayloadOf(url)).toBe(cap)
  })
})

describe('apiWebSocketServer', () => {
  it('lets a function socket carry 1 MiB while a realtime socket opened after it still closes over its cap', async () => {
    const { received, port } = await serveApi()
    const fn = await connectTo(port, '/api/functions/echo')
    const realtime = await connectTo(port, '/api/sb/realtime/v1/websocket?apikey=x&vsn=1.0.0')
    fn.send(new Uint8Array(1 << 20))
    await vi.waitFor(() => expect(received.function).toEqual([1 << 20]))

    const closed = new Promise((resolve) => realtime.once('close', resolve))
    realtime.send('x'.repeat(realtimeLimits.maxFrameBytes + 1))
    expect(await closed).toBe(1009)
    expect(received.realtime).toEqual([])
  })

  it.each(['http://localhost/api/sb/realtime/v1/websocket', '/api/sb/%72ealtime/v1/websocket', '/api/functions/../sb/realtime/v1/websocket', '/api/functions/%2e%2e/sb/realtime/v1/websocket'])(
    'closes a realtime socket upgraded at %s with 1009 for a frame over its cap',
    async (target) => {
      const { received, port } = await serveApi()
      expect(await closeCodeOfRawFrame(port, target, realtimeLimits.maxFrameBytes + 1)).toBe(1009)
      expect(received).toEqual({ realtime: [], function: [] })
    },
  )

  it('takes a message of a function\'s own cap and closes with 1009 for a larger one before it is read', async () => {
    const { received, port } = await serveApi()
    const fits = await connectTo(port, '/api/functions/small')
    fits.send(new Uint8Array(1024))
    await vi.waitFor(() => expect(received.function).toEqual([1024]))

    const over = await connectTo(port, '/api/functions/small')
    const closed = new Promise((resolve) => over.once('close', resolve))
    over.send(new Uint8Array(1025))
    expect(await closed).toBe(1009)
    expect(await closeCodeOfRawFrame(port, '/api/functions/small', 1025)).toBe(1009)
    expect(received.function).toEqual([1024])
  })

  it('counts every fragment of a message toward the cap', async () => {
    const { received, port } = await serveApi()
    const code = closeCodeOfRawFrames(port, '/api/functions/small', [frame(1, false, 512, 512), frame(0, true, 512, 512), frame(1, false, 512, 512), frame(0, true, 513)])
    expect(await code).toBe(1009)
    expect(received.function).toEqual([1024])
  })

  it('caps a socket whose frame came with the upgrade request, while its function was still deciding', async () => {
    const { received, port } = await serveApi()
    expect(await closeCodeOfRawFrames(port, '/api/functions/slow', [frame(1, true, 1025, 1025)], true)).toBe(1009)
    expect(received.function).toEqual([])
  })

  it('gives the next socket its own cap, not the one before\'s', async () => {
    const { received, port } = await serveApi()
    await connectTo(port, '/api/functions/small')
    const after = await connectTo(port, '/api/functions/echo')
    after.send(new Uint8Array(1 << 20))
    await vi.waitFor(() => expect(received.function).toEqual([1 << 20]))
  })

  it('gives each socket upgraded in the same tick its own cap', async () => {
    const { received, port } = await serveApi()
    const [small, echo, realtime] = await Promise.all([connectTo(port, '/api/functions/small'), connectTo(port, '/api/functions/echo'), connectTo(port, '/api/sb/realtime/v1/websocket')])
    const closes = [small, realtime].map((client) => new Promise((resolve) => client.once('close', resolve)))
    small.send(new Uint8Array(1025))
    echo.send(new Uint8Array(1 << 20))
    realtime.send(new Uint8Array(realtimeLimits.maxFrameBytes + 1))
    expect(await Promise.all(closes)).toEqual([1009, 1009])
    await vi.waitFor(() => expect(received.function).toEqual([1 << 20]))
    expect(received.realtime).toEqual([])
  })

  it.each(['/api/functions/big?cap=2147483648', '/api/functions/big?cap=4294967296', '/api/functions/big?raw=0', '/api/functions/big?raw=NaN', '/api/functions/big?raw=-1'])(
    'never lifts a function socket\'s 100 MiB limit at %s',
    async (target) => {
      const { port } = await serveApi()
      expect(await closeCodeOfRawFrame(port, target, 100 * 1024 * 1024 + 1)).toBe(1009)
    },
  )

  it('never raises realtime\'s cap', async () => {
    const { received, port } = await serveApi()
    expect(await closeCodeOfRawFrame(port, '/api/sb/realtime/v1/websocket?cap=4294967296', realtimeLimits.maxFrameBytes + 1)).toBe(1009)
    expect(received.realtime).toEqual([])
  })

  it('keeps other sockets and the server up while many capped sockets close', async () => {
    const errors: unknown[] = []
    const record = (error: unknown) => errors.push(error)
    process.on('uncaughtException', record).on('unhandledRejection', record)
    cleanups.push(() => process.off('uncaughtException', record).off('unhandledRejection', record))
    const { received, port } = await serveApi()
    const held = await connectTo(port, '/api/functions/small')
    for (let n = 0; n < 50; n++) {
      const client = await connectTo(port, '/api/functions/small')
      const closed = new Promise((resolve) => client.once('close', resolve))
      client.send(new Uint8Array(1025))
      expect(await closed).toBe(1009)
    }
    held.send(new Uint8Array(1024))
    await vi.waitFor(() => expect(received.function).toEqual([1024]))
    expect(held.readyState).toBe(WebSocket.OPEN)
    expect(await (await fetch(`http://127.0.0.1:${port}/health`)).text()).toBe('ok')
    expect(errors).toEqual([])
  })

  it('takes a frame of the cap and closes with 1009 for a larger one before the route reads it', async () => {
    const { received, raws, port } = await serve(apiWebSocketServer())
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
    const { port } = await serve(apiWebSocketServer(), async (send, raw) => {
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
