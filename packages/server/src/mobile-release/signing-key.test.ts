import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { mobileSigningKeyVariable, readSigningKey } from './signing-key'

const pem = (type: 'rsa' | 'ec', bits = 2048) =>
  (type === 'rsa' ? generateKeyPairSync('rsa', { modulusLength: bits }) : generateKeyPairSync('ec', { namedCurve: 'P-256' })).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

const read = (value: string | undefined) => readSigningKey({ [mobileSigningKeyVariable]: value })

describe('readSigningKey', () => {
  it('is undefined unset or empty', () => {
    expect(read(undefined)).toBeUndefined()
    expect(read(' ')).toBeUndefined()
  })

  it('reads an RSA key with real newlines or \\n escapes', () => {
    const key = pem('rsa')
    expect(read(key)?.asymmetricKeyType).toBe('rsa')
    expect(read(key.trim().replace(/\n/g, '\\n'))?.asymmetricKeyType).toBe('rsa')
  })

  it('stops on a value that is no key, a key that is not RSA or one under 2048 bits', () => {
    expect(() => read('not a key')).toThrow(`${mobileSigningKeyVariable} is no PEM private key`)
    expect(() => read(pem('ec'))).toThrow(/must be an RSA private key/)
    expect(() => read(pem('rsa', 1024))).toThrow(/at least 2048 bits, not 1024/)
  })
})
