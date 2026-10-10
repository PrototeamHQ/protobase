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
