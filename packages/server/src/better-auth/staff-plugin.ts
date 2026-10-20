import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx, sessionMiddleware } from 'better-auth/api'
import { deleteSessionCookie } from 'better-auth/cookies'
import { adminOnly } from './admin-only'
import type { AuthMail } from './auth-mail/send-auth-email'
import type { ResolvedOperator } from './operator-provider'
import type { SignInPolicy } from './sign-in-policy'
import { isOAuthPath, isRefusedForStaff, isStaffSession, staffCannotChange, staffCannotConnect } from './staff-checks'
import { endStaffSignIn, listStaffSignIns, staffSignInOfSession, staffSignInSchema } from './staff-log'
import { staffSignInEndpoints } from './staff-sign-in-endpoints'

export type StaffPluginOptions = {
  /** The provider staff sign in with; without one, nobody can start a staff session, and the log stays as it is. */
  operator?: ResolvedOperator
  /** Sends the email a person gets when the policy says to tell them; without it the policy cannot say so. */
  mail?: AuthMail
  /** The policy until an admin saves one. */
  defaultPolicy: SignInPolicy
}

/**
 * Staff of the operator sign in as a person of this app, for support (see `staffSignInEndpoints`). A staff session
 * shows who started it and why, can be stopped, and cannot change the person's sign-in or the sign-in policy, or allow
 * an outside app to act as the person. Every
 * staff sign-in is logged for the app's admins. The plugin is there without an operator provider too, so its table
 * exists from the first auth migration.
 */
export const staffSignInPlugin = ({ operator, mail, defaultPolicy }: StaffPluginOptions) =>
  ({
    id: 'protobase-staff-sign-in',
    schema: staffSignInSchema,
    endpoints: {
      ...(operator && staffSignInEndpoints({ operator, defaultPolicy, ...(mail && { mail }) })),

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
        // Nor can staff allow an outside app to act as the person, on any method, including the provider resuming an authorization.
        {
          matcher: (context) => context.path !== undefined && isOAuthPath(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx)
            if (session && isStaffSession(session.session)) throw new APIError('FORBIDDEN', staffCannotConnect)
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
