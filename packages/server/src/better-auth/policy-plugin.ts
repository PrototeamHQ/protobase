import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { readSignInPolicy, saveSignInPolicy, signInPolicySchema } from './policy-store'
import { isPoliced, lastPasskeyRequired, policyRefusal, setupRequired } from './sign-in-enforcement'
import { effectiveSignInPolicy, missingRequiredMethods, parseSignInPolicy, signInPolicyProblem, type AccountMethods } from './sign-in-policy'
import { adminOnly } from './admin-only'
import { isStaffSession } from './staff-checks'

type Context = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]['context']
type SessionUser = { id: string; email: string; role?: string | null; twoFactorEnabled?: boolean | null }

export type SignInPolicyPluginOptions = {
  /** Mail can be sent, so emailed codes work. */
  mail: boolean
  /** The ids of the configured sign-in providers, which the policy does not cover. */
  socialProviders: string[]
  /** The name of the operator provider staff sign in with, when one is configured. */
  operator?: string
}

const accountMethods = async (context: Context, user: SessionUser, socialProviders: string[]): Promise<AccountMethods> => {
  const accounts = await context.internalAdapter.findAccounts(user.id)
  const passkeys = await context.adapter.count({ model: 'passkey', where: [{ field: 'userId', value: user.id }] })
  // The two-factor plugin keeps an app's secret in its table, unverified until the app's first code.
  const app = await context.adapter.findOne<{ verified?: boolean | null }>({ model: 'twoFactor', where: [{ field: 'userId', value: user.id }] })
  return {
    password: accounts.some((account) => account.providerId === 'credential'),
    passkeys,
    twoFactor: Boolean(user.twoFactorEnabled),
    authenticatorApp: Boolean(user.twoFactorEnabled) && app !== null && app.verified !== false,
    socialSignIn: accounts.some((account) => socialProviders.includes(account.providerId)),
  }
}

const refuse = (status: 'FORBIDDEN' | 'BAD_REQUEST', refusal: { code: string; message: string }) => new APIError(status, refusal)

/**
 * Protobase's sign-in policy as a Better Auth plugin: its table, the endpoints that read and change it, and a hook that
 * applies it to Better Auth's own endpoints. A method the policy turns off answers `403 SIGN_IN_METHOD_FORBIDDEN`;
 * someone without what it requires gets a session, so they can set it up, but no API token (`403 SIGN_IN_SETUP_REQUIRED`).
 */
export const signInPolicyPlugin = ({ mail, socialProviders, operator }: SignInPolicyPluginOptions) => {
  const currentPolicy = async (context: Context) => effectiveSignInPolicy((await readSignInPolicy(context.adapter)).policy, { mail })

  const policyAdmin = adminOnly('Only an admin can change how people sign in.')

  const policyAnswer = async (context: Context) => {
    const stored = await readSignInPolicy(context.adapter)
    const savedBy = stored.savedBy && (await context.internalAdapter.findUserById(stored.savedBy))?.email
    return {
      policy: stored.policy,
      effective: effectiveSignInPolicy(stored.policy, { mail }),
      mail,
      ...(operator && { operator }),
      ...(stored.savedAt && { savedAt: stored.savedAt }),
      ...(savedBy && { savedBy }),
    }
  }

  return {
    id: 'protobase-sign-in-policy',
    schema: signInPolicySchema,
    endpoints: {
      /** `GET /policy/sign-in`, for admins: the saved policy, how it applies (`effective`), and whether mail is on. */
      getSignInPolicy: createAuthEndpoint('/policy/sign-in', { method: 'GET', use: [policyAdmin] }, async (ctx) => ctx.json(await policyAnswer(ctx.context))),

      /** `POST /policy/sign-in`, for admins: saves a policy, or answers 400 with why it cannot be saved. */
      setSignInPolicy: createAuthEndpoint('/policy/sign-in', { method: 'POST', use: [policyAdmin], body: z.record(z.string(), z.unknown()) }, async (ctx) => {
        const policy = parseSignInPolicy(ctx.body)
        if (!policy) throw refuse('BAD_REQUEST', { code: 'INVALID_SIGN_IN_POLICY', message: 'Choose one of the offered rules for every sign-in method.' })
        const user = ctx.context.session.user as SessionUser
        const problem = signInPolicyProblem(policy, { mail, admin: await accountMethods(ctx.context, user, socialProviders) })
        if (problem) throw refuse('BAD_REQUEST', { code: 'SIGN_IN_POLICY_REFUSED', message: problem })
        await saveSignInPolicy(ctx.context.adapter, policy, user.id)
        return ctx.json(await policyAnswer(ctx.context))
      }),

      /**
       * `GET /account/sign-in-methods`, for the signed-in user: the policy as it applies, what the account has, and what
       * it still has to set up; nothing for a staff session, which cannot set anything up for the person.
       */
      getSignInMethods: createAuthEndpoint('/account/sign-in-methods', { method: 'GET', use: [sessionMiddleware] }, async (ctx) => {
        const policy = await currentPolicy(ctx.context)
        const { socialSignIn: _, ...account } = await accountMethods(ctx.context, ctx.context.session.user as SessionUser, socialProviders)
        return ctx.json({ policy, mail, account, missing: isStaffSession(ctx.context.session.session) ? [] : missingRequiredMethods(policy, account) })
      }),
    },
    hooks: {
      before: [
        {
          matcher: (context) => isPoliced(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            const path = ctx.path
            // The email OTP plugin also mails codes for flows Protobase does not use; only sign-in codes go out.
            if (path === '/email-otp/send-verification-otp' && (ctx.body as { type?: unknown } | undefined)?.type !== 'sign-in') {
              throw refuse('BAD_REQUEST', { code: 'SIGN_IN_CODES_ONLY', message: 'Only sign-in codes can be emailed.' })
            }
            const policy = await currentPolicy(ctx.context)
            const refusal = policyRefusal(policy, { path, body: ctx.body })
            if (refusal) throw refuse('FORBIDDEN', refusal)
            if (path === '/sign-in/email-otp') return vouchForCreatedAccount(ctx.context, (ctx.body as { email?: unknown }).email)
            const accountChecked = (path === '/token' && (policy.twoFactor === 'required' || policy.passkey === 'required')) || (path === '/passkey/delete-passkey' && policy.passkey === 'required')
            if (!accountChecked) return
            const session = await getSessionFromCtx(ctx)
            // Without a session the endpoint's own check answers; staff sessions cannot change the account anyway.
            if (!session || isStaffSession(session.session)) return
            const account = await accountMethods(ctx.context, session.user as SessionUser, socialProviders)
            if (path === '/token' && missingRequiredMethods(policy, account).length > 0) throw refuse('FORBIDDEN', setupRequired)
            if (path === '/passkey/delete-passkey' && account.passkeys <= 1) throw refuse('FORBIDDEN', lastPasskeyRequired)
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}

/**
 * Accounts are created by an admin or on the host, who vouch for the address, so they count as verified. Better Auth
 * would otherwise treat a first emailed-code sign-in to an unverified account as taking it over, and delete its
 * password. New accounts are created verified (see `createAuth`); this marks one created before that, which has a
 * password, when an emailed code is used for it. A sign-up through a provider has no password and is left alone.
 */
const vouchForCreatedAccount = async (context: Context, email: unknown) => {
  if (typeof email !== 'string') return
  const found = await context.internalAdapter.findUserByEmail(email.toLowerCase(), { includeAccounts: true })
  if (!found || found.user.emailVerified || !found.accounts.some((account) => account.providerId === 'credential')) return
  await context.internalAdapter.updateUser(found.user.id, { emailVerified: true })
}
