import { describe, expect, it } from 'vitest'
import { lockedVersions } from './locked-versions'

describe('lockedVersions', () => {
  it('takes each registry package locked at one version', () => {
    const lock = {
      packages: {
        '@react-pdf/textkit': ['@react-pdf/textkit@7.0.1', '', {}, 'sha512-a'],
        react: ['react@19.3.0', '', {}, 'sha512-b'],
      },
    } as const
    expect(lockedVersions(lock as never)).toEqual({ '@react-pdf/textkit': '7.0.1', react: '19.3.0' })
  })

  it('leaves out packages locked at several versions', () => {
    const lock = {
      packages: {
        semver: ['semver@7.7.2', '', {}, 'sha512-a'],
        'make-dir/semver': ['semver@6.3.1', '', {}, 'sha512-b'],
        '@scope/a': ['@scope/a@1.0.0', '', {}, 'sha512-c'],
        'x/@scope/a': ['@scope/a@2.0.0', '', {}, 'sha512-d'],
      },
    } as const
    expect(lockedVersions(lock as never)).toEqual({})
  })

  it('leaves out workspace packages', () => {
    const lock = { packages: { '@protobase/server': ['@protobase/server@workspace:packages/server'] } } as const
    expect(lockedVersions(lock as never)).toEqual({})
  })
})
