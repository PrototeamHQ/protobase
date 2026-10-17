import { decodeJwt } from 'jose'
import type pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { configExports, createAdmin, createUser } from '@protobase/server'
import * as config from '../../../examples/real-estate/config'
import { roles } from '../../../examples/real-estate/config/roles'
import { createDb } from '../../../examples/real-estate/db/kysely'
import { databaseSeeded } from './seeded'

const seeded = await databaseSeeded()
// The example's auth module reads its secret at import; the run's database comes from vitest.config.ts.
process.env.BETTER_AUTH_SECRET ??= 'real-estate-auth-users-test-secret-12345678'
const { auth, authenticate } = await import('../../../examples/real-estate/auth/auth')
const db = createDb(4)
afterAll(async () => {
  await db.destroy()
  await (globalThis as { __realEstateAdminPool?: pg.Pool }).__realEstateAdminPool?.end()
})

const origin = 'http://localhost:5173'
const password = 'correct horse battery'
const { resources, views } = configExports(config)
const app = createAdmin({ resources, views, db, authenticate, auth, options: { roles } })

// Better Auth limits sign-ins per client address; the test is one client.
const address = '192.0.2.20'
const request = (path: string, init: { method?: string; body?: unknown; cookie?: string; token?: string } = {}) =>
  app.request(`${origin}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': address, 'if-match': '*', ...(init.cookie && { cookie: init.cookie }), ...(init.token && { authorization: `Bearer ${init.token}` }) },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  })
const tokenOf = async (email: string) => {
  const signedIn = await request('/api/auth/sign-in/email', { body: { email, password } })
  expect(signedIn.status).toBe(200)
  const cookie = signedIn.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
  return ((await (await request('/api/auth/token', { cookie })).json()) as { token: string }).token
}

describe.skipIf(!seeded)('people who sign in to the real estate example', () => {
  it('are its users, so maintenance staff change the tickets assigned to them', async () => {
    const emails = ['root@real-estate.example', 'fixer@real-estate.example']
    await createUser(auth, { email: emails[0]!, password })
    await createUser(auth, { email: emails[1]!, password, role: 'maintenance' })
    const ticket = (await db.selectFrom('maintenance.tickets').select(['id', 'assigned_to', 'title']).where('organization_id', '=', 1).orderBy('id').limit(1).executeTakeFirstOrThrow()) as { id: string; assigned_to: number | null; title: string }
    try {
      const token = await tokenOf(emails[1]!)
      const id = Number(decodeJwt(token).sub)
      expect(await db.selectFrom('core.users').select(['organization_id', 'email', 'role']).where('id', '=', id).executeTakeFirst()).toEqual({ organization_id: 1, email: emails[1], role: null })
      await db.updateTable('maintenance.tickets').set({ assigned_to: id }).where('id', '=', ticket.id).execute()
      const changed = await request(`/api/v1/tickets/${ticket.id}`, { method: 'PATCH', token, body: { title: 'Boiler checked' } })
      expect(changed.status, await changed.clone().text()).toBe(200)
    } finally {
      // The run's database is shared with the other real estate tests.
      await db.updateTable('maintenance.tickets').set({ assigned_to: ticket.assigned_to, title: ticket.title }).where('id', '=', ticket.id).execute()
      await db.deleteFrom('core.users').where('email', 'in', emails).execute()
      await db.deleteFrom('auth.user').where('email', 'in', emails).execute()
    }
  })
})
