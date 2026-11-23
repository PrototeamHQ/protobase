import { describe, expect, it } from 'vitest'
import { mintSecret, secretHash } from './verification-secret'

describe('a verification secret', () => {
  it('is 256 random bits, a new one each time', () => {
    const secrets = Array.from({ length: 1000 }, mintSecret)
    expect(new Set(secrets).size).toBe(1000)
    for (const secret of secrets.slice(0, 20)) expect(Buffer.from(secret, 'base64url')).toHaveLength(32)
  })

  it('is kept only as its SHA-256, which is not the secret', async () => {
    const secret = mintSecret()
    const hash = await secretHash(secret)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(secret)
    expect(await secretHash(secret)).toBe(hash)
  })
})
