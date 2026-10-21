import { describe, expect, it } from 'vitest'
import { alreadyCopied, copyFault } from './storage-verify'

const object = { bucket: 'avatars', name: 'a.png', version: 'v1', size: 5, eTag: '"5d41402abc4b2a76b9719d911017c592"' }
const hello = { size: 5, md5: '5d41402abc4b2a76b9719d911017c592' }

describe('alreadyCopied', () => {
  it('skips a stored copy of the recorded size, or of any size when none was recorded', () => {
    expect(alreadyCopied(object, 5)).toBe(true)
    expect(alreadyCopied({ ...object, size: undefined }, 3)).toBe(true)
  })

  it('copies what the store lacks or holds at another size', () => {
    expect(alreadyCopied(object, undefined)).toBe(false)
    expect(alreadyCopied(object, 4)).toBe(false)
  })
})

describe('copyFault', () => {
  it('accepts a copy of the recorded size whose MD5 is the ETag', () => {
    expect(copyFault(object, hello, 5)).toBeUndefined()
    expect(copyFault({ ...object, eTag: '5D41402ABC4B2A76B9719D911017C592' }, hello, 5)).toBeUndefined()
  })

  it('names a byte count that differs from the recorded size or from what the store holds', () => {
    expect(copyFault(object, { ...hello, size: 4 }, 4)).toBe('read 4 bytes, Supabase recorded 5')
    expect(copyFault(object, hello, undefined)).toBe('the file provider holds no bytes of the 5 written')
    expect(copyFault(object, hello, 3)).toBe('the file provider holds 3 bytes of the 5 written')
  })

  it('names an MD5 that differs from a plain ETag', () => {
    expect(copyFault(object, { ...hello, md5: '0'.repeat(32) }, 5)).toBe(`MD5 ${'0'.repeat(32)} differs from the ETag 5d41402abc4b2a76b9719d911017c592`)
  })

  it("checks only the size against a multipart upload's ETag or none", () => {
    expect(copyFault({ ...object, eTag: '"9b2cf535f27731c974343645a3985328-3"' }, hello, 5)).toBeUndefined()
    expect(copyFault({ ...object, eTag: undefined, size: undefined }, { size: 7, md5: hello.md5 }, 7)).toBeUndefined()
  })
})
