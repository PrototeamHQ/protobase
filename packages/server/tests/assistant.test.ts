import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Kysely, sql } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applyAssistantEvent, emptyAssistantState, f, readEventStream, resource, type AssistantEvent, type AssistantState } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import type { AdminOptions } from '../src/types'
import { as, json, testAuthenticator } from '../../../test-support/server'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly(), title: f.text(), status: f.enum(['open', 'done']) })
  .primaryKey((r) => r.id)

let db: Kysely<any>
let chats: string
beforeAll(async () => {
  const pg = await createEmptyPg()
  await pg.exec('create table tasks (id integer generated always as identity primary key, title text not null, status text not null)')
  db = new Kysely({ dialect: new PGliteDialect(pg) })
  chats = await mkdtemp(path.join(tmpdir(), 'protobase-assistant-'))
})
afterAll(async () => {
  await db.destroy()
  await rm(chats, { recursive: true, force: true })
})

// An OpenAI-compatible endpoint other than OpenRouter's, which gets plain messages.
const plain = { apiKey: 'key', baseUrl: 'http://localhost:11434/v1', model: 'llama3.3' }

// Each app keeps its conversations in a directory of its own, unless it is given one.
const admin = (assistant: AdminOptions['assistant']) =>
  createAdmin({ resources: [tasks], db, authenticate: testAuthenticator, options: { assistant: assistant && { chats: path.join(chats, crypto.randomUUID()), ...assistant } } })

const metaFor = async (app: ReturnType<typeof admin>, roles: string) => (await app.request('/api/meta', { headers: as(1, roles) })).json()

describe('the assistant in /meta', () => {
  it('names an external backend to admin and ai callers only', async () => {
    const app = admin({ url: 'https://assistant.example.com/apps/7' })
    expect((await metaFor(app, 'admin')).assistant).toEqual({ url: 'https://assistant.example.com/apps/7' })
    expect((await metaFor(app, 'sales,ai')).assistant).toEqual({ url: 'https://assistant.example.com/apps/7' })
    expect(await metaFor(app, 'sales')).not.toHaveProperty('assistant')
  })

  it('names the built-in one by its path when only an API key is set', async () => {
    expect((await metaFor(admin({ apiKey: 'sk-or-test' }), 'admin')).assistant).toEqual({ url: '/api/assistant' })
  })

  it('names the external backend over the built-in one', async () => {
    expect((await metaFor(admin({ apiKey: 'sk-or-test', url: 'https://assistant.example.com' }), 'admin')).assistant).toEqual({ url: 'https://assistant.example.com' })
  })

  it('names none without a URL or a key', async () => {
    expect(await metaFor(admin(undefined), 'admin')).not.toHaveProperty('assistant')
    expect(await metaFor(admin(false), 'admin')).not.toHaveProperty('assistant')
  })
})

// A fake OpenAI-compatible endpoint: answers each request with the next of `answers`, recording the request bodies.
const fakeModel = (answers: Array<(body: any) => Response>) => {
  const bodies: any[] = []
  const fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    bodies.push(body)
    const answer = answers.shift()
    if (!answer) throw new Error('The fake model got more requests than answers')
    return answer(body)
  }) as typeof globalThis.fetch
  return { bodies, fetch }
}

const sse = (chunks: unknown[]) => new Response([...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), 'data: [DONE]\n\n'].join(''), { headers: { 'content-type': 'text/event-stream' } })
const says = (...pieces: string[]) => () => sse(pieces.map((content) => ({ choices: [{ delta: { content } }] })))
const calls = (name: string, args: unknown) => () => sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] }])

// Follows the event stream, folding its events into the state, until `until` holds for it.
const watch = async (app: ReturnType<typeof admin>, roles: string) => {
  const response = await app.request('/api/assistant/events', { headers: as(1, roles) })
  expect(response.headers.get('content-type')).toContain('text/event-stream')
  const controller = new AbortController()
  let state = emptyAssistantState
  const waiting: Array<{ until: (state: AssistantState) => boolean; resolve: () => void }> = []
  const finished = readEventStream(response.body!, (data) => {
    state = applyAssistantEvent(state, JSON.parse(data) as AssistantEvent)
    for (const entry of waiting.filter((item) => item.until(state))) {
      waiting.splice(waiting.indexOf(entry), 1)
      entry.resolve()
    }
  }, controller.signal)
  return {
    state: () => state,
    until: (until: (state: AssistantState) => boolean) => (until(state) ? Promise.resolve() : new Promise<void>((resolve) => waiting.push({ until, resolve }))),
    stop: () => {
      controller.abort()
      return finished
    },
  }
}

const done = (state: AssistantState) => state.messages.length >= 2 && !state.replying
const partsOf = (state: AssistantState) => state.messages.at(-1)?.parts ?? []
const cardOf = (state: AssistantState) => partsOf(state).find((part) => part.type === 'card')

describe('the built-in assistant', () => {
  it('streams an answer, with the app described in the system prompt and the query tools offered', async () => {
    const model = fakeModel([says('There are ', 'two statuses: open and done.')])
    const app = admin({ apiKey: 'sk-or-test', model: 'test/model', fetch: model.fetch })
    const stream = await watch(app, 'admin')
    expect((await app.request('/api/assistant/messages', json({ text: 'Which statuses can a task have?' }, as(1, 'admin')))).status).toBe(202)
    await stream.until(done)
    await stream.stop()

    expect(stream.state().messages.map((message) => [message.from, message.parts])).toEqual([
      ['user', [expect.objectContaining({ type: 'text', text: 'Which statuses can a task have?' })]],
      ['assistant', [expect.objectContaining({ type: 'text', text: 'There are two statuses: open and done.' })]],
    ])
    const [body] = model.bodies
    expect(body.model).toBe('test/model')
    expect(body.stream).toBe(true)
    expect(body.tools.map((tool: any) => tool.function.name)).toEqual(['run_read_only_query', 'propose_write_query'])
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content[0].text).toContain('- tasks (table tasks)\n  - id: integer, read-only\n  - title: text\n  - status: one of open, done')
    expect(body.messages.slice(1)).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Which statuses can a task have?', cache_control: { type: 'ephemeral' } }] }])
  })

  it('on OpenRouter, marks cache breakpoints and asks for low reasoning; elsewhere sends plain messages', async () => {
    const openRouter = fakeModel([says('Hi.')])
    const app = admin({ apiKey: 'sk-or-test', fetch: openRouter.fetch })
    await app.request('/api/assistant/messages', json({ text: 'Hello' }, as(1, 'admin')))
    await vi.waitFor(() => expect(openRouter.bodies).toHaveLength(1))
    expect(openRouter.bodies[0].reasoning).toEqual({ effort: 'low' })
    expect(openRouter.bodies[0].messages[0].content).toEqual([expect.objectContaining({ cache_control: { type: 'ephemeral' } })])

    const local = fakeModel([says('Hi.')])
    const localApp = admin({ ...plain, fetch: local.fetch })
    await localApp.request('/api/assistant/messages', json({ text: 'Hello' }, as(1, 'admin')))
    await vi.waitFor(() => expect(local.bodies).toHaveLength(1))
    expect(local.bodies[0]).not.toHaveProperty('reasoning')
    expect(local.bodies[0].messages[1]).toEqual({ role: 'user', content: 'Hello' })
  })

  it('tells the model the page the user is on, and refuses a page that is no string', async () => {
    const model = fakeModel([says('That is task 7.')])
    const app = admin({ ...plain, fetch: model.fetch })
    expect((await app.request('/api/assistant/messages', json({ text: 'What is this?', page: 7 }, as(1, 'admin')))).status).toBe(400)
    await app.request('/api/assistant/messages', json({ text: 'What is this?', page: '/tasks/7' }, as(1, 'admin')))
    await vi.waitFor(() => expect(model.bodies).toHaveLength(1))
    expect(model.bodies[0].messages[1].content).toBe('The user is on the page /tasks/7 of the app (/<resource> lists records, /<resource>/<key> shows one).\n\nWhat is this?')
  })

  it('keeps conversations in files, so a restarted server shows the chat and the model reads it again', async () => {
    const directory = path.join(chats, 'restart')
    const before = fakeModel([says('There are none.')])
    const first = admin({ ...plain, chats: directory, fetch: before.fetch })
    const stream = await watch(first, 'admin')
    await first.request('/api/assistant/messages', json({ text: 'Any open tasks?' }, as(1, 'admin')))
    await stream.until(done)
    await stream.stop()
    expect(await readdir(directory)).toHaveLength(1)

    const after = fakeModel([says('Still none.')])
    const restarted = admin({ ...plain, chats: directory, fetch: after.fetch })
    const again = await watch(restarted, 'admin')
    expect(again.state().messages.map((message) => message.parts.map((part) => part.type === 'text' && part.text))).toEqual([['Any open tasks?'], ['There are none.']])
    await restarted.request('/api/assistant/messages', json({ text: 'And now?' }, as(1, 'admin')))
    await again.until((state) => state.messages.length === 4 && !state.replying)
    await again.stop()
    expect(after.bodies[0].messages.slice(1)).toEqual([
      { role: 'user', content: 'Any open tasks?' },
      { role: 'assistant', content: 'There are none.' },
      { role: 'user', content: 'And now?' },
    ])
  })

  it('runs a read-only query the model asks for, shows its rows and hands them back to the model', async () => {
    await sql`insert into tasks (title, status) values ('Write docs', 'open')`.execute(db)
    const model = fakeModel([calls('run_read_only_query', { sql: 'select title, status from tasks' }), says('One task is open.')])
    const app = admin({ ...plain, fetch: model.fetch })
    const stream = await watch(app, 'admin')
    await app.request('/api/assistant/messages', json({ text: 'Which tasks are open?' }, as(1, 'admin')))
    await stream.until(done)
    await stream.stop()

    expect(partsOf(stream.state())).toEqual([
      expect.objectContaining({ type: 'table', columns: ['title', 'status'], rows: [['Write docs', 'open']], caption: 'select title, status from tasks' }),
      expect.objectContaining({ type: 'text', text: 'One task is open.' }),
    ])
    expect(model.bodies[1].messages.slice(-2)).toEqual([
      { role: 'assistant', content: null, tool_calls: [{ id: 'call-run_read_only_query', type: 'function', function: { name: 'run_read_only_query', arguments: '{"sql":"select title, status from tasks"}' } }] },
      { role: 'tool', tool_call_id: 'call-run_read_only_query', content: '{"columns":["title","status"],"rows":[["Write docs","open"]],"truncated":false}' },
    ])
    await sql`truncate tasks`.execute(db)
  })

  it('tells the model when Postgres refuses a query, and refuses writes in it', async () => {
    const model = fakeModel([calls('run_read_only_query', { sql: 'delete from tasks returning id' }), says('I cannot change data that way.')])
    const app = admin({ ...plain, fetch: model.fetch })
    const stream = await watch(app, 'admin')
    await app.request('/api/assistant/messages', json({ text: 'Delete every task' }, as(1, 'admin')))
    await stream.until(done)
    await stream.stop()
    expect(model.bodies[1].messages.at(-1)).toEqual({ role: 'tool', tool_call_id: 'call-run_read_only_query', content: expect.stringMatching(/^Postgres refused the statement: cannot execute \w+ in a read-only transaction$/) })
  })

  it('runs a write only after the user approves it on the card', async () => {
    const model = fakeModel([calls('propose_write_query', { sql: `insert into tasks (title, status) values ('Ship', 'open') returning title`, summary: 'Adds the task Ship.' }), says('Added.')])
    const app = admin({ ...plain, fetch: model.fetch })
    const stream = await watch(app, 'admin')
    await app.request('/api/assistant/messages', json({ text: 'Add a task Ship' }, as(1, 'admin')))
    await stream.until((state) => cardOf(state)?.actions !== undefined)

    const card = cardOf(stream.state())!
    expect(card).toMatchObject({ title: 'Run this change?', body: 'Adds the task Ship.', code: `insert into tasks (title, status) values ('Ship', 'open') returning title`, actions: [{ id: 'approve', label: 'Approve', style: 'primary' }, { id: 'reject', label: 'Reject' }] })
    expect(stream.state().replying).toBe(true)
    expect((await sql`select * from tasks`.execute(db)).rows).toEqual([])

    expect((await app.request('/api/assistant/actions', json({ partId: card.id, actionId: 'approve' }, as(1, 'admin')))).status).toBe(202)
    await stream.until(done)
    await stream.stop()
    expect(cardOf(stream.state())).toMatchObject({ note: 'Approved.' })
    expect(cardOf(stream.state())).not.toHaveProperty('actions')
    expect((await sql<{ title: string }>`select title from tasks`.execute(db)).rows).toEqual([{ title: 'Ship' }])
    expect(model.bodies[1].messages.at(-1)).toEqual({ role: 'tool', tool_call_id: 'call-propose_write_query', content: '{"columns":["title"],"rows":[["Ship"]],"truncated":false}' })
    await sql`truncate tasks`.execute(db)
  })

  it('runs nothing when the user rejects the write', async () => {
    const model = fakeModel([calls('propose_write_query', { sql: 'delete from tasks returning id', summary: 'Deletes every task.' }), says('Nothing was deleted.')])
    const app = admin({ ...plain, fetch: model.fetch })
    await sql`insert into tasks (title, status) values ('Keep', 'open')`.execute(db)
    const stream = await watch(app, 'ai')
    await app.request('/api/assistant/messages', json({ text: 'Delete every task' }, as(1, 'ai')))
    await stream.until((state) => cardOf(state)?.actions !== undefined)
    await app.request('/api/assistant/actions', json({ partId: cardOf(stream.state())!.id, actionId: 'reject' }, as(1, 'ai')))
    await stream.until(done)
    await stream.stop()
    expect(cardOf(stream.state())).toMatchObject({ note: 'Rejected. Nothing ran.' })
    expect((await sql`select * from tasks`.execute(db)).rows).toHaveLength(1)
    expect(model.bodies[1].messages.at(-1)).toEqual({ role: 'tool', tool_call_id: 'call-propose_write_query', content: 'The user did not approve the statement (rejected); nothing ran.' })
    await sql`truncate tasks`.execute(db)
  })

  it('shows a refused key as a danger card with the endpoint’s message', async () => {
    const model = fakeModel([() => Response.json({ error: { message: 'No auth credentials found' } }, { status: 401 })])
    const app = admin({ apiKey: 'sk-wrong', fetch: model.fetch })
    const stream = await watch(app, 'ai')
    await app.request('/api/assistant/messages', json({ text: 'Hello?' }, as(1, 'ai')))
    await stream.until(done)
    await stream.stop()
    expect(partsOf(stream.state())).toEqual([
      expect.objectContaining({ type: 'card', tone: 'danger', title: 'The assistant could not answer', body: 'The model endpoint https://openrouter.ai/api/v1 answered 401: No auth credentials found (check the API key)' }),
    ])
  })

  it('refuses callers without the admin or ai role, empty messages and clicks no card waits for', async () => {
    const app = admin({ apiKey: 'sk-or-test', fetch: fakeModel([]).fetch })
    expect((await app.request('/api/assistant/events', { headers: as(1, 'sales') })).status).toBe(403)
    expect((await app.request('/api/assistant/messages', json({ text: 'Hi' }, as(1, 'sales')))).status).toBe(403)
    expect((await app.request('/api/assistant/messages', json({ text: 'Hi' }))).status).toBe(401)
    expect((await app.request('/api/assistant/messages', json({ text: '  ' }, as(1, 'admin')))).status).toBe(400)
    expect((await app.request('/api/assistant/actions', json({ partId: 'p', actionId: 'a' }, as(1, 'admin')))).status).toBe(404)
  })

  it('is not mounted for an external backend', async () => {
    expect((await admin({ url: 'https://assistant.example.com' }).request('/api/assistant/events', { headers: as(1, 'admin') })).status).toBe(404)
  })
})
