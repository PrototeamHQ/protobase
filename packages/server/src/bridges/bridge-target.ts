/** Where a bridge connects, as the app's access rule answers it. */
export type BridgeTarget = {
  /** A host name or IP address the server can reach, such as a server's address on the private network. */
  host: string
  port: number
  /** How long the bridge stays open, from when its token was issued: at most a day, by default an hour. */
  expiresInSeconds?: number
}

export const defaultBridgeSeconds = 3600
export const maxBridgeSeconds = 86_400

const isPort = (port: unknown) => Number.isInteger(port) && (port as number) >= 1 && (port as number) <= 65_535
const isSeconds = (seconds: unknown) => Number.isInteger(seconds) && (seconds as number) >= 1 && (seconds as number) <= maxBridgeSeconds

/** The target an access rule answered, or an error naming what is wrong with it: a fault of the app, not the caller. */
export const checkedTarget = (name: string, target: BridgeTarget) => {
  if (typeof target.host !== 'string' || target.host === '') throw new Error(`The bridge target "${name}" has no host`)
  if (!isPort(target.port)) throw new Error(`The bridge target "${name}" has no port from 1 to 65535: ${String(target.port)}`)
  if (target.expiresInSeconds !== undefined && !isSeconds(target.expiresInSeconds)) {
    throw new Error(`The bridge target "${name}" must expire in 1 to ${maxBridgeSeconds} whole seconds, not ${String(target.expiresInSeconds)}`)
  }
  return { host: target.host, port: target.port, seconds: target.expiresInSeconds ?? defaultBridgeSeconds }
}
