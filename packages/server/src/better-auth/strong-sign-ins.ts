import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import type { AuthContext } from './organizations/store'
import { isStaffSession } from './staff-checks'

const twoFactorPaths = ['/two-factor/verify-totp', '/two-factor/verify-otp', '/two-factor/verify-backup-code']

/**
 * The Better Auth endpoints that prove a passkey or a second step: each signs in a new session, or confirms the one the
 * request's cookie names, as the second step does for someone signed in already.
 */
export const strongSignInPaths = ['/passkey/verify-authentication', ...twoFactorPaths]

type Internal = Pick<AuthContext['internalAdapter'], 'createVerificationValue' | 'deleteVerificationByIdentifier' | 'findVerificationValue'>

// Kept in Better Auth's verification table, which every store has, so recording them needs no migration.
const identifierOf = (sessionId: string) => `protobase-strong-sign-in-${sessionId}`

/** Notes that the session proved a passkey or a second step now; the note ends with the session. */
export const saveStrongSignIn = async (internal: Internal, session: { id: string; expiresAt: Date }, now = new Date()) => {
  const identifier = identifierOf(session.id)
  await internal.deleteVerificationByIdentifier(identifier)
  await internal.createVerificationValue({ identifier, value: now.toISOString(), expiresAt: session.expiresAt })
}

/** When the session last proved a passkey or a second step, if it did and its note has not expired. */
export const strongSignInAt = async (internal: Internal, sessionId: string, now = new Date()) => {
  const found = await internal.findVerificationValue(identifierOf(sessionId))
  if (!found || new Date(found.expiresAt) <= now) return undefined
  return new Date(found.value)
}

type ProvedSession = { id: string; expiresAt: Date; impersonatedBy?: string | null }

/**
 * Records the sessions that sign in, or confirm, with a passkey or a second step, since Better Auth's sessions do not
 * say how they began: a reveal that asks for a recent strong sign-in reads it (`strongSignInAt`). The session is the
 * one the answer signed in, or else the one the request's cookie names. A staff session is never recorded: staff
 * proved nothing as the person. Nor is the code that turns two-factor authentication on, which a session alone may
 * ask for on an account without a password: it proves the authenticator app just added, not the person.
 */
export const strongSignInsPlugin = () => {
  // The requests, by their headers, that turn two-factor authentication on for the session they come with.
  const turningOn = new WeakSet<Headers>()
  return {
    id: 'protobase-strong-sign-ins',
    hooks: {
      before: [
        {
          matcher: (context) => context.path !== undefined && twoFactorPaths.includes(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            const signedIn = await getSessionFromCtx(ctx)
            if (signedIn && !(signedIn.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled && ctx.headers) turningOn.add(ctx.headers)
          }),
        },
      ],
      after: [
        {
          matcher: (context) => context.path !== undefined && strongSignInPaths.includes(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.context.returned instanceof APIError) return
            if (ctx.headers && turningOn.has(ctx.headers)) return
            const session = (ctx.context.newSession?.session ?? (await getSessionFromCtx(ctx))?.session) as ProvedSession | undefined
            if (!session || isStaffSession(session)) return
            await saveStrongSignIn(ctx.context.internalAdapter, session)
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}
