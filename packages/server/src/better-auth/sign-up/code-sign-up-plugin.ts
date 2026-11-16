import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { headersLocale } from '../../locale/request-locale'
import { sendAuthEmail, type AuthMail } from '../auth-mail/send-auth-email'
import type { AuthContext } from '../organizations/store'
import { codeMinutes } from '../sign-in-mail'
import { isSignInCode, issueSignInCode } from './sign-in-code'
import { createSignedUpAccount } from './sign-up-account'
import { signUpTakes } from './sign-up-domains'

export type CodeSignUpOptions = {
  /** The role every account made here gets, unless the address has a pending invitation. */
  role: string
  /** The email domains open sign-up takes, from `resolveSignUpDomains`; every address without them. */
  domains?: string[]
  mail: AuthMail
}

/** Whether the emailed sign-in code makes the account of `email`, which has none: open sign-up takes it, and the store has its first admin. */
export const codeSignsUp = async (context: AuthContext, email: string, domains: string[] | undefined) =>
  signUpTakes(email, domains) && (await context.adapter.count({ model: 'user' })) > 0

const bodyOf = (body: unknown) => body as { email?: unknown; type?: unknown; otp?: unknown } | undefined

/**
 * Open sign-up that asks for the address only: the emailed sign-in code signs in an address with an account, and makes
 * the account of one without, on the spot, once its code is right. Asking for a code answers the same either way, and
 * mails the same email; an address open sign-up does not take gets the no-account email as before. The account is
 * made as open sign-up makes it, so a pending invitation to the app gives its roles and is used up. Better Auth's
 * plugin then checks the code and signs in as for any account, so its tries, the sign-in policy and the second step
 * hold as they do; the plugin itself never makes an account. Goes after the sign-in policy's plugin, whose refusal
 * comes first.
 */
export const codeSignUpPlugin = ({ role, domains, mail }: CodeSignUpOptions) =>
  ({
    id: 'protobase-code-sign-up',
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === '/sign-in/email-otp',
          handler: createAuthMiddleware(async (ctx) => {
            const { email, otp } = bodyOf(ctx.body) ?? {}
            if (typeof email !== 'string' || typeof otp !== 'string') return
            const address = email.toLowerCase()
            if (await ctx.context.internalAdapter.findUserByEmail(address)) return
            // A wrong code makes nothing: the plugin counts the try and answers as for any address.
            if (!(await codeSignsUp(ctx.context, address, domains)) || !(await isSignInCode(ctx.context, address, otp))) return
            await createSignedUpAccount(ctx.context, { email: address, name: '', role })
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === '/email-otp/send-verification-otp',
          handler: createAuthMiddleware(async (ctx) => {
            // A refused request, such as one the sign-in policy forbids or with an invalid address, mails nothing.
            if (ctx.context.returned instanceof APIError) return
            const { email, type } = bodyOf(ctx.body) ?? {}
            if (type !== 'sign-in' || typeof email !== 'string') return
            const address = email.toLowerCase()
            if (await ctx.context.internalAdapter.findUserByEmail(address)) return
            if (!(await codeSignsUp(ctx.context, address, domains))) return
            const code = await issueSignInCode(ctx.context, address)
            await ctx.context.runInBackgroundOrAwait(sendAuthEmail(mail, 'signInCodeEmail', address, { code, minutes: codeMinutes }, ctx.context.baseURL, headersLocale(ctx.headers)))
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
