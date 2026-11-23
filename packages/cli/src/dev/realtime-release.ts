import pinned from './realtime-release.json' with { type: 'json' }

/** The Protobase Realtime release protobase dev runs, as `scripts/pin-realtime.mjs` pins it: its version and each asset's sha256. */
export type RealtimeRelease = { version: string; sha256: Record<string, string> }

export const realtimeRelease: RealtimeRelease = pinned

/** Where the releases' assets are, `<base>/v<version>/<asset>`; `PROTOBASE_REALTIME_DOWNLOAD_URL` replaces it, such as with a mirror. */
export const realtimeDownloadBase = 'https://github.com/PrototeamHQ/protobase-realtime/releases/download'

// Node's platform and architecture, by the names the release's assets carry.
const goos: Record<string, string> = { linux: 'linux', darwin: 'darwin', win32: 'windows' }
const goarch: Record<string, string> = { x64: 'amd64', arm64: 'arm64' }

/** The asset of every machine the release must have a build for. */
export const realtimeAssets = ['protobase-realtime-linux-amd64', 'protobase-realtime-linux-arm64', 'protobase-realtime-darwin-amd64', 'protobase-realtime-darwin-arm64', 'protobase-realtime-windows-amd64.exe']

/** The asset for `platform` and `arch`, such as `protobase-realtime-linux-amd64`; undefined for a machine the release has no build for. */
export const realtimeAsset = (platform: string, arch: string) => {
  const os = goos[platform]
  const cpu = goarch[arch]
  if (!os || !cpu) return
  const asset = `protobase-realtime-${os}-${cpu}${os === 'windows' ? '.exe' : ''}`
  return realtimeAssets.includes(asset) ? asset : undefined
}
