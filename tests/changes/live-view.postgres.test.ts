import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { readEventStream } from '@protobase/schema/internal'
import { changesMigration, createAdmin, startJobs, type JobsRuntime } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

// Workers poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const table = (name: string) => resource(name).table(name).fields({ id: f.integer().readOnly(), body: f.text() }).primaryKey((r) => r.id)
const messages = table('messages')
const replies = table('replies')
const audit = table('audit').live()
// A chat thread over a view merging messages and replies, which takes no trigger of its own.
const thread = resource('thread')
  .table('thread')
  .fields({ id: f.text(), body: f.text() })
  .primaryKey((r) => r.id)
  .live({ reads: ['messages', 'replies'] })

type Event = { type: string; changes?: Array<{ resource: string; key: string; operation: string }> }

describe.skipIf(!(await postgresTemplateReady('jobs')))('live views on Postgres', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let runtime: JobsRuntime
  let admin: ReturnType<typeof createAdmin>
  const errors: unknown[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec(`create table messages (id integer generated always as identity primary key, body text not null);
      create table replies (id integer generated always as identity primary key, body text not null);
      create table audit (id integer generated always as identity primary key, body text not null);
      create view thread as select 'm' || id as id, body from messages union all select 'r' || id, body from replies`)
    const models = [messages, replies, audit, thread].map((model) => model.toModel())
    await pg.exec((await changesMigration(db, models))!)
    admin = createAdmin({ resources: [messages, replies, audit, thread], db, authenticate: () => ({ user: { id: 'u1', roles: ['admin'] } }) })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await runtime?.stop()
    await pg?.close()
    expect(errors).toEqual([])
  })

  // Follows the stream while `write` runs, until `count` changes came, then hangs up.
  const changes = async (count: number, write: () => Promise<unknown>) => {
    const controller = new AbortController()
    const response = await admin.request('/api/live', { signal: controller.signal })
    const seen: string[] = []
    // Hangs up when the write fails too, so no stream outlives the test.
    try {
      await new Promise<void>((resolve, reject) => {
        let first = true
        void readEventStream(response.body!, (data) => {
          const event = JSON.parse(data) as Event
          if (first) write().catch(reject)
          first = false
          seen.push(...(event.changes ?? []).map((change) => `${change.resource}:${change.key}`))
          if (seen.length >= count) resolve()
        }, controller.signal)
      })
    } finally {
      controller.abort()
    }
    return seen
  }

  it('refreshes the view when either table it reads changes', async () => {
    expect(await changes(1, () => sql`insert into messages (body) values ('hello')`.execute(db))).toEqual(['thread:'])
    expect(await changes(1, () => sql`insert into replies (body) values ('hi')`.execute(db))).toEqual(['thread:'])
  })

  it('leaves the view alone when another table changes', async () => {
    expect(await changes(1, () => sql`insert into audit (body) values ('signed in')`.execute(db))).toEqual(['audit:1'])
  })
})
