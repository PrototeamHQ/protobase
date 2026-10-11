import { describe, expect, it } from 'vitest'
import { multiHostBaseURL, readOrigins, resolveOrigins } from './origins'

describe('readOrigins', () => {
  it('reads the comma-separated list, blanks left out', () => {
    expect(readOrigins({ PROTOBASE_ORIGINS: ' https://a.example.com, ,https://b.example.com ' })).toEqual(['https://a.example.com', 'https://b.example.com'])
    expect(readOrigins({})).toEqual([])
  })
})

describe('resolveOrigins', () => {
  it('keeps only the origin of each, without baseURL and repeats', () => {
    const origins = ['https://Admin.Shop.com/', 'https://erp.protobase.net', 'https://admin.shop.com', 'https://shop.com:8443/path']
    expect(resolveOrigins('https://erp.protobase.net', origins)).toEqual(['https://admin.shop.com', 'https://shop.com:8443'])
  })

  it('refuses what is not an origin of the same scheme as baseURL', () => {
    expect(() => resolveOrigins('https://erp.protobase.net', ['admin.shop.com'])).toThrow('must be a URL')
    expect(() => resolveOrigins('https://erp.protobase.net', ['ftp://admin.shop.com'])).toThrow('http or https')
    expect(() => resolveOrigins('https://erp.protobase.net', ['http://admin.shop.com'])).toThrow('must use https')
  })
})

describe('multiHostBaseURL', () => {
  it('is baseURL itself without other origins', () => {
    expect(multiHostBaseURL('https://erp.protobase.net', [])).toBe('https://erp.protobase.net')
  })

  it('allows the host of baseURL and of every origin, and falls back to baseURL', () => {
    expect(multiHostBaseURL('https://erp.protobase.net', ['https://admin.shop.com', 'https://shop.com:8443'])).toEqual({
      allowedHosts: ['erp.protobase.net', 'admin.shop.com', 'shop.com:8443'],
      fallback: 'https://erp.protobase.net',
      protocol: 'https',
    })
    expect(multiHostBaseURL('http://localhost:5173', ['http://127.0.0.1:5173'])).toMatchObject({ protocol: 'http' })
  })
})
