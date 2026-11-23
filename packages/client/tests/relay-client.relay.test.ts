import { spawn, type ChildProcess } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { relayClient } from '../src/relay/relay-client'
import type { RelaySocketLike } from '../src/relay/relay-socket'
import type { RelayEvent, RelayNotice } from '../src/relay/relay-types'
import { realtimeBinary } from '../../../test-support/realtime-binary'

// The client's relay against a real relay process: one socket per client joining the channels its ticket lists, a
// declared typing event from one person to another, the app's notices, a new ticket and one resync after a drop, and a
// channel the person was added to, joined as the app tells them on `people`.
// The relay is the Protobase Realtime release protobase dev runs (test-support/realtime-binary.ts). The tickets are
// signed here, as the app's ticket endpoint signs them.
vi.setConfig({ testTimeout: 20_000, hookTimeout: 30_000 })

const keys = { api: 'client-test-api-key-0123456789abcdef', ticket: 'client-test-ticket-key-0123456789abc' }
const typing = { schema: { type: 'object', properties: { typing: { type: 'boolean' } }, required: ['typing'] }, max_bytes: 64, per_second: 5, burst: 10 }

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url')

// An HS256 ticket for the person, listing their channels, as the app signs one.
const signTicket = (user: string, channels: string[]) => {
  const head = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify({ iss: 'chat', sub: user, sid: `session-${user}`, jti: randomUUID(), exp: Math.floor(Date.now() / 1000) + 60, channels }))
  return `${head}.${body}.${base64url(createHmac('sha256', keys.ticket).update(`${head}.${body}`).digest())}`
}

describe('the client relay with a real relay', () => {
  let relay: ChildProcess
  let dir: string
  let url: string
  const stops: Array<() => void> = []

  // A person's client, with every socket it opened, so a test can drop one.
  const person = (user: string, channels: string[]) => {
    const sockets: WebSocket[] = []
    const ticket = vi.fn(async () => ({ ticket: signTicket(user, channels), url: `${url.replace(/^http/, 'ws')}/socket`, channels }))
    const client = relayClient({
      ticket,
      socket: (address) => {
        const socket = new WebSocket(address)
        sockets.push(socket)
        return socket as unknown as RelaySocketLike
      },
      retryDelay: () => 100,
      final: () => false,
    })
    const heard = { notices: [] as RelayNotice[], events: [] as RelayEvent[], resyncs: 0, joined: [] as string[] }
    stops.push(
      client.follow({
        onNotice: (notice) => heard.notices.push(notice),
        onEvent: (event) => heard.events.push(event),
        onResync: () => void (heard.resyncs += 1),
        onJoined: (channel) => void heard.joined.push(channel),
      }),
    )
    return { client, heard, ticket, sockets }
  }

  const command = (route: string, body: Record<string, unknown>) =>
    fetch(`${url}/apps/chat/${route}`, { method: 'POST', headers: { authorization: `Bearer ${keys.api}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const publish = (body: Record<string, unknown>) => command('publish', body)

  beforeAll(async () => {
    const port = await freePort()
    url = `http://127.0.0.1:${port}`
    dir = await mkdtemp(path.join(tmpdir(), 'relay-client-test-'))
    const app = { id: 'chat', api_keys: [keys.api], ticket_keys: [keys.ticket], origins: [], client_events: { channels: { conversations: { events: { typing } } } }, limits: { connections: 100, channels_per_ticket: 200, request_bytes: 65536 } }
    await writeFile(path.join(dir, 'apps.json'), JSON.stringify({ apps: [app] }))
    relay = spawn(await realtimeBinary(), [], { env: { PROTOBASE_REALTIME_APPS_FILE: path.join(dir, 'apps.json'), PROTOBASE_REALTIME_ADDR: `127.0.0.1:${port}` }, stdio: 'ignore' })
    await vi.waitFor(async () => expect((await publish({}).catch(() => undefined))?.status).toBe(400), { timeout: 10_000, interval: 100 })
  })

  afterAll(async () => {
    for (const stop of stops.splice(0)) stop()
    relay?.kill()
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it("carries one person's typing to the other's client, refuses an undeclared event, and hands on the app's notices", async () => {
    const alice = person('alice', ['conversations/1'])
    const bob = person('bob', ['conversations/1'])
    await vi.waitFor(() => expect(alice.client.joined('conversations/1') && bob.client.joined('conversations/1') && alice.client.joined('relay')).toBe(true))

    await alice.client.send('conversations/1', 'typing', { typing: true })
    await vi.waitFor(() => expect(bob.heard.events).toEqual([expect.objectContaining({ event: 'typing', channel: 'conversations/1', from: expect.objectContaining({ user: 'alice' }), payload: { typing: true } })]))
    // The sender's own socket hears nothing of its own.
    expect(alice.heard.events).toEqual([])
    await expect(alice.client.send('conversations/1', 'shout', {})).rejects.toMatchObject({ reason: 'event_not_allowed' })

    const notice = { kind: 'create', resource: 'messages', key: '42', channel: 'conversations/1' }
    expect((await publish({ id: randomUUID(), channel: 'conversations/1', event: 'change', payload: notice })).status).toBe(200)
    await vi.waitFor(() => expect(bob.heard.notices).toEqual([notice]))
  })

  it('connects again with a new ticket after its socket drops, joins its channels again and resyncs once', async () => {
    const carol = person('carol', ['conversations/2'])
    await vi.waitFor(() => expect(carol.client.joined('conversations/2')).toBe(true))
    carol.sockets[0]!.close()
    await vi.waitFor(() => expect(carol.heard.resyncs).toBe(1))
    await vi.waitFor(() => expect(carol.client.joined('conversations/2')).toBe(true))
    expect(carol.ticket).toHaveBeenCalledTimes(2)

    const notice = { kind: 'update', resource: 'messages', key: '7', channel: 'conversations/2' }
    await publish({ id: randomUUID(), channel: 'conversations/2', event: 'change', payload: notice })
    await vi.waitFor(() => expect(carol.heard.notices).toEqual([notice]))
  })

  it('joins a channel the person was added to once the app tells them on people, and hears its notices', async () => {
    const dave = person('dave', ['people'])
    await vi.waitFor(() => expect(dave.client.joined('people')).toBe(true))
    // As the app does when a members record adds them: allow the channel on their sockets, then tell them alone.
    expect((await command('channels/add', { channel: 'conversations/3', users: ['dave'] })).status).toBe(200)
    expect((await publish({ id: randomUUID(), channel: 'people', users: ['dave'], event: 'joined', payload: { channel: 'conversations/3' } })).status).toBe(200)
    await vi.waitFor(() => expect(dave.heard.joined).toEqual(['conversations/3']))
    expect(dave.client.joined('conversations/3')).toBe(true)

    const notice = { kind: 'create', resource: 'messages', key: '9', channel: 'conversations/3' }
    await publish({ id: randomUUID(), channel: 'conversations/3', event: 'change', payload: notice })
    await vi.waitFor(() => expect(dave.heard.notices).toEqual([notice]))
  })
})
