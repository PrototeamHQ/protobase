import { describe, expect, it } from 'vitest'
import { nativeFingerprint } from './fingerprint'

describe('nativeFingerprint', () => {
  it('is the same for the same native packages in any order, and differs when one does', () => {
    const one = nativeFingerprint({ mobile: '0.14.2', plugins: [['@capacitor/camera', '8.0.1'], ['a', '1.0.0']] })
    expect(one).toMatch(/^[0-9a-f]{16}$/)
    expect(nativeFingerprint({ mobile: '0.14.2', plugins: [['a', '1.0.0'], ['@capacitor/camera', '8.0.1']] })).toBe(one)
    expect(nativeFingerprint({ mobile: '0.14.3', plugins: [['a', '1.0.0'], ['@capacitor/camera', '8.0.1']] })).not.toBe(one)
    expect(nativeFingerprint({ mobile: '0.14.2', plugins: [['a', '1.0.1'], ['@capacitor/camera', '8.0.1']] })).not.toBe(one)
  })
})
