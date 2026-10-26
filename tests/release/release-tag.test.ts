import { describe, expect, it } from 'vitest'
import { releaseVersion } from '../../scripts/release-tag'

describe('releaseVersion', () => {
  it('names the version of a vx.y.z tag', () => {
    expect(releaseVersion('v0.46.15')).toBe('0.46.15')
    expect(releaseVersion('v1.0.0')).toBe('1.0.0')
  })

  it('is undefined for a tag that is no release', () => {
    for (const tag of ['0.46.15', 'v0.46', 'v0.46.15-rc.1', 'v0.46.15+build', 'vnext', '']) expect(releaseVersion(tag)).toBeUndefined()
  })
})
