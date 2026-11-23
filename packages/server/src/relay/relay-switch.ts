import { appRelayChannels, type RelayApp } from './realtime-channels'
import { relaySettings, type RealtimeRelayOptions } from './relay-options'

/** The variable with which a platform that runs the relay moves an app to it. */
export const realtimeSwitchVariable = 'PROTOBASE_REALTIME_ENABLED'

/** The switch: `true` or `false`, off when unset or empty; any other value stops the server at startup. */
export const readRelaySwitch = (env: Record<string, string | undefined>) => {
  const value = env[realtimeSwitchVariable]
  if (!value) return false
  if (value !== 'true' && value !== 'false') throw new Error(`${realtimeSwitchVariable} must be true or false, not "${value}"`)
  return value === 'true'
}

/**
 * The app's relay settings, or undefined without a relay: a config's `realtime.relay` turns it on whatever the switch
 * says, and the switch turns it on without one; either way the channels are `appRelayChannels`', and the address and
 * keys default to the platform's variables (`relaySettings`). The switch on for an app with no channels to derive
 * stops the server.
 */
export const appRelaySettings = (declared: RealtimeRelayOptions | undefined, env: Record<string, string | undefined>, app: RelayApp) => {
  const on = readRelaySwitch(env)
  if (!declared && !on) return
  const channels = appRelayChannels(declared, app)
  if (!channels) throw new Error(`${realtimeSwitchVariable} is true, but the app has no realtime.relay, and no live conversation resource whose page has members, with sign-in, to derive the relay's channels from`)
  return relaySettings({ ...declared, channels }, env)
}
