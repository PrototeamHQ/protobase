import { relaySettings, type RealtimeRelayOptions } from './relay-options'

/** The variable with which a platform that runs the relay moves an app to it. */
export const relaySwitchVariable = 'PROTOBASE_RELAY_ENABLED'

/** The switch: `true` or `false`, off when unset or empty; any other value stops the server at startup. */
export const readRelaySwitch = (env: Record<string, string | undefined>) => {
  const value = env[relaySwitchVariable]
  if (!value) return false
  if (value !== 'true' && value !== 'false') throw new Error(`${relaySwitchVariable} must be true or false, not "${value}"`)
  return value === 'true'
}

/**
 * The app's relay settings, or undefined without a relay: a config's `realtime.relay` turns it on whatever the switch
 * says, with its address and keys defaulting to the platform's variables (`relaySettings`). The switch on without
 * `realtime.relay` stops the server, as the channels and their members come only from the config.
 */
export const appRelaySettings = (declared: RealtimeRelayOptions | undefined, env: Record<string, string | undefined>) => {
  const on = readRelaySwitch(env)
  if (declared) return relaySettings(declared, env)
  if (!on) return
  throw new Error(`${relaySwitchVariable} is true, but the config has no realtime.relay: declare realtime.relay.channels, whose members the relay's channels need`)
}
