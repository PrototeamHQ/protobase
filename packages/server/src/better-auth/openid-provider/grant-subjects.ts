import type { BetterAuthPlugin } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { base64url, decodeJwt } from 'jose'
import { storedToken } from '../mcp/refresh-reuse'

type Context = { context: { getPlugin: (id: string) => unknown } }
type SignEndpoint = (input: Record<string, unknown>) => Promise<{ response: { token: string } }>

/** The claim an ID token names the device in, from the `device_name` a client passes to the token exchange. */
export const deviceNameClaim = 'device_name'

/** The longest device name an ID token carries, in characters: a longer one is cut there. */
export const deviceNameLength = 64

/** The device name a client passed, trimmed and cut to `deviceNameLength`; `undefined` for none. */
export const deviceNameOf = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return
  return [...value.trim()].slice(0, deviceNameLength).join('')
}

/**
 * The subject of a grant: the client's tokens from one sign-in at the provider, which its refresh tokens and token
 * exchanges keep (the provider's `authorizationCodeId`, the hash of the code it began with). A hash of that alone, so
 * it says nothing of the person or the code, and the same grant always gets the same one, also after the app's secret
 * changes.
 */
export const grantSubject = async (authorizationCodeId: string) =>
  base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`protobase-grant-subject ${authorizationCodeId}`))))

/** Signs `payload` with the app's keys, as the provider signs its own ID tokens, with this request's context. */
export const signIdToken = async (ctx: Context, payload: Record<string, unknown>) => {
  const sign = (ctx.context.getPlugin('jwt') as unknown as { endpoints: { signJWT: SignEndpoint } }).endpoints.signJWT
  // Called as Better Auth's own plugins call another endpoint: with this request's context, answering its body.
  const { response } = await sign({ ...ctx, body: { payload }, asResponse: false, returnHeaders: true })
  return response.token
}

/** `idToken`, which the provider signed, signed again with `sub` and the `extra` claims in place of its own. */
export const resignedIdToken = async (ctx: Context, idToken: string, sub: string, extra: Record<string, unknown> = {}) => signIdToken(ctx, { ...decodeJwt(idToken), ...extra, sub })

type TokenBody = { grant_type?: unknown; code?: unknown; refresh_token?: unknown }

// The token endpoint's answer as it is, or `ctx.json` of it as a hook returned it.
const answerOf = (returned: unknown) => {
  const answer = (returned as { _flag?: unknown; body?: unknown } | null | undefined)?._flag === 'json' ? (returned as { body: unknown }).body : returned
  return typeof answer === 'object' && answer !== null && typeof (answer as { id_token?: unknown }).id_token === 'string' ? (answer as Record<string, unknown> & { id_token: string }) : undefined
}

/**
 * Makes the `sub` of every ID token the token endpoint issues to a client the subject of its grant (`grantSubject`),
 * never the person's id: a fresh sign-in at the provider is a new grant with a new subject, and its refresh tokens keep
 * it. The grant of a code is the code itself, and of a refresh token the one it was issued for, read before the
 * provider rotates it. The token exchange sets its own (`exchangeIdToken`).
 */
export const grantSubjectsPlugin = () => {
  // The grant each request's refresh token belongs to, by the request's context, which both hooks share.
  const grants = new WeakMap<object, string>()
  const matcher = (context: { path?: string; body?: unknown }) => {
    const { grant_type: grant } = (context.body ?? {}) as TokenBody
    return context.path === '/oauth2/token' && (grant === 'authorization_code' || grant === 'refresh_token')
  }
  return {
    id: 'protobase-grant-subjects',
    hooks: {
      before: [
        {
          matcher,
          handler: createAuthMiddleware(async (ctx) => {
            const { grant_type: grant, code, refresh_token: refresh } = (ctx.body ?? {}) as TokenBody
            if (grant === 'authorization_code' && typeof code === 'string') grants.set(ctx.context, await storedToken(code))
            if (grant !== 'refresh_token' || typeof refresh !== 'string') return
            const row = await ctx.context.adapter.findOne<{ authorizationCodeId?: string | null }>({ model: 'oauthRefreshToken', where: [{ field: 'token', value: await storedToken(refresh) }] })
            if (row?.authorizationCodeId) grants.set(ctx.context, row.authorizationCodeId)
          }),
        },
      ],
      after: [
        {
          matcher,
          handler: createAuthMiddleware(async (ctx) => {
            const answer = answerOf(ctx.context.returned)
            const grant = grants.get(ctx.context)
            if (!answer || !grant) return
            return ctx.json({ ...answer, id_token: await resignedIdToken(ctx, answer.id_token, await grantSubject(grant)) })
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}
