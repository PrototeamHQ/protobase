import sharp from 'sharp'
import { decodeJwt } from 'jose'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { configExports, createAdmin, type MailMessage } from '@protobase/server'
import * as config from '../../apps/property-portal/config'
import { roles } from '../../apps/property-portal/config/roles'
import { databaseUrl } from '../../apps/property-portal/db/connection'
import { createDb } from '../../apps/property-portal/db/kysely'
import { exampleAuth } from '../example-app'
import { databaseSeeded } from './seeded'

// The portal's own account settings, open sign-up included, on its seeded database: the accounts made here are
// removed afterwards, with their favorites and searches.
const seeded = await databaseSeeded()
const db = createDb(2)
const emails = ['nia@portal.example', 'ole@portal.example']
afterAll(async () => {
  await sql`delete from auth."user" where email in (${sql.join(emails)})`.execute(db)
  await db.destroy()
  await closeAuth()
})

const origin = 'http://localhost:5173'
const password = 'correct horse battery'
const sent: MailMessage[] = []
const { resources, views, pages } = configExports(config)
let app: ReturnType<typeof createAdmin>
let closeAuth = async () => {}

// The portal's own auth as its config builds it, with a mailer that keeps what it sends.
beforeAll(async () => {
  const mailer = { send: async (message: MailMessage) => void sent.push(message) }
  const { auth, authenticate, close } = await exampleAuth('property-portal', databaseUrl, { url: origin, secret: 'property-portal-sign-up-test-secret-1234', mailer })
  closeAuth = close
  app = createAdmin({ resources, views, pages, db, files: { secret: 'property-portal-files-test', sharp }, authenticate, auth, options: { roles } })
})

let client = 0
const call = async (path: string, init: { method?: string; body?: unknown; cookie?: string; token?: string } = {}) => {
  const response = await app.request(`${origin}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: {
      origin,
      'x-forwarded-for': `198.51.100.${++client}`,
      ...(init.body !== undefined && { 'content-type': 'application/json', 'if-match': '*' }),
      ...(init.cookie && { cookie: init.cookie }),
      ...(init.token && { authorization: `Bearer ${init.token}` }),
    },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  })
  const text = await response.text()
  return { status: response.status, cookie: response.headers.getSetCookie().map((line) => line.split(';')[0]!).join('; '), json: text ? (JSON.parse(text) as any) : undefined }
}

// Makes an account the way the sign-in page does: the address, the code mailed to it on its own, then a name and a
// password with the ticket the code was traded for.
const signUp = async (email: (typeof emails)[number]) => {
  const before = sent.length
  expect((await call('/api/auth/sign-up/send-code', { body: { email } })).status).toBe(200)
  // Mail goes out after the answer.
  await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(before)
  const code = /^\d{6}$/m.exec(sent.findLast((message) => message.to === email)!.text)![0]
  const verified = await call('/api/auth/sign-up/verify-code', { body: { email, code } })
  expect(verified.status).toBe(200)
  const created = await call('/api/auth/sign-up/create', { body: { ticket: verified.json.ticket, name: 'Nia', password, role: 'admin' } })
  expect(created.status).toBe(200)
  const { token } = (await call('/api/auth/token', { cookie: created.cookie })).json as { token: string }
  return { cookie: created.cookie, token, id: created.json.user.id as string }
}

const idOf = async (query: ReturnType<typeof sql<{ id: string }>>) => (await query.execute(db)).rows[0]!.id

describe.skipIf(!seeded)('open sign-up on the property portal', () => {
  it('lets anyone make an account from the sign-in page, as a member, whatever role they ask for', async () => {
    expect((await call('/api/auth/status')).json).toMatchObject({ signUp: true, anonymous: true })
    const nia = await signUp('nia@portal.example')
    expect(decodeJwt(nia.token)).toMatchObject({ sub: nia.id, role: 'member' })
    // Better Auth's own routes do not raise it either.
    expect((await call('/api/auth/update-user', { body: { role: 'admin' }, cookie: nia.cookie })).status).toBe(400)
    expect((await call('/api/auth/admin/set-role', { body: { userId: nia.id, role: 'admin' }, cookie: nia.cookie })).status).toBe(403)
    expect((await call('/api/auth/admin/list-users', { cookie: nia.cookie })).status).toBe(403)
    expect(decodeJwt((await call('/api/auth/token', { cookie: nia.cookie })).json.token)).toMatchObject({ role: 'member' })
  })

  it('gives the new member the visitor features of their own, and nobody else\'s data or the catalogue', async () => {
    const { token, id } = await signUp('ole@portal.example')
    const listing = await idOf(sql<{ id: string }>`select id::text as id from market.listings where published_at is not null order by id limit 1`)
    const draft = await idOf(sql<{ id: string }>`select id::text as id from market.listings where published_at is null order by id limit 1`)
    const annasSearch = await idOf(sql<{ id: string }>`select id::text as id from members.saved_searches where user_id = 'seed-anna' order by id limit 1`)

    // Their own favorites and searches, empty to start, and saved as theirs.
    for (const resource of ['favorites', 'saved_searches', 'notes', 'alerts']) expect((await call(`/api/v1/${resource}`, { token })).json.items, resource).toEqual([])
    const favorite = await call('/api/v1/favorites', { body: { listing_id: listing }, token })
    const search = await call('/api/v1/saved_searches', { body: { name: 'Gardens', filter: 'garden = true' }, token })
    try {
      expect(favorite.status).toBe(201)
      expect(favorite.json.user_id).toBe(id)
      expect(search.status).toBe(201)
      expect(search.json.user_id).toBe(id)

      // Another member's search stays hidden, and so do drafts; the catalogue is the admins'.
      expect((await call(`/api/v1/saved_searches/${annasSearch}`, { token })).status).toBe(404)
      expect((await call(`/api/v1/listings/${draft}`, { token })).status).toBe(404)
      expect((await call(`/api/v1/listings/${listing}`, { method: 'PATCH', body: { rent_price: '1.00' }, token })).status).toBe(403)
      expect((await call('/api/v1/places', { body: { name: 'Nowhere' }, token })).status).toBe(403)
    } finally {
      await sql`delete from members.favorites where user_id = ${id}`.execute(db)
      await sql`delete from members.saved_searches where user_id = ${id}`.execute(db)
    }
  })
})
