import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { broadcastHub } from '../realtime/broadcast-hub'
import { presenceHub } from '../realtime/presence-hub'
import { realtimeLimits } from '../realtime/realtime-limits'
import { buildRegistry } from '../registry'
import type { Session } from '../types'
import { decodeBinaryFrame, encodeBinaryFrame } from './binary-frame'
import { channelRecord, type ChannelRecord } from './channel-name'
import { channelSocket } from './channel-socket'

const registry = buildRegistry([resource('rooms').table('rooms').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id)])

// Carol may not read room 1.
const readable = async (session: Session, record: ChannelRecord) => !(session.user.id === 'carol' && record.name === 'rooms/1')

type Frame = Record<string, unknown>

// A connection whose frames are kept as they were sent: text as its message, binary as its header and bytes.
const connect = (user: string, hubs: { broadcasts: ReturnType<typeof broadcastHub>; presences: ReturnType<typeof presenceHub> }) => {
  const text: Frame[] = []
  const binary: Array<{ header: Frame; bytes: number[] }> = []
  const close = vi.fn()
  const socket = channelSocket({
    send: (frame) => {
      if (typeof frame === 'string') return void text.push(JSON.parse(frame) as Frame)
      const { header, bytes } = decodeBinaryFrame(frame)!
      binary.push({ header, bytes: [...new Uint8Array(bytes)] })
    },
    buffered: () => 0,
    close,
    session: { user: { id: user, roles: ['member'] } },
    reauthenticate: async () => ({ user: { id: user, roles: ['member'] } }),
    record: (resourceName, key) => channelRecord(registry, resourceName, key),
    readable,
    ...hubs,
    report: (error) => {
      throw error
    },
  })
  const settle = () => vi.advanceTimersByTimeAsync(0)
  const join = async (key = '1') => {
    socket.message(JSON.stringify({ type: 'join', ref: 'j', resource: 'rooms', key }))
    await settle()
  }
  const sendBytes = async (header: Frame, bytes: number[]) => {
    socket.message(encodeBinaryFrame(header, new Uint8Array(bytes).buffer))
    await settle()
  }
  return { text, binary, close, join, sendBytes }
}

const trio = () => {
  const hubs = { broadcasts: broadcastHub(), presences: presenceHub() }
  return [connect('alice', hubs), connect('bob', hubs), connect('carol', hubs)] as const
}

beforeEach(() => void vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('channelSocket binary broadcasts', () => {
  it('sends the same bytes to the others as a binary frame, with the sender\'s user whatever the header names', async () => {
    const [alice, bob] = trio()
    await alice.join()
    await bob.join()
    await alice.sendBytes({ type: 'send', channel: 'rooms/1', event: 'stroke', user: 'bob' }, [0, 1, 254, 255])
    expect(bob.binary).toEqual([{ header: { type: 'broadcast', channel: 'rooms/1', event: 'stroke', user: 'alice' }, bytes: [0, 1, 254, 255] }])
    expect(alice.binary).toEqual([])
    expect(alice.text.filter((frame) => frame.type === 'reply' && frame.ref !== 'j')).toEqual([])
  })

  it('hears its own with self and acknowledges with ack', async () => {
    const [alice, bob] = trio()
    await alice.join()
    await bob.join()
    await alice.sendBytes({ type: 'send', ref: 's', channel: 'rooms/1', event: 'audio', self: true, ack: true }, [7])
    expect(alice.binary).toEqual([{ header: { type: 'broadcast', channel: 'rooms/1', event: 'audio', user: 'alice' }, bytes: [7] }])
    expect(alice.text.at(-1)).toEqual({ type: 'reply', ref: 's', ok: true })
    expect(bob.binary).toHaveLength(1)
  })

  it('closes with 1009 for a binary frame over the cap, as for a text one', async () => {
    const [alice] = trio()
    await alice.join()
    await alice.sendBytes({ type: 'send', channel: 'rooms/1', event: 'e' }, Array.from({ length: realtimeLimits.maxFrameBytes }, () => 1))
    expect(alice.close).toHaveBeenCalledWith(1009)
  })

  it('gives nothing to someone who may not read the record', async () => {
    const [alice, , carol] = trio()
    await alice.join()
    await carol.join()
    expect(carol.text).toEqual([{ type: 'reply', ref: 'j', ok: false, error: { code: 'not-found', message: 'There is no such record' } }])
    await carol.sendBytes({ type: 'send', ref: 's', channel: 'rooms/1', event: 'e', ack: true }, [1])
    await alice.sendBytes({ type: 'send', channel: 'rooms/1', event: 'e' }, [1])
    expect(carol.binary).toEqual([])
    expect(alice.binary).toEqual([])
    expect(carol.text.at(-1)).toMatchObject({ ref: 's', ok: false, error: { code: 'not-joined' } })
  })

  it('refuses a binary frame that is no send of bytes', async () => {
    const [alice] = trio()
    await alice.join()
    await alice.sendBytes({ type: 'join', resource: 'rooms', key: '2' }, [])
    await alice.sendBytes({ type: 'send', channel: 'rooms/1', event: 'e', payload: 1 }, [1])
    alice.text.splice(0, 2)
    expect(alice.text.map((frame) => (frame.error as Frame).code)).toEqual(['invalid-message', 'invalid-message'])
  })
})
