import { APIError, createAuthMiddleware, sessionMiddleware } from 'better-auth/api'
import { parseRoles } from './parse-roles'

/** Lets a request through only with the session of an admin; others get `403 ADMIN_ONLY` with `message`. */
export const adminOnly = (message: string) =>
  createAuthMiddleware({ use: [sessionMiddleware] }, async (ctx) => {
    if (!parseRoles(ctx.context.session.user.role as string | null).includes('admin')) {
      throw new APIError('FORBIDDEN', { code: 'ADMIN_ONLY', message })
    }
    return { session: ctx.context.session }
  })
