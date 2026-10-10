import { exactCount, type Db } from '@protobase/query'
import { Hono } from 'hono'
import { auditOrigin } from '../../audit/origin'
import type { Registry } from '../../registry'
import type { AuditQueue } from '../../types'
import type { AdminAuth } from '../create-auth'
import { globalRoles } from './app-roles'
import { findMember, findOrganization, type AuthContext } from './store'

/** The resources with rows in an organization, soft-deleted ones too: they would point at nothing once it is gone. */
export const resourcesWithRecords = async (registry: Registry, db: Db, organizationId: string) => {
  const names: string[] = []
  for (const entry of registry.entries) {
    if (!entry.model.tenant) continue
    const { softDelete: _, ...model } = entry.model
    if ((await exactCount(db, model, undefined, { tenantValue: organizationId })) > 0) names.push(entry.name)
  }
  return names
}

type Refusal = { status: 400 | 401 | 403 | 409; code: string; message: string }

const refusal = (status: Refusal['status'], code: string, message: string): Refusal => ({ status, code, message })

/**
 * The organization routes that need the admin's own parts, mounted before Better Auth's handler: switching the
 * organization one works in, which writes an audit event when someone enters one they are not a member of, and, while
 * `deleteRecords` is `'refuse'`, deleting only an organization without records.
 */
export const organizationRoutes = ({ auth, audit, registry, db }: { auth: AdminAuth; audit: AuditQueue; registry: Registry; db: Db }) => {
  const app = new Hono()
  const contextOf = async () => (await auth.$context) as unknown as AuthContext
  const fail = (c: { json: (body: unknown, status: number) => Response }, problem: Refusal) => c.json({ code: problem.code, message: problem.message }, problem.status)

  /**
   * `POST /organization/switch` with `{ organizationId }`: the session works in that organization from its next token
   * on, for a member, or for someone with a global role, who may enter any; `null` leaves it.
   */
  app.post('/organization/switch', async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) return fail(c, refusal(401, 'UNAUTHORIZED', 'Sign in first.'))
    const body = (await c.req.json().catch(() => undefined)) as { organizationId?: unknown } | undefined
    const organizationId = body?.organizationId
    if (organizationId !== null && typeof organizationId !== 'string') return fail(c, refusal(400, 'ORGANIZATION_REQUIRED', 'Name the organization to work in.'))
    const { adapter, internalAdapter } = await contextOf()
    if (organizationId !== null) {
      const member = await findMember(adapter, { organizationId, userId: session.user.id })
      const global = globalRoles((session.user as { role?: string | null }).role)
      if (!member) {
        if (global.length === 0 || !(await findOrganization(adapter, organizationId))) {
          return fail(c, refusal(403, 'NOT_A_MEMBER', 'You are not a member of this organization.'))
        }
        await audit.publish({ type: 'organization.entered', at: new Date().toISOString(), actor: { id: session.user.id, roles: global }, organization: organizationId, origin: auditOrigin(c.req.raw.headers) })
      }
    }
    await internalAdapter.updateSession(session.session.token, { activeOrganizationId: organizationId })
    return c.json({ organizationId })
  })

  if (auth.organizations?.deleteRecords !== 'cascade') {
    app.post('/organization/delete', async (c, next) => {
      const body = (await c.req.raw.clone().json().catch(() => undefined)) as { organizationId?: unknown } | undefined
      const session = await auth.api.getSession({ headers: c.req.raw.headers })
      // Better Auth answers anyone else itself; only an owner learns which records keep the organization.
      if (!session || typeof body?.organizationId !== 'string') return next()
      const member = await findMember((await contextOf()).adapter, { organizationId: body.organizationId, userId: session.user.id })
      if (!member || !member.role.split(',').includes('owner')) return next()
      const names = await resourcesWithRecords(registry, db, body.organizationId)
      if (names.length > 0) return fail(c, refusal(409, 'ORGANIZATION_HAS_RECORDS', `Delete the organization's records first: ${names.join(', ')}.`))
      return next()
    })
  }
  return app
}
