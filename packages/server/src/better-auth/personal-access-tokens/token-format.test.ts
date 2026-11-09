import { describe, expect, it } from 'vitest'
import { checksumLength, checksumOf, isWellFormed, newToken, randomLength, tokenHash } from './token-format'

const prefix = 'invoices_'

describe('a personal access token', () => {
  it('is the prefix, 40 random base62 characters and a 6-character checksum', () => {
    const token = newToken(prefix)
    expect(token).toMatch(/^invoices_[0-9A-Za-z]{46}$/)
    expect(token).toHaveLength(prefix.length + randomLength + checksumLength)
    expect(token.slice(-checksumLength)).toBe(checksumOf(token.slice(0, -checksumLength)))
  })

  it('is new every time', () => {
    expect(newToken(prefix)).not.toBe(newToken(prefix))
  })

  it('checks the CRC-32 of the prefix and random part, as base62', () => {
    // CRC-32 of "a" is 0xe8b7be43 = 3904355907, which is "4GEHKN" in base62.
    expect(checksumOf('a')).toBe('4GEHKN')
    expect(checksumOf('')).toBe('000000')
  })
})

describe('the shape of a token', () => {
  it('holds for a token the app made', () => {
    expect(isWellFormed(newToken(prefix), prefix)).toBe(true)
  })

  it('fails with a changed character, so a typo or a made-up token never reaches the store', () => {
    const token = newToken(prefix)
    const at = prefix.length + 5
    const changed = `${token.slice(0, at)}${token[at] === 'a' ? 'b' : 'a'}${token.slice(at + 1)}`
    expect(isWellFormed(changed, prefix)).toBe(false)
  })

  it("fails for another app's prefix, a missing part, an extra character or a JWT", () => {
    const token = newToken(prefix)
    expect(isWellFormed(token, 'shop_')).toBe(false)
    expect(isWellFormed(token.slice(0, -1), prefix)).toBe(false)
    expect(isWellFormed(`${token}0`, prefix)).toBe(false)
    expect(isWellFormed('eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiIxIn0.c2ln', prefix)).toBe(false)
  })
})

describe('the stored hash', () => {
  it('is the hex SHA-256 of the whole token', async () => {
    expect(await tokenHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
