import { randomBytes } from 'node:crypto'
import type { ProtobaseConfig } from '@protobase/config'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { checkRelayOptions, defaultRelayChannels } from '@protobase/server'
import { relayAppEntry } from '../relay/app-entry'
import { realtimeBinary } from './realtime-binary'
import { freePort, relayUrl, startRelay, type RelayProcess } from './relay-process'

type RunningRelay = { entry: string; url: string; relay: RelayProcess }
// The relay protobase dev runs, and the queue its starts and stops take one at a time.
type DevRelay = { running?: RunningRelay; queue: Promise<unknown> }

// On globalThis: the dev server's entry module is evaluated again on every edit, the relay runs across them. The keys
// are made once, so a relay started again after an edit takes the same ones.
const store = globalThis as { __protobaseDevRelay?: DevRelay; __protobaseDevRelayKeys?: { apiKey: string; ticketKey: string; presenceKey: string } }

const devRelay = () => (store.__protobaseDevRelay ??= { queue: Promise.resolve() })

// Runs `step` once every start and stop asked for before it is done, so an edit made while the relay starts never
// starts a second one beside it. The step's error reaches its own caller; the queue only waits for it to settle.
const inTurn = <T>(step: (state: DevRelay) => Promise<T>) => {
  const state = devRelay()
  const result = state.queue.then(() => step(state))
  state.queue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

// The limits the relay requires of every app, roomy for one developer: a ticket lists at most 200 channels, as the app's
// ticket route caps it, and a command of the app may hold a large batch of changes, such as an import's.
const devLimits = { connections: 1000, channels_per_ticket: 200, request_bytes: 1024 * 1024 }

const devKey = () => randomBytes(32).toString('base64url')
const devKeys = () => (store.__protobaseDevRelayKeys ??= { apiKey: devKey(), ticketKey: devKey(), presenceKey: devKey() })

const stopRunning = async (state: DevRelay) => {
  const running = state.running
  state.running = undefined
  await running?.relay.stop()
}

// The relay for `entry`: the running one when it serves that entry, otherwise a new one in place of it.
const relayFor = async (state: DevRelay, entry: string) => {
  if (state.running?.entry === entry) return state.running
  await stopRunning(state)
  const port = await freePort()
  const binary = await realtimeBinary()
  const running: RunningRelay = { entry, url: relayUrl(port), relay: await startRelay(binary, port, JSON.parse(entry), (code) => relayEnded(state, running, code)) }
  state.running = running
  return running
}

const relayEnded = (state: DevRelay, ended: RunningRelay, code: number | null) => {
  if (state.running === ended) state.running = undefined
  process.stderr.write(`error: the relay of protobase dev ended (exit code ${code}); save a file of the project to start it again\n`)
}

/**
 * The config with a relay of its own when `realtime.relay` names none: without a `url`, protobase dev runs the relay
 * from the pinned Protobase Realtime release (`realtimeBinary`) for the app at `devUrl`, with keys it makes unless the config sets them, the presence key too, and gives the app its
 * address and keys; its apps file declares the events of `views`' typing conversation pages too, and its channels default to those of the conversation pages with members (`defaultRelayChannels`). It starts on the first load whose config has `realtime.relay`, and again when an edit changes the
 * app's entry in its apps file; a config without `realtime.relay`, or one with a `url`, stops it.
 */
export const withDevRelay = async <Config extends Pick<ProtobaseConfig, 'realtime'>>(config: Config, devUrl: string, { views, models }: { views: readonly ViewModel[]; models: readonly ResourceModel[] }): Promise<Config> => {
  const relay = config.realtime?.relay
  if (!relay || relay.url) {
    await stopDevRelay()
    return config
  }
  const keys = devKeys()
  // Checked before the relay reads them, so a wrong app id stops here rather than in the relay's apps file; the url
  // checked is the dev server's, which the relay's own replaces once it runs.
  const options = checkRelayOptions({
    ...relay,
    channels: relay.channels ?? defaultRelayChannels({ views, models }),
    url: devUrl,
    apiKey: relay.apiKey || keys.apiKey,
    ticketKey: relay.ticketKey || keys.ticketKey,
    ...(relay.presence && { presence: { ...relay.presence, key: relay.presence.key || keys.presenceKey } }),
  })
  const entry = JSON.stringify({ ...relayAppEntry(options, { url: devUrl, views }), limits: devLimits })
  const running = await inTurn((state) => relayFor(state, entry))
  return { ...config, realtime: { ...config.realtime, relay: { ...options, url: running.url } } }
}

/** Ends the relay protobase dev started, when the dev server closes, once a start under way has finished. */
export const stopDevRelay = () => inTurn(stopRunning)
