import { afterEach, describe, expect, it, vi } from 'vitest'
import { isConnectionString, resolveConnectionUrl } from './connect'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveConnectionUrl', () => {
  it('takes the connection string, or the variable --env names', () => {
    vi.stubEnv('SHOP_URL', 'postgres://shop@localhost/shop')
    expect(resolveConnectionUrl('postgres://a@localhost/a', undefined)).toBe('postgres://a@localhost/a')
    expect(resolveConnectionUrl(undefined, 'SHOP_URL')).toBe('postgres://shop@localhost/shop')
    expect(() => resolveConnectionUrl('postgres://a@localhost/a', 'SHOP_URL')).toThrow('not both')
  })

  it('reads DATABASE_URL without either, as dev does', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://app@localhost/app')
    expect(resolveConnectionUrl(undefined, undefined)).toBe('postgres://app@localhost/app')
  })

  it('says how to pass one when DATABASE_URL is not set either', () => {
    vi.stubEnv('DATABASE_URL', '')
    expect(() => resolveConnectionUrl(undefined, undefined)).toThrow('Pass a connection string or --env <VARIABLE>, or set DATABASE_URL in .env')
    expect(() => resolveConnectionUrl(undefined, 'SHOP_URL')).toThrow('Environment variable SHOP_URL is not set')
  })
})

describe('isConnectionString', () => {
  it('tells a connection string from a target', () => {
    expect(isConnectionString('postgres://shop@localhost:5432/shop')).toBe(true)
    expect(isConnectionString('postgresql://shop@localhost/shop')).toBe(true)
    expect(isConnectionString('public.orders')).toBe(false)
    expect(isConnectionString('all')).toBe(false)
  })
})
