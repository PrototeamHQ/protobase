import { APIError } from 'better-auth/api'
import { describe, expect, it, vi } from 'vitest'
import { betterAuthSessionToken } from './session-token'

const request = new Request('http://app.example.com/api/functions/chat', { headers: { cookie: 'session=1', host: 'app.example.com' } })

const signedIn = async () => ({ session: { id: 's1' }, user: { id: 'u1' } })

const exchange = (getToken: () => Promise<{ token: string }>) => betterAuthSessionToken({ api: { getSession: vi.fn(signedIn), getToken: vi.fn(getToken) } })

describe('betterAuthSessionToken', () => {
  it('reads the session without refreshing it, then mints its token with the request’s headers', async () => {
    const getSession = vi.fn(signedIn)
    const getToken = vi.fn(async () => ({ token: 'jwt' }))
    expect(await betterAuthSessionToken({ api: { getSession, getToken } })(request)).toBe('jwt')
    expect(getSession).toHaveBeenCalledWith({ headers: request.headers, query: { disableRefresh: true } })
    expect(getToken).toHaveBeenCalledWith({ headers: request.headers })
  })

  it('turns a cookie with no session into a 401 problem without minting a token', async () => {
    const getToken = vi.fn(async () => ({ token: 'jwt' }))
    const exchange = betterAuthSessionToken({ api: { getSession: async () => null, getToken } })
    await expect(exchange(request)).rejects.toMatchObject({ status: 401, slug: 'unauthenticated' })
    expect(getToken).not.toHaveBeenCalled()
  })

  it('keeps an error of the session read as it is', async () => {
    const failure = new APIError('INTERNAL_SERVER_ERROR')
    const getToken = vi.fn(async () => ({ token: 'jwt' }))
    const exchange = betterAuthSessionToken({ api: { getSession: () => Promise.reject(failure), getToken } })
    await expect(exchange(request)).rejects.toBe(failure)
    expect(getToken).not.toHaveBeenCalled()
  })

  it('turns no session into a 401 problem, and a refusal into a 403 with Better Auth’s message', async () => {
    await expect(exchange(() => Promise.reject(new APIError('UNAUTHORIZED')))(request)).rejects.toMatchObject({ status: 401, slug: 'unauthenticated' })
    const refusal = new APIError('FORBIDDEN', { code: 'SIGN_IN_SETUP_REQUIRED', message: 'Set up two-factor first' })
    await expect(exchange(() => Promise.reject(refusal))(request)).rejects.toMatchObject({ status: 403, slug: 'sign-in-refused', detail: 'Set up two-factor first' })
  })

  it('keeps every other error as it is', async () => {
    for (const error of [new APIError('TOO_MANY_REQUESTS'), new APIError('INTERNAL_SERVER_ERROR'), new Error('store down')]) {
      await expect(exchange(() => Promise.reject(error))(request)).rejects.toBe(error)
    }
  })
})
