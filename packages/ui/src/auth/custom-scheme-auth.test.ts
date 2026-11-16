import { createAuthSession } from '@protobase/client'
import { describe, expect, it } from 'vitest'
import { customSchemeAuth, isHttpOrigin } from './custom-scheme-auth'

const recording = () => {
  const urls: string[] = []
  const fetcher: typeof fetch = async (input) => {
    urls.push(input instanceof Request ? input.url : String(input))
    return Response.json({})
  }
  return { urls, fetcher }
}

describe('customSchemeAuth', () => {
  it('signs in from a page on an app scheme against that page, where Better Auth alone refuses the base', async () => {
    expect(() => createAuthSession({ origin: 'app://example.test' })).toThrow('Invalid base URL')
    const { urls, fetcher } = recording()
    const scheme = customSchemeAuth({ protocol: 'app:', host: 'example.test' }, fetcher)!
    expect(scheme.origin).toBe('https://example.test')
    const session = createAuthSession(scheme)
    await session.status()
    await session.session()
    expect(urls).toEqual(['app://example.test/api/auth/status', 'app://example.test/api/auth/get-session'])
  })

  it('keeps the path and query, and the host with its port', async () => {
    const { urls, fetcher } = recording()
    const scheme = customSchemeAuth({ protocol: 'app:', host: 'example.test:8080' }, fetcher)!
    expect(scheme.origin).toBe('https://example.test:8080')
    await scheme.fetch('https://example.test:8080/api/auth/x?a=1', { method: 'POST' })
    await scheme.fetch(new Request('https://example.test:8080/api/auth/y'))
    expect(urls).toEqual(['app://example.test:8080/api/auth/x?a=1', 'app://example.test:8080/api/auth/y'])
  })

  it('leaves an http or https page as it is', () => {
    expect(customSchemeAuth({ protocol: 'https:', host: 'example.test' })).toBeUndefined()
    expect(customSchemeAuth({ protocol: 'http:', host: 'localhost:3000' })).toBeUndefined()
  })
})

describe('isHttpOrigin', () => {
  it('is true for an http or https origin only', () => {
    expect(isHttpOrigin('https://example.test')).toBe(true)
    expect(isHttpOrigin('http://localhost:3000')).toBe(true)
    for (const origin of [undefined, 'app://example.test', 'null', '']) expect(isHttpOrigin(origin), String(origin)).toBe(false)
  })
})
