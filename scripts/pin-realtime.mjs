// Pins the Protobase Realtime release protobase dev downloads: writes its version and the sha256 of each supported
// machine's asset, from the release's SHA256SUMS, into packages/cli/src/dev/realtime-release.json, failing when a
// supported machine's asset is not listed. `bun scripts/pin-realtime.mjs 0.1.0`; PROTOBASE_REALTIME_DOWNLOAD_URL
// replaces the download address, as it does for protobase dev.
import { writeFileSync } from 'node:fs'
import semver from 'semver'
import { realtimeDownloadBase } from '../packages/cli/src/dev/realtime-release.ts'
import { releaseFromSums } from '../packages/cli/src/dev/realtime-sums.ts'

const version = semver.valid(process.argv[2] ?? '')
if (!version) throw new Error('usage: bun scripts/pin-realtime.mjs <x.y.z>')

const url = `${process.env.PROTOBASE_REALTIME_DOWNLOAD_URL || realtimeDownloadBase}/v${version}/SHA256SUMS`
const response = await fetch(url)
if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`)
const release = releaseFromSums(version, await response.text())
writeFileSync(new URL('../packages/cli/src/dev/realtime-release.json', import.meta.url), `${JSON.stringify(release, null, 2)}\n`)
