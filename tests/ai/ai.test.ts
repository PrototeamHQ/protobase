import { Kysely, sql } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { f, resource, view, type AccessContext } from '@protobase/schema'
import { createAdmin, startJobs, type JobsRuntime } from '@protobase/server'
import { createJobsPg } from '../../test-support/jobs'

// Agents read and write tickets; clerks too, but may not change the summary; viewers only read.
const roles = (ctx: AccessContext) => ctx.user?.roles ?? []
const writers = (ctx: AccessContext) => roles(ctx).some((role) => ['agent', 'clerk', 'anonymous'].includes(role))
const tickets = resource('tickets')
  .table('tickets')
  .fields({
    id: f.integer().readOnly().dbDefault(),
    title: f.text(),
    description: f.text().optional(),
    summary: f.text().optional().ai({ prompt: 'Sum up this ticket.\n\nTitle: {title}\n\n{description}' }).access({ update: (ctx) => !roles(ctx).includes('clerk') }),
    priority: f.enum(['low', 'high']).optional(),
  })
  .primaryKey((r) => r.id)
  .access({ read: () => true, list: () => true, create: writers, update: writers })

const ticketsView = view<typeof tickets>('tickets').actions((a) => [
  a.ai('triage', { label: 'Suggest priority', prompt: 'How urgent is this?\n\n{title}\n{description}', writes: 'priority' }),
])
// Clerks have a view of their own, without the action.
const clerksView = view<typeof tickets>('tickets').forRoles(['clerk'])

type Answer = (body: { messages: Array<{ role: string; content: string }> }) => Promise<Response> | Response
const answers: Answer[] = []
const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = []
const sse = (content: string) => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })
const says = (content: string): Answer => () => sse(content)
const fakeFetch = (async (_: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body))
  bodies.push(body)
  const answer = answers.shift()
  if (!answer) throw new Error('The fake model got more requests than answers')
  return answer(body)
}) as typeof fetch

let db: Kysely<any>
let close: () => Promise<void>
let runtime: JobsRuntime
let admin: ReturnType<typeof createAdmin>
const reported: unknown[] = []

beforeAll(async () => {
  const pg = await createJobsPg()
  db = new Kysely<any>({ dialect: new PGliteDialect(pg) })
  close = () => db.destroy()
  await pg.exec('create table tickets (id integer generated always as identity primary key, title text not null, description text, summary text, priority text)')
  admin = createAdmin({
    resources: [tickets],
    views: [ticketsView, clerksView],
    db,
    authenticate: (request) => {
      const role = request.headers.get('x-role') ?? 'agent'
      return { user: { id: request.headers.get('x-user') ?? 'ann', roles: [role] }, ...(role === 'anonymous' && { anonymous: true as const }) }
    },
    options: { assistant: { apiKey: 'key', baseUrl: 'http://localhost:11434/v1', model: 'llama3.3', fetch: fakeFetch }, onUnhandledError: (error) => reported.push(error) },
  })
  // Jobs are enqueued but not worked: each test runs the fill itself
  runtime = await startJobs({ db, jobs: admin.jobs, work: false, onError: (error) => reported.push(error) })
})

afterAll(async () => {
  await runtime?.stop()
  await close?.()
})

beforeEach(async () => {
  answers.length = 0
  bodies.length = 0
  reported.length = 0
  await sql`delete from jobs.job where name = 'ai.fill'`.execute(db)
})

const call = (path: string, init: RequestInit & { role?: string } = {}) =>
  admin.request(`/api/v1${path}`, { ...init, headers: { 'content-type': 'application/json', 'if-match': '*', 'x-role': init.role ?? 'agent' } })
const create = async (body: Record<string, unknown>, role = 'agent') => (await (await call('/tickets', { method: 'POST', body: JSON.stringify(body), role })).json()) as { id: number }
const update = async (id: number, body: Record<string, unknown>, role = 'agent') => (await call(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body), role })).status
const stored = async (id: number) => (await sql<Record<string, unknown>>`select title, description, summary, priority from tickets where id = ${id}`.execute(db)).rows[0]!
const generate = (id: number, action: string, role = 'agent') => call(`/tickets/${id}:generate`, { method: 'POST', body: JSON.stringify({ action }), role })

const queued = async () => (await sql<{ data: any }>`select data from jobs.job where name = 'ai.fill' and state = 'created'`.execute(db)).rows.map((row) => row.data)
const fill = async () => {
  const job = admin.jobs.find((definition) => definition.name === 'ai.fill')!
  for (const payload of await queued()) await job.options.run(payload, { db, signal: new AbortController().signal } as never)
  await sql`delete from jobs.job where name = 'ai.fill'`.execute(db)
}

describe('AI actions at :generate', () => {
  it('writes the field from the prompt as the caller, and answers the record', async () => {
    const { id } = await create({ title: 'Printer on fire', description: 'Smoke everywhere' })
    answers.push(says(' high\n'))
    const response = await generate(id, 'triage')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id, priority: 'high', etag: expect.any(String) })
    expect(bodies[0]!.messages[1]!.content).toBe('How urgent is this?\n\nPrinter on fire\nSmoke everywhere\n\nAnswer with exactly one of: low, high')
    expect((await stored(id)).priority).toBe('high')
  })

  it('refuses before asking the model: a visitor, a caller who may not update, an unknown action or one their view lacks', async () => {
    const { id } = await create({ title: 'Broken chair' })
    expect((await generate(id, 'triage', 'anonymous')).status).toBe(403)
    expect((await (await generate(id, 'triage', 'viewer')).json()).type).toBe('urn:protobase:problem:ai-forbidden')
    expect((await generate(id, 'summarise')).status).toBe(404)
    expect((await generate(id, 'triage', 'clerk')).status).toBe(404)
    expect(bodies).toEqual([])
  })

  it('writes nothing when the record changed while the model answered', async () => {
    const { id } = await create({ title: 'Lamp flickers' })
    answers.push(async () => {
      expect(await update(id, { title: 'Lamp is out' })).toBe(200)
      return sse('low')
    })
    expect((await generate(id, 'triage')).status).toBe(412)
    expect(await stored(id)).toMatchObject({ title: 'Lamp is out', priority: null })
  })

  it('answers 502 without the endpoint\'s message when the model fails, and reports it', async () => {
    const { id } = await create({ title: 'Door stuck' })
    answers.push(() => new Response('upstream exploded', { status: 500 }))
    const response = await generate(id, 'triage')
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toContain('localhost')
    expect(reported).toHaveLength(1)
    expect((await stored(id)).priority).toBeNull()
  })

  it('is in the OpenAPI document of a caller whose view has an AI action', async () => {
    const paths = async (role: string) => Object.keys(((await (await admin.request('/api/openapi.json', { headers: { 'x-role': role } })).json()) as { paths: object }).paths)
    expect(await paths('agent')).toContain('/tickets/{key}:generate')
    expect(await paths('clerk')).not.toContain('/tickets/{key}:generate')
  })

  it('answers 422 without asking the model when every field the prompt reads is empty', async () => {
    const { id } = await create({ title: ' ' })
    expect((await generate(id, 'triage')).status).toBe(422)
    expect(bodies).toEqual([])
  })
})

describe('AI fields filled by a job', () => {
  it('fills the field after a create, as the writer', async () => {
    const { id } = await create({ title: 'Printer on fire', description: 'Smoke everywhere' })
    expect(await queued()).toEqual([{ resource: 'tickets', key: String(id), field: 'summary', user: { id: 'ann', roles: ['agent'] } }])
    answers.push(says('The printer is burning.'))
    await fill()
    expect(bodies[0]!.messages[1]!.content).toBe('Sum up this ticket.\n\nTitle: Printer on fire\n\nSmoke everywhere')
    expect((await stored(id)).summary).toBe('The printer is burning.')
  })

  it('refills after an update of a field the prompt reads, and not after the job\'s write or an edit of the field itself', async () => {
    const { id } = await create({ title: 'Printer on fire' })
    answers.push(says('Burning.'))
    await fill()
    expect(await queued()).toEqual([])
    expect(await update(id, { summary: 'My own words' })).toBe(200)
    expect(await update(id, { priority: 'high' })).toBe(200)
    expect(await queued()).toEqual([])
    expect(await update(id, { description: 'Now it smokes' })).toBe(200)
    answers.push(says('Burning and smoking.'))
    await fill()
    expect((await stored(id)).summary).toBe('Burning and smoking.')
  })

  it('clears the field without asking the model when every field the prompt reads is emptied', async () => {
    const { id } = await create({ title: 'Printer on fire', description: 'Smoke' })
    answers.push(says('Burning.'))
    await fill()
    expect(await update(id, { title: ' ', description: null })).toBe(200)
    await fill()
    expect(bodies).toHaveLength(1)
    expect((await stored(id)).summary).toBeNull()
  })

  it('writes nothing when a field the prompt reads changed while the model answered', async () => {
    const { id } = await create({ title: 'Lamp flickers' })
    const [payload] = await queued()
    answers.push(async () => {
      await sql`update tickets set title = 'Lamp is out' where id = ${id}`.execute(db)
      return sse('Flickering lamp.')
    })
    await admin.jobs.find((definition) => definition.name === 'ai.fill')!.options.run(payload, { db, signal: new AbortController().signal } as never)
    expect((await stored(id)).summary).toBeNull()
  })

  it('enqueues nothing for a writer who may not update the field, or a visitor', async () => {
    const { id } = await create({ title: 'Chair wobbles' }, 'clerk')
    expect(await queued()).toEqual([])
    expect(await update(id, { title: 'Chair broke' }, 'anonymous')).toBe(200)
    expect(await queued()).toEqual([])
  })
})

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
