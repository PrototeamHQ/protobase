import { exportJWK, generateKeyPair, SignJWT, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose'
import { jwtVerify } from 'jose'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cachedKeys } from './better-auth/jwks-cache'

const makeKey = async (kid: string) => {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true })
  return { kid, privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg: 'EdDSA' } }
}
const sign = (key: Awaited<ReturnType<typeof makeKey>>) => new SignJWT({}).setProtectedHeader({ alg: 'EdDSA', kid: key.kid }).setExpirationTime('5m').sign(key.privateKey)
const verifies = (keys: JWTVerifyGetKey, token: string) => jwtVerify(token, keys).then(() => true, () => false)

afterEach(() => { vi.useRealTimers() })

describe('cachedKeys', () => {
  it('reads the key set once for many verifications', async () => {
    const key = await makeKey('a')
    const load = vi.fn(async (): Promise<JSONWebKeySet> => ({ keys: [key.jwk] }))
    const keys = cachedKeys(load)
    const token = await sign(key)
    const results = await Promise.all(Array.from({ length: 50 }, () => verifies(keys, token)))
    expect(results.every(Boolean)).toBe(true)
    expect(await verifies(keys, token)).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('picks up a rotated key through one reload on an unknown kid', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const [old, rotated] = [await makeKey('old'), await makeKey('new')]
    let published: JSONWebKeySet = { keys: [old.jwk] }
    const load = vi.fn(async () => published)
    const keys = cachedKeys(load, { minReloadMs: 30_000 })
    expect(await verifies(keys, await sign(old))).toBe(true)
    published = { keys: [old.jwk, rotated.jwk] }
    vi.setSystemTime(Date.now() + 31_000)
    expect(await verifies(keys, await sign(rotated))).toBe(true)
    expect(load).toHaveBeenCalledTimes(2)
    expect(await verifies(keys, await sign(rotated))).toBe(true)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('reloads at most once per interval however many unknown kids arrive', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const known = await makeKey('known')
    const load = vi.fn(async (): Promise<JSONWebKeySet> => ({ keys: [known.jwk] }))
    const keys = cachedKeys(load, { minReloadMs: 30_000, refreshMs: 600_000 })
    expect(await verifies(keys, await sign(known))).toBe(true)
    const strangers = await Promise.all(Array.from({ length: 40 }, (_, i) => makeKey(`stranger-${i}`)))
    const flood = async () => Promise.all(strangers.map(async (stranger) => verifies(keys, await sign(stranger))))
    expect((await flood()).some(Boolean)).toBe(false)
    expect(load).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 31_000)
    expect((await flood()).some(Boolean)).toBe(false)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('refreshes on a timer so a removed key stops being accepted', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const [kept, removed] = [await makeKey('kept'), await makeKey('removed')]
    let published: JSONWebKeySet = { keys: [kept.jwk, removed.jwk] }
    const keys = cachedKeys(async () => published, { refreshMs: 600_000 })
    const token = await sign(removed)
    expect(await verifies(keys, token)).toBe(true)
    published = { keys: [kept.jwk] }
    expect(await verifies(keys, token)).toBe(true)
    vi.setSystemTime(Date.now() + 601_000)
    expect(await verifies(keys, token)).toBe(false)
  })
})
