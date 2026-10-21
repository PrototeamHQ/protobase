import { describe, expect, it, vi } from 'vitest'
import { unauthorized } from '../problem'
import type { Session } from '../types'
import { upgradeAuthenticator } from './upgrade-caller'

const ann: Session = { user: { id: 'ann', roles: [] } }

const setup = (origins?: readonly string[]) => {
  const seen: Request[] = []
  const authenticate = vi.fn((request: Request) => {
    seen.push(request)
    if (!request.headers.get('authorization')) throw unauthorized('Missing or invalid bearer token')
    return ann
  })
  const sessionToken = vi.fn(async () => 'minted')
  return { authenticate, sessionToken, seen, resolve: upgradeAuthenticator({ authenticate, sessionToken, ...(origins && { origins }) }) }
}

const upgrade = (headers: Record<string, string>) => new Request('http://app.example.com/api/functions/chat', { headers: { upgrade: 'websocket', ...headers } })

describe('upgradeAuthenticator', () => {
  it('refuses a foreign origin with 403 before anything else runs, a listed host on another scheme or port too', async () => {
    const { authenticate, sessionToken, resolve } = setup(['https://app.example.com'])
    for (const origin of ['https://evil.example', 'http://app.example.com', 'https://app.example.com:8443', 'null']) {
      await expect(resolve(upgrade({ origin, cookie: 'session=1' }))).rejects.toMatchObject({ status: 403, slug: 'foreign-origin' })
    }
    expect(authenticate).not.toHaveBeenCalled()
    expect(sessionToken).not.toHaveBeenCalled()
  })

  it('without a list, admits an origin on the request’s own host only', async () => {
    const { resolve } = setup()
    await expect(resolve(upgrade({ origin: 'https://app.example.com', authorization: 'Bearer ok' }))).resolves.toBe(ann)
    for (const origin of ['https://evil.example', 'null']) {
      await expect(resolve(upgrade({ origin, authorization: 'Bearer ok' }))).rejects.toMatchObject({ status: 403 })
    }
  })

  it('admits a request without an origin, which is no browser', async () => {
    const { resolve } = setup(['https://app.example.com'])
    await expect(resolve(upgrade({ authorization: 'Bearer ok' }))).resolves.toBe(ann)
  })

  it('prefers the bearer token over the cookie', async () => {
    const { sessionToken, seen, resolve } = setup(['https://app.example.com'])
    await resolve(upgrade({ origin: 'https://app.example.com', authorization: 'Bearer own', cookie: 'session=1' }))
    expect(sessionToken).not.toHaveBeenCalled()
    expect(seen[0]!.headers.get('authorization')).toBe('Bearer own')
  })

  it('exchanges the cookie for a token and authenticates with it and every other header of the request', async () => {
    const { sessionToken, seen, resolve } = setup(['https://app.example.com'])
    const request = upgrade({ origin: 'https://app.example.com', cookie: 'session=1', 'x-forwarded-for': '203.0.113.9' })
    await expect(resolve(request)).resolves.toBe(ann)
    expect(sessionToken).toHaveBeenCalledWith(request)
    const headers = seen[0]!.headers
    expect([headers.get('authorization'), headers.get('cookie'), headers.get('x-forwarded-for'), headers.get('origin')]).toEqual(['Bearer minted', 'session=1', '203.0.113.9', 'https://app.example.com'])
    expect(seen[0]!.url).toBe(request.url)
  })

  it('leaves a request with neither to the authenticator’s 401', async () => {
    const { sessionToken, resolve } = setup(['https://app.example.com'])
    await expect(resolve(upgrade({ origin: 'https://app.example.com' }))).rejects.toMatchObject({ status: 401 })
    expect(sessionToken).not.toHaveBeenCalled()
  })
})
