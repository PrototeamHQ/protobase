import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { betterAuthOptions } from '../better-auth/create-auth'
import { roleDefinitions } from '../better-auth/organizations/role-definitions'
import { gmailSendScope, gmailSendUrl } from './gmail'
import { json, sentMessage } from './gmail-responses'
import { betterAuthLinkedAccounts, type TokenAuth } from './linked-accounts'
import { resolvePersonalMail } from './personal-mail-providers'
import { personalMailer } from './personal-mailer'

const tokenEndpoint = 'https://oauth2.googleapis.com/token'

// Better Auth with Protobase's options and Google sign-in, and a user who linked Gmail an hour ago: their access token
// has expired, the refresh token is what Google gave.
const linkedUser = async () => {
  const options = { database: undefined, baseURL: 'https://admin.example.com', secret: 'test-secret-test-secret-test-secret-1234', socialProviders: { google: { clientId: 'client-1.apps.googleusercontent.com', clientSecret: 'client-secret' } } }
  const authOptions = betterAuthOptions(options, { roles: ['admin', 'user'], definitions: roleDefinitions(), defaultRole: 'user' })
  const auth = betterAuth({ ...authOptions, plugins: [], database: memoryAdapter({ user: [], account: [], session: [], verification: [] }) })
  const context = await auth.$context
  const user = await context.internalAdapter.createUser({ email: 'ada@example.com', name: 'Ada', emailVerified: true, role: 'user' }, { method: 'admin' })
  const account = await context.internalAdapter.createAccount({
    userId: user.id,
    providerId: 'google',
    accountId: 'google-sub-1',
    accessToken: 'expired-access',
    refreshToken: 'refresh-1',
    accessTokenExpiresAt: new Date(Date.now() - 60_000),
    scope: `openid,email,profile,${gmailSendScope}`,
  })
  const mailer = personalMailer(betterAuthLinkedAccounts(auth as unknown as TokenAuth), resolvePersonalMail(['gmail'], ['google'], true), user.id)
  return { context, account, mailer }
}

const message = { to: 'bob@example.com', subject: 'Invoice 7', text: 'Attached.', attachments: [{ filename: 'invoice-7.pdf', content: new Uint8Array([37, 80, 68, 70]), contentType: 'application/pdf' }] }

// Google's token endpoint answers the refresh with `token`, and Gmail takes the message.
const google = (token: () => Response) => {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    calls.push({ url, ...(init && { init }) })
    if (url === tokenEndpoint) return token()
    if (url === gmailSendUrl) return json(sentMessage)
    throw new Error(`Unexpected request to ${url}`)
  })
  return calls
}

const authorizationOf = (init?: RequestInit) => new Headers(init?.headers).get('authorization')

describe('mail from a linked Gmail, with Better Auth keeping the tokens', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('refreshes an expired access token before sending, and stores the new one', async () => {
    const calls = google(() => json({ access_token: 'fresh-access', expires_in: 3599, scope: `openid ${gmailSendScope}`, token_type: 'Bearer' }))
    const { context, account, mailer } = await linkedUser()
    await mailer.send(message)

    expect(calls.map(({ url }) => url)).toEqual([tokenEndpoint, gmailSendUrl])
    expect(String(calls[0]!.init?.body)).toContain('refresh_token=refresh-1')
    expect(authorizationOf(calls[1]!.init)).toBe('Bearer fresh-access')
    const stored = (await context.internalAdapter.findAccounts(account.userId)).find(({ id }) => id === account.id)!
    expect(stored.accessToken).toBe('fresh-access')
    expect(stored.accessTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it('is link_expired, sending nothing, when Google refuses the refresh token', async () => {
    const calls = google(() => json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400))
    const { mailer } = await linkedUser()
    await expect(mailer.send(message)).rejects.toMatchObject({ code: 'link_expired', provider: 'gmail' })
    expect(calls.map(({ url }) => url)).toEqual([tokenEndpoint])
  })
})
