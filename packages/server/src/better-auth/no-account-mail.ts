import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { headersLocale } from '../locale/request-locale'
import { sendAuthEmail, type AuthMail } from './auth-mail/send-auth-email'
import type { AuthContext } from './organizations/store'

/**
 * Mails an address that asked for a sign-in code while no account uses it, so its owner knows to try another address.
 * The email OTP plugin answers such a request as it answers one for an account, and mails nothing; this hook sends the
 * no-account email after it, so the answer still tells nobody which addresses have an account. An address `signsUp`
 * takes gets a code that makes its account instead (`codeSignUpPlugin`).
 */
export const noAccountMailPlugin = (mail: AuthMail, signsUp?: (context: AuthContext, email: string) => Promise<boolean>) =>
  ({
    id: 'protobase-no-account-mail',
    hooks: {
      after: [
        {
          matcher: (ctx) => ctx.path === '/email-otp/send-verification-otp',
          handler: createAuthMiddleware(async (ctx) => {
            // A refused request, such as one the sign-in policy forbids or with an invalid address, mails nothing.
            if (ctx.context.returned instanceof APIError) return
            const { email, type } = ctx.body as { email: string; type: string }
            if (type !== 'sign-in') return
            const address = email.toLowerCase()
            if (await ctx.context.internalAdapter.findUserByEmail(address)) return
            if (signsUp && (await signsUp(ctx.context, address))) return
            await ctx.context.runInBackgroundOrAwait(sendAuthEmail(mail, 'noAccountEmail', address, {}, ctx.context.baseURL, headersLocale(ctx.headers)))
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
