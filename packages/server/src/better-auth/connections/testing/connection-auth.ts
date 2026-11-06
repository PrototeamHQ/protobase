import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { betterAuthOptions, type CreateAuthOptions } from '../../create-auth'
import { roleDefinitions } from '../../organizations/role-definitions'
import { connectionEvents, type ConnectionListener } from '../connection-events'
import { resolveConnections, type DeclaredConnection } from '../declared-connections'

const password = 'correct horse battery'
export const appOrigin = 'https://admin.example.com'

/** The connection `acme:account`, with an OAuth provider of its own at `origin`, and `acme:google` through the app's Google sign-in. */
export const acmeConnections = (origin: string): DeclaredConnection[] => [
  { plugin: 'acme', name: 'account', declaration: { label: 'Acme account', scopes: ['openid'], oauth: { authorization_url: `${origin}/authorize`, token_url: `${origin}/token`, user_info_url: `${origin}/userinfo`, revocation_url: `${origin}/revoke` } } },
  { plugin: 'acme', name: 'google', declaration: { label: 'Google account', signIn: 'google', scopes: ['https://www.googleapis.com/auth/gmail.readonly'], revocation_url: `${origin}/revoke` } },
]

export const acmeClient = { clientId: 'acme-client', clientSecret: 'acme-client-secret-value' }

/**
 * Better Auth with Protobase's options and the connections of `acmeConnections` on a store in memory, its OAuth calls
 * going to the fake provider at `origin`; Ada and Grace signed in with their passwords, each in a browser of their own.
 */
export const connectionAuth = async (origin: string, { checkOrigin = false, listener }: { checkOrigin?: boolean; listener?: Partial<ConnectionListener> | false } = {}) => {
  const base: CreateAuthOptions = {
    database: undefined,
    baseURL: appOrigin,
    secret: 'test-secret-test-secret-test-secret-1234',
    socialProviders: { google: { clientId: 'client-1.apps.googleusercontent.com', clientSecret: 'google-client-secret-value' } },
    encryptOAuthTokens: true,
    connections: { 'acme:account': acmeClient },
  }
  const store: Record<string, Record<string, unknown>[]> = { user: [], account: [], session: [], verification: [], two_factor: [], passkey: [], sign_in_policy: [], jwks: [] }
  const events = connectionEvents()
  if (listener !== false) events.set({ linked: async () => {}, disconnected: async () => {}, needsSignIn: async () => [], uses: async () => ({}), revokeLater: async () => {}, unrevoked: () => {}, ...listener })
  const resolved = resolveConnections(acmeConnections(origin), base.connections!, base.socialProviders as never, true)
  let instance: { $context: Promise<{ adapter: never }> } | undefined
  const options = betterAuthOptions(base, { roles: ['admin', 'user'], definitions: roleDefinitions(), defaultRole: 'user', context: (() => instance!.$context) as never, connections: { resolved, events, allowPrivateAddresses: true } })
  // Better Auth keeps its rate limits in memory shared by every instance in the process, which other test files read too.
  const auth = betterAuth({ ...options, database: memoryAdapter(store), rateLimit: { ...options.rateLimit, enabled: false }, advanced: { ...options.advanced, disableOriginCheck: !checkOrigin } })
  instance = auth as never

  // A browser of someone signed in: its cookies, and every answer it got, for the checks that none carries a token.
  const browser = async (email: string) => {
    const user = (await auth.api.createUser({ body: { email, password, name: email, role: 'user' } })).user
    const signedIn = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true })
    const cookies = new Map(signedIn.headers.getSetCookie().map((line) => line.split(';')[0]!.split('=') as [string, string]))
    const answers: string[] = []
    const request = async (path: string, init: { method?: string; body?: object; origin?: string; cookies?: boolean; language?: string } = {}) => {
      const headers = { ...(init.cookies !== false && { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') }), origin: init.origin ?? appOrigin, ...(init.body && { 'content-type': 'application/json' }), ...(init.language && { 'accept-language': init.language }) }
      const response = await auth.handler(new Request(`${appOrigin}/api/auth${path}`, { method: init.method ?? 'GET', headers, ...(init.body && { body: JSON.stringify(init.body) }) }))
      for (const line of response.headers.getSetCookie()) cookies.set(...(line.split(';')[0]!.split('=') as [string, string]))
      const text = await response.text()
      answers.push(JSON.stringify([...response.headers]), text)
      return { response, text }
    }
    // Starts connecting `provider`, as the account page does: the provider's URL, whose state comes back on the callback.
    const startConnect = async (provider: string, body: object = {}) => {
      const start = await request('/link-social', { method: 'POST', body: { provider, callbackURL: '/account', errorCallbackURL: '/account', disableRedirect: true, ...body } })
      return { start, url: start.response.ok ? new URL((JSON.parse(start.text) as { url: string }).url) : undefined }
    }
    return { user, request, answers, startConnect, cookies }
  }
  return { auth, store, browser, resolved }
}
