import { describe, expect, it } from 'vitest'
import { realtimeAssets } from './realtime-release'
import { releaseFromSums } from './realtime-sums'

const hash = (n: number) => n.toString(16).padStart(64, '0')
const sums = (assets: string[]) => assets.map((asset, n) => `${hash(n)}  ${asset}`).join('\n')

describe('releaseFromSums', () => {
  it("pins every supported machine's asset, and nothing else the file lists", () => {
    expect(releaseFromSums('0.1.0', `${sums(realtimeAssets)}\n${hash(99)}  protobase-realtime-freebsd-amd64\n`)).toEqual({ version: '0.1.0', sha256: Object.fromEntries(realtimeAssets.map((asset, n) => [asset, hash(n)])) })
  })

  it('fails naming each supported asset the file does not list', () => {
    expect(() => releaseFromSums('0.1.0', sums(realtimeAssets.slice(1)))).toThrow('the SHA256SUMS of Protobase Realtime v0.1.0 lists no protobase-realtime-linux-amd64')
  })
})
