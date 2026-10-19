import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, l, resource, view, type AccessContext } from '@protobase/schema'
import { checkComments, commentsMigration, createAdmin, startJobs, type CommentUsers, type JobsRuntime } from '@protobase/server'
import type { TestDatabase } from '../changes/capture-scenarios'

const ddl = `
create table tickets (
  id integer generated always as identity primary key,
  org_id text not null,
  title text not null,
  status text not null,
  deleted_at timestamptz
);
create table notes (id integer generated always as identity primary key, org_id text not null, body text not null);
insert into tickets (org_id, title, status) values ('acme', 'Printer on fire', 'open'), ('acme', 'Old laptop', 'closed'), ('globex', 'Their printer', 'open');
insert into notes (org_id, body) values ('acme', 'A note');`

const roles = (ctx: AccessContext) => ctx.user?.roles ?? []
const admins = (ctx: AccessContext) => roles(ctx).includes('admin')

// Agents and admins read every ticket of their organization, sales only the ones not closed.
const tickets = resource('tickets')
  .table('tickets')
  .fields({ id: f.integer().readOnly(), org_id: f.text(), title: f.text(), status: f.enum(['open', 'closed']), deleted_at: f.timestamp().optional().readOnly() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org_id)
  .softDelete((r) => r.deleted_at)
  .access({ read: (ctx) => (roles(ctx).includes('sales') ? 'status != "closed"' : roles(ctx).some((role) => role === 'agent' || role === 'admin')), create: admins, update: admins, delete: admins })
  .comments()

const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), org_id: f.text(), body: f.text() }).primaryKey((r) => r.id).tenant((r) => r.org_id)

const ticketsView = view<typeof tickets>('tickets').names({ singular: 'Ticket', plural: 'Tickets' }).title((r) => r.title).layout((r) => [l.section('Ticket', [r.title, r.status]), l.comments()])

// Ann and Bo are agents of Acme, Cy is in sales there, Dee belongs to no organization.
const people = [
  { id: 'ann', name: 'Ann de Vries', role: 'agent', email: 'ann@acme.example' },
  { id: 'bo', name: 'Bo Jansen', role: 'agent', email: 'bo@acme.example' },
  { id: 'cy', name: 'Cy Visser', role: 'sales', email: 'cy@acme.example' },
  { id: 'dee', name: 'Dee Vries', role: undefined, email: 'dee@example.com' },
]

const users: CommentUsers = {
  names: async (ids) => Object.fromEntries(people.filter((user) => ids.includes(user.id)).map((user) => [user.id, user.name])),
  search: async (query, limit) => people.filter((user) => user.name.toLowerCase().includes(query.toLowerCase())).slice(0, limit).map(({ id, name }) => ({ id, name })),
  roles: async ({ id, tenant }) => {
    const role = people.find((user) => user.id === id)?.role
    return role && tenant === 'acme' ? [role] : []
  },
  email: async (id) => people.find((user) => user.id === id)?.email,
}

type Item = { id: string; body: string; created_at: string; author: { id: string; name?: string }; mentions: { id: string; name?: string }[] }

/** Comments on one database: written and read per caller, mentions checked and mailed by a job, listed for admins. */
export const commentsScenarios = (connect: () => Promise<TestDatabase>) => {
  let database: TestDatabase
  let db: Kysely<any>
  let runtime: JobsRuntime
  let admin: ReturnType<typeof createAdmin>
  const errors: unknown[] = []
  const sent: { to: string; subject: string; text?: string; html?: string }[] = []

  beforeAll(async () => {
    database = await connect()
    db = database.db
    await database.exec(ddl)
    await expect(checkComments(db, [tickets.toModel()])).rejects.toThrow('The comments schema is missing')
    await checkComments(db, [notes.toModel()])
    await database.exec((await commentsMigration(db))!)
    expect(await commentsMigration(db)).toBeUndefined()
    await checkComments(db, [tickets.toModel()])
    admin = createAdmin({
      resources: [tickets, notes],
      views: [ticketsView],
      db,
      authenticate: (request) => {
        const header = (name: string) => request.headers.get(name) ?? undefined
        const tenant = header('x-tenant') ?? 'acme'
        return { user: { id: header('x-user') ?? 'ann', roles: [header('x-role') ?? 'agent'] }, tenant, organization: { id: tenant }, ...(header('x-anonymous') && { anonymous: true as const }) }
      },
      commentUsers: users,
    })
    // The worker fetches at start and when woken, never on its timer while the file runs, so a busy machine records the same queries.
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 3600, shutdownSeconds: 5, onError: (error) => errors.push(error), mailer: { send: async (message) => void sent.push(message) } })
  })

  afterAll(async () => {
    await runtime?.stop()
    await database?.close()
    expect(errors).toEqual([])
  })

  const until = (check: () => unknown, timeout = 15_000) => vi.waitFor(check, { timeout, interval: 25 })
  type Caller = { user?: string; role?: string; tenant?: string; anonymous?: boolean }
  const call = (path: string, init: RequestInit & Caller = {}) =>
    admin.request(`http://desk.example.com/api/v1${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', 'if-match': '*', 'x-user': init.user ?? 'ann', 'x-role': init.role ?? 'agent', 'x-tenant': init.tenant ?? 'acme', ...(init.anonymous && { 'x-anonymous': 'true' }) },
    })
  const post = async (key: string, body: unknown, caller: Caller = {}) => {
    const response = await call(`/tickets/${key}:comments`, { method: 'POST', body: JSON.stringify(body), ...caller })
    return { status: response.status, body: (await response.json()) as Item & { type?: string } }
  }
  const read = async (key: string, query = '', caller: Caller = {}) => {
    const response = await call(`/tickets/${key}:comments${query}`, caller)
    return { status: response.status, body: (await response.json()) as { items: Item[]; next_page_token: string; type?: string } }
  }
  const mentionable = async (key: string, q: string, caller: Caller = {}) => {
    const response = await call(`/tickets/${key}:mentionable?q=${encodeURIComponent(q)}`, caller)
    return { status: response.status, body: (await response.json()) as { items: { id: string; name: string }[] } }
  }
  const stored = async () => Number((await sql<{ count: string }>`select count(*)::text as count from comments.comments`.execute(db)).rows[0]!.count)

  describe('posting and reading', () => {
    it('adds a comment by the caller and reads it back newest first, with names', async () => {
      const first = await post('1', { body: '  The printer is smoking.  ' })
      expect(first.status).toBe(201)
      expect(first.body).toMatchObject({ body: 'The printer is smoking.', author: { id: 'ann', name: 'Ann de Vries' }, mentions: [] })
      expect((await post('1', { body: 'On it.' }, { user: 'bo' })).status).toBe(201)
      const { status, body } = await read('1')
      expect(status).toBe(200)
      expect(body.items.map((item) => [item.author.name, item.body])).toEqual([['Bo Jansen', 'On it.'], ['Ann de Vries', 'The printer is smoking.']])
      expect(body.items[0]!.created_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
      expect(body.next_page_token).toBe('')
    })

    it('pages with page_size and next_page_token', async () => {
      const page = await read('1', '?page_size=1')
      expect(page.body.items.map((item) => item.body)).toEqual(['On it.'])
      const rest = await read('1', `?page_size=1&page_token=${page.body.next_page_token}`)
      expect(rest.body.items.map((item) => item.body)).toEqual(['The printer is smoking.'])
      expect(rest.body.next_page_token).toBe('')
      expect((await read('1', '?page_token=abc')).status).toBe(400)
    })

    it('refuses an empty comment, a visitor, and a resource without comments', async () => {
      expect((await post('1', { body: '   ' })).body.type).toBe('urn:protobase:problem:invalid-comment')
      const visitor = await post('1', { body: 'Hi' }, { anonymous: true })
      expect([visitor.status, visitor.body.type]).toEqual([403, 'urn:protobase:problem:comment-needs-user'])
      expect((await mentionable('1', '', { anonymous: true })).status).toBe(403)
      expect((await call('/notes/1:comments')).status).toBe(404)
      expect((await call('/notes/1:comments', { method: 'POST', body: JSON.stringify({ body: 'Hi' }) })).status).toBe(404)
    })
  })

  describe('who may comment', () => {
    it('answers 404 on all three endpoints for a record outside the row filter or the tenant', async () => {
      const sales = { user: 'cy', role: 'sales' }
      expect((await read('2', '', sales)).status).toBe(404)
      expect((await post('2', { body: 'Hi' }, sales)).status).toBe(404)
      expect((await mentionable('2', '', sales)).status).toBe(404)
      expect((await read('3')).status).toBe(404)
      expect((await post('3', { body: 'Hi' })).status).toBe(404)
      expect((await mentionable('3', '')).status).toBe(404)
      expect((await post('1', { body: 'Sales can see this one.' }, sales)).status).toBe(201)
    })

    it('reads but refuses new comments on a soft-deleted record', async () => {
      await sql`update tickets set deleted_at = now() where id = 2`.execute(db)
      expect((await read('2')).status).toBe(200)
      expect((await post('2', { body: 'Too late' })).status).toBe(404)
      await sql`update tickets set deleted_at = null where id = 2`.execute(db)
    })
  })

  describe('mentions', () => {
    it('offers the people who may read the record, without the caller', async () => {
      expect((await mentionable('1', '')).body.items.map((user) => user.id)).toEqual(['bo', 'cy'])
      expect((await mentionable('1', 'VRIES')).body.items).toEqual([])
      expect((await mentionable('1', 'jan')).body.items).toEqual([{ id: 'bo', name: 'Bo Jansen' }])
      expect((await mentionable('2', '')).body.items.map((user) => user.id)).toEqual(['bo'])
    })

    it('refuses a mention of someone who cannot read the record, and keeps nothing', async () => {
      const before = await stored()
      for (const mentions of [['cy'], ['dee'], ['nobody']]) {
        const refused = await post('2', { body: 'Look', mentions })
        expect([refused.status, refused.body.type]).toEqual([400, 'urn:protobase:problem:invalid-mention'])
      }
      expect(await stored()).toBe(before)
    })

    it('mails each person mentioned once, by a job, with a link to the record', async () => {
      const posted = await post('1', { body: 'Can you look, @Bo Jansen?', mentions: ['bo', 'bo', 'ann'] })
      expect(posted.body.mentions).toEqual([{ id: 'bo', name: 'Bo Jansen' }])
      expect((await read('1')).body.items[0]!.mentions).toEqual([{ id: 'bo', name: 'Bo Jansen' }])
      runtime.wake('comments.mention')
      await until(() => expect(sent).toHaveLength(1))
      expect(sent[0]).toMatchObject({ to: 'bo@acme.example', subject: 'Ann de Vries mentioned you on Ticket: Printer on fire' })
      expect(sent[0]!.text).toContain('Can you look, @Bo Jansen?')
      expect(sent[0]!.html).toContain('href="http://desk.example.com/tickets/1"')
    })

    it('sends nothing when mail is off', async () => {
      const job = admin.jobs.find((definition) => definition.name === 'comments.mention')!
      const { id } = (await read('1')).body.items[0]!
      await job.options.run({ comment: id, user: 'bo', url: 'http://desk.example.com/tickets/1', record: 'Ticket 1' }, { db, signal: new AbortController().signal } as never)
      expect(sent).toHaveLength(1)
    })
  })

  describe('moderation', () => {
    it('lists every comment to admins only, who may delete one but not write one', async () => {
      const listed = await call('/record_comments?order_by=id desc', { role: 'admin' })
      expect(listed.status).toBe(200)
      const { items } = (await listed.json()) as { items: { id: number; resource: string; record_key: string; author_id: string }[] }
      expect(items[0]).toMatchObject({ resource: 'tickets', record_key: '1', author_id: 'ann' })
      expect((await call('/record_comments')).status).toBe(404)
      expect((await call('/record_comments', { role: 'admin', method: 'POST', body: JSON.stringify({ body: 'x' }) })).status).toBe(403)
      const count = await stored()
      expect((await call(`/record_comments/${items[0]!.id}`, { role: 'admin', method: 'DELETE' })).status).toBe(204)
      expect(await stored()).toBe(count - 1)
    })
  })
}
