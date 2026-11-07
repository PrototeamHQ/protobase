import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { betterAuthOptions } from '../../better-auth/create-auth'
import { roleDefinitions } from '../../better-auth/organizations/role-definitions'
import { refreshRefusalsPlugin } from '../../better-auth/refresh-refusals'
import type { TokenAuth } from '../../personal-mail/linked-accounts'
import { betterAuthConnectionAccounts } from './connection-accounts'

const tokenEndpoint = 'https://oauth2.googleapis.com/token'
const secret = 'test-secret-test-secret-test-secret-1234'

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// Better Auth with Protobase's options and Ada's Google account whose access token is valid
// for another half hour; Google's token endpoint answers a refresh with `token`.
const connected = async (token: () => Response) => {
  const calls: { url: string; body: string }[] = []
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    calls.push({ url, body: String(init?.body) })
    if (url === tokenEndpoint) return token()
    throw new Error(`Unexpected request to ${url}`)
  })
  const options = { database: undefined, baseURL: 'https://admin.example.com', secret, socialProviders: { google: { clientId: 'client-1.apps.googleusercontent.com', clientSecret: 'client-secret' } } }
  const authOptions = betterAuthOptions(options, { roles: ['admin', 'user'], definitions: roleDefinitions(), defaultRole: 'user' })
  const auth = betterAuth({ ...authOptions, plugins: [...(authOptions.plugins ?? []), refreshRefusalsPlugin()], database: memoryAdapter({ user: [], account: [], session: [], verification: [] }) })
  const context = await auth.$context
  const user = await context.internalAdapter.createUser({ email: 'ada@example.com', name: 'Ada', emailVerified: true, role: 'user' }, { method: 'admin' })
  const account = await context.internalAdapter.createAccount({
    userId: user.id,
    providerId: 'google',
    accountId: 'google-sub-1',
    accessToken: 'valid-access',
    refreshToken: 'refresh-1',
    accessTokenExpiresAt: new Date(Date.now() + 30 * 60_000),
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
  })
  const stored = async () => (await context.internalAdapter.findAccounts(user.id)).find(({ id }) => id === account.id)!
  return { accounts: betterAuthConnectionAccounts(auth as unknown as TokenAuth), userId: user.id, accountId: account.id, calls, stored }
}

describe('betterAuthConnectionAccounts, forcing a refresh', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('refreshes a token that has not expired yet, and keeps the stored refresh token when Google answers none', async () => {
    const { accounts, userId, accountId, calls, stored } = await connected(() => json({ access_token: 'fresh-access', expires_in: 3599, scope: 'https://www.googleapis.com/auth/gmail.readonly', token_type: 'Bearer' }))
    expect(await accounts.accessToken(userId, accountId, { refresh: true })).toBe('fresh-access')
    expect(calls.map(({ url }) => url)).toEqual([tokenEndpoint])
    expect(calls[0]!.body).toContain('refresh_token=refresh-1')
    expect((await stored()).refreshToken).toBe('refresh-1')
    // And the next refresh still sends it.
    await accounts.accessToken(userId, accountId, { refresh: true })
    expect(calls[1]!.body).toContain('refresh_token=refresh-1')
  })

  it('asks Google nothing without refresh while the token is valid', async () => {
    const { accounts, userId, accountId, calls } = await connected(() => json({ access_token: 'fresh-access', expires_in: 3599, token_type: 'Bearer' }))
    expect(await accounts.accessToken(userId, accountId)).toBe('valid-access')
    expect(calls).toEqual([])
  })

  it('gives no token when Google refuses the refresh token', async () => {
    const { accounts, userId, accountId } = await connected(() => json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400))
    expect(await accounts.accessToken(userId, accountId, { refresh: true })).toBeUndefined()
  })

  it('fails, naming no token or answer of Google, when Google is down, so the link stays', async () => {
    const { accounts, userId, accountId } = await connected(() => json({ error: 'backend_error', error_description: 'refresh-1 down' }, 503))
    const failure = await accounts.accessToken(userId, accountId, { refresh: true }).catch((error: unknown) => error)
    expect(failure).toMatchObject({ body: { code: 'FAILED_TO_REFRESH_ACCESS_TOKEN' } })
    expect(JSON.stringify(failure) + String(failure)).not.toMatch(/refresh-1|backend_error/)
  })
})
