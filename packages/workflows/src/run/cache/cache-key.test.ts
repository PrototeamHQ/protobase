import { describe, expect, it } from 'vitest'
import { cacheKey } from './cache-key'
import { cacheSeconds } from './cache-ttl'
import { secretNamer } from './secret-names'

const none = secretNamer({})
const key = async (value: unknown, shape: Parameters<typeof cacheKey>[1] = { input: true }, namer = none) => (await cacheKey('acme:get', shape, value, namer))?.key

describe('cacheKey', () => {
  it('is the same for the same values read, whatever else the input holds', async () => {
    const reads = { reads: [['url']] }
    expect(await key({ url: 'a', extra: 1 }, reads)).toBe(await key({ url: 'a', extra: 2 }, reads))
    expect(await key({ url: 'a' }, reads)).not.toBe(await key({ url: 'b' }, reads))
  })

  it('differs for a header that differs, such as the caller or the authorization', async () => {
    const reads = { reads: [['headers', 'authorization'], ['url']] }
    expect(await key({ url: 'a', headers: { authorization: 'Bearer one' } }, reads)).not.toBe(await key({ url: 'a', headers: { authorization: 'Bearer two' } }, reads))
  })

  it('tells a missing value from a null one, and keys by structure, so no join of values collides', async () => {
    const reads = { reads: [['a'], ['b']] }
    expect(await key({ a: null }, reads)).not.toBe(await key({}, reads))
    expect(await key({ a: 'x', b: 'y' }, reads)).not.toBe(await key({ a: 'x|y', b: '' }, reads))
    expect(await key({ a: 'x","b":"y' })).not.toBe(await key({ a: 'x', b: 'y' }))
    expect(await key({ a: 1 }, { reads: [['a']] })).not.toBe(await key({ a: 1 }, { input: true }))
  })

  it('is the same whatever the order of keys', async () => {
    expect(await key({ a: 1, b: { c: 2, d: 3 } })).toBe(await key({ b: { d: 3, c: 2 }, a: 1 }))
  })

  it('holds a secret by its name, never its value, and tells two secrets apart', async () => {
    const namer = secretNamer({ API_KEY: 'key-one-1234', OTHER_KEY: 'key-two-5678' })
    const one = await cacheKey('acme:get', { input: true }, { auth: 'Bearer key-one-1234' }, namer)
    expect(one?.secrets).toEqual(['API_KEY'])
    expect(one?.key).toBe(await key({ auth: 'Bearer [secret:API_KEY]' }))
    expect(one?.key).not.toBe((await cacheKey('acme:get', { input: true }, { auth: 'Bearer key-two-5678' }, namer))?.key)
    expect(namer({ auth: 'Bearer key-one-1234' }).value).toEqual({ auth: 'Bearer [secret:API_KEY]' })
  })

  it('gives no key for a value with no JSON form', async () => {
    expect(await key(() => 1, { custom: true })).toBeUndefined()
    expect(await key(10n, { custom: true })).toBeUndefined()
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect(await key(cycle, { custom: true })).toBeUndefined()
  })
})

describe('cacheSeconds', () => {
  it('reads seconds and durations, capped at 30 days', () => {
    expect(cacheSeconds(90)).toBe(90)
    expect(cacheSeconds('10 minutes')).toBe(600)
    expect(cacheSeconds('400 days')).toBe(30 * 24 * 3600)
  })

  it('gives nothing for a missing, zero, negative or unreadable time, so nothing is kept forever', () => {
    for (const ttl of [undefined, null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY, '0 seconds', 'soon', '5', {}]) expect(cacheSeconds(ttl)).toBeUndefined()
  })
})
