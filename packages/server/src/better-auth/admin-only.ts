import { APIError, createAuthMiddleware, sessionMiddleware } from 'better-auth/api'
import { superuserRole } from './organizations/role-definitions'
import { sessionRoles, type RoleSession, type RoleUser } from './roles/session-role'

/** Lets a request through only with the session of someone acting as an admin; others get `403 ADMIN_ONLY` with `message`. */
export const adminOnly = (message: string) =>
  createAuthMiddleware({ use: [sessionMiddleware] }, async (ctx) => {
    const { active } = await sessionRoles(ctx.context, ctx.context.session as { user: RoleUser; session: RoleSession })
    if (active !== superuserRole) throw new APIError('FORBIDDEN', { code: 'ADMIN_ONLY', message })
    return { session: ctx.context.session }
  })
