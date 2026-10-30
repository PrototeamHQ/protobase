import { Hono } from 'hono'
import { badRequest, forbidden } from '../problem'
import type { AdminEnv, Session } from '../types'
import type { CallsService } from './calls-service-type'

export type OrganizationGuestsInput = {
  calls: CallsService
  /** The user's role in the organization, `undefined` when they are no member of it. */
  roleIn: (organization: string, user: string) => Promise<'owner' | 'admin' | 'member' | undefined>
}

// The organization the signed-in user works in, never a visitor's or an outside app's acting for them.
const organizationOf = (session: Session) => {
  if (session.anonymous || session.client || session.organization === undefined) throw forbidden('organization-required', 'Sign in and work in an organization first')
  return String(session.organization.id)
}

/**
 * Whether the calls of the organization the user works in take guests, mounted behind the API's authenticator: `GET /`
 * `{ allowed }` for any member, `PUT /` with `{ allowed }` for its owner or an admin. Turning guests off revokes every
 * guest link of the organization's calls and takes their guests out at once.
 */
export const organizationGuestsRoute = ({ calls, roleIn }: OrganizationGuestsInput) => {
  const app = new Hono<AdminEnv>()

  app.get('/', async (c) => {
    const session = c.get('session')
    const organization = organizationOf(session)
    if (!(await roleIn(organization, String(session.user.id)))) throw forbidden('not-a-member', 'You are not a member of this organization')
    return c.json({ allowed: await (await calls.runtime()).guests().organizationAllowed(organization) }, 200, { 'Cache-Control': 'no-store' })
  })

  app.put('/', async (c) => {
    const session = c.get('session')
    const organization = organizationOf(session)
    const role = await roleIn(organization, String(session.user.id))
    if (role !== 'owner' && role !== 'admin') throw forbidden('organization-admin-required', 'Only an owner or admin of the organization turns guest links on or off')
    const body = (await c.req.json().catch(() => undefined)) as { allowed?: unknown } | undefined
    if (typeof body?.allowed !== 'boolean') throw badRequest('allowed-required', 'Send { allowed: true } or { allowed: false }')
    await (await calls.runtime()).setOrganizationGuests({ organization, allowed: body.allowed, by: String(session.user.id) })
    return c.json({ allowed: body.allowed })
  })

  return app
}
