import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { runDerived } from './run-derived'

// Compiles queries as Postgres would get them and answers each with no rows: what is recorded is the SQL sent.
const db = new Kysely<any>({ dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(), createIntrospector: (kysely) => new PostgresIntrospector(kysely), createQueryCompiler: () => new PostgresQueryCompiler() } })

const objectives = resource('objectives').table('objectives').fields({ id: f.integer().readOnly(), verdict: f.text().optional().readOnly() }).primaryKey((r) => r.id).toModel()
const tasks = resource('tasks').table('tasks').fields({ id: f.integer().readOnly(), objectiveId: f.integer(), status: f.text(), createdAt: f.timestamp() }).primaryKey((r) => r.id).toModel()
const holds = resource('holds').table('holds').fields({ id: f.integer().readOnly() }).primaryKey((r) => r.id).toModel()
const input = { label: 'Derived value objectives.verdict', db, now: new Date('2026-11-10T12:00:00.000Z'), models: [objectives, tasks], appModels: [objectives, tasks, holds], track: true, signal: new AbortController().signal }

describe('runDerived', () => {
  it('records the reads of built and raw queries by resource and field, the time its clock flips and the value', async () => {
    const result = await runDerived(async (key, { db, clock }) => {
      await db.selectFrom('tasks').select(['id', 'created_at']).where('objective_id', '=', Number(key)).execute()
      await sql`select count(*) from tasks where status = ${'open'}`.execute(db)
      return clock.olderThan('2026-11-10T11:00:00.000Z', '2 hours') ? 'late' : 'fine'
    }, '3', input)
    expect(result).toEqual({
      value: 'fine',
      reads: [
        { resource: 'tasks', condition: { field: 'objectiveId', op: '=', value: 3 }, fields: ['createdAt', 'id', 'objectiveId'] },
        { resource: 'tasks', condition: { field: 'status', op: '=', value: 'open' }, fields: ['status'] },
      ],
      flipsAt: new Date('2026-11-10T13:00:00.000Z'),
    })
  })

  it('takes dependencies the function names, and without tracking only those', async () => {
    const result = await runDerived(async (_key, { db, depends }) => {
      depends('tasks', { objectiveId: 3, status: ['open', 'late'] })
      await sql`select * from somewhere_else`.execute(db)
      return undefined
    }, '3', { ...input, track: false })
    expect(result.reads).toEqual([{ resource: 'tasks', condition: { and: [{ field: 'objectiveId', op: '=', value: 3 }, { field: 'status', op: 'in', values: ['open', 'late'] }] }, fields: null }])
    expect(result.value).toBeNull()
  })

  it('refuses a read of a resource missing from its reads, telling it to add the resource', async () => {
    await expect(runDerived(async (_key, { db }) => sql`select 1 from holds`.execute(db), '3', input)).rejects.toThrow(
      "Derived value objectives.verdict read the table holds, which is not a resource it reads: add its resource to the value's reads",
    )
  })

  it('refuses a read of a table that is no resource, telling it to make it a resource or name the resources behind it', async () => {
    await expect(runDerived(async (_key, { db }) => sql`select 1 from open_holds`.execute(db), '3', input)).rejects.toThrow(
      "Derived value objectives.verdict read the table open_holds, which is no resource: make a table of its own a resource and add it to the value's reads, or, for a table whose changes come from resources, such as a view, turn tracking off, name every resource the value depends on with depends(), those behind this table included, and list each one but the value's own resource in its reads",
    )
  })

  it('refuses a write', async () => {
    await expect(runDerived(async (_key, { db }) => db.deleteFrom('tasks').execute(), '3', input)).rejects.toThrow('only reads, and sent a DeleteStmt')
  })
})
