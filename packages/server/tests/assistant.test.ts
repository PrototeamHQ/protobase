import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
beforeAll(async () => {
  const pg = await createEmptyPg()
  await pg.exec('create table tasks (id integer generated always as identity primary key, title text not null, status text not null)')
  db = new Kysely({ dialect: new PGliteDialect(pg) })
})
afterAll(async () => { await db.destroy() })

const admin = (assistant: AdminOptions['assistant']) => createAdmin({ resources: [tasks], db, authenticate: testAuthenticator, options: { assistant } })

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

// A fake OpenAI-compatible endpoint that streams `answer`, recording each request body.
const fakeModel = (answer: (body: any) => Response) => {
  const bodies: any[] = []
  const fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    bodies.push(body)
    return answer(body)
  }) as typeof globalThis.fetch
  return { bodies, fetch }
}

const streamed = (pieces: string[]) =>
  new Response([...pieces.map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`), 'data: [DONE]\n\n'].join(''), { headers: { 'content-type': 'text/event-stream' } })

// Opens the event stream and folds its events into the state until `done` says so.
const watch = async (app: ReturnType<typeof admin>, roles: string, done: (state: AssistantState) => boolean) => {
  const response = await app.request('/api/assistant/events', { headers: as(1, roles) })
  expect(response.headers.get('content-type')).toContain('text/event-stream')
  const controller = new AbortController()
  let state = emptyAssistantState
  const finished = readEventStream(response.body!, (data) => {
    state = applyAssistantEvent(state, JSON.parse(data) as AssistantEvent)
    if (done(state)) controller.abort()
  }, controller.signal)
  return { state: () => state, finished }
}

const answered = (state: AssistantState) => state.messages.length === 2 && !state.replying

describe('the built-in assistant', () => {
  it('streams an answer to a question, with the app described in the system prompt', async () => {
    const model = fakeModel(() => streamed(['There are ', 'two statuses: open and done.']))
    const app = admin({ apiKey: 'sk-or-test', model: 'test/model', fetch: model.fetch })
    const stream = await watch(app, 'admin', answered)
    expect((await app.request('/api/assistant/messages', json({ text: 'Which statuses can a task have?' }, as(1, 'admin')))).status).toBe(202)
    await stream.finished

    const [user, reply] = stream.state().messages
    expect(user).toMatchObject({ from: 'user', parts: [{ type: 'text', text: 'Which statuses can a task have?' }] })
    expect(reply).toMatchObject({ from: 'assistant', parts: [{ type: 'text', text: 'There are two statuses: open and done.' }] })
    const [body] = model.bodies
    expect(body.model).toBe('test/model')
    expect(body.stream).toBe(true)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toContain('- tasks\n  - id: integer, read-only\n  - title: text\n  - status: one of open, done')
    expect(body.messages.slice(1)).toEqual([{ role: 'user', content: 'Which statuses can a task have?' }])
  })

  it('shows a refused key as a danger card with the endpoint’s message', async () => {
    const model = fakeModel(() => Response.json({ error: { message: 'No auth credentials found' } }, { status: 401 }))
    const app = admin({ apiKey: 'sk-wrong', fetch: model.fetch })
    const stream = await watch(app, 'ai', answered)
    await app.request('/api/assistant/messages', json({ text: 'Hello?' }, as(1, 'ai')))
    await stream.finished
    expect(stream.state().messages[1]?.parts).toEqual([
      expect.objectContaining({ type: 'card', tone: 'danger', title: 'The assistant could not answer', body: 'The model endpoint https://openrouter.ai/api/v1 answered 401: No auth credentials found (check the API key)' }),
    ])
  })

  it('refuses callers without the admin or ai role, empty questions and actions', async () => {
    const app = admin({ apiKey: 'sk-or-test', fetch: fakeModel(() => streamed(['ok'])).fetch })
    expect((await app.request('/api/assistant/events', { headers: as(1, 'sales') })).status).toBe(403)
    expect((await app.request('/api/assistant/messages', json({ text: 'Hi' }, as(1, 'sales')))).status).toBe(403)
    expect((await app.request('/api/assistant/messages', json({ text: '  ' }, as(1, 'admin')))).status).toBe(400)
    expect((await app.request('/api/assistant/actions', json({ partId: 'p', actionId: 'a' }, as(1, 'admin')))).status).toBe(404)
  })

  it('is not mounted for an external backend', async () => {
    expect((await admin({ url: 'https://assistant.example.com' }).request('/api/assistant/events', { headers: as(1, 'admin') })).status).toBe(404)
  })
})
