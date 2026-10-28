import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pingMs, type SocketLike } from './channel-connection'
import type { PresenceEntry, ServerMessage } from './channel-types'
import { channelsClient } from './channels'

// A server end of the sockets the client opens: what each was sent, and a way to answer.
const fakeServer = () => {
  const sockets: Array<SocketLike & { sent: Record<string, unknown>[]; protocols: string[]; reply: (message: ServerMessage) => void; drop: () => void; opened: () => void }> = []
  const open = (_url: string, protocols: string[]) => {
    const socket = {
      readyState: 0,
      sent: [] as Record<string, unknown>[],
      protocols,
      onopen: null as SocketLike['onopen'],
      onmessage: null as SocketLike['onmessage'],
      onclose: null as SocketLike['onclose'],
      send: (data: string) => void socket.sent.push(JSON.parse(data) as Record<string, unknown>),
      close: vi.fn(() => socket.drop()),
      reply: (message: ServerMessage) => socket.onmessage?.({ data: JSON.stringify(message) }),
      drop: () => {
        if (socket.readyState === 3) return
        socket.readyState = 3
        socket.onclose?.({})
      },
      opened: () => {
        socket.readyState = 1
        socket.onopen?.({})
      },
    }
    sockets.push(socket)
    return socket
  }
  return { sockets, open }
}

const entry = (id: string, user: string, state: unknown): PresenceEntry => ({ id, user, state })

const setup = (token?: () => Promise<string | undefined>) => {
  const server = fakeServer()
  const client = channelsClient({ url: () => 'ws://app.test/api/channels', socket: server.open, retryDelay: () => 1000, ...(token && { token }) })
  const socket = () => server.sockets.at(-1)!
  // Opens the latest socket and answers its joins with the channels' names.
  const openAndJoin = async () => {
    await vi.advanceTimersByTimeAsync(0)
    socket().opened()
    for (const message of socket().sent.filter((sent) => sent.type === 'join')) socket().reply({ type: 'reply', ref: message.ref as string, ok: true, channel: `${message.resource as string}/${message.key as string}` })
    await vi.advanceTimersByTimeAsync(0)
  }
  return { server, client, socket, openAndJoin }
}

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

describe('channelsClient', () => {
  it('joins on one socket, keeps the presence from its whole and its diffs, and tracks a state set before joining', async () => {
    const { client, socket, openAndJoin, server } = setup()
    const room = client.channel('rooms', 1)
    const other = client.channel('rooms', 2)
    const seen: Array<[PresenceEntry[], unknown]> = []
    room.onPresence((entries, change) => seen.push([entries, change]))
    const tracked = room.track({ status: 'online' })
    await openAndJoin()
    await tracked
    expect(server.sockets).toHaveLength(1)
    expect(room.status()).toEqual({ state: 'joined' })
    expect(other.status()).toEqual({ state: 'joined' })
    expect(socket().sent.find((sent) => sent.type === 'track')).toMatchObject({ channel: 'rooms/1', state: { status: 'online' } })

    socket().reply({ type: 'presence', channel: 'rooms/1', entries: [entry('a', 'alice', 1)] })
    socket().reply({ type: 'presence_diff', channel: 'rooms/1', joins: [entry('b', 'bob', 1)], updates: [entry('a', 'alice', 2)], leaves: [] })
    socket().reply({ type: 'presence_diff', channel: 'rooms/1', joins: [], updates: [], leaves: [entry('b', 'bob', 1)] })
    expect(room.presence()).toEqual([entry('a', 'alice', 2)])
    expect(seen.map(([entries]) => entries.length)).toEqual([1, 2, 1])
    expect(seen[1]![1]).toEqual({ joins: [entry('b', 'bob', 1)], updates: [entry('a', 'alice', 2)], leaves: [] })
    expect(other.presence()).toEqual([])
  })

  it('hears broadcasts by event, sends with self and ack, and resolves an acked send on its reply', async () => {
    const { client, socket, openAndJoin } = setup()
    const room = client.channel('rooms', 1)
    await expect(room.send('typing', {})).rejects.toMatchObject({ code: 'not-joined' })
    await openAndJoin()
    const heard: unknown[] = []
    room.on('typing', (message) => heard.push(message))
    socket().reply({ type: 'broadcast', channel: 'rooms/1', event: 'typing', payload: { on: true }, user: 'bob' })
    socket().reply({ type: 'broadcast', channel: 'rooms/1', event: 'other', payload: {}, user: 'bob' })
    socket().reply({ type: 'broadcast', channel: 'rooms/1', event: 'typing', payload: 1, user: null, server: true })
    expect(heard).toEqual([{ event: 'typing', payload: { on: true }, user: 'bob' }, { event: 'typing', payload: 1, user: null, server: true }])

    await room.send('typing', { on: false }, { self: true })
    expect(socket().sent.at(-1)).toEqual({ type: 'send', channel: 'rooms/1', event: 'typing', payload: { on: false }, self: true })
    const acked = room.send('typing', 1, { ack: true })
    const sent = socket().sent.at(-1)!
    expect(sent).toMatchObject({ ack: true, ref: expect.any(String) })
    socket().reply({ type: 'reply', ref: sent.ref as string, ok: true })
    await expect(acked).resolves.toBeUndefined()
    const refused = room.send('typing', 1, { ack: true })
    socket().reply({ type: 'reply', ref: socket().sent.at(-1)!.ref as string, ok: false, error: { code: 'channel-too-busy', message: 'Too many' } })
    await expect(refused).rejects.toMatchObject({ code: 'channel-too-busy' })
  })

  it('tells a refused join and a channel the server closed by their status', async () => {
    const { client, socket } = setup()
    const hidden = client.channel('rooms', 9)
    const room = client.channel('rooms', 1)
    const statuses: string[] = []
    room.onStatus((status) => statuses.push(status.state))
    await vi.advanceTimersByTimeAsync(0)
    socket().opened()
    const [first, second] = socket().sent
    socket().reply({ type: 'reply', ref: first!.ref as string, ok: false, error: { code: 'not-found', message: 'There is no such record' } })
    socket().reply({ type: 'reply', ref: second!.ref as string, ok: true, channel: 'rooms/1' })
    await vi.advanceTimersByTimeAsync(0)
    expect(hidden.status()).toEqual({ state: 'refused', error: { code: 'not-found', message: 'There is no such record' } })
    socket().reply({ type: 'presence', channel: 'rooms/1', entries: [entry('a', 'alice', 1)] })
    socket().reply({ type: 'closed', channel: 'rooms/1', error: { code: 'not-found', message: 'There is no such record' } })
    expect(room.status()).toMatchObject({ state: 'closed' })
    expect(room.presence()).toEqual([])
    expect(statuses).toEqual(['joined', 'closed'])
  })

  it('joins again and tracks again after a drop, and drops a socket that answers no ping', async () => {
    const { client, socket, openAndJoin, server } = setup()
    const room = client.channel('rooms', 1)
    await room.track({ status: 'online' })
    await openAndJoin()
    socket().drop()
    expect(room.status()).toEqual({ state: 'joining' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(server.sockets).toHaveLength(2)
    await openAndJoin()
    expect(room.status()).toEqual({ state: 'joined' })
    expect(socket().sent.map((sent) => sent.type)).toEqual(['join', 'track'])

    await vi.advanceTimersByTimeAsync(3 * pingMs)
    expect(socket().sent.filter((sent) => sent.type === 'ping').length).toBeGreaterThan(0)
    expect(socket().close).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(server.sockets).toHaveLength(3)
  })

  it('shares a channel between its holders, and closes the socket after the last channel is left', async () => {
    const { client, socket, openAndJoin } = setup()
    const first = client.channel('rooms', 1)
    const second = client.channel('rooms', 1)
    await openAndJoin()
    expect(socket().sent.filter((sent) => sent.type === 'join')).toHaveLength(1)
    first.leave()
    expect(socket().sent.some((sent) => sent.type === 'leave')).toBe(false)
    second.leave()
    expect(socket().sent.at(-1)).toEqual({ type: 'leave', channel: 'rooms/1' })
    expect(socket().close).toHaveBeenCalledWith(1000)
  })

  it('offers its token as a subprotocol, and hands over a new one as it changes', async () => {
    let token = 'one'
    const { client, socket, openAndJoin } = setup(async () => token)
    client.channel('rooms', 1)
    await openAndJoin()
    expect(socket().protocols).toEqual(['protobase.channels', 'bearer.one'])
    token = 'two'
    socket().reply({ type: 'pong' })
    await vi.advanceTimersByTimeAsync(pingMs)
    expect(socket().sent.filter((sent) => sent.type === 'token')).toEqual([{ type: 'token', token: 'two' }])
  })
})
