import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { superuserRole, type RoleDefinitions } from '../organizations/role-definitions'
import { sessionRoles, type RoleSession, type RoleUser } from './session-role'

/**
 * Switching the role a session acts with, as switching its organization: the session keeps it, and its tokens carry it
 * alone (see `narrowClaims`), so the API, the views and the menu follow it. The user keeps the last one chosen, for
 * their next session. Better Auth's admin endpoints refuse a superuser acting with another role.
 */
export const rolesPlugin = ({ definitions }: { definitions: RoleDefinitions }) =>
  ({
    id: 'protobase-roles',
    // The session's active role, which its tokens carry, and the user's last one, which a new session starts with.
    schema: {
      session: { fields: { activeRole: { type: 'string', required: false, input: false, fieldName: 'active_role' } } },
      user: { fields: { lastRole: { type: 'string', required: false, input: false, fieldName: 'last_role' } } },
    },
    endpoints: {
      /** `GET /role/current`: the role the session acts with, and the roles held there with their labels to switch to. */
      currentRole: createAuthEndpoint('/role/current', { method: 'GET', use: [sessionMiddleware] }, async (ctx) => {
        const { held, active } = await sessionRoles(ctx.context, ctx.context.session as { user: RoleUser; session: RoleSession })
        return ctx.json({ active: active ?? null, roles: held.map((name) => ({ name, label: definitions.labels[name] ?? name })) })
      }),

      /** `POST /role/switch` with `{ role }`, one the person holds where the session works: its next token carries that role alone. */
      switchRole: createAuthEndpoint('/role/switch', { method: 'POST', use: [sessionMiddleware], body: z.object({ role: z.string().min(1) }) }, async (ctx) => {
        const { user, session } = ctx.context.session
        const { held } = await sessionRoles(ctx.context, ctx.context.session as { user: RoleUser; session: RoleSession })
        if (!held.includes(ctx.body.role)) throw new APIError('FORBIDDEN', { code: 'ROLE_NOT_HELD', message: 'You do not hold this role.' })
        await ctx.context.internalAdapter.updateSession(session.token, { activeRole: ctx.body.role })
        await ctx.context.internalAdapter.updateUser(user.id, { lastRole: ctx.body.role })
        return ctx.json({ role: ctx.body.role })
      }),
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path?.startsWith('/admin/') ?? false,
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx)
            if (!session) return
            const { held, active } = await sessionRoles(ctx.context, session as { user: RoleUser; session: RoleSession })
            if (held.includes(superuserRole) && active !== superuserRole) {
              throw new APIError('FORBIDDEN', { code: 'ADMIN_ONLY', message: 'Switch to the admin role to manage users.' })
            }
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
