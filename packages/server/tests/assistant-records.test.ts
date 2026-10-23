import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { HttpProblem } from '../src/problem'
import { defineTool } from '../src/assistant/tools'
import type { ToolRecords } from '../src/assistant/records'
import type { WriteEvent } from '../src/types'
import { as, createFixtureDb, createTestApp, json } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
let chats: string
beforeAll(async () => {
  fixture = await createFixtureDb()
  chats = await mkdtemp(path.join(tmpdir(), 'protobase-records-'))
})
afterAll(async () => {
  await fixture.db.destroy()
  await rm(chats, { recursive: true, force: true })
})

const sse = (chunks: unknown[]) => new Response([...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), 'data: [DONE]\n\n'].join(''), { headers: { 'content-type': 'text/event-stream' } })
const callGrab = () => sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'grab_records', arguments: '{}' } }] } }] }])
const answer = () => sse([{ choices: [{ delta: { content: 'Done.' } }] }])

// The records a tool gets in a turn of a caller in `org` with `roles`: one message whose model calls a tool that keeps them.
const recordsFor = async (org: number, roles: string, hooks: Array<(event: WriteEvent) => Promise<void>> = []) => {
  let records: ToolRecords | undefined
  const grab = defineTool({ name: 'grab_records', description: 'Test only.', parameters: { type: 'object' }, run: async (_args, context) => {
    records = context.records
    return 'ok'
  } })
  const replies = [callGrab, answer]
  const fetch = (async () => replies.shift()!()) as typeof globalThis.fetch
  const app = createTestApp(fixture, { assistant: { apiKey: 'key', baseUrl: 'http://localhost:11434/v1', model: 'test', chats: path.join(chats, crypto.randomUUID()), fetch, tools: [grab] } }, hooks)
  await app.request('/api/assistant/messages', json({ text: 'Go' }, as(org, roles)))
  await vi.waitFor(() => expect(records).toBeDefined())
  return records!
}

const refusal = (promise: Promise<unknown>) => promise.then(() => undefined, (error: unknown) => (error instanceof HttpProblem ? { status: error.status, detail: error.detail } : error))

describe('ToolContext.records', () => {
  it('reads a record as the user may see it, with its ETag, inside their tenant only', async () => {
    const records = await recordsFor(1, 'admin')
    const { record, etag } = await records.get('labels', 1)
    expect(record).toMatchObject({ id: 1, name: 'urgent', color: 'red' })
    expect(etag).toMatch(/^"/)
    expect(await records.get('lineItems', [1, 2])).toMatchObject({ record: { labelId: 1, lineNo: 2, quantity: 7 } })
    expect(await records.get('lineItems', '1,1')).toMatchObject({ record: { quantity: 5 } })
    expect(await refusal(records.get('labels', 3))).toEqual({ status: 404, detail: 'No labels with this key' })
    expect(await refusal(records.get('nothing', 1))).toEqual({ status: 404, detail: 'There is no resource "nothing"' })
  })

  it('creates and updates through the write pipeline: tenant, validation, hooks with the user, and ETags', async () => {
    const seen: WriteEvent[] = []
    const records = await recordsFor(1, 'admin', [async (event) => void seen.push(event)])
    const created = await records.create('companies', { name: 'Initech' })
    expect(created.record).toMatchObject({ name: 'Initech', organizationId: 1, status: 'open' })
    const updated = await records.update('companies', created.record.id as number, { status: 'won' }, { etag: created.etag })
    expect(updated.record).toMatchObject({ status: 'won' })
    expect(seen.map((event) => [event.operation, event.user.id, event.tenant])).toEqual([['create', 'tester', 1], ['update', 'tester', 1]])

    expect(await refusal(records.update('companies', created.record.id as number, { status: 'lost' }, { etag: created.etag }))).toMatchObject({ status: 412 })
    expect(await records.update('companies', String(created.record.id), { status: 'lost' })).toMatchObject({ record: { status: 'lost' } })
    expect(await refusal(records.create('companies', { name: 'forbidden' }))).toMatchObject({ status: 400 })
  })

  it('refuses what the user may not write, as the REST API does', async () => {
    const records = await recordsFor(1, 'ai,restricted')
    expect(await records.create('labels', { name: 'ok-allowed' })).toMatchObject({ record: { name: 'ok-allowed' } })
    expect(await refusal(records.create('labels', { name: 'not-allowed' }))).toMatchObject({ status: 403 })
    // The update rule is a row filter, so a record outside it is not there to update.
    expect(await refusal(records.update('labels', 1, { color: 'blue' }))).toMatchObject({ status: 404 })
  })
})

// The fixture soft-deleted every hundredth company: 100 to 3000 are Acme's (1), 3100 to 3500 Globex's (2).
describe('ToolContext.records with show_deleted', () => {
  const rest = (path: string, org: number) => createTestApp(fixture).request(`/api/v1/${path}`, { headers: as(org) })

  it('reads a soft-deleted record as the REST API does, and one of another tenant as a missing one', async () => {
    const acme = await recordsFor(1, 'admin')
    expect(await refusal(acme.get('companies', 100))).toEqual({ status: 404, detail: 'No companies with this key' })
    const { permissions: _, ...shown } = (await (await rest('companies/100?show_deleted=true', 1)).json()) as Record<string, unknown>
    const { record, etag } = await acme.get('companies', 100, { show_deleted: true })
    expect({ ...record, etag }).toEqual(shown)
    expect(record.deletedAt).not.toBeNull()

    const globex = await recordsFor(2, 'admin')
    const missing = await refusal(globex.get('companies', 999999, { show_deleted: true }))
    expect(missing).toEqual({ status: 404, detail: 'No companies with this key' })
    expect(await refusal(globex.get('companies', 100, { show_deleted: true }))).toEqual(missing)
  })

  it('lists soft-deleted records inside the tenant and the row filter only, whatever the filter names', async () => {
    const globex = await recordsFor(2, 'admin')
    const ids = async (records: ToolRecords, filter: string) => (await records.list('companies', { filter, show_deleted: true })).items.map((item) => item.id)
    expect(await ids(globex, 'id = 100 OR id = 3100')).toEqual([3100])
    expect(await ids(globex, 'organizationId = 1')).toEqual([])
    // A sales person lists open companies only: 200 is lost, 300 open.
    expect(await ids(await recordsFor(1, 'ai,sales'), 'id = 200 OR id = 300')).toEqual([300])
  })

  it('pages through the tenant\'s records only, and a page token never carries the flag', async () => {
    const globex = await recordsFor(2, 'admin')
    const params = { filter: 'id >= 2995 AND id <= 3105', order_by: 'id', page_size: 50, show_deleted: true, count: 'exact' as const }
    const first = await globex.list('companies', params)
    expect(first.total_size).toBe(105)
    const items = [...first.items]
    for (let token = first.next_page_token; token;) {
      const page = await globex.list('companies', { ...params, page_token: token })
      items.push(...page.items)
      token = page.next_page_token
    }
    expect(items.map((item) => item.id)).toEqual(Array.from({ length: 105 }, (_, index) => 3001 + index))
    expect(items.filter((item) => item.deletedAt !== null).map((item) => item.id)).toEqual([3100])

    const { show_deleted: _, ...hidden } = params
    const replayed = await globex.list('companies', { ...hidden, page_token: first.next_page_token })
    expect(replayed.items.map((item) => item.id)).toEqual(Array.from({ length: 50 }, (_, index) => 3051 + index).filter((id) => id !== 3100).concat(3101))
    const acme = await recordsFor(1, 'admin')
    expect((await acme.list('companies', { ...params, page_token: first.next_page_token })).items).toEqual([])
  })

  it('is refused on a resource without a soft delete', async () => {
    const acme = await recordsFor(1, 'admin')
    const unsupported = { status: 400, detail: 'Resource "labels" does not soft delete, so show_deleted does not apply' }
    expect(await refusal(acme.get('labels', 1, { show_deleted: true }))).toEqual(unsupported)
    expect(await refusal(acme.list('labels', { show_deleted: true }))).toEqual(unsupported)
  })
})
