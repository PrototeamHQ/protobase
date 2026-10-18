import { Kysely, sql } from 'kysely'
import { beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { defineJob } from '../src/jobs/define-job'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), body: f.text() }).primaryKey((r) => r.id)

let db: Kysely<any>
const flaky = defineJob<{ n: number }>({ name: 'flaky', maxAttempts: 1, run: () => {} })

beforeAll(async () => {
  const pg = await openSnapshotDb('jobs')
  await pg.exec('create table notes (id integer generated always as identity primary key, body text not null)')
  db = new Kysely<any>({ dialect: pg.dialect })
})

const app = () => createAdmin({ resources: [notes], db, authenticate: testAuthenticator, jobs: [flaky] })

const job = async (id: string) => (await sql<{ state: string; retry_limit: number }>`select state, retry_limit from jobs.job where id = ${id}`.execute(db)).rows[0]
const state = async (id: string) => (await job(id))?.state

/** A job whose one attempt failed, as pg-boss leaves it: failed now, with the error as its output. The page reads only these rows. */
const failed = async (n: number) => {
  const { rows } = await sql<{ id: string }>`select jobs.enqueue('flaky', ${JSON.stringify({ n })}::jsonb) as id`.execute(db)
  const id = rows[0]!.id
  await sql`update jobs.job set state = 'failed', completed_on = now(), output = ${JSON.stringify({ name: 'Error', message: `SMTP down for ${n}` })}::jsonb where id = ${id}`.execute(db)
  return id
}

describe('the failed jobs page', () => {
  it('lists failed jobs with their last error, newest first, to admins only', async () => {
    const [first, second] = [await failed(1), await failed(2)]
    const list = await app().request('/api/v1/failed_jobs?order_by=failed_at%20desc', { headers: as(undefined, 'admin') })
    expect(list.status).toBe(200)
    const { items } = await list.json()
    expect(items.map((item: { id: string }) => item.id)).toEqual([second, first])
    expect(items[0]).toMatchObject({ name: 'flaky', error: 'SMTP down for 2', attempts: 1, payload: { n: 2 }, retry: false })
    // To anyone else the resource does not exist.
    expect((await app().request('/api/v1/failed_jobs', { headers: as(undefined, 'manager') })).status).toBe(404)
    const meta = await (await app().request('/api/meta', { headers: as(undefined, 'admin') })).json()
    expect(JSON.stringify(meta)).toContain('Failed jobs')
  })

  it('retries a failed job with one more attempt, from now', async () => {
    const id = await failed(3)
    const record = `/api/v1/failed_jobs/${id}`
    const read = await app().request(record, { headers: as(undefined, 'admin') })
    const before = await job(id)
    const retried = await app().request(record, {
      method: 'PATCH',
      headers: as(undefined, 'admin', { 'content-type': 'application/json', 'if-match': read.headers.get('etag')! }),
      body: JSON.stringify({ retry: true }),
    })
    expect(retried.status).toBe(200)
    // Waiting for a worker again, as pg-boss's retry() leaves it; running it is the jobs runtime's own business.
    expect(await job(id)).toEqual({ state: 'retry', retry_limit: before!.retry_limit + 1 })
  })

  it('deletes a failed job', async () => {
    const id = await failed(4)
    const record = `/api/v1/failed_jobs/${id}`
    const read = await app().request(record, { headers: as(undefined, 'admin') })
    const deleted = await app().request(record, { method: 'DELETE', headers: as(undefined, 'admin', { 'if-match': read.headers.get('etag')! }) })
    expect(deleted.status).toBeLessThan(300)
    expect(await state(id)).toBeUndefined()
  })

  it('is not there for an app without jobs', async () => {
    const plain = createAdmin({ resources: [notes], db, authenticate: testAuthenticator })
    expect((await plain.request('/api/v1/failed_jobs', { headers: as(undefined, 'admin') })).status).toBe(404)
  })
})
