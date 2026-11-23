import { realtimeAssets, type RealtimeRelease } from './realtime-release'

/**
 * The pinned release of `version` from its SHA256SUMS, as `sha256sum` writes it (`<hash>  <file>` per line): the
 * sha256 of every supported machine's asset, failing when one is missing, so no machine is left without a check.
 */
export const releaseFromSums = (version: string, sums: string): RealtimeRelease => {
  const listed = new Map<string, string>()
  for (const line of sums.split('\n')) {
    const match = /^([0-9a-f]{64}) [ *](\S+)$/.exec(line.trim())
    if (match) listed.set(match[2]!, match[1]!)
  }
  const missing = realtimeAssets.filter((asset) => !listed.has(asset))
  if (missing.length) throw new Error(`the SHA256SUMS of Protobase Realtime v${version} lists no ${missing.join(', ')}`)
  return { version, sha256: Object.fromEntries(realtimeAssets.map((asset) => [asset, listed.get(asset)!])) }
}
