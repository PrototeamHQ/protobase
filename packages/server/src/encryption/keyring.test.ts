import { describe, expect, it } from 'vitest'
import { encryptionKeyring } from './keyring'

const keyA = Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString('base64')
const keyB = Buffer.from(Array.from({ length: 32 }, (_, i) => 255 - i)).toString('base64')

const failure = (env: Record<string, string>) => {
  try {
    encryptionKeyring(env)
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected the keyring to fail')
}

describe('encryptionKeyring', () => {
  it('derives a stable 8-character id, and keeps previous keys by id', () => {
    const ring = encryptionKeyring({ PROTOBASE_ENCRYPTION_KEY: keyA, PROTOBASE_ENCRYPTION_PREVIOUS_KEYS: ` ${keyB} ` })
    expect(ring.current.id).toMatch(/^[A-Za-z0-9_-]{8}$/)
    expect(encryptionKeyring({ PROTOBASE_ENCRYPTION_KEY: keyA }).current.id).toBe(ring.current.id)
    expect([...ring.byId.keys()]).toEqual([ring.current.id, encryptionKeyring({ PROTOBASE_ENCRYPTION_KEY: keyB }).current.id])
    expect(ring.current.aes).toHaveLength(32)
    expect(ring.current.aes.equals(Buffer.from(keyA, 'base64'))).toBe(false)
  })

  it.each([
    ['31 bytes', { PROTOBASE_ENCRYPTION_KEY: Buffer.from(Array.from({ length: 31 }, (_, i) => i)).toString('base64') }, 'PROTOBASE_ENCRYPTION_KEY is not 32 bytes'],
    ['33 bytes', { PROTOBASE_ENCRYPTION_KEY: Buffer.from(Array.from({ length: 33 }, (_, i) => i)).toString('base64') }, 'PROTOBASE_ENCRYPTION_KEY is not 32 bytes'],
    ['the url alphabet', { PROTOBASE_ENCRYPTION_KEY: Buffer.from(keyB, 'base64').toString('base64url') }, 'PROTOBASE_ENCRYPTION_KEY is not 32 bytes'],
    ['non-canonical base64', { PROTOBASE_ENCRYPTION_KEY: `!${keyA}` }, 'PROTOBASE_ENCRYPTION_KEY is not 32 bytes'],
    ['an empty previous entry', { PROTOBASE_ENCRYPTION_KEY: keyA, PROTOBASE_ENCRYPTION_PREVIOUS_KEYS: `${keyB},` }, 'PROTOBASE_ENCRYPTION_PREVIOUS_KEYS entry 2 is empty'],
    ['a key twice', { PROTOBASE_ENCRYPTION_KEY: keyA, PROTOBASE_ENCRYPTION_PREVIOUS_KEYS: keyA }, 'PROTOBASE_ENCRYPTION_PREVIOUS_KEYS entry 1 is a key given before'],
    ['the sign-in secret', { PROTOBASE_ENCRYPTION_KEY: keyA, PROTOBASE_SECRET: keyA }, 'PROTOBASE_ENCRYPTION_KEY is the same as PROTOBASE_SECRET'],
    ['the API secret key', { PROTOBASE_ENCRYPTION_KEY: keyA, PROTOBASE_ENCRYPTION_PREVIOUS_KEYS: keyB, PROTOBASE_SECRET_KEY: keyB }, 'PROTOBASE_ENCRYPTION_PREVIOUS_KEYS entry 1 is the same as PROTOBASE_SECRET_KEY'],
    ['32 identical bytes', { PROTOBASE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }, 'PROTOBASE_ENCRYPTION_KEY is 32 identical bytes'],
  ])('refuses %s, naming the variable but not the key', (_, env, message) => {
    const text = failure(env)
    expect(text).toContain(message)
    for (const value of Object.values(env)) expect(text).not.toContain(value.replace(',', ''))
  })
})
