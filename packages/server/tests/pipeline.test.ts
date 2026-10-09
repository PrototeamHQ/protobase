import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readTransaction } from '../src/transactions'
import type { WriteEvent } from '../src/types'
import { as, createFixtureDb, createTestApp, json } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
beforeAll(async () => { fixture = await createFixtureDb() })
afterAll(async () => { await fixture.db.destroy() })

describe('write pipeline hooks', () => {
  it('run inside the write transaction with the statement timeout, the user and both row versions', async () => {
    const seen: Array<WriteEvent & { timeout: string }> = []
    const app = createTestApp(fixture, { statementTimeoutMs: 4321 }, [
      async (event, trx) => {
        const shown = await sql<{ statement_timeout: string }>`show statement_timeout`.execute(trx)
        seen.push({ ...event, timeout: shown.rows[0]!.statement_timeout })
      },
    ])
    const created = await (await app.request('/api/v1/labels', json({ name: 'hooked' }, as(1)))).json()
    const etag = (await app.request(`/api/v1/labels/${created.id}`, { headers: as(1) })).headers.get('etag')!
    await app.request(`/api/v1/labels/${created.id}`, { method: 'PATCH', body: JSON.stringify({ color: 'red' }), headers: { ...as(1), 'if-match': etag, 'content-type': 'application/json' } })
    await app.request(`/api/v1/labels/${created.id}`, { method: 'DELETE', headers: { ...as(1), 'if-match': '*' } })
    expect(seen.map((event) => event.operation)).toEqual(['create', 'update', 'delete'])
    expect(seen.every((event) => event.timeout === '4321ms' || event.timeout === '4s')).toBe(true)
    expect(seen[0]).toMatchObject({ user: { id: 'tester' }, tenant: 1, after: { name: 'hooked' } })
    expect(seen[1]).toMatchObject({ before: { color: null }, after: { color: 'red' } })
    expect(seen[2]).toMatchObject({ before: { color: 'red' } })
  })

  it('roll the write back when a hook throws', async () => {
    const app = createTestApp(fixture, {}, [async () => { throw new Error('audit unavailable') }])
    const response = await app.request('/api/v1/labels', json({ name: 'rolled-back' }, as(1)))
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('audit unavailable')
    expect((await fixture.pg.query("select 1 from labels where name = 'rolled-back'")).rows).toHaveLength(0)
  })

  it('reports unexpected errors to onUnhandledError', async () => {
    const reported: unknown[] = []
    const app = createTestApp(fixture, { onUnhandledError: (error) => reported.push(error) }, [async () => { throw new Error('boom') }])
    await app.request('/api/v1/labels', json({ name: 'x' }, as(1)))
    expect(reported).toHaveLength(1)
  })
})

describe('read transactions', () => {
  it('are read-only and refuse writes', async () => {
    const shown = await readTransaction(fixture.db, 1000, (trx) => sql<{ transaction_read_only: string }>`show transaction_read_only`.execute(trx))
    expect(shown.rows[0]!.transaction_read_only).toBe('on')
    await expect(readTransaction(fixture.db, 1000, (trx) => sql`delete from labels`.execute(trx))).rejects.toMatchObject({ code: '25006' })
  })
})
