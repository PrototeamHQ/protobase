import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { wouldLeaveNoAdmin, type AdminCandidate, type AdminChange } from './last-admin'
import { parseRoles } from './parse-roles'

type Body = { userId?: unknown; role?: unknown; data?: { role?: unknown; banned?: unknown } }

const rolesOf = (role: unknown) => (typeof role === 'string' || Array.isArray(role) ? parseRoles(role as string | string[]) : undefined)

/** The change an admin endpoint makes to its user, from its path and body; `undefined` when it touches no role or block. */
export const adminChange = (path: string, body: Body): AdminChange | undefined => {
  if (typeof body.userId !== 'string') return undefined
  const userId = body.userId
  if (path === '/admin/set-role') return { userId, roles: rolesOf(body.role) ?? [] }
  if (path === '/admin/ban-user') return { userId, banned: true }
  if (path === '/admin/remove-user') return { userId, removed: true }
  if (path !== '/admin/update-user') return undefined
  const roles = rolesOf(body.data?.role)
  const banned = typeof body.data?.banned === 'boolean' ? body.data.banned : undefined
  if (roles === undefined && banned === undefined) return undefined
  return { userId, ...(roles && { roles }), ...(banned !== undefined && { banned }) }
}

const guardedPaths = ['/admin/set-role', '/admin/ban-user', '/admin/remove-user', '/admin/update-user']

/** Refuses, with `400 LAST_ADMIN`, an admin endpoint that would demote, block or remove the last active admin. */
export const lastAdminGuardPlugin = () =>
  ({
    id: 'protobase-last-admin',
    hooks: {
      before: [
        {
          matcher: (ctx) => guardedPaths.includes(ctx.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            const change = adminChange(ctx.path, (ctx.body ?? {}) as Body)
            if (!change) return
            const users = await ctx.context.adapter.findMany<AdminCandidate>({ model: 'user', select: ['id', 'role', 'banned'] })
            if (wouldLeaveNoAdmin(users, change)) {
              throw new APIError('BAD_REQUEST', { code: 'LAST_ADMIN', message: 'This is the last admin: make someone else an admin first.' })
            }
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
