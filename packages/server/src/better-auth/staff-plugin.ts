import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx, sessionMiddleware } from 'better-auth/api'
import { deleteSessionCookie } from 'better-auth/cookies'
import type { Mailer } from '../mail/smtp-mailer'
import { adminOnly } from './admin-only'
import type { ResolvedOperator } from './operator-provider'
import { isRefusedForStaff, isStaffSession, staffCannotChange } from './staff-checks'
import { endStaffSignIn, listStaffSignIns, staffSignInOfSession, staffSignInSchema } from './staff-log'
import { staffSignInEndpoints } from './staff-sign-in-endpoints'

export type StaffPluginOptions = {
  /** The provider staff sign in with; without one, nobody can start a staff session, and the log stays as it is. */
  operator?: ResolvedOperator
  /** Sends the email a person gets when the policy says to tell them; without it the policy cannot say so. */
  mailer?: Mailer
}

/**
 * Staff of the operator sign in as a person of this app, for support (see `staffSignInEndpoints`). A staff session
 * shows who started it and why, can be stopped, and cannot change the person's sign-in or the sign-in policy. Every
 * staff sign-in is logged for the app's admins. The plugin is there without an operator provider too, so its table
 * exists from the first `auth:migrate`.
 */
export const staffSignInPlugin = ({ operator, mailer }: StaffPluginOptions) =>
  ({
    id: 'protobase-staff-sign-in',
    schema: staffSignInSchema,
    endpoints: {
      ...(operator && staffSignInEndpoints({ operator, ...(mailer && { mailer }) })),

      /** `GET /staff/session`: for a staff session, who started it, as whom, why, and until when; otherwise `{ staff: null }`. */
      getStaffSession: createAuthEndpoint('/staff/session', { method: 'GET', use: [sessionMiddleware] }, async (ctx) => {
        const { session } = ctx.context.session
        if (!isStaffSession(session)) return ctx.json({ staff: null })
        return ctx.json({ staff: (await staffSignInOfSession(ctx.context.adapter, session.id)) ?? null })
      }),

      /** `POST /staff/stop`: ends the staff session, signs the browser out, and notes the end in the log. */
      stopStaffSession: createAuthEndpoint('/staff/stop', { method: 'POST', use: [sessionMiddleware] }, async (ctx) => {
        const { session } = ctx.context.session
        if (!isStaffSession(session)) throw new APIError('BAD_REQUEST', { code: 'NOT_A_STAFF_SESSION', message: 'This is not a staff session.' })
        await ctx.context.internalAdapter.deleteSession(session.token)
        await endStaffSignIn(ctx.context.adapter, session.id)
        deleteSessionCookie(ctx)
        return ctx.json({ stopped: true })
      }),

      /** `GET /staff/sign-ins`, for admins: the log of staff sign-ins, newest first. */
      listStaffSignIns: createAuthEndpoint('/staff/sign-ins', { method: 'GET', use: [adminOnly('Only an admin can read the log of staff sign-ins.')] }, async (ctx) =>
        ctx.json({ signIns: await listStaffSignIns(ctx.context.adapter) }),
      ),
    },
    hooks: {
      before: [
        {
          matcher: (context) => context.path !== undefined && isRefusedForStaff(context.path, context.request?.method ?? 'POST'),
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx)
            if (session && isStaffSession(session.session)) throw new APIError('FORBIDDEN', staffCannotChange)
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
