import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import * as z from 'zod'
import { headersLocale } from '../../locale/request-locale'
import { sendAuthEmail, type AuthMail } from '../auth-mail/send-auth-email'
import { checkNewAccountPassword } from '../new-account-password'
import { readSignInPolicy } from '../policy-store'
import { codeMinutes } from '../sign-in-mail'
import { effectiveSignInPolicy, type SignInPolicy } from '../sign-in-policy'
import { createSignedUpAccount } from './sign-up-account'
import { signUpTakes } from './sign-up-domains'
import { consumeSignUpCode, issueSignUpCode } from './sign-up-code'
import { consumeSignUpTicket, issueSignUpTicket } from './sign-up-ticket'

export type SignUpPluginOptions = {
  /** The role every account made here gets, whatever the request says. */
  role: string
  /** The email domains it takes, from `resolveSignUpDomains`; every address without them. */
  domains?: string[]
  mail: AuthMail
  /** The policy until an admin saves one. */
  defaultPolicy: SignInPolicy
}

const address = z.string().trim().toLowerCase().pipe(z.email())

/** The paths of the sign-up endpoints, as `ctx.path` and the rate limits name them. */
export const signUpPaths = { sendCode: '/sign-up/send-code', verifyCode: '/sign-up/verify-code', create: '/sign-up/create' }

// The message names no domain, so the answer does not list the ones the app takes.
const domainNotAllowed = () => new APIError('FORBIDDEN', { code: 'EMAIL_DOMAIN_NOT_ALLOWED', message: 'You cannot make an account here with this address. Ask an admin to invite you.' })

const noAdminYet = () => new APIError('FORBIDDEN', { code: 'NO_ADMIN_YET', message: 'This app has no admin yet; accounts are created on the host until it has one.' })

/**
 * Open sign-up: anyone makes their own account, with `role`. The address comes first, then the code mailed to it on its
 * own, and only then the name and password, so an account exists only for an address its owner reads, verified from the
 * start, and nobody can claim an address before its owner does. Asking for a code answers the same whether the address
 * has an account or not; one that has gets a mail saying so, with a link to sign in, instead of a code. While the store
 * has no user, nobody signs up: the first admin is made on the host. With `domains`, each step refuses an address
 * elsewhere (`EMAIL_DOMAIN_NOT_ALLOWED`), before it mails or makes anything.
 */
export const signUpPlugin = ({ role, domains, mail, defaultPolicy }: SignUpPluginOptions) =>
  ({
    id: 'protobase-sign-up',
    endpoints: {
      /** `POST /sign-up/send-code` with `{ email }`: mails a code for making an account with the address. */
      sendSignUpCode: createAuthEndpoint(signUpPaths.sendCode, { method: 'POST', body: z.object({ email: address }) }, async (ctx) => {
        const { email } = ctx.body
        if (!signUpTakes(email, domains)) throw domainNotAllowed()
        const { internalAdapter, adapter } = ctx.context
        if ((await adapter.count({ model: 'user' })) === 0) throw noAdminYet()
        const sending = (await internalAdapter.findUserByEmail(email))
          ? sendAuthEmail(mail, 'accountExistsEmail', email, {}, ctx.context.baseURL, headersLocale(ctx.headers))
          : sendAuthEmail(mail, 'signUpCodeEmail', email, { code: await issueSignUpCode(ctx.context, email), minutes: codeMinutes }, ctx.context.baseURL, headersLocale(ctx.headers))
        await ctx.context.runInBackgroundOrAwait(sending)
        return ctx.json({ sent: true })
      }),

      /**
       * `POST /sign-up/verify-code` with `{ email, code }`: takes the mailed code on its own, before anything else is asked,
       * and answers `{ ticket }`, which makes the account for the address with the step after.
       */
      verifySignUpCode: createAuthEndpoint(signUpPaths.verifyCode, { method: 'POST', body: z.object({ email: address, code: z.string().trim().min(1) }) }, async (ctx) => {
        const { email, code } = ctx.body
        if (!signUpTakes(email, domains)) throw domainNotAllowed()
        if ((await ctx.context.adapter.count({ model: 'user' })) === 0) throw noAdminYet()
        await consumeSignUpCode(ctx.context, email, code)
        return ctx.json({ ticket: await issueSignUpTicket(ctx.context, email) })
      }),

      /**
       * `POST /sign-up/create` with `{ ticket, name, password? }`: makes the account for the address the ticket's code was
       * right for, verified and with the sign-up role, and signs the person in. A password is needed unless the sign-in
       * policy offers emailed codes; the policy's required methods are then set up as after any sign-in. A refused
       * password leaves the ticket for another try.
       */
      createSignUpAccount: createAuthEndpoint(
        signUpPaths.create,
        { method: 'POST', body: z.object({ ticket: z.string().min(1), name: z.string().trim().min(1).max(200), password: z.string().optional() }) },
        async (ctx) => {
          const { ticket, name, password } = ctx.body
          const { internalAdapter, adapter } = ctx.context
          if ((await adapter.count({ model: 'user' })) === 0) throw noAdminYet()
          checkNewAccountPassword(effectiveSignInPolicy((await readSignInPolicy(adapter, defaultPolicy)).policy, { mail: true }), password)
          const email = await consumeSignUpTicket(ctx.context, ticket)
          if (!signUpTakes(email, domains)) throw domainNotAllowed()
          const passwordHash = password === undefined ? undefined : await ctx.context.password.hash(password)
          const user = await createSignedUpAccount(ctx.context, { email, name, role, ...(passwordHash !== undefined && { passwordHash }) })
          const session = await internalAdapter.createSession(user.id, false)
          await setSessionCookie(ctx, { session, user })
          return ctx.json({ user: { id: user.id, email: user.email, name: user.name, role } })
        },
      ),
    },
  }) satisfies BetterAuthPlugin
