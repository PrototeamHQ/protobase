import { sql } from 'kysely'
import { SignJWT } from 'jose'
import { afterAll, describe, expect, it } from 'vitest'
import { configExports, createAdmin, jwtAuthenticator } from '@protobase/server'
import * as config from '../../../examples/real-estate/config'
import { roles } from '../../../examples/real-estate/config/roles'
import { createDb } from '../../../examples/real-estate/db/kysely'
import { databaseSeeded } from './seeded'

const seeded = await databaseSeeded()
const db = createDb(4)
afterAll(async () => { await db.destroy() })

const secret = new TextEncoder().encode('real-estate-access-test-secret-12345678')
const { resources, views } = configExports(config)
const app = createAdmin({ resources, views, db, authenticate: jwtAuthenticator({ keys: async () => secret, algorithms: ['HS256'] }), options: { roles } })

// Seeded users (seed/data/reference.ts).
const people = {
  admin1: { id: 1, tenant: 1, role: 'admin' }, finance1: { id: 4, tenant: 1, role: 'finance' }, admin2: { id: 9, tenant: 2, role: 'admin' },
} as const
type Person = keyof typeof people
const tokens = Object.fromEntries(
  await Promise.all(Object.entries(people).map(async ([key, { id, tenant, role }]) => [key, await new SignJWT({ roles: [role], tenant }).setProtectedHeader({ alg: 'HS256' }).setSubject(String(id)).setExpirationTime('15m').sign(secret)])),
) as Record<Person, string>

const call = async (who: Person, path: string, init: { method?: string; body?: unknown } = {}) => {
  const response = await app.request(`/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${tokens[who]}`, ...(init.body !== undefined && { 'content-type': 'application/json', 'if-match': '*' }) },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  })
  const text = await response.text()
  return { status: response.status, text, json: text ? (JSON.parse(text) as any) : undefined }
}

const dbCount = async (table: string, organization: number) =>
  Number((await sql<{ n: string }>`select count(*)::text as n from ${sql.table(table)} where organization_id = ${organization}`.execute(db)).rows[0]!.n)

const enc = encodeURIComponent

describe.skipIf(!seeded)('what is still owed on a rent charge', () => {
  it('drops by a payment made through the API, and comes back when it is removed', async () => {
    const charge = (await sql<{ id: string }>`select id::text as id from billing.rent_charges where organization_id = 1 and paid_amount = 0 order by id limit 1`.execute(db)).rows[0]!
    const before = (await call('finance1', `/rentCharges/${charge.id}`)).json
    expect(before.outstanding).toBe(before.amount)
    const paid = await call('finance1', '/payments', { method: 'POST', body: { chargeId: charge.id, paidOn: '2026-10-06', amount: '10.00', method: 'ideal' } })
    try {
      expect(paid.status, paid.text).toBe(201)
      const after = (await call('finance1', `/rentCharges/${charge.id}`)).json
      expect(after.paidAmount).toBe('10.00')
      expect(after.outstanding).toBe((Number(before.amount) - 10).toFixed(2))
      const owing = await call('finance1', `/rentCharges?filter=${enc(`id = ${charge.id} AND outstanding < ${before.amount}`)}`)
      expect(owing.json.items.map((item: { id: string }) => item.id)).toEqual([charge.id])
    } finally {
      await sql`delete from billing.payments where id = ${paid.json.id}`.execute(db)
    }
    expect((await call('finance1', `/rentCharges/${charge.id}`)).json.outstanding).toBe(before.amount)
  })
})

// The arrears view is plain SQL over the charges and payments; the API scopes it to the caller's organization.
describe.skipIf(!seeded)('the arrears view', () => {
  it.each([['admin1', 1], ['admin2', 2]] as const)('counts only the organization of %s', async (who, own) => {
    const arrears = await call(who, '/arrears?page_size=1&count=exact')
    expect(arrears.json.total_size).toBe(await dbCount('billing.arrears', own))
  })
})
