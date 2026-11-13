import { describe, expect, it } from 'vitest'
import { permissionAsked } from './permission-asked'

const android = (version: string) => `Mozilla/5.0 (Linux; Android ${version}; Pixel 9a Build/BP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36`

describe('permissionAsked', () => {
  it('takes the permission as asked on iOS and from Android 13 on', () => {
    expect(permissionAsked('ios', 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148')).toBe(true)
    expect(['13', '16'].map((version) => permissionAsked('android', android(version)))).toEqual([true, true])
  })

  it('takes it as granted without asking before Android 13, or when the version is not given', () => {
    expect(['10', '12'].map((version) => permissionAsked('android', android(version)))).toEqual([false, false])
    expect(permissionAsked('android', 'Mozilla/5.0 (Linux) AppleWebKit/537.36')).toBe(false)
  })
})
