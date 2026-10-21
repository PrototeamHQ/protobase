import { Hono } from 'hono'
import { issueAuthCode, type CodeChallenge } from './auth-codes'
import type { GoTrueDeps } from './deps'
import { GoTrueError } from './errors'
import { callBetterAuth } from './forward'
import { goTruePath } from './keys'
import { isHandOff, startFlow, takeFlow } from './provider-flows'

// A sign-in with a provider is Better Auth's own: `/authorize` starts it, Better Auth's callback signs the user in, and
// `/callback` here hands the app a session: as a code to trade with its PKCE verifier (`grant_type=pkce`), or, for a
// client without PKCE, in the address's fragment, as GoTrue's implicit flow does. Only at the end of a flow `/authorize`
// started in that browser, proved by its hand-off secret (`provider-flows.ts`), and only for the session Better Auth's
// callback made in it, which ends there: the app holds its own session then, and the browser keeps none. A redirect_to
// that is not https, such as a custom scheme another app can claim too, or that only a pattern of the trusted origins
// matches, such as `https://*.example.com`, gets a code alone, never the session itself.

const challengeOf = (query: Record<string, string>): CodeChallenge | undefined => {
  const challenge = query.code_challenge
  if (!challenge) return undefined
  const method = (query.code_challenge_method ?? 's256').toLowerCase()
  if (method !== 's256' && method !== 'plain') throw new GoTrueError(400, 'validation_failed', 'code_challenge_method must be s256 or plain')
  return { challenge, method }
}

const withParams = (url: string, params: Record<string, string>, where: 'search' | 'hash') => {
  const target = new URL(url)
  const values = new URLSearchParams(where === 'hash' ? target.hash.slice(1) : target.search)
  for (const [name, value] of Object.entries(params)) values.set(name, value)
  target[where] = values.toString()
  return target.toString()
}

export const providerRoutes = ({ auth, context, sessionOf }: GoTrueDeps) => {
  // Where the user goes after signing in: `redirect_to` on an origin the app trusts, else the app itself.
  const destination = async (requested: string | undefined, request: Request) => {
    const own = new URL(request.url).origin
    if (requested && URL.canParse(requested) && (await context()).isTrustedOrigin(requested)) return requested
    return own
  }

  // The implicit flow puts the session itself in the address, so only an https origin the app trusts by name takes it:
  // not a custom scheme another app can claim too, nor every host a pattern matches. A pattern is no name, even for a
  // host spelled like it, such as `https://*.example.com` itself.
  const takesSession = async (redirectTo: string) => {
    const { protocol, origin } = new URL(redirectTo)
    const named = (await context()).trustedOrigins.filter((trusted) => !/[*?]/.test(trusted))
    return protocol === 'https:' && named.includes(origin)
  }

  const implicitFragment = async (userId: string) => {
    const session = await sessionOf((await (await context()).internalAdapter.createSession(userId)).token)
    return { access_token: session.access_token, token_type: 'bearer', expires_in: String(session.expires_in), expires_at: String(session.expires_at), refresh_token: session.refresh_token }
  }

  return new Hono()
    /** `GET /authorize?provider=…`: starts the sign-in with one of the app's sign-in providers. */
    .get('/authorize', async (c) => {
      const query = c.req.query()
      const provider = query.provider ?? ''
      if (!auth.socialProviders.includes(provider)) throw new GoTrueError(400, 'validation_failed', `Unsupported provider: ${provider || 'none'} is not one of this app's`)
      const challenge = challengeOf(query)
      const redirectTo = await destination(query.redirect_to, c.req.raw)
      if (!challenge && !(await takesSession(redirectTo))) throw new GoTrueError(400, 'validation_failed', 'A redirect_to that is not https, or that only a pattern of the trusted origins matches, needs a code_challenge')
      const before = await auth.api.getSession({ headers: c.req.raw.headers })
      const secret = await startFlow(c, await context(), { redirectTo, challenge, sessionBefore: before?.session.id })
      // The hand-off secret goes only where Better Auth sends a successful sign-in; anyone holding a state reaches the error URL.
      const callback = new URL(`${goTruePath}/callback`, c.req.url)
      const success = new URL(callback)
      success.searchParams.set('flow', secret)
      const { json, headers } = await callBetterAuth(auth, c.req.raw, '/sign-in/social', {
        provider,
        callbackURL: success.toString(),
        errorCallbackURL: callback.toString(),
        disableRedirect: true,
        ...(query.scopes && { scopes: query.scopes.split(/[\s,]+/).filter(Boolean) }),
      })
      // Better Auth's state cookie goes with the redirect, for its callback to check.
      for (const cookie of headers.getSetCookie()) c.header('set-cookie', cookie, { append: true })
      return c.redirect(String(json.url), 302)
    })
    /** `GET /callback`: where Better Auth's callback sends the signed-in user; back to the app with a code or a session. */
    .get('/callback', async (c) => {
      const query = c.req.query()
      const ctx = await context()
      const flow = await takeFlow(c, ctx)
      const signedIn = flow && !query.error && (await isHandOff(flow, query.flow)) && (await auth.api.getSession({ headers: c.req.raw.headers }))
      const made = signedIn && signedIn.session.id !== flow.sessionBefore ? signedIn : undefined
      if (!flow || !made) {
        const error = query.error ?? 'access_denied'
        const target = flow?.redirectTo ?? (await destination(query.redirect_to, c.req.raw))
        const where = (flow ? flow.challenge : query.code_challenge) ? 'search' : 'hash'
        return c.redirect(withParams(target, { error, error_code: error, error_description: query.error_description ?? 'The sign-in with the provider did not complete' }, where), 302)
      }
      const { redirectTo, challenge } = flow
      const handOff = challenge
        ? withParams(redirectTo, { code: await issueAuthCode(ctx, made.user.id, challenge) }, 'search')
        : withParams(redirectTo, await implicitFragment(made.user.id), 'hash')
      const { headers } = await auth.api.signOut({ headers: c.req.raw.headers, returnHeaders: true })
      for (const cookie of headers.getSetCookie()) c.header('set-cookie', cookie, { append: true })
      return c.redirect(handOff, 302)
    })
}
