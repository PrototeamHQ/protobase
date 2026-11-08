import { relaySendPath } from '../notifications/relay/relay-protocol'

/** The register endpoint's path, under the relay's URL. */
export const relayRegisterPath = 'register'

export { relaySendPath }

/** The relay's URL under the app's system path, such as `/api/push-relay`: workspaces send to `<it>/send`. */
export const pushRelayPath = (systemPath: string) => `${systemPath}/push-relay`
