import type { ProtobaseConfig } from '@protobase/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stopDevRelay, withDevRelay } from './dev-relay'
import { startRelay } from './relay-process'

vi.mock('./relay-binary', () => ({ relayBinary: async () => '/bin/relay' }))
vi.mock('./relay-process', async (actual) => ({ ...(await actual<typeof import('./relay-process')>()), freePort: async () => 4100, startRelay: vi.fn() }))

const started = vi.mocked(startRelay)
const stop = vi.fn(async () => undefined)
const devUrl = 'http://localhost:5173'
const relay = { app: 'chat', channels: { conversations: {} } }
// As `url: env.RELAY_URL!` and the keys read with RELAY_URL and the keys unset.
const unset = { url: undefined!, apiKey: undefined!, ticketKey: undefined! }
const config = (fields: object = {}): ProtobaseConfig => ({ realtime: { relay: { ...unset, ...relay, ...fields } } })

describe('withDevRelay', () => {
  beforeEach(() => {
    started.mockResolvedValue({ stop })
  })

  afterEach(async () => {
    await stopDevRelay()
    vi.clearAllMocks()
  })

  it('starts no relay for an app without realtime.relay, or one whose relay has a url', async () => {
    expect(await withDevRelay({}, '/app', devUrl)).toEqual({})
    const own = config({ url: 'https://relay.example.com', apiKey: 'a'.repeat(32), ticketKey: 't'.repeat(32) })
    expect(await withDevRelay(own, '/app', devUrl)).toBe(own)
    expect(started).not.toHaveBeenCalled()
  })

  it("starts the relay for the app at the dev server's origin and gives the app its address and keys", async () => {
    const served = await withDevRelay(config(), '/app', devUrl)
    const options = served.realtime!.relay!
    expect(options).toMatchObject({ ...relay, url: 'http://127.0.0.1:4100' })
    expect(options.apiKey.length).toBeGreaterThanOrEqual(32)
    expect(options.ticketKey.length).toBeGreaterThanOrEqual(32)
    expect(started).toHaveBeenCalledWith('/bin/relay', 4100, { id: 'chat', api_keys: [options.apiKey], ticket_keys: [options.ticketKey], origins: [devUrl], limits: { connections: 1000, channels_per_ticket: 200, request_bytes: 1048576 } }, expect.any(Function))
  })

  it('takes the keys the config sets', async () => {
    const served = await withDevRelay(config({ apiKey: 'a'.repeat(32), ticketKey: 't'.repeat(32) }), '/app', devUrl)
    expect(served.realtime!.relay).toMatchObject({ apiKey: 'a'.repeat(32), ticketKey: 't'.repeat(32) })
  })

  it('keeps the relay across reloads of the same app, and starts it again when its entry changes', async () => {
    const first = await withDevRelay(config(), '/app', devUrl)
    const again = await withDevRelay(config({ channels: { rooms: {} } }), '/app', devUrl)
    expect(again.realtime!.relay).toMatchObject({ apiKey: first.realtime!.relay!.apiKey, url: 'http://127.0.0.1:4100' })
    expect(started).toHaveBeenCalledTimes(1)
    await withDevRelay(config({ app: 'chat2' }), '/app', devUrl)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(started).toHaveBeenCalledTimes(2)
  })

  it('stops the relay once the config drops realtime.relay', async () => {
    await withDevRelay(config(), '/app', devUrl)
    await withDevRelay({}, '/app', devUrl)
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('refuses an app id the relay would not take, before starting it', async () => {
    await expect(withDevRelay(config({ app: 'Chat App' }), '/app', devUrl)).rejects.toThrow(/realtime.relay.app must be/)
    expect(started).not.toHaveBeenCalled()
  })
})
