import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { decodeJwt } from 'jose'
import { deviceSignedOut, isRefusedAccount, saveDeviceSession } from './platform-devices'
import type { SignInRefusal } from './sign-in-enforcement'
import { invalidSignInToken, verifySignInToken, type IdTokenVerification } from './sign-in-token'
import { saveTokenSession, useSignInToken } from './sign-in-token-uses'

// Better Auth signs in, or links, with an ID token a client posts instead of sending the browser through the provider.
const idTokenPaths = ['/sign-in/social', '/link-social']

export const tokenSignInOff: SignInRefusal = { code: 'TOKEN_SIGN_IN_OFF', message: 'Signing in with an ID token is turned off for this app.' }

export const signInTokenUsed: SignInRefusal = { code: 'TOKEN_USED', message: 'This sign-in token has been used already.' }

/** Whether a request to `path` with `body` posts an ID token to sign in or link with. */
export const postsIdToken = (path: string | undefined, body: unknown) =>
  path !== undefined && idTokenPaths.includes(path) && typeof body === 'object' && body !== null && (body as { idToken?: unknown }).idToken !== undefined

/** The one of `providers` a request that posts an ID token signs in with, if any: a token sign-in is never a link. */
export const tokenSignInWith = <Provider extends { provider: string }>(path: string, body: unknown, providers: Provider[]) =>
  path === '/sign-in/social' ? providers.find(({ provider }) => (body as { provider?: unknown }).provider === provider) : undefined

export type IdTokenSignInOptions = {
  /**
   * The platform sign-in providers whose ID tokens sign in (`PlatformSignIn.tokenSignIn`): each one's id and client id,
   * and whether its accounts are devices (`PlatformSignIn.devices`).
   */
  tokenSignIn?: { provider: string; clientId: string; devices?: boolean }[]
}

type Provider = { id: string; idToken?: IdTokenVerification | { verify: unknown } }

/**
 * Refuses signing in or linking with a posted ID token (`403 TOKEN_SIGN_IN_OFF`), for every provider but those
 * `tokenSignIn` names, and only for signing in: Better Auth accepts one from any provider that verifies ID tokens,
 * without a nonce or a limit on replay. A token posted for one of those providers must be a sign-in token for this
 * app from that provider alone, verified against its own issuer, keys and client id (`verifySignInToken`), else `401
 * INVALID_TOKEN`, and signs in once, else `401 TOKEN_USED`; a device the person signed out never signs in again, `403
 * DEVICE_SIGNED_OUT`. Then Better Auth signs in the person it links to, never signing anyone up. The session it starts is noted as a token session, which never
 * counts as recently signed in (`isRecentlyConfirmed`).
 */
export const idTokenSignInPlugin = ({ tokenSignIn = [] }: IdTokenSignInOptions = {}) =>
  ({
    id: 'protobase-id-token-sign-in',
    hooks: {
      before: [
        {
          matcher: (context) => context.path !== undefined && idTokenPaths.includes(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            if (!postsIdToken(ctx.path, ctx.body)) return
            const signIn = tokenSignInWith(ctx.path, ctx.body, tokenSignIn)
            if (!signIn) throw new APIError('FORBIDDEN', tokenSignInOff)
            const token = (ctx.body as { idToken?: { token?: unknown } }).idToken?.token
            const provider = (ctx.context.socialProviders as Provider[]).find(({ id }) => id === signIn.provider)
            // A provider whose discovery failed at startup is not there; Better Auth answers that it is not found.
            if (!provider) return
            const verification = provider.idToken && !('verify' in provider.idToken) ? provider.idToken : undefined
            const claims = typeof token === 'string' && verification ? await verifySignInToken(token, verification, signIn.clientId) : undefined
            if (!claims) throw new APIError('UNAUTHORIZED', invalidSignInToken)
            if (signIn.devices && (await isRefusedAccount(ctx.context, signIn.provider, claims.sub!))) throw new APIError('FORBIDDEN', deviceSignedOut)
            if (!(await useSignInToken(ctx.context, { ...claims, iss: claims.iss!, exp: claims.exp! }))) throw new APIError('UNAUTHORIZED', signInTokenUsed)
          }),
        },
      ],
      after: [
        {
          matcher: (context) => context.path === '/sign-in/social',
          handler: createAuthMiddleware(async (ctx) => {
            // No new session when it was refused, or while the second step is due (the two-factor plugin ended it).
            const session = ctx.context.newSession?.session
            if (tokenSignIn.length === 0 || !session || !postsIdToken(ctx.path, ctx.body)) return
            await saveTokenSession(ctx.context, session)
            const signIn = tokenSignInWith(ctx.path, ctx.body, tokenSignIn)
            if (!signIn?.devices) return
            // Verified before Better Auth signed in with it, so its subject names the device's account.
            const { sub } = decodeJwt((ctx.body as { idToken: { token: string } }).idToken.token)
            const account = await ctx.context.internalAdapter.findAccountByKey({ providerId: signIn.provider, accountId: sub! })
            if (account) await saveDeviceSession(ctx.context, session, account.id)
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
