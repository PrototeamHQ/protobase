import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { changesMigration, checkDerived, createAdmin, derivedMigration, startJobs, type DerivedCompute, type JobsRuntime } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

// Workers poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const objectives = resource('objectives')
  .table('objectives')
  .fields({ id: f.integer().readOnly(), title: f.text(), verdict: f.text().optional().readOnly() })
  .primaryKey((r) => r.id)
  .derived('verdict', { into: (r) => r.verdict, reads: ['tasks'] })

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly(), objectiveId: f.integer(), status: f.text(), createdAt: f.timestamp().readOnly() })
  .primaryKey((r) => r.id)

// Run while the function runs for that record, after its read: a change that lands meanwhile.
let duringRun: { key: string; run: () => Promise<void> } | undefined

// "late" once an open task is older than two hours, "open" while any is open, else "done".
const verdict: DerivedCompute = async (key, { db, clock }) => {
  const open = await db.selectFrom('tasks').select(['created_at']).where('objective_id', '=', Number(key)).where('status', '=', 'open').execute()
  const interfere = duringRun?.key === key ? duringRun : undefined
  if (interfere) duringRun = undefined
  await interfere?.run()
  if (open.length === 0) return 'done'
  return open.some((task) => clock.olderThan(task.created_at, '2 hours')) ? 'late' : 'open'
}

describe.skipIf(!(await postgresTemplateReady('jobs')))('derived values on Postgres', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let runtime: JobsRuntime
  let admin: ReturnType<typeof createAdmin>
  const errors: unknown[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec(`create table objectives (id integer generated always as identity primary key, title text not null, verdict text);
      create table tasks (id integer generated always as identity primary key, objective_id integer not null, status text not null, created_at timestamptz not null default now())`)
    const models = [objectives.toModel(), tasks.toModel()]
    await expect(checkDerived(db, models)).rejects.toThrow('The derived schema is missing')
    await pg.exec((await changesMigration(db, models))!)
    await pg.exec((await derivedMigration(db, models))!)
    expect(await derivedMigration(db, models)).toBeUndefined()
    admin = createAdmin({ resources: [objectives, tasks], db, authenticate: () => ({ user: { id: 'u1', roles: ['admin'] } }), derived: { 'objectives.verdict': verdict } })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await runtime?.stop()
    await pg?.close()
    expect(errors).toEqual([])
  })

  const post = async (path: string, body: object) => {
    const response = await admin.request(`/api/v1/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    expect(response.status).toBe(201)
    return (await response.json()) as { id: number }
  }
  const state = async (id: number) =>
    (await sql<{ verdict: string | null; xmin: string; status: string; computed_at: Date }>`select o.verdict, o.xmin::text as xmin, v.status, v.computed_at from objectives o
      join derived.values v on v.name = 'objectives.verdict' and v.key = o.id::text where o.id = ${id}`.execute(db)).rows[0]
  const settled = (id: number, value: string) => vi.waitFor(async () => {
    const found = await state(id)
    expect(found).toMatchObject({ verdict: value, status: 'current' })
    return found!
  }, { timeout: 20_000, interval: 100 })

  it('computes a new record, and follows the writes through the API that touch what it read', async () => {
    const objective = await post('objectives', { title: 'Ship' })
    await settled(objective.id, 'done')
    const task = await post('tasks', { objectiveId: objective.id, status: 'open' })
    await settled(objective.id, 'open')
    const etag = (await admin.request(`/api/v1/tasks/${task.id}`)).headers.get('etag')!
    const patched = await admin.request(`/api/v1/tasks/${task.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'if-match': etag }, body: JSON.stringify({ status: 'closed' }) })
    expect(patched.status).toBe(200)
    await settled(objective.id, 'done')
  })

  it('writes nothing when a run gives the same value, and runs for no change to another record', async () => {
    const objective = await post('objectives', { title: 'Plan' })
    const other = await post('objectives', { title: 'Other' })
    await post('tasks', { objectiveId: objective.id, status: 'open' })
    const before = await settled(objective.id, 'open')
    const otherBefore = await settled(other.id, 'done')
    await post('tasks', { objectiveId: objective.id, status: 'open' })
    await vi.waitFor(async () => expect((await state(objective.id))!.computed_at.getTime()).toBeGreaterThan(before.computed_at.getTime()), { timeout: 20_000, interval: 100 })
    expect(await state(objective.id)).toMatchObject({ verdict: 'open', xmin: before.xmin })
    expect((await state(other.id))!.computed_at).toEqual(otherBefore.computed_at)
  })

  it('computes again when a change lands while it runs', async () => {
    const objective = await post('objectives', { title: 'Race' })
    const before = await settled(objective.id, 'done')
    let ran = false
    // The run reads the open task, which is closed before it ends: kept, its "open" would be stale.
    duringRun = { key: String(objective.id), run: async () => void (await sql`update tasks set status = 'closed' where objective_id = ${objective.id}`.execute(db), (ran = true)) }
    await sql`insert into tasks (objective_id, status) values (${objective.id}, 'open')`.execute(db)
    await vi.waitFor(async () => {
      expect(ran).toBe(true)
      const found = await state(objective.id)
      expect(found).toMatchObject({ verdict: 'done', status: 'current' })
      expect(found!.computed_at.getTime()).toBeGreaterThan(before.computed_at.getTime())
    }, { timeout: 20_000, interval: 100 })
  })

  it('computes again when a time check flips', async () => {
    const objective = await post('objectives', { title: 'Clock' })
    await sql`insert into tasks (objective_id, status, created_at) values (${objective.id}, 'open', now() - interval '2 hours' + interval '3 seconds')`.execute(db)
    await settled(objective.id, 'open')
    await settled(objective.id, 'late')
  })
})
