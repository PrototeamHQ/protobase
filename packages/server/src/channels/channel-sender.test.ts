import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { HttpProblem } from '../problem'
import { broadcastHub } from '../realtime/broadcast-hub'
import { realtimeLimits } from '../realtime/realtime-limits'
import { buildRegistry } from '../registry'
import { channelSender } from './channel-sender'
import { unpackSent } from './sent'

const registry = buildRegistry([resource('rooms').table('rooms').fields({ id: f.integer() }).primaryKey((r) => r.id)])

// A sender and what a member of room 1 hears.
const setup = () => {
  const hub = broadcastHub()
  const heard: Array<{ event: string; sent: ReturnType<typeof unpackSent> }> = []
  hub.join('rooms/1', { self: false, private: false, receive: (event, payload) => heard.push({ event, sent: unpackSent(payload) }) })
  return { sender: channelSender(registry, hub), heard }
}

const codeOf = async (sending: Promise<void>) => {
  const error = await sending.then(() => undefined, (caught: unknown) => caught)
  return error instanceof HttpProblem ? [error.status, error.slug] : error
}

describe('channelSender', () => {
  it('broadcasts bytes as the server, an ArrayBuffer or only the bytes a typed array covers', async () => {
    const { sender, heard } = setup()
    await sender.broadcast({ resource: 'rooms', key: '1', event: 'chunk', payload: new Uint8Array([1, 2, 3]).buffer })
    await sender.broadcast({ resource: 'rooms', key: '1', event: 'chunk', payload: new Uint8Array([0, 4, 5, 0]).subarray(1, 3) })
    await sender.broadcast({ resource: 'rooms', key: '1', event: 'json', payload: { a: 1 } })
    expect(heard.map(({ event, sent }) => ({ event, ...sent, payload: sent.payload instanceof ArrayBuffer ? [...new Uint8Array(sent.payload)] : sent.payload }))).toEqual([
      { event: 'chunk', user: null, server: true, payload: [1, 2, 3] },
      { event: 'chunk', user: null, server: true, payload: [4, 5] },
      { event: 'json', user: null, server: true, payload: { a: 1 } },
    ])
  })

  it('refuses bytes over a frame with the same problem as JSON over it, and an unknown record', async () => {
    const { sender, heard } = setup()
    const tooMany = new Uint8Array(realtimeLimits.maxFrameBytes + 1)
    const bytes = await codeOf(sender.broadcast({ resource: 'rooms', key: '1', event: 'e', payload: tooMany }))
    const json = await codeOf(sender.broadcast({ resource: 'rooms', key: '1', event: 'e', payload: 'x'.repeat(realtimeLimits.maxFrameBytes) }))
    expect(bytes).toEqual([422, 'invalid-payload'])
    expect(json).toEqual(bytes)
    await sender.broadcast({ resource: 'rooms', key: '1', event: 'e', payload: new Uint8Array(realtimeLimits.maxFrameBytes) })
    expect(await codeOf(sender.broadcast({ resource: 'notes', key: '1', event: 'e', payload: new Uint8Array(1) }))).toEqual([404, expect.any(String)])
    expect(heard).toHaveLength(1)
  })
})
