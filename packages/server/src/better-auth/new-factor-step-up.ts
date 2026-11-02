import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import type { AuthContext } from './organizations/store'
import { isWithin, sessionNote } from './session-notes'
import { signUpPaths } from './sign-up/sign-up-plugin'
import { isStaffSession } from './staff-checks'
import { defaultStrongSignInMinutes, strongSignInAt } from './strong-sign-ins'

// The Better Auth endpoints that add a factor to the account, or hand out one it has: backup codes, an app's secret.
const newFactorPaths = ['/passkey/generate-register-options', '/passkey/verify-registration', '/two-factor/enable', '/two-factor/get-totp-uri', '/two-factor/generate-backup-codes']
// Of those, the ones whose own check asks for the password of an account that has one.
const passwordCheckedPaths = ['/two-factor/enable', '/two-factor/get-totp-uri', '/two-factor/generate-backup-codes']

const emailCodeSignIns = sessionNote('email-code-sign-in')
// The endpoints that sign a person in on an emailed code they just entered: a sign-in with a code, and open sign-up.
const emailCodeSessionPaths = ['/sign-in/email-otp', signUpPaths.create]

export const strongSignInRequired = {
  code: 'STRONG_SIGN_IN_REQUIRED',
  message: `Sign out, then sign in with a passkey or your second step: adding a sign-in method or making new backup codes needs that in the last ${defaultStrongSignInMinutes} minutes.`,
}

export const emailCodeSignInRequired = {
  code: 'EMAIL_CODE_SIGN_IN_REQUIRED',
  message: `Sign out, then sign in with a code emailed to you: adding your first passkey or a second step needs that in the last ${defaultStrongSignInMinutes} minutes.`,
}

/** What the step-up reads about the account and the session, each only when the request needs it. */
export type NewFactorFacts = {
  /** The account has a passkey or two-factor authentication. */
  hasFactor: () => Promise<boolean>
  hasPassword: () => Promise<boolean>
  strongSignInAt: () => Promise<Date | undefined>
  emailCodeSignInAt: () => Promise<Date | undefined>
}

/**
 * Why a request to `path` that adds a factor is refused, or `undefined` when it may go on. An account with a factor
 * needs a passkey or a second step from the session in the last minutes, so a stolen session cannot add one of its
 * own. An account without one has only its inbox: the session needs a sign-in with an emailed code in the last
 * minutes, or, where Better Auth asks for it, the password of an account that has one. A session that began with an
 * emailed code moments ago is trusted with the first factor, as the inbox is all such an account can prove.
 */
export const newFactorRefusal = async (path: string, facts: NewFactorFacts, now = new Date()) => {
  if (!newFactorPaths.includes(path)) return
  if (await facts.hasFactor()) return isWithin(await facts.strongSignInAt(), defaultStrongSignInMinutes, now) ? undefined : strongSignInRequired
  if (passwordCheckedPaths.includes(path) && (await facts.hasPassword())) return
  return isWithin(await facts.emailCodeSignInAt(), defaultStrongSignInMinutes, now) ? undefined : emailCodeSignInRequired
}

const factsOf = (context: AuthContext, session: { id: string }, user: { id: string; twoFactorEnabled?: boolean | null }): NewFactorFacts => ({
  hasFactor: async () => Boolean(user.twoFactorEnabled) || (await context.adapter.count({ model: 'passkey', where: [{ field: 'userId', value: user.id }] })) > 0,
  hasPassword: async () => (await context.internalAdapter.findAccounts(user.id)).some((account) => account.providerId === 'credential'),
  strongSignInAt: () => strongSignInAt(context.internalAdapter, session.id),
  emailCodeSignInAt: () => emailCodeSignIns.at(context.internalAdapter, session.id),
})

/**
 * Adding a passkey or an authenticator app, and making new backup codes, need a recent strong sign-in with a factor
 * the account has already (`newFactorRefusal`), or the emailed code for its first. Notes the sessions that sign in
 * with an emailed code, or sign up with one, to know when.
 */
export const newFactorStepUpPlugin = () =>
  ({
    id: 'protobase-new-factor-step-up',
    hooks: {
      before: [
        {
          matcher: (context) => context.path !== undefined && newFactorPaths.includes(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            const signedIn = await getSessionFromCtx(ctx)
            // Without a session the endpoint's own check answers; staff cannot change the person's sign-in anyway.
            if (!signedIn || isStaffSession(signedIn.session)) return
            const refusal = await newFactorRefusal(ctx.path, factsOf(ctx.context, signedIn.session, signedIn.user))
            if (refusal) throw new APIError('FORBIDDEN', refusal)
          }),
        },
      ],
      after: [
        {
          matcher: (context) => context.path !== undefined && emailCodeSessionPaths.includes(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.context.returned instanceof APIError) return
            const session = ctx.context.newSession?.session
            if (session) await emailCodeSignIns.save(ctx.context.internalAdapter, session)
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
