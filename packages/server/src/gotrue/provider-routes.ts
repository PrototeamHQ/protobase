import { Hono } from 'hono'
import { issueAuthCode, type CodeChallenge } from './auth-codes'
import type { GoTrueDeps } from './deps'
import { GoTrueError } from './errors'
import { callBetterAuth } from './forward'
import { goTruePath } from './keys'

// A sign-in with a provider is Better Auth's own: `/authorize` starts it, Better Auth's callback signs the user in, and
// `/callback` here hands the app a session: as a code to trade with its PKCE verifier (`grant_type=pkce`), or, for a
// client without PKCE, in the address's fragment, as GoTrue's implicit flow does.

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

  return new Hono()
    /** `GET /authorize?provider=…`: starts the sign-in with one of the app's sign-in providers. */
    .get('/authorize', async (c) => {
      const query = c.req.query()
      const provider = query.provider ?? ''
      if (!auth.socialProviders.includes(provider)) throw new GoTrueError(400, 'validation_failed', `Unsupported provider: ${provider || 'none'} is not one of this app's`)
      const challenge = challengeOf(query)
      const callback = new URL(`${goTruePath}/callback`, c.req.url)
      callback.searchParams.set('redirect_to', await destination(query.redirect_to, c.req.raw))
      if (challenge) {
        callback.searchParams.set('code_challenge', challenge.challenge)
        callback.searchParams.set('code_challenge_method', challenge.method)
      }
      const { json, headers } = await callBetterAuth(auth, c.req.raw, '/sign-in/social', {
        provider,
        callbackURL: callback.toString(),
        errorCallbackURL: callback.toString(),
        disableRedirect: true,
        ...(query.scopes && { scopes: query.scopes.split(/[\s,]+/).filter(Boolean) }),
      })
      // Better Auth's state cookie goes with the redirect, for its callback to check.
      const response = c.redirect(String(json.url), 302)
      for (const cookie of headers.getSetCookie()) response.headers.append('set-cookie', cookie)
      return response
    })
    /** `GET /callback`: where Better Auth's callback sends the signed-in user; back to the app with a code or a session. */
    .get('/callback', async (c) => {
      const query = c.req.query()
      const target = await destination(query.redirect_to, c.req.raw)
      const challenge = challengeOf(query)
      const where = challenge ? 'search' : 'hash'
      const signedIn = !query.error && (await auth.api.getSession({ headers: c.req.raw.headers }))
      if (!signedIn) {
        const error = query.error ?? 'access_denied'
        return c.redirect(withParams(target, { error, error_code: error, error_description: query.error_description ?? 'The sign-in with the provider did not complete' }, where), 302)
      }
      const ctx = await context()
      if (challenge) return c.redirect(withParams(target, { code: await issueAuthCode(ctx, signedIn.user.id, challenge) }, 'search'), 302)
      const session = await sessionOf((await ctx.internalAdapter.createSession(signedIn.user.id)).token)
      const fragment = { access_token: session.access_token, token_type: 'bearer', expires_in: String(session.expires_in), expires_at: String(session.expires_at), refresh_token: session.refresh_token }
      return c.redirect(withParams(target, fragment, 'hash'), 302)
    })
}
