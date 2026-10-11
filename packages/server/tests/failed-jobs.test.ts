import { Kysely, sql } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { defineJob } from '../src/jobs/define-job'
import { startJobs, type JobsRuntime } from '../src/jobs/runtime'
import { as, testAuthenticator } from '../../../test-support/server'
import { createJobsPg } from '../../../test-support/jobs'

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000 })

const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), body: f.text() }).primaryKey((r) => r.id)

let db: Kysely<any>
let runtime: JobsRuntime
let healthy = false
const flaky = defineJob<{ n: number }>({ name: 'flaky', maxAttempts: 1, run: ({ n }) => { if (!healthy) throw new Error(`SMTP down for ${n}`) } })

beforeAll(async () => {
  const pg = await createJobsPg()
  await pg.exec('create table notes (id integer generated always as identity primary key, body text not null)')
  db = new Kysely<any>({ dialect: new PGliteDialect(pg) })
  runtime = await startJobs({ db, jobs: [flaky], pollSeconds: 0.5, onError: (error) => { throw error } })
})
afterAll(async () => {
  await runtime.stop()
})

const app = () => createAdmin({ resources: [notes], db, authenticate: testAuthenticator, jobs: [flaky] })

const state = async (id: string) => (await sql<{ state: string }>`select state from jobs.job where id = ${id}`.execute(db)).rows[0]?.state

const failed = async (n: number) => {
  const id = await flaky.enqueue(db, { n })
  await vi.waitFor(async () => expect(await state(id)).toBe('failed'), { timeout: 15_000, interval: 20 })
  return id
}

describe('the failed jobs page', () => {
  it('lists failed jobs with their last error, newest first, to admins only', async () => {
    const [first, second] = [await failed(1), await failed(2)]
    const list = await app().request('/api/v1/failedJobs?order_by=failedAt%20desc', { headers: as(undefined, 'admin') })
    expect(list.status).toBe(200)
    const { items } = await list.json()
    expect(items.map((item: { id: string }) => item.id)).toEqual([second, first])
    expect(items[0]).toMatchObject({ name: 'flaky', error: 'SMTP down for 2', attempts: 1, payload: { n: 2 }, retry: false })
    // To anyone else the resource does not exist.
    expect((await app().request('/api/v1/failedJobs', { headers: as(undefined, 'manager') })).status).toBe(404)
    const meta = await (await app().request('/api/meta', { headers: as(undefined, 'admin') })).json()
    expect(JSON.stringify(meta)).toContain('Failed jobs')
  })

  it('retries a failed job with one more attempt, from now', async () => {
    const id = await failed(3)
    const record = `/api/v1/failedJobs/${id}`
    const read = await app().request(record, { headers: as(undefined, 'admin') })
    healthy = true
    const retried = await app().request(record, {
      method: 'PATCH',
      headers: as(undefined, 'admin', { 'content-type': 'application/json', 'if-match': read.headers.get('etag')! }),
      body: JSON.stringify({ retry: true }),
    })
    expect(retried.status).toBe(200)
    await vi.waitFor(async () => expect(await state(id)).toBe('completed'), { timeout: 15_000, interval: 20 })
    healthy = false
  })

  it('deletes a failed job', async () => {
    const id = await failed(4)
    const record = `/api/v1/failedJobs/${id}`
    const read = await app().request(record, { headers: as(undefined, 'admin') })
    const deleted = await app().request(record, { method: 'DELETE', headers: as(undefined, 'admin', { 'if-match': read.headers.get('etag')! }) })
    expect(deleted.status).toBeLessThan(300)
    expect(await state(id)).toBeUndefined()
  })

  it('is not there for an app without jobs', async () => {
    const plain = createAdmin({ resources: [notes], db, authenticate: testAuthenticator })
    expect((await plain.request('/api/v1/failedJobs', { headers: as(undefined, 'admin') })).status).toBe(404)
  })
})
