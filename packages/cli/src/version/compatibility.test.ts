import { describe, expect, it } from 'vitest'
import { bundleVersionProblem } from './compatibility'

describe('bundleVersionProblem', () => {
  it('serves a bundle of the same version, whatever the patches', () => {
    expect(bundleVersionProblem('1.4.2', '1.4.2')).toBeUndefined()
    expect(bundleVersionProblem('1.4.0', '1.4.9')).toBeUndefined()
    expect(bundleVersionProblem('0.1.0', '0.1.0')).toBeUndefined()
    expect(bundleVersionProblem('0.1.3', '0.1.7')).toBeUndefined()
  })

  it('serves a bundle of an older minor of the same major from 1.0 on', () => {
    expect(bundleVersionProblem('1.4.2', '1.0.0')).toBeUndefined()
    expect(bundleVersionProblem('1.4.2', '1.3.9')).toBeUndefined()
  })

  it('refuses a bundle of a newer minor', () => {
    expect(bundleVersionProblem('1.4.2', '1.5.0')).toBe(
      'the bundle was built by Protobase 1.5.0 and this runtime is Protobase 1.4.2, which serves bundles built by 1.0.x to 1.4.x; rebuild the bundle with Protobase 1.4.x or serve it with a runtime of 1.5 or a newer 1.x',
    )
  })

  it('refuses a bundle of another major, older or newer', () => {
    expect(bundleVersionProblem('2.0.0', '1.9.0')).toContain('rebuild the bundle with Protobase 2.0.x or serve it with a runtime of 1.9 or a newer 1.x')
    expect(bundleVersionProblem('1.9.0', '2.0.0')).toContain('rebuild the bundle with Protobase 1.9.x or serve it with a runtime of 2.0 or a newer 2.x')
  })

  it('below 1.0 serves only bundles of its own minor', () => {
    expect(bundleVersionProblem('0.2.0', '0.1.5')).toBe(
      'the bundle was built by Protobase 0.1.5 and this runtime is Protobase 0.2.0, which serves bundles built by 0.2.x; rebuild the bundle with Protobase 0.2.x or serve it with a runtime of 0.1.x',
    )
    expect(bundleVersionProblem('0.1.5', '0.2.0')).toContain('serves bundles built by 0.1.x; rebuild the bundle with Protobase 0.1.x or serve it with a runtime of 0.2.x')
    expect(bundleVersionProblem('1.0.0', '0.9.0')).toContain('serve it with a runtime of 0.9.x')
  })

  it('refuses a bundle without a version', () => {
    expect(bundleVersionProblem('0.1.0', undefined)).toBe(
      'the bundle names no Protobase version, so it was built before 0.1.0; rebuild the bundle with Protobase 0.1.x to serve it on this runtime (0.1.0)',
    )
  })

  it('refuses a malformed version', () => {
    for (const version of ['', '1.2', '1.2.3.4', 'v1.2.3', '1.02.3', '1.2.3-beta.1', 'latest', 1, null, { major: 1 }]) {
      expect(bundleVersionProblem('1.2.3', version)).toBe(
        `the bundle's Protobase version ${JSON.stringify(version)} is no x.y.z version; rebuild the bundle with Protobase 1.2.x to serve it on this runtime (1.2.3)`,
      )
    }
  })

  it('fails fast on a malformed runtime version', () => {
    expect(() => bundleVersionProblem('dev', '0.1.0')).toThrow('The runtime\'s own Protobase version "dev" is no x.y.z version')
  })
})
