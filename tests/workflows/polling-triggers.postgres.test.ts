import { sql, type Kysely } from 'kysely'
// Where runs keep their traces.
const trace = await traceFiles()

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { configExports, createAdmin, startJobs, workflowsMigration, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { workflowsModule } from '@protobase/server/internal'
import { ConnectionError, definePlugin } from '@protobase/workflows/plugin'
import { openPostgresDatabase, postgresTemplateReady, statementTimeoutMs, type PostgresDatabase } from '../../test-support/postgres-database'
import { traceFiles } from './support/run-trace'

// Workers poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// What each feed's next poll does, by the feed named in the trigger's input: the items it gives, or how it fails.
type Behaviour = { items: { key: string; data: unknown }[]; cursor?: unknown; fail?: 'once' | 'expired' | 'always'; wait?: Promise<void> }
const feeds = new Map<string, Behaviour>()
const started: string[] = []
const polled: string[] = []

const feed = definePlugin({
  name: 'feed',
  label: 'Feed',
  triggers: {
    items: {
      kind: 'polling',
      label: 'New items',
      description: 'Polls a feed the test controls.',
      input: { type: 'object', required: ['feed'], properties: { feed: { type: 'string' } } },
      every: '1 second',
      limit: 3,
      start: async ({ input }) => {
        started.push(input.feed as string)
        return 0
      },
      poll: async ({ input, cursor }) => {
        const name = input.feed as string
        const behaviour = feeds.get(name) ?? { items: [] }
        polled.push(name)
        await behaviour.wait
        if (behaviour.fail === 'expired') throw new ConnectionError('link_expired', 'The feed refused the sign-in')
        if (behaviour.fail) {
          if (behaviour.fail === 'once') feeds.set(name, { ...behaviour, fail: undefined })
          throw new Error('The feed is down')
        }
        return { items: behaviour.items, cursor: behaviour.cursor ?? (cursor as number) + 1 }
      },
    },
  },
})

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'workflow_triggers'>({
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'workflow_triggers.read'],
})
const workflows: WorkflowsOptions = { savedByRoles: async () => ['builder'], plugins: [{ plugin: feed, source: 'feed' }] }

const until = async <T>(read: () => Promise<T>, done: (value: T) => boolean, ms = 15_000) => {
  const end = Date.now() + ms
  for (;;) {
    const value = await read()
    if (done(value) || Date.now() > end) return value
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(!(await postgresTemplateReady('jobs')))('polling triggers, turned on and off while the app runs', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let runtime: JobsRuntime
  // Two instances of the app on one database: the test writes through the first, the jobs run on the second's worker.
  let api: ReturnType<typeof createAdmin>

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec((await workflowsMigration(db, workflows))!)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = () => {
      const { resources, views } = configExports({ ...workflowsModule(workflows) })
      return createAdmin({ resources, views, db, files: trace.files, authenticate: () => ({ user: { id: 'ada', roles: ['builder'] }, tenant: 1, organization: { id: 1 } }), workflows, options: { statementTimeoutMs, roles } })
    }
    api = instance()
    const worker = instance()
    runtime = await startJobs({ db, jobs: worker.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
  })

  afterAll(async () => {
    await trace.folder.remove()
    await runtime?.stop()
    await pg?.close()
  })

  const as = async (path: string, method = 'GET', body?: unknown) => {
    const response = await api.request(`/api/v1${path}`, { method, headers: { 'content-type': 'application/json', 'if-match': '*' }, ...(body !== undefined && { body: JSON.stringify(body) }) })
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, any> }
  }
  const machine = { QueryLanguage: 'JSONata', StartAt: 'Done', States: { Done: { Type: 'Succeed' } } }
  const save = async (trigger: unknown) => (await as('/workflows', 'POST', { name: 'Feed', definition: { trigger, stateMachine: machine } })).body as { id: string; version: number }
  const enable = (id: string, version: number | null) => as(`/workflows/${id}`, 'PATCH', { enabled_version: version })
  const runsOf = async (workflow: string) => (await sql<{ key: string; input: unknown }>`select key, input from workflows.runs where workflow_id = ${workflow} order by key`.execute(db)).rows
  const triggerOf = async (workflow: string) =>
    (await sql<{ id: string; status: string; cursor: unknown; last_error: { code: string; message: string } | null; generation: number }>`select id, status, cursor, last_error, generation from workflows.triggers where workflow_id = ${workflow}`.execute(db)).rows[0]
  const polls = (name: string) => polled.filter((entry) => entry === name).length

  it('polls once turned on, with no restart, on the other instance, and starts one run per item however often it is seen', async () => {
    feeds.set('a', { items: [{ key: 'a1', data: { n: 1 } }, { key: 'a2', data: { n: 2 } }] })
    const workflow = await save({ 'feed:items': { feed: 'a' } })
    expect((await enable(workflow.id, 1)).status).toBe(200)
    expect(await until(() => runsOf(workflow.id), (runs) => runs.length >= 2)).toEqual([{ key: 'a1', input: { n: 1 } }, { key: 'a2', input: { n: 2 } }])
    // The feed gives the same items on every poll: they started their runs already.
    const seen = polls('a')
    await until(async () => polls('a'), (count) => count >= seen + 2)
    expect(await runsOf(workflow.id)).toHaveLength(2)
    expect(await triggerOf(workflow.id)).toMatchObject({ status: 'active' })

    // Turned off, it polls no more; turned on again, a new trigger sees the same items and starts no run for them.
    await enable(workflow.id, null)
    await until(() => triggerOf(workflow.id), (row) => row === undefined)
    const stopped = polls('a')
    await pause(2_000)
    expect(polls('a')).toBe(stopped)
    await enable(workflow.id, 1)
    await until(async () => polls('a'), (count) => count >= stopped + 2)
    expect(await runsOf(workflow.id)).toHaveLength(2)
    await enable(workflow.id, null)
  })

  it('marks its trigger failing on a plugin error and active again after the backoff', async () => {
    feeds.set('b', { items: [], fail: 'once' })
    const workflow = await save({ 'feed:items': { feed: 'b' } })
    await enable(workflow.id, 1)
    expect(await until(() => triggerOf(workflow.id), (row) => row?.status === 'failing')).toMatchObject({ status: 'failing', last_error: { code: 'plugin_error', message: 'The feed is down' } })
    expect(await until(() => triggerOf(workflow.id), (row) => row?.status === 'active')).toMatchObject({ status: 'active', last_error: null })
    await enable(workflow.id, null)
  })

  it('fails as a plugin error a poll over its limit, or with a cursor over 64 KiB, and starts no run of it', async () => {
    feeds.set('c', { items: [1, 2, 3, 4].map((n) => ({ key: `c${n}`, data: n })) })
    feeds.set('d', { items: [{ key: 'd1', data: 1 }], cursor: 'x'.repeat(64 * 1024) })
    const over = await save({ 'feed:items': { feed: 'c' } })
    const large = await save({ 'feed:items': { feed: 'd' } })
    await enable(over.id, 1)
    await enable(large.id, 1)
    expect((await until(() => triggerOf(over.id), (row) => row?.status === 'failing'))?.last_error?.message).toBe('The poll gave 4 items, more than its limit of 3')
    const failed = await until(() => triggerOf(large.id), (row) => row?.status === 'failing')
    expect(failed?.last_error?.message).toBe('The poll gave a cursor over 64 KiB as JSON')
    expect(failed?.cursor).toBe(0)
    expect(await runsOf(over.id)).toEqual([])
    expect(await runsOf(large.id)).toEqual([])
    await enable(over.id, null)
    await enable(large.id, null)
  })

  it('waits for a sign-in on every trigger of an expired connection, starting no run, while others keep polling', async () => {
    feeds.set('e', { items: [{ key: 'e1', data: 1 }], fail: 'expired' })
    feeds.set('f', { items: [] })
    feeds.set('g', { items: [] })
    const expired = await save({ 'feed:items': { feed: 'e' } })
    const sharing = await save({ 'feed:items': { feed: 'f' } })
    const other = await save({ 'feed:items': { feed: 'g' } })
    for (const workflow of [expired, sharing, other]) await enable(workflow.id, 1)
    await until(async () => [await triggerOf(expired.id), await triggerOf(sharing.id)], (rows) => rows.every((row) => row !== undefined))
    // Both on one connection, which no app can make yet: set as a sign-in would.
    await sql`update workflows.triggers set connection_id = 'conn-1' where workflow_id in (${expired.id}, ${sharing.id})`.execute(db)
    expect(await until(() => triggerOf(sharing.id), (row) => row?.status === 'needs_sign_in')).toMatchObject({ status: 'needs_sign_in', last_error: { code: 'link_expired' } })
    expect(await triggerOf(expired.id)).toMatchObject({ status: 'needs_sign_in' })
    expect(await runsOf(expired.id)).toEqual([])
    const [e, f, g] = [polls('e'), polls('f'), polls('g')]
    await until(async () => polls('g'), (count) => count >= g + 2)
    expect([polls('e'), polls('f')]).toEqual([e, f])
    for (const workflow of [expired, sharing, other]) await enable(workflow.id, null)
  })

  it('starts no run of a poll that was still running as its workflow was turned off, and leaves its cursor', async () => {
    let release!: () => void
    const latch = new Promise<void>((resolve) => (release = resolve))
    feeds.set('h', { items: [{ key: 'h1', data: 1 }], wait: latch })
    const workflow = await save({ 'feed:items': { feed: 'h' } })
    await enable(workflow.id, 1)
    await until(async () => polls('h'), (count) => count >= 1)
    const before = await triggerOf(workflow.id)
    // Turning it off moves the trigger to its next generation, stopping, in the same write.
    await enable(workflow.id, null)
    const after = (await sql<{ status: string; generation: number; cursor: unknown }>`select status, generation, cursor from workflows.triggers where id = ${before!.id}`.execute(db)).rows[0]
    expect(after).toMatchObject({ status: 'stopping', generation: before!.generation + 1, cursor: 0 })
    release()
    await pause(1_500)
    expect(await runsOf(workflow.id)).toEqual([])
  })

  it('keeps its cursor across a version with the same trigger, without starting it again', async () => {
    feeds.set('i', { items: [] })
    const workflow = await save({ 'feed:items': { feed: 'i' } })
    await enable(workflow.id, 1)
    await until(async () => polls('i'), (count) => count >= 2)
    const cursor = (await triggerOf(workflow.id))!.cursor as number
    expect(started.filter((name) => name === 'i')).toHaveLength(1)
    await as(`/workflows/${workflow.id}`, 'PATCH', { definition: { trigger: { 'feed:items': { feed: 'i' } }, stateMachine: { ...machine, Comment: 'v2' } } })
    await until(async () => polls('i'), (count) => count >= 4)
    expect(started.filter((name) => name === 'i')).toHaveLength(1)
    expect((await triggerOf(workflow.id))!.cursor).toBeGreaterThan(cursor)
    await enable(workflow.id, null)
  })

  it('lets a retry of a job whose worker died take its claim back, and the dead try write nothing', async () => {
    // Saved and never turned on, so no poll of its own takes the row's lock while the test claims it.
    const workflow = await save({ 'feed:items': { feed: 'j' } })
    // A trigger as a poll job left it, to claim by hand: the job's first try, then its retry under the same id.
    const [row] = (await sql<{ id: string }>`insert into workflows.triggers (workflow_id, version, tenant_id, type, input, status, generation, consecutive_failures, cursor, poll_job_id)
      values (${workflow.id}, 1, '1', 'feed:items', '{"feed":"j"}', 'active', 7, 0, '5', 'job-1') returning id`.execute(db)).rows
    const { claimTrigger, savePoll, setNextJob } = await import('../../packages/server/src/workflows/triggers/trigger-claim')
    const first = { trigger: row!.id, generation: 7, job: 'job-1', attempt: 1 }
    const retry = { ...first, attempt: 2 }
    expect(await claimTrigger(db, 'workflows', first)).toMatchObject({ cursor: 5 })
    expect(await claimTrigger(db, 'workflows', retry)).toMatchObject({ cursor: 5 })
    expect(await claimTrigger(db, 'workflows', first)).toBeUndefined()
    const outcome = { cursor: 6, store: null, nextAt: new Date() }
    expect(await savePoll(db, 'workflows', first, [{ key: 'late', data: 1 }], outcome)).toBeUndefined()
    expect(await runsOf(workflow.id)).toEqual([])
    // Another job's id claims nothing, and a superseded generation's write matches nothing either.
    expect(await claimTrigger(db, 'workflows', { ...retry, job: 'job-2', attempt: 3 })).toBeUndefined()
    expect(await savePoll(db, 'workflows', { ...retry, generation: 6 }, [{ key: 'old', data: 1 }], outcome)).toBeUndefined()
    expect(await savePoll(db, 'workflows', retry, [{ key: 'new', data: 1 }], outcome)).toHaveLength(1)
    expect((await runsOf(workflow.id)).map((run) => run.key)).toEqual(['new'])
    // Another process's poll, under the next job, sees the same item and the item's run starts once.
    await sql`update workflows.triggers set poll_job_id = 'job-3' where id = ${row!.id}`.execute(db)
    const other = { trigger: row!.id, generation: 7, job: 'job-3', attempt: 1 }
    expect(await claimTrigger(db, 'workflows', other)).toBeTruthy()
    expect(await savePoll(db, 'workflows', other, [{ key: 'new', data: 2 }], outcome)).toEqual([])
    expect((await runsOf(workflow.id)).map((run) => run.key)).toEqual(['new'])
    // A restart names a new job while a try of the last one still holds its claim: the new job's first try claims it.
    expect(await claimTrigger(db, 'workflows', other)).toBeTruthy()
    await setNextJob(db, 'workflows', row!.id, 'job-4')
    expect(await claimTrigger(db, 'workflows', { ...other, job: 'job-4' })).toBeTruthy()
    await sql`delete from workflows.triggers where id = ${row!.id}`.execute(db)
  })

  it('takes app:schedule with a cron, and queues its first poll at the next time', async () => {
    const workflow = await save({ 'app:schedule': { cron: '0 6 * * *', timezone: 'Europe/Amsterdam' } })
    await enable(workflow.id, 1)
    const row = await until(
      async () => (await sql<{ next_poll_at: Date | null; poll_job_id: string | null }>`select next_poll_at, poll_job_id from workflows.triggers where workflow_id = ${workflow.id}`.execute(db)).rows[0],
      (found) => Boolean(found?.poll_job_id),
    )
    expect(row?.poll_job_id).toBeTruthy()
    const bad = await as('/workflows', 'POST', { name: 'Bad', definition: { trigger: { 'app:schedule': { cron: '0 6 * *' } }, stateMachine: machine } })
    expect(bad.status).toBe(400)
    await enable(workflow.id, null)
  })
})
