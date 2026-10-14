import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import * as z from 'zod'
import type { Mailer } from '../../mail/smtp-mailer'
import { checkNewAccountPassword } from '../new-account-password'
import { readSignInPolicy } from '../policy-store'
import { effectiveSignInPolicy } from '../sign-in-policy'
import { consumeSignUpCode, issueSignUpCode } from './sign-up-code'
import { accountExistsEmail, signUpCodeEmail } from './sign-up-mail'

export type SignUpPluginOptions = {
  /** The role every account made here gets, whatever the request says. */
  role: string
  mailer: Mailer
  appName: string
}

const address = z.string().trim().toLowerCase().pipe(z.email())

/** The paths of the sign-up endpoints, as `ctx.path` and the rate limits name them. */
export const signUpPaths = { sendCode: '/sign-up/send-code', create: '/sign-up/create' }

const noAdminYet = () => new APIError('FORBIDDEN', { code: 'NO_ADMIN_YET', message: 'This app has no admin yet; accounts are created on the host until it has one.' })

/**
 * Open sign-up: anyone makes their own account, with `role`. The address comes first, and a code mailed to it, so an
 * account exists only for an address its owner reads, verified from the start, and nobody can claim an address before
 * its owner does. Asking for a code answers the same whether the address has an account or not; one that has gets a
 * mail saying so instead of a code. While the store has no user, nobody signs up: the first admin is made on the host.
 */
export const signUpPlugin = ({ role, mailer, appName }: SignUpPluginOptions) =>
  ({
    id: 'protobase-sign-up',
    endpoints: {
      /** `POST /sign-up/send-code` with `{ email }`: mails a code for making an account with the address. */
      sendSignUpCode: createAuthEndpoint(signUpPaths.sendCode, { method: 'POST', body: z.object({ email: address }) }, async (ctx) => {
        const { email } = ctx.body
        const { internalAdapter, adapter } = ctx.context
        if ((await adapter.count({ model: 'user' })) === 0) throw noAdminYet()
        const message = (await internalAdapter.findUserByEmail(email))
          ? accountExistsEmail({ to: email, appName })
          : signUpCodeEmail({ to: email, code: await issueSignUpCode(ctx.context, email), appName })
        await ctx.context.runInBackgroundOrAwait(mailer.send(message))
        return ctx.json({ sent: true })
      }),

      /**
       * `POST /sign-up/create` with `{ email, code, name, password? }`: makes the account with the mailed code, verified
       * and with the sign-up role, and signs the person in. A password is needed unless the sign-in policy offers emailed
       * codes; the policy's required methods are then set up as after any sign-in.
       */
      createSignUpAccount: createAuthEndpoint(
        signUpPaths.create,
        { method: 'POST', body: z.object({ email: address, code: z.string().trim().min(1), name: z.string().trim().min(1).max(200), password: z.string().optional() }) },
        async (ctx) => {
          const { email, code, name, password } = ctx.body
          const { internalAdapter, adapter } = ctx.context
          if ((await adapter.count({ model: 'user' })) === 0) throw noAdminYet()
          checkNewAccountPassword(effectiveSignInPolicy((await readSignInPolicy(adapter)).policy, { mail: true }), password)
          await consumeSignUpCode(ctx.context, email, code)
          if (await internalAdapter.findUserByEmail(email)) {
            throw new APIError('BAD_REQUEST', { code: 'ACCOUNT_EXISTS', message: 'This address has an account already: sign in instead.' })
          }
          const user = await internalAdapter.createUser({ email, name, emailVerified: true, role }, { method: 'sign-up' })
          if (password !== undefined) {
            await internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: await ctx.context.password.hash(password) })
          }
          const session = await internalAdapter.createSession(user.id, false)
          await setSessionCookie(ctx, { session, user })
          return ctx.json({ user: { id: user.id, email: user.email, name: user.name, role } })
        },
      ),
    },
  }) satisfies BetterAuthPlugin
