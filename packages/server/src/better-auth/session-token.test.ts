import { APIError } from 'better-auth/api'
import { describe, expect, it, vi } from 'vitest'
import { betterAuthSessionToken } from './session-token'

const request = new Request('http://app.example.com/api/functions/chat', { headers: { cookie: 'session=1', host: 'app.example.com' } })

const exchange = (getToken: () => Promise<{ token: string }>) => betterAuthSessionToken({ api: { getToken: vi.fn(getToken) } })

describe('betterAuthSessionToken', () => {
  it('mints the session’s token with the request’s headers', async () => {
    const getToken = vi.fn(async () => ({ token: 'jwt' }))
    expect(await betterAuthSessionToken({ api: { getToken } })(request)).toBe('jwt')
    expect(getToken).toHaveBeenCalledWith({ headers: request.headers })
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
