import { describe, expect, it } from 'vitest'
import { realtimeAsset, realtimeAssets, realtimeRelease } from './realtime-release'

describe('realtimeAsset', () => {
  it("names the release's asset for each supported machine", () => {
    expect(realtimeAsset('linux', 'x64')).toBe('protobase-realtime-linux-amd64')
    expect(realtimeAsset('darwin', 'arm64')).toBe('protobase-realtime-darwin-arm64')
    expect(realtimeAsset('win32', 'x64')).toBe('protobase-realtime-windows-amd64.exe')
  })

  it('names none for a machine without a build', () => {
    expect(realtimeAsset('win32', 'arm64')).toBeUndefined()
    expect(realtimeAsset('freebsd', 'x64')).toBeUndefined()
    expect(realtimeAsset('linux', 'ia32')).toBeUndefined()
  })
})

describe('realtimeRelease', () => {
  it('pins a sha256 for every supported asset', () => {
    expect(Object.keys(realtimeRelease.sha256).sort()).toEqual([...realtimeAssets].sort())
  })
})
