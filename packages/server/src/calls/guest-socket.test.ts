import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FunctionSocket, SocketEvents } from '../functions/function-socket'
import type { CallsRuntime } from './calls-runtime'
import type { GuestRow } from './guest-checks-sql'
import { guestFirstMessageMs, guestSocket } from './guest-socket'
import { guestTokenPrefix, newToken } from './guest-tokens'

const token = newToken(guestTokenPrefix)
const row = (admitted: boolean | null): GuestRow => ({ id: 'g1', call: 'c1', record: { resource: 'meetings', key: '1' }, name: 'Eve', publish: ['microphone'], admitted })

const socketOf = (found: GuestRow | undefined, stillAllowed = true) => {
  const relayed: unknown[] = []
  const relay: SocketEvents = { onOpen: vi.fn(), onMessage: async (data) => void relayed.push(JSON.parse(String(data))), onClose: vi.fn() }
  const runtime = { guests: () => ({ byToken: async () => found, stillAllowed: async () => stillAllowed }), relayGuest: vi.fn(async () => relay) } as unknown as CallsRuntime
  const refused = vi.fn()
  const events = guestSocket(runtime, refused)
  const sent: unknown[] = []
  const closes: unknown[] = []
  const browser = { send: async (data: string | ArrayBuffer | Uint8Array) => void sent.push(JSON.parse(String(data))), close: (...args: unknown[]) => void closes.push(args), bufferedAmount: 0 } satisfies FunctionSocket
  void events.onOpen!(browser)
  const send = (message: object) => events.onMessage!(JSON.stringify(message), browser)
  return { events, send, sent, closes, refused, relayed, runtime }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("a guest's call socket", () => {
  it('relays a guest a member let in as that guest, from their first message on', async () => {
    const { send, relayed, runtime, closes } = socketOf(row(true))
    await send({ type: 'join', guest: token })
    await send({ type: 'publish', tracks: [{ cid: 'a', kind: 'audio', source: 'microphone' }] })
    expect(runtime.relayGuest).toHaveBeenCalledWith(row(true))
    expect(relayed).toEqual([{ type: 'join', guest: token }, { type: 'publish', tracks: [{ cid: 'a', kind: 'audio', source: 'microphone' }] }])
    expect(closes).toEqual([])
  })

  it('refuses a guest still waiting, one turned away, an unknown token and a first message without one', async () => {
    for (const [found, message] of [[row(null), { type: 'join', guest: token }], [row(false), { type: 'resume', guest: token, call: 'c1', participant: 'p', tracks: [] }], [undefined, { type: 'join', guest: token }], [row(true), { type: 'join' }], [row(true), { type: 'publish', tracks: [] }]] as const) {
      const { send, sent, closes, refused, runtime } = socketOf(found)
      await send(message)
      expect(sent).toEqual([{ type: 'left', reason: 'refused' }])
      expect(closes).toEqual([[1008, 'Not let into this call']])
      expect(refused).toHaveBeenCalledOnce()
      expect(runtime.relayGuest).not.toHaveBeenCalled()
    }
  })

  it('refuses a guest let in once, whose link was revoked or who was removed since', async () => {
    const { send, closes, runtime } = socketOf(row(true), false)
    await send({ type: 'join', guest: token })
    expect(closes).toEqual([[1008, 'Not let into this call']])
    expect(runtime.relayGuest).not.toHaveBeenCalled()
  })

  it('closes a socket that names no guest in time', () => {
    vi.useFakeTimers()
    const { closes } = socketOf(row(true))
    vi.advanceTimersByTime(guestFirstMessageMs)
    expect(closes).toEqual([[1008, 'Not let into this call']])
  })

  it('takes a guest out at the minute\'s check once they may no longer be in the call', async () => {
    let allowed = true
    const relay: SocketEvents = { onOpen: vi.fn(), onMessage: vi.fn(), onClose: vi.fn() }
    const runtime = { guests: () => ({ byToken: async () => row(true), stillAllowed: async () => allowed }), relayGuest: async () => relay } as unknown as CallsRuntime
    const events = guestSocket(runtime, vi.fn())
    const browser = { send: async () => {}, close: vi.fn(), bufferedAmount: 0 } satisfies FunctionSocket
    void events.onOpen!(browser)
    await events.recheck!()
    await events.onMessage!(JSON.stringify({ type: 'join', guest: token }), browser)
    await events.recheck!()
    allowed = false
    await expect(events.recheck!()).rejects.toMatchObject({ status: 403 })
  })
})
