import type { ProtobaseConfig } from '@protobase/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stopDevRelay, withDevRelay } from './dev-relay'
import { realtimeBinary } from './realtime-binary'
import { startRelay } from './relay-process'

vi.mock('./realtime-binary', () => ({ realtimeBinary: vi.fn(async () => '/bin/relay') }))
vi.mock('./relay-process', async (actual) => ({ ...(await actual<typeof import('./relay-process')>()), freePort: async () => 4100, startRelay: vi.fn() }))

const started = vi.mocked(startRelay)
const resolved = vi.mocked(realtimeBinary)
const stop = vi.fn(async () => undefined)
const devUrl = 'http://localhost:5173'
// The app's views and resources, none: the config declares its channels.
const none = { views: [], models: [] }
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

  it('starts no relay and resolves no binary for an app without realtime.relay, or one whose relay has a url', async () => {
    expect(await withDevRelay({}, devUrl, none)).toEqual({})
    const own = config({ url: 'https://relay.example.com', apiKey: 'a'.repeat(32), ticketKey: 't'.repeat(32) })
    expect(await withDevRelay(own, devUrl, none)).toBe(own)
    expect(started).not.toHaveBeenCalled()
    expect(resolved).not.toHaveBeenCalled()
  })

  it("starts the relay for the app at the dev server's origin and gives the app its address and keys", async () => {
    const served = await withDevRelay(config(), devUrl, none)
    const options = served.realtime!.relay!
    expect(options).toMatchObject({ ...relay, url: 'http://127.0.0.1:4100' })
    expect(options.apiKey!.length).toBeGreaterThanOrEqual(32)
    expect(options.ticketKey!.length).toBeGreaterThanOrEqual(32)
    expect(started).toHaveBeenCalledWith('/bin/relay', 4100, { id: 'chat', api_keys: [options.apiKey], ticket_keys: [options.ticketKey], origins: [devUrl], limits: { connections: 1000, channels_per_ticket: 200, request_bytes: 1048576 } }, expect.any(Function))
  })

  it('takes the keys the config sets', async () => {
    const served = await withDevRelay(config({ apiKey: 'a'.repeat(32), ticketKey: 't'.repeat(32) }), devUrl, none)
    expect(served.realtime!.relay).toMatchObject({ apiKey: 'a'.repeat(32), ticketKey: 't'.repeat(32) })
  })

  it('makes a presence key when the config sets none, and keeps one it sets', async () => {
    const presence = { resource: 'presences', user: 'user_id', status: 'status', at: 'since' }
    const made = (await withDevRelay(config({ presence }), devUrl, none)).realtime!.relay!.presence!
    expect(made.key!.length).toBeGreaterThanOrEqual(32)
    expect(started.mock.calls[0]![2]).toMatchObject({ presence: { url: `${devUrl}/api/relay/presence`, key: made.key } })
    const own = await withDevRelay(config({ presence: { ...presence, key: 'p'.repeat(32) } }), devUrl, none)
    expect(own.realtime!.relay!.presence!.key).toBe('p'.repeat(32))
  })

  it('keeps the relay across reloads of the same app, and starts it again when its entry changes', async () => {
    const first = await withDevRelay(config(), devUrl, none)
    const again = await withDevRelay(config({ channels: { rooms: {} } }), devUrl, none)
    expect(again.realtime!.relay).toMatchObject({ apiKey: first.realtime!.relay!.apiKey, url: 'http://127.0.0.1:4100' })
    expect(started).toHaveBeenCalledTimes(1)
    await withDevRelay(config({ app: 'chat2' }), devUrl, none)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(started).toHaveBeenCalledTimes(2)
  })

  it('stops the relay once the config drops realtime.relay', async () => {
    await withDevRelay(config(), devUrl, none)
    await withDevRelay({}, devUrl, none)
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('starts one relay for an edit made while the relay starts, and starts again after it for a changed entry', async () => {
    const [first, again] = await Promise.all([withDevRelay(config(), devUrl, none), withDevRelay(config(), devUrl, none)])
    expect(again.realtime!.relay!.url).toBe(first.realtime!.relay!.url)
    expect(started).toHaveBeenCalledTimes(1)
    await Promise.all([withDevRelay(config({ app: 'chat2' }), devUrl, none), withDevRelay(config({ app: 'chat3' }), devUrl, none)])
    expect(started).toHaveBeenCalledTimes(3)
    expect(stop).toHaveBeenCalledTimes(2)
  })

  it('stops the relay a start under way produces when the dev server closes', async () => {
    let resolveStart!: (relay: { stop: typeof stop }) => void
    started.mockReturnValueOnce(new Promise((resolve) => (resolveStart = resolve)))
    const starting = withDevRelay(config(), devUrl, none)
    const stopping = stopDevRelay()
    resolveStart({ stop })
    await Promise.all([starting, stopping])
    expect(stop).toHaveBeenCalledTimes(1)
    await stopDevRelay()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('starts again after a start that failed', async () => {
    started.mockRejectedValueOnce(new Error('spawn failed'))
    await expect(withDevRelay(config(), devUrl, none)).rejects.toThrow('spawn failed')
    await withDevRelay(config(), devUrl, none)
    expect(started).toHaveBeenCalledTimes(2)
  })

  it('refuses an app id the relay would not take, before starting it', async () => {
    await expect(withDevRelay(config({ app: 'Chat App' }), devUrl, none)).rejects.toThrow(/realtime.relay.app or PROTOBASE_REALTIME_APP must be/)
    expect(started).not.toHaveBeenCalled()
  })
})
