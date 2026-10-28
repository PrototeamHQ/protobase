import { describe, expect, it } from 'vitest'
import { nativeFingerprint } from './fingerprint'

describe('nativeFingerprint', () => {
  const pinned = { '@capacitor/core': '8.5.3', '@capacitor/ios': '8.5.3' }

  it('is the same for the same native packages in any order, and differs when one does', () => {
    const one = nativeFingerprint(pinned, { '@capacitor/camera': '^8.0.1', a: '1.0.0' })
    expect(one).toMatch(/^[0-9a-f]{16}$/)
    expect(nativeFingerprint({ '@capacitor/ios': '8.5.3', '@capacitor/core': '8.5.3' }, { a: '1.0.0', '@capacitor/camera': '^8.0.1' })).toBe(one)
    expect(nativeFingerprint({ ...pinned, '@capacitor/core': '8.5.4' }, { '@capacitor/camera': '^8.0.1', a: '1.0.0' })).not.toBe(one)
    expect(nativeFingerprint(pinned, { '@capacitor/camera': '^8.1.0', a: '1.0.0' })).not.toBe(one)
    expect(nativeFingerprint(pinned)).toBe(nativeFingerprint(pinned, {}))
  })

  // Binaries one version builds are matched by hosts that run another: the fingerprint of an input never changes.
  it('pins a known input to a known fingerprint', () => {
    expect(nativeFingerprint({ ...pinned, '@protobase/mobile': 'native-1' }, { '@capacitor/camera': '^8.0.1' })).toBe('375015551d0fe567')
  })
})
