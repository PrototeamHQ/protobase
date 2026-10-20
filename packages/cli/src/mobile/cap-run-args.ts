import { forwardedPort } from './api-origin'
import type { Platform } from './platform'

export type CapRunInput = {
  platform: Platform
  /** The device or simulator to run on; Capacitor asks without it. */
  target?: string
  /** The server the app calls, or with `live` the dev server it opens. */
  url: URL
  /** The port of the running `protobase dev`, to open instead of the app's own files. */
  live?: number
}

/** The arguments of `cap run`, after the native project was generated and synced. */
export const capRunArgs = ({ platform, target, url, live }: CapRunInput) => {
  const port = forwardedPort(url, platform)
  return [
    'run',
    platform,
    '--no-sync',
    ...(target ? ['--target', target] : []),
    ...(port === undefined ? [] : ['--forwardPorts', `${port}:${port}`]),
    ...(live === undefined ? [] : ['--live-reload', '--host', 'localhost', '--port', String(live)]),
  ]
}
