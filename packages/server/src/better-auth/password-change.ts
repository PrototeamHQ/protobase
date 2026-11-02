import type { AuthContext, BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, createAuthMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { sendAuthEmail, type AuthMail } from './auth-mail/send-auth-email'
import { setPasswordPath } from './set-password'

/**
 * Mails `email` that its account's password changed, when the app has mail: in the background, as Better Auth sends
 * its own mail, so the answer does not wait on the mail server.
 */
export const mailPasswordChanged = async (ctx: { context: Pick<AuthContext, 'baseURL' | 'runInBackgroundOrAwait'> }, mail: AuthMail | undefined, email: string) => {
  if (!mail) return
  await ctx.context.runInBackgroundOrAwait(sendAuthEmail(mail, 'passwordChangedEmail', email, {}, ctx.context.baseURL))
}

type FinishedChange = { path?: string; body?: unknown; context: { session?: { user: { email: string } } | null; returned?: unknown } }

// The person's own new password, with the current one or as the first, and an admin's new password for someone.
const ownChanges = ['/change-password', setPasswordPath]
const adminChange = '/admin/set-user-password'

/** Whose account a finished request gave a new password: the address of the person, or the id of the user an admin set it for. */
export const changedAccount = ({ path, body, context }: FinishedChange): { email: string } | { userId: string } | undefined => {
  if (context.returned instanceof Error || path === undefined) return
  if (ownChanges.includes(path)) return context.session ? { email: context.session.user.email } : undefined
  const userId = typeof body === 'object' && body !== null ? (body as { userId?: unknown }).userId : undefined
  if (path === adminChange && userId !== undefined) return { userId: String(userId) }
  return
}

/**
 * A password change ends the account's other sessions and tells its owner:
 * - `/change-password` always signs out the other devices, whatever `revokeOtherSessions` says: this device gets a
 *   new session, and the MCP grant revocation disconnects the account's MCP clients.
 * - When the app has mail, the owner is emailed after `/change-password`, a first password (`/account/set-password`)
 *   and an admin's `/admin/set-user-password`; `passwordChanged` mails them for a change outside these endpoints,
 *   such as the GoTrue-compatible `PUT /user`. A password reset mails them from `onPasswordReset`.
 */
export const passwordChangePlugin = (mail?: AuthMail) =>
  ({
    id: 'protobase-password-change',
    endpoints: {
      passwordChanged: createAuthEndpoint.serverOnly({ method: 'POST', body: z.object({ email: z.string() }) }, async (ctx) => {
        await mailPasswordChanged(ctx, mail, ctx.body.email)
        return ctx.json({ status: true })
      }),
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === '/change-password',
          handler: createAuthMiddleware(async (ctx) => {
            if (typeof ctx.body !== 'object' || ctx.body === null) return
            return { context: { body: { ...ctx.body, revokeOtherSessions: true } } }
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path !== undefined && [...ownChanges, adminChange].includes(ctx.path),
          handler: createAuthMiddleware(async (ctx) => {
            const changed = changedAccount(ctx as FinishedChange)
            if (!changed || !mail) return
            if ('email' in changed) {
              await mailPasswordChanged(ctx, mail, changed.email)
              return
            }
            const user = await ctx.context.internalAdapter.findUserById(changed.userId)
            if (!user) throw new APIError('NOT_FOUND', { message: 'The user whose password was set is gone' })
            await mailPasswordChanged(ctx, mail, user.email)
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
