import { randomBytes } from 'node:crypto'
import type { ProtobaseConfig } from '@protobase/config'
import type { ViewModel } from '@protobase/schema'
import { checkRelayOptions } from '@protobase/server'
import { relayAppEntry } from '../relay/app-entry'
import { relayBinary } from './relay-binary'
import { freePort, relayUrl, startRelay, type RelayProcess } from './relay-process'

type RunningRelay = { entry: string; url: string; relay: RelayProcess }

// On globalThis: the dev server's entry module is evaluated again on every edit, the relay runs across them. The keys
// are made once, so a relay started again after an edit takes the same ones.
const store = globalThis as { __protobaseDevRelay?: RunningRelay; __protobaseDevRelayKeys?: { apiKey: string; ticketKey: string } }

// The limits the relay requires of every app, roomy for one developer: a ticket lists at most 200 channels, as the app's
// ticket route caps it, and a command of the app may hold a large batch of changes, such as an import's.
const devLimits = { connections: 1000, channels_per_ticket: 200, request_bytes: 1024 * 1024 }

const devKeys = () => (store.__protobaseDevRelayKeys ??= { apiKey: randomBytes(32).toString('base64url'), ticketKey: randomBytes(32).toString('base64url') })

const relayEnded = (code: number | null) => {
  delete store.__protobaseDevRelay
  process.stderr.write(`error: the relay of protobase dev ended (exit code ${code}); save a file of the project to start it again\n`)
}

/**
 * The config with a relay of its own when `realtime.relay` names none: without a `url`, protobase dev runs the relay
 * from its npm package for the app at `devUrl`, with keys it makes unless the config sets them, and gives the app its
 * address and keys; its apps file declares the events of `views`' typing conversation pages too. It starts on the first load whose config has `realtime.relay`, and again when an edit changes the
 * app's entry in its apps file; a config without `realtime.relay`, or one with a `url`, stops it.
 */
export const withDevRelay = async <Config extends Pick<ProtobaseConfig, 'realtime'>>(config: Config, projectDir: string, devUrl: string, views: readonly ViewModel[]): Promise<Config> => {
  const relay = config.realtime?.relay
  if (!relay || relay.url) {
    await stopDevRelay()
    return config
  }
  const keys = devKeys()
  // Checked before the relay reads them, so a wrong app id stops here rather than in the relay's apps file; the url
  // checked is the dev server's, which the relay's own replaces once it runs.
  const options = checkRelayOptions({ ...relay, url: devUrl, apiKey: relay.apiKey || keys.apiKey, ticketKey: relay.ticketKey || keys.ticketKey })
  const entry = JSON.stringify({ ...relayAppEntry(options, { url: devUrl, views }), limits: devLimits })
  if (store.__protobaseDevRelay?.entry !== entry) {
    await stopDevRelay()
    const port = await freePort()
    store.__protobaseDevRelay = { entry, url: relayUrl(port), relay: await startRelay(await relayBinary(projectDir), port, JSON.parse(entry), relayEnded) }
  }
  return { ...config, realtime: { ...config.realtime, relay: { ...options, url: store.__protobaseDevRelay.url } } }
}

/** Ends the relay protobase dev started, when the dev server closes. */
export const stopDevRelay = async () => {
  const running = store.__protobaseDevRelay
  delete store.__protobaseDevRelay
  await running?.relay.stop()
}
