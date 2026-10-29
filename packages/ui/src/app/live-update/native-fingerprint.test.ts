import { describe, expect, it } from 'vitest'
import { nativeFingerprintOf } from './native-fingerprint'

describe('nativeFingerprintOf', () => {
  it('reads the fingerprint the binary appends to its user agent', () => {
    expect(nativeFingerprintOf('Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile Safari/537.36 ProtobaseNative/0123456789abcdef')).toBe('0123456789abcdef')
  })

  it('is none in a browser or for a malformed one', () => {
    expect(nativeFingerprintOf('Mozilla/5.0 Chrome/140')).toBeUndefined()
    expect(nativeFingerprintOf('ProtobaseNative/0123')).toBeUndefined()
    expect(nativeFingerprintOf('ProtobaseNative/0123456789abcdefX')).toBeUndefined()
  })
})
