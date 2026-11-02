import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { confirmationMinutes } from '@protobase/schema/internal'
import { isPasswordConfirmed } from './password-confirmation'
import { isStaffSession } from './staff-checks'
import { hasPasskeyOrSecondStep } from './strong-factors'
import { strongSignInAt } from './strong-sign-ins'

/** How long after signing in a session counts as recent without confirming: Better Auth's own default fresh age, a day. */
export const recentSessionSeconds = 24 * 60 * 60

/** The refusal of an account change the session has to confirm first, which the account page answers by asking in place. */
export const confirmationRequired = {
  code: 'STRONG_SIGN_IN_REQUIRED',
  message: `Confirm it's you first: this change needs a passkey, a second step or an emailed code in the last ${confirmationMinutes} minutes.`,
}

const passkeyPaths = ['/passkey/generate-register-options', '/passkey/verify-registration']
const twoFactorPath = '/two-factor/enable'

// The Better Auth endpoints its fresh-session check guarded, and its check of a deletion without a password, apart
// from `/list-sessions`, which only lists the person's own devices; and turning on a second step without a password.
const guardedPaths = [...passkeyPaths, twoFactorPath, '/unlink-account', '/delete-user']

type GuardedSession = { session: { id: string; createdAt: Date }; user: { id: string; twoFactorEnabled?: boolean | null } }
type Context = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]['context']

// What a change asks of a session that is not recently confirmed: nothing, or to confirm it's them. A first passkey, on
// an account with neither a passkey nor a second step, may confirm with the password instead (`passwordConfirmationPlugin`).
const confirmationAsked = async (context: Context, path: string, body: unknown, { user }: GuardedSession) => {
  if (path === '/delete-user') return (body as { password?: unknown } | undefined)?.password ? 'nothing' : 'confirm'
  if (path === '/unlink-account') return 'confirm'
  const first = !(await hasPasskeyOrSecondStep(context.adapter, user))
  // Better Auth asks an account with a password for it to turn on a second step; one without confirms it's them.
  if (path === twoFactorPath) return first && !(await context.internalAdapter.findCredentialAccount(user.id))?.password ? 'confirm' : 'nothing'
  return first ? 'confirm-or-password' : 'confirm'
}

/** Whether the session signed in within a day, or confirmed it's them within `confirmationMinutes`. */
export const isRecentlyConfirmed = async (context: Pick<Context, 'internalAdapter'>, session: GuardedSession['session'], now = new Date()) => {
  if (now.getTime() - new Date(session.createdAt).getTime() < recentSessionSeconds * 1000) return true
  const at = await strongSignInAt(context.internalAdapter, session.id, now)
  return at !== undefined && now.getTime() - at.getTime() <= confirmationMinutes * 60_000
}

/**
 * Replaces Better Auth's fresh-session check, which `createAuth` turns off (`freshAge: 0`), and which could only be met
 * by signing out and in again. A session of any age lists its devices. Adding a passkey, turning on a second step
 * without a password, unlinking a sign-in provider and deleting the account without a password ask a session older
 * than a day to confirm it's them in place first (`strongSignInsPlugin` notes it), else `403 STRONG_SIGN_IN_REQUIRED`.
 * An account with neither a passkey nor a second step confirms its first passkey with its password too, which counts
 * for that change only, never as a strong sign-in. Staff sessions are left to the staff plugin, which refuses these
 * changes.
 */
export const recentConfirmationPlugin = () =>
  ({
    id: 'protobase-recent-confirmation',
    hooks: {
      before: [
        {
          matcher: (context) => context.path !== undefined && guardedPaths.includes(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            const signedIn = (await getSessionFromCtx(ctx)) as GuardedSession | null
            if (!signedIn || isStaffSession(signedIn.session)) return
            const asked = await confirmationAsked(ctx.context, ctx.path, ctx.body, signedIn)
            if (asked === 'nothing') return
            if (await isRecentlyConfirmed(ctx.context, signedIn.session)) return
            if (asked === 'confirm-or-password' && (await isPasswordConfirmed(ctx.context.internalAdapter, signedIn.session.id))) return
            throw new APIError('FORBIDDEN', confirmationRequired)
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
